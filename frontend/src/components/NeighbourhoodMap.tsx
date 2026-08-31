import {
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  GeoJSONSource,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl'

import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import 'maplibre-gl/dist/maplibre-gl.css'

import { api } from '../services/api'

import {
  choroplethFill,
  COMPARISON_LAYER_ID,
  EMPTY_COLLECTION,
  FILL_LAYER_ID,
  HOVER_BORDER_LAYER_ID,
  HOVER_FILL_LAYER_ID,
  HOVER_SHADOW_LAYER_ID,
  OUTLINE_LAYER_ID,
  SELECTED_LAYER_ID,
  selectionFilter,
  SOURCE_ID,
} from './mapStyles'

import type {
  BoundaryFeatureCollection,
  BoundaryGeometry,
  NeighbourhoodMapIndicators,
} from '../services/api'

import type {
  PreferenceId,
} from '../types/neighbourhood'

setWorkerUrl(workerUrl)
const CURSOR_ORB_EASING = 0.12

interface NeighbourhoodMapProps {
  preference: PreferenceId | null

  selectedId: string | null

  focusId?: string | null

  comparisonId?: string | null

  compareMode?: boolean
  selectionEnabled?: boolean


  onSelect: (
    id: string,
    name?: string,
  ) => void
}
type HeatmapMetrics = {
  development?: number | null
  heat?: number | null
  social?: number | null
  vegetation?: number | null
  green_space?: number | null
}

let heatmapMetricsPromise: Promise<Map<string, HeatmapMetrics>> | null = null

function metricValue(
  neighbourhood: NeighbourhoodMapIndicators,
  indicatorId: string,
) {
  const indicator = neighbourhood.indicators[indicatorId]
  const value = indicator?.value

  if (
    indicator?.status !== 'available' &&
    indicator?.status !== 'limited'
  ) {
    return null
  }

  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function metricsFromIndicators(
  neighbourhood: NeighbourhoodMapIndicators,
): HeatmapMetrics {
  const socialDecile = metricValue(neighbourhood, 'seifa_irsd_decile')
  return {
    development: metricValue(neighbourhood, 'aedc_on_track_five'),
    heat: metricValue(neighbourhood, 'env_urban_heat'),
    social: socialDecile === null ? null : 11 - socialDecile,
    vegetation: metricValue(neighbourhood, 'env_vegetation_cover'),
    green_space: metricValue(neighbourhood, 'env_open_space_access'),
  }
}

async function getHeatmapMetrics() {
  if (!heatmapMetricsPromise) {
    heatmapMetricsPromise = api.getNeighbourhoodIndicators().then((response) => {
      if (response.status !== 'available' && response.status !== 'limited') {
        throw new Error(
          response.limitations[0]?.message ??
            'Neighbourhood indicators are unavailable.',
        )
      }

      return new Map(
        response.data.neighbourhoods.map((neighbourhood) => [
          neighbourhood.id,
          metricsFromIndicators(neighbourhood),
        ]),
      )
    }).catch((error) => {
      heatmapMetricsPromise = null
      throw error
    })
  }

  return heatmapMetricsPromise
}

function addHeatmapMetrics(
  collection: BoundaryFeatureCollection,
  metricsById: Map<string, HeatmapMetrics>,
): BoundaryFeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        ...metricsById.get(feature.properties.id),
      },
    })),
  }
}
// Calculate bounds for map focus
function getGeometryBounds(
  geometry: BoundaryGeometry,
):
  | [
      [number, number],
      [number, number],
    ]
  | null {
  let west = Infinity
  let south = Infinity
  let east = -Infinity
  let north = -Infinity

  function walk(value: unknown) {
    if (!Array.isArray(value)) {
      return
    }

    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      const longitude = value[0]
      const latitude = value[1]

      west = Math.min(west, longitude)
      east = Math.max(east, longitude)
      south = Math.min(south, latitude)
      north = Math.max(north, latitude)

      return
    }

    value.forEach(walk)
  }

  walk(geometry.coordinates)

  if (
    !Number.isFinite(west) ||
    !Number.isFinite(south) ||
    !Number.isFinite(east) ||
    !Number.isFinite(north)
  ) {
    return null
  }

  return [
    [west, south],
    [east, north],
  ]
}
export default function NeighbourhoodMap({
  preference,
  selectedId,
  focusId,
  comparisonId,
  compareMode = false,
  onSelect,
  selectionEnabled = true,
}: NeighbourhoodMapProps) {
  const mapContainerRef =
    useRef<HTMLDivElement | null>(
      null,
    )

  const mapRef =
    useRef<MapLibreMap | null>(
      null,
    )
  const cursorOrbRef =
    useRef<HTMLDivElement | null>(
      null,
    )


  const preferenceRef = useRef<PreferenceId | null>(preference)
const selectedIdRef =
    useRef<
      string | null
    >(selectedId)

  const comparisonIdRef =
    useRef<
      string | null | undefined
    >(comparisonId)

  const onSelectRef =
    useRef(onSelect)
const hoveredIdRef =
    useRef<
      string | number | null
    >(null)
const requestNumberRef =
    useRef(0)
  const selectionEnabledRef = useRef(selectionEnabled)


  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    mapError,
    setMapError,
  ] = useState<
    string | null
  >(null)

  const [
    hoveredName,
    setHoveredName,
  ] = useState<
    string | null
  >(null)

  selectedIdRef.current =
    selectedId

  comparisonIdRef.current =
    comparisonId

  onSelectRef.current =
    onSelect

  preferenceRef.current = preference
  selectionEnabledRef.current = selectionEnabled
