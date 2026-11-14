// Scoring engine: climate context -> component scores -> weighted overall score. Pure and deterministic.
// Component scores do not depend on the farmer's priorities, so they are cached; moving a slider only re-weights them.

import { annualTrends, heavyRainThreshold, indexDays, monthlyClimatology, seasonIndicators } from '../indicators/climate.js'
import { etSummary, landCoverInfo, lstSummary, ndviSummary, sourceAgreement } from '../indicators/satellite.js'
import { classifyClimate } from '../indicators/zone.js'
import { climateFitScore, erosionScore, heatScore, incomeScore, localScore, pestScore, soilScore, waterScore } from './components.js'
import { midDuration, resolveRotation, validateRotation } from './rotation.js'
import { rainEfficiencyFromTexture } from '../api/soilgrids.js'
import { rotationKey } from './names.js'

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

/** Build everything the scoring needs from one POWER download. */
export function buildContext({ power, farm, crops, soils, weights, scenario, satellite, soilInfo = null, local = null }) {
  const trends = annualTrends(power.days) // trends always use the real, unchanged record
  const days = applyScenario(power.days, scenario)
  const index = indexDays(days)
  const heavyMm = heavyRainThreshold(days)
  const lat = Number(farm.lat)
  const monthly = monthlyClimatology(days, { lat, heavyMm })
  const cropsById = Object.fromEntries(crops.map((c) => [c.id, c]))
  const dropdownSoil = soils.types.find((s) => s.id === farm.soilType) ?? soils.types.find((s) => s.id === 'loam')
  // SoilGrids refines water holding only while the farmer's soil type still matches what SoilGrids found.
  const useSoilGrids = Boolean(soilInfo) && farm.soilType === soilInfo.suggestedType
  const soil = useSoilGrids ? { ...dropdownSoil, rainEfficiency: rainEfficiencyFromTexture(soilInfo, weights.soilData.rainEff), fromSoilGrids: true } : dropdownSoil
  const seasonCache = new Map()
  const seasonFor = (crop, sowMonth, durationDays) => {
    const key = `${crop.id}|${sowMonth}|${durationDays}`
    if (!seasonCache.has(key)) {
      const s = seasonIndicators(days, index, { lat, sowMonth, durationDays, kc: crop.cropCoefficientKc, heatThresholdC: crop.heatThresholdC, heavyMm, baseT: crop.tempRangeC.absMin, killC: weights.heat.frostKillByTolerance[crop.frostSensitivity] })
      // A crop that needs more than a year to collect its growing days cannot be used in a yearly cycle.
      seasonCache.set(key, s && s.lengthMean <= 365 ? s : null)
    }
    return seasonCache.get(key)
  }
  const active = scenario && (scenario.rainChangePct || scenario.tempChangeC)
  const realMonthly = active ? monthlyClimatology(power.days, { lat, heavyMm: heavyRainThreshold(power.days) }) : monthly
  return {
    power,
    farm,
    weights,
    soil,
    soilInfo,
    crops,
    cropsById,
    trends,
    monthly,
    heavyMm,
    lat,
    seasonFor,
    scenario: scenario ?? {},
    climate: classifyClimate(realMonthly, lat),
    satellite: summarizeSatellite(satellite, realMonthly, weights),
    local: local?.available ? local : null,
    localReason: local && !local.available ? local.reason : null,
    scoreCache: new Map(),
  }
}

/** Convert slider values (0 to 10) into weights that sum to 1. All zero means equal weights. */
export function normalizePriorities(p) {
  const keys = ['water', 'income', 'soil', 'erosion']
  const total = keys.reduce((s, k) => s + Math.max(0, Number(p[k]) || 0), 0)
  return Object.fromEntries(keys.map((k) => [k, total ? Math.max(0, Number(p[k]) || 0) / total : 0.25]))
}

/** Weighted overall score, multiplied by the temperature-fit gate (see weights.json). */
export function overallScore(c, priorities, w) {
  const pw = normalizePriorities(priorities)
  const priorityPart = pw.water * c.water.score + pw.income * c.income.score + pw.soil * c.soil.score + pw.erosion * c.erosion.score
  const localShare = c.local ? w.localCrops.overallShare : 0 // taken from the priority share only when local data exists
  const base = (w.overall.priorityShare - localShare) * priorityPart + w.overall.heatShare * c.heat.score + w.overall.pestShare * c.pest.score + localShare * (c.local?.score ?? 0)
  const lowest = c.climate ? c.climate.lowest : 100
  const floor = w.climateFit?.floor ?? 1
  const gate = floor + (1 - floor) * (lowest / 100)
  return { overall: base * gate, base, gate, priorityWeights: pw }
}

/** Priority-independent part: component scores for one rotation (cached by crops and sowing months). */
export function scoreRotation(rotation, ctx) {
  const key = rotationKey(rotation)
  if (ctx.scoreCache.has(key)) return ctx.scoreCache.get(key)
  let result
  try {
    const base = resolveRotation(rotation, ctx.cropsById)
    const order = base.map((it, i) => i).sort((a, b) => base[a].year - base[b].year || base[a].sowMonth - base[b].sowMonth)
    const sorted = order.map((i) => base[i])
    const seasons = sorted.map((it) => ctx.seasonFor(it.crop, it.sowMonth, midDuration(it.crop)))
    if (seasons.some((s) => !s)) result = { error: 'One of these crops cannot finish a season from its sowing month at this location (too cold, or the record is too short).' }
    else {
      const items = sorted.map((it, i) => ({ ...it, durationDays: Math.min(365, Math.round(seasons[i].lengthMean)) }))
      const problems = validateRotation(items)
      if (problems.length) result = { error: problems.join(' ') }
      else {
        const w = ctx.weights
        result = {
          rotation,
          items,
          seasons,
          components: {
            water: waterScore(items, seasons, ctx.farm, w, ctx.soil),
            heat: heatScore(items, seasons, w),
            soil: soilScore(items, w, ctx.soilInfo),
            erosion: erosionScore(items, ctx.monthly, w, ctx.satellite?.slope ?? null),
            income: incomeScore(items, w),
            pest: pestScore(items, seasons, w),
            climate: climateFitScore(items, seasons, w),
            ...(ctx.local ? { local: localScore(items, ctx.local, w.localCrops) } : {}),
          },
        }
      }
    }
  } catch (e) {
    result = { error: e.message }
  }
  ctx.scoreCache.set(key, result)
  return result
}

/** Evaluate one rotation for the given priorities. Returns { error } if it is invalid or no full season fits in the data. */
export function evaluateRotation(rotation, ctx, priorities) {
  const scored = scoreRotation(rotation, ctx)
  if (scored.error) return scored
  return { ...scored, ...overallScore(scored.components, priorities, ctx.weights) }
}
