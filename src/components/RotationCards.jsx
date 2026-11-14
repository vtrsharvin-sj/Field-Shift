import { useState } from 'react'
import { COMPONENT_HELP, COMPONENT_LABELS, CONFIDENCE_HELP, verdict } from '../scoring/explain.js'
import { MONTH_NAMES } from '../scoring/rotation.js'
import Term from './Term.jsx'

const r0 = Math.round
const ORDER = ['water', 'income', 'soil', 'erosion', 'heat', 'pest', 'climate']
const MAIN = ['water', 'income', 'soil', 'erosion']

function Ring({ value }) {
  const R = 34
  const C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 80 80" className="ring" role="img" aria-label={`${r0(value)} out of 100`}>
      <circle cx="40" cy="40" r={R} className="ring-bg" />
      <circle cx="40" cy="40" r={R} className="ring-fg" strokeDasharray={`${(C * value) / 100} ${C}`} transform="rotate(-90 40 40)" />
      <text x="40" y="46" textAnchor="middle" className="ring-num">{r0(value)}</text>
    </svg>
  )
}

function MiniBar({ label, help, value }) {
  return (
    <div className="mini" title={help}>
      <span className="mini-label">{label}</span>
      <span className="mini-bar" aria-hidden="true"><span style={{ width: `${r0(value)}%` }} /></span>
      <span className="mini-num">{r0(value)}</span>
    </div>
  )
}

function Timeline({ card }) {
  return (
    <div className="timeline" role="list" aria-label="Months with and without a crop in the field">
      {card.bareFraction.map((b, m) => (
        <span role="listitem" key={m} className={b >= 0.5 ? 'tl bare' : 'tl crop'}>
          <small>{MONTH_NAMES[m]}</small>
          <b>{b >= 0.5 ? 'Bare' : 'Crop'}</b>
        </span>
      ))}
    </div>
  )
}

const TABS = [
  ['benefits', 'Benefits'],
  ['risks', 'Risks to check'],
  ['evidence', 'NASA evidence'],
  ['gaps', 'What we do not know'],
  ['how', 'How it was scored'],
]

