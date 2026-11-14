// Scoring engine: climate context -> component scores -> weighted overall score. Pure and deterministic.

import { etSummary, landCoverInfo, lstSummary, ndviSummary, sourceAgreement } from '../indicators/satellite.js'
import { annualTrends, heavyRainThreshold, indexDays, monthlyClimatology, seasonIndicators } from '../indicators/climate.js'
import { erosionScore, heatScore, incomeScore, pestScore, soilScore, waterScore } from './components.js'
import { resolveRotation, validateRotation } from './rotation.js'

/** Apply a what-if scenario to the real daily record: rain x factor, temperatures + offset. Returns the same days when no change. */
export function applyScenario(days, { rainChangePct = 0, tempChangeC = 0 } = {}) {
  if (!rainChangePct && !tempChangeC) return days
  const f = 1 + rainChangePct / 100
  return days.map((d) => ({
    ...d,
    rain: d.rain == null ? null : d.rain * f,
    t2m: d.t2m == null ? null : d.t2m + tempChangeC,
    tmax: d.tmax == null ? null : d.tmax + tempChangeC,
    tmin: d.tmin == null ? null : d.tmin + tempChangeC,
  }))
}

/** Build everything the scoring needs from one POWER download. */
/** Summaries of the optional NASA satellite layers. Any layer that is missing or failed stays null. */
export function summarizeSatellite(raw, powerMonthly, w) {
  if (!raw) return null
  const et = raw.et ? etSummary(raw.et) : null
  return {
    ndvi: raw.ndvi ? ndviSummary(raw.ndvi, w.satellite.ndviBare) : null,
    et,
    lst: raw.lst ? lstSummary(raw.lst, w.satellite.lstHotC) : null,
    landCover: raw.landCover ? { ...raw.landCover, ...landCoverInfo(raw.landCover.igbpClass) } : null,
    slope: raw.slope ?? null,
    agreement: et ? sourceAgreement(et.pet, powerMonthly.map((m) => m.et0Mm), w.satellite.agreement) : null,
    errors: raw.errors ?? {},
    raw,
  }
}

export function buildContext({ power, farm, crops, soils, weights, scenario, satellite }) {
  const trends = annualTrends(power.days) // trends always use the real, unchanged record
  const days = applyScenario(power.days, scenario)
  const index = indexDays(days)
  const heavyMm = heavyRainThreshold(days)
  const lat = Number(farm.lat)
  const monthly = monthlyClimatology(days, { lat, heavyMm })
  const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))
  const soil = soils.types.find((s) => s.id === farm.soilType) ?? soils.types.find((s) => s.id === 'loam')
  const seasonCache = new Map()
  const seasonFor = (crop, sowMonth, durationDays) => {
    const key = `${crop.id}|${sowMonth}|${durationDays}`
    if (!seasonCache.has(key)) {
      seasonCache.set(key, seasonIndicators(days, index, { lat, sowMonth, durationDays, kc: crop.cropCoefficientKc, heatThresholdC: crop.heatThresholdC, heavyMm }))
    }
    return seasonCache.get(key)
  }
  const active = scenario && (scenario.rainChangePct || scenario.tempChangeC)
  const realMonthly = active ? monthlyClimatology(power.days, { lat, heavyMm: heavyRainThreshold(power.days) }) : monthly
  return { power, farm, weights, soil, cropsById, trends, monthly, heavyMm, lat, seasonFor, scenario: scenario ?? {}, satellite: summarizeSatellite(satellite, realMonthly, weights) }
}

/** Convert slider values (0 to 10) into weights that sum to 1. All zero means equal weights. */
export function normalizePriorities(p) {
  const keys = ['water', 'income', 'soil', 'erosion']
  const total = keys.reduce((s, k) => s + Math.max(0, Number(p[k]) || 0), 0)
  return Object.fromEntries(keys.map((k) => [k, total ? Math.max(0, Number(p[k]) || 0) / total : 0.25]))
}

export function overallScore(c, priorities, w) {
  const pw = normalizePriorities(priorities)
  const priorityPart = pw.water * c.water.score + pw.income * c.income.score + pw.soil * c.soil.score + pw.erosion * c.erosion.score
  const overall = w.overall.priorityShare * priorityPart + w.overall.heatShare * c.heat.score + w.overall.pestShare * c.pest.score
  return { overall, priorityWeights: pw }
}

/** Evaluate one rotation. Returns { error } if the rotation is invalid or no full season fits in the data. */
export function evaluateRotation(rotation, ctx, priorities) {
  let items
  try {
    items = resolveRotation(rotation, ctx.cropsById)
  } catch (e) {
    return { error: e.message }
  }
  const problems = validateRotation(items)
  if (problems.length) return { error: problems.join(' ') }
  const seasons = items.map((it) => ctx.seasonFor(it.crop, it.sowMonth, it.durationDays))
  if (seasons.some((s) => !s)) return { error: 'The climate record is too short for one of the crop seasons.' }
  const w = ctx.weights
  const components = {
    water: waterScore(items, seasons, ctx.farm, w, ctx.soil),
    heat: heatScore(items, seasons, w),
    soil: soilScore(items, w),
    erosion: erosionScore(items, ctx.monthly, w, ctx.satellite?.slope ?? null),
    income: incomeScore(items, w),
    pest: pestScore(items, seasons, w),
  }
  const { overall, priorityWeights } = overallScore(components, priorities, w)
  return { rotation, items, seasons, components, overall, priorityWeights }
}

/** Evaluate the baseline plus the best candidate of each strategy for the farmer's priorities. */
export function compareStrategies({ baseline, strategies, ctx, priorities }) {
  const base = evaluateRotation(baseline, ctx, priorities)
  const alternatives = strategies.map((s) => {
    const variants = s.candidates.map((c) => evaluateRotation(c, ctx, priorities)).filter((v) => !v.error)
    variants.sort((a, b) => b.overall - a.overall)
    return { strategy: s, best: variants[0] ?? null, variants }
  })
  return { baseline: base, alternatives }
}
