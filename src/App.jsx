import { useCallback, useMemo, useState } from 'react'
import crops from './data/crops.json'
import rotations from './data/rotations.json'
import soils from './data/soils.json'
import weights from './data/weights.json'
import { DEFAULT_PRIORITIES, WINDOW } from './defaults.js'
import { fetchPower, validateLocation } from './api/power.js'
import { fetchSoil } from './api/soilgrids.js'
import { fetchLayer, fetchLandCover } from './api/satellite.js'
import { fetchSlope } from './api/elevation.js'
import { buildContext } from './scoring/engine.js'
import { compareStrategies } from './scoring/planner.js'
import { buildCards } from './scoring/explain.js'
import LocationPicker from './components/LocationPicker.jsx'
import { FarmForm, Priorities, MAX_CUSTOM_CROPS } from './components/FarmForm.jsx'
import Results from './components/Results.jsx'
import { Footer, Header, Hero, Loading, Stepper } from './components/Shell.jsx'

const emptySlots = () => Array.from({ length: MAX_CUSTOM_CROPS }, () => ({ crop: '', sowMonth: 'auto', year: 0 }))

function slotsFromPreset(id) {
  const preset = rotations.baselinePresets.find((r) => r.id === id)
  const slots = emptySlots()
  preset?.crops.forEach((crop, i) => { if (i < slots.length) slots[i] = { crop, sowMonth: 'auto', year: preset.years?.[i] ?? 0 } })
  return slots
}

const initialFarm = { lat: '', lon: '', soilType: 'loam', waterSource: 'rainfed', waterAvailability: 'low', presetId: '', baselineCrops: emptySlots() }

export default function App() {
  const [farm, setFarm] = useState(initialFarm)
  const [priorities, setPriorities] = useState(DEFAULT_PRIORITIES)
  const [scenario, setScenario] = useState({ rainChangePct: 0, tempChangeC: 0 })
  const [data, setData] = useState({ status: 'idle', power: null, error: null })
  const [soil, setSoil] = useState({ status: 'idle', info: null })
  const [sat, setSat] = useState({ status: 'idle', raw: null, progress: { done: 0, total: 0 } })
  const [view, setView] = useState('wizard') // wizard | loading | results
  const [step, setStep] = useState(0)
  const [showHero, setShowHero] = useState(true)

  const patchFarm = useCallback((p) => setFarm((f) => ({ ...f, ...p })), [])
  const resetSat = () => setSat({ status: 'idle', raw: null, progress: { done: 0, total: 0 } })

  async function loadData(f = farm) {
    const bad = validateLocation(f.lat, f.lon)
    if (bad || f.lat === '' || f.lon === '') {
      setData({ status: 'error', power: null, error: bad ?? 'Choose a location first.' })
      setView('wizard')
      return setStep(0)
    }
    setShowHero(false)
    setView('loading')
    setData({ status: 'loading', power: null, error: null })
    resetSat()
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
      setView('results')
    } catch (e) {
      setData({ status: 'error', power: null, error: e.message })
      setView('wizard')
      setStep(2)
    }
  }

  async function loadSatellite() {
    const m = data.power?.meta
    if (!m) return
    const point = { lat: m.lat, lon: m.lon }
    const raw = { errors: {} }
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

  const onPreset = (id) => setFarm((f) => (id === 'custom' ? { ...f, presetId: 'custom' } : id === '' ? { ...f, presetId: '', baselineCrops: emptySlots() } : { ...f, presetId: id, baselineCrops: slotsFromPreset(id) }))

  const ctx = useMemo(() => {
    if (!data.power) return null
    const m = data.power.meta
    return buildContext({ power: data.power, farm: { ...farm, lat: m.lat ?? farm.lat, lon: m.lon ?? farm.lon }, crops, soils, weights, scenario, satellite: sat.raw })
  }, [data.power, farm.soilType, farm.waterSource, farm.waterAvailability, scenario, sat.raw])

  const result = useMemo(() => {
    if (!ctx) return null
    const baselineEntries = farm.baselineCrops.filter((s) => s.crop)
    if (!baselineEntries.length) return { error: 'Choose at least one crop for your current rotation (use "Edit soil, water and current rotation").', cards: [], skipped: [] }
    const comparison = compareStrategies({ baselineEntries, strategies: rotations.strategies, ctx, priorities })
    return buildCards({ comparison, ctx, priorities, soilInfo: soil.info })
  }, [ctx, farm.baselineCrops, priorities, soil.info])

  const locationOk = farm.lat !== '' && farm.lon !== '' && !validateLocation(farm.lat, farm.lon)
  const cropsOk = farm.baselineCrops.some((s) => s.crop)
  const canGo = (i) => i === 0 || (i === 1 && locationOk) || (i === 2 && locationOk && cropsOk)
  const goHome = () => {
    setView('wizard')
    setStep(0)
    setShowHero(true)
  }

  return (
    <div className="app">
      <Header onHome={goHome} showHome={view === 'results'} />
      <main id="main">
        {view === 'wizard' && showHero && step === 0 && <Hero onStart={() => setShowHero(false)} />}

        {view === 'wizard' && !showHero && (
          <div className="wizard">
            <Stepper step={step} onGo={setStep} canGo={canGo} />
            <div className="card-plain">
              {step === 0 && <LocationPicker farm={farm} onChange={patchFarm} />}
              {step === 1 && <FarmForm farm={farm} onChange={patchFarm} onPreset={onPreset} soilInfo={soil.info} soilStatus={soil.status} zone={ctx?.climate ?? null} />}
              {step === 2 && (
                <>
                  <Priorities priorities={priorities} onChange={(p) => setPriorities((cur) => ({ ...cur, ...p }))} />
                  {data.status === 'error' && (
                    <div className="error" role="alert">
                      <p><strong>We could not get the NASA data.</strong></p>
                      <p>{data.error}</p>
                      <p>Check your internet connection and try again. Nothing is shown in place of real data.</p>
                      <button type="button" className="secondary" onClick={() => loadData()}>Try again</button>
                    </div>
                  )}
                </>
              )}
              <div className="nav">
                <button type="button" className="ghost" onClick={() => (step === 0 ? goHome() : setStep(step - 1))}>Back</button>
                {step < 2 ? (
                  <button type="button" className="primary" onClick={() => setStep(step + 1)} disabled={!canGo(step + 1)}>
                    Next
                  </button>
                ) : (
                  <button type="button" className="primary" onClick={() => loadData()} disabled={!canGo(2)}>
                    Show my recommendations
                  </button>
                )}
              </div>
              {step === 0 && !locationOk && <p className="hint" aria-live="polite">Choose a spot on the map, search for a place, or type coordinates to continue.</p>}
              {step === 1 && !cropsOk && <p className="hint" aria-live="polite">Choose at least one crop that you grow now.</p>}
            </div>
          </div>
        )}

        {view === 'loading' && <Loading stage={1} />}

        {view === 'results' && data.status === 'ok' && ctx && result && (
          <Results
            ctx={ctx}
            result={result}
            power={data.power}
            farm={farm}
            onFarm={patchFarm}
            onPreset={onPreset}
            priorities={priorities}
            onPriorities={(p) => setPriorities((cur) => ({ ...cur, ...p }))}
            scenario={scenario}
            setScenario={setScenario}
            soil={soil}
            sat={sat}
            onLoadSat={loadSatellite}
            onChangeLocation={() => { setView('wizard'); setStep(0); setShowHero(false) }}
            onPrint={() => window.print()}
          />
        )}
      </main>
      <Footer />
    </div>
  )
}
