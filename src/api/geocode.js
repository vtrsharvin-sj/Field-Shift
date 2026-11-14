// Place search: village, town, district, landmark, shop, college, temple, farm or address.
// Sources run in parallel and are merged (all free; Google is used only when its key and APIs are enabled):
//   Google Places + Geocoder (if enabled for the key), Photon (OpenStreetMap, landmarks and shops),
//   Nominatim (OpenStreetMap names and addresses), Wikipedia (famous landmarks with coordinates), Open-Meteo (towns and cities).
// Nominatim rules: only on an explicit search (no autocomplete), at most one request per search.

const inRange = (la, lo) => Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180

async function fetchJson(url, { fetchImpl = globalThis.fetch, timeoutMs = 15000, init = {} } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, ...init })
    if (!res.ok) throw new Error(`Place search responded with status ${res.status}.`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ---- Open-Meteo (towns and cities)
export function parsePlaces(json) {
  const list = Array.isArray(json?.results) ? json.results : []
  return list.map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    kind: 'place',
    source: 'Open-Meteo',
  }))
}

export async function searchOpenMeteo(query, opts = {}) {
  const q = String(query ?? '').trim()
  if (q.length < 2) return []
  return parsePlaces(await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' })}`, opts))
}

// ---- Nominatim (OpenStreetMap)
export function parseNominatim(json) {
  const list = Array.isArray(json) ? json : []
  return list
    .map((r) => ({ name: r.display_name, lat: Number(r.lat), lon: Number(r.lon), kind: (r.type ?? r.category ?? '').replace(/_/g, ' '), source: 'OpenStreetMap' }))
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lon))
}

export async function searchNominatim(query, opts = {}) {
  return parseNominatim(await fetchJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '8', addressdetails: '0' })}`, { ...opts, init: { headers: { 'Accept-Language': 'en' } } }))
}

// ---- Photon (OpenStreetMap data built for search-as-you-type: shops, malls, temples, colleges, parks)
export function parsePhoton(json) {
  const list = Array.isArray(json?.features) ? json.features : []
  return list
    .map((f) => {
      const p = f.properties ?? {}
      const [lon, lat] = f.geometry?.coordinates ?? []
      const where = [p.city || p.town || p.village || p.county, p.state, p.country].filter((x, i, arr) => x && arr.indexOf(x) === i).join(', ')
      const street = [p.housenumber, p.street].filter(Boolean).join(' ')
      return {
        name: [p.name || street, where].filter(Boolean).join(', '),
        lat: Number(lat),
        lon: Number(lon),
        kind: String(p.osm_value && p.osm_value !== 'yes' ? p.osm_value : p.type ?? '').replace(/_/g, ' '),
        source: 'OpenStreetMap',
      }
    })
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lon))
}

export async function searchPhoton(query, { near = null, limit = 8, ...opts } = {}) {
  const q = new URLSearchParams({ q: query, limit: String(limit), lang: 'en' })
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lon)) {
    q.set('lat', String(near.lat)) // bias results toward where the user is looking
    q.set('lon', String(near.lon))
  }
  return parsePhoton(await fetchJson(`https://photon.komoot.io/api/?${q}`, opts))
}

// ---- Wikipedia (famous landmarks with coordinates)
export function parseWikipediaPlaces(json) {
  return Object.values(json?.query?.pages ?? {})
    .filter((p) => p.coordinates?.[0] && Number.isFinite(p.coordinates[0].lat))
    .sort((x, y) => (x.index ?? 99) - (y.index ?? 99))
    .map((p) => ({ name: p.title, lat: Number(p.coordinates[0].lat), lon: Number(p.coordinates[0].lon), kind: p.description ?? 'landmark', source: 'Wikipedia' }))
}

/** Keep articles whose title shares enough of the search words (matched on their first 5 letters), so unrelated hits are dropped. */
export function relevantTo(query, title) {
  const tokens = String(query).toLowerCase().split(/[^a-z0-9\u00C0-\u024F]+/).filter((t) => t.length >= 4)
  if (!tokens.length) return true
  const t = String(title).toLowerCase()
  const hits = tokens.filter((w) => t.includes(w.slice(0, 5))).length
  const need = tokens.length <= 2 ? tokens.length : Math.ceil((tokens.length * 2) / 3)
  return hits >= need
}

export async function searchWikipediaPlaces(query, opts = {}) {
  const q = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '6', prop: 'coordinates|description', colimit: '6', format: 'json', origin: '*' })
  return parseWikipediaPlaces(await fetchJson(`https://en.wikipedia.org/w/api.php?${q}`, opts)).filter((p) => relevantTo(query, p.name))
}

// ---- Google (Places text search and Geocoder through the loaded Maps JavaScript API)
/**
 * Place search needs "Places API (New)". The optional address fallback uses "Geocoding API".
 * Missing services return [] and call report(service, reason).
 */
export async function searchGooglePlaces(query, g = globalThis.window?.google, report = () => {}, near = null) {
  const maps = g?.maps ?? g
  if (!maps?.importLibrary) return []
  const out = []
  try {
    const { Place } = await maps.importLibrary('places')
    const request = { textQuery: query, fields: ['displayName', 'formattedAddress', 'location', 'types'], maxResultCount: 8, language: 'en' }
    if (near && Number.isFinite(near.lat) && Number.isFinite(near.lon)) {
      request.locationBias = { center: { lat: near.lat, lng: near.lon }, radius: 50000 }
    }
    const r = await Place.searchByText(request)
    ;(r.places ?? []).forEach((p) => out.push({ name: [p.displayName, p.formattedAddress].filter(Boolean).join(', '), lat: p.location.lat(), lon: p.location.lng(), kind: (p.types?.[0] ?? '').replace(/_/g, ' '), source: 'Google' }))
  } catch (e) {
    report('places', e.message)
  }
  return out
}

