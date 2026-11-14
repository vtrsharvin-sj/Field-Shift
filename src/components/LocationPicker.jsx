import { MapContainer, TileLayer, CircleMarker, useMapEvents, useMap } from 'react-leaflet'
import { useEffect } from 'react'
import 'leaflet/dist/leaflet.css'
import { DEMO_FARM } from '../demo.js'

function ClickHandler({ onPick }) {
  useMapEvents({ click: (e) => onPick(Number(e.latlng.lat.toFixed(4)), Number(e.latlng.lng.toFixed(4))) })
  return null
}

function Recenter({ lat, lon }) {
  const map = useMap()
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lon)) map.setView([lat, lon], map.getZoom())
  }, [lat, lon, map])
  return null
}

export default function LocationPicker({ farm, onChange, onUseDemo }) {
  const lat = Number(farm.lat)
  const lon = Number(farm.lon)
  const valid = Number.isFinite(lat) && Number.isFinite(lon)
  return (
    <section aria-labelledby="loc-h">
      <h2 id="loc-h">1. Where is your farm?</h2>
      <p>Tap the map, or type the latitude and longitude. The tool uses NASA climate data for this point.</p>
      <div className="map-wrap">
        <MapContainer center={valid ? [lat, lon] : [DEMO_FARM.lat, DEMO_FARM.lon]} zoom={8} scrollWheelZoom={false} style={{ height: '320px', width: '100%' }}>
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
        <button type="button" className="secondary" onClick={onUseDemo}>
          Use demo farm (Coimbatore)
        </button>
      </div>
    </section>
  )
}
