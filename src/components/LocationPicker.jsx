import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, LayersControl, Tooltip, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { googleMapsLink, parseCoordinates, searchPlaces } from '../api/geocode.js'
import PlaceSearch from './PlaceSearch.jsx'
import GoogleMapPicker, { GOOGLE_KEY } from './GoogleMapPicker.jsx'

function ClickHandler({ onPick }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4))) })
  return null
}

/** Moves the Leaflet map to the chosen point, or fits all search results when there are several. */
function Recenter({ lat, lon, places, flyTo }) {
  const map = useMap()
  useEffect(() => {
    if (places.length === 1) map.setView([places[0].lat, places[0].lon], 14)
    else if (places.length > 1) {
      const matches = places.slice(0, 5)
      const latSpan = Math.max(...matches.map((p) => p.lat)) - Math.min(...matches.map((p) => p.lat))
      const lonSpan = Math.max(...matches.map((p) => p.lon)) - Math.min(...matches.map((p) => p.lon))
      if (latSpan > 5 || lonSpan > 5) map.setView([matches[0].lat, matches[0].lon], 13)
      else map.fitBounds(matches.map((p) => [p.lat, p.lon]), { padding: [30, 30], maxZoom: 14 })
    }
    else if (Number.isFinite(lat) && Number.isFinite(lon)) map.setView([lat, lon], flyTo ? flyTo.zoom : Math.max(map.getZoom(), 7))
  }, [lat, lon, places, flyTo, map])
  return null
}

export default function LocationPicker({ farm, onChange }) {
  const lat = Number(farm.lat)
  const lon = Number(farm.lon)
  const valid = farm.lat !== '' && farm.lon !== '' && Number.isFinite(lat) && Number.isFinite(lon)
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState([]) // full search results (also drawn on the map)
  const [flyTo, setFlyTo] = useState(null) // zoom target after choosing a search result
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [paste, setPaste] = useState('')
  const [googleFailed, setGoogleFailed] = useState('')
  const useGoogle = Boolean(GOOGLE_KEY) && !googleFailed

  function choose(p) {
    onChange({ lat: Number(p.lat.toFixed(4)), lon: Number(p.lon.toFixed(4)) })
    setFlyTo({ zoom: 14, at: Date.now() }) // landmarks deserve a close view
    setPlaces([])
    setQuery(p.name.split(',')[0])
    setMsg(`Location set to ${p.name.split(',')[0]}. Tap the map to move the pin if the farm is nearby.`)
  }

  async function search(e) {
    e?.preventDefault()
    if (query.trim().length < 2) return setMsg('Type at least 2 letters.')
    setBusy(true)
    setMsg('Searching...')
    try {
      const googleIssues = []
      const found = await searchPlaces(query, {
        near: valid ? { lat, lon } : null,
        report: (service, reason) => googleIssues.push(`${service}: ${String(reason).slice(0, 90)}`),
      })
      setPlaces(found)
      const sources = [...new Set(found.map((p) => p.source).filter(Boolean))]
      const googleHint = GOOGLE_KEY && googleIssues.length
        ? ` Google API issue (${googleIssues.join('; ')}). Check Places API (New), Geocoding API, billing and key restrictions.`
        : GOOGLE_KEY && !sources.includes('Google')
          ? ' Google returned no matches; check Places API (New), billing and key restrictions.'
          : ''
      setMsg(found.length
        ? `${found.length} place${found.length === 1 ? '' : 's'} found${sources.length ? ` from ${sources.join(', ')}` : ''}. Choose one below or tap a marker on the map.${googleHint}`
        : `No place found. Try a different spelling, add the district or country, or tap the map.${GOOGLE_KEY ? ' Google returned no matches; check Places API (New), billing and key restrictions.' : ''}`)
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
    } else if (text.trim()) setMsg('Could not read a location from that. Paste latitude and longitude, or a full Google Maps link.')
  }

  const list = places
  return (
    <section aria-labelledby="loc-h">
      <h2 id="loc-h">Where is your farm?</h2>
      <p className="lead">Start typing a village, town, farm, shop, temple, college or any landmark and pick a suggestion, tap the map (landmarks are labelled), or use your location. This works anywhere on land.</p>
      <div className="searchrow" role="search">
        <PlaceSearch value={query} onValueChange={(v) => { setQuery(v); setPlaces([]) }} near={valid ? { lat, lon } : null} googleEnabled={useGoogle} onChoose={choose} onSearchAll={search} onLocate={locate} busy={busy} />
        <button type="button" className="secondary" onClick={search} disabled={busy}>{busy ? 'Searching...' : 'Search all sources'}</button>
      </div>
      <p className="hint"><button type="button" className="link" onClick={locate}>Use my current location</button></p>
      {msg && <p className="note" aria-live="polite">{msg}</p>}
      {list.length > 0 && (
        <ul className="places" aria-label="Search results">
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
          <GoogleMapPicker lat={lat} lon={lon} valid={valid} places={places} flyTo={flyTo} onPick={(la, lo) => onChange({ lat: la, lon: lo })} onPickPlace={choose} onFail={setGoogleFailed} />
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
            <Recenter lat={lat} lon={lon} places={places} flyTo={flyTo} />
            {places.map((p, i) => (
              <CircleMarker key={`${p.lat},${p.lon},${i}`} center={[p.lat, p.lon]} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1e4e8c', fillOpacity: 1 }} eventHandlers={{ click: () => choose(p) }}>
                <Tooltip>{i + 1}. {p.name.split(',')[0]}</Tooltip>
              </CircleMarker>
            ))}
            {valid && <CircleMarker center={[lat, lon]} radius={18} pathOptions={{ stroke: false, fillColor: '#2f7a57', fillOpacity: 0.22 }} interactive={false} />}
            {valid && <CircleMarker center={[lat, lon]} radius={8} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#22543d', fillOpacity: 1 }} />}
          </MapContainer>
        )}
      </div>
      <label className="block">
        Or paste coordinates or a Google Maps link
        <input type="text" value={paste} placeholder="Latitude, longitude or a Google Maps link" onChange={(e) => applyPaste(e.target.value)} />
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

