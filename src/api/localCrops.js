// "What is grown around here": finds text about the farm's area (nearby places, district, state, country) on Wikipedia
// and looks for crops from crops.json in sentences about growing, farming or production.
// This is text evidence, not statistics. It can be old, incomplete or thin for small places, and the app says so.
// Sources are keyless and allow browser access: BigDataCloud (reverse geocoding), Wikipedia API (CC BY-SA).

const WIKI = 'https://en.wikipedia.org/w/api.php'
const REVERSE = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
// Words that say the sentence is about growing a crop. Deliberately narrow: "major" or "produce" alone are too common.
const STRONG = /\b(grow|grows|grown|growing|growers?|cultivat\w*|crops?|farm\w*|agricultur\w*|harvest\w*|plantations?|yields?|sown|planted|irrigat\w*|produces|produced|producers?|production|(?:output|exports?) of|known for|famous for)\b/i
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Sentences of a plain-text article. */
export function sentences(text) {
  return String(text ?? '')
    .replace(/^=+\s*(.*?)\s*=+\s*$/gm, '$1.') // article headings become their own short sentence
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .filter((s) => s.length > 12 && s.length < 450)
}

/**
 * Count mentions of each crop. A "strong" mention is in a sentence about growing, farming or production.
 * Returns { [cropId]: { strong, weak, snippets: [sentence] } } for crops that appear.
 */
export function analyzeText(text, crops, { maxSnippets = 2, maxChars = 240 } = {}) {
  const found = {}
  const list = sentences(text)
  crops.forEach((c) => {
    const re = new RegExp(`\\b(${(c.aliases ?? [c.name.toLowerCase()]).map(esc).join('|')})\\b`, 'i')
    let strong = 0
    let weak = 0
    const snippets = []
    list.forEach((s) => {
      if (!re.test(s)) return
      if (STRONG.test(s)) {
        strong += 1
        if (snippets.length < maxSnippets) snippets.push(s.length > maxChars ? `${s.slice(0, maxChars - 1).trimEnd()}…` : s)
      } else weak += 1
    })
    if (strong || weak) found[c.id] = { strong, weak, snippets }
  })
  return found
}

/**
 * Combine per-page analyses into one score per crop.
 * pages: [{ title, url, level: 'place'|'region'|'country', found }]
 * Best level with a strong mention wins; weak mentions alone give "mention".
 */
export function buildProfile(pages, crops, cfg) {
  const rank = { place: 3, region: 2, country: 1 }
  const out = {}
  crops.forEach((c) => {
    let bestLevel = null
    let mention = false
    const snippets = []
    pages.forEach((p) => {
      const f = p.found?.[c.id]
      if (!f) return
      if (f.strong) {
        if (!bestLevel || rank[p.level] > rank[bestLevel]) bestLevel = p.level
        f.snippets.forEach((t) => snippets.length < cfg.maxSnippets + 1 && snippets.push({ text: t, page: p.title, url: p.url, level: p.level }))
      } else mention = true
    })
    const level = bestLevel ?? (mention ? 'mention' : 'none')
    out[c.id] = { level, score: cfg.levelScore[level], snippets }
  })
  return out
}

export const LEVEL_TEXT = {
  place: 'Named in articles about your village, town or district',
  region: 'Named in articles about your state or region',
  country: 'Named in articles about your country',
  mention: 'Only mentioned, not described as grown here',
  none: 'Not found in articles about your area',
}

async function getJson(url, { fetchImpl, timeoutMs }) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`Status ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Place names for the point: city, locality, district, state, country. */
export async function reverseGeocode(lat, lon, io) {
  const j = await getJson(`${REVERSE}?${new URLSearchParams({ latitude: String(lat), longitude: String(lon), localityLanguage: 'en' })}`, io)
  const admin = Array.isArray(j?.localityInfo?.administrative) ? j.localityInfo.administrative : []
  const district = admin.filter((a) => a.adminLevel >= 4 && a.adminLevel <= 7 && a.name && a.name !== j.principalSubdivision && a.name !== j.countryName).map((a) => a.name)
  return {
    city: j.city || '',
    locality: j.locality || '',
    districts: [...new Set(district)].slice(0, 3),
    region: j.principalSubdivision || '',
    country: j.countryName || '',
    countryCode: j.countryCode || '',
  }
}

export async function nearbyArticles(lat, lon, cfg, io) {
  const q = new URLSearchParams({ action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: String(cfg.geosearchRadiusM), gslimit: String(cfg.placePages + 3), format: 'json', origin: '*' })
  const j = await getJson(`${WIKI}?${q}`, io)
  return (j?.query?.geosearch ?? []).map((g) => g.title)
}

/** Full plain-text article. Returns null for a missing page. Follows redirects. */
export async function articleText(title, io) {
  const q = new URLSearchParams({ action: 'query', prop: 'extracts', explaintext: '1', titles: title, redirects: '1', format: 'json', origin: '*' })
  const j = await getJson(`${WIKI}?${q}`, io)
  const page = Object.values(j?.query?.pages ?? {})[0]
  if (!page || page.missing !== undefined || !page.extract) return null
  return { title: page.title, text: page.extract, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}` }
}

