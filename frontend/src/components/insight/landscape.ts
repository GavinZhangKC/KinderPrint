import { clamp, smoothstep } from './journey'

export interface Point { x: number; y: number; z: number }
const waypoints = [[0, 0], [12, 42], [57, 86], [83, 133], [62, 176], [-4, 204], [-54, 244], [-35, 290], [20, 322], [62, 352], [44, 405]]
const hill = (x: number, z: number, cx: number, cz: number, sx: number, sz: number, height: number) => height * Math.exp(-(((x - cx) / sx) ** 2) - ((z - cz) / sz) ** 2)

/** Valley floor → shoulder around the massif → high saddle → descent → open basin. */
export function terrainHeight(x: number, z: number) {
  return 2 + Math.sin(z * .025) * 1.1 + Math.sin(x * .027 + z * .018) * .7
    + hill(x, z, -25, 210, 62, 72, 76)
    + hill(x, z, -100, 65, 58, 92, 58)
    + hill(x, z, 139, 108, 65, 95, 66)
    + hill(x, z, -78, 291, 70, 62, 38)
    + hill(x, z, 142, 308, 64, 76, 67)
    + hill(x, z, -115, 439, 79, 89, 50)
    + hill(x, z, 160, 453, 70, 94, 57)
}

function spline(t: number): Point {
  const segment = Math.min(waypoints.length - 2, Math.floor(clamp(t) * (waypoints.length - 1)))
  const u = clamp(t) * (waypoints.length - 1) - segment
  const a = waypoints[Math.max(0, segment - 1)], b = waypoints[segment]
  const c = waypoints[segment + 1], d = waypoints[Math.min(waypoints.length - 1, segment + 2)]
  const coordinate = (axis: number) => .5 * ((2 * b[axis]) + (-a[axis] + c[axis]) * u + (2 * a[axis] - 5 * b[axis] + 4 * c[axis] - d[axis]) * u * u + (-a[axis] + 3 * b[axis] - 3 * c[axis] + d[axis]) * u * u * u)
  const x = coordinate(0), z = coordinate(1)
  return { x, z, y: terrainHeight(x, z) + .55 }
}

const samples = 2400
const lengths = new Float64Array(samples + 1)
let last = spline(0)
for (let i = 1; i <= samples; i++) {
  const point = spline(i / samples)
  lengths[i] = lengths[i - 1] + Math.hypot(point.x - last.x, point.y - last.y, point.z - last.z)
  last = point
}
export const routeLength = lengths[samples]

/** Arc-length lookup, including elevation: equal progress covers equal ground distance. */
export function routePosition(progress: number): Point {
  const distance = clamp(progress) * routeLength
  let lo = 0, hi = samples
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (lengths[mid] < distance) lo = mid; else hi = mid }
  const fraction = (distance - lengths[lo]) / Math.max(.00001, lengths[hi] - lengths[lo])
  return spline((lo + fraction) / samples)
}

/** Scene units; screenAnchorX is the optical centre as a viewport fraction. */
export const cameraSettings = {
  desktop: { followHeight: 10, backDistance: 32, sideOffset: 6, lookAhead: 11, screenAnchorX: .68 },
  mobile: { followHeight: 11, backDistance: 34, sideOffset: 2, lookAhead: 10, screenAnchorX: .5 },
  groundClearance: 6,
  routeClearance: .6,
  targetHeight: 4,
  headingWindow: 14,
  anticipationSamples: 4,
  smoothingSamples: 2,
  safetyMargin: .5,
  finale: { startsAt: .86, backDistance: 40, followHeight: 15, targetLift: 7 },
}

