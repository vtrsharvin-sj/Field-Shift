import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parsePowerResponse } from '../api/power.js'
import crops from '../data/crops.json'
import rotations from '../data/rotations.json'
import soils from '../data/soils.json'
import weights from '../data/weights.json'
import { buildContext, compareStrategies, normalizePriorities, overallScore, evaluateRotation } from './engine.js'
import { buildCards } from './explain.js'
import { resolveRotation, validateRotation, bareFractionByMonth } from './rotation.js'
import { soilScore, pestScore, incomeScore } from './components.js'

const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))
const farm = { lat: 11.0168, lon: 76.9558, soilType: 'loam', waterSource: 'borewell', waterAvailability: 'medium' }
const priorities = { water: 8, income: 3, soil: 8, erosion: 5 }

// Real NASA POWER download for Coimbatore, saved in public/data.
const power = parsePowerResponse(JSON.parse(readFileSync('public/data/power_coimbatore_2005_2024.json', 'utf8')))
power.meta.origin = 'prefetched-example'
const ctxFor = (f = farm, scenario) => buildContext({ power, farm: f, crops, soils, weights, scenario })

describe('data files', () => {
  it('every crop has the required fields and a source', () => {
    crops.forEach((c) => {
      ;['family', 'durationDays', 'waterNeed', 'droughtTolerance', 'nFixing', 'rootDepth', 'erosionCover', 'incomePotential', 'heatThresholdC', 'cropCoefficientKc', 'diseaseNotes', 'marketNotes', 'source'].forEach((k) => expect(c[k], `${c.id}.${k}`).toBeDefined())
    })
    expect(crops.length).toBeGreaterThanOrEqual(10)
  })
  it('every rotation in rotations.json is valid (known crops, no overlaps)', () => {
    const all = [...rotations.baselinePresets, ...rotations.strategies.flatMap((s) => s.candidates)]
    all.forEach((r) => expect(validateRotation(resolveRotation(r, cropsById)), r.id).toEqual([]))
  })
  it('there are at least 3 strategies in addition to presets', () => expect(rotations.strategies.length).toBeGreaterThanOrEqual(3))
})

describe('priorities', () => {
  it('normalizes to weights that sum to 1', () => {
    const w = normalizePriorities({ water: 5, income: 5, soil: 0, erosion: 0 })
    expect(w.water + w.income + w.soil + w.erosion).toBeCloseTo(1)
    expect(w.water).toBe(0.5)
  })
  it('all-zero sliders give equal weights', () => expect(normalizePriorities({ water: 0, income: 0, soil: 0, erosion: 0 }).soil).toBe(0.25))
  it('overall keeps the fixed heat and pest share', () => {
    const c = { water: { score: 100 }, income: { score: 100 }, soil: { score: 100 }, erosion: { score: 100 }, heat: { score: 0 }, pest: { score: 0 } }
    expect(overallScore(c, priorities, weights).overall).toBeCloseTo(80)
  })
})

describe('component rules', () => {
  const items = (ids) => resolveRotation({ id: 't', crops: ids.map(([c, m]) => ({ crop: c, sowMonth: m })) }, cropsById)
  it('rewards a legume rotation over repeating rice in soil health', () => {
    expect(soilScore(items([['maize', 6], ['black-gram', 10]]), weights).score).toBeGreaterThan(soilScore(items([['rice', 6], ['rice', 11]]), weights).score)
  })
  it('penalizes repeating the same crop for pests', () => {
    expect(pestScore(items([['maize', 6], ['black-gram', 10]]), [{ rhMean: 60 }, { rhMean: 60 }], weights).score).toBeGreaterThan(pestScore(items([['rice', 6], ['rice', 11]]), [{ rhMean: 60 }, { rhMean: 60 }], weights).score)
  })
  it('bare fraction is 1 in months with no crop', () => {
    const bare = bareFractionByMonth(items([['pearl-millet', 6]])) // Jun 1 to Aug 19
    expect(bare[5]).toBe(0)
    expect(bare[0]).toBe(1)
  })
  it('detects overlapping crops', () => {
    expect(validateRotation(items([['rice', 6], ['rice', 8]])).length).toBeGreaterThan(0)
  })
  it('income is higher for sugarcane than sunn hemp', () => {
    expect(incomeScore(items([['sugarcane', 2]]), weights).score).toBeGreaterThan(incomeScore(items([['sunn-hemp', 5]]), weights).score)
  })
})