useEffect(() => {
    if (
      !mapContainerRef.current ||
      mapRef.current
    ) {
      return
    }

    const map =
      new MapLibreMap({
        container:
          mapContainerRef.current,

        style:
          'https://tiles.openfreemap.org/styles/liberty',
center: [
          144.9631,
          -37.8136,
        ],

        zoom: 9.6,

        minZoom: 7,

        maxZoom: 16,
      })

    mapRef.current = map

    map.addControl(
      new NavigationControl({
        showCompass: true,
        showZoom: true,
      }),
      'bottom-right',
    )
function clearHover() {
      const hoveredId =
        hoveredIdRef.current

      if (
        hoveredId !== null
      ) {
        try {
          map.setFeatureState(
            {
              source:
                SOURCE_ID,

              id:
                hoveredId,
            },
            {
              hover:
                false,
            },
          )
        } catch {
}
      }

      hoveredIdRef.current =
        null

      setHoveredName(
        null,
      )
    }
async function loadVisibleBoundaries() {
      const currentRequest =
        ++requestNumberRef.current

      const bounds =
        map.getBounds()

      const bbox = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ].join(',')

      try {
        setLoading(true)

        const [response, metricsResult] = await Promise.all([
          api.getBoundaries(bbox),
          getHeatmapMetrics().catch((error) => {
            console.warn('Could not load heatmap indicators:', error)
            return null
          }),
        ])
if (
          currentRequest !==
          requestNumberRef.current
        ) {
          return
        }

        if (
          response.status !==
            'available' &&
          response.status !==
            'limited'
        ) {
          const message =
            response.limitations[
              0
            ]?.message ??
            'Neighbourhood boundaries are unavailable.'

          setMapError(
            message,
          )

          return
        }
clearHover()

        const source =
          map.getSource(
            SOURCE_ID,
          )

        if (source) {
          const mapData = metricsResult
            ? addHeatmapMetrics(response.data, metricsResult)
            : response.data
          ;(source as GeoJSONSource).setData(mapData as any)
        }

        setMapError(
          null,
        )
      } catch (error) {
        console.error(
          'Failed to load neighbourhood boundaries:',
          error,
        )

        if (
          currentRequest ===
          requestNumberRef.current
        ) {
          setMapError(
            'Could not load neighbourhood boundaries from the KinderPrint API.',
          )
        }
      } finally {
        if (
          currentRequest ===
          requestNumberRef.current
        ) {
          setLoading(
            false,
          )
        }
      }
    }
map.on(
      'load',
      () => {
map.addSource(
          SOURCE_ID,
          {
            type: 'geojson',

            data:
              EMPTY_COLLECTION as any,

            promoteId:
              'id',
          },
        )

        map.addLayer({
          id:
            FILL_LAYER_ID,

          type:
            'fill',

          source:
            SOURCE_ID,

          paint: {
'fill-color': choroplethFill(preferenceRef.current),
            'fill-opacity': preferenceRef.current ? 0.62 : 0.01,
          },
        })

        map.addLayer({
          id:
            HOVER_SHADOW_LAYER_ID,

          type:
            'line',

          source:
            SOURCE_ID,

          paint: {
            'line-color': '#5367FF',

            'line-width': [
              'case',

              [
                'boolean',
                [
                  'feature-state',
                  'hover',
                ],
                false,
              ],

              14,

              0,
            ],

            'line-opacity': [
              'case',

              [
                'boolean',
                [
                  'feature-state',
                  'hover',
                ],
                false,
              ],

              0.18,

              0,
            ],

            'line-translate': [
              0,
              7,
            ],

            'line-blur':
              9,
          },
        })

        map.addLayer({
          id:
            HOVER_FILL_LAYER_ID,

          type:
            'fill',

          source:
            SOURCE_ID,

          paint: {
            'fill-color': '#AFCBFF',

            'fill-opacity': [
              'case',

              [
                'boolean',
                [
                  'feature-state',
                  'hover',
                ],
                false,
              ],

              0.52,

              0,
            ],
          },
        })

        map.addLayer({
          id:
            OUTLINE_LAYER_ID,

          type:
            'line',

          source:
            SOURCE_ID,

          paint: {
            'line-color': '#FFFFFF',
            'line-width': 0.8,
            'line-opacity': 0.38,
          },
        })

        map.addLayer({
          id:
            HOVER_BORDER_LAYER_ID,

          type:
            'line',

          source:
            SOURCE_ID,

          paint: {
            'line-color': '#EAF1FF',

            'line-width': [
              'case',

              [
                'boolean',
                [
                  'feature-state',
                  'hover',
                ],
                false,
              ],

              2,

              0,
            ],

            'line-opacity': [
              'case',

              [
                'boolean',
                [
                  'feature-state',
                  'hover',
                ],
                false,
              ],

              0.96,

              0,
            ],

            'line-blur':
              0.25,
          },
        })

        map.addLayer({
          id:
            SELECTED_LAYER_ID,

          type:
            'line',

          source:
            SOURCE_ID,

          filter:
            selectionFilter(
              selectedIdRef.current,
            ),

          paint: {
            'line-color': '#4F6FFF',

            'line-width':
              3,

            'line-opacity':
              0.95,

            'line-blur':
              0.15,
          },
        })

        map.addLayer({
          id:
            COMPARISON_LAYER_ID,

          type:
            'line',

          source:
            SOURCE_ID,

          filter:
            selectionFilter(
              comparisonIdRef.current,
            ),

          paint: {
            'line-color': '#7B8FF5',

            'line-width':
              3,

            'line-opacity':
              0.95,

            'line-dasharray': [
              2,
              1.4,
            ],
          },
        })
map.on(
          'mouseenter',
          FILL_LAYER_ID,
          () => {
            map.getCanvas().style.cursor =
              selectionEnabledRef.current ? 'pointer' : ''
          },
        )
map.on(
          'mousemove',
          FILL_LAYER_ID,
          (event) => {
            const feature =
              event.features?.[0]

            if (!feature) {
              return
            }

            const properties =
              feature.properties

            const featureId =
              feature.id ??
              properties?.id

            const featureName =
              properties?.name

            if (
              typeof featureId !==
                'string' &&
              typeof featureId !==
                'number'
            ) {
              return
            }
if (
              hoveredIdRef.current ===
              featureId
            ) {
              return
            }
if (
              hoveredIdRef.current !==
              null
            ) {
              try {
                map.setFeatureState(
                  {
                    source:
                      SOURCE_ID,

                    id:
                      hoveredIdRef.current,
                  },
                  {
                    hover:
                      false,
                  },
                )
              } catch {
                // Ignore during source refresh
              }
            }
hoveredIdRef.current =
              featureId

            try {
              map.setFeatureState(
                {
                  source:
                    SOURCE_ID,

                  id:
                    featureId,
                },
                {
                  hover:
                    true,
                },
              )
            } catch {
              return
            }

            setHoveredName(
              typeof featureName ===
                'string'
                ? featureName
                : String(
                    featureId,
                  ),
            )
          },
        )
map.on(
          'mouseleave',
          FILL_LAYER_ID,
          () => {
            map.getCanvas()
              .style.cursor =
              ''

            clearHover()
          },
        )
map.on(
          'click',
          FILL_LAYER_ID,
          (event) => {
            if (!selectionEnabledRef.current) {
              return
            }

            const feature =
              event.features?.[0]

            if (!feature) {
              return
            }

            const id =
              feature.properties
                ?.id

            const name =
              feature.properties
                ?.name

            if (
              typeof id !==
              'string'
            ) {
              return
            }

            onSelectRef.current(
              id,

              typeof name ===
                'string'
                ? name
                : undefined,
            )
          },
        )
void loadVisibleBoundaries()
      },
    )
map.on(
      'moveend',
      () => {
        void loadVisibleBoundaries()
      },
    )
return () => {
      requestNumberRef.current +=
        1

      map.remove()

      mapRef.current =
        null
    }
  }, [])
  useEffect(() => {
    const container = mapContainerRef.current
    const orb = cursorOrbRef.current

    if (!container || !orb) {
      return
    }

    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    let lastClientX = 0
    let lastClientY = 0
    let animationFrame: number | null = null
    let active = false

    const updateTarget = (clientX: number, clientY: number) => {
      const rect = container.getBoundingClientRect()
      targetX = clientX - rect.left
      targetY = clientY - rect.top
    }

    const animate = () => {
      currentX += (targetX - currentX) * CURSOR_ORB_EASING
      currentY += (targetY - currentY) * CURSOR_ORB_EASING
      orb.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`

      if (active) {
        animationFrame = window.requestAnimationFrame(animate)
      }
    }

    const handleMouseEnter = (event: MouseEvent) => {
      lastClientX = event.clientX
      lastClientY = event.clientY
      updateTarget(lastClientX, lastClientY)
      currentX = targetX
      currentY = targetY
      orb.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) translate(-50%, -50%)`
      active = true
      orb.classList.add('is-visible')

      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(animate)
      }
    }

    const handleMouseMove = (event: MouseEvent) => {
      lastClientX = event.clientX
      lastClientY = event.clientY
      updateTarget(lastClientX, lastClientY)
    }

    const handleMouseLeave = () => {
      active = false
      orb.classList.remove('is-visible')

      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = null
      }
    }

    const handleViewportChange = () => {
      if (active) {
        updateTarget(lastClientX, lastClientY)
      }
    }

    container.addEventListener('mouseenter', handleMouseEnter)
    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, { passive: true })

    return () => {
      active = false
      container.removeEventListener('mouseenter', handleMouseEnter)
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('resize', handleViewportChange)
      window.removeEventListener('scroll', handleViewportChange)

      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
      }
    }
  }, [])

