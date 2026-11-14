// "Data used" checklist. Every row says what it is, its source, resolution and state, in words (not only colour).

function Row({ state, name, detail }) {
  const mark = state === 'ok' ? '✓' : state === 'loading' ? '…' : '–'
  const word = state === 'ok' ? 'Used' : state === 'loading' ? 'Loading' : 'Not used'
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

export default function DataStatus({ ctx, power, soil, sat }) {
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
        {layer('ndvi', 'Greenness (MODIS NDVI)', s?.ndvi ? `${s.ndvi.years.join(' and ')}, 250 m, 16-day` : '', 'MODIS, 250 m')}
        {layer('et', 'Water use (MODIS evapotranspiration)', s?.et ? `${s.et.years.join(', ')}, 500 m, 8-day. Cross-check: ${s.agreement ? (s.agreement.agrees ? 'agrees with POWER' : 'disagrees with POWER') : 'not enough months'}` : '', 'MODIS, 500 m')}
        {layer('lst', 'Ground temperature (MODIS)', s?.lst ? `${s.lst.years.join(', ')}, 1 km, 8-day` : '', 'MODIS, 1 km')}
        {s?.landCover ? <Row state="ok" name="Farmland check (MODIS land cover)" detail={`${s.landCover.name}, 500 m`} /> : loading ? <Row state="loading" name="Farmland check (MODIS land cover)" detail="Loading." /> : <Row state="off" name="Farmland check (MODIS land cover)" detail="Not loaded." />}
        {s?.slope ? <Row state="ok" name="Slope (Copernicus DEM, ESA)" detail={`${s.slope.slopePct.toFixed(1)}%, ${s.slope.classLabel}, about 90 m`} /> : loading ? <Row state="loading" name="Slope (Copernicus DEM, ESA)" detail="Loading." /> : <Row state="off" name="Slope (Copernicus DEM, ESA)" detail="Not loaded." />}
      </ul>
      <p className="hint">Not available in this app: soil tests, local market prices, GPM rainfall, SMAP soil moisture, GRACE groundwater.</p>
    </div>
  )
}
