import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MONTH_NAMES } from '../scoring/rotation.js'
import Term from './Term.jsx'

const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100)
const r0 = (x) => (x == null ? null : Math.round(x))

function Chart({ title, line, children }) {
  return (
    <figure className="chart">
      <figcaption>
        <strong>{title}</strong>
        <span className="interp">{line}</span>
      </figcaption>
      <div className="chart-box" role="img" aria-label={`${title}. ${line}`}>
        <ResponsiveContainer width="100%" height={220}>{children}</ResponsiveContainer>
      </div>
    </figure>
  )
}

export default function SatelliteSection({ sat, status, progress, errors, onLoad, ctx }) {
  const s = ctx?.satellite
  return (
    <section aria-labelledby="sat-h">
      <h2 id="sat-h">NASA satellite layers (optional)</h2>
      <p>
        Adds satellite greenness (<Term id="ndvi">NDVI</Term>), observed water use (<Term id="evapotranspiration">evapotranspiration</Term>), ground temperature, a farmland check and slope for the farm point. Each layer is downloaded separately. If one fails, the rest still work and the failure is listed under information gaps.
      </p>
      <button type="button" className="secondary" onClick={onLoad} disabled={status === 'loading'}>
        {status === 'loading' ? `Getting satellite layers... ${progress.done} of ${progress.total} requests` : status === 'ok' ? 'Reload satellite layers' : 'Add NASA satellite layers (about 1 to 3 minutes)'}
      </button>
      {status === 'ok' && Object.keys(errors).length > 0 && (
        <p className="error" role="alert">Some layers could not be loaded: {Object.entries(errors).map(([k, v]) => `${k} (${v})`).join('; ')}.</p>
      )}
      {s && (
        <>
          {s.landCover && (
            <p className={s.landCover.isCropland ? 'note' : 'error'}>
              Farmland check (MODIS land cover, 500 m): this point is {s.landCover.name}{s.landCover.isCropland ? '.' : ', not cropland. Check the coordinates or pick a field outside the town.'}
            </p>
          )}
          {s.slope && (
            <p className="note">
              Slope (Copernicus DEM via Open-Meteo, ESA, not NASA SRTM, about 90 m): about {s.slope.slopePct.toFixed(1)}%, {s.slope.classLabel}. Elevation about {r0(s.slope.elevationM)} m.
            </p>
          )}
          <div className="charts">
            {s.ndvi && (
              <Chart title="Satellite greenness by month (NDVI)" line={`${s.ndvi.lowMonths.length ? `Below ${ctx.weights.satellite.ndviBare} (little vegetation) in: ${s.ndvi.lowMonths.map((m) => MONTH_NAMES[m - 1]).join(', ')}.` : `Never below ${ctx.weights.satellite.ndviBare}.`} MODIS 250 m, ${s.ndvi.years.join(' and ')}.`}>
                <BarChart data={s.ndvi.monthly.map((v, m) => ({ name: MONTH_NAMES[m], ndvi: r2(v) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={[0, 1]} />
                  <Tooltip />
                  <Bar dataKey="ndvi" name="NDVI" fill="#2f855a" />
                </BarChart>
              </Chart>
            )}
            {s.et && (
              <Chart title="Water the land used vs could use (mm per month)" line={`Observed ET against potential ET. MODIS 500 m, ${s.et.years.join(', ')} (one year).`}>
                <LineChart data={s.et.et.map((v, m) => ({ name: MONTH_NAMES[m], et: r0(v), pet: r0(s.et.pet[m]) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line dataKey="et" name="Water used (ET)" stroke="#2b6cb0" strokeWidth={2} />
                  <Line dataKey="pet" name="Water the air could take (potential ET)" stroke="#c05621" strokeWidth={2} strokeDasharray="6 3" />
                </LineChart>
              </Chart>
            )}
            {s.lst && (
              <Chart title="Ground temperature by month (C, daytime)" line={`Ground runs hotter than the air. MODIS 1 km, ${s.lst.years.join(', ')} (one year).`}>
                <LineChart data={s.lst.monthlyC.map((v, m) => ({ name: MONTH_NAMES[m], ground: r0(v), air: r0(ctx.monthly[m].tmaxC) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis domain={['auto', 'auto']} />
                  <Tooltip />
                  <Legend />
                  <Line dataKey="ground" name="Ground (satellite)" stroke="#c05621" strokeWidth={2} />
                  <Line dataKey="air" name="Air highest (POWER)" stroke="#2f855a" strokeWidth={2} strokeDasharray="6 3" />
                </LineChart>
              </Chart>
            )}
          </div>
          {s.agreement && (
            <p className={s.agreement.agrees ? 'note' : 'error'}>
              Cross-check: MODIS potential ET and the POWER-based estimate differ by {s.agreement.pctDiff.toFixed(0)}% (correlation {s.agreement.r?.toFixed(2)}). {s.agreement.agrees ? 'The two NASA sources agree.' : 'They disagree, which lowers confidence.'}
            </p>
          )}
        </>
      )}
    </section>
  )
}
