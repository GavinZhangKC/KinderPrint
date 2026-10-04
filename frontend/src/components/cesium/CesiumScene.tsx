import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'
import {
  Cartesian2,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  ConstantProperty,
  CylinderGeometry,
  DirectionalLight,
  EllipsoidTerrainProvider,
  GeometryInstance,
  Ion,
  Matrix4,
  NearFarScalar,
  Math as CesiumMath,
  PerInstanceColorAppearance,
  Primitive,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Transforms,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import {
  addMelbourneStreetEnvironment,
  type MelbourneJourneyHighlightController,
} from './melbourneScene'
import {
  parkvilleCoverage,
  verifiedParkvilleLocations,
  type VerificationCategory,
  type VerifiedParkvilleLocation,
} from './parkvilleVerification'

export interface CesiumCameraView {
  longitude: number
  latitude: number
  height: number
  heading?: number
  pitch?: number
  roll?: number
}

export interface CesiumSceneHandle {
  setCameraView: (view: CesiumCameraView) => void
  flyCameraTo: (view: CesiumCameraView, duration?: number) => void
  setJourneyProgress: (progress: number) => void
  setJourneyPaused: (paused: boolean) => void
  setVerificationMode: (enabled: boolean) => void
  focusOnVerifiedLocation: (locationId: string) => void
}

export interface CesiumJourneyOverlayAnchor {
  locationId: string
  x: number
  y: number
  intensity: number
  visible: boolean
}

interface CesiumSceneProps {
  onVerificationLocationSelect?: (locationId: string) => void
  onJourneyOverlayUpdate?: (anchors: CesiumJourneyOverlayAnchor[]) => void
  onLoadProgress?: (loaded: number, total: number, label: string) => void
  onLoadPhaseChange?: (phase: 'resources' | 'preparing') => void
  onReady?: () => void
  onLoadError?: (message: string) => void
}

// Cesium defaults to CSS-pixel rendering and ignores the device pixel ratio.
// Preserve native resolution up to 2x so common Retina displays stay sharp
// without allowing very high-DPI screens to create oversized GPU buffers.
const maximumRenderPixelRatio = 2

function updateViewerResolution(viewer: Viewer) {
  const devicePixelRatio = window.devicePixelRatio || 1
  const resolutionScale = Math.min(
    1,
    maximumRenderPixelRatio / devicePixelRatio,
  )

  viewer.useBrowserRecommendedResolution = false
  if (Math.abs(viewer.resolutionScale - resolutionScale) > 0.001) {
    viewer.resolutionScale = resolutionScale
  }
  viewer.resize()
  viewer.scene.requestRender()
}

export interface ParkvilleJourneyChapter {
  id: string
  locationId: string
  chapter: number
  theme: 'Introduction' | 'Healthcare' | 'Green Space' | 'Education' | 'Conclusion'
  title: string
  locations: string[]
  target: { longitude: number; latitude: number }
  routeProgress: number
}

interface ParkvilleRoutePoint {
  longitude: number
  latitude: number
}

// Road-centre waypoints taken from the locally stored City of Melbourne road
// corridor and footpath features. Extra points retain the bends around Royal
// Park and through the university campus instead of connecting the feature
// centroids with building-cutting straight lines. The route stays inside the
// 780 m Parkville data extent.
const parkvilleRouteWaypoints: ParkvilleRoutePoint[] = [
  { longitude: 144.94945, latitude: -37.7952 },
  { longitude: 144.9503, latitude: -37.79588 },
  { longitude: 144.9510856, latitude: -37.7965364 },
  { longitude: 144.9523918, latitude: -37.7956269 },
  { longitude: 144.9536926, latitude: -37.7946044 },
  { longitude: 144.9550713, latitude: -37.7935187 },
  { longitude: 144.9564256, latitude: -37.7927849 },
  { longitude: 144.956791, latitude: -37.7927343 },
  { longitude: 144.9566345, latitude: -37.7932591 },
  { longitude: 144.9559169, latitude: -37.7941021 },
  { longitude: 144.9558518, latitude: -37.7949214 },
  { longitude: 144.9556507, latitude: -37.7955372 },
  { longitude: 144.9567877, latitude: -37.7956728 },
  { longitude: 144.9566213, latitude: -37.7969677 },
  { longitude: 144.9553576, latitude: -37.7968165 },
  { longitude: 144.9536953, latitude: -37.7966066 },
  { longitude: 144.9527423, latitude: -37.7976431 },
  { longitude: 144.9539744, latitude: -37.798809 },
  { longitude: 144.9550934, latitude: -37.7996585 },
  { longitude: 144.956243, latitude: -37.799571 },
  { longitude: 144.957554, latitude: -37.7997193 },
  { longitude: 144.9588265, latitude: -37.7998597 },
  { longitude: 144.9599019, latitude: -37.7999784 },
  { longitude: 144.9605015, latitude: -37.799917 },
  { longitude: 144.960655, latitude: -37.799688 },
  { longitude: 144.9611666, latitude: -37.799661 },
  { longitude: 144.9612348, latitude: -37.7995802 },
  { longitude: 144.9614735, latitude: -37.7985426 },
  { longitude: 144.9616781, latitude: -37.7983001 },
]

const journeyMilestoneWaypointIndexes = {
  royalChildrensHospital: 0,
  royalPark: 4,
  earlyChildhood: 11,
  universityHighSchool: 14,
  royalWomensHospital: 18,
  royalMelbourneHospital: 19,
  universityOfMelbourne: parkvilleRouteWaypoints.length - 1,
} as const

function cameraDestination(view: CesiumCameraView) {
  return Cartesian3.fromDegrees(view.longitude, view.latitude, view.height)
}

function cameraOrientation(view: CesiumCameraView) {
  return {
    heading: CesiumMath.toRadians(view.heading ?? 0),
    pitch: CesiumMath.toRadians(view.pitch ?? -38),
    roll: CesiumMath.toRadians(view.roll ?? 0),
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(value: number) {
  const bounded = clamp01(value)
  return bounded * bounded * (3 - 2 * bounded)
}

function distanceBetweenRoutePoints(start: ParkvilleRoutePoint, end: ParkvilleRoutePoint) {
  const latitudeMetres = (end.latitude - start.latitude) * 111_320
  const averageLatitude = CesiumMath.toRadians((start.latitude + end.latitude) / 2)
  const longitudeMetres = (
    (end.longitude - start.longitude)
    * 111_320
    * Math.cos(averageLatitude)
  )
  return Math.hypot(latitudeMetres, longitudeMetres)
}

function interpolateRoutePoint(
  start: ParkvilleRoutePoint,
  end: ParkvilleRoutePoint,
  progress: number,
): ParkvilleRoutePoint {
  return {
    longitude: start.longitude + (end.longitude - start.longitude) * progress,
    latitude: start.latitude + (end.latitude - start.latitude) * progress,
  }
}

function quadraticRoutePoint(
  start: ParkvilleRoutePoint,
  corner: ParkvilleRoutePoint,
  end: ParkvilleRoutePoint,
  progress: number,
): ParkvilleRoutePoint {
  const inverse = 1 - progress
  return {
    longitude: (
      inverse * inverse * start.longitude
      + 2 * inverse * progress * corner.longitude
      + progress * progress * end.longitude
    ),
    latitude: (
      inverse * inverse * start.latitude
      + 2 * inverse * progress * corner.latitude
      + progress * progress * end.latitude
    ),
  }
}

function buildRoundedRoute(waypoints: ParkvilleRoutePoint[]) {
  const rounded: ParkvilleRoutePoint[] = [waypoints[0]]
  const cornerRadiusMetres = 8

  for (let index = 1; index < waypoints.length - 1; index += 1) {
    const previous = waypoints[index - 1]
    const corner = waypoints[index]
    const next = waypoints[index + 1]
    const incomingLength = distanceBetweenRoutePoints(previous, corner)
    const outgoingLength = distanceBetweenRoutePoints(corner, next)
    const trimDistance = Math.min(
      cornerRadiusMetres,
      incomingLength * 0.18,
      outgoingLength * 0.18,
    )
    const entry = interpolateRoutePoint(
      previous,
      corner,
      1 - trimDistance / incomingLength,
    )
    const exit = interpolateRoutePoint(
      corner,
      next,
      trimDistance / outgoingLength,
    )

    rounded.push(entry)
    for (let step = 1; step <= 6; step += 1) {
      rounded.push(quadraticRoutePoint(entry, corner, exit, step / 7))
    }
    rounded.push(exit)
  }

  rounded.push(waypoints[waypoints.length - 1])
  return rounded
}

const parkvilleJourneyRoute = buildRoundedRoute(parkvilleRouteWaypoints)
const parkvilleRouteCumulativeMetres = parkvilleJourneyRoute.map(() => 0)
const journeyRouteHeightMetres = 0.65
const parkvilleRouteCartesianPositions = parkvilleJourneyRoute.map((point) => (
  Cartesian3.fromDegrees(point.longitude, point.latitude, journeyRouteHeightMetres)
))

for (let index = 1; index < parkvilleJourneyRoute.length; index += 1) {
  parkvilleRouteCumulativeMetres[index] = (
    parkvilleRouteCumulativeMetres[index - 1]
    + distanceBetweenRoutePoints(
      parkvilleJourneyRoute[index - 1],
      parkvilleJourneyRoute[index],
    )
  )
}

export const parkvilleJourneyRouteLengthMetres =
  parkvilleRouteCumulativeMetres[parkvilleRouteCumulativeMetres.length - 1]

function routePointAtDistance(distanceMetres: number) {
  const distance = Math.min(
    parkvilleJourneyRouteLengthMetres,
    Math.max(0, distanceMetres),
  )
  let endIndex = parkvilleRouteCumulativeMetres.findIndex(
    (cumulativeDistance) => cumulativeDistance >= distance,
  )

  if (endIndex <= 0) return parkvilleJourneyRoute[0]
  if (endIndex === -1) endIndex = parkvilleJourneyRoute.length - 1

  const startIndex = endIndex - 1
  const startDistance = parkvilleRouteCumulativeMetres[startIndex]
  const segmentLength = Math.max(
    0.001,
    parkvilleRouteCumulativeMetres[endIndex] - startDistance,
  )
  return interpolateRoutePoint(
    parkvilleJourneyRoute[startIndex],
    parkvilleJourneyRoute[endIndex],
    (distance - startDistance) / segmentLength,
  )
}

function routeProgressNear(waypointIndex: number) {
  const waypoint = parkvilleRouteWaypoints[waypointIndex]
  let closestIndex = 0
  let closestDistance = Number.POSITIVE_INFINITY

  parkvilleJourneyRoute.forEach((routePoint, index) => {
    const distance = distanceBetweenRoutePoints(routePoint, waypoint)
    if (distance < closestDistance) {
      closestIndex = index
      closestDistance = distance
    }
  })

  return parkvilleRouteCumulativeMetres[closestIndex] / parkvilleJourneyRouteLengthMetres
}

export const parkvilleJourneyChapters = [
  {
    id: 'royal-childrens-hospital',
    locationId: 'royal-childrens-hospital',
    chapter: 1,
    theme: 'Introduction',
    title: 'Parkville Health Gateway',
    locations: ["Royal Children's Hospital"],
    target: { longitude: 144.9500483, latitude: -37.7942061 },
    routeProgress: routeProgressNear(
      journeyMilestoneWaypointIndexes.royalChildrensHospital,
    ),
  },
  {
    id: 'royal-park',
    locationId: 'royal-park',
    chapter: 2,
    theme: 'Green Space',
    title: 'Royal Park Edge',
    locations: ['Royal Park'],
    target: { longitude: 144.9538342, latitude: -37.7906174 },
    routeProgress: routeProgressNear(journeyMilestoneWaypointIndexes.royalPark),
  },
  {
    id: 'parkville-early-childhood',
    locationId: 'wimble-street-childcare',
    chapter: 3,
    theme: 'Education',
    title: 'Early Childhood Services',
    locations: ['Wimble Street Child Care Co-Operative'],
    target: { longitude: 144.9559549, latitude: -37.7949911 },
    routeProgress: routeProgressNear(
      journeyMilestoneWaypointIndexes.earlyChildhood,
    ),
  },
  {
    id: 'university-high-school',
    locationId: 'university-high-school',
    chapter: 4,
    theme: 'Education',
    title: 'Education Environment',
    locations: ['University High School'],
    target: { longitude: 144.9560344, latitude: -37.7973136 },
    routeProgress: routeProgressNear(
      journeyMilestoneWaypointIndexes.universityHighSchool,
    ),
  },
  {
    id: 'royal-womens-hospital',
    locationId: 'royal-womens-hospital',
    chapter: 5,
    theme: 'Healthcare',
    title: "Women's Health Precinct",
    locations: ["Royal Women's Hospital"],
    target: { longitude: 144.9548973, latitude: -37.7988892 },
    routeProgress: routeProgressNear(
      journeyMilestoneWaypointIndexes.royalWomensHospital,
    ),
  },
  {
    id: 'royal-melbourne-hospital',
    locationId: 'royal-melbourne-hospital',
    chapter: 6,
    theme: 'Healthcare',
    title: 'Royal Melbourne Hospital',
    locations: ['Royal Melbourne Hospital'],
    target: { longitude: 144.9563897, latitude: -37.7993072 },
    routeProgress: routeProgressNear(
      journeyMilestoneWaypointIndexes.royalMelbourneHospital,
    ),
  },
  {
    id: 'university-of-melbourne',
    locationId: 'university-of-melbourne',
    chapter: 7,
    theme: 'Conclusion',
    title: 'Connected Parkville',
    locations: ['University of Melbourne'],
    target: { longitude: 144.9609952, latitude: -37.7982892 },
    routeProgress: routeProgressNear(
      journeyMilestoneWaypointIndexes.universityOfMelbourne,
    ),
  },
] satisfies ParkvilleJourneyChapter[]

const journeyChapterLocationIds = parkvilleJourneyChapters.map(
  (chapter) => chapter.locationId,
)

type JourneyChapterLocationId = typeof journeyChapterLocationIds[number]

function journeyOverlayHeight(category: VerificationCategory) {
  if (category === 'Green space') return 18
  if (category === 'Childcare') return 24
  if (category === 'Healthcare') return 38
  return 31
}

const journeyOverlayWorldAnchors = journeyChapterLocationIds.flatMap((locationId) => {
  const location = verifiedParkvilleLocations.find((item) => item.id === locationId)
  if (!location) return []

  return [{
    locationId,
    position: Cartesian3.fromDegrees(
      location.longitude,
      location.latitude,
      journeyOverlayHeight(location.category),
    ),
  }]
})

function journeyHighlightsAtProgress(progress: number) {
  const highlights: Record<string, number> = {}
  for (const locationId of journeyChapterLocationIds) highlights[locationId] = 0

  const boundedProgress = clamp01(progress)
  const firstProgress = parkvilleJourneyChapters[0].routeProgress
  const lastIndex = parkvilleJourneyChapters.length - 1
  const lastProgress = parkvilleJourneyChapters[lastIndex].routeProgress

  if (boundedProgress <= firstProgress) {
    highlights[journeyChapterLocationIds[0]] = 1
    return highlights
  }
  if (boundedProgress >= lastProgress) {
    highlights[journeyChapterLocationIds[lastIndex]] = 1
    return highlights
  }

  for (let index = 0; index < lastIndex; index += 1) {
    const start = parkvilleJourneyChapters[index].routeProgress
    const end = parkvilleJourneyChapters[index + 1].routeProgress
    if (boundedProgress < start || boundedProgress > end) continue

    const blend = smoothstep((boundedProgress - start) / Math.max(0.0001, end - start))
    highlights[journeyChapterLocationIds[index]] = 1 - blend
    highlights[journeyChapterLocationIds[index + 1]] = blend
    break
  }

  return highlights
}

interface JourneyLocationVisual {
  locationId: JourneyChapterLocationId
  fill: ConstantProperty
  outline: ConstantProperty
  accent: Color
  entityId: string
}

interface JourneyLocationVisualController {
  setHighlights: (highlights: Readonly<Record<string, number>>) => void
}

function journeyAccent(category: VerificationCategory) {
  if (category === 'Healthcare') return Color.fromCssColorString('#6d78e8')
  if (category === 'Green space') return Color.fromCssColorString('#73b68e')
  return Color.fromCssColorString('#8293d8')
}

function projectJourneyOverlayAnchors(
  viewer: Viewer,
  highlights: Readonly<Record<string, number>>,
) {
  const scene = viewer.scene
  const canvas = scene.canvas
  const projected: CesiumJourneyOverlayAnchor[] = []

  for (const anchor of journeyOverlayWorldAnchors) {
    const intensity = clamp01(highlights[anchor.locationId] ?? 0)
    const screenPosition = scene.cartesianToCanvasCoordinates(anchor.position)
    const toAnchor = Cartesian3.subtract(
      anchor.position,
      viewer.camera.positionWC,
      new Cartesian3(),
    )
    let visible = Boolean(
      intensity > 0.025
      && screenPosition
      && Cartesian3.dot(toAnchor, viewer.camera.directionWC) > 0
      && screenPosition.x > -180
      && screenPosition.x < canvas.clientWidth + 180
      && screenPosition.y > -140
      && screenPosition.y < canvas.clientHeight + 140,
    )

    // A small number of active anchors makes a depth check affordable. Allow
    // the landmark's own facade to sit near the anchor, but hide the card when
    // substantially closer geometry occupies the same screen position.
    if (visible && screenPosition && scene.pickPositionSupported) {
      try {
        const pickedPosition = scene.pickPosition(screenPosition)
        if (pickedPosition) {
          const cameraPosition = viewer.camera.positionWC
          const anchorDistance = Cartesian3.distance(cameraPosition, anchor.position)
          const pickedDistance = Cartesian3.distance(cameraPosition, pickedPosition)
          if (pickedDistance + 24 < anchorDistance) visible = false
        }
      } catch {
        // Depth picking is optional on some WebGL implementations.
      }
    }

    projected.push({
      locationId: anchor.locationId,
      x: screenPosition?.x ?? 0,
      y: screenPosition?.y ?? 0,
      intensity,
      visible,
    })
  }

  return projected
}

function addJourneyLocationVisuals(viewer: Viewer): JourneyLocationVisualController {
  const visuals: JourneyLocationVisual[] = []

  for (const locationId of journeyChapterLocationIds) {
    const location = verifiedParkvilleLocations.find((item) => item.id === locationId)
    if (!location) continue

    const accent = journeyAccent(location.category)
    const outline = new ConstantProperty(accent.withAlpha(0))
    const greenSpace = location.category === 'Green space'
    const childcare = location.category === 'Childcare'
    const radius = greenSpace ? 115 : childcare ? 34 : 52
    const entityId = `journey-location-${locationId}`

    const entity = viewer.entities.add({
      id: entityId,
      position: Cartesian3.fromDegrees(
        location.longitude,
        location.latitude,
        greenSpace ? 17 : childcare ? 22 : 34,
      ),
      show: false,
      ellipse: {
        semiMajorAxis: radius,
        semiMinorAxis: radius,
        height: 0.52,
        material: accent.withAlpha(0),
        outline: true,
        outlineColor: outline,
        outlineWidth: 1,
      },
    })

    const fill = (
      entity.ellipse?.material as unknown as { color?: ConstantProperty } | undefined
    )?.color
    if (!fill) continue

    visuals.push({
      locationId,
      fill,
      outline,
      accent,
      entityId,
    })
  }

  return {
    setHighlights(highlights) {
      for (const visual of visuals) {
        const intensity = clamp01(highlights[visual.locationId] ?? 0)
        const entity = viewer.entities.getById(visual.entityId)
        if (entity) entity.show = intensity > 0.015
        visual.fill.setValue(visual.accent.withAlpha(intensity * 0.11))
        visual.outline.setValue(visual.accent.withAlpha(intensity * 0.48))
      }
      viewer.scene.requestRender()
    },
  }
}

export function journeyChapterIndexAtProgress(progress: number) {
  const boundedProgress = clamp01(progress)
  let chapterIndex = 0

  for (let index = 0; index < parkvilleJourneyChapters.length - 1; index += 1) {
    const boundary = (
      parkvilleJourneyChapters[index].routeProgress
      + parkvilleJourneyChapters[index + 1].routeProgress
    ) / 2
    if (boundedProgress >= boundary) chapterIndex = index + 1
  }

  return chapterIndex
}

function bearingBetweenRoutePoints(start: ParkvilleRoutePoint, end: ParkvilleRoutePoint) {
  const startLatitude = CesiumMath.toRadians(start.latitude)
  const endLatitude = CesiumMath.toRadians(end.latitude)
  const longitudeDelta = CesiumMath.toRadians(end.longitude - start.longitude)
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude)
  const x = (
    Math.cos(startLatitude) * Math.sin(endLatitude)
    - Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta)
  )
  return (CesiumMath.toDegrees(Math.atan2(y, x)) + 360) % 360
}

function routePointAtExtendedDistance(distanceMetres: number) {
  if (distanceMetres >= 0 && distanceMetres <= parkvilleJourneyRouteLengthMetres) {
    return routePointAtDistance(distanceMetres)
  }

  if (distanceMetres < 0) {
    const start = parkvilleJourneyRoute[0]
    const next = parkvilleJourneyRoute[1]
    const firstSegmentLength = Math.max(
      0.001,
      parkvilleRouteCumulativeMetres[1],
    )
    return interpolateRoutePoint(start, next, distanceMetres / firstSegmentLength)
  }

  const endIndex = parkvilleJourneyRoute.length - 1
  const previous = parkvilleJourneyRoute[endIndex - 1]
  const end = parkvilleJourneyRoute[endIndex]
  const lastSegmentStart = parkvilleRouteCumulativeMetres[endIndex - 1]
  const lastSegmentLength = Math.max(
    0.001,
    parkvilleJourneyRouteLengthMetres - lastSegmentStart,
  )
  return interpolateRoutePoint(
    previous,
    end,
    1 + (distanceMetres - parkvilleJourneyRouteLengthMetres) / lastSegmentLength,
  )
}

function signedHeadingDelta(startHeading: number, endHeading: number) {
  return ((endHeading - startHeading + 540) % 360) - 180
}

interface ParkvilleJourneyFrame {
  routeDistanceMetres: number
  markerPoint: ParkvilleRoutePoint
  cameraView: Required<CesiumCameraView>
}

function journeyFrameAtProgress(progress: number): ParkvilleJourneyFrame {
  const routeDistanceMetres = clamp01(progress) * parkvilleJourneyRouteLengthMetres

  // The marker represents the exact scroll progress. The camera occupies the
  // same route a comfortable distance behind it, including a short extension
  // before the first route point so the relationship is stable at both ends.
  const cameraTrailMetres = 76
  const headingLeadBeyondMarkerMetres = 14
  const lookAheadBeyondMarkerMetres = 38
  const cameraDistance = routeDistanceMetres - cameraTrailMetres
  const cameraPoint = routePointAtExtendedDistance(cameraDistance)
  const markerPoint = routePointAtDistance(routeDistanceMetres)
  const headingPoint = routePointAtExtendedDistance(
    routeDistanceMetres + headingLeadBeyondMarkerMetres,
  )
  const lookPoint = routePointAtExtendedDistance(
    routeDistanceMetres + lookAheadBeyondMarkerMetres,
  )

  const incomingBearing = bearingBetweenRoutePoints(
    routePointAtExtendedDistance(cameraDistance - 12),
    routePointAtExtendedDistance(cameraDistance + 12),
  )
  const outgoingBearing = bearingBetweenRoutePoints(
    markerPoint,
    routePointAtExtendedDistance(routeDistanceMetres + 24),
  )
  const turnAmount = Math.abs(signedHeadingDelta(incomingBearing, outgoingBearing))
  const cameraHeight = 78 + Math.min(16, turnAmount * 0.22)
  const horizontalLookDistance = Math.max(
    24,
    distanceBetweenRoutePoints(cameraPoint, lookPoint),
  )
  const pitch = Math.min(
    -24,
    Math.max(
      -42,
      CesiumMath.toDegrees(Math.atan2(
        journeyRouteHeightMetres - cameraHeight,
        horizontalLookDistance,
      )),
    ),
  )

  return {
    routeDistanceMetres,
    markerPoint,
    cameraView: {
      longitude: cameraPoint.longitude,
      latitude: cameraPoint.latitude,
      height: cameraHeight,
      heading: bearingBetweenRoutePoints(cameraPoint, headingPoint),
      pitch,
      roll: 0,
    },
  }
}

const parkvilleOverviewView = journeyFrameAtProgress(0).cameraView

interface JourneyGuideController {
  setFrame: (frame: ParkvilleJourneyFrame) => void
}

function splitRoutePositions(distance: number) {
  const routePoint = routePointAtDistance(distance)
  const currentPosition = Cartesian3.fromDegrees(
    routePoint.longitude,
    routePoint.latitude,
    journeyRouteHeightMetres,
  )
  let nextIndex = parkvilleRouteCumulativeMetres.findIndex(
    (cumulativeDistance) => cumulativeDistance > distance,
  )
  if (nextIndex === -1) nextIndex = parkvilleJourneyRoute.length

  const completed = [
    ...parkvilleRouteCartesianPositions.slice(0, nextIndex),
    currentPosition,
  ]
  const remaining = [
    currentPosition,
    ...parkvilleRouteCartesianPositions.slice(nextIndex),
  ]

  if (completed.length === 1) completed.push(currentPosition)
  if (remaining.length === 1) remaining.push(currentPosition)

  return { completed, remaining, routePoint }
}

function addJourneyGuide(viewer: Viewer): JourneyGuideController {
  const initial = splitRoutePositions(0)
  const completedPositions = new ConstantProperty(initial.completed)
  const remainingPositions = new ConstantProperty(initial.remaining)
  const markerStemPositions = new ConstantProperty([])

  viewer.entities.add({
    id: 'parkville-journey-route-underlay',
    polyline: {
      positions: parkvilleRouteCartesianPositions,
      width: 16,
      material: Color.fromCssColorString('#2c5eaf').withAlpha(0.24),
    },
  })

  viewer.entities.add({
    id: 'parkville-journey-route-remaining',
    polyline: {
      positions: remainingPositions,
      width: 10,
      material: Color.fromCssColorString('#aeb9e9').withAlpha(0.9),
    },
  })

  viewer.entities.add({
    id: 'parkville-journey-route-completed',
    polyline: {
      positions: completedPositions,
      width: 11,
      material: Color.fromCssColorString('#6d78e8').withAlpha(0.98),
    },
  })

  viewer.entities.add({
    id: 'parkville-journey-marker-stem',
    polyline: {
      positions: markerStemPositions,
      width: 2,
      material: Color.fromCssColorString('#dfe4ff').withAlpha(0.88),
    },
  })

  // Entity cylinder positions trigger geometry rebatching when changed every
  // frame. Keep one GPU primitive alive and move its local ENU transform so
  // the Plumbob remains present throughout camera motion.
  const markerPrimitive = viewer.scene.primitives.add(new Primitive({
    geometryInstances: [
      new GeometryInstance({
        id: 'parkville-journey-marker-lower',
        geometry: new CylinderGeometry({
          length: 3.2,
          topRadius: 1.7,
          bottomRadius: 0,
          slices: 4,
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 11)),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(
            Color.fromCssColorString('#5367b8'),
          ),
        },
      }),
      new GeometryInstance({
        id: 'parkville-journey-marker-upper',
        geometry: new CylinderGeometry({
          length: 3.2,
          topRadius: 0,
          bottomRadius: 1.7,
          slices: 4,
          vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 14.2)),
        attributes: {
          color: ColorGeometryInstanceAttribute.fromColor(
            Color.fromCssColorString('#9aa6f2'),
          ),
        },
      }),
    ],
    appearance: new PerInstanceColorAppearance({
      closed: true,
      flat: true,
      translucent: false,
    }),
    asynchronous: false,
    allowPicking: false,
  }))

  function setFrame(frame: ParkvilleJourneyFrame) {
    const route = splitRoutePositions(frame.routeDistanceMetres)
    const { longitude, latitude } = frame.markerPoint
    const stemBottom = Cartesian3.fromDegrees(longitude, latitude, 0.9)
    const stemTop = Cartesian3.fromDegrees(longitude, latitude, 8.2)

    completedPositions.setValue(route.completed)
    remainingPositions.setValue(route.remaining)
    markerStemPositions.setValue([stemBottom, stemTop])
    markerPrimitive.modelMatrix = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(longitude, latitude, 0),
    )
  }

  setFrame(journeyFrameAtProgress(0))
  return { setFrame }
}

