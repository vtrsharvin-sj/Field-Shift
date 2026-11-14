// Slope at the farm point from a 3 x 3 grid of elevations.
// NOTE: this is NOT NASA SRTM. Free SRTM services have no browser access (no CORS) or need a key, so the Open-Meteo
// elevation service (Copernicus DEM, ESA, about 90 m) is used instead and labelled as non-NASA.

const BASE = 'https://api.open-meteo.com/v1/elevation'
export const STEP_DEG = 0.002 // about 220 m

/** 3 x 3 grid of points around the centre, row 0 = north. */
export function gridPoints(lat, lon, step = STEP_DEG) {
  const pts = []
  for (let r = -1; r <= 1; r += 1) for (let c = -1; c <= 1; c += 1) pts.push({ lat: lat - r * step, lon: lon + c * step })
  return pts
}

/** Slope in percent by Horn's method. z is 9 elevations in row-major order, north row first. */
export function slopePercent(z, latDeg, step = STEP_DEG) {
  const dy = step * 111320
  const dx = step * 111320 * Math.cos((latDeg * Math.PI) / 180)
  const [a, b, c, d, , f, g, h, i] = z
  const dzdx = (c + 2 * f + i - (a + 2 * d + g)) / (8 * dx)
  const dzdy = (g + 2 * h + i - (a + 2 * b + c)) / (8 * dy)
  return Math.sqrt(dzdx ** 2 + dzdy ** 2) * 100
}

export function slopeClass(pct, classes) {
  return classes.find((c) => c.maxPct == null || pct < c.maxPct)
}

export async function fetchSlope(lat, lon, classes, { fetchImpl = globalThis.fetch, timeoutMs = 20000 } = {}) {
  const pts = gridPoints(Number(lat), Number(lon))
  const q = new URLSearchParams({ latitude: pts.map((p) => p.lat.toFixed(5)).join(','), longitude: pts.map((p) => p.lon.toFixed(5)).join(',') })
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${BASE}?${q.toString()}`, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`Elevation service responded with status ${res.status}.`)
    const z = (await res.json()).elevation
    if (!Array.isArray(z) || z.length !== 9 || z.some((v) => typeof v !== 'number')) throw new Error('Elevation service returned no values.')
    const pct = slopePercent(z, Number(lat))
    const cls = slopeClass(pct, classes)
    return { slopePct: pct, classLabel: cls.label, penalty: cls.penalty, elevationM: z[4], source: 'Copernicus DEM via Open-Meteo (ESA, not NASA SRTM), about 90 m', fetchedAt: new Date().toISOString() }
  } finally {
    clearTimeout(timer)
  }
}
