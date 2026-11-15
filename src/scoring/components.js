// Component scores (0 to 100). Each returns { score, inputs, formula } so the UI can show how it was computed.
// Every threshold comes from weights.json (passed in as `w`). No hidden constants.

import { clamp, mean, sum } from '../indicators/stats.js'
import { bareFractionByMonth, totalCropDays, yearTotals } from './rotation.js'

const weightedMean = (values, weights) => {
  const tw = sum(weights)
  return tw ? sum(values.map((v, i) => v * weights[i])) / tw : 0
}

/** Pairs of consecutive crops in the yearly cycle, including last -> first (the next year). */
export function cropPairs(items) {
  return items.map((it, i) => [it.crop, items[(i + 1) % items.length].crop])
}

export function waterScore(items, seasons, farm, w, soil, totalDays = null) {
  const perYear = yearTotals(items)
  const annual = w.waterSourceAllowanceMmPerYear[farm.waterSource]?.[farm.waterAvailability] ?? 0
  const rows = items.map((it, i) => {
    const s = seasons[i]
    const total = totalDays ?? perYear[it.year ?? 0]
    const allowance = total ? (annual * it.durationDays) / total : 0
    const demand = it.crop.cropCoefficientKc * s.et0Mean + it.crop.extraWaterMm
    const effRain = s.rainMean * soil.rainEfficiency
    // Prefer observed lower-tail rainfall; retain the CV approximation for sparse records.
    const dryRain = Math.max(0, s.rainDryYear ?? (s.rainMean * (1 - (w.water.dryYearCvFactor * (s.rainCV ?? 0)) / 100))) * soil.rainEfficiency
    const ratioMean = Math.max(0, demand - (effRain + allowance)) / demand
    const ratioDry = Math.max(0, demand - (dryRain + allowance)) / demand
    const tolFactor = w.water.toleranceBase - w.water.tolerancePerPoint * it.crop.droughtTolerance
    const shortfallPenalty = clamp(100 * (w.water.meanShare * ratioMean + w.water.dryYearShare * ratioDry) * tolFactor)
    const varPenalty = it.crop.droughtTolerance <= 2 ? clamp((s.rainCV ?? 0) - w.water.variabilityCvPct, 0, 100) * w.water.variabilityPenaltyPerPct : 0
    const smapWetness = s.soilWetnessMean
    const smapDryness = smapWetness == null ? null : clamp((w.water.smapDryWetnessThreshold - smapWetness) / w.water.smapDryWetnessThreshold, 0, 1)
    const smapSensitivity = clamp((5 - it.crop.droughtTolerance) / 4, 0, 1)
    const smapPenalty = smapDryness == null ? 0 : smapDryness * smapSensitivity * w.water.smapDryPenaltyMax
    const fit = clamp(100 - shortfallPenalty - Math.min(varPenalty, w.water.variabilityPenaltyMax) - smapPenalty)
    return { crop: it.crop.name, demand, effRain, dryRain, allowance, fit, irrigationNeed: Math.max(0, demand - effRain), ratioMean, ratioDry, rainCV: s.rainCV, smapWetness, smapPenalty }
  })
  const fit = weightedMean(rows.map((r) => r.fit), items.map((it) => it.durationDays))
  const irrigationNeed = sum(rows.map((r) => r.irrigationNeed))
  const frugality = 100 - clamp((irrigationNeed / w.water.irrigationScaleMm) * 100)
  const score = clamp(w.water.fitShare * fit + w.water.frugalityShare * frugality)
  return {
    score,
    rows,
    fit,
    frugality,
    irrigationNeed,
    formula: `Water score = ${w.water.fitShare} x water fit + ${w.water.frugalityShare} x water saving. Water fit compares crop water demand (Kc x ET0 + extra water) with usable GPM IMERG rainfall (POWER precipitation fallback where GPM is missing) plus the water-source allowance, in an average year (${w.water.meanShare}) and the observed 20th-percentile rainfall season (${w.water.dryYearShare}; approximately one season in five is drier), scaled by drought tolerance. If fewer than 90% of daily rain values exist for enough seasons, a CV-based dry-year approximation is used. Where recent SMAP root-zone wetness is available, a low seasonal wetness signal adds up to ${w.water.smapDryPenaltyMax} points of risk for a drought-sensitive crop; the generic wetness trigger is ${w.water.smapDryWetnessThreshold} and is not a crop-specific critical limit. Water saving = 100 - irrigation needed / ${w.water.irrigationScaleMm} mm.`,
  }
}

