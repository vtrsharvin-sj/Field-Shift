import { useCallback, useMemo, useState } from 'react'
import crops from './data/crops.json'
import rotations from './data/rotations.json'
import soils from './data/soils.json'
import weights from './data/weights.json'
import { DISCLAIMER } from './data/glossary.js'
import { CACHED_EXAMPLE_URL, DEMO_FARM, DEMO_PRIORITIES, WINDOW } from './demo.js'
import { fetchPower, loadCachedExample, validateLocation } from './api/power.js'
import { fetchSoil } from './api/soilgrids.js'
import { fetchLayer, fetchLandCover } from './api/satellite.js'
import { fetchSlope } from './api/elevation.js'
import SatelliteSection from './components/SatelliteSection.jsx'
import { buildContext, compareStrategies } from './scoring/engine.js'
import { buildCards } from './scoring/explain.js'
import LocationPicker from './components/LocationPicker.jsx'
import { FarmForm, Priorities, MAX_CUSTOM_CROPS } from './components/FarmForm.jsx'
import ClimateSnapshot from './components/ClimateSnapshot.jsx'
import RotationCards from './components/RotationCards.jsx'
import About from './components/About.jsx'

const emptyCustom = Array.from({ length: MAX_CUSTOM_CROPS }, () => ({ crop: '', sowMonth: 6 }))
const initialFarm = { lat: '', lon: '', soilType: 'loam', waterSource: 'rainfed', waterAvailability: 'low', baselineId: 'maize-fallow', customCrops: emptyCustom }

function baselineFrom(farm) {
  if (farm.baselineId === 'custom') {
    const chosen = farm.customCrops.filter((c) => c.crop)
    return { id: 'custom', name: 'Your own rotation', crops: chosen.map((c) => ({ crop: c.crop, sowMonth: c.sowMonth })) }
  }
  return rotations.baselinePresets.find((r) => r.id === farm.baselineId)
}