export async function searchGoogle(query, g = globalThis.window?.google, report = () => {}, near = null) {
  const out = await searchGooglePlaces(query, g, report, near)
  const maps = g?.maps ?? g
  if (!maps?.Geocoder) return out
  await new Promise((resolve) => {
    try {
      new maps.Geocoder().geocode({ address: query }, (results, status) => {
        if (status === 'OK' && Array.isArray(results)) results.slice(0, 4).forEach((r) => out.push({ name: r.formatted_address, lat: Number(r.geometry.location.lat()), lon: Number(r.geometry.location.lng()), kind: 'address', source: 'Google' }))
        else if (!out.length) report('geocoder', status)
        resolve()
      })
    } catch {
      resolve()
    }
  })
  return out
}

/** Google Places autocomplete predictions for the live search box.
 * Reuse one Places session token while the user types; the selected prediction
 * carries it into fetchFields(), which completes that autocomplete session.
 */
export async function suggestGooglePlaces(query, g = globalThis.window?.google, sessionToken = null, near = null) {
  const q = String(query ?? '').trim()
  const maps = g?.maps ?? g
  if (q.length < 2 || !maps?.importLibrary) return { places: [], sessionToken }
  const { AutocompleteSuggestion, AutocompleteSessionToken } = await maps.importLibrary('places')
  const token = sessionToken ?? new AutocompleteSessionToken()
  const request = { input: q, sessionToken: token, language: 'en' }
  if (near && Number.isFinite(near.lat) && Number.isFinite(near.lon)) {
    request.origin = { lat: near.lat, lng: near.lon }
  }
  const { suggestions = [] } = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request)
  const places = suggestions.flatMap((suggestion) => {
    const prediction = suggestion.placePrediction
    if (!prediction) return []
    return [{
      name: prediction.text?.toString() ?? '',
      kind: prediction.types?.[0] ?? 'place',
      source: 'Google',
      googlePrediction: prediction,
    }]
  }).filter((p) => p.name)
  return { places, sessionToken: token }
}

// ---- Merging and the combined search
const firstPart = (p) => p.name.split(',')[0].trim().toLowerCase()

/** Merge result lists in priority order. Drops a place within ~150 m of one already listed, or with the same name within ~5 km. */
export function mergePlaces(lists, max = 10) {
  const out = []
  lists.flat().forEach((p) => {
    const dup = out.some((q) => (Math.abs(q.lat - p.lat) < 0.0015 && Math.abs(q.lon - p.lon) < 0.0015) || (firstPart(q) === firstPart(p) && Math.abs(q.lat - p.lat) < 0.05 && Math.abs(q.lon - p.lon) < 0.05))
    if (!dup) out.push(p)
  })
  return out.slice(0, max)
}

/** Search every source in parallel. Throws only if every network source failed. */
export async function searchPlaces(query, opts = {}) {
  const q = String(query ?? '').trim()
  if (q.length < 2) return []
  const { report, ...io } = opts
  const settled = await Promise.allSettled([searchGoogle(q, undefined, report, io.near), searchPhoton(q, io), searchNominatim(q, io), searchWikipediaPlaces(q, io), searchOpenMeteo(q, io)])
  const lists = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value)
  const network = settled.slice(1)
  // Google never rejects (it returns [] when unavailable), so only the other sources decide whether the search failed.
  if (network.every((s) => s.status === 'rejected') && !lists.flat().length) throw new Error(network[0].reason?.message ?? 'Place search failed.')
  return mergePlaces(lists)
}

/** Quick open-map suggestions while typing. Google autocomplete is combined in the UI when configured. */
export async function suggestPlaces(query, { minLength = 2, ...opts } = {}) {
  const q = String(query ?? '').trim()
  if (q.length < minLength) return []
  return mergePlaces([await searchPhoton(q, { limit: 7, ...opts })], 7)
}

// ---- Pasted coordinates and links
/**
 * Read a coordinate pair from pasted text. Accepts "10.95, 77.1", "10.95 77.1", "10.95N 77.1E",
 * and Google Maps links (@lat,lon  or  !3dlat!4dlon  or  ?q=lat,lon  or  ll=lat,lon). Returns null if none is found.
 */
export function parseCoordinates(text) {
  let t = String(text ?? '')
  try {
    t = decodeURIComponent(t)
  } catch {
    /* keep the raw text */
  }
  t = t.trim()
  if (!t) return null
  const patterns = [
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /[?&](?:q|ll|query|center)=(-?\d+(?:\.\d+)?)[, +](-?\d+(?:\.\d+)?)/,
  ]
  for (const p of patterns) {
    const m = t.match(p)
    if (m && inRange(Number(m[1]), Number(m[2]))) return { lat: Number(m[1]), lon: Number(m[2]) }
  }
  const d = t.match(/^\s*(-?\d+(?:\.\d+)?)\s*°?\s*([NSns])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EWew])?\s*$/)
  if (d) {
    let la = Number(d[1])
    let lo = Number(d[3])
    if (d[2] && /s/i.test(d[2])) la = -Math.abs(la)
    if (d[4] && /w/i.test(d[4])) lo = -Math.abs(lo)
    if (inRange(la, lo)) return { lat: la, lon: lo }
  }
  return null
}

export const googleMapsLink = (lat, lon) => `https://www.google.com/maps?q=${lat},${lon}`
