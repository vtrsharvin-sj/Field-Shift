import { useEffect, useId, useRef, useState } from 'react'
import { suggestPlaces } from '../api/geocode.js'
import { highlightParts, kindLabel, moveIndex, rankSuggestions, splitName } from './placeSearchUtils.js'

/**
 * Search box that suggests places as you type, like Google Maps.
 * Arrow keys move through the suggestions, Enter picks one, Escape closes the list.
 * Enter with nothing highlighted runs the full search across every source (onSearchAll).
 */
export default function PlaceSearch({ value, onValueChange, near, onChoose, onSearchAll, onLocate, busy }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(-1)
  const [settled, setSettled] = useState('') // the text the current suggestions are for
  const run = useRef(0)
  const box = useRef(null)
  const listId = useId()
  const q = value.trim()

  // Fetch suggestions shortly after the user stops typing. A counter drops answers that arrive late.
  useEffect(() => {
    const id = ++run.current
    if (q.length < 2) {
      setItems([])
      setLoading(false)
      setSettled('')
      return undefined
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const found = await suggestPlaces(q, { near, minLength: 2 })
        if (id !== run.current) return
        setItems(rankSuggestions(found, q))
        setSettled(q)
        setActive(-1)
      } catch {
        if (id === run.current) setItems([])
      } finally {
        if (id === run.current) setLoading(false)
      }
    }, 180)
    return () => clearTimeout(timer)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close when the user clicks somewhere else.
  useEffect(() => {
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const showLocate = open && q.length < 2
  const options = showLocate ? [{ locate: true }] : items
  const listOpen = open && (showLocate || q.length >= 2)

  function pick(p) {
    setOpen(false)
    if (p.locate) return onLocate()
    onChoose(p)
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((cur) => moveIndex(cur, e.key === 'ArrowDown' ? 1 : -1, options.length))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (listOpen && active >= 0 && options[active]) pick(options[active])
      else {
        setOpen(false)
        onSearchAll()
      }
    } else if (e.key === 'Escape') setOpen(false)
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="combo" ref={box}>
      <label htmlFor={`${listId}-in`}>Search by place or landmark name</label>
      <div className="combo-field">
        <span className="combo-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M15 15l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        </span>
        <input
          id={`${listId}-in`}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={`${listId}-list`}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-o${active}` : undefined}
          autoComplete="off"
          value={value}
          placeholder="Type a place or landmark name"
          onChange={(e) => { onValueChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {(loading || busy) && <span className="combo-spin spinner small" aria-hidden="true" />}
        {value && !loading && !busy && (
          <button type="button" className="combo-clear" aria-label="Clear the search" onClick={() => { onValueChange(''); setItems([]); setOpen(false) }}>×</button>
        )}
      </div>
      {listOpen && (
        <ul className="combo-list" id={`${listId}-list`} role="listbox" aria-label="Suggestions">
          {showLocate && (
            <li id={`${listId}-o0`} role="option" aria-selected={active === 0} className={`combo-opt locate ${active === 0 ? 'on' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick({ locate: true }) }} onMouseEnter={() => setActive(0)}>
              <span className="pin" aria-hidden="true">◎</span>
              <span className="txt"><strong>Use my current location</strong></span>
            </li>
          )}
          {!showLocate && items.map((p, i) => {
            const { main, rest } = splitName(p.name)
            return (
              <li key={`${p.lat},${p.lon},${i}`} id={`${listId}-o${i}`} role="option" aria-selected={active === i} className={`combo-opt ${active === i ? 'on' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(p) }} onMouseEnter={() => setActive(i)}>
                <span className="pin" aria-hidden="true">📍</span>
                <span className="txt">
                  <span className="main">{highlightParts(main, q).map((s, k) => (s.match ? <b key={k}>{s.text}</b> : <span key={k}>{s.text}</span>))}</span>
                  {rest && <span className="rest">{rest}</span>}
                </span>
                {kindLabel(p.kind) && <span className="kind">{kindLabel(p.kind)}</span>}
              </li>
            )
          })}
          {!showLocate && !loading && settled === q && items.length === 0 && (
            <li className="combo-empty">No quick matches. Press Enter to search more sources, or tap the map.</li>
          )}
          {!showLocate && items.length > 0 && (
            <li className="combo-foot">Press Enter to search every source for “{q}”</li>
          )}
        </ul>
      )}
    </div>
  )
}
