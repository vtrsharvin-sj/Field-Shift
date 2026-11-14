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

/** Google map that reports clicks as coordinates. Calls onFail(message) so the parent can fall back to another map. */
export default function GoogleMapPicker({ lat, lon, valid, onPick, onFail }) {
  const box = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let dead = false
    loadGoogleMaps(GOOGLE_KEY)
      .then((maps) => {
        if (dead || !box.current) return
        map.current = new maps.Map(box.current, {
          center: valid ? { lat, lng: lon } : { lat: 20, lng: 20 },
          zoom: valid ? 9 : 2,
          mapTypeId: 'hybrid',
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'cooperative',
        })
        marker.current = new maps.Marker({ map: map.current, position: valid ? { lat, lng: lon } : null, title: 'Your farm' })
        map.current.addListener('click', (e) => onPick(Number(e.latLng.lat().toFixed(4)), Number(e.latLng.lng().toFixed(4))))
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
    map.current.panTo(pos)
    if (map.current.getZoom() < 7) map.current.setZoom(9)
  }, [ready, valid, lat, lon])

  return <div ref={box} className="gmap" role="application" aria-label="Google map. Click to choose your farm location." />
}
