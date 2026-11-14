// Simplified Koeppen-Geiger climate group from the 20-year POWER record.
// Groups: tropical, dry, temperate, continental, cold. Used to suggest typical rotations and explain the setting.

import { mean, sum } from './stats.js'

/** monthly: output of monthlyClimatology (index 0 = January). lat decides which half of the year is "summer". */
export function classifyClimate(monthly, lat) {
  const t = monthly.map((m) => m.tmeanC)
  const p = monthly.map((m) => m.rainMm)
  if (t.some((v) => v == null) || p.some((v) => v == null)) return null
  const tAnn = mean(t)
  const pAnn = sum(p)
  const tMin = Math.min(...t)
  const tMax = Math.max(...t)
  const summer = lat >= 0 ? [3, 4, 5, 6, 7, 8] : [9, 10, 11, 0, 1, 2]
  const summerShare = sum(summer.map((i) => p[i])) / (pAnn || 1)
  const threshold = 20 * tAnn + (summerShare >= 0.7 ? 280 : summerShare <= 0.3 ? 0 : 140)

  if (tMax < 10) return { group: 'cold', label: 'Cold (short, cool summers)', text: 'Summers are short and cool. Only hardy crops with a short season usually work.', tAnn, pAnn, tMin }
  if (pAnn < threshold) {
    const desert = pAnn < threshold / 2
    return { group: 'dry', label: desert ? 'Desert (very dry)' : 'Semi-dry (steppe)', text: desert ? 'Rainfall is very low. Crops depend on irrigation.' : 'Rain is limited and uneven. Drought-tolerant crops or irrigation matter most.', tAnn, pAnn, tMin }
  }
  if (tMin >= 18) {
    const dryMonths = p.filter((v) => v < 60).length
    return { group: 'tropical', label: dryMonths >= 3 ? 'Tropical with a dry season' : 'Tropical (warm and wet)', text: dryMonths >= 3 ? 'Warm all year with a clear dry season. Timing sowing to the rains is key.' : 'Warm all year with rain in most months. Several crops per year can be possible.', tAnn, pAnn, tMin }
  }
  if (tMin > -3) return { group: 'temperate', label: 'Temperate (mild winters)', text: 'Mild winters and warm summers. Both winter and summer crops are possible.', tAnn, pAnn, tMin }
  return { group: 'continental', label: 'Continental (cold winters)', text: 'Cold winters and warm summers. Frost sets the growing season.', tAnn, pAnn, tMin }
}
