// Derived indicators from NASA satellite layers (MODIS via ORNL DAAC). Pure functions.
// Inputs are [{date: 'YYYY-MM-DD', value}] series as produced by api/satellite.js.

import { mean, sum } from './stats.js'

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Mean of valid values by calendar month. Index 0 = January. null where a month has no valid data. */
export function monthlyMeans(points) {
  const buckets = Array.from({ length: 12 }, () => [])
  points.forEach((p) => {
    if (p.value == null) return
    buckets[Number(p.date.slice(5, 7)) - 1].push(p.value)
  })
  return buckets.map((b) => (b.length ? mean(b) : null))
}

/** Share of valid values above a threshold, by calendar month. */
export function monthlyShareAbove(points, threshold) {
  const buckets = Array.from({ length: 12 }, () => [])
  points.forEach((p) => {
    if (p.value == null) return
    buckets[Number(p.date.slice(5, 7)) - 1].push(p.value > threshold ? 1 : 0)
  })
  return buckets.map((b) => (b.length ? mean(b) : null))
}

export function pearson(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([x, y]) => x != null && y != null)
  if (pairs.length < 4) return null
  const mx = mean(pairs.map((p) => p[0]))
  const my = mean(pairs.map((p) => p[1]))
  let num = 0
  let dx = 0
  let dy = 0
  pairs.forEach(([x, y]) => {
    num += (x - mx) * (y - my)
    dx += (x - mx) ** 2
    dy += (y - my) ** 2
  })
  return dx && dy ? num / Math.sqrt(dx * dy) : null
}

/** NDVI by month and the months where the satellite sees little vegetation. */
export function ndviSummary(layer, ndviBare) {
  const monthly = monthlyMeans(layer.series['250m_16_days_NDVI'])
  const lowMonths = monthly.map((v, m) => (v != null && v < ndviBare ? m + 1 : null)).filter(Boolean)
  return { monthly, lowMonths, years: layer.years, validMonths: monthly.filter((v) => v != null).length }
}

/** Monthly ET and potential ET in mm (8-day sums scaled to the month) and the ratio ET / PET. */
export function etSummary(layer) {
  const toMonthMm = (points) => monthlyMeans(points).map((v, m) => (v == null ? null : (v / 8) * DAYS_IN_MONTH[m]))
  const et = toMonthMm(layer.series.ET_500m)
  const pet = toMonthMm(layer.series.PET_500m)
  const ratio = et.map((v, m) => (v != null && pet[m] ? v / pet[m] : null))
  return { et, pet, ratio, years: layer.years }
}

/** Monthly day-time ground temperature (C) and the share of composites above a hot-ground threshold. */
export function lstSummary(layer, hotC) {
  const c = layer.series.LST_Day_1km.map((p) => ({ ...p, value: p.value == null ? null : p.value - 273.15 }))
  return { monthlyC: monthlyMeans(c), hotShare: monthlyShareAbove(c, hotC), years: layer.years }
}

/** Mean of a 12-month array over the months a crop season covers (start of sowing month for duration days). */
export function seasonMonthValues(monthly, sowMonth, durationDays) {
  const out = []
  const n = Math.max(1, Math.round(durationDays / 30.4))
  for (let i = 0; i < n; i += 1) out.push(monthly[(sowMonth - 1 + i) % 12])
  const valid = out.filter((v) => v != null)
  return valid.length ? mean(valid) : null
}

const IGBP = { 1: 'evergreen forest', 2: 'evergreen forest', 3: 'deciduous forest', 4: 'deciduous forest', 5: 'mixed forest', 6: 'shrubland', 7: 'shrubland', 8: 'woody savanna', 9: 'savanna', 10: 'grassland', 11: 'wetland', 12: 'cropland', 13: 'urban or built-up area', 14: 'cropland and natural vegetation mosaic', 15: 'snow and ice', 16: 'barren land', 17: 'water' }

export function landCoverInfo(cls) {
  return { name: IGBP[cls] ?? `class ${cls}`, isCropland: cls === 12 || cls === 14 }
}

/**
 * Cross-check: MODIS potential ET against the Hargreaves ET0 computed from POWER, month by month.
 * Large disagreement lowers confidence.
 */
export function sourceAgreement(modisPetMonthly, powerEt0Monthly, { maxPctDiff, minCorr }) {
  const pairs = modisPetMonthly.map((v, m) => [v, powerEt0Monthly[m]]).filter(([a, b]) => a != null && b != null)
  if (pairs.length < 6) return null
  const a = sum(pairs.map((p) => p[0]))
  const b = sum(pairs.map((p) => p[1]))
  const pctDiff = b ? ((a - b) / b) * 100 : null
  const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]))
  const agrees = pctDiff != null && Math.abs(pctDiff) <= maxPctDiff && r != null && r >= minCorr
  return { pctDiff, r, agrees, months: pairs.length }
}