const verificationBoundaryId = 'verification-coverage-boundary'
const verificationEntityPrefix = 'verification-location-'

function verificationColor(category: VerificationCategory) {
  if (category === 'Healthcare') return Color.fromCssColorString('#6d78e8')
  if (category === 'Green space') return Color.fromCssColorString('#609b77')
  if (category === 'Education') return Color.fromCssColorString('#7186c7')
  return Color.fromCssColorString('#8293d8')
}

function addVerificationEntities(viewer: Viewer) {
  viewer.entities.add({
    id: verificationBoundaryId,
    position: Cartesian3.fromDegrees(
      parkvilleCoverage.longitude,
      parkvilleCoverage.latitude,
      0.42,
    ),
    show: false,
    ellipse: {
      semiMajorAxis: parkvilleCoverage.radiusMetres,
      semiMinorAxis: parkvilleCoverage.radiusMetres,
      height: 0.42,
      material: Color.fromCssColorString('#6d78e8').withAlpha(0.06),
      outline: true,
      outlineColor: Color.fromCssColorString('#5367b8').withAlpha(0.88),
      outlineWidth: 2,
    },
  })

  for (const location of verifiedParkvilleLocations) {
    const color = verificationColor(location.category)
    viewer.entities.add({
      id: `${verificationEntityPrefix}${location.id}`,
      position: Cartesian3.fromDegrees(
        location.longitude,
        location.latitude,
        3,
      ),
      show: false,
      point: {
        color,
        pixelSize: 13,
        outlineColor: Color.WHITE.withAlpha(0.96),
        outlineWidth: 3,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(100, 1.15, 2200, 0.7),
      },
    })
  }
}

