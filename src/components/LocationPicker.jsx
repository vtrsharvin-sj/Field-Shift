import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, LayersControl, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { googleMapsLink, parseCoordinates, searchPlaces } from '../api/geocode.js'
import GoogleMapPicker, { GOOGLE_KEY } from './GoogleMapPicker.jsx'
import { DEMO_FARMS } from '../demo.js'

function ClickHandler({ onPick }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4))) })
  return null
}

function Recenter({ lat, lon }) {
  const map = useMap()
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lon)) map.setView([lat, lon], Math.max(map.getZoom(), 7))
  }, [lat, lon, map])
  return null
}

export default function LocationPicker({ farm, onChange, onUseDemo }) {
  const lat = Number(farm.lat)
  const lon = Number(farm.lon)
  const valid = farm.lat !== '' && farm.lon !== '' && Number.isFinite(lat) && Number.isFinite(lon)
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState([])
  const [msg, setMsg] = useState('')
  const [paste, setPaste] = useState('')
  const [googleFailed, setGoogleFailed] = useState('')
  const useGoogle = Boolean(GOOGLE_KEY) && !googleFailed

  function applyPaste(text) {
    setPaste(text)
    const p = parseCoordinates(text)
    if (p) {
      onChange({ lat: p.lat, lon: p.lon })
      setMsg(`Location set to ${p.lat}, ${p.lon}.`)
    } else if (text.trim()) setMsg('Could not read a location from that. Paste coordinates like 10.95, 77.1 or a full Google Maps link.')
  }

  async function search(e) {
    e.preventDefault()
    setMsg('Searching...')
    try {
      const found = await searchPlaces(query)
      setPlaces(found)
      setMsg(found.length ? '' : 'No place found. Try a different spelling, or tap the map.')
    } catch (err) {
      setMsg(`Search failed: ${err.message} You can still tap the map.`)
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

  return (
    <section aria-labelledby="loc-h">
      <h2 id="loc-h">Where is your farm?</h2>
      <p className="lead">Search for a place, tap the map, or use your location. This works anywhere on land.</p>
      <form className="searchrow" onSubmit={search}>
        <label>
          Search a place
          <input type="search" value={query} placeholder="Village, town or district" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="submit" className="secondary">Search</button>
        <button type="button" className="secondary" onClick={locate}>Use my location</button>
      </form>
      {msg && <p className="note" aria-live="polite">{msg}</p>}
      {places.length > 0 && (
        <ul className="places">
          {places.map((p) => (
            <li key={`${p.lat},${p.lon}`}>
              <button type="button" className="link" onClick={() => { onChange({ lat: p.lat, lon: p.lon }); setPlaces([]) }}>{p.name}</button>
            </li>
          ))}
        </ul>
      )}
      {googleFailed && <p className="hint">Google Maps could not load ({googleFailed}). Showing the free OpenStreetMap map instead.</p>}
      <div className="map-wrap">
        {useGoogle ? (
          <GoogleMapPicker lat={lat} lon={lon} valid={valid} onPick={(la, lo) => onChange({ lat: la, lon: lo })} onFail={setGoogleFailed} />
        ) : (
          <MapContainer center={valid ? [lat, lon] : [20, 20]} zoom={valid ? 8 : 2} scrollWheelZoom={false} style={{ height: '320px', width: '100%' }}>
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="Street map">
                <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satellite">
                <TileLayer attribution="Imagery &copy; Esri, Maxar, Earthstar Geographics" url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
              </LayersControl.BaseLayer>
            </LayersControl>
            <ClickHandler onPick={(la, lo) => onChange({ lat: la, lon: lo })} />
            <Recenter lat={lat} lon={lon} />
            {valid && <CircleMarker center={[lat, lon]} radius={10} pathOptions={{ color: '#7a1f00', fillColor: '#ff6a2b', fillOpacity: 0.8 }} />}
          </MapContainer>
        )}
      </div>
      <label className="block">
        Paste coordinates or a Google Maps link
        <input type="text" value={paste} placeholder="10.95, 77.1  or  https://www.google.com/maps/@10.95,77.1,15z" onChange={(e) => applyPaste(e.target.value)} />
      </label>
      <p className="hint">Tip: in Google Maps, right-click your field and click the coordinates at the top of the menu to copy them, then paste here.</p>
      <div className="grid3">
        <label>
          Latitude
          <input type="number" step="0.0001" value={farm.lat} onChange={(e) => onChange({ lat: e.target.value })} />
        </label>
        <label>
          Longitude
          <input type="number" step="0.0001" value={farm.lon} onChange={(e) => onChange({ lon: e.target.value })} />
        </label>
        <label>
          Or try an example farm
          <select value="" onChange={(e) => e.target.value && onUseDemo(e.target.value)}>
            <option value="">Choose...</option>
            {DEMO_FARMS.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
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

