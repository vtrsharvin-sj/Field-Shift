import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { describeTrends } from '../indicators/climate.js'
import { MONTH_NAMES } from '../scoring/rotation.js'
import { powerSourceLabel } from '../scoring/explain.js'
import { annualStatistics } from '../indicators/statistics.js'
import Term from './Term.jsx'

const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10)

function Chart({ title, line, children, data }) {
  return (
    <figure className="chart">
      <figcaption>
        <strong>{title}</strong>
        {line && <span className="interp">{line}</span>}
      </figcaption>
      <div className="chart-box" role="img" aria-label={`${title}. ${line ?? ''}`}>
        <ResponsiveContainer width="100%" height={220}>
          {children(data)}
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export default function ClimateSnapshot({ ctx, power }) {
  const monthly = ctx.monthly.map((m) => ({ name: MONTH_NAMES[m.month - 1], rain: r1(m.rainMm), tmean: r1(m.tmeanC), tmax: r1(m.tmaxC), tmin: r1(m.tminC), heat: r1(m.heatDays), frost: r1(m.frostDays), dry: r1(m.longestDry), heavy: r1(m.heavyRainDays) }))
  const trends = ctx.trends
  const lines = describeTrends(trends)
  const annual = trends.rows.map((r) => ({ name: String(r.year), rain: Math.round(r.rainMm), temp: r1(r.tmeanC) }))
  const rainStats = annualStatistics(trends.rows, 'rainMm')
  const tempStats = annualStatistics(trends.rows, 'tmeanC')
  const wettest = [...monthly].sort((a, b) => b.rain - a.rain)[0]
  const driest = [...monthly].sort((a, b) => a.rain - b.rain)[0]
  const hotTotal = monthly.reduce((s, m) => s + (m.heat ?? 0), 0)
  const meta = power.meta
  return (
    <section aria-labelledby="clim-h">
      <h2 id="clim-h">Your climate, from NASA data</h2>
      <p className="source">
        Source: {powerSourceLabel(meta)}. {Math.round(meta.completeness * 1000) / 10}% of daily values were usable.
      </p>
      {ctx.climate && (
        <p className="note">
          Climate type at this point: <strong>{ctx.climate.label}</strong>. Average temperature {r1(ctx.climate.tAnn)} C, rainfall about {Math.round(ctx.climate.pAnn)} mm a year. {ctx.climate.text}
        </p>
      )}
      <section className="stats-panel" aria-labelledby="stats-h">
        <div>
          <p className="eyebrow">Evidence at a glance</p>
          <h3 id="stats-h">What the record says</h3>
          <p className="hint">Complete annual observations only. The middle 80% range shows year-to-year spread; confidence intervals are a 3-year moving-block bootstrap of the mean, not a forecast.</p>
        </div>
        <div className="stats-grid">
          {rainStats && <article className="stat-card">
            <h4>Annual rainfall</h4>
            <p className="stat-primary">{Math.round(rainStats.mean).toLocaleString()} <small>mm/year mean</small></p>
            <dl>
              <dt>Median</dt><dd>{Math.round(rainStats.median).toLocaleString()} mm</dd>
              <dt>Standard deviation</dt><dd>{rainStats.sd == null ? '—' : `${Math.round(rainStats.sd).toLocaleString()} mm`}</dd>
              <dt>Middle 50% (IQR)</dt><dd>{Math.round(rainStats.p25).toLocaleString()}–{Math.round(rainStats.p75).toLocaleString()} mm</dd>
              <dt>Middle 80% of years</dt><dd>{Math.round(rainStats.p10).toLocaleString()}–{Math.round(rainStats.p90).toLocaleString()} mm</dd>
              <dt>Year-to-year variation (CV)</dt><dd>{rainStats.cv == null ? '—' : `${Math.round(rainStats.cv)}%`}</dd>
              {rainStats.meanCI && <><dt>95% interval for mean</dt><dd>{Math.round(rainStats.meanCI[0]).toLocaleString()}–{Math.round(rainStats.meanCI[1]).toLocaleString()} mm</dd></>}
              {rainStats.trendCI && <><dt>Trend estimate</dt><dd>{rainStats.trendPerYear.toFixed(1)} mm/year ({rainStats.trendCI[0].toFixed(1)} to {rainStats.trendCI[1].toFixed(1)})</dd></>}
            </dl>
          </article>}
          {tempStats && <article className="stat-card">
            <h4>Annual mean temperature</h4>
            <p className="stat-primary">{tempStats.mean.toFixed(1)} <small>°C mean</small></p>
            <dl>
              <dt>Median</dt><dd>{tempStats.median.toFixed(1)} °C</dd>
              <dt>Standard deviation</dt><dd>{tempStats.sd == null ? '—' : `${tempStats.sd.toFixed(1)} °C`}</dd>
              <dt>Middle 50% (IQR)</dt><dd>{tempStats.p25.toFixed(1)}–{tempStats.p75.toFixed(1)} °C</dd>
              <dt>Middle 80% of years</dt><dd>{tempStats.p10.toFixed(1)}–{tempStats.p90.toFixed(1)} °C</dd>
              {tempStats.meanCI && <><dt>95% interval for mean</dt><dd>{tempStats.meanCI[0].toFixed(1)}–{tempStats.meanCI[1].toFixed(1)} °C</dd></>}
              {tempStats.trendCI && <><dt>Trend estimate</dt><dd>{(tempStats.trendPerYear * 10).toFixed(2)} °C/decade ({(tempStats.trendCI[0] * 10).toFixed(2)} to {(tempStats.trendCI[1] * 10).toFixed(2)})</dd></>}
            </dl>
          </article>}
        </div>
        <p className="hint">Annual sample size: {rainStats?.n ?? 0} complete years. Trend intervals use circular moving blocks to retain short runs of adjacent-year variability. Treat trend ranges as descriptive; persistent climate patterns can extend beyond the resampled blocks.</p>
        {rainStats && rainStats.n < 8 && <p className="hint">Bootstrap intervals and the lower-quintile rainfall adjustment need at least 8 complete years; this record is shorter, so the water score uses its conservative variability-based fallback.</p>}
      </section>
      <div className="charts">
        <Chart title="Typical rainfall by month (mm)" data={monthly} line={`${wettest.name} is usually the wettest month (${wettest.rain} mm) and ${driest.name} the driest (${driest.rain} mm).`}>
          {(d) => (
            <BarChart data={d}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="rain" name="Rain (mm)" fill="#2b6cb0" />
            </BarChart>
          )}
        </Chart>
        <Chart title="Temperature by month (C)" data={monthly} line={lines.temp}>
          {(d) => (
            <LineChart data={d}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="tmax" name="Highest" stroke="#c05621" strokeWidth={2} />
              <Line type="monotone" dataKey="tmean" name="Average" stroke="#2f855a" strokeWidth={2} strokeDasharray="6 3" />
              <Line type="monotone" dataKey="tmin" name="Lowest" stroke="#2b6cb0" strokeWidth={2} strokeDasharray="2 3" />
            </LineChart>
          )}
        </Chart>
        <Chart title="Very hot days and frost nights per month" data={monthly} line={hotTotal < 1 ? 'Very hot days (above 35 C) are rare here.' : `About ${r1(hotTotal)} very hot days a year (above 35 C).`}>
          {(d) => (
            <BarChart data={d}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="heat" name="Very hot days" fill="#c05621" />
              <Bar dataKey="frost" name="Frost nights" fill="#2b6cb0" />
            </BarChart>
          )}
        </Chart>
        <Chart title="Longest dry stretch by month (days)" data={monthly} line="Longest run of days with under 1 mm of rain, averaged across years.">
          {(d) => (
            <BarChart data={d}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="dry" name="Days" fill="#975a16" />
            </BarChart>
          )}
        </Chart>
        <Chart title="Rainfall by year (mm)" data={annual} line={lines.rain}>
          {(d) => (
            <LineChart data={d}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={3} />
              <YAxis domain={['auto', 'auto']} />
              <Tooltip />
              <Line type="monotone" dataKey="rain" name="Rain (mm)" stroke="#2b6cb0" strokeWidth={2} dot />
            </LineChart>
          )}
        </Chart>
      </div>
      <ul className="facts">
        <li>
          <Term id="rainVariability">Rain variability</Term>, <Term id="evapotranspiration">water demand of the air</Term> and <Term id="heavyRain">heavy-rain days</Term> are used in each rotation card below.
        </li>
        <li>Heavy rain here means more than {r1(ctx.heavyMm)} mm in a day (the 95th percentile of rainy days in this record).</li>
      </ul>
    </section>
  )
}
