import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parsePowerResponse } from '../api/power.js'
import crops from '../data/crops.json'
import rotations from '../data/rotations.json'
import soils from '../data/soils.json'
import weights from '../data/weights.json'
import { buildContext, normalizePriorities, overallScore, evaluateRotation } from './engine.js'
import { autoSchedule, bestOptionsForCrop, candidateRotations, compareStrategies, optionQuality, STRATEGY_RULES } from './planner.js'
import { buildCards } from './explain.js'
import { resolveRotation, validateRotation, bareFractionByMonth } from './rotation.js'
import { soilScore, pestScore, incomeScore, temperatureFit } from './components.js'
import { classifyClimate } from '../indicators/zone.js'

const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))
const farm = { lat: 11.0168, lon: 76.9558, soilType: 'loam', waterSource: 'borewell', waterAvailability: 'medium' }
const priorities = { water: 8, income: 3, soil: 8, erosion: 5 }

// Real NASA POWER download for Coimbatore (a tropical test location), saved in test-data (used only by tests).
const power = parsePowerResponse(JSON.parse(readFileSync('test-data/power_coimbatore_2005_2024.json', 'utf8')))
power.meta.origin = 'live'
const ctxFor = (f = farm, scenario) => buildContext({ power, farm: f, crops, soils, weights, scenario })
const entries = (...ids) => ids.map((c) => ({ crop: c, sowMonth: 'auto' }))

describe('data files', () => {
  it('every crop has the required fields, valid ranges and a source', () => {
    crops.forEach((c) => {
      ;['family', 'role', 'durationDays', 'kcStages', 'cropCoefficientKc', 'tempRangeC', 'heatThresholdC', 'diseaseNotes', 'marketNotes', 'source'].forEach((k) => expect(c[k], `${c.id}.${k}`).toBeDefined())
      const t = c.tempRangeC
      expect(t.absMin).toBeLessThan(t.optMin)
      expect(t.optMin).toBeLessThan(t.optMax)
      expect(t.optMax).toBeLessThan(t.absMax)
      expect(c.durationDays[0]).toBeLessThanOrEqual(c.durationDays[1])
      expect(['main', 'cover']).toContain(c.role)
    })
    expect(crops.length).toBeGreaterThanOrEqual(30)
  })
  it('every preset rotation uses known crops', () => {
    rotations.baselinePresets.forEach((p) => p.crops.forEach((id) => expect(cropsById[id], `${p.id}:${id}`).toBeDefined()))
  })
  it('crop ids are unique', () => expect(new Set(crops.map((c) => c.id)).size).toBe(crops.length))
  it('has the three strategies and a rule for each', () => {
    rotations.strategies.forEach((s) => expect(STRATEGY_RULES[s.id], s.id).toBeTypeOf('function'))
  })
})

describe('temperature fit', () => {
  const r = { absMin: 10, optMin: 20, optMax: 30, absMax: 40 }
  it('is 100 inside the comfortable range', () => expect(temperatureFit(25, r)).toBe(100))
  it('falls linearly to 0 at the limits', () => {
    expect(temperatureFit(15, r)).toBeCloseTo(50)
    expect(temperatureFit(10, r)).toBe(0)
    expect(temperatureFit(35, r)).toBeCloseTo(50)
    expect(temperatureFit(45, r)).toBe(0)
  })
})

describe('climate classification', () => {
  const mk = (t, p) => t.map((x, i) => ({ tmeanC: x, rainMm: p[i] }))
  it('tropical wet', () => expect(classifyClimate(mk(new Array(12).fill(26), new Array(12).fill(150)), 5).group).toBe('tropical'))
  it('desert is dry', () => expect(classifyClimate(mk(new Array(12).fill(28), new Array(12).fill(3)), 25).group).toBe('dry'))
  it('cold winters are continental', () => expect(classifyClimate(mk([-10, -8, -2, 5, 12, 17, 20, 19, 13, 6, -2, -8], new Array(12).fill(50)), 45).group).toBe('continental'))
  it('mild winters are temperate', () => expect(classifyClimate(mk([6, 7, 9, 12, 16, 19, 22, 22, 18, 14, 9, 7], new Array(12).fill(60)), 45).group).toBe('temperate'))
})

