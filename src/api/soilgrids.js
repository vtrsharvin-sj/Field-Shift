// SoilGrids (ISRIC, NOT a NASA source). Returns topsoil properties, or throws so the UI can fall back to the dropdown.
// Verify variable names and units on https://www.isric.org/ before the demo: endpoints change.

const BASE = 'https://rest.isric.org/soilgrids/v2.0/properties/query'

export function buildSoilUrl(lat, lon) {
  const q = new URLSearchParams()
  q.set('lat', String(lat))
  q.set('lon', String(lon))
  ;['sand', 'clay', 'soc', 'phh2o'].forEach((p) => q.append('property', p))
  ;['0-5cm', '5-15cm'].forEach((d) => q.append('depth', d))
  q.set('value', 'mean')
  return `${BASE}?${q.toString()}`
}

// Conversion factors from SoilGrids mapped units: sand/clay g/kg -> %, soc dg/kg -> g/kg, pH x10 -> pH.
const FACTOR = { sand: 10, clay: 10, soc: 10, phh2o: 10 }

export function parseSoilGrids(json) {
  const layers = json?.properties?.layers
  if (!Array.isArray(layers)) throw new Error('SoilGrids returned no layers.')
  const out = {}
  layers.forEach((layer) => {
    const vals = (layer.depths ?? []).map((d) => d?.values?.mean).filter((v) => typeof v === 'number')
    if (vals.length && FACTOR[layer.name]) out[layer.name] = vals.reduce((a, b) => a + b, 0) / vals.length / FACTOR[layer.name]
  })
  if (out.sand == null || out.clay == null) throw new Error('SoilGrids had no sand/clay values here.')
  return { sandPct: out.sand, clayPct: out.clay, organicCarbonGkg: out.soc ?? null, pH: out.phh2o ?? null }
}

/** Suggest a dropdown soil type from sand/clay percentages (simple documented rule). */
export function suggestSoilType({ sandPct, clayPct }) {
  if (clayPct >= 40) return 'clay'
  if (sandPct >= 60) return 'sandy'
  return 'loam'
}

export async function fetchSoil(lat, lon, { timeoutMs = 20000, fetchImpl = globalThis.fetch } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(buildSoilUrl(lat, lon), { signal: ctrl.signal })
    if (!res.ok) throw new Error(`SoilGrids responded with status ${res.status}.`)
    const props = parseSoilGrids(await res.json())
    return { ...props, suggestedType: suggestSoilType(props), source: 'SoilGrids (ISRIC, not NASA), about 250 m', fetchedAt: new Date().toISOString() }
  } finally {
    clearTimeout(timer)
  }
}