describe('end to end with real Coimbatore data', () => {
  const run = (f, scen, base = 'rice-rice') => {
    const ctx = ctxFor(f, scen)
    const baseline = rotations.baselinePresets.find((r) => r.id === base)
    return { ctx, comparison: compareStrategies({ baseline, strategies: rotations.strategies, ctx, priorities }) }
  }
  it('produces a baseline plus at least two alternatives, all with scores 0 to 100', () => {
    const { ctx, comparison } = run(farm)
    const { cards, error } = buildCards({ comparison, ctx, priorities, soilInfo: null })
    expect(error).toBeNull()
    expect(cards.length).toBeGreaterThanOrEqual(4)
    expect(cards[0].kind).toBe('baseline')
    cards.forEach((c) => {
      expect(c.overall).toBeGreaterThanOrEqual(0)
      expect(c.overall).toBeLessThanOrEqual(100)
      ;['why', 'evidence', 'benefits', 'gaps', 'risks'].forEach((k) => expect(c[k].length, `${c.id}.${k}`).toBeGreaterThan(0))
      expect(['Low', 'Medium', 'High']).toContain(c.confidence.level)
      expect(c.confidence.reasons.length).toBeGreaterThan(0)
    })
  })
  it('real data gives a plausible Coimbatore annual rainfall (400 to 1500 mm)', () => {
    const t = ctxFor().trends
    const mean = t.rows.reduce((s, r) => s + r.rainMm, 0) / t.rows.length
    expect(mean).toBeGreaterThan(400)
    expect(mean).toBeLessThan(1500)
  })
  it('a different location changes the numbers (data drives output)', () => {
    const a = evaluateRotation(rotations.baselinePresets[0], ctxFor(), priorities)
    const dry = buildContext({ power: { ...power, days: power.days.map((d) => ({ ...d, rain: d.rain == null ? null : d.rain * 0.5 })) }, farm, crops, soils, weights })
    const b = evaluateRotation(rotations.baselinePresets[0], dry, priorities)
    expect(b.components.water.score).toBeLessThan(a.components.water.score)
  })
  it('a rainfall decrease scenario lowers the water score of a rainfed rice rotation', () => {
    const rainfed = { ...farm, waterSource: 'rainfed', waterAvailability: 'low' }
    const base = evaluateRotation(rotations.baselinePresets[0], ctxFor(rainfed), priorities)
    const dry = evaluateRotation(rotations.baselinePresets[0], ctxFor(rainfed, { rainChangePct: -20 }), priorities)
    expect(dry.components.water.score).toBeLessThanOrEqual(base.components.water.score)
  })
  it('priorities change the ranking order (soil focus vs income focus)', () => {
    const ctx = ctxFor()
    const baseline = rotations.baselinePresets[1]
    const a = compareStrategies({ baseline, strategies: rotations.strategies, ctx, priorities: { water: 0, income: 0, soil: 10, erosion: 0 } })
    const b = compareStrategies({ baseline, strategies: rotations.strategies, ctx, priorities: { water: 0, income: 10, soil: 0, erosion: 0 } })
    const sa = a.alternatives.map((x) => x.best.overall.toFixed(2)).join()
    const sb = b.alternatives.map((x) => x.best.overall.toFixed(2)).join()
    expect(sa).not.toBe(sb)
  })
})
