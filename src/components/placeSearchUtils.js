// Pure helpers for the place search dropdown.

/** Split "Brookefields Mall, Coimbatore, Tamil Nadu, India" into the place name and the rest of the address. */
export function splitName(name) {
  const i = String(name).indexOf(',')
  return i < 0 ? { main: String(name), rest: '' } : { main: name.slice(0, i).trim(), rest: name.slice(i + 1).trim() }
}

/** Break text into [{ text, match }] so the part the user typed can be shown in bold. Case-insensitive. */
export function highlightParts(text, query) {
  const t = String(text)
  const q = String(query ?? '').trim()
  if (!q) return [{ text: t, match: false }]
  const at = t.toLowerCase().indexOf(q.toLowerCase())
  if (at >= 0) {
    return [
      at > 0 && { text: t.slice(0, at), match: false },
      { text: t.slice(at, at + q.length), match: true },
      at + q.length < t.length && { text: t.slice(at + q.length), match: false },
    ].filter(Boolean)
  }
  // Fall back to matching each word the user typed.
  const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2)
  if (!words.length) return [{ text: t, match: false }]
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig')
  return t.split(re).filter(Boolean).map((part) => ({ text: part, match: words.includes(part.toLowerCase()) }))
}

/** Next index in a list of `count` items when moving by `step`, wrapping around. -1 means "nothing highlighted". */
export function moveIndex(current, step, count) {
  if (!count) return -1
  if (current < 0) return step > 0 ? 0 : count - 1
  return (current + step + count) % count
}

const GROUPS = [
  ['shop', 'Shop', /mall|supermarket|marketplace|department|shop|store/],
  ['worship', 'Temple or worship', /worship|temple|church|mosque|religious|shrine|monastery/],
  ['school', 'School or college', /college|university|school/],
  ['health', 'Health', /hospital|clinic|doctors|pharmacy/],
  ['transport', 'Transport', /station|bus|railway|stop|aerodrome|airport/],
  ['food', 'Food', /restaurant|cafe|food|fast food/],
  ['nature', 'Nature or park', /park|garden|nature|peak|water|lake|river/],
  ['farm', 'Farm', /farm|farmland|orchard|vineyard/],
  ['place', 'Place', /city|town|village|hamlet|suburb|neighbourhood|district|county|state|place|administrative/],
]

/** Which icon family a kind of place belongs to: shop, worship, school, health, transport, food, nature, farm, place or other. */
export function kindGroup(kind) {
  const k = String(kind ?? '').toLowerCase()
  return GROUPS.find((g) => g[2].test(k))?.[0] ?? 'other'
}

/** Short word for the kind of place, for the little label on each suggestion. */
export function kindLabel(kind) {
  const k = String(kind ?? '').toLowerCase()
  if (!k) return ''
  const g = GROUPS.find((x) => x[2].test(k))
  if (g) return g[1]
  return k.length > 22 ? `${k.slice(0, 21)}…` : k
}

const words = (s) => String(s ?? '').toLowerCase().split(/[^a-z0-9\u00C0-\u024F]+/).filter(Boolean)

/**
 * Put clear text matches first, keep the search service's own order for the rest.
 * Strong match: the name starts with what was typed, or every typed word starts a word of the name.
 * Places found only through another name (for example "Shri Harmandir Sahib" for "Golden Temple") are kept, just not boosted.
 */
export function rankSuggestions(items, query) {
  const q = String(query ?? '').trim().toLowerCase()
  const qw = words(q)
  if (!qw.length) return items
  const strength = (p) => {
    const name = splitName(p.name).main.toLowerCase()
    if (name.startsWith(q)) return 2
    const nw = words(name)
    return qw.every((w) => nw.some((x) => x.startsWith(w))) ? 1 : 0
  }
  return items.map((p, i) => ({ p, i, s: strength(p) })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.p)
}
