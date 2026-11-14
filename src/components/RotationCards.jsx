import { COMPONENT_LABELS } from '../scoring/explain.js'
import { MONTH_NAMES } from '../scoring/rotation.js'
import { DISCLAIMER } from '../data/glossary.js'
import Term from './Term.jsx'

const r0 = Math.round

function Bar({ label, value }) {
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <span className="bar" aria-hidden="true">
        <span className="bar-fill" style={{ width: `${r0(value)}%` }} />
      </span>
      <span className="bar-num">{r0(value)}/100</span>
    </div>
  )
}

function Timeline({ card }) {
  // Month by month: crop name initial or "bare". Text labels so colour is not the only signal.
  const months = card.bareFraction.map((b, m) => (b >= 0.5 ? 'Bare' : 'Crop'))
  return (
    <div className="timeline" role="list" aria-label="Months with and without a crop">
      {months.map((s, m) => (
        <span role="listitem" key={m} className={s === 'Bare' ? 'tl bare' : 'tl crop'}>
          <small>{MONTH_NAMES[m]}</small>
          <b>{s}</b>
        </span>
      ))}
    </div>
  )
}

function Section({ title, items, render }) {
  return (
    <div className="card-sec">
      <h4>{title}</h4>
      <ul>
        {items.map((it, i) => (
          <li key={i}>{render ? render(it) : it}</li>
        ))}
      </ul>
    </div>
  )
}

function Card({ card, total }) {
  const order = ['water', 'income', 'soil', 'erosion', 'heat', 'pest']
  return (
    <article className={`card ${card.kind === 'baseline' ? 'baseline' : ''}`}>
      <header>
        <p className="kind">{card.kind === 'baseline' ? 'Your current rotation' : card.label}</p>
        <h3>{card.name}</h3>
        <p className="crops">{card.items.map((it) => `${it.crop.name} (sow ${MONTH_NAMES[it.sowMonth - 1]})`).join(' then ')}</p>
        <p className="overall">
          <span className="big">{r0(card.overall)}</span>/100 overall <span className="rank">Rank {card.rank} of {total}</span>
        </p>
        <p className="conf">
          <Term id="confidence">Confidence</Term>: <strong>{card.confidence.level}</strong>
        </p>
      </header>

      <div className="bars">
        {order.map((k) => (
          <Bar key={k} label={COMPONENT_LABELS[k]} value={card.components[k].score} />
        ))}
      </div>

      <Section title="Why this was suggested" items={card.why} />
      <Section title="Evidence from NASA data" items={card.evidence} render={(e) => (<>{e.text} <span className="src">Source: {e.source}</span></>)} />
      <Section title="Benefits" items={card.benefits} />
      <Section title="Risks needing local expert review" items={card.risks} />

      <details>
        <summary>Information gaps ({card.gaps.length})</summary>
        <ul>
          {card.gaps.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Why this confidence level?</summary>
        <ul>
          {card.confidence.reasons.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>What would change this result?</summary>
        <ul>
          {card.whatWouldChange.map((g, i) => (
            <li key={i}>{g}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>How each score was calculated</summary>
        {order.map((k) => (
          <p key={k} className="formula">
            <strong>{COMPONENT_LABELS[k]} ({r0(card.components[k].score)}):</strong> {card.components[k].formula}
          </p>
        ))}
        <p className="formula">Overall = 0.8 x (your priority weights x water, income, soil and erosion scores) + 0.1 x heat and frost + 0.1 x pest and disease. Weights are in weights.json.</p>
      </details>
      <details>
        <summary>Field cover through the year</summary>
        <Timeline card={card} />
        <p className="note">Based on the sowing calendar, not on satellite images.</p>
      </details>
      {card.variants.length > 1 && (
        <p className="note">Best of {card.variants.length} variants tested: {card.variants.map((v) => `${v.name} (${r0(v.overall)})`).join('; ')}.</p>
      )}
    </article>
  )
}

export default function RotationCards({ result, priorities }) {
  if (result.error) return <p className="error" role="alert">{result.error}</p>
  return (
    <section aria-labelledby="rot-h">
      <h2 id="rot-h">5. Rotation comparison</h2>
      <p className="disclaimer" role="note">{DISCLAIMER}</p>
      <p>Your current rotation is first. Scores are 0 to 100, based on your priorities (water {priorities.water}, income {priorities.income}, soil {priorities.soil}, erosion {priorities.erosion}) and on NASA climate data. A higher score is a better fit on paper, not a guarantee of yield or profit.</p>
      {result.skipped.length > 0 && <p className="note">Not scored (climate record too short or invalid): {result.skipped.join(', ')}.</p>}
      <div className="cards">
        {result.cards.map((c) => (
          <Card card={c} total={result.cards.length} key={c.kind} />
        ))}
      </div>
    </section>
  )
}

