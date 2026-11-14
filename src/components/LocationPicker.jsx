import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMapEvents, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { searchPlaces } from '../api/geocode.js'
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
      <h2 id="loc-h">1. Where is your farm?</h2>
      <p>Search for a place, tap the map, use your location, or type the latitude and longitude. The tool works anywhere on land and uses NASA climate data for that point.</p>
      <form className="row" onSubmit={search}>
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
      <div className="map-wrap">
        <MapContainer center={valid ? [lat, lon] : [20, 20]} zoom={valid ? 8 : 2} scrollWheelZoom={false} style={{ height: '320px', width: '100%' }}>
          <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <ClickHandler onPick={(la, lo) => onChange({ lat: la, lon: lo })} />
          <Recenter lat={lat} lon={lon} />
          {valid && <CircleMarker center={[lat, lon]} radius={10} pathOptions={{ color: '#7a1f00', fillColor: '#ff6a2b', fillOpacity: 0.8 }} />}
        </MapContainer>
      </div>
      <div className="row">
        <label>
          Latitude
          <input type="number" step="0.0001" value={farm.lat} onChange={(e) => onChange({ lat: e.target.value })} />
        </label>
        <label>
          Longitude
          <input type="number" step="0.0001" value={farm.lon} onChange={(e) => onChange({ lon: e.target.value })} />
        </label>
        <label>
          Try a demo farm
          <select value="" onChange={(e) => e.target.value && onUseDemo(e.target.value)}>
            <option value="">Choose...</option>
            {DEMO_FARMS.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )
}