useEffect(() => {
    const map = mapRef.current

    if (!map || !map.isStyleLoaded() || !map.getLayer(FILL_LAYER_ID)) {
      return
    }

    map.setPaintProperty(FILL_LAYER_ID, 'fill-color', choroplethFill(preference))
    map.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', preference ? 0.62 : 0.01)
  }, [preference])
useEffect(() => {
    const map =
      mapRef.current

    if (
      !map ||
      !map.isStyleLoaded()
    ) {
      return
    }

    if (
      map.getLayer(
        SELECTED_LAYER_ID,
      )
    ) {
      map.setFilter(
        SELECTED_LAYER_ID,

        selectionFilter(
          selectedId,
        ),
      )
    }
  }, [
    selectedId,
  ])
useEffect(() => {
    const map =
      mapRef.current

    if (
      !map ||
      !map.isStyleLoaded()
    ) {
      return
    }

    if (
      map.getLayer(
        COMPARISON_LAYER_ID,
      )
    ) {
      map.setFilter(
        COMPARISON_LAYER_ID,

        selectionFilter(
          comparisonId,
        ),
      )
    }
  }, [
    comparisonId,
  ])
// Focus map after search
  useEffect(() => {
    const targetId = focusId
    const mapInstance = mapRef.current

    if (!targetId || !mapInstance) {
      return
    }

    const focusNeighbourhood = async (
      activeMap: MapLibreMap,
      neighbourhoodId: string,
    ) => {
      try {
        const response =
          await api.getBoundary(neighbourhoodId)

        if (
          response.status !== 'available' &&
          response.status !== 'limited'
        ) {
          return
        }

        const geometry =
          response.data.geometry

        if (!geometry) {
          return
        }

        const bounds =
          getGeometryBounds(geometry)

        if (!bounds) {
          return
        }

        activeMap.fitBounds(
          bounds,
          {
            padding: 120,
            maxZoom: 13,
            duration: 1100,
          },
        )
      } catch (error) {
        console.error(
          'Failed to focus neighbourhood:',
          error,
        )
      }
    }

    if (mapInstance.isStyleLoaded()) {
      void focusNeighbourhood(
        mapInstance,
        targetId,
      )
    } else {
      mapInstance.once(
        'load',
        () => {
          void focusNeighbourhood(
            mapInstance,
            targetId,
          )
        },
      )
    }
  }, [
    focusId,
  ])

  return (
    <div
      className="map-visual real-map-wrapper"
      aria-label="Interactive Greater Melbourne neighbourhood map"
    >
      <div
        ref={
          mapContainerRef
        }
        className="real-map"
      />

      <div
        ref={cursorOrbRef}
        className="map-cursor-orb"
        aria-hidden="true"
      />

      {hoveredName && (
        <div className="map-hover-label">
          {hoveredName}
        </div>
      )}

      {loading && (
        <div className="map-loading">
          Loading neighbourhood
          boundaries…
        </div>
      )}

      {mapError && (
        <div
          className="map-error"
          role="alert"
        >
          {mapError}
        </div>
      )}

      <span className="map-caption">
        Greater Melbourne · SA2
        (ASGS Edition 3, 2021)

        {compareMode
          ? ' · Comparison mode'
          : ''}
      </span>
    </div>
  )
}
