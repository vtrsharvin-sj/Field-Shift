import { describe, it, expect } from 'vitest'
import crops from '../data/crops.json'
import weights from '../data/weights.json'
import { analyzeText, buildProfile, fetchLocalCrops, readLocalCache, sentences, writeLocalCache, LEVEL_TEXT } from './localCrops.js'

const cfg = weights.localCrops
const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

describe('reading text about an area', () => {
  const text = 'Coimbatore is a city known for textile mills. The district is famous for cotton, which is grown widely on the plains. Sugarcane and maize are cultivated in the north. Rice was served at the festival. Price rises were announced.'
  it('splits sentences', () => expect(sentences(text).length).toBe(5))
  it('marks crops in sentences about growing as strong, and plain mentions as weak', () => {
    const f = analyzeText(text, crops)
    expect(f.cotton.strong).toBe(1)
    expect(f.sugarcane.strong).toBe(1)
    expect(f.maize.strong).toBe(1)
    expect(f.rice.weak).toBe(1) // "Rice was served" has no farming context
    expect(f.rice.strong).toBe(0)
  })
  it('matches local names (ragi, bajra, jowar) and whole words only', () => {
    const f = analyzeText('Ragi and bajra are staple crops here. Jowar is also grown. Cornwall and Priceville are towns that grow nothing.', crops)
    expect(f['finger-millet']?.strong).toBe(1)
    expect(f['pearl-millet']?.strong).toBe(1)
    expect(f.sorghum?.strong).toBe(1)
    expect(f.maize).toBeUndefined() // "Cornwall" is not "corn"
    expect(f.rice).toBeUndefined() // "Priceville" is not "rice"
  })
  it('keeps short snippets', () => {
    const f = analyzeText('Cotton is grown on a large share of the black soil plains of the district and is the main cash crop for thousands of families who sell it each year at the market.', crops, { maxChars: 60 })
    expect(f.cotton.snippets[0].length).toBeLessThanOrEqual(60)
  })
})

describe('local profile', () => {
  const found = (strong) => ({ strong, weak: 0, snippets: strong ? ['Cotton is grown here.'] : [] })
  it('uses the closest level with a strong mention', () => {
    const pages = [
      { title: 'Village', url: 'u1', level: 'place', found: { cotton: found(1) } },
      { title: 'State', url: 'u2', level: 'region', found: { cotton: found(2), wheat: found(1) } },
      { title: 'Country', url: 'u3', level: 'country', found: { rice: found(1), wheat: found(3) } },
    ]
    const p = buildProfile(pages, crops, cfg)
    expect(p.cotton.level).toBe('place')
    expect(p.cotton.score).toBe(cfg.levelScore.place)
    expect(p.wheat.level).toBe('region')
    expect(p.rice.level).toBe('country')
    expect(p.teff.level).toBe('none')
    expect(p.teff.score).toBe(cfg.levelScore.none)
    expect(LEVEL_TEXT.place).toMatch(/village/)
  })
  it('weak mentions alone give the low "mention" level', () => {
    const p = buildProfile([{ title: 'T', url: 'u', level: 'place', found: { rice: { strong: 0, weak: 2, snippets: [] } } }], crops, cfg)
    expect(p.rice.level).toBe('mention')
  })
})

describe('fetchLocalCrops', () => {
  const body = {
    'https://api.bigdatacloud.net': { city: 'Sulur', locality: 'Sulur', principalSubdivision: 'Tamil Nadu', countryName: 'India', countryCode: 'IN', localityInfo: { administrative: [{ name: 'India', adminLevel: 2 }, { name: 'Coimbatore district', adminLevel: 5 }] } },
  }
  const wikiText = { Sulur: 'Sulur is a town. Cotton and maize are grown around the town.', 'Coimbatore district': 'The district is a hub for textiles.', 'Tamil Nadu': 'Rice and sugarcane are the major crops of the state.', India: 'India produces wheat, rice and cotton.' }
  const fakeFetch = async (url) => {
    const u = String(url)
    if (u.includes('bigdatacloud')) return { ok: true, json: async () => body['https://api.bigdatacloud.net'] }
    if (u.includes('list=geosearch')) return { ok: true, json: async () => ({ query: { geosearch: [{ title: 'Sulur' }] } }) }
    if (u.includes('list=search')) return { ok: true, json: async () => ({ query: { search: [] } }) }
    const title = decodeURIComponent(new URL(u).searchParams.get('titles') ?? '')
    const text = wikiText[title]
    return { ok: true, json: async () => ({ query: { pages: text ? { 1: { title, extract: text } } : { '-1': { title, missing: '' } } } }) }
  }
  it('builds a profile from place, region and country articles', async () => {
    const d = await fetchLocalCrops(10.95, 77.1, crops, cfg, { fetchImpl: fakeFetch, force: true })
    expect(d.available).toBe(true)
    expect(d.place.label).toContain('Tamil Nadu')
    expect(d.crops.cotton.level).toBe('place')
    expect(d.crops.rice.level).toBe('region')
    expect(d.crops.wheat.level).toBe('country')
    expect(d.pages.map((p) => p.level)).toEqual(expect.arrayContaining(['place', 'region', 'country']))
  })
  it('reports unavailable (and never throws) when nothing can be read', async () => {
    const d = await fetchLocalCrops(0, 0, crops, cfg, { fetchImpl: async () => { throw new Error('offline') }, force: true })
    expect(d.available).toBe(false)
    expect(d.reason).toBeTruthy()
  })
  it('caches successful results and reuses them', () => {
    const storage = store()
    writeLocalCache(10.95, 77.1, { available: true, crops: {} }, { storage, now: 1000 })
    expect(readLocalCache(10.9504, 77.1001, cfg, { storage, now: 2000 }).fromCache).toBe(true)
    expect(readLocalCache(10.95, 77.1, cfg, { storage, now: 1000 + (cfg.cacheDays + 1) * 86400000 })).toBeNull()
  })
})
