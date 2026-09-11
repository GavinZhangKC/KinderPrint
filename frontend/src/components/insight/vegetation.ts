import { cameraPose, routePosition, terrainHeight, type Point } from './landscape'
import { stationProgress } from './journey'

type Region = { x: number; z: number; rx: number; rz: number }
type TreePlacement = { x: number; z: number; scale: number; rotation: number }

/** Scene units only. Edit these regions rather than the tree meshes. */
export const vegetationSettings = {
  seed: 73129,
  maxTrees: 150,
  maxSlope: .8,
  thinningHeight: 36,
  maxHeight: 69,
  minSpacing: 2.8,
  routeClearance: 5.5,
  stationClearance: 10,
  scale: [.65, 1.12] as const,
  groves: [
    { x: -24, z: 30, rx: 24, rz: 32, count: 23 },
    { x: 42, z: 53, rx: 27, rz: 23, count: 24 },
    { x: 43, z: 133, rx: 25, rz: 30, count: 18 },
    { x: 106, z: 181, rx: 26, rz: 33, count: 19 },
    { x: -73, z: 247, rx: 23, rz: 29, count: 13 },
    { x: -8, z: 279, rx: 30, rz: 28, count: 19 },
    { x: 5, z: 362, rx: 32, rz: 35, count: 20 },
    { x: 92, z: 416, rx: 24, rz: 32, count: 14 },
  ],
  exclusions: [
    { x: -9, z: 207, rx: 28, rz: 25 }, // Open saddle.
    { x: 43, z: 406, rx: 29, rz: 24 }, // Open arrival basin.
  ] as Region[],
  // Add exact positions here; they still respect terrain and sight-line safety.
  overrides: [] as TreePlacement[],
}

export function createVegetationLayout(): TreePlacement[] {
  const config = vegetationSettings
  let seed = config.seed >>> 0
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const route = Array.from({ length: 241 }, (_, i) => routePosition(i / 240))
  const stations = stationProgress.map(routePosition)
  const views: { from: Point; to: Point }[] = []
  for (let i = 0; i <= 120; i++) {
    const progress = i / 120, point = routePosition(progress)
    for (const mobile of [false, true]) {
      const from = cameraPose(progress, mobile)
      views.push({ from, to: { ...point, y: point.y + .6 } })
      for (const station of stations) {
        if (Math.hypot(station.x - point.x, station.z - point.z) < 22) views.push({ from, to: station })
      }
    }
  }
  const result: TreePlacement[] = []
  const plant = (tree: TreePlacement) => {
    const { x, z, scale } = tree, y = terrainHeight(x, z)
    const slope = Math.hypot((terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) / 2, (terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) / 2)
    if (slope > config.maxSlope || y > config.maxHeight || scale <= 0) return false
    if (config.exclusions.some(r => ((x - r.x) / r.rx) ** 2 + ((z - r.z) / r.rz) ** 2 < 1)) return false
    if (route.some(p => Math.hypot(x - p.x, z - p.z) < config.routeClearance)) return false
    if (stations.some(p => Math.hypot(x - p.x, z - p.z) < config.stationClearance)) return false
    if (result.some(p => Math.hypot(x - p.x, z - p.z) < config.minSpacing * (scale + p.scale) / 2)) return false
    // Keep the actual desktop/mobile camera-to-light corridors free of crowns.
    if (views.some(({ from, to }) => {
      const dx = to.x - from.x, dz = to.z - from.z
      const t = ((x - from.x) * dx + (z - from.z) * dz) / (dx * dx + dz * dz)
      const rayY = from.y + (to.y - from.y) * t
      return t > 0 && t < 1 && Math.hypot(x - from.x - dx * t, z - from.z - dz * t) < scale + 1.3
        && rayY > y - .3 && rayY < y + 3.8 * scale + 1
    })) return false
    result.push(tree)
    return true
  }
  config.overrides.slice(0, config.maxTrees).forEach(plant)
  for (const grove of config.groves) {
    let planted = 0
    for (let attempt = 0; attempt < grove.count * 35 && planted < grove.count && result.length < config.maxTrees; attempt++) {
      // Dense irregular core with a sparse outer fringe; no terrain-wide scatter.
      const angle = random() * Math.PI * 2
      const radius = random() < .78 ? Math.sqrt(random() * random()) : .7 + random() * .65
      const x = grove.x + Math.cos(angle) * radius * grove.rx
      const z = grove.z + Math.sin(angle) * radius * grove.rz
      const height = terrainHeight(x, z)
      const slope = Math.hypot(terrainHeight(x + .5, z) - terrainHeight(x - .5, z), terrainHeight(x, z + .5) - terrainHeight(x, z - .5))
      const suitability = (1 - .7 * Math.min(1, slope / config.maxSlope))
        * (1 - .85 * Math.max(0, (height - config.thinningHeight) / (config.maxHeight - config.thinningHeight)))
      if (random() > suitability) continue
      if (plant({ x, z, scale: config.scale[0] + random() * (config.scale[1] - config.scale[0]), rotation: random() * Math.PI * 2 })) planted++
    }
  }
  return result
}
