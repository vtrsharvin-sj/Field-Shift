// Climate indicators derived from NASA POWER daily records.
// All functions are pure. Daily records look like { date, year, month, day, t2m, tmax, tmin, rain, rh, rad, gwettop, gwetroot, evptrns }
// where missing values (-999 in POWER) are null.

import { clamp, cv, linearSlope, longestRun, mean, percentile, sum } from './stats.js'

export const DEFAULTS = {
  heatThresholdC: 35, // Brief section 6: default heat-stress threshold
  frostThresholdC: 2, // Brief section 6: frost night below 2 C
  dryDayMm: 1, // Dry day: rain below 1 mm
  rainyDayMm: 1, // "Rainy day" for the heavy-rain percentile
  heavyRainPercentile: 95,
}

const DAY_MS = 86400000
export const dayNumber = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS)
export const dayOfYear = (y, m, d) => dayNumber(y, m, d) - dayNumber(y, 1, 1) + 1

/** Map from day number to record, for fast window lookups. */
export function indexDays(days) {
  const map = new Map()
  days.forEach((r) => map.set(dayNumber(r.year, r.month, r.day), r))
  return map
}

/** Records in [start, start + length) days, or null if the window is not fully inside the data range. */
export function windowRecords(index, startYear, startMonth, lengthDays) {
  const start = dayNumber(startYear, startMonth, 1)
  const out = []
  for (let i = 0; i < lengthDays; i += 1) {
    const r = index.get(start + i)
    if (!r) return null
    out.push(r)
  }
  return out
}

/**
 * A crop season measured in "growing days" instead of calendar days. Days colder than baseT do not count
 * (the crop is dormant), so a winter cereal sown in autumn occupies the field until spring.
 * Returns the daily records from the 1st of the sowing month, or null if the crop cannot collect enough
 * growing days within maxLen calendar days (or the record ends first).
 */
export function thermalWindow(index, startYear, startMonth, targetDays, baseT, maxLen = 400) {
  const start = dayNumber(startYear, startMonth, 1)
  const recs = []
  let grow = 0
  for (let i = 0; i < maxLen; i += 1) {
    const r = index.get(start + i)
    if (!r) return null
    recs.push(r)
    if (r.t2m == null || r.t2m >= baseT) grow += 1
    if (grow >= targetDays) return recs
  }
  return null
}

/**
 * Reference evapotranspiration (mm/day) by the Hargreaves-Samani method (FAO-56 eq. 52).
 * Chosen because it needs only temperature and latitude and is stable at point scale.
 */
export function extraterrestrialRadiation(latDeg, doy) {
  const phi = (latDeg * Math.PI) / 180
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365)
  const delta = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39)
  const x = clamp(-Math.tan(phi) * Math.tan(delta), -1, 1)
  const ws = Math.acos(x)
  const gsc = 0.082
  return ((24 * 60) / Math.PI) * gsc * dr * (ws * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(ws))
}

export function hargreavesEt0({ tmean, tmax, tmin, lat, doy }) {
  if ([tmean, tmax, tmin].some((v) => v == null)) return null
  const range = Math.max(tmax - tmin, 0)
  const ra = extraterrestrialRadiation(lat, doy)
  return Math.max(0, 0.0023 * (tmean + 17.8) * Math.sqrt(range) * 0.408 * ra)
}

/** The rain amount (mm) above which a rainy day counts as a heavy-rain day (95th percentile of rainy days). */
export function heavyRainThreshold(days, opts = DEFAULTS) {
  const rainy = days.filter((d) => d.rain != null && d.rain >= opts.rainyDayMm).map((d) => d.rain)
  return percentile(rainy, opts.heavyRainPercentile)
}

