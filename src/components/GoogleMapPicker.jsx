import { useEffect, useRef, useState } from 'react'

export const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''

let loader = null

/** Load the Maps JavaScript API once. Rejects if the script fails or Google rejects the key. */
export function loadGoogleMaps(key) {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'))
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (loader) return loader
  loader = new Promise((resolve, reject) => {
    window.gm_authFailure = () => reject(new Error('Google rejected the API key (check that Maps JavaScript API is enabled and the key allows this website).'))
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&callback=__gmapsReady`
    s.async = true
    s.onerror = () => reject(new Error('Could not load Google Maps.'))
    window.__gmapsReady = () => resolve(window.google.maps)
    document.head.appendChild(s)
  })
  loader.catch(() => { loader = null })
  return loader
}

/**
 * Google map that reports clicks as coordinates.
 * - Opens as a normal road map so landmarks, shops, temples, colleges and other places are labelled. The Satellite button shows farmland.
 * - Clicking a landmark icon picks that landmark's position.
 * - Search results are drawn as numbered markers; clicking one chooses it.
 * Calls onFail(message) so the parent can fall back to another map.
 */
export default function GoogleMapPicker({ lat, lon, valid, places = [], flyTo = null, onPick, onPickPlace, onFail }) {
  const box = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const halo = useRef(null)
  const resultMarkers = useRef([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let dead = false
    loadGoogleMaps(GOOGLE_KEY)
      .then((maps) => {
        if (dead || !box.current) return
        map.current = new maps.Map(box.current, {
          center: valid ? { lat, lng: lon } : { lat: 20, lng: 20 },
          zoom: valid ? 11 : 2,
          mapTypeId: 'roadmap',
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: true,
          gestureHandling: 'cooperative',
        })
        // A clean dot with a soft halo instead of the default red pin.
        halo.current = new maps.Marker({ map: map.current, position: valid ? { lat, lng: lon } : null, clickable: false, zIndex: 1, icon: { path: maps.SymbolPath.CIRCLE, scale: 20, fillColor: '#2f7a57', fillOpacity: 0.22, strokeWeight: 0 } })
        marker.current = new maps.Marker({ map: map.current, position: valid ? { lat, lng: lon } : null, title: 'Your farm', zIndex: 2, icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#22543d', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 3 } })
        map.current.addListener('click', (e) => {
          if (e.placeId && e.stop) e.stop() // pick the landmark's position instead of opening Google's info window
          onPick(Number(e.latLng.lat().toFixed(4)), Number(e.latLng.lng().toFixed(4)))
        })
        setReady(true)
      })
      .catch((e) => !dead && onFail(e.message))
    return () => { dead = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!ready || !valid) return
    const pos = { lat, lng: lon }
    marker.current.setPosition(pos)
    halo.current?.setPosition(pos)
    map.current.panTo(pos)
    if (flyTo) map.current.setZoom(flyTo.zoom) // chosen from the search: show it close up
    else if (map.current.getZoom() < 9) map.current.setZoom(11)
  }, [ready, valid, lat, lon, flyTo])

  // Numbered markers for the search results, and fit the map to all of them.
  useEffect(() => {
    if (!ready) return
    const maps = window.google.maps
    resultMarkers.current.forEach((m) => m.setMap(null))
    resultMarkers.current = places.map((p, i) => {
      const m = new maps.Marker({ map: map.current, position: { lat: p.lat, lng: p.lon }, zIndex: 3, label: { text: String(i + 1), color: '#ffffff', fontWeight: '700', fontSize: '12px' }, title: p.name, icon: { path: maps.SymbolPath.CIRCLE, scale: 12, fillColor: '#1e4e8c', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 } })
      m.addListener('click', () => onPickPlace?.(p))
      return m
    })
    if (places.length > 1) {
      const b = new maps.LatLngBounds()
      places.forEach((p) => b.extend({ lat: p.lat, lng: p.lon }))
      map.current.fitBounds(b, 40)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, places])

  return <div ref={box} className="gmap" role="application" aria-label="Google map. Click a spot or a landmark to choose your farm location." />
}
