// Place search: village, town, district, landmark, farm or business names.
// Sources (all free; Google is used only when the Maps JavaScript API with its key is already loaded):
//   Google Geocoder (if available), OpenStreetMap Nominatim (names, landmarks, addresses), Open-Meteo (towns and cities).
// Nominatim rules: only on explicit search (no autocomplete), at most one request per search.

const BASE = 'https://geocoding-api.open-meteo.com/v1/search'

export function parsePlaces(json) {
  const list = Array.isArray(json?.results) ? json.results : []
  return list.map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: Number(r.latitude),
    lon: Number(r.longitude),
  }))
}

export async function searchOpenMeteo(query, { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const q = String(query ?? '').trim()
  if (q.length < 2) return []
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${BASE}?${new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' })}`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`Place search responded with status ${res.status}.`)
    return parsePlaces(await res.json())
  } finally {
    clearTimeout(timer)
  }
}

const inRange = (la, lo) => Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180

/**
 * Read a coordinate pair from pasted text. Accepts "10.95, 77.1", "10.95 77.1", "10.95N 77.1E",
 * and Google Maps links (@lat,lon  or  !3dlat!4dlon  or  ?q=lat,lon  or  ll=lat,lon). Returns null if none is found.
 */
export function parseCoordinates(text) {
  const t = decodeURIComponent(String(text ?? '')).trim()
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
  const d = t.match(/^\s*(-?\d+(?:\.\d+)?)\s*�?\s*([NSns])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*�?\s*([EWew])?\s*$/)
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

export function parseNominatim(json) {
  const list = Array.isArray(json) ? json : []
  return list
    .map((r) => ({ name: r.display_name, lat: Number(r.lat), lon: Number(r.lon), kind: r.type ?? r.category ?? '' }))
    .filter((r) => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lon))
}

export async function searchNominatim(query, { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: query, format: 'jsonv2', limit: '6', addressdetails: '0' })}`, { signal: ctrl.signal, headers: { 'Accept-Language': 'en' } })
    if (!res.ok) throw new Error(`Place search responded with status ${res.status}.`)
    return parseNominatim(await res.json())
  } finally {
    clearTimeout(timer)
  }
}

/** Google Geocoder through the already-loaded Maps JavaScript API. Resolves to [] when unavailable or not permitted for the key. */
export function searchGoogle(query, g = globalThis.window?.google) {
  if (!g?.maps?.Geocoder) return Promise.resolve([])
  return new Promise((resolve) => {
    try {
      new g.maps.Geocoder().geocode({ address: query }, (results, status) => {
        if (status !== 'OK' || !Array.isArray(results)) return resolve([])
        resolve(results.slice(0, 5).map((r) => ({ name: r.formatted_address, lat: Number(r.geometry.location.lat()), lon: Number(r.geometry.location.lng()), kind: 'google' })))
      })
    } catch {
      resolve([])
    }
  })
}

/** Merge result lists and drop places closer than about 1 km to one already listed. */
export function mergePlaces(lists, max = 8) {
  const out = []
  lists.flat().forEach((p) => {
    if (!out.some((q) => Math.abs(q.lat - p.lat) < 0.01 && Math.abs(q.lon - p.lon) < 0.01)) out.push(p)
  })
  return out.slice(0, max)
}

/** Search every source in parallel. Throws only if every source failed. */
export async function searchPlaces(query, opts = {}) {
  const q = String(query ?? '').trim()
  if (q.length < 2) return []
  const [google, osm, meteo] = await Promise.allSettled([searchGoogle(q), searchNominatim(q, opts), searchOpenMeteo(q, opts)])
  const lists = [google, osm, meteo].filter((s) => s.status === 'fulfilled').map((s) => s.value)
  // Google never rejects (it returns [] when unavailable), so only the two network sources decide whether the search failed.
  if (osm.status === 'rejected' && meteo.status === 'rejected' && !lists.flat().length) throw new Error(osm.reason?.message ?? 'Place search failed.')
  return mergePlaces(lists)
}
