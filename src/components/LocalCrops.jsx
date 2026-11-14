import crops from '../data/crops.json'
import { LEVEL_TEXT } from '../api/localCrops.js'

const CHIP = { place: 'Grown nearby', region: 'Grown in your region', country: 'Grown in your country', mention: 'Mentioned', none: 'Not found' }

export default function LocalCrops({ local, status }) {
  if (status === 'loading') return <section className="panel"><h2>Grown around here</h2><p>Looking up what is grown near your farm...</p></section>
  if (!local?.available) {
    return (
      <section className="panel" aria-labelledby="lc-h">
        <h2 id="lc-h">Grown around here</h2>
        <p className="lead">We could not find local crop information for this spot, so suggestions use climate only.</p>
        {local?.reason && <p className="hint">{local.reason}</p>}
      </section>
    )
  }
  const rows = crops
    .map((c) => ({ crop: c, ...local.crops[c.id] }))
    .filter((r) => r.level !== 'none')
    .sort((a, b) => b.score - a.score || a.crop.name.localeCompare(b.crop.name))
  return (
    <section className="panel" aria-labelledby="lc-h">
      <h2 id="lc-h">Grown around {local.place.city || local.place.locality || 'your farm'}</h2>
      <p className="lead">
        We read articles about {local.place.label || 'your area'} and looked for the crops in our table. Crops named in articles about your own village, town or district come first.
      </p>
      {rows.length === 0 && <p>No crop from our table was found in those articles.</p>}
      <ul className="localist">
        {rows.map((r) => (
          <li key={r.crop.id}>
            <div className="lc-head">
              <strong>{r.crop.name}</strong>
              <span className={`chip-level lv-${r.level}`}>{CHIP[r.level]}</span>
            </div>
            <small>{LEVEL_TEXT[r.level]}.</small>
            {r.snippets.slice(0, 2).map((s, i) => (
              <blockquote key={i}>
                “{s.text}”
                <cite>
                  {' '}
                  from <a href={s.url} target="_blank" rel="noreferrer">{s.page}</a> (Wikipedia)
                </cite>
              </blockquote>
            ))}
          </li>
        ))}
      </ul>
      <h3>Articles we read</h3>
      <ul className="pages">
        {local.pages.map((p) => (
          <li key={p.title}>
            <a href={p.url} target="_blank" rel="noreferrer">{p.title}</a> <small>({p.level === 'place' ? 'your place or district' : p.level === 'region' ? 'your state or region' : 'your country'})</small>
          </li>
        ))}
      </ul>
      <p className="hint">
        This is text from Wikipedia (CC BY-SA), not production statistics. It can be old or thin for small places, and a crop that is missing may still be grown. Ask a local agriculture office to confirm.
      </p>
    </section>
  )
}
