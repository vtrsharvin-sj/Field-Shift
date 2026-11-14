import { DISCLAIMER } from '../data/glossary.js'

export function Header({ onHome, showHome }) {
  return (
    <header className="appbar">
      <div className="appbar-in">
        <button type="button" className="brand" onClick={onHome} aria-label="FieldShift, start over">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28"><circle cx="16" cy="16" r="15" fill="#22543d" /><path d="M16 25V14M16 14c0-4 3-7 8-7 0 4-3 7-8 7zM16 18c0-3-2-5-6-5 0 3 2 5 6 5z" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span>FieldShift</span>
        </button>
        <span className="appbar-badge">Uses NASA data</span>
        {showHome && (
          <button type="button" className="ghost" onClick={onHome}>
            New analysis
          </button>
        )}
      </div>
    </header>
  )
}

export function Hero({ onStart }) {
  return (
    <section className="hero" aria-labelledby="hero-h">
      <p className="eyebrow">NASA Earth observations · farmer-led decisions</p>
      <h1 id="hero-h">Make the next rotation a more resilient one.</h1>
      <p className="hero-sub">FieldShift turns a farm location, local soil context and farmer priorities into a transparent comparison of crop-rotation options. Explore two decades of NASA climate records, then see the evidence, trade-offs and unknowns behind every suggestion.</p>
      <ul className="hero-points">
        <li><strong>Start with your farm.</strong> Choose a place, soil, water situation and the crops you grow now.</li>
        <li><strong>Clear reasons.</strong> Every score shows why, the NASA numbers behind it, and the risks.</li>
        <li><strong>Keep people in the loop.</strong> See uncertainty, data gaps and risks to review with local experts.</li>
      </ul>
      <div className="hero-cta">
        <button type="button" className="primary big" onClick={onStart}>Start with my farm</button>
      </div>
    </section>
  )
}

export function Stepper({ step, onGo, canGo }) {
  const steps = ['Location', 'Your farm', 'Priorities']
  return (
    <nav className="stepper" aria-label="Progress">
      <ol>
        {steps.map((label, i) => (
          <li key={label} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
            <button type="button" onClick={() => onGo(i)} disabled={!canGo(i)}>
              <span className="num">{i < step ? '✓' : i + 1}</span>
              <span className="lab">{label}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export function Loading({ stage }) {
  const steps = [
    ['Reading your location', stage >= 0],
    ['Downloading NASA weather history (2005 to this year)', stage >= 1],
    ['Checking which crops suit this climate', stage >= 2],
    ['Comparing rotations', stage >= 3],
  ]
  return (
    <section className="loading card-plain" aria-live="polite" role="status">
      <div className="spinner" aria-hidden="true" />
      <h2>Working on your farm</h2>
      <p>The NASA download can take up to a minute the first time. It is saved in your browser afterwards.</p>
      <ul>
        {steps.map(([t, done]) => (
          <li key={t} className={done ? 'on' : ''}>{done ? '✓ ' : '• '}{t}</li>
        ))}
      </ul>
    </section>
  )
}

export function Footer() {
  return (
    <footer className="footer">
      <p><strong>{DISCLAIMER}</strong></p>
      <p>Climate data: NASA POWER and MODIS (NASA). Soil: SoilGrids (ISRIC). Elevation: Copernicus DEM (ESA). Local crops: Wikipedia text (CC BY-SA). Maps: Google Maps (or OpenStreetMap contributors and Esri imagery when Google is off). Scores are rule-based and shown in full on each card.</p>
    </footer>
  )
}