export function heatScore(items, seasons, w) {
  const rows = items.map((it, i) => {
    const s = seasons[i]
    const share = s.heatDaysMean / it.durationDays
    const heatPenalty = clamp(((share - w.heat.toleratedHeatShare) / (w.heat.fullPenaltyHeatShare - w.heat.toleratedHeatShare)) * 100)
    const frostPenalty = clamp(s.frostDaysMean * w.heat.frostPenaltyPerNight * (it.crop.frostSensitivity / 5))
    return { crop: it.crop.name, heatDays: s.heatDaysMean, heatThresholdC: it.crop.heatThresholdC, frostDays: s.frostDaysMean, fit: clamp(100 - heatPenalty - frostPenalty) }
  })
  const score = weightedMean(rows.map((r) => r.fit), items.map((it) => it.durationDays))
  return { score, rows, formula: `Heat and frost fit = 100 - heat penalty - frost penalty. Heat penalty is 0 while very hot days stay under ${w.heat.toleratedHeatShare * 100}% of the season and reaches 100 at ${w.heat.fullPenaltyHeatShare * 100}%. Frost penalty is ${w.heat.frostPenaltyPerNight} points per frost night, scaled by the crop's frost sensitivity.` }
}

export function soilScore(items, w, soilInfo = null) {
  const crops = items.map((it) => it.crop)
  const lowCarbon = soilInfo?.organicCarbonGkg != null && soilInfo.organicCarbonGkg < w.soilData.lowCarbonGkg
  const boost = lowCarbon ? w.soilData.lowCarbonBoost : 1
  const nFix = mean(crops.map((c) => c.nFixing / 5)) * w.soil.nFixingPoints * boost
  const roots = mean(crops.map((c) => c.rootDepth / 5)) * w.soil.rootDepthPoints
  const families = new Set(crops.map((c) => c.family)).size
  const diversity = Math.min(w.soil.diversityMax, (families - 1) * w.soil.diversityPerFamily)
  const pairs = cropPairs(items)
  const repeat = mean(pairs.map(([a, b]) => (a.id === b.id ? w.soil.sameCropRepeatPenalty : a.family === b.family ? w.soil.sameFamilyRepeatPenalty : 0)))
  const score = clamp(w.soil.base + nFix + roots + diversity - repeat)
  return { score, parts: { base: w.soil.base, nFix, roots, diversity, repeat, families, lowCarbon }, formula: `Soil health = ${w.soil.base} base + nitrogen-fixing crops (up to ${w.soil.nFixingPoints}) + deep roots (up to ${w.soil.rootDepthPoints}) + crop-family variety (${w.soil.diversityPerFamily} per extra family, up to ${w.soil.diversityMax}) - penalty for repeating the same crop (${w.soil.sameCropRepeatPenalty}) or family (${w.soil.sameFamilyRepeatPenalty}) back to back.${soilInfo?.organicCarbonGkg != null ? ` Soil organic carbon is ${soilInfo.organicCarbonGkg.toFixed(0)} g/kg (SoilGrids)${lowCarbon ? `, below ${w.soilData.lowCarbonGkg}, so nitrogen-fixing points count x${w.soilData.lowCarbonBoost}` : ', so no adjustment'}.` : ''}` }
}

export function erosionScore(items, monthly, w, slope = null) {
  const bare = bareFractionByMonth(items)
  const heavy = monthly.map((m) => m.heavyRainDays ?? m.rainMm ?? 0)
  const totalHeavy = sum(heavy)
  const bareRainShare = totalHeavy ? sum(bare.map((b, m) => b * heavy[m])) / totalHeavy : 0
  const days = items.map((it) => it.durationDays)
  const cover = weightedMean(items.map((it) => it.crop.erosionCover), days) / 5
  const slopePenalty = slope?.penalty ?? 0
  const score = clamp(100 - w.erosion.bareRainPoints * bareRainShare - w.erosion.coverPoints * (1 - cover) - slopePenalty)
  const bareMonths = bare.map((b, m) => (b >= w.erosion.bareMonthFraction ? m + 1 : null)).filter(Boolean)
  const exposedHeavyMonths = bareMonths.filter((m) => heavy[m - 1] >= 0.75 * Math.max(...heavy) && Math.max(...heavy) > 0)
  return { score, bare, bareMonths, exposedHeavyMonths, bareRainShare, cover, slopePenalty, formula: `Erosion protection = 100 - ${w.erosion.bareRainPoints} x (share of heavy-rain days that fall in bare months) - ${w.erosion.coverPoints} x (1 - average ground cover of the crops / 5). A month is "bare" if at least ${w.erosion.bareMonthFraction * 100}% of it has no crop. ${slope ? `Slope penalty: ${slope.penalty} points (${slope.classLabel} slope, about ${slope.slopePct.toFixed(1)}%).` : 'Slope is not included (elevation not loaded).'}` }
}

export function incomeScore(items, w) {
  const avg = mean(items.map((it) => (it.crop.incomePotential / 5) * 100))
  const days = totalCropDays(items)
  const intensity = w.income.baseShare + w.income.intensityShare * Math.min(1, days / w.income.fullIntensityDays)
  return { score: clamp(avg * intensity), avg, intensity, cropDays: days, formula: `Income = average crop income rating (1-5, scaled to 100) x (${w.income.baseShare} + ${w.income.intensityShare} x days in the field / ${w.income.fullIntensityDays}, at most 1). Ratings are generic estimates, not prices.` }
}

