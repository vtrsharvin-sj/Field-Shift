// Names and cache keys for rotations. Pure helpers.

export const rotationKey = (r) => r.crops.map((c) => `${c.crop}@${c.sowMonth}@${c.year ?? 0}`).join('|')

/** "Wheat, then maize" or "Wheat, then fallow" for a single crop. */
export function rotationName(cropNames, years = 1) {
  if (!cropNames.length) return 'Empty rotation'
  if (cropNames.length === 1) return years > 1 ? `${cropNames[0]} (every ${years} years)` : `${cropNames[0]}, then fallow`
  const base = cropNames.join(', then ')
  return years > 1 ? `${base} (${years}-year cycle)` : base
}
