import { useEffect, useId, useRef, useState } from 'react'
import { searchGooglePlaces, suggestGooglePlaces, suggestPlaces } from '../api/geocode.js'
import { GOOGLE_KEY, loadGoogleMaps } from './GoogleMapPicker.jsx'
import KindIcon from './KindIcon.jsx'
import { highlightParts, kindLabel, moveIndex, rankSuggestions, splitName } from './placeSearchUtils.js'

function coversQuery(name, query) {
  const normalize = (text) => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
  const words = normalize(query).split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2)
  if (!words.length) return true
  const result = normalize(name)
  const hits = words.filter((word) => result.includes(word)).length
  return hits >= Math.max(1, Math.ceil(words.length * 0.65))
}

/**
 * Search box that suggests places as you type, like Google Maps.
 * Arrow keys move through the suggestions, Enter picks one, Escape closes the list.
 * Enter with nothing highlighted runs the full search across every source (onSearchAll).
 */
export default function PlaceSearch({ value, onValueChange, near, googleEnabled = false, onChoose, onSearchAll, onLocate, busy }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [googleIssue, setGoogleIssue] = useState('')
  const [active, setActive] = useState(-1)
  const [settled, setSettled] = useState('') // the text the current suggestions are for
  const run = useRef(0)
  const googleSession = useRef(null)
  const box = useRef(null)
  const listId = useId()
  const q = value.trim()
  const nearLat = near?.lat ?? null
  const nearLon = near?.lon ?? null

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
    setGoogleIssue('')
    const timer = setTimeout(async () => {
      const googleTask = googleEnabled
        ? loadGoogleMaps(GOOGLE_KEY).then(async (g) => {
          let predictionResult
          let autocompleteIssue = ''
          try {
            predictionResult = await suggestGooglePlaces(q, g, googleSession.current, nearLat != null && nearLon != null ? { lat: nearLat, lon: nearLon } : null)
          } catch (error) {
            autocompleteIssue = String(error?.message ?? 'Autocomplete unavailable').slice(0, 100)
            predictionResult = { places: [], sessionToken: null }
          }
          if (q.length < 4 || predictionResult.places.some((place) => coversQuery(place.name, q))) {
            return { ...predictionResult, issue: autocompleteIssue }
          }
          // If autocomplete returns no useful match for the typed landmark, use Places Text Search.
          const places = await searchGooglePlaces(q, g, () => {}, nearLat != null && nearLon != null ? { lat: nearLat, lon: nearLon } : null)
          const names = new Set()
          const combined = [...places, ...predictionResult.places].filter((place) => {
            const key = place.name.trim().toLocaleLowerCase()
            if (names.has(key)) return false
            names.add(key)
            return true
          })
          return { places: combined, sessionToken: predictionResult.sessionToken, issue: autocompleteIssue }
        })
        : Promise.resolve({ places: [], sessionToken: googleSession.current })
      const [openMapResult, googleResult] = await Promise.allSettled([
        suggestPlaces(q, { near: nearLat != null && nearLon != null ? { lat: nearLat, lon: nearLon } : null, minLength: 2 }),
        googleTask,
      ])
      if (id !== run.current) return
      const openMapPlaces = openMapResult.status === 'fulfilled' ? openMapResult.value : []
      const googlePlaces = googleResult.status === 'fulfilled' ? googleResult.value.places : []
      if (googleResult.status === 'fulfilled') googleSession.current = googleResult.value.sessionToken
      else if (googleEnabled) {
        googleSession.current = null
        setGoogleIssue('Google suggestions unavailable. Check Places API (New), billing and key restrictions; showing OSM matches.')
      }
      if (googleEnabled && googleResult.status === 'fulfilled' && googleResult.value.issue) {
        setGoogleIssue(`Google autocomplete had an issue (${googleResult.value.issue}); showing available Places and map matches.`)
      } else if (googleEnabled && googleResult.status === 'fulfilled' && googlePlaces.length === 0) {
        setGoogleIssue('Google returned no suggestions for this query; showing map matches.')
      }
      const names = new Set()
      const combined = [...googlePlaces, ...openMapPlaces].filter((p) => {
        const key = p.name.trim().toLocaleLowerCase()
        if (names.has(key)) return false
        names.add(key)
        return true
      })
      setItems(rankSuggestions(combined, q))
      setSettled(q)
      setActive(-1)
      setLoading(false)
    }, 280)
    return () => clearTimeout(timer)
  }, [q, googleEnabled, nearLat, nearLon])

  // Close when the user clicks somewhere else.
  useEffect(() => {
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const showLocate = open && q.length < 2
  const options = showLocate ? [{ locate: true }] : items
  const listOpen = open && (showLocate || q.length >= 2)

  async function pick(p) {
    setOpen(false)
    if (p.locate) return onLocate()
    if (p.googlePrediction) {
      setLoading(true)
      try {
        const place = p.googlePrediction.toPlace()
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'types'] })
        if (!place.location) throw new Error('Google did not return a map location for this place.')
        const position = place.location
        const label = [place.displayName, place.formattedAddress].filter(Boolean).join(', ') || p.name
        googleSession.current = null
        onChoose({ name: label, lat: position.lat(), lon: position.lng(), kind: place.types?.[0] ?? p.kind, source: 'Google' })
      } catch {
        googleSession.current = null
        setGoogleIssue('Google could not load this place. Searching all available sources instead.')
        onSearchAll()
      } finally {
        setLoading(false)
      }
      return
    }
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
        googleSession.current = null
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
          {!showLocate && googleIssue && <li className="combo-foot google-issue" role="status">{googleIssue}</li>}
          {showLocate && (
            <li id={`${listId}-o0`} role="option" aria-selected={active === 0} className={`combo-opt locate ${active === 0 ? 'on' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick({ locate: true }) }} onMouseEnter={() => setActive(0)}>
              <span className="pin" aria-hidden="true"><KindIcon locate /></span>
              <span className="txt"><strong>Use my current location</strong></span>
            </li>
          )}
          {!showLocate && items.map((p, i) => {
            const { main, rest } = splitName(p.name)
            return (
              <li key={`${p.lat},${p.lon},${i}`} id={`${listId}-o${i}`} role="option" aria-selected={active === i} className={`combo-opt ${active === i ? 'on' : ''}`} onMouseDown={(e) => { e.preventDefault(); pick(p) }} onMouseEnter={() => setActive(i)}>
                <span className="pin" aria-hidden="true"><KindIcon kind={p.kind} /></span>
                <span className="txt">
                  <span className="main">{highlightParts(main, q).map((s, k) => (s.match ? <b key={k}>{s.text}</b> : <span key={k}>{s.text}</span>))}</span>
                  {rest && <span className="rest">{rest}</span>}
                </span>
                {(kindLabel(p.kind) || p.source) && <span className={`kind ${p.source === 'Google' ? 'google-source' : ''}`}>{kindLabel(p.kind) || 'Place'} · {p.source === 'Google' ? 'Google' : 'OSM'}</span>}
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
