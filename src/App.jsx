import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import crops from './data/crops.json'
import rotations from './data/rotations.json'
import soils from './data/soils.json'
import weights from './data/weights.json'
import { DEFAULT_PRIORITIES, WINDOW } from './defaults.js'
import { fetchPower, importOfflineDataset, validateLocation } from './api/power.js'
import { fetchSoil } from './api/soilgrids.js'
import { fetchSatelliteBundle } from './api/satellite.js'
import { fetchLocalCrops } from './api/localCrops.js'
import { fetchGlobalCropCalendar } from './api/globalCropCalendar.js'
import { buildContext } from './scoring/engine.js'
import { compareStrategies } from './scoring/planner.js'
import { buildCards } from './scoring/explain.js'
import { FarmForm, Priorities, MAX_CUSTOM_CROPS } from './components/FarmForm.jsx'
import { Footer, Header, Hero, Loading, Stepper } from './components/Shell.jsx'

const LocationPicker = lazy(() => import('./components/LocationPicker.jsx'))
const Results = lazy(() => import('./components/Results.jsx'))

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
  const [local, setLocal] = useState({ status: 'idle', data: null, key: '' })
  const [calendar, setCalendar] = useState({ status: 'idle', data: null })
  const calendarRequest = useRef(0)
  const [view, setView] = useState('wizard') // wizard | loading | results
  const [step, setStep] = useState(0)
  const [showHero, setShowHero] = useState(true)
  const [offlineImportMessage, setOfflineImportMessage] = useState('')

  // What is grown around the farm (text about the area). Starts when the location is confirmed so the crop lists in step 2 are already smart.
  async function loadLocal(lat, lon) {
    const key = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`
    if (local.key === key && local.status !== 'idle') return
    setLocal({ status: 'loading', data: null, key })
    try {
      const data = await fetchLocalCrops(Number(lat), Number(lon), crops, weights.localCrops)
      setLocal((cur) => (cur.key === key ? { status: 'ok', data, key } : cur))
    } catch (e) {
      setLocal((cur) => (cur.key === key ? { status: 'ok', data: { available: false, reason: e.message }, key } : cur))
    }
  }

  async function loadCropCalendar(lat, lon) {
    const id = ++calendarRequest.current
    setCalendar({ status: 'loading', data: null })
    try {
      const data = await fetchGlobalCropCalendar(lat, lon)
      if (id === calendarRequest.current) setCalendar({ status: 'ok', data })
    } catch (error) {
      if (id === calendarRequest.current) setCalendar({ status: 'error', data: null, error: error.message })
    }
  }

  function goToStep(next) {
    if (next === 1) {
      void loadLocal(farm.lat, farm.lon)
      void loadCropCalendar(farm.lat, farm.lon)
    }
    setStep(next)
  }

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
    loadLocal(f.lat, f.lon)
    runId.current += 1
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
      loadSatellite({ point: power.meta, id: runId.current })
    } catch (e) {
      setData({ status: 'error', power: null, error: e.message })
      setView('wizard')
      setStep(2)
    }
  }

  async function usePreparedOfflineDataset() {
    try {
      setOfflineImportMessage('Loading the prepared NASA record…')
      const response = await fetch(`${import.meta.env.BASE_URL}data/fieldshift-nasa-power-vtr-weaving-mills-2005-2026.json`)
      if (!response.ok) throw new Error('The prepared dataset could not be downloaded. Check your connection and try again.')
      const dataset = await response.json()
      await importOfflineDataset(dataset, { lat: farm.lat, lon: farm.lon, startYear: WINDOW.startYear, endYear: WINDOW.endYear })
      setOfflineImportMessage('NASA dataset matched this location and date range. Running the analysis from the offline record…')
      await loadData(farm)
    } catch (error) {
      setOfflineImportMessage(error.message)
    }
  }

  // Satellite layers load in the background right after the climate data. A run id drops results from an older analysis.
  const runId = useRef(0)
  async function loadSatellite({ point, force = false, id = runId.current } = {}) {
    const m = point ?? data.power?.meta
    if (!m) return
    const p = { lat: m.lat, lon: m.lon }
    setSat({ status: 'loading', raw: null, progress: { done: 0, total: 0 } })
    try {
      const raw = await fetchSatelliteBundle(p, weights.satellite.slopeClasses, {
        force,
        onProgress: (done, total) => { if (id === runId.current) setSat((s) => (s.status === 'loading' ? { ...s, progress: { done, total } } : s)) },
      })
      if (id === runId.current) setSat((s) => ({ ...s, status: 'ok', raw }))
    } catch (e) {
      // Climate recommendations remain usable when the optional satellite service is down.
      if (id === runId.current) setSat((s) => ({ ...s, status: 'ok', raw: { errors: { bundle: e.message || 'Satellite request failed' } } }))
    }
  }

  const onPreset = (id) => setFarm((f) => (id === 'custom' ? { ...f, presetId: 'custom' } : id === '' ? { ...f, presetId: '', baselineCrops: emptySlots() } : { ...f, presetId: id, baselineCrops: slotsFromPreset(id) }))

  const ctx = useMemo(() => {
    if (!data.power) return null
    const m = data.power.meta
    return buildContext({ power: data.power, farm: { ...farm, lat: m.lat ?? farm.lat, lon: m.lon ?? farm.lon }, crops, soils, weights, scenario, satellite: sat.raw, soilInfo: soil.info, local: local.data })
  }, [data.power, farm.soilType, farm.waterSource, farm.waterAvailability, scenario, sat.raw, soil.info, local.data])

  const result = useMemo(() => {
    if (!ctx) return null
    const baselineEntries = farm.baselineCrops.filter((s) => s.crop)
    if (baselineEntries.length < 2) return { error: 'Choose both crops for your current rotation (use "Edit soil, water and current rotation").', cards: [], skipped: [] }
    const comparison = compareStrategies({ baselineEntries, strategies: rotations.strategies, ctx, priorities })
    return buildCards({ comparison, ctx, priorities, soilInfo: soil.info })
  }, [ctx, farm.baselineCrops, priorities, soil.info])

  const locationOk = farm.lat !== '' && farm.lon !== '' && !validateLocation(farm.lat, farm.lon)
  const cropsOk = farm.baselineCrops.filter((s) => s.crop).length >= 2
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
            <Stepper step={step} onGo={goToStep} canGo={canGo} />
            <div className="card-plain">
              {step === 0 && <Suspense fallback={<p className="hint" role="status">Loading the map…</p>}><LocationPicker farm={farm} onChange={patchFarm} /></Suspense>}
              {step === 1 && <FarmForm farm={farm} onChange={patchFarm} onPreset={onPreset} soilInfo={soil.info} soilStatus={soil.status} zone={ctx?.climate ?? null} local={local.data} localStatus={local.status} globalCalendar={calendar.data} calendarStatus={calendar.status} />}
              {step === 2 && (
                <>
                  <Priorities priorities={priorities} onChange={(p) => setPriorities((cur) => ({ ...cur, ...p }))} />
                  <section className="offline-wizard" aria-labelledby="offline-import-h">
                    <h3 id="offline-import-h">Have an offline NASA dataset?</h3>
                    <p>Import a FieldShift JSON file for these coordinates and dates, then run the comparison without a live weather request.</p>
                    <div className="offline-sample">
                      <p><strong>Prepared sample:</strong> VTR Weaving Mills, Vadavalli, Coimbatore · NASA POWER daily data, 2005–15 Nov 2026.</p>
                      <button type="button" className="secondary" onClick={usePreparedOfflineDataset} disabled={!locationOk}>Use prepared NASA dataset</button>{' '}
                      <a href={`${import.meta.env.BASE_URL}data/fieldshift-nasa-power-vtr-weaving-mills-2005-2026.json`} download="fieldshift-nasa-power-vtr-weaving-mills-2005-2026.json">Download JSON</a>
                      <p className="hint">This is a location-specific regional sample, not a field measurement. Choose the matching place first; FieldShift checks location and dates before loading it.</p>
                    </div>
                    <label>Choose offline dataset
                      <input type="file" accept=".json,application/json" onChange={async (event) => {
                        const file = event.target.files?.[0]
                        if (!file) return
                        try {
                          await importOfflineDataset(JSON.parse(await file.text()), { lat: farm.lat, lon: farm.lon, startYear: WINDOW.startYear, endYear: WINDOW.endYear })
                          setOfflineImportMessage('Dataset matches this farm. Loading the analysis from the offline record…')
                          await loadData(farm)
                        } catch (error) { setOfflineImportMessage(error.message) }
                        event.target.value = ''
                      }} />
                    </label>
                    {offlineImportMessage && <p className="hint" role="status" aria-live="polite">{offlineImportMessage}</p>}
                  </section>
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
                  <button type="button" className="primary" onClick={() => goToStep(step + 1)} disabled={!canGo(step + 1)}>
                    Next
                  </button>
                ) : (
                  <button type="button" className="primary" onClick={() => loadData()} disabled={!canGo(2)}>
                    Show my recommendations
                  </button>
                )}
              </div>
              {step === 0 && !locationOk && <p className="hint" aria-live="polite">Choose a spot on the map, search for a place, or type coordinates to continue.</p>}
              {step === 1 && !cropsOk && <p className="hint" aria-live="polite">Choose both crops that you grow now before continuing.</p>}
            </div>
          </div>
        )}

        {view === 'loading' && <Loading stage={1} />}

        {view === 'results' && data.status === 'ok' && ctx && result && (
          <Suspense fallback={<Loading stage={1} />}>
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
            local={local}
            calendar={calendar}
            sat={sat}
            onLoadSat={() => loadSatellite({ force: true })}
            onChangeLocation={() => { setView('wizard'); setStep(0); setShowHero(false) }}
            onPrint={() => window.print()}
            onDatasetImported={() => loadData(farm)}
          />
          </Suspense>
        )}
      </main>
      <Footer />
    </div>
  )
}
