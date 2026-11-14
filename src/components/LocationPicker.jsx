import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, LayersControl, Tooltip, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { googleMapsLink, parseCoordinates, searchPlaces, suggestPlaces } from '../api/geocode.js'
import GoogleMapPicker, { GOOGLE_KEY } from './GoogleMapPicker.jsx'

function ClickHandler({ onPick }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4))) })
  return null
}

/** Moves the Leaflet map to the chosen point, or fits all search results when there are several. */
function Recenter({ lat, lon, places }) {
  const map = useMap()
  useEffect(() => {
    if (places.length > 1) map.fitBounds(places.map((p) => [p.lat, p.lon]), { padding: [30, 30], maxZoom: 14 })
    else if (Number.isFinite(lat) && Number.isFinite(lon)) map.setView([lat, lon], Math.max(map.getZoom(), 7))
  }, [lat, lon, places, map])
  return null
}

export default function LocationPicker({ farm, onChange }) {
  const lat = Number(farm.lat)
  const lon = Number(farm.lon)
  const valid = farm.lat !== '' && farm.lon !== '' && Number.isFinite(lat) && Number.isFinite(lon)
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState([]) // full search results (also drawn on the map)
  const [hints, setHints] = useState([]) // quick suggestions while typing
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [paste, setPaste] = useState('')
  const [googleFailed, setGoogleFailed] = useState('')
  const useGoogle = Boolean(GOOGLE_KEY) && !googleFailed
  const typing = useRef(0)

  // Suggestions while typing (Photon is made for this). A full search with every source runs on Enter or the Search button.
  useEffect(() => {
    const q = query.trim()
    const id = ++typing.current
    if (q.length < 3) { setHints([]); return undefined }
    const timer = setTimeout(async () => {
      try {
        const near = valid ? { lat, lon } : null
        const found = await suggestPlaces(q, { near })
        if (id === typing.current) setHints(found)
      } catch {
        if (id === typing.current) setHints([])
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  function choose(p) {
    onChange({ lat: Number(p.lat.toFixed(4)), lon: Number(p.lon.toFixed(4)) })
    setPlaces([])
    setHints([])
    setMsg(`Location set to ${p.name.split(',')[0]}.`)
  }

  async function search(e) {
    e?.preventDefault()
    setHints([])
    if (query.trim().length < 2) return setMsg('Type at least 2 letters.')
    setBusy(true)
    setMsg('Searching...')
    try {
      const found = await searchPlaces(query, { near: valid ? { lat, lon } : null })
      setPlaces(found)
      setMsg(found.length ? `${found.length} place${found.length === 1 ? '' : 's'} found. Choose one below or tap a marker on the map.` : 'No place found. Try a different spelling, add the district or country, or tap the map.')
    } catch (err) {
      setMsg(`Search failed: ${err.message} You can still tap the map.`)
    } finally {
      setBusy(false)
    }
  }

  function locate() {
    if (!navigator.geolocation) return setMsg('Your browser cannot share your location. Tap the map instead.')
    setMsg('Finding your location...')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setMsg('')
        onChange({ lat: Number(p.coords.latitude.toFixed(4)), lon: Number(p.coords.longitude.toFixed(4)) })
      },
      () => setMsg('Location permission was not given. Tap the map or search for a place instead.'),
    )
  }

  function applyPaste(text) {
    setPaste(text)
    const p = parseCoordinates(text)
    if (p) {
      onChange({ lat: p.lat, lon: p.lon })
      setMsg(`Location set to ${p.lat}, ${p.lon}.`)
    } else if (text.trim()) setMsg('Could not read a location from that. Paste coordinates like 10.95, 77.1 or a full Google Maps link.')
  }

  const list = places.length ? places : hints
  return (
    <section aria-labelledby="loc-h">
      <h2 id="loc-h">Where is your farm?</h2>
      <p className="lead">Search for a village, town, farm, shop, temple, college or any landmark by name, tap the map (landmarks are labelled), or use your location. This works anywhere on land.</p>
      <form className="searchrow" onSubmit={search} role="search">
        <label>
          Search by place or landmark name
          <input type="search" value={query} autoComplete="off" placeholder="For example: Brookefields Mall, Marudhamalai temple, a village or a college" onChange={(e) => { setQuery(e.target.value); setPlaces([]) }} />
        </label>
        <button type="submit" className="secondary" disabled={busy}>{busy ? 'Searching...' : 'Search'}</button>
        <button type="button" className="secondary" onClick={locate}>Use my location</button>
      </form>
      {msg && <p className="note" aria-live="polite">{msg}</p>}
      {list.length > 0 && (
        <ul className="places" aria-label={places.length ? 'Search results' : 'Suggestions'}>
          {list.map((p, i) => (
            <li key={`${p.lat},${p.lon},${i}`}>
              <button type="button" className="link" onClick={() => choose(p)}>
                <span className="pnum" aria-hidden="true">{places.length ? i + 1 : '•'}</span>
                <span>{p.name}</span>
              </button>
              <small>{[p.kind, p.source].filter(Boolean).join(' · ')}</small>
            </li>
          ))}
        </ul>
      )}
      {googleFailed && <p className="hint">Google Maps could not load ({googleFailed}). Showing the free OpenStreetMap map instead.</p>}
      <div className="map-wrap">
        {useGoogle ? (
          <GoogleMapPicker lat={lat} lon={lon} valid={valid} places={places} onPick={(la, lo) => onChange({ lat: la, lon: lo })} onPickPlace={choose} onFail={setGoogleFailed} />
        ) : (
          <MapContainer center={valid ? [lat, lon] : [20, 20]} zoom={valid ? 8 : 2} scrollWheelZoom={false} style={{ height: '340px', width: '100%' }}>
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Street map">
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              </LayersControl.BaseLayer>
            </LayersControl>
            <ClickHandler onPick={(la, lo) => onChange({ lat: la, lon: lo })} />
            <Recenter lat={lat} lon={lon} places={places} />
            {places.map((p, i) => (
              <CircleMarker key={`${p.lat},${p.lon},${i}`} center={[p.lat, p.lon]} radius={9} pathOptions={{ color: '#1e4e8c', fillColor: '#4f8fe0', fillOpacity: 0.9 }} eventHandlers={{ click: () => choose(p) }}>
                <Tooltip>{i + 1}. {p.name.split(',')[0]}</Tooltip>
              </CircleMarker>
            ))}
            {valid && <CircleMarker center={[lat, lon]} radius={10} pathOptions={{ color: '#7a1f00', fillColor: '#ff6a2b', fillOpacity: 0.8 }} />}
          </MapContainer>
        )}
      </div>
      <label className="block">
        Or paste coordinates or a Google Maps link
        <input type="text" value={paste} placeholder="10.95, 77.1  or  https://www.google.com/maps/@10.95,77.1,15z" onChange={(e) => applyPaste(e.target.value)} />
      </label>
      <div className="grid3">
        <label>
          Latitude
          <input type="number" step="0.0001" value={farm.lat} onChange={(e) => onChange({ lat: e.target.value })} />
        </label>
        <label>
          Longitude
          <input type="number" step="0.0001" value={farm.lon} onChange={(e) => onChange({ lon: e.target.value })} />
        </label>
      </div>
      {valid && (
        <p className="gmaps">
          <a href={googleMapsLink(lat, lon)} target="_blank" rel="noreferrer">Open this point in Google Maps</a>
        </p>
      )}
    </section>
  )
}
