import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'

import 'mapbox-gl/dist/mapbox-gl.css'
import type { ApiEnvelope, BoundaryDetail } from '../services/api'

const TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? ''
const LOCALITY_ID = '206011106'
const LOCALITY_CENTER: [number, number] = [144.976, -37.769]

interface LocalityGlobeProps {
  mode: 'lens' | 'map'
}

export default function LocalityGlobe({ mode }: LocalityGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [message, setMessage] = useState(TOKEN ? 'Loading locality geography…' : 'Map unavailable: VITE_MAPBOX_ACCESS_TOKEN is not configured.')

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return

    mapboxgl.accessToken = TOKEN
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: LOCALITY_CENTER,
      zoom: 7.15,
      projection: 'globe',
      attributionControl: true,
      interactive: true,
    })
    mapRef.current = map

    const marker = document.createElement('div')
    marker.className = 'dh-map-marker'
    marker.setAttribute('aria-label', 'Brunswick East, SA2')

    map.on('load', async () => {
      map.setFog({ color: 'rgb(222, 235, 255)', 'high-color': 'rgb(95, 160, 230)', 'horizon-blend': 0.08, 'space-color': 'rgb(237, 244, 255)', 'star-intensity': 0 })
      new mapboxgl.Marker({ element: marker }).setLngLat(LOCALITY_CENTER).setPopup(new mapboxgl.Popup({ offset: 20 }).setText('Brunswick East (SA2)')).addTo(map)

      try {
        const response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? ''}/api/neighbourhoods/${LOCALITY_ID}/boundary`, { headers: { Accept: 'application/json' } })
        if (!response.ok) throw new Error(`Boundary request returned ${response.status}`)
        const envelope = await response.json() as ApiEnvelope<BoundaryDetail>
        if (!envelope.data.geometry) throw new Error('Boundary geometry is unavailable')
        map.addSource('dh-locality-boundary', {
          type: 'geojson',
          data: { type: 'Feature', properties: { name: 'Brunswick East' }, geometry: envelope.data.geometry },
        })
        map.addLayer({ id: 'dh-locality-fill', type: 'fill', source: 'dh-locality-boundary', paint: { 'fill-color': '#1264ef', 'fill-opacity': 0.42 } })
        map.addLayer({ id: 'dh-locality-line', type: 'line', source: 'dh-locality-boundary', paint: { 'line-color': '#ffffff', 'line-width': 2.5 } })
        setMessage('')
      } catch (error) {
        console.warn('Locality boundary could not be loaded:', error)
        setMessage('Satellite geography is available; the SA2 boundary service is currently unavailable.')
      }
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true, showZoom: true }), 'bottom-right')
    const resizeObserver = new ResizeObserver(() => map.resize())
    resizeObserver.observe(containerRef.current)
    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.setProjection(mode === 'lens' ? 'globe' : 'mercator')
    map.easeTo({ center: LOCALITY_CENTER, zoom: mode === 'lens' ? 7.15 : 11.1, pitch: mode === 'lens' ? 12 : 0, duration: 1100 })
  }, [mode])

  return <div className={`dh-real-map ${mode === 'lens' ? 'is-globe' : 'is-standard'}`}>
    <div ref={containerRef} className="dh-map-canvas" aria-label="Interactive Mapbox satellite map centred on Brunswick East" />
    {mode === 'lens' && <div className="dh-map-story" aria-hidden="true"><span>Australia</span><i /><span>Victoria</span><i /><span>Greater Melbourne</span></div>}
    <div className="dh-locality-label"><i />Brunswick East <small>SA2</small></div>
    {message && <p className="dh-map-message">{message}</p>}
  </div>
}
