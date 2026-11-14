import { useEffect, useState } from 'react'

// "Data used" checklist. Every row says what it is, its source, resolution and state, in words (not only colour).

function Row({ state, name, detail }) {
  const mark = state === 'ok' ? '✓' : state === 'loading' ? '…' : state === 'context' ? '▧' : '–'
  const word = state === 'ok' ? 'Used' : state === 'loading' ? 'Loading' : state === 'context' ? 'Map context' : 'Not used'
  return (
    <li className={`ds ds-${state}`}>
      <span className="ds-mark" aria-hidden="true">{mark}</span>
      <span className="ds-body">
        <strong>{name}</strong> <span className="ds-state">({word})</span>
        <small>{detail}</small>
      </span>
    </li>
  )
}

const WATER_LAYERS = [
  { id: 'IMERG_Precipitation_Rate', title: 'GPM IMERG precipitation', detail: 'Latest available global precipitation-rate visualization. Satellite estimate, not a rain gauge or seasonal total.' },
  { id: 'SMAP_L4_Analyzed_Surface_Soil_Moisture', title: 'SMAP surface soil moisture', detail: 'Latest available NASA SMAP analysis visualization. A broad satellite/model grid, not a probe reading at this field.' },
  { id: 'GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI', title: 'GRACE / GRACE-FO water storage', detail: 'Monthly total-water-storage anomaly visualization at broad regional scale. It includes groundwater and other water stores; it does not measure an individual aquifer or well.' },
]

function gibsMapUrl(layer, lat, lon) {
  const halfLat = 1.5
  const halfLon = Math.min(12, halfLat / Math.max(0.16, Math.cos(Number(lat) * Math.PI / 180)))
  const bbox = [Math.max(-180, Number(lon) - halfLon), Math.max(-90, Number(lat) - halfLat), Math.min(180, Number(lon) + halfLon), Math.min(90, Number(lat) + halfLat)].join(',')
  const q = new URLSearchParams({ SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer, STYLES: '', SRS: 'EPSG:4326', BBOX: bbox, WIDTH: '480', HEIGHT: '280', FORMAT: 'image/png', TRANSPARENT: 'TRUE' })
  return `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?${q}`
}

function FarmerEvidence({ lat, lon, baselineCrops }) {
  const key = `fieldshift-evidence-v1:${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`
  const [evidence, setEvidence] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '{}')
      return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
    } catch { return {} }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(evidence)) } catch { /* still usable for this visit */ }
  }, [key, evidence])
  const field = (name, label, type = 'text', props = {}) => (
    <label>{label}<input type={type} value={evidence[name] ?? ''} onChange={(event) => setEvidence((cur) => ({ ...cur, [name]: event.target.value }))} {...props} /></label>
  )
  return (
    <details className="panel field-evidence">
      <summary>Add your soil test and local price</summary>
      <p className="hint">Enter measurements from a real lab report and a local buyer or market quote. They are saved only in this browser for this location, not uploaded. They are shown as farmer evidence and do not change the rotation ranking.</p>
      <h4>Soil test (optional)</h4>
      <div className="grid3">
        {field('soilTestDate', 'Test date', 'date')}
        {field('soilLab', 'Lab / report reference')}
        {field('soilPh', 'pH', 'number', { min: 0, max: 14, step: 0.1 })}
        {field('soilEc', 'Electrical conductivity (dS/m)', 'number', { min: 0, step: 0.01 })}
        {field('soilOrganicMatter', 'Organic matter (%)', 'number', { min: 0, step: 0.1 })}
        {field('soilNitrogen', 'Nitrogen (report units)')}
        {field('soilPhosphorus', 'Phosphorus (report units)')}
        {field('soilPotassium', 'Potassium (report units)')}
      </div>
      <h4>Local market quote (optional)</h4>
      <div className="grid3">
        {field('marketCrop', 'Crop', 'text', { list: 'fieldshift-crops', placeholder: baselineCrops.filter(Boolean).join(', ') || 'e.g. maize' })}
        {field('marketPrice', 'Price', 'number', { min: 0, step: 'any' })}
        {field('marketCurrency', 'Currency code', 'text', { maxLength: 3, placeholder: 'e.g. INR' })}
        {field('marketUnit', 'Unit / quality grade')}
        {field('marketLocation', 'Market / buyer')}
        {field('marketDate', 'Quote date', 'date')}
        {field('marketSource', 'Source or contact')}
      </div>
      <datalist id="fieldshift-crops">{baselineCrops.filter(Boolean).map((crop) => <option key={crop} value={crop} />)}</datalist>
      <p className="hint">For published public price context, see the <a href="https://fpma.apps.fao.org/giews/food-prices/tool/public/" target="_blank" rel="noreferrer">FAO GIEWS Food Price Monitoring and Analysis tool</a>. It does not cover every local buyer or report farm-gate prices everywhere.</p>
      <button type="button" className="secondary small" onClick={() => setEvidence({})}>Clear local evidence</button>
    </details>
  )
}

function WaterMapContext({ lat, lon }) {
  return (
    <details className="panel water-context">
      <summary>See rainfall, soil moisture and water-storage maps</summary>
      <p className="hint">Public NASA GIBS map imagery, centered on your point. These are visual regional context layers; FieldShift does not read a pixel value or treat them as field measurements.</p>
      <div className="water-map-grid">
        {WATER_LAYERS.map((layer) => {
          const src = gibsMapUrl(layer.id, lat, lon)
          return <WaterLayerCard key={layer.id} layer={layer} src={src} />
        })}
      </div>
      <p className="hint"><a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">Explore more layers in NASA Worldview</a></p>
    </details>
  )
}

