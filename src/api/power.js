// NASA POWER daily point API client.
// Pure helpers (buildUrl, parsePowerResponse) are separated from the network call.

export const POWER_BASE = 'https://power.larc.nasa.gov/api/temporal/daily/point'
export const CORE_PARAMS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'RH2M', 'ALLSKY_SFC_SW_DWN']
export const OPTIONAL_PARAMS = ['GWETTOP', 'GWETROOT', 'EVPTRNS']
export const FILL_VALUE = -999

const FIELD_MAP = {
  T2M: 't2m',
  T2M_MAX: 'tmax',
  T2M_MIN: 'tmin',
  PRECTOTCORR: 'rain',
  RH2M: 'rh',
  ALLSKY_SFC_SW_DWN: 'rad',
  GWETTOP: 'gwettop',
  GWETROOT: 'gwetroot',
  EVPTRNS: 'evptrns',
}

export function buildUrl({ lat, lon, startYear, endYear, params = [...CORE_PARAMS, ...OPTIONAL_PARAMS] }) {
  const q = new URLSearchParams({
    parameters: params.join(','),
    community: 'AG',
    latitude: String(lat),
    longitude: String(lon),
    start: `${startYear}0101`,
    end: `${endYear}1231`,
    format: 'JSON',
  })
  return `${POWER_BASE}?${q.toString()}`
}

export function validateLocation(lat, lon) {
  const la = Number(lat)
  const lo = Number(lon)
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return 'Latitude and longitude must be numbers.'
  if (la < -90 || la > 90) return 'Latitude must be between -90 and 90.'
  if (lo < -180 || lo > 180) return 'Longitude must be between -180 and 180.'
  return null
}

/** Convert a POWER JSON response into a list of daily records. -999 becomes null. */
export function parsePowerResponse(json) {
  const table = json?.properties?.parameter
  if (!table || typeof table !== 'object') throw new Error('NASA POWER returned no data table.')
  const names = Object.keys(table).filter((n) => FIELD_MAP[n])
  if (!names.length) throw new Error('NASA POWER returned none of the expected parameters.')
  const dates = Object.keys(table[names[0]]).sort()
  const stats = {}
  names.forEach((n) => (stats[n] = { valid: 0, total: dates.length }))

  const days = dates.map((d) => {
    const rec = {
      date: d,
      year: Number(d.slice(0, 4)),
      month: Number(d.slice(4, 6)),
      day: Number(d.slice(6, 8)),
    }
    names.forEach((n) => {
      const v = table[n][d]
      const ok = typeof v === 'number' && v !== FILL_VALUE && Number.isFinite(v)
      rec[FIELD_MAP[n]] = ok ? v : null
      if (ok) stats[n].valid += 1
    })
    return rec
  })

  const available = names
  const missingParams = [...CORE_PARAMS, ...OPTIONAL_PARAMS].filter((p) => !available.includes(p))
  // A parameter that exists but is entirely fill values is also treated as missing.
  const emptyParams = names.filter((n) => stats[n].valid === 0)
  const coreNames = CORE_PARAMS.filter((p) => available.includes(p))
  const validCore = coreNames.reduce((s, n) => s + stats[n].valid, 0)
  const totalCore = coreNames.reduce((s, n) => s + stats[n].total, 0)

  return {
    days,
    meta: {
      startYear: days.length ? days[0].year : null,
      endYear: days.length ? days[days.length - 1].year : null,
      dayCount: days.length,
      missingParams: [...missingParams, ...emptyParams],
      paramCompleteness: Object.fromEntries(
        names.map((n) => [n, stats[n].total ? stats[n].valid / stats[n].total : 0]),
      ),
      completeness: totalCore ? validCore / totalCore : 0,
      elevation: json?.geometry?.coordinates?.[2] ?? null,
    },
  }
}

const memoryCache = new Map()
const LS_PREFIX = 'powerCache:v1:'

function cacheKey(o) {
  return `${Number(o.lat).toFixed(2)},${Number(o.lon).toFixed(2)},${o.startYear}-${o.endYear}`
}

function readLocal(key) {
  try {
    const raw = globalThis.localStorage?.getItem(LS_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeLocal(key, value) {
  try {
    globalThis.localStorage?.setItem(LS_PREFIX + key, JSON.stringify(value))
  } catch {
    /* storage full or unavailable: ignore, memory cache still works */
  }
}

async function fetchJson(url, { timeoutMs, fetchImpl }) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`NASA POWER responded with status ${res.status}.`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch and parse POWER data. Retries on failure. Never returns fake data:
 * on failure it throws, and the UI decides whether to offer the labelled cached example.
 */
export async function fetchPower(opts, { retries = 2, timeoutMs = 90000, fetchImpl = globalThis.fetch } = {}) {
  const bad = validateLocation(opts.lat, opts.lon)
  if (bad) throw new Error(bad)
  const key = cacheKey(opts)
  if (memoryCache.has(key)) return { ...memoryCache.get(key), meta: { ...memoryCache.get(key).meta, origin: 'memory-cache' } }

  const local = readLocal(key)
  if (local) {
    const parsed = parsePowerResponse(local.json)
    parsed.meta = { ...parsed.meta, origin: 'browser-cache', fetchedAt: local.fetchedAt, lat: opts.lat, lon: opts.lon }
    memoryCache.set(key, parsed)
    return parsed
  }

  const url = buildUrl(opts)
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const json = await fetchJson(url, { timeoutMs, fetchImpl })
      const parsed = parsePowerResponse(json)
      const fetchedAt = new Date().toISOString()
      parsed.meta = { ...parsed.meta, origin: 'live', fetchedAt, lat: opts.lat, lon: opts.lon }
      memoryCache.set(key, parsed)
      writeLocal(key, { json, fetchedAt })
      return parsed
    } catch (e) {
      lastErr = e
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  const reason = lastErr?.name === 'AbortError' ? 'The request timed out.' : lastErr?.message
  throw new Error(`Could not get NASA POWER data. ${reason ?? ''}`.trim())
}

/** Load the pre-fetched real POWER response saved in public/data (clearly labelled in the UI). */
export async function loadCachedExample(url, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(url)
  if (!res.ok) throw new Error('The saved example data could not be loaded.')
  const json = await res.json()
  const parsed = parsePowerResponse(json)
  parsed.meta = {
    ...parsed.meta,
    origin: 'prefetched-example',
    fetchedAt: json?.header?.fetchedAt ?? '2026-11-14',
    lat: json?.geometry?.coordinates?.[1],
    lon: json?.geometry?.coordinates?.[0],
  }
  return parsed
}