/** "Agriculture in X" if such an article exists, otherwise the page about X. */
async function agricultureOrPlace(name, io) {
  if (!name) return null
  try {
    const q = new URLSearchParams({ action: 'query', list: 'search', srsearch: `Agriculture in ${name}`, srlimit: '3', format: 'json', origin: '*' })
    const j = await getJson(`${WIKI}?${q}`, io)
    const hit = (j?.query?.search ?? []).find((s) => /^(agriculture|agricultural|farming)\b/i.test(s.title) && s.title.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
    if (hit) {
      const a = await articleText(hit.title, io)
      if (a) return a
    }
  } catch {
    /* fall through to the plain page */
  }
  return articleText(name, io)
}

const cacheKey = (lat, lon) => `localCrops:v1:${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`

export function readLocalCache(lat, lon, cfg, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  try {
    const raw = JSON.parse(storage?.getItem(cacheKey(lat, lon)) ?? 'null')
    if (!raw || now - raw.savedAt > cfg.cacheDays * 86400000) return null
    return { ...raw.data, fromCache: true }
  } catch {
    return null
  }
}

export function writeLocalCache(lat, lon, data, { storage = globalThis.localStorage, now = Date.now() } = {}) {
  try {
    storage?.setItem(cacheKey(lat, lon), JSON.stringify({ savedAt: now, data }))
  } catch {
    /* storage full: still works for this visit */
  }
}

/**
 * Work out which crops are grown or known around a point.
 * Never throws: if nothing could be read it returns { available: false, reason }.
 */
export async function fetchLocalCrops(lat, lon, crops, cfg, { fetchImpl = globalThis.fetch, timeoutMs = 20000, force = false } = {}) {
  if (!force) {
    const cached = readLocalCache(lat, lon, cfg)
    if (cached) return cached
  }
  const io = { fetchImpl, timeoutMs }
  const [rev, near] = await Promise.allSettled([reverseGeocode(lat, lon, io), nearbyArticles(lat, lon, cfg, io)])
  const place = rev.status === 'fulfilled' ? rev.value : { city: '', locality: '', districts: [], region: '', country: '', countryCode: '' }
  const nearTitles = near.status === 'fulfilled' ? near.value : []

  const wanted = []
  const add = (title, level) => title && !wanted.some((w) => w.title.toLowerCase() === title.toLowerCase()) && wanted.push({ title, level })
  nearTitles.slice(0, cfg.placePages).forEach((t) => add(t, 'place'))
  ;[place.city, place.locality, ...place.districts].forEach((t) => add(t, 'place'))
  const jobs = [
    ...wanted.slice(0, cfg.placePages + 3).map((w) => articleText(w.title, io).then((a) => a && { ...a, level: w.level })),
    agricultureOrPlace(place.region, io).then((a) => a && { ...a, level: 'region' }),
    agricultureOrPlace(place.country, io).then((a) => a && { ...a, level: 'country' }),
  ]
  const settled = await Promise.allSettled(jobs)
  const seen = new Set()
  const pages = settled
    .filter((s) => s.status === 'fulfilled' && s.value)
    .map((s) => s.value)
    .filter((p) => (seen.has(p.title) ? false : (seen.add(p.title), true)))
    .map((p) => ({ title: p.title, url: p.url, level: p.level, found: analyzeText(p.text, crops, { maxSnippets: cfg.maxSnippets, maxChars: cfg.maxSnippetChars }) }))

  const tidy = (n) => String(n ?? '').replace(/^(Township|Town|City|Village|Municipality|Borough|County) of /i, '')
  place.city = tidy(place.city)
  place.locality = tidy(place.locality)
  const label = [place.city || place.locality, place.districts[0], place.region, place.country].filter((x, i, a) => x && a.indexOf(x) === i).join(', ')
  if (!pages.length) return { available: false, reason: 'No articles about this area could be read (offline, or the place has no article).', place: { ...place, label }, fetchedAt: new Date().toISOString() }
  const profile = buildProfile(pages, crops, cfg)
  const known = Object.entries(profile).filter(([, v]) => v.level !== 'none').length
  const data = {
    available: known > 0,
    reason: known > 0 ? null : 'The articles about this area do not mention any crop in the crop table.',
    place: { ...place, label },
    pages: pages.map(({ title, url, level }) => ({ title, url, level })),
    crops: profile,
    fetchedAt: new Date().toISOString(),
  }
  if (data.available) writeLocalCache(lat, lon, data)
  return data
}


