import soils from '../data/soils.json'
import rotations from '../data/rotations.json'
import crops from '../data/crops.json'
import { MONTH_NAMES } from '../scoring/rotation.js'

export const MAX_CUSTOM_CROPS = 3

export function FarmForm({ farm, onChange, soilInfo, soilStatus }) {
  const custom = farm.baselineId === 'custom'
  const setSlot = (i, patch) => {
    const slots = farm.customCrops.map((s, j) => (j === i ? { ...s, ...patch } : s))
    onChange({ customCrops: slots })
  }
  return (
    <section aria-labelledby="farm-h">
      <h2 id="farm-h">2. About your farm</h2>
      <div className="row">
        <label>
          Soil type
          <select value={farm.soilType} onChange={(e) => onChange({ soilType: e.target.value })}>
            {soils.types.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Water source
          <select value={farm.waterSource} onChange={(e) => onChange({ waterSource: e.target.value })}>
            <option value="rainfed">Rainfed (only rain)</option>
            <option value="borewell">Borewell</option>
            <option value="canal">Canal</option>
          </select>
        </label>
        <label>
          How much water can you rely on?
          <select value={farm.waterAvailability} onChange={(e) => onChange({ waterAvailability: e.target.value })} disabled={farm.waterSource === 'rainfed'}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      <p className="note" aria-live="polite">
        {soilStatus === 'loading' && 'Checking SoilGrids (ISRIC, not NASA) for soil properties...'}
        {soilStatus === 'ok' && soilInfo && `SoilGrids (ISRIC, not NASA) suggests ${soilInfo.suggestedType} soil here: sand ${Math.round(soilInfo.sandPct)}%, clay ${Math.round(soilInfo.clayPct)}%. You can change the dropdown.`}
        {soilStatus === 'error' && 'Soil properties not fetched (SoilGrids did not answer). Please choose the soil type yourself.'}
      </p>
      <label className="block">
        Your current rotation
        <select value={farm.baselineId} onChange={(e) => onChange({ baselineId: e.target.value })}>
          {rotations.baselinePresets.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
          <option value="custom">Build my own (up to 3 crops)</option>
        </select>
      </label>
      {custom && (
        <div className="custom">
          {farm.customCrops.map((slot, i) => (
            <div className="row" key={i}>
              <label>
                Crop {i + 1}
                <select value={slot.crop} onChange={(e) => setSlot(i, { crop: e.target.value })}>
                  <option value="">(none)</option>
                  {crops.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sowing month
                <select value={slot.sowMonth} onChange={(e) => setSlot(i, { sowMonth: Number(e.target.value) })}>
                  {MONTH_NAMES.map((m, k) => (
                    <option key={m} value={k + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
          <p className="note">Crops cannot overlap in the field. If they do, you will see a message below.</p>
        </div>
      )}
    </section>
  )
}

export function Priorities({ priorities, onChange }) {
  const items = [
    ['water', 'Save water', 'Prefer rotations that need less irrigation.'],
    ['income', 'Income', 'Prefer crops with a higher generic income rating.'],
    ['soil', 'Soil health', 'Prefer legumes, variety and no back-to-back repeats.'],
    ['erosion', 'Erosion control', 'Prefer keeping the soil covered in heavy-rain months.'],
  ]
  return (
    <section aria-labelledby="prio-h">
      <h2 id="prio-h">3. What matters most to you?</h2>
      <p>0 means not important, 10 means very important. Results update as you move the sliders.</p>
      {items.map(([k, label, hint]) => (
        <label className="slider" key={k}>
          <span>
            <strong>{label}</strong>: {priorities[k]} of 10 <small>{hint}</small>
          </span>
          <input type="range" min="0" max="10" step="1" value={priorities[k]} onChange={(e) => onChange({ [k]: Number(e.target.value) })} />
        </label>
      ))}
    </section>
  )
}
