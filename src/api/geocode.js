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