function WaterLayerCard({ layer, src }) {
  const [imageState, setImageState] = useState('loading')
  return (
    <article className="water-map-card">
      <h4>{layer.title}</h4>
      <a href={src} target="_blank" rel="noreferrer" aria-label={`Open ${layer.title} map from NASA GIBS`}>
        <img className={imageState === 'error' ? 'water-map-image-failed' : ''} src={src} loading="lazy" onLoad={() => setImageState('ready')} onError={() => setImageState('error')} alt={`${layer.title} NASA GIBS map centered near the selected farm`} />
      </a>
      {imageState === 'loading' && <p className="hint" role="status">Loading NASA map…</p>}
      {imageState === 'error' && <p className="water-image-error" role="status">This map did not load. Try again later or open NASA Worldview.</p>}
      <p>{layer.detail}</p>
      <small>Source: NASA Earthdata GIBS · Latest/default date served by NASA</small>
    </article>
  )
}

export default function DataStatus({ ctx, power, soil, sat, local, calendar, farm }) {
  const s = ctx.satellite
  const loading = sat.status === 'loading'
  const errs = sat.raw?.errors ?? {}
  const layer = (key, label, okText, source) => {
    if (s?.[key]) return <Row state="ok" name={label} detail={okText} />
    if (loading) return <Row state="loading" name={label} detail={`${source}. Loading in the background.`} />
    return <Row state="off" name={label} detail={errs[key] ? `Failed: ${errs[key]}` : `${source}. Not loaded.`} />
  }
  const m = power.meta
  const si = soil.info
  return (
    <div className="panel">
      <h3>Data used</h3>
      <ul className="dslist">
        <Row state="ok" name="Climate (NASA POWER)" detail={`${m.startYear} to ${m.endYear}, ${Math.round(m.completeness * 1000) / 10}% of days usable, about 50 km grid`} />
        {si ? (
          <Row state="ok" name="Soil (SoilGrids, not NASA)" detail={`${si.texture}, ${si.depth}, 250 m${si.nearbyKm ? `, taken ${si.nearbyKm} km away` : ''}. Modelled, not a soil test.`} />
        ) : soil.status === 'loading' ? (
          <Row state="loading" name="Soil (SoilGrids, not NASA)" detail="Loading." />
        ) : (
          <Row state="off" name="Soil (SoilGrids, not NASA)" detail="No data here, so your soil type choice is used." />
        )}
        {local?.status === 'loading' ? (
          <Row state="loading" name="Local crops (Wikipedia text)" detail="Loading." />
        ) : local?.data?.available ? (
          <Row state="ok" name="Local crops (Wikipedia text)" detail={`${local.data.pages.length} articles about ${local.data.place.label || 'your area'}. Text, not statistics.`} />
        ) : (
          <Row state="off" name="Local crops (Wikipedia text)" detail={local?.data?.reason ?? 'Not available.'} />
        )}
        {calendar?.status === 'loading' ? (
          <Row state="loading" name="Global crop calendar (AgMIP-GGCMI)" detail="Loading a public 0.5° historical reference grid." />
        ) : calendar?.data ? (
          <Row state="ok" name="Global crop calendar (AgMIP-GGCMI)" detail={`Historical average calendar for ${Object.keys(calendar.data.calendars).length} supported crops at a 0.5° grid cell, ${calendar.data.cell.distanceKm} km from the selected point. Gap-filled/extrapolated in some areas; not field advice. CC BY 4.0.`} />
        ) : (
          <Row state="off" name="Global crop calendar (AgMIP-GGCMI)" detail={calendar?.error ?? 'Not available; sowing months fall back to climate-based estimates.'} />
        )}
        {layer('ndvi', 'Greenness (MODIS NDVI)', s?.ndvi ? `${s.ndvi.years.join(' and ')}, 250 m, 16-day` : '', 'MODIS, 250 m')}
        {layer('et', 'Water use (MODIS evapotranspiration)', s?.et ? `${s.et.years.join(', ')}, 500 m, 8-day. Cross-check: ${s.agreement ? (s.agreement.agrees ? 'agrees with POWER' : 'disagrees with POWER') : 'not enough months'}` : '', 'MODIS, 500 m')}
        {layer('lst', 'Ground temperature (MODIS)', s?.lst ? `${s.lst.years.join(', ')}, 1 km, 8-day` : '', 'MODIS, 1 km')}
        {s?.landCover ? <Row state="ok" name="Farmland check (MODIS land cover)" detail={`${s.landCover.name}, 500 m`} /> : loading ? <Row state="loading" name="Farmland check (MODIS land cover)" detail="Loading." /> : <Row state="off" name="Farmland check (MODIS land cover)" detail="Not loaded." />}
        {s?.slope ? <Row state="ok" name="Slope (Copernicus DEM, ESA)" detail={`${s.slope.slopePct.toFixed(1)}%, ${s.slope.classLabel}, about 90 m`} /> : loading ? <Row state="loading" name="Slope (Copernicus DEM, ESA)" detail="Loading." /> : <Row state="off" name="Slope (Copernicus DEM, ESA)" detail="Not loaded." />}
        <Row state="context" name="GPM, SMAP and GRACE / GRACE-FO" detail="Latest public NASA map layers are available below. Raster imagery gives regional context; this app does not infer field-level point measurements from map colors." />
      </ul>
      {errs.bundle && <p className="hint" role="status">Optional satellite bundle unavailable: {errs.bundle}</p>}
      <WaterMapContext lat={power.meta.lat} lon={power.meta.lon} />
      <FarmerEvidence key={`${Number(power.meta.lat).toFixed(2)},${Number(power.meta.lon).toFixed(2)}`} lat={power.meta.lat} lon={power.meta.lon} baselineCrops={farm.baselineCrops.map((entry) => entry.crop)} />
    </div>
  )
}
