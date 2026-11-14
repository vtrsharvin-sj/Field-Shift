// Rotation helpers: turn a rotation definition into crop windows and field occupancy. Pure functions.
// A rotation is a cycle of one or more years. Each crop has a sowing month and a year in the cycle (0 = first year).

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MONTH_START = MONTH_DAYS.reduce((acc, d, i) => (acc.push(i === 0 ? 0 : acc[i - 1] + MONTH_DAYS[i - 1]), acc), [])

export const midDuration = (crop) => Math.round((crop.durationDays[0] + crop.durationDays[1]) / 2)

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Attach crop records. `durations` (optional) gives the calendar days each crop occupies; the default is the mid-range crop duration. */
export function resolveRotation(rotation, cropsById, durations = null) {
  return rotation.crops.map((c, i) => {
    const crop = cropsById[c.crop]
    if (!crop) throw new Error(`Unknown crop "${c.crop}" in rotation "${rotation.id}".`)
    return { crop, sowMonth: c.sowMonth, year: c.year ?? 0, durationDays: durations ? durations[i] : midDuration(crop) }
  })
}

export const rotationYears = (items) => Math.max(1, ...items.map((it) => (it.year ?? 0) + 1))

/** For each year of the cycle, which crop index occupies each day of a 365-day year (-1 bare, -2 overlap). A crop running past 31 Dec carries into the next year of the cycle. */
export function occupancyByYear(items) {
  const years = rotationYears(items)
  const occ = Array.from({ length: years }, () => new Array(365).fill(-1))
  items.forEach((it, idx) => {
    const start = MONTH_START[it.sowMonth - 1]
    for (let i = 0; i < Math.min(it.durationDays, 365); i += 1) {
      const abs = start + i
      const yr = ((it.year ?? 0) + Math.floor(abs / 365)) % years
      const d = abs % 365
      occ[yr][d] = occ[yr][d] === -1 ? idx : -2
    }
  })
  return occ
}

/** Problems with a rotation: two crops sharing the same days. Empty list means it is valid. */
export function validateRotation(items) {
  const problems = []
  if (!items.length) problems.push('Add at least one crop.')
  else if (occupancyByYear(items).some((y) => y.some((v) => v === -2))) problems.push('Two crops overlap in the field. Move a sowing month or year, or remove a crop.')
  return problems
}

/** Share of each month (0 to 1) with no crop in the field, averaged over the years of the cycle. */
export function bareFractionByMonth(items) {
  const occ = occupancyByYear(items)
  return MONTH_DAYS.map((len, m) => {
    let bare = 0
    occ.forEach((year) => {
      for (let d = 0; d < len; d += 1) if (year[MONTH_START[m] + d] === -1) bare += 1
    })
    return bare / (len * occ.length)
  })
}

/** Crop days in the field per year of the cycle. */
export function yearTotals(items) {
  const years = rotationYears(items)
  const t = new Array(years).fill(0)
  items.forEach((it) => { t[it.year ?? 0] += it.durationDays })
  return t.map((v) => Math.min(365, v))
}

/** Average crop days in the field per year. */
export const totalCropDays = (items) => {
  const t = yearTotals(items)
  return t.reduce((a, b) => a + b, 0) / t.length
}
