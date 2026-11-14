// Place search by name (Open-Meteo geocoding, free, no key, CORS enabled).

const BASE = 'https://geocoding-api.open-meteo.com/v1/search'

export function parsePlaces(json) {
  const list = Array.isArray(json?.results) ? json.results : []
  return list.map((r) => ({
    name: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: Number(r.latitude),
    lon: Number(r.longitude),
  }))
}

export async function searchPlaces(query, { fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
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