export function pestScore(items, seasons, w) {
  const pairs = cropPairs(items)
  const pairPenalties = pairs.map(([a, b]) => {
    if (a.id === b.id) return w.pest.sameCropRepeatPenalty
    if (a.family === b.family) return w.pest.sameFamilyRepeatPenalty
    if (b.rotationCompatibility.avoidAfter.includes(a.id)) return w.pest.avoidAfterPenalty
    return 0
  })
  const repeat = mean(pairPenalties)
  const humidity = mean(
    items.map((it, i) => {
      const rh = seasons[i].rhMean
      if (rh == null || it.crop.diseaseProneness < 3 || rh <= w.pest.humidityStartPct) return 0
      return Math.min(w.pest.humidityPenaltyMax, (rh - w.pest.humidityStartPct) * w.pest.humidityPenaltyPerPct * (it.crop.diseaseProneness / 5))
    }),
  )
  return { score: clamp(100 - repeat - humidity), repeat, humidity, formula: `Pest and disease safety = 100 - penalty for the same crop (${w.pest.sameCropRepeatPenalty}), same family (${w.pest.sameFamilyRepeatPenalty}) or a listed bad follow-on crop (${w.pest.avoidAfterPenalty}) back to back - humidity penalty for disease-prone crops when average humidity is above ${w.pest.humidityStartPct}%.` }
}

/** How well known each crop is around the farm, from text about the area (see api/localCrops.js). Only built when local data exists. */
export function localScore(items, local, cfg) {
  const rows = items.map((it) => {
    const c = local.crops[it.crop.id] ?? { level: 'none', score: cfg.levelScore.none, snippets: [] }
    return { crop: it.crop.name, id: it.crop.id, level: c.level, score: c.score, snippets: c.snippets }
  })
  const score = mean(rows.map((r) => r.score))
  return { score, rows, formula: `Grown locally = average over the crops of how well each is known around your farm: ${cfg.levelScore.place} if named in articles about your village, town or district, ${cfg.levelScore.region} for your state or region, ${cfg.levelScore.country} for your country, ${cfg.levelScore.mention} if only mentioned, ${cfg.levelScore.none} if not found. This is text from Wikipedia, not production statistics. It counts for ${Math.round(cfg.overallShare * 100)}% of the overall score when available.` }
}

/** Trapezoid fit (0 to 100): 100 inside the optimum range, falling linearly to 0 at the absolute limits. */
export function temperatureFit(tMean, r) {
  if (tMean == null) return null
  if (tMean >= r.optMin && tMean <= r.optMax) return 100
  if (tMean < r.optMin) return tMean <= r.absMin ? 0 : (100 * (tMean - r.absMin)) / (r.optMin - r.absMin)
  return tMean >= r.absMax ? 0 : (100 * (r.absMax - tMean)) / (r.absMax - r.optMax)
}

/**
 * How well a crop's season suits the location (0 to 100): the lowest of
 * - temperature fit of the growing-season average,
 * - sowing fit (is it warm enough, in the first two weeks, to sow?),
 * - survival fit (share of years without a night colder than the crop can survive).
 */
export function seasonTempFit(crop, season, w) {
  const r = crop.tempRangeC
  const tempFit = temperatureFit(season.tmeanMean, r)
  const sowRange = { absMin: r.absMin, optMin: r.absMin + (r.optMin - r.absMin) * (w.climateFit?.sowTempShareOfRange ?? 0.5), optMax: r.optMax, absMax: r.absMax }
  const sowFit = temperatureFit(season.sowTempMean, sowRange)
  const survivalFit = 100 * (1 - season.killShare)
  return { fit: Math.min(tempFit, sowFit, survivalFit), tempFit, sowFit, survivalFit }
}

export function climateFitScore(items, seasons, w) {
  const rows = items.map((it, i) => {
    const s = seasons[i]
    const f = seasonTempFit(it.crop, s, w)
    return { crop: it.crop.name, tMean: s.tmeanMean, sowTemp: s.sowTempMean, coldestNight: s.coldestNightMean, range: it.crop.tempRangeC, ...f }
  })
  const score = weightedMean(rows.map((r) => r.fit), items.map((it) => it.durationDays))
  const lowest = Math.min(...rows.map((r) => r.fit))
  return { score, lowest, rows, formula: 'Temperature fit = the lowest of three checks, each 0 to 100: (1) average temperature of the growing days inside the crop\'s comfortable range (FAO EcoCrop-style ranges in crops.json), falling to 0 at its absolute limits; (2) warm enough to sow in the first two weeks; (3) share of years without a night colder than the crop survives. The overall score is multiplied by a factor that shrinks when any crop fails a check.' }
}
