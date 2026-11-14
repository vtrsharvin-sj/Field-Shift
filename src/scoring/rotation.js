// Rotation helpers: turn a rotation definition into crop windows and monthly occupancy. Pure functions.

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const MONTH_START = MONTH_DAYS.reduce((acc, d, i) => (acc.push(i === 0 ? 0 : acc[i - 1] + MONTH_DAYS[i - 1]), acc), [])

export const midDuration = (crop) => Math.round((crop.durationDays[0] + crop.durationDays[1]) / 2)

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Attach crop records and durations. Unknown crop ids throw so bad data is never silently skipped. */
export function resolveRotation(rotation, cropsById) {
  return rotation.crops.map((c) => {
    const crop = cropsById[c.crop]
    if (!crop) throw new Error(`Unknown crop "${c.crop}" in rotation "${rotation.id}".`)
    return { crop, sowMonth: c.sowMonth, durationDays: midDuration(crop) }
  })
}

/** Which days of a 365-day year each crop occupies (wrapping past 31 Dec). Returns an array of crop indexes or -1 for bare. */
export function dayOccupancy(items) {
  const occ = new Array(365).fill(-1)
  items.forEach((it, idx) => {
    const start = MONTH_START[it.sowMonth - 1]
    for (let i = 0; i < Math.min(it.durationDays, 365); i += 1) {
      const d = (start + i) % 365
      if (occ[d] === -1) occ[d] = idx
      else occ[d] = -2 // overlap
    }
  })
  return occ
}

/** Problems with a rotation: two crops sharing the same days. Empty list means it is valid. */
export function validateRotation(items) {
  const problems = []
  if (!items.length) problems.push('Add at least one crop.')
  if (dayOccupancy(items).some((v) => v === -2)) problems.push('Two crops overlap in the field. Move a sowing month or remove a crop.')
  return problems
}

/** Share of each month (0 to 1) with no crop in the field. */
export function bareFractionByMonth(items) {
  const occ = dayOccupancy(items)
  return MONTH_DAYS.map((len, m) => {
    let bare = 0
    for (let d = 0; d < len; d += 1) if (occ[MONTH_START[m] + d] === -1) bare += 1
    return bare / len
  })
}

export const totalCropDays = (items) => Math.min(365, items.reduce((s, it) => s + it.durationDays, 0))