function railBase(progress: number, mobile: boolean) {
  const config = cameraSettings, follow = mobile ? config.mobile : config.desktop
  const ending = smoothstep((progress - config.finale.startsAt) / (1 - config.finale.startsAt))
  const backDistance = follow.backDistance + (config.finale.backDistance - follow.backDistance) * ending
  const followHeight = follow.followHeight + (config.finale.followHeight - follow.followHeight) * ending
  const point = routePosition(progress)
  const behindProgress = progress - backDistance / routeLength
  const behind = routePosition(behindProgress)
  const window = config.headingWindow / routeLength
  const headingProgress = Math.max(0, behindProgress)
  const before = routePosition(headingProgress - window), after = routePosition(headingProgress + window)
  // At the opening extend the first tangent behind the route, without moving it.
  const openingDirection = routePosition(window)
  if (behindProgress < 0) {
    const length = Math.hypot(openingDirection.x - behind.x, openingDirection.z - behind.z)
    behind.x += (openingDirection.x - behind.x) / length * behindProgress * routeLength
    behind.z += (openingDirection.z - behind.z) / length * behindProgress * routeLength
  }
  const distance = Math.hypot(after.x - before.x, after.z - before.z)
  const dx = (after.x - before.x) / distance, dz = (after.z - before.z) / distance
  const x = behind.x + dz * follow.sideOffset, z = behind.z - dx * follow.sideOffset
  let y = Math.max(point.y + config.targetHeight, terrainHeight(x, z) + Math.max(config.groundClearance, followHeight))
  // Check only the nearby route; distant ridges may naturally hide what lies ahead.
  // The shorter route-following rail needs less lift than a long tangent offset.
  for (let i = 1; i < 24; i++) {
    const t = i / 25
    const ground = terrainHeight(x + (point.x - x) * t, z + (point.z - z) * t)
    y = Math.max(y, (ground + config.routeClearance - (point.y + .7) * t) / (1 - t))
  }
  const ahead = routePosition(progress + follow.lookAhead / routeLength)
  // Extend the final heading into the vista after the route ends.
  const remaining = Math.max(0, follow.lookAhead - (1 - progress) * routeLength)
  const nearBefore = routePosition(progress - window), nearAfter = routePosition(progress + window)
  const headingLength = Math.hypot(nearAfter.x - nearBefore.x, nearAfter.z - nearBefore.z)
  return { x, y, z, target: {
    x: ahead.x + (nearAfter.x - nearBefore.x) / headingLength * remaining,
    y: point.y + config.targetHeight + (ahead.y - point.y) * .35 + ending * config.finale.targetLift,
    z: ahead.z + (nearAfter.z - nearBefore.z) / headingLength * remaining,
  } }
}

const railSamples = 600
function buildRail(mobile: boolean) {
  const rail = Array.from({ length: railSamples + 1 }, (_, i) => railBase(i / railSamples, mobile))
  const envelope = rail.map((_, i) => {
    let height = -Infinity
    for (let j = Math.max(0, i - cameraSettings.anticipationSamples); j <= Math.min(railSamples, i + cameraSettings.anticipationSamples); j++) height = Math.max(height, rail[j].y)
    return height
  })
  return rail.map((point, i) => {
    let sum = 0
    const radius = Math.min(cameraSettings.smoothingSamples, cameraSettings.anticipationSamples)
    for (let j = -radius; j <= radius; j++) sum += envelope[Math.min(railSamples, Math.max(0, i + j))]
    return { ...point, y: sum / (radius * 2 + 1) + cameraSettings.safetyMargin }
  })
}
const desktopRail = buildRail(false), mobileRail = buildRail(true)
export function cameraPose(progress: number, mobile: boolean) {
  const rail = mobile ? mobileRail : desktopRail
  const f = clamp(progress) * railSamples, i = Math.min(railSamples - 1, Math.floor(f)), t = f - i
  const a = rail[i], b = rail[i + 1]
  const mix = (x: number, y: number) => x + (y - x) * t
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), z: mix(a.z, b.z), target: { x: mix(a.target.x, b.target.x), y: mix(a.target.y, b.target.y), z: mix(a.target.z, b.target.z) } }
}

export function terrainOccludes(from: Point, to: Point) {
  for (let i = 1; i < 32; i++) {
    const t = i / 32
    if (terrainHeight(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t) > from.y + (to.y - from.y) * t - .15) return true
  }
  return false
}
