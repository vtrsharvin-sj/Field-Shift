// NASA POWER daily point API client.
// Pure helpers (buildUrl, parsePowerResponse) are separated from the network call.

export const POWER_BASE = 'https://power.larc.nasa.gov/api/temporal/daily/point'
export const CORE_PARAMS = ['T2M', 'T2M_MAX', 'T2M_MIN', 'PRECTOTCORR', 'RH2M', 'ALLSKY_SFC_SW_DWN']
export const OPTIONAL_PARAMS = ['GWETTOP', 'GWETROOT', 'EVPTRNS', 'IMERG_PRECTOT']
export const FILL_VALUE = -999

const FIELD_MAP = {
  T2M: 't2m',
  T2M_MAX: 'tmax',
  T2M_MIN: 'tmin',
  PRECTOTCORR: 'rainPower',
  RH2M: 'rh',
  ALLSKY_SFC_SW_DWN: 'rad',
  GWETTOP: 'gwettop',
  GWETROOT: 'gwetroot',
  EVPTRNS: 'evptrns',
  IMERG_PRECTOT: 'gpmRain',
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
    // IMERG is only served in UTC. High resolution selects the SMAP source for
    // matching soil-moisture parameters (POWER falls back outside its domain).
    'time-standard': 'UTC',
    'high-resolution': 'true',
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
    // GPM IMERG (~10 km) drives rainfall analysis where available. Keep the
    // coarser POWER precipitation as a per-day fallback for any masked gaps.
    rec.rain = rec.gpmRain ?? rec.rainPower ?? null
    // In high-resolution mode POWER substitutes SMAP L4 root-zone wetness
    // after 2015; the earlier portion is not SMAP and is excluded downstream.
    rec.smapRootZone = rec.year >= 2015 ? (rec.gwetroot ?? null) : null
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
      gpmCoverage: stats.IMERG_PRECTOT?.total ? stats.IMERG_PRECTOT.valid / stats.IMERG_PRECTOT.total : 0,
      smapCoverage: days.some((d) => d.year >= 2015) ? days.filter((d) => d.year >= 2015 && d.smapRootZone != null).length / days.filter((d) => d.year >= 2015).length : 0,
      completeness: totalCore ? validCore / totalCore : 0,
      elevation: json?.geometry?.coordinates?.[2] ?? null,
    },
  }
}

function applySmapCoverage(parsed, lat) {
  if (Math.abs(Number(lat)) > 84.66) {
    // Outside SMAP L4's latitude range, POWER may return a fallback wetness
    // source. Do not present it as SMAP evidence or use it in the score.
    parsed.days.forEach((day) => { day.smapRootZone = null })
    parsed.meta.smapCoverage = 0
  }
  return parsed
}

const memoryCache = new Map()
const LS_PREFIX = 'powerCache:v3:'

const DATASET_SCHEMA = 'fieldshift.nasa-power.daily.v1'
const OFFLINE_DB = 'fieldshift-offline-v1'

function cacheKey(o) {
  const smapDomain = Math.abs(Number(o.lat)) <= 84.66 ? 'smap-domain' : 'outside-smap-domain'
  return `${Number(o.lat).toFixed(2)},${Number(o.lon).toFixed(2)},${o.startYear}-${o.endYear}:${smapDomain}`
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
    return true
  } catch {
    /* storage full or unavailable: ignore, memory cache still works */
    return false
  }
}