describe('priorities', () => {
  it('normalizes to weights that sum to 1', () => {
    const w = normalizePriorities({ water: 5, income: 5, soil: 0, erosion: 0 })
    expect(w.water + w.income + w.soil + w.erosion).toBeCloseTo(1)
    expect(w.water).toBe(0.5)
  })
  it('all-zero sliders give equal weights', () => expect(normalizePriorities({ water: 0, income: 0, soil: 0, erosion: 0 }).soil).toBe(0.25))
  it('overall keeps the fixed heat and pest share and applies the temperature gate', () => {
    const c = { water: { score: 100 }, income: { score: 100 }, soil: { score: 100 }, erosion: { score: 100 }, heat: { score: 0 }, pest: { score: 0 }, climate: { lowest: 100 } }
    expect(overallScore(c, priorities, weights).overall).toBeCloseTo(80)
    expect(overallScore({ ...c, climate: { lowest: 0 } }, priorities, weights).overall).toBeCloseTo(80 * weights.climateFit.floor)
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
  it('penalizes potato after tomato (shared diseases)', () => {
    const bad = pestScore(items([['tomato', 2], ['potato', 7]]), [{ rhMean: 60 }, { rhMean: 60 }], weights).score
    const good = pestScore(items([['maize', 2], ['potato', 7]]), [{ rhMean: 60 }, { rhMean: 60 }], weights).score
    expect(good).toBeGreaterThan(bad)
  })
  it('bare fraction is 1 in months with no crop', () => {
    const bare = bareFractionByMonth(items([['pearl-millet', 6]]))
    expect(bare[5]).toBe(0)
    expect(bare[0]).toBe(1)
  })
  it('detects overlapping crops', () => expect(validateRotation(items([['rice', 6], ['rice', 8]])).length).toBeGreaterThan(0))
  it('income is higher for sugarcane than sunn hemp', () => {
    expect(incomeScore(items([['sugarcane', 2]]), weights).score).toBeGreaterThan(incomeScore(items([['sunn-hemp', 5]]), weights).score)
  })
})

describe('planner with real NASA POWER data (Coimbatore, tropical)', () => {
  const ctx = ctxFor()
  it('classifies Coimbatore as tropical', () => expect(ctx.climate.group).toBe('tropical'))
  it('season mean temperature is in a plausible range', () => {
    const s = ctx.seasonFor(cropsById.maize, 6, 120)
    expect(s.tmeanMean).toBeGreaterThan(20)
    expect(s.tmeanMean).toBeLessThan(30)
  })
  it('wheat (a cool-season crop) fits worse than sorghum in the tropical lowlands', () => {
    const best = (id) => Math.max(...Array.from({ length: 12 }, (_, i) => optionQuality(cropsById[id], i + 1, ctx)?.tempFit ?? 0))
    expect(best('sorghum')).toBeGreaterThan(best('wheat'))
  })
  it('auto schedule returns non-overlapping, ordered sowing months', () => {
    const filled = autoSchedule(entries('rice', 'rice'), ctx)
    expect(validateRotation(resolveRotation({ id: 'x', crops: filled }, cropsById))).toEqual([])
  })
  it('auto schedule keeps months the farmer set', () => {
    const filled = autoSchedule([{ crop: 'maize', sowMonth: 6 }, { crop: 'black-gram', sowMonth: 'auto' }], ctx)
    expect(filled[0].sowMonth).toBe(6)
  })
  it('best options respect the minimum temperature fit', () => {
    bestOptionsForCrop(cropsById.maize, ctx, 2).forEach((o) => expect(o.tempFit).toBeGreaterThanOrEqual(weights.climateFit.minOptionTempFit))
  })
  it('every generated candidate is valid and matches at least one strategy rule', () => {
    const cands = candidateRotations(ctx)
    expect(cands.length).toBeGreaterThan(20)
    cands.slice(0, 200).forEach((c) => {
      expect(c.scored.error).toBeUndefined()
      expect(c.matches.length).toBeGreaterThan(0)
    })
  })
})

describe('end to end with real data', () => {
  const run = (f, scen, base = ['rice', 'rice'], pr = priorities) => {
    const ctx = ctxFor(f, scen)
    return { ctx, comparison: compareStrategies({ baselineEntries: entries(...base), strategies: rotations.strategies, ctx, priorities: pr }) }
  }
  it('produces a baseline plus three alternatives with all required parts', () => {
    const { ctx, comparison } = run(farm)
    const { cards, error } = buildCards({ comparison, ctx, priorities, soilInfo: null })
    expect(error).toBeNull()
    expect(cards.length).toBe(4)
    expect(cards[0].kind).toBe('baseline')
    cards.forEach((c) => {
      expect(c.overall).toBeGreaterThanOrEqual(0)
      expect(c.overall).toBeLessThanOrEqual(100)
      ;['why', 'evidence', 'benefits', 'gaps', 'risks'].forEach((k) => expect(c[k].length, `${c.id}.${k}`).toBeGreaterThan(0))
      expect(['Low', 'Medium', 'High']).toContain(c.confidence.level)
      expect(c.confidence.reasons.length).toBeGreaterThan(0)
    })
  })
  it('alternatives are different rotations', () => {
    const { comparison } = run(farm)
    const keys = comparison.alternatives.map((a) => a.best.cropKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('real data gives a plausible annual rainfall for Coimbatore (400 to 1500 mm)', () => {
    const t = ctxFor().trends
    const mean = t.rows.reduce((s, r) => s + r.rainMm, 0) / t.rows.length
    expect(mean).toBeGreaterThan(400)
    expect(mean).toBeLessThan(1500)
  })
  it('halving the rain lowers the water score (data drives output)', () => {
    const base = evaluateRotation({ id: 'a', crops: [{ crop: 'maize', sowMonth: 6 }] }, ctxFor(), priorities)
    const dry = buildContext({ power: { ...power, days: power.days.map((d) => ({ ...d, rain: d.rain == null ? null : d.rain * 0.5 })) }, farm, crops, soils, weights })
    expect(evaluateRotation({ id: 'a', crops: [{ crop: 'maize', sowMonth: 6 }] }, dry, priorities).components.water.score).toBeLessThan(base.components.water.score)
  })
  it('a warming scenario changes temperature fit', () => {
    const rot = { id: 'w', crops: [{ crop: 'wheat', sowMonth: 11 }] }
    const a = evaluateRotation(rot, ctxFor(), priorities)
    const b = evaluateRotation(rot, ctxFor(farm, { tempChangeC: 3 }), priorities)
    expect(b.components.climate.score).not.toBe(a.components.climate.score)
  })
  it('a crop far outside its temperature range lowers the overall score', () => {
    const wheat = evaluateRotation({ id: 'w', crops: [{ crop: 'wheat', sowMonth: 6 }] }, ctxFor(), priorities)
    expect(wheat.gate).toBeLessThan(1)
  })
  it('priorities change the ranking (soil focus vs income focus)', () => {
    const a = run(farm, undefined, ['maize'], { water: 0, income: 0, soil: 10, erosion: 0 }).comparison.alternatives.map((x) => x.best.overall.toFixed(2)).join()
    const b = run(farm, undefined, ['maize'], { water: 0, income: 10, soil: 0, erosion: 0 }).comparison.alternatives.map((x) => x.best.overall.toFixed(2)).join()
    expect(a).not.toBe(b)
  })
})

describe('soil data and confidence', () => {
  const soilInfo = { sandPct: 20, siltPct: 30, clayPct: 50, organicCarbonGkg: 6, pH: 5.0, texture: 'clay', suggestedType: 'clay', depth: '0 to 30 cm', nearbyKm: 0, source: 'SoilGrids (ISRIC, not NASA), about 250 m, modelled' }
  const claySoil = { ...farm, soilType: 'clay' }
  const build = (info, f = claySoil) => buildContext({ power, farm: f, crops, soils, weights, soilInfo: info })
  const rot = { id: 's', crops: [{ crop: 'maize', sowMonth: 6 }, { crop: 'black-gram', sowMonth: 10 }] }

  it('uses SoilGrids to set usable rain only while the soil type matches what SoilGrids found', () => {
    expect(build(soilInfo).soil.fromSoilGrids).toBe(true)
    expect(build(soilInfo, { ...farm, soilType: 'sandy' }).soil.fromSoilGrids).toBeFalsy()
    expect(build(null).soil.fromSoilGrids).toBeFalsy()
  })
  it('low organic carbon raises the weight of nitrogen-fixing crops in soil health', () => {
    const low = evaluateRotation(rot, build(soilInfo), priorities).components.soil
    const fine = evaluateRotation(rot, build({ ...soilInfo, organicCarbonGkg: 25 }), priorities).components.soil
    expect(low.parts.lowCarbon).toBe(true)
    expect(low.score).toBeGreaterThan(fine.score)
  })
  it('acid soil and low carbon appear as risks, and soil appears as evidence and a gap note', () => {
    const ctx = build(soilInfo)
    const comparison = compareStrategies({ baselineEntries: entries('maize', 'black-gram'), strategies: rotations.strategies, ctx, priorities })
    const { cards } = buildCards({ comparison, ctx, priorities, soilInfo })
    const base = cards[0]
    expect(base.risks.join(' ')).toMatch(/acidic/)
    expect(base.risks.join(' ')).toMatch(/organic carbon is low/)
    expect(base.evidence.map((e) => e.text).join(' ')).toMatch(/Soil at this point: sand 20%/)
    expect(base.gaps.join(' ')).toMatch(/SoilGrids/)
  })
  it('without soil data the soil gap says so', () => {
    const ctx = build(null)
    const comparison = compareStrategies({ baselineEntries: entries('maize'), strategies: rotations.strategies, ctx, priorities })
    const { cards } = buildCards({ comparison, ctx, priorities, soilInfo: null })
    expect(cards[0].gaps.join(' ')).toMatch(/Soil properties not fetched/)
  })
  it('cards carry the priority weights that make up the overall score', () => {
    const ctx = build(null)
    const comparison = compareStrategies({ baselineEntries: entries('maize'), strategies: rotations.strategies, ctx, priorities })
    const { cards } = buildCards({ comparison, ctx, priorities, soilInfo: null })
    const w = cards[0].priorityWeights
    expect(w.water + w.income + w.soil + w.erosion).toBeCloseTo(1)
  })
  it('confidence is lower without a satellite cross-check and mentions why', () => {
    const ctx = build(null)
    const comparison = compareStrategies({ baselineEntries: entries('maize'), strategies: rotations.strategies, ctx, priorities })
    const { cards } = buildCards({ comparison, ctx, priorities, soilInfo: null })
    expect(cards[0].confidence.reasons.join(' ')).toMatch(/cross-checked POWER yet/)
    expect(cards[0].confidence.level).not.toBe('High')
  })
})