export default function App() {
  const [farm, setFarm] = useState(initialFarm)
  const [priorities, setPriorities] = useState({ water: 5, income: 5, soil: 5, erosion: 5 })
  const [scenario, setScenario] = useState({ rainChangePct: 0, tempChangeC: 0 })
  const [data, setData] = useState({ status: 'idle', power: null, error: null })
  const [soil, setSoil] = useState({ status: 'idle', info: null })
  const [sat, setSat] = useState({ status: 'idle', raw: null, progress: { done: 0, total: 0 } })

  const patchFarm = useCallback((p) => setFarm((f) => ({ ...f, ...p })), [])

  async function loadData(f = farm) {
    const bad = validateLocation(f.lat, f.lon)
    if (bad) return setData({ status: 'error', power: null, error: bad })
    setData({ status: 'loading', power: null, error: null })
    setSat({ status: 'idle', raw: null, progress: { done: 0, total: 0 } })
    setSoil({ status: 'loading', info: null })
    fetchSoil(f.lat, f.lon)
      .then((info) => {
        setSoil({ status: 'ok', info })
        setFarm((cur) => ({ ...cur, soilType: soils.types.some((s) => s.id === info.suggestedType) ? info.suggestedType : cur.soilType }))
      })
      .catch(() => setSoil({ status: 'error', info: null }))
    try {
      const power = await fetchPower({ lat: f.lat, lon: f.lon, ...WINDOW })
      setData({ status: 'ok', power, error: null })
    } catch (e) {
      setData({ status: 'error', power: null, error: e.message })
    }
  }

  async function useExample() {
    setData({ status: 'loading', power: null, error: null })
    setSat({ status: 'idle', raw: null, progress: { done: 0, total: 0 } })
    try {
      const power = await loadCachedExample(CACHED_EXAMPLE_URL)
      setData({ status: 'ok', power, error: null })
    } catch (e) {
      setData({ status: 'error', power: null, error: e.message })
    }
  }

  async function loadSatellite() {
    const m = data.power?.meta
    if (!m) return
    const point = { lat: m.lat, lon: m.lon }
    const raw = { errors: {} }
    // 3 layers x chunked requests + land cover + slope
    const totals = { ndvi: [0, 0], et: [0, 0], lst: [0, 0] }
    const report = () => setSat((s) => ({ ...s, progress: { done: Object.values(totals).reduce((a, t) => a + t[0], 0), total: Object.values(totals).reduce((a, t) => a + t[1], 0) } }))
    setSat({ status: 'loading', raw: null, progress: { done: 0, total: 0 } })
    const tracked = (key) => fetchLayer(key, point, { concurrency: 3, onProgress: (d, t) => { totals[key] = [d, t]; report() } })
    const jobs = [
      ['ndvi', tracked('ndvi')],
      ['et', tracked('et')],
      ['lst', tracked('lst')],
      ['landCover', fetchLandCover(point)],
      ['slope', fetchSlope(m.lat, m.lon, weights.satellite.slopeClasses)],
    ]
    const settled = await Promise.allSettled(jobs.map((j) => j[1]))
    settled.forEach((r, i) => {
      const key = jobs[i][0]
      if (r.status === 'fulfilled') raw[key] = r.value
      else raw.errors[key] = r.reason?.message?.slice(0, 120) ?? 'failed'
    })
    setSat((s) => ({ ...s, status: 'ok', raw }))
  }

  function useDemo() {
    const f = { ...farm, ...DEMO_FARM }
    setFarm(f)
    setPriorities(DEMO_PRIORITIES)
    loadData(f)
  }

  const ctx = useMemo(() => {
    if (!data.power) return null
    const m = data.power.meta
    return buildContext({ power: data.power, farm: { ...farm, lat: m.lat ?? farm.lat, lon: m.lon ?? farm.lon }, crops, soils, weights, scenario, satellite: sat.raw })
  }, [data.power, farm.soilType, farm.waterSource, farm.waterAvailability, scenario, sat.raw])

  const result = useMemo(() => {
    if (!ctx) return null
    const baseline = baselineFrom(farm)
    const comparison = compareStrategies({ baseline, strategies: rotations.strategies, ctx, priorities })
    return buildCards({ comparison, ctx, priorities, soilInfo: soil.info })
  }, [ctx, farm.baselineId, farm.customCrops, priorities, soil.info])

  const moved = data.power && data.power.meta.origin !== 'prefetched-example' && (Number(farm.lat).toFixed(2) !== Number(data.power.meta.lat).toFixed(2) || Number(farm.lon).toFixed(2) !== Number(data.power.meta.lon).toFixed(2))

  return (
    <main>
      <header className="top">
        <h1>Crop Rotation Helper</h1>
        <p>Compare crop rotations for your farm using NASA climate data.</p>
        <p className="disclaimer" role="note">{DISCLAIMER}</p>
      </header>

      <LocationPicker farm={farm} onChange={patchFarm} onUseDemo={useDemo} />
      <FarmForm farm={farm} onChange={patchFarm} soilInfo={soil.info} soilStatus={soil.status} />
      <Priorities priorities={priorities} onChange={(p) => setPriorities((cur) => ({ ...cur, ...p }))} />

      <section className="fetch" aria-live="polite">
        <button type="button" className="primary" onClick={() => loadData()} disabled={data.status === 'loading'}>
          {data.status === 'loading' ? 'Getting NASA data (this can take up to a minute)...' : 'Get NASA data and compare rotations'}
        </button>
        {moved && <p className="note">The location changed since the last download. Press the button again to update.</p>}
        {data.status === 'error' && (
          <div className="error" role="alert">
            <p>{data.error}</p>
            <p>You can try again, or use the saved example for the Coimbatore demo farm. The example is real NASA POWER data downloaded earlier and is clearly labelled as such.</p>
            <button type="button" className="secondary" onClick={useExample}>
              Use saved example data (Coimbatore)
            </button>
          </div>
        )}
      </section>

      {data.status === 'ok' && ctx && result && (
        <>
          <ClimateSnapshot ctx={ctx} power={data.power} />
          <SatelliteSection ctx={ctx} status={sat.status} progress={sat.progress} errors={sat.raw?.errors ?? {}} onLoad={loadSatellite} />
          <section aria-labelledby="scen-h" className="scenario">
            <h2 id="scen-h">What if the climate changes? (optional)</h2>
            <label className="slider">
              <span><strong>Rainfall change</strong>: {scenario.rainChangePct > 0 ? '+' : ''}{scenario.rainChangePct}%</span>
              <input type="range" min={weights.scenario.rainChangeRangePct[0]} max={weights.scenario.rainChangeRangePct[1]} step="5" value={scenario.rainChangePct} onChange={(e) => setScenario((s) => ({ ...s, rainChangePct: Number(e.target.value) }))} />
            </label>
            <label className="slider">
              <span><strong>Warming</strong>: +{scenario.tempChangeC} C</span>
              <input type="range" min={weights.scenario.tempChangeRangeC[0]} max={weights.scenario.tempChangeRangeC[1]} step="0.5" value={scenario.tempChangeC} onChange={(e) => setScenario((s) => ({ ...s, tempChangeC: Number(e.target.value) }))} />
            </label>
            <p className="note">A what-if test on top of the real record (all rain values multiplied, all temperatures shifted). It is not a forecast, and it lowers confidence.</p>
          </section>
          <RotationCards result={result} priorities={priorities} />
          <p className="print-row">
            <button type="button" className="secondary" onClick={() => window.print()}>Save or print this page as PDF</button>
          </p>
        </>
      )}

      <About />
      <footer>
        <p>{DISCLAIMER}</p>
      </footer>
    </main>
  )
}