/** Statistics for one season window (one year). */
export function seasonYearStats(recs, { lat, kc = 1, heatThresholdC, frostThresholdC, heavyMm, baseT = null }) {
  const valid = (k) => recs.filter((r) => r[k] != null)
  const rainDays = valid('rain')
  const et0Days = recs
    .map((r) => hargreavesEt0({ tmean: r.t2m, tmax: r.tmax, tmin: r.tmin, lat, doy: dayOfYear(r.year, r.month, r.day) }))
    .filter((v) => v != null)
  const rainTotal = sum(rainDays.map((r) => r.rain))
  const et0Total = sum(et0Days)
  const soil = valid('gwetroot').map((r) => r.gwetroot)
  return {
    rainTotal,
    rainValidDays: rainDays.length,
    longestDryStretch: longestRun(recs.map((r) => r.rain), (v) => v < DEFAULTS.dryDayMm),
    heatDays: valid('tmax').filter((r) => r.tmax > heatThresholdC).length,
    frostDays: valid('tmin').filter((r) => r.tmin < frostThresholdC).length,
    heavyRainDays: heavyMm == null ? null : rainDays.filter((r) => r.rain >= heavyMm).length,
    et0Total,
    cropWaterDemand: kc * et0Total,
    waterBalance: rainTotal - kc * et0Total,
    soilWetness: soil.length ? mean(soil) : null,
    meanRh: mean(valid('rh').map((r) => r.rh)),
    meanTmax: mean(valid('tmax').map((r) => r.tmax)),
    meanT: mean(valid('t2m').filter((r) => baseT == null || r.t2m >= baseT).map((r) => r.t2m)),
    sowT: mean(valid('t2m').slice(0, 14).map((r) => r.t2m)),
    coldestNight: valid('tmin').length ? Math.min(...valid('tmin').map((r) => r.tmin)) : null,
    lengthDays: recs.length,
  }
}

/**
 * Indicators for one crop season (sowing month + duration), averaged across all years with a complete window.
 * Returns null when no full season fits in the data.
 */
export function seasonIndicators(days, index, { lat, sowMonth, durationDays, kc = 1, heatThresholdC = DEFAULTS.heatThresholdC, heavyMm = null, baseT = null, killC = null }) {
  const years = [...new Set(days.map((d) => d.year))]
  const perYear = []
  years.forEach((y) => {
    const recs = baseT == null ? windowRecords(index, y, sowMonth, durationDays) : thermalWindow(index, y, sowMonth, durationDays, baseT)
    if (recs) perYear.push({ year: y, ...seasonYearStats(recs, { lat, kc, heatThresholdC, frostThresholdC: DEFAULTS.frostThresholdC, heavyMm, baseT }) })
  })
  if (!perYear.length) return null
  const col = (k) => perYear.map((p) => p[k]).filter((v) => v != null)
  const rains = col('rainTotal')
  const balances = col('waterBalance')
  return {
    years: perYear.length,
    rainMean: mean(rains),
    rainCV: cv(rains),
    longestDryStretchMean: mean(col('longestDryStretch')),
    longestDryStretchMax: Math.max(...col('longestDryStretch')),
    heatDaysMean: mean(col('heatDays')),
    frostDaysMean: mean(col('frostDays')),
    heavyRainDaysMean: heavyMm == null ? null : mean(col('heavyRainDays')),
    et0Mean: mean(col('et0Total')),
    cropWaterDemandMean: mean(col('cropWaterDemand')),
    waterBalanceMean: mean(balances),
    waterBalanceDryYear: percentile(balances, 20), // a "dry year": 1 year in 5 is worse than this
    soilWetnessMean: col('soilWetness').length ? mean(col('soilWetness')) : null,
    rhMean: mean(col('meanRh')),
    tmeanMean: mean(col('meanT')),
    sowTempMean: mean(col('sowT')),
    lengthMean: mean(col('lengthDays')),
    killShare: killC == null ? 0 : col('coldestNight').filter((t) => t < killC).length / Math.max(1, col('coldestNight').length),
    coldestNightMean: mean(col('coldestNight')),
    tmeanMin: Math.min(...col('meanT')),
    tmeanMax: Math.max(...col('meanT')),
    heatDaysDryYear: percentile(col('heatDays'), 80),
  }
}

