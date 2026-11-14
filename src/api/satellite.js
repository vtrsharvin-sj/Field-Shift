// NASA satellite layers at the farm point, via the ORNL DAAC MODIS/VIIRS web service (free, no login, CORS enabled).
// https://modis.ornl.gov/rst/api/v1/  Each request may cover at most 10 composites, so long series are fetched in chunks.
// Verify product and band names on the ORNL DAAC page before the demo: they can change.

export const ORNL_BASE = 'https://modis.ornl.gov/rst/api/v1'

export const LAYERS = {
  ndvi: { label: 'MODIS NDVI (MOD13Q1)', product: 'MOD13Q1', bands: ['250m_16_days_NDVI'], period: 16, resolution: '250 m, 16-day', years: [2023, 2024], isFill: (v) => v <= -3000 },
  et: { label: 'MODIS evapotranspiration (MOD16A2GF)', product: 'MOD16A2GF', bands: ['ET_500m', 'PET_500m'], period: 8, resolution: '500 m, 8-day', years: [2024], isFill: (v) => v >= 32761 || v < 0 },
  lst: { label: 'MODIS land surface temperature (MOD11A2)', product: 'MOD11A2', bands: ['LST_Day_1km'], period: 8, resolution: '1 km, 8-day', years: [2024], isFill: (v) => v === 0 },
}

const pad3 = (n) => String(n).padStart(3, '0')

/** Date-range chunks of at most 10 composites for one year. Returns [{startDate, endDate}] in MODIS format (A + year + day of year). */
export function chunkYear(year, period) {
  const doys = []
  for (let d = 1; d <= 365; d += period) doys.push(d)
  const chunks = []
  for (let i = 0; i < doys.length; i += 10) {
    const group = doys.slice(i, i + 10)
    chunks.push({ startDate: `A${year}${pad3(group[0])}`, endDate: `A${year}${pad3(group[group.length - 1])}` })
  }
  return chunks
}

export function buildSubsetUrl({ product, band, lat, lon, startDate, endDate }) {
  const q = new URLSearchParams({ latitude: String(lat), longitude: String(lon), band, startDate, endDate, kmAboveBelow: '0', kmLeftRight: '0' })
  return `${ORNL_BASE}/${product}/subset?${q.toString()}`
}

/** Convert one ORNL subset response to [{date, value}] with fill values as null. */
export function parseSubset(json, isFill) {
  const scale = Number(json?.scale)
  const k = Number.isFinite(scale) && scale !== 0 ? scale : 1
  if (!Array.isArray(json?.subset)) throw new Error('The satellite service returned no data table.')
  return json.subset.map((s) => {
    const raw = Array.isArray(s.data) ? s.data[0] : null
    const ok = typeof raw === 'number' && !isFill(raw)
    return { date: s.calendar_date, value: ok ? raw * k : null }
  })
}

async function getJson(url, { timeoutMs, fetchImpl, retries }) {
  let lastErr
  for (let a = 0; a <= retries; a += 1) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, { signal: ctrl.signal })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`Satellite service responded with status ${res.status}. ${body.slice(0, 120)}`)
      }
      return await res.json()
    } catch (e) {
      lastErr = e
      if (a < retries) await new Promise((r) => setTimeout(r, 1500 * (a + 1)))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

/** Run async tasks with limited concurrency. Each task result is { ok, value | error }. */
export async function runPool(tasks, limit, onDone = () => {}) {
  const results = new Array(tasks.length)
  let next = 0
  const worker = async () => {
    while (next < tasks.length) {
      const i = next
      next += 1
      try {
        results[i] = { ok: true, value: await tasks[i]() }
      } catch (e) {
        results[i] = { ok: false, error: e.message }
      }
      onDone(i, results[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

/**
 * Fetch one layer as { [band]: [{date, value}] }. Partial results are kept: failed chunks are counted in `failedChunks`.
 * Throws only if every chunk failed.
 */
export async function fetchLayer(key, { lat, lon }, { concurrency = 4, timeoutMs = 120000, retries = 1, fetchImpl = globalThis.fetch, onProgress = () => {} } = {}) {
  const L = LAYERS[key]
  const jobs = []
  L.bands.forEach((band) => L.years.forEach((year) => chunkYear(year, L.period).forEach((c) => jobs.push({ band, ...c }))))
  let done = 0
  onProgress(0, jobs.length)
  const results = await runPool(
    jobs.map((j) => async () => parseSubset(await getJson(buildSubsetUrl({ product: L.product, lat, lon, ...j }), { timeoutMs, fetchImpl, retries }), L.isFill)),
    concurrency,
    () => onProgress(++done, jobs.length),
  )
  const series = Object.fromEntries(L.bands.map((b) => [b, []]))
  let failed = 0
  let lastError = null
  results.forEach((r, i) => {
    if (r.ok) series[jobs[i].band].push(...r.value)
    else {
      failed += 1
      lastError = r.error
    }
  })
  if (failed === jobs.length) throw new Error(lastError ?? 'The satellite service did not answer.')
  Object.values(series).forEach((s) => s.sort((a, b) => a.date.localeCompare(b.date)))
  return { series, failedChunks: failed, totalChunks: jobs.length, years: L.years, resolution: L.resolution, label: L.label, fetchedAt: new Date().toISOString() }
}

/** MODIS land cover class (IGBP) at the point for the latest available year. */
export async function fetchLandCover({ lat, lon }, { fetchImpl = globalThis.fetch, timeoutMs = 90000, retries = 1 } = {}) {
  const year = 2022
  const url = buildSubsetUrl({ product: 'MCD12Q1', band: 'LC_Type1', lat, lon, startDate: `A${year}001`, endDate: `A${year}001` })
  const json = await getJson(url, { timeoutMs, fetchImpl, retries })
  const cls = json?.subset?.[0]?.data?.[0]
  if (typeof cls !== 'number' || cls === 255) throw new Error('No land cover class at this point.')
  return { igbpClass: cls, year, resolution: '500 m, yearly', label: 'MODIS land cover (MCD12Q1)', fetchedAt: new Date().toISOString() }
}