function setVerificationEntitiesVisible(viewer: Viewer, enabled: boolean) {
  const boundary = viewer.entities.getById(verificationBoundaryId)
  if (boundary) boundary.show = enabled

  for (const location of verifiedParkvilleLocations) {
    const entity = viewer.entities.getById(`${verificationEntityPrefix}${location.id}`)
    if (entity) entity.show = enabled
  }

  viewer.scene.requestRender()
}

function focusOnVerifiedLocation(viewer: Viewer, location: VerifiedParkvilleLocation) {
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(
      location.longitude + 0.00105,
      location.latitude - 0.0015,
      205,
    ),
    orientation: {
      heading: CesiumMath.toRadians(338),
      pitch: CesiumMath.toRadians(-33),
      roll: 0,
    },
    duration: 1.1,
  })
}

const CesiumScene = forwardRef<CesiumSceneHandle, CesiumSceneProps>(function CesiumScene(
  {
    onVerificationLocationSelect,
    onJourneyOverlayUpdate,
    onLoadProgress,
    onLoadPhaseChange,
    onReady,
    onLoadError,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const journeyGuideRef = useRef<JourneyGuideController | null>(null)
  const journeyLocationVisualsRef = useRef<JourneyLocationVisualController | null>(null)
  const environmentHighlightsRef = useRef<MelbourneJourneyHighlightController | null>(null)
  const journeyVisualsEnabledRef = useRef(true)
  const journeyHighlightsRef = useRef<Readonly<Record<string, number>>>(
    journeyHighlightsAtProgress(0),
  )
  const journeyProgressRef = useRef(0)
  const journeyTargetProgressRef = useRef(0)
  const journeyAnimationFrameRef = useRef<number | null>(null)
  const journeyAnimationTimeRef = useRef<number | null>(null)
  const verificationSelectRef = useRef(onVerificationLocationSelect)
  const journeyOverlayUpdateRef = useRef(onJourneyOverlayUpdate)
  const loadCallbacksRef = useRef({
    onLoadProgress,
    onLoadPhaseChange,
    onReady,
    onLoadError,
  })
  verificationSelectRef.current = onVerificationLocationSelect
  journeyOverlayUpdateRef.current = onJourneyOverlayUpdate
  loadCallbacksRef.current = {
    onLoadProgress,
    onLoadPhaseChange,
    onReady,
    onLoadError,
  }

  function applyJourneyProgress(viewer: Viewer, progress: number) {
    const frame = journeyFrameAtProgress(progress)
    const highlights = journeyVisualsEnabledRef.current
      ? journeyHighlightsAtProgress(progress)
      : {}
    journeyHighlightsRef.current = highlights
    journeyGuideRef.current?.setFrame(frame)
    journeyLocationVisualsRef.current?.setHighlights(highlights)
    environmentHighlightsRef.current?.setHighlights(highlights)
    viewer.camera.setView({
      destination: cameraDestination(frame.cameraView),
      orientation: cameraOrientation(frame.cameraView),
    })
    viewer.scene.requestRender()
  }

  function stopJourneyAnimation() {
    if (journeyAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(journeyAnimationFrameRef.current)
    }
    journeyAnimationFrameRef.current = null
    journeyAnimationTimeRef.current = null
    journeyTargetProgressRef.current = journeyProgressRef.current
  }

  function animateJourneyProgress() {
    if (journeyAnimationFrameRef.current !== null) return

    const animate = (time: number) => {
      journeyAnimationFrameRef.current = null
      const viewer = viewerRef.current
      if (!viewer) return

      const previousTime = journeyAnimationTimeRef.current
      const elapsed = previousTime === null ? 16 : Math.min(50, time - previousTime)
      journeyAnimationTimeRef.current = time

      const current = journeyProgressRef.current
      const target = journeyTargetProgressRef.current
      const difference = target - current
      const blend = 1 - Math.exp(-elapsed / 90)
      const next = Math.abs(difference) < 0.00002
        ? target
        : current + difference * blend

      journeyProgressRef.current = next
      applyJourneyProgress(viewer, next)

      if (next !== target) {
        journeyAnimationFrameRef.current = window.requestAnimationFrame(animate)
      } else {
        journeyAnimationTimeRef.current = null
      }
    }

    journeyAnimationFrameRef.current = window.requestAnimationFrame(animate)
  }

  useImperativeHandle(ref, () => ({
    setCameraView(view) {
      stopJourneyAnimation()
      viewerRef.current?.camera.setView({
        destination: cameraDestination(view),
        orientation: cameraOrientation(view),
      })
      viewerRef.current?.scene.requestRender()
    },
    flyCameraTo(view, duration = 1.5) {
      stopJourneyAnimation()
      viewerRef.current?.camera.flyTo({
        destination: cameraDestination(view),
        orientation: cameraOrientation(view),
        duration,
      })
    },
    setJourneyProgress(progress) {
      journeyTargetProgressRef.current = clamp01(progress)
      const viewer = viewerRef.current
      if (!viewer) return

      viewer.camera.cancelFlight()
      animateJourneyProgress()
    },
    setJourneyPaused(paused) {
      if (paused) stopJourneyAnimation()
    },
    setVerificationMode(enabled) {
      const viewer = viewerRef.current
      if (enabled) stopJourneyAnimation()
      journeyVisualsEnabledRef.current = !enabled
      if (viewer) {
        setVerificationEntitiesVisible(viewer, enabled)
        const highlights = enabled
          ? {}
          : journeyHighlightsAtProgress(journeyProgressRef.current)
        journeyHighlightsRef.current = highlights
        journeyLocationVisualsRef.current?.setHighlights(highlights)
        environmentHighlightsRef.current?.setHighlights(highlights)
      }
    },
    focusOnVerifiedLocation(locationId) {
      const viewer = viewerRef.current
      const location = verifiedParkvilleLocations.find((item) => item.id === locationId)
      if (viewer && location) {
        stopJourneyAnimation()
        focusOnVerifiedLocation(viewer, location)
      }
    },
  }), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Keep Cesium from falling back to any ion-backed service.
    Ion.defaultAccessToken = ''

    let viewer: Viewer
    try {
      viewer = new Viewer(container, {
        animation: false,
        baseLayer: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        globe: undefined,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        projectionPicker: false,
        scene3DOnly: true,
        sceneModePicker: false,
        selectionIndicator: false,
        shouldAnimate: false,
        skyAtmosphere: false,
        skyBox: false,
        terrainProvider: new EllipsoidTerrainProvider(),
        timeline: false,
        useBrowserRecommendedResolution: false,
        vrButton: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Number.POSITIVE_INFINITY,
        msaaSamples: 4,
      })
    } catch (error) {
      loadCallbacksRef.current.onLoadError?.(
        error instanceof Error
          ? error.message
          : 'The 3D renderer could not be started.',
      )
      return
    }

    viewerRef.current = viewer
    updateViewerResolution(viewer)
    viewer.scene.postProcessStages.fxaa.enabled = true
    if (viewer.scene.msaaSupported) viewer.scene.msaaSamples = 4
    viewer.scene.highDynamicRange = true
    viewer.scene.backgroundColor = Color.fromCssColorString('#e3edf7')
    viewer.scene.globe.baseColor = Color.fromCssColorString('#d7e1ea')
    viewer.scene.globe.showGroundAtmosphere = false
    viewer.scene.globe.depthTestAgainstTerrain = true
    viewer.scene.fog.enabled = true
    viewer.scene.fog.density = 0.00018
    viewer.scene.fog.visualDensityScalar = 0.035
    viewer.scene.fog.minimumBrightness = 0.72
    viewer.scene.light = new DirectionalLight({
      direction: Cartesian3.normalize(
        new Cartesian3(-0.5, 0.43, -0.75),
        new Cartesian3(),
      ),
      intensity: 1.18,
    })
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 18
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 2600
    viewer.camera.setView({
      destination: cameraDestination(parkvilleOverviewView),
      orientation: cameraOrientation(parkvilleOverviewView),
    })
    addVerificationEntities(viewer)
    journeyGuideRef.current = addJourneyGuide(viewer)
    journeyLocationVisualsRef.current = addJourneyLocationVisuals(viewer)
    journeyLocationVisualsRef.current.setHighlights(journeyHighlightsAtProgress(0))
    loadCallbacksRef.current.onLoadPhaseChange?.('resources')

    const removeOverlayProjectionListener = viewer.scene.postRender.addEventListener(() => {
      journeyOverlayUpdateRef.current?.(
        projectJourneyOverlayAnchors(viewer, journeyHighlightsRef.current),
      )
    })

    const verificationClickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    verificationClickHandler.setInputAction((movement: { position: Cartesian2 }) => {
      const picked = viewer.scene.pick(movement.position) as
        | { id?: { id?: string } }
        | undefined
      const pickedId = picked?.id?.id
      if (!pickedId?.startsWith(verificationEntityPrefix)) return

      const locationId = pickedId.slice(verificationEntityPrefix.length)
      const location = verifiedParkvilleLocations.find((item) => item.id === locationId)
      if (!location) return

      focusOnVerifiedLocation(viewer, location)
      verificationSelectRef.current?.(locationId)
    }, ScreenSpaceEventType.LEFT_CLICK)

    viewer.scene.requestRender()

    const handleResolutionChange = () => updateViewerResolution(viewer)
    window.addEventListener('resize', handleResolutionChange, { passive: true })

    let disposed = false
    let loadFailed = false
    let removeReadinessListener: (() => void) | undefined
    void addMelbourneStreetEnvironment(viewer, ({ loaded, total, label }) => {
      if (!disposed && !loadFailed) {
        loadCallbacksRef.current.onLoadProgress?.(loaded, total, label)
      }
    })
      .then((highlightController) => {
        if (disposed || !highlightController) return
        environmentHighlightsRef.current = highlightController
        highlightController.setHighlights(
          journeyVisualsEnabledRef.current
            ? journeyHighlightsAtProgress(journeyProgressRef.current)
            : {},
        )
        loadCallbacksRef.current.onLoadPhaseChange?.('preparing')

        // Resource completion does not mean Cesium's asynchronous geometry is
        // on the GPU yet. Wait until both entity visualizers and our custom
        // building/tree primitives are ready, then require one further fully
        // prepared render before revealing the scene.
        let preparedFrameCount = 0
        removeReadinessListener = viewer.scene.postRender.addEventListener(() => {
          if (disposed || viewer.isDestroyed()) return

          const entitiesReady = viewer.dataSourceDisplay.update(
            viewer.clock.currentTime,
          )
          const primitivesReady = highlightController.isReady()

          if (entitiesReady && primitivesReady) {
            preparedFrameCount += 1
            if (preparedFrameCount >= 2) {
              removeReadinessListener?.()
              removeReadinessListener = undefined
              loadCallbacksRef.current.onReady?.()
              return
            }
          } else {
            preparedFrameCount = 0
          }

          viewer.scene.requestRender()
        })
        viewer.scene.requestRender()
      })
      .catch((error: unknown) => {
        if (!disposed) {
          loadFailed = true
          console.error('Could not load the local Melbourne scene data.', error)
          loadCallbacksRef.current.onLoadError?.(
            error instanceof Error
              ? error.message
              : 'The local scene resources could not be loaded.',
          )
        }
      })

    return () => {
      disposed = true
      window.removeEventListener('resize', handleResolutionChange)
      removeReadinessListener?.()
      removeOverlayProjectionListener()
      stopJourneyAnimation()
      if (!verificationClickHandler.isDestroyed()) verificationClickHandler.destroy()
      journeyGuideRef.current = null
      journeyLocationVisualsRef.current = null
      environmentHighlightsRef.current = null
      viewerRef.current = null
      if (!viewer.isDestroyed()) viewer.destroy()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="cesium-scene"
      aria-label="Local 3D model of the Parkville health, education and green-space precinct"
    />
  )
})

export default CesiumScene
