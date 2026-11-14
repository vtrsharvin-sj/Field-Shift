import { describe, it, expect } from 'vitest'
import { fetchSoil, parseSoilGrids, rainEfficiencyFromTexture, suggestSoilType, usdaTexture } from './soilgrids.js'
import { readSatelliteCache, writeSatelliteCache, CACHE_DAYS } from './satellite.js'
import weights from '../data/weights.json'

const layer = (name, vals) => ({ name, depths: [{ label: '0-5cm', values: { mean: vals[0] } }, { label: '5-15cm', values: { mean: vals[1] } }, { label: '15-30cm', values: { mean: vals[2] } }] })
const coimbatore = { properties: { layers: [layer('sand', [445, 433, 420]), layer('clay', [294, 302, 328]), layer('soc', [257, 193, 130]), layer('phh2o', [75, 75, 76])] } }
const masked = { properties: { layers: [layer('sand', [null, null, null]), layer('clay', [null, null, null]), layer('soc', [null, null, null]), layer('phh2o', [null, null, null])] } }

describe('SoilGrids parsing', () => {
  it('converts units and averages 0-30 cm by layer thickness', () => {
    const s = parseSoilGrids(coimbatore)
    expect(s.sandPct).toBeCloseTo((44.5 * 5 + 43.3 * 10 + 42 * 15) / 30, 5)
    expect(s.clayPct).toBeCloseTo((29.4 * 5 + 30.2 * 10 + 32.8 * 15) / 30, 5)
    expect(s.pH).toBeGreaterThan(7)
    expect(s.pH).toBeLessThan(8)
    expect(s.organicCarbonGkg).toBeGreaterThan(15)
    expect(s.sandPct + s.siltPct + s.clayPct).toBeCloseTo(100)
  })
  it('throws a clear error when every layer is null (masked land)', () => {
    expect(() => parseSoilGrids(masked)).toThrow(/no values/)
  })
  it('classifies USDA texture and maps it to the dropdown', () => {
    expect(usdaTexture(90, 5)).toBe('sand')
    expect(usdaTexture(40, 20)).toBe('loam')
    expect(usdaTexture(15, 50)).toBe('clay')
    expect(usdaTexture(55, 28)).toBe('sandy clay loam')
    expect(usdaTexture(43, 31)).toBe('clay loam')
    expect(suggestSoilType({ sandPct: 90, clayPct: 5 })).toBe('sandy')
    expect(suggestSoilType({ sandPct: 15, clayPct: 50 })).toBe('clay')
    expect(suggestSoilType({ sandPct: 40, clayPct: 20 })).toBe('loam')
  })
  it('refines usable rain from texture within its limits', () => {
    const cfg = weights.soilData.rainEff
    expect(rainEfficiencyFromTexture({ sandPct: 90, clayPct: 5 }, cfg)).toBeLessThan(rainEfficiencyFromTexture({ sandPct: 15, clayPct: 50 }, cfg))
    expect(rainEfficiencyFromTexture({ sandPct: 100, clayPct: 0 }, cfg)).toBeGreaterThanOrEqual(cfg.min)
    expect(rainEfficiencyFromTexture({ sandPct: 0, clayPct: 100 }, cfg)).toBeLessThanOrEqual(cfg.max)
  })
})

describe('SoilGrids fetch', () => {
  const ok = (body) => ({ ok: true, json: async () => body })
  it('returns the exact point when it has data', async () => {
    const s = await fetchSoil(10.95, 77.1, { fetchImpl: async () => ok(coimbatore) })
    expect(s.nearbyKm).toBe(0)
    expect(s.texture).toBe('clay loam')
    expect(s.source).toMatch(/not NASA/)
  })
  it('falls back to a neighbouring point when the exact point is masked, and says so', async () => {
    let calls = 0
    const s = await fetchSoil(42.03, -93.62, { fetchImpl: async () => ok(++calls === 1 ? masked : coimbatore) })
    expect(s.nearbyKm).toBeGreaterThan(0)
  })
  it('fails with a clear message when nothing nearby has data', async () => {
    await expect(fetchSoil(0, 0, { fetchImpl: async () => ok(masked) })).rejects.toThrow(/no soil values here or nearby/)
  })
  it('retries once on a network error', async () => {
    let calls = 0
    const s = await fetchSoil(10.95, 77.1, { retries: 1, fetchImpl: async () => { if (++calls === 1) throw new Error('offline'); return ok(coimbatore) } })
    expect(calls).toBe(2)
    expect(s.sandPct).toBeGreaterThan(0)
  })
})

describe('satellite cache (pre-fetched layers)', () => {
  const store = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }
  const point = { lat: 10.951, lon: 77.104 }
  it('returns what was saved, marked as coming from the cache', () => {
    const storage = store()
    writeSatelliteCache(point, { ndvi: { years: [2023] } }, { storage, now: 1000 })
    const r = readSatelliteCache({ lat: 10.9504, lon: 77.1001 }, { storage, now: 2000 }) // same 0.01 degree cell
    expect(r.fromCache).toBe(true)
    expect(r.ndvi.years).toEqual([2023])
    expect(r.errors).toEqual({})
  })
  it('expires after the cache period', () => {
    const storage = store()
    writeSatelliteCache(point, { ndvi: {} }, { storage, now: 0 })
    expect(readSatelliteCache(point, { storage, now: (CACHE_DAYS + 1) * 86400000 })).toBeNull()
  })
  it('does not mix up different places', () => {
    const storage = store()
    writeSatelliteCache(point, { ndvi: {} }, { storage })
    expect(readSatelliteCache({ lat: 42.03, lon: -93.62 }, { storage })).toBeNull()
  })
  it('survives broken storage', () => {
    expect(readSatelliteCache(point, { storage: { getItem: () => '{bad json' } })).toBeNull()
    expect(() => writeSatelliteCache(point, {}, { storage: { setItem: () => { throw new Error('full') } } })).not.toThrow()
  })
})

