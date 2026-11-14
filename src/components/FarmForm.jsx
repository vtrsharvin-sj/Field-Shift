import soils from '../data/soils.json'
import rotations from '../data/rotations.json'
import crops from '../data/crops.json'
import { MONTH_NAMES } from '../scoring/rotation.js'

export const MAX_CUSTOM_CROPS = 3

const isMatch = (r, zone) => zone && r.zones.includes(zone.group)

export function FarmForm({ farm, onChange, onPreset, soilInfo, soilStatus, zone, compact = false }) {
  const matching = rotations.baselinePresets.filter((r) => isMatch(r, zone))
  const others = rotations.baselinePresets.filter((r) => !isMatch(r, zone))
  const setSlot = (i, patch) => {
    const slots = farm.baselineCrops.map((s, j) => (j === i ? { ...s, ...patch } : s))
    onChange({ baselineCrops: slots, presetId: 'custom' })
  }
  return (
    <section aria-labelledby="farm-h" className={compact ? 'form-compact' : ''}>
      {!compact && (
        <>
          <h2 id="farm-h">Tell us about your farm</h2>
          <p className="lead">These answers decide how much water your crops can count on and what your current rotation is.</p>
        </>
      )}
      <div className="grid3">
        <label>
          Soil type
          <select value={farm.soilType} onChange={(e) => onChange({ soilType: e.target.value })}>
            {soils.types.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </label>
        <label>
          Water source
          <select value={farm.waterSource} onChange={(e) => onChange({ waterSource: e.target.value })}>
            <option value="rainfed">Rain only (rainfed)</option>
            <option value="borewell">Well or borewell</option>
            <option value="canal">Canal, river or irrigation scheme</option>
          </select>
        </label>
        <label>
          How much water can you rely on?
          <select value={farm.waterAvailability} onChange={(e) => onChange({ waterAvailability: e.target.value })} disabled={farm.waterSource === 'rainfed'}>
            <option value="low">A little</option>
            <option value="medium">A fair amount</option>
            <option value="high">Plenty</option>
          </select>
        </label>
      </div>
      <p className="hint" aria-live="polite">
        {soilStatus === 'loading' && 'Checking a world soil map (SoilGrids, not NASA) for your spot...'}
        {soilStatus === 'ok' && soilInfo && `A world soil map (SoilGrids, not NASA) suggests ${soilInfo.suggestedType} soil here: sand ${Math.round(soilInfo.sandPct)}%, clay ${Math.round(soilInfo.clayPct)}%. You can change it above.`}
        {soilStatus === 'error' && 'The soil map did not answer, so please choose your soil type yourself.'}
      </p>

      <h3>What do you grow now?</h3>
      <label className="block">
        Start from a common rotation
        <select value={farm.presetId} onChange={(e) => onPreset(e.target.value)}>
          {zone && matching.length > 0 && (
            <optgroup label={`Common in a ${zone.label.toLowerCase()} climate`}>
              {matching.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </optgroup>
          )}
          <optgroup label={zone && matching.length > 0 ? 'Other common rotations' : 'Common rotations'}>
            {others.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </optgroup>
          <option value="custom">Something else (set it below)</option>
        </select>
      </label>
      <div className="slots">
        {farm.baselineCrops.map((slot, i) => (
          <div className="slot" key={i}>
            <label>
              Crop {i + 1}
              <select value={slot.crop} onChange={(e) => setSlot(i, { crop: e.target.value })}>
                <option value="">(none)</option>
                {crops.filter((x) => x.role === 'main').map((x) => (
                  <option key={x.id} value={x.id}>{x.name}</option>
                ))}
                <optgroup label="Cover crops and green manures">
                  {crops.filter((x) => x.role === 'cover').map((x) => (
                    <option key={x.id} value={x.id}>{x.name}</option>
                  ))}
                </optgroup>
              </select>
            </label>
            <label>
              Which year?
              <select value={slot.year ?? 0} onChange={(e) => setSlot(i, { year: Number(e.target.value) })} disabled={!slot.crop}>
                <option value={0}>Year 1</option>
                <option value={1}>Year 2 (alternate years)</option>
                <option value={2}>Year 3</option>
              </select>
            </label>
            <label>
              Sowing month
              <select value={slot.sowMonth} onChange={(e) => setSlot(i, { sowMonth: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })} disabled={!slot.crop}>
                <option value="auto">Let the tool choose</option>
                {MONTH_NAMES.map((m, k) => (
                  <option key={m} value={k + 1}>{m}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
      <p className="hint">List up to 3 crops in the order you grow them. If you know your real sowing month, set it. Otherwise the tool picks the best month from the NASA temperature and rain record.</p>
    </section>
  )
}

const PRIORITY_ITEMS = [
  ['water', 'Save water', 'Prefer rotations that need less irrigation.'],
  ['income', 'Earn more', 'Prefer crops with a higher income rating.'],
  ['soil', 'Build soil health', 'Prefer legumes, variety and no back-to-back repeats.'],
  ['erosion', 'Protect against erosion', 'Keep the soil covered in heavy-rain months.'],
]

export function Priorities({ priorities, onChange, compact = false }) {
  return (
    <section aria-labelledby="prio-h" className={compact ? 'form-compact' : ''}>
      {!compact ? (
        <>
          <h2 id="prio-h">What matters most to you?</h2>
          <p className="lead">Move each slider from 0 (not important) to 10 (very important). Results change as you move them.</p>
        </>
      ) : (
        <h3 id="prio-h">What matters most?</h3>
      )}
      {PRIORITY_ITEMS.map(([k, label, hint]) => (
        <label className="slider" key={k}>
          <span className="slider-top">
            <strong>{label}</strong>
            <span className="slider-val">{priorities[k]}/10</span>
          </span>
          {!compact && <small>{hint}</small>}
          <input type="range" min="0" max="10" step="1" value={priorities[k]} onChange={(e) => onChange({ [k]: Number(e.target.value) })} aria-valuetext={`${priorities[k]} out of 10`} />
        </label>
      ))}
    </section>
  )
}