function Details({ card }) {
  const [tab, setTab] = useState('benefits')
  return (
    <div className="details">
      <div className="tabs small" role="tablist" aria-label="More about this rotation">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="tabpanel" role="tabpanel">
        {tab === 'benefits' && <ul>{card.benefits.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        {tab === 'risks' && (
          <>
            <ul>{card.risks.map((t, i) => <li key={i}>{t}</li>)}</ul>
            <h5>What would change this result?</h5>
            <ul>{card.whatWouldChange.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </>
        )}
        {tab === 'evidence' && (
          <ul>
            {card.evidence.map((e, i) => (
              <li key={i}>
                {e.text}
                <span className="src">Source: {e.source}</span>
              </li>
            ))}
          </ul>
        )}
        {tab === 'gaps' && <ul>{card.gaps.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        {tab === 'how' && (
          <>
            {ORDER.map((k) => (
              <p key={k} className="formula">
                <strong>{COMPONENT_LABELS[k]} ({r0(card.components[k].score)}):</strong> {card.components[k].formula}
              </p>
            ))}
            <p className="formula">
              Overall = (0.8 x your priority weights x water, income, soil and erosion + 0.1 x heat and frost + 0.1 x pest and disease) x a temperature-fit factor between 0.4 and 1. All weights are in weights.json.
            </p>
            <h5>Months with a crop in the field</h5>
            <Timeline card={card} />
            <p className="hint">Based on the sowing calendar, not on satellite images.</p>
          </>
        )}
      </div>
    </div>
  )
}

function Card({ card, total, isBest }) {
  const [open, setOpen] = useState(false)
  const v = verdict(card.overall)
  return (
    <article className={`rcard ${card.kind === 'baseline' ? 'baseline' : ''} ${isBest ? 'best' : ''}`}>
      <header>
        <div className="tags">
          {card.kind === 'baseline' && <span className="tag blue">Your current rotation</span>}
          {card.kind !== 'baseline' && <span className="tag">{card.label}</span>}
          {isBest && <span className="tag green">★ Best fit for your priorities</span>}
        </div>
        <h3>{card.name}</h3>
        <p className="crops">
          {card.items.map((it) => `${it.crop.name} (sow ${MONTH_NAMES[it.sowMonth - 1]}${card.items.some((x) => x.year > 0) ? `, year ${it.year + 1}` : ''})`).join(' → ')}
        </p>
      </header>

      <div className="scorebox">
        <Ring value={card.overall} />
        <div>
          <p className={`verdict ${v.tone}`}>{v.label}</p>
          <p className="rank">Ranked {card.rank} of {total}</p>
          <p className={`conf conf-${card.confidence.level.toLowerCase()}`} title={CONFIDENCE_HELP[card.confidence.level]}>
            <Term id="confidence">Confidence</Term>: <strong>{card.confidence.level}</strong>
          </p>
        </div>
      </div>

      <div className="minis">
        {MAIN.map((k) => (
          <MiniBar key={k} label={COMPONENT_LABELS[k]} help={COMPONENT_HELP[k]} value={card.components[k].score} />
        ))}
      </div>

      <div className="why">
        <h4>Why this result</h4>
        <ul>{card.why.slice(0, 3).map((t, i) => <li key={i}>{t}</li>)}</ul>
      </div>
      <p className="confnote">{CONFIDENCE_HELP[card.confidence.level]}</p>

      <button type="button" className="more" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide details' : 'See details: benefits, risks, evidence, gaps'}
      </button>
      {open && (
        <>
          <details className="confwhy">
            <summary>Why this confidence level?</summary>
            <ul>{card.confidence.reasons.map((t, i) => <li key={i}>{t}</li>)}</ul>
          </details>
          <Details card={card} />
        </>
      )}
    </article>
  )
}

function Compare({ cards }) {
  const best = Object.fromEntries(ORDER.map((k) => [k, Math.max(...cards.map((c) => c.components[k].score))]))
  return (
    <div className="compare-wrap">
      <table className="compare">
        <caption>All factors side by side (0 to 100, higher is better)</caption>
        <thead>
          <tr>
            <th scope="col">Factor</th>
            {cards.map((c) => (
              <th scope="col" key={c.kind}>{c.kind === 'baseline' ? 'Your current' : c.label.replace(' rotation', '')}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ORDER.map((k) => (
            <tr key={k}>
              <th scope="row" title={COMPONENT_HELP[k]}>{COMPONENT_LABELS[k]}</th>
              {cards.map((c) => {
                const val = r0(c.components[k].score)
                const top = r0(best[k]) === val
                return (
                  <td key={c.kind} className={top ? 'top' : ''}>
                    {val}{top ? ' ★' : ''}
                  </td>
                )
              })}
            </tr>
          ))}
          <tr className="total">
            <th scope="row">Overall</th>
            {cards.map((c) => (
              <td key={c.kind}>{r0(c.overall)}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="hint">★ marks the best score in each row. Hover a factor name for what it means.</p>
    </div>
  )
}

export default function RotationCards({ result }) {
  if (result.error) return <p className="error" role="alert">{result.error}</p>
  const best = [...result.cards].sort((a, b) => b.overall - a.overall)[0]
  return (
    <div>
      {result.skipped.length > 0 && (
        <p className="hint">No suitable rotation was found for: {result.skipped.join(', ')}. No crop in the table fit this climate for that strategy.</p>
      )}
      <Compare cards={result.cards} />
      <div className="rcards">
        {result.cards.map((c) => (
          <Card card={c} total={result.cards.length} isBest={c === best && result.cards.length > 1} key={c.kind} />
        ))}
      </div>
    </div>
  )
}
