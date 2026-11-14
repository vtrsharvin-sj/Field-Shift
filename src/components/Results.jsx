import { useState } from 'react'
import weights from '../data/weights.json'
import { DISCLAIMER } from '../data/glossary.js'
import { buildSummary } from '../scoring/explain.js'
import RotationCards from './RotationCards.jsx'
import ClimateSnapshot from './ClimateSnapshot.jsx'
import SatelliteSection from './SatelliteSection.jsx'
import About from './About.jsx'
import DataStatus from './DataStatus.jsx'
import LocalCrops from './LocalCrops.jsx'
import { FarmForm, Priorities } from './FarmForm.jsx'

function Summary({ result }) {
  const s = buildSummary(result.cards)
  if (!s) return null
  return (
    <section className={`summary ${s.kind}`} aria-labelledby="sum-h">
      <p className="eyebrow">{s.kind === 'switch' ? 'Our suggestion' : s.kind === 'close' ? 'Close call' : 'Good news'}</p>
      <h2 id="sum-h">{s.headline}</h2>
      <p>{s.detail}</p>
      {s.reasons.length > 0 && (
        <ul>
          {s.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
      <p className="disclaimer" role="note">{DISCLAIMER}</p>
    </section>
  )
}

function WhatIf({ scenario, setScenario }) {
  return (
    <section aria-labelledby="scen-h" className="panel">
      <h2 id="scen-h">What if the climate changes?</h2>
      <p className="lead">Test how each rotation holds up if rain falls or temperatures rise. The ranking above updates as you move the sliders.</p>
      <label className="slider">
        <span className="slider-top"><strong>Rainfall change</strong><span className="slider-val">{scenario.rainChangePct > 0 ? '+' : ''}{scenario.rainChangePct}%</span></span>
        <input type="range" min={weights.scenario.rainChangeRangePct[0]} max={weights.scenario.rainChangeRangePct[1]} step="5" value={scenario.rainChangePct} onChange={(e) => setScenario((s) => ({ ...s, rainChangePct: Number(e.target.value) }))} />
      </label>
      <label className="slider">
        <span className="slider-top"><strong>Warming</strong><span className="slider-val">+{scenario.tempChangeC} °C</span></span>
        <input type="range" min={weights.scenario.tempChangeRangeC[0]} max={weights.scenario.tempChangeRangeC[1]} step="0.5" value={scenario.tempChangeC} onChange={(e) => setScenario((s) => ({ ...s, tempChangeC: Number(e.target.value) }))} />
      </label>
      <p className="hint">This multiplies every real daily rain value and shifts every temperature. It is a test, not a forecast, and it lowers confidence.</p>
      {(scenario.rainChangePct !== 0 || scenario.tempChangeC !== 0) && (
        <button type="button" className="secondary" onClick={() => setScenario({ rainChangePct: 0, tempChangeC: 0 })}>Reset what-if</button>
      )}
    </section>
  )
}

const TABS = [
  ['recs', 'Recommendations'],
  ['local', 'Grown here'],
  ['climate', 'Climate'],
  ['sat', 'Satellite'],
  ['whatif', 'What if?'],
  ['learn', 'Learn'],
]

export default function Results({ ctx, result, power, farm, onFarm, onPreset, priorities, onPriorities, scenario, setScenario, soil, local, calendar, sat, onLoadSat, onChangeLocation, onPrint }) {
  const [tab, setTab] = useState('recs')
  const [sideOpen, setSideOpen] = useState(() => !(typeof window !== 'undefined' && window.matchMedia?.('(max-width: 860px)').matches))
  const soilLabel = farm.soilType
  return (
    <div className="results">
      <aside className={`side ${sideOpen ? 'open' : ''}`} aria-label="Your choices">
        <button type="button" className="side-toggle" onClick={() => setSideOpen(!sideOpen)} aria-expanded={sideOpen}>
          {sideOpen ? 'Hide farm details and data' : 'Farm details and data'}
        </button>
        <div className="side-body">
          <div className="panel">
            <h3>Your farm</h3>
            <dl className="facts">
              <dt>Location</dt>
              <dd>{Number(power.meta.lat).toFixed(2)}, {Number(power.meta.lon).toFixed(2)}</dd>
              {ctx.climate && (<><dt>Climate</dt><dd>{ctx.climate.label}</dd></>)}
              <dt>Soil</dt>
              <dd>{soilLabel}</dd>
              <dt>Water</dt>
              <dd>{farm.waterSource === 'rainfed' ? 'Rain only' : `${farm.waterSource === 'borewell' ? 'Well' : 'Canal'}, ${farm.waterAvailability}`}</dd>
            </dl>
            <button type="button" className="secondary small" onClick={onChangeLocation}>Change location</button>
          </div>
          <div className="panel">
            <Priorities priorities={priorities} onChange={onPriorities} compact />
          </div>
          <DataStatus ctx={ctx} power={power} soil={soil} sat={sat} local={local} calendar={calendar} farm={farm} />
          <details className="panel">
            <summary>Edit soil, water and current rotation</summary>
            <FarmForm farm={farm} onChange={onFarm} onPreset={onPreset} soilInfo={soil.info} soilStatus={soil.status} zone={ctx.climate} local={local.data} localStatus={local.status} globalCalendar={calendar?.data} calendarStatus={calendar?.status} compact />
          </details>
        </div>
      </aside>

      <div className="main">
        {sat.status === 'loading' && (
          <p className="banner" role="status" aria-live="polite">
            <span className="spinner small" aria-hidden="true" /> Loading NASA satellite layers in the background{sat.progress.total ? ` (${sat.progress.done} of ${sat.progress.total})` : ''}. These results update by themselves when it finishes, and confidence can rise.
          </p>
        )}
        {sat.status === 'ok' && sat.raw && (
          <p className="banner done" role="status">
            Satellite layers {Object.keys(sat.raw.errors ?? {}).length ? `loaded with ${Object.keys(sat.raw.errors).length} problem(s), see "Data used"` : sat.raw.fromCache ? 'loaded from this browser (saved earlier, no new download)' : 'loaded and added to the results'}.
          </p>
        )}
        <Summary result={result} />
        {ctx.satellite?.landCover && !ctx.satellite.landCover.isCropland && (
          <aside className="location-alert" role="note" aria-label="Location data check">
            <strong>Check this point before using the comparison.</strong>
            <span> MODIS classifies the selected 500 m pixel as {ctx.satellite.landCover.name}, not cropland. It may include mixed land cover, so these scores are regional screening only—not verified for your field. Choose a field-centre point and confirm it with local knowledge.</span>
          </aside>
        )}
        <div className="tabs" role="tablist" aria-label="Result sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="tabpanel big" role="tabpanel">
          {tab === 'recs' && (
            <>
              <RotationCards result={result} />
              <p className="print-row">
                <button type="button" className="secondary" onClick={onPrint}>Save or print as PDF</button>
              </p>
            </>
          )}
          {tab === 'local' && <LocalCrops local={local.data} status={local.status} />}
          {tab === 'climate' && <ClimateSnapshot ctx={ctx} power={power} />}
          {tab === 'sat' && <SatelliteSection ctx={ctx} status={sat.status} progress={sat.progress} errors={sat.raw?.errors ?? {}} onLoad={onLoadSat} />}
          {tab === 'whatif' && <WhatIf scenario={scenario} setScenario={setScenario} />}
          {tab === 'learn' && <About />}
        </div>
      </div>
    </div>
  )
}
