// SoilGrids (ISRIC World Soil Information, NOT a NASA source). Topsoil properties at 250 m, 0 to 30 cm.
// Throws when there is no usable value so the UI can fall back to the soil type dropdown.
// Verify variable names and units on https://www.isric.org/ before the demo: endpoints change.

const BASE = 'https://rest.isric.org/soilgrids/v2.0/properties/query'
export const SOIL_DEPTHS = [
  { label: '0-5cm', cm: 5 },
  { label: '5-15cm', cm: 10 },
  { label: '15-30cm', cm: 15 },
]
// Mapped units to usual units: sand and clay g/kg -> %, soc dg/kg -> g/kg, pH x10 -> pH.
const FACTOR = { sand: 10, clay: 10, soc: 10, phh2o: 10 }
export const NEARBY_STEP_DEG = 0.01 // about 1.1 km

export function buildSoilUrl(lat, lon) {
  const q = new URLSearchParams()
  q.set('lat', String(lat))
  q.set('lon', String(lon))
  Object.keys(FACTOR).forEach((p) => q.append('property', p))
  SOIL_DEPTHS.forEach((d) => q.append('depth', d.label))
  q.set('value', 'mean')
  return `${BASE}?${q.toString()}`
}

/** Thickness-weighted mean over the 0-30 cm layers, ignoring null layers. */
function layerMean(layer) {
  let sum = 0
  let weight = 0
  ;(layer.depths ?? []).forEach((d) => {
    const v = d?.values?.mean
    const cm = SOIL_DEPTHS.find((x) => x.label === d.label)?.cm ?? 0
    if (typeof v === 'number' && cm) {
      sum += v * cm
      weight += cm
    }
  })
  return weight ? sum / weight : null
}

export function parseSoilGrids(json) {
  const layers = json?.properties?.layers
  if (!Array.isArray(layers)) throw new Error('SoilGrids returned no layers.')
  const out = {}
  layers.forEach((layer) => {
    const m = FACTOR[layer.name] ? layerMean(layer) : null
    if (m != null) out[layer.name] = m / FACTOR[layer.name]
  })
  if (out.sand == null || out.clay == null) throw new Error('SoilGrids has no values at this exact point.')
  return { sandPct: out.sand, clayPct: out.clay, siltPct: Math.max(0, 100 - out.sand - out.clay), organicCarbonGkg: out.soc ?? null, pH: out.phh2o ?? null }
}

/** USDA texture class from sand and clay percentages. */
export function usdaTexture(sand, clay) {
  const silt = 100 - sand - clay
  if (silt + 1.5 * clay < 15) return 'sand'
  if (silt + 1.5 * clay < 30 && silt + 2 * clay >= 15) return 'loamy sand'
  if ((clay >= 7 && clay < 20 && sand > 52 && silt + 2 * clay >= 30) || (clay < 7 && silt < 50 && silt + 2 * clay >= 30)) return 'sandy loam'
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52) return 'loam'
  if ((silt >= 50 && clay >= 12 && clay < 27) || (silt >= 50 && silt < 80 && clay < 12)) return 'silt loam'
  if (silt >= 80 && clay < 12) return 'silt'
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return 'sandy clay loam'
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return 'clay loam'
  if (clay >= 27 && clay < 40 && sand <= 20) return 'silty clay loam'
  if (clay >= 35 && sand > 45) return 'sandy clay'
  if (clay >= 40 && silt >= 40) return 'silty clay'
  if (clay >= 40) return 'clay'
  return 'loam'
}

/** Map a USDA texture class to the dropdown soil types. */
export function suggestSoilType({ sandPct, clayPct }) {
  const t = usdaTexture(sandPct, clayPct)
  if (['sand', 'loamy sand', 'sandy loam'].includes(t)) return 'sandy'
  if (['clay', 'silty clay', 'sandy clay'].includes(t)) return 'clay'
  return 'loam'
}

/** Share of rain assumed usable by the crop, refined from texture. Documented in weights.json (soilData.rainEff). */
export function rainEfficiencyFromTexture({ sandPct, clayPct }, cfg) {
  const v = cfg.base + cfg.clayPerPct * (clayPct - cfg.clayRef) + cfg.sandPerPct * (sandPct - cfg.sandRef)
  return Math.min(cfg.max, Math.max(cfg.min, v))
}

async function queryPoint(lat, lon, { timeoutMs, fetchImpl, retries }) {
  let lastErr
  for (let a = 0; a <= retries; a += 1) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(buildSoilUrl(lat, lon), { signal: ctrl.signal })
      if (!res.ok) throw new Error(`SoilGrids responded with status ${res.status}.`)
      return parseSoilGrids(await res.json())
    } catch (e) {
      lastErr = e
      if (/no values/.test(e.message)) throw e // a real answer with no data: do not retry
      if (a < retries) await new Promise((r) => setTimeout(r, 1500))
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastErr
}

/**
 * Soil at the farm point. SoilGrids masks built-up land, water and ice, so when the exact point has no value
 * the four neighbouring points about 1 km away are tried and the result says so.
 */
export async function fetchSoil(lat, lon, { timeoutMs = 40000, fetchImpl = globalThis.fetch, retries = 1 } = {}) {
  const opts = { timeoutMs, fetchImpl, retries }
  const la = Number(lat)
  const lo = Number(lon)
  const finish = (props, offsetKm) => ({ ...props, texture: usdaTexture(props.sandPct, props.clayPct), suggestedType: suggestSoilType(props), nearbyKm: offsetKm, depth: '0 to 30 cm', source: 'SoilGrids (ISRIC, not NASA), about 250 m, modelled', fetchedAt: new Date().toISOString() })
  try {
    return finish(await queryPoint(la, lo, opts), 0)
  } catch (e) {
    if (!/no values/.test(e.message)) throw e
  }
  const s = NEARBY_STEP_DEG
  const neighbours = [[la + s, lo], [la, lo + s], [la - s, lo], [la, lo - s]]
  const tries = await Promise.allSettled(neighbours.map(([a, b]) => queryPoint(a, b, opts)))
  const hit = tries.find((t) => t.status === 'fulfilled')
  if (hit) return finish(hit.value, 1.1)
  throw new Error('SoilGrids has no soil values here or nearby (it leaves out built-up land, water and ice).')
}