/** Month-by-month climate averages (index 0 = January) for charts and the bare-field/erosion rules. */
export function monthlyClimatology(days, { lat, heatThresholdC = DEFAULTS.heatThresholdC, heavyMm = null }) {
  const out = []
  for (let m = 1; m <= 12; m += 1) {
    const inMonth = days.filter((d) => d.month === m)
    const years = [...new Set(inMonth.map((d) => d.year))]
    const byYear = years.map((y) => inMonth.filter((d) => d.year === y))
    const rainTotals = byYear.map((ds) => sum(ds.filter((d) => d.rain != null).map((d) => d.rain)))
    const temps = inMonth.filter((d) => d.t2m != null).map((d) => d.t2m)
    out.push({
      month: m,
      rainMm: mean(rainTotals),
      rainCV: cv(rainTotals),
      tmeanC: mean(temps),
      tmaxC: mean(inMonth.filter((d) => d.tmax != null).map((d) => d.tmax)),
      tminC: mean(inMonth.filter((d) => d.tmin != null).map((d) => d.tmin)),
      heatDays: mean(byYear.map((ds) => ds.filter((d) => d.tmax != null && d.tmax > heatThresholdC).length)),
      frostDays: mean(byYear.map((ds) => ds.filter((d) => d.tmin != null && d.tmin < DEFAULTS.frostThresholdC).length)),
      longestDry: mean(byYear.map((ds) => longestRun(ds.map((d) => d.rain), (v) => v < DEFAULTS.dryDayMm))),
      heavyRainDays: heavyMm == null ? null : mean(byYear.map((ds) => ds.filter((d) => d.rain != null && d.rain >= heavyMm).length)),
      et0Mm: mean(byYear.map((ds) => sum(ds.map((d) => hargreavesEt0({ tmean: d.t2m, tmax: d.tmax, tmin: d.tmin, lat, doy: dayOfYear(d.year, d.month, d.day) })).filter((v) => v != null)))),
    })
  }
  return out
}

/** Annual totals and linear trends. Only years with at least 90% valid rain days are used. */
export function annualTrends(days) {
  const years = [...new Set(days.map((d) => d.year))]
  const rows = years
    .map((y) => {
      const ds = days.filter((d) => d.year === y)
      const rain = ds.filter((d) => d.rain != null)
      const temp = ds.filter((d) => d.t2m != null)
      return {
        year: y,
        complete: rain.length >= ds.length * 0.9 && ds.length >= 360,
        rainMm: sum(rain.map((d) => d.rain)),
        tmeanC: mean(temp.map((d) => d.t2m)),
      }
    })
    .filter((r) => r.complete)
  const xs = rows.map((r) => r.year)
  const rainSlope = linearSlope(xs, rows.map((r) => r.rainMm))
  const tempSlope = linearSlope(xs, rows.map((r) => r.tmeanC))
  const span = xs.length ? xs[xs.length - 1] - xs[0] : 0
  const meanRain = mean(rows.map((r) => r.rainMm))
  return {
    rows,
    rainSlopeMmPerYear: rainSlope,
    rainChangePct: rainSlope != null && meanRain ? ((rainSlope * span) / meanRain) * 100 : null,
    tempSlopeCPerYear: tempSlope,
    tempChangeC: tempSlope != null ? tempSlope * span : null,
    spanYears: span,
  }
}

/** Plain-language one-line interpretations for the climate snapshot. */
export function describeTrends(t) {
  const lines = {}
  if (t.rainChangePct == null) lines.rain = 'Not enough complete years to say whether rainfall is changing.'
  else {
    const p = Math.round(Math.abs(t.rainChangePct))
    lines.rain = p < 3 ? `Yearly rainfall has stayed about the same over ${t.spanYears + 1} years.` : `Yearly rainfall has ${t.rainChangePct < 0 ? 'dropped' : 'risen'} about ${p}% over ${t.spanYears + 1} years (a trend line, not a promise).`
  }
  if (t.tempChangeC == null) lines.temp = 'Not enough complete years to say whether temperature is changing.'
  else {
    const c = Math.abs(t.tempChangeC).toFixed(1)
    lines.temp = Math.abs(t.tempChangeC) < 0.2 ? 'Average temperature has stayed about the same.' : `Average temperature has ${t.tempChangeC > 0 ? 'risen' : 'fallen'} about ${c} C over ${t.spanYears + 1} years.`
  }
  return lines
}