function openOfflineDb() {
  if (!globalThis.indexedDB) return Promise.resolve(null)
  return new Promise((resolve) => {
    const req = globalThis.indexedDB.open(OFFLINE_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('datasets')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })
}

async function readIndexedDataset(key) {
  const db = await openOfflineDb()
  if (!db) return null
  return new Promise((resolve) => {
    const req = db.transaction('datasets', 'readonly').objectStore('datasets').get(key)
    req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
    req.onerror = () => { db.close(); resolve(null) }
  })
}

async function writeIndexedDataset(key, value) {
  const db = await openOfflineDb()
  if (!db) return false
  return new Promise((resolve) => {
    const tx = db.transaction('datasets', 'readwrite')
    tx.objectStore('datasets').put(value, key)
    tx.oncomplete = () => { db.close(); resolve(true) }
    tx.onerror = () => { db.close(); resolve(false) }
    tx.onabort = () => { db.close(); resolve(false) }
  })
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
 * on failure it throws and the UI shows the error.
 */
export async function fetchPower(opts, { retries = 2, timeoutMs = 90000, fetchImpl = globalThis.fetch } = {}) {
  const bad = validateLocation(opts.lat, opts.lon)
  if (bad) throw new Error(bad)
  const key = cacheKey(opts)
  if (memoryCache.has(key)) return { ...memoryCache.get(key), meta: { ...memoryCache.get(key).meta, origin: 'memory-cache' } }

  // Prefer IndexedDB imports (which may be newer than an older localStorage snapshot).
  const local = (await readIndexedDataset(key)) ?? readLocal(key)
  if (local) {
    if (local.dataset) {
      const dataset = validateOfflineDataset(local.dataset)
      if (dataset && Number(dataset.location.lat).toFixed(2) === Number(opts.lat).toFixed(2) && Number(dataset.location.lon).toFixed(2) === Number(opts.lon).toFixed(2)) {
        const parsed = { days: dataset.days, meta: { ...dataset.meta, origin: 'offline-dataset', fetchedAt: dataset.exportedAt, lat: dataset.location.lat, lon: dataset.location.lon } }
        memoryCache.set(key, parsed)
        return parsed
      }
    }
    if (local.json) {
      const parsed = applySmapCoverage(parsePowerResponse(local.json), opts.lat)
      parsed.meta = { ...parsed.meta, origin: 'browser-cache', fetchedAt: local.fetchedAt, lat: opts.lat, lon: opts.lon, requestStartYear: opts.startYear, requestEndYear: opts.endYear }
      memoryCache.set(key, parsed)
      return parsed
    }
  }

  const url = buildUrl(opts)
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const json = await fetchJson(url, { timeoutMs, fetchImpl })
      const parsed = parsePowerResponse(json)
      const inCoverage = applySmapCoverage(parsed, opts.lat)
      const fetchedAt = new Date().toISOString()
      inCoverage.meta = { ...inCoverage.meta, origin: 'live', fetchedAt, lat: opts.lat, lon: opts.lon, requestStartYear: opts.startYear, requestEndYear: opts.endYear }
      memoryCache.set(key, inCoverage)
      writeLocal(key, { json, fetchedAt })
      return inCoverage
    } catch (e) {
      lastErr = e
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  const reason = lastErr?.name === 'AbortError' ? 'The request timed out.' : lastErr?.message
  throw new Error(`Could not get NASA POWER data. ${reason ?? ''}`.trim())
}

/** Portable, point-specific offline package. It keeps NASA's source values and metadata intact. */
export function exportOfflineDataset(power) {
  if (!power?.days?.length || !Number.isFinite(Number(power.meta?.lat)) || !Number.isFinite(Number(power.meta?.lon))) {
    throw new Error('There is no location-specific NASA POWER dataset to export yet.')
  }
  return {
    schema: DATASET_SCHEMA,
    title: 'FieldShift offline NASA POWER daily dataset',
    exportedAt: new Date().toISOString(),
    source: 'NASA POWER Daily Point API (Agroclimatology community)',
    sourceUrl: POWER_BASE,
    methodology: 'Original point time series from the selected coordinates. GPM IMERG and SMAP values are retained only when present in the NASA POWER response. This package is a local offline copy, not a forecast.',
    location: { lat: power.meta.lat, lon: power.meta.lon },
    meta: { ...power.meta, origin: 'offline-dataset' },
    days: power.days,
  }
}

/** Reject wrong-schema, empty, mismatched, or implausibly short files before caching. */
export function validateOfflineDataset(data) {
  if (data?.schema !== DATASET_SCHEMA || !Array.isArray(data.days) || data.days.length < 360) return null
  const lat = Number(data.location?.lat)
  const lon = Number(data.location?.lon)
  const start = Number(data.meta?.requestStartYear ?? data.meta?.startYear)
  const end = Number(data.meta?.requestEndYear ?? data.meta?.endYear)
  if (!validateLocation(lat, lon) && Number.isInteger(start) && Number.isInteger(end) && end >= start) {
    const validDay = data.days.every((d) => d && Number.isInteger(d.year) && Number.isInteger(d.month) && d.month >= 1 && d.month <= 12 && Number.isInteger(d.day) && d.day >= 1 && d.day <= 31 && (Number.isFinite(d.rain) || d.rain == null))
    if (!validDay) return null
    return { ...data, location: { lat, lon }, meta: { ...data.meta, startYear: data.meta.startYear ?? start, endYear: data.meta.endYear ?? end, requestStartYear: start, requestEndYear: end } }
  }
  return null
}

/** Import an exported package into this browser's offline cache for the same point and requested years. */
export async function importOfflineDataset(data, expected = {}) {
  const dataset = validateOfflineDataset(data)
  if (!dataset) throw new Error('This is not a valid FieldShift NASA POWER dataset. Choose a JSON file exported from FieldShift.')
  if (expected.lat != null && (Number(dataset.location.lat).toFixed(2) !== Number(expected.lat).toFixed(2) || Number(dataset.location.lon).toFixed(2) !== Number(expected.lon).toFixed(2))) {
    throw new Error('This dataset belongs to a different location. Export the dataset from the farm you want to analyze.')
  }
  if (expected.startYear != null && (dataset.meta.requestStartYear !== Number(expected.startYear) || dataset.meta.requestEndYear !== Number(expected.endYear))) {
    throw new Error('This dataset covers a different date range. Download a fresh copy for this analysis.')
  }
  const key = cacheKey({ lat: dataset.location.lat, lon: dataset.location.lon, startYear: dataset.meta.requestStartYear, endYear: dataset.meta.requestEndYear })
  const cached = { dataset, fetchedAt: dataset.exportedAt }
  const stored = await writeIndexedDataset(key, cached)
  if (!stored && !writeLocal(key, cached)) throw new Error('This browser could not save the offline dataset. Check browser storage settings and try again.')
  memoryCache.delete(key)
  return { days: dataset.days, meta: { ...dataset.meta, origin: 'offline-dataset', fetchedAt: dataset.exportedAt, lat: dataset.location.lat, lon: dataset.location.lon } }
}
