import * as THREE from 'three'
import { stationProgress, weatherAt, type JourneyState } from './journey'
import { routePosition, routeLength, terrainHeight, cameraPose, cameraSettings, terrainOccludes } from './landscape'
import { createJourneyWeather } from './JourneyWeather'
import { createVegetationLayout } from './vegetation'

/** Local traveller lighting only; all distances are scene units. */
export const travellerSettings = {
  haloSize: 1.8,
  haloOpacity: .7,
  groundClearance: .15,
  lightColor: '#b5eaff',
  lightIntensity: 14,
  lightDistance: 10,
  lightDecay: 2,
}

/** One continuous fictional terrain; no geography or data is encoded in it. */
export function createJourneyScene(host: HTMLElement, read: () => JourneyState, onFailure: () => void) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setClearColor(0x000000, 0)
  renderer.autoClear = false
  host.prepend(renderer.domElement)
  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2('#bfd8e4', .002)
  scene.fog = fog
  const camera = new THREE.PerspectiveCamera(52, 1, .2, 600)
  const weatherLayer = createJourneyWeather()
  host.dataset.routeLength = routeLength.toFixed(2)
  const ambient = new THREE.HemisphereLight('#e9f8ff', '#376c81', 2.5)
  const sunlight = new THREE.DirectionalLight('#fff1d0', 2.6)
  sunlight.position.set(-45, 90, 70)
  scene.add(ambient, sunlight)
  const terrain = new THREE.PlaneGeometry(640, 780, 180, 220)
  terrain.rotateX(-Math.PI / 2)
  terrain.translate(0, 0, 210)
  const positions = terrain.attributes.position
  const colors = new Float32Array(positions.count * 3)
  const color = new THREE.Color(), low = new THREE.Color('#7bb9bc'), high = new THREE.Color('#7f9ebd')
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = terrainHeight(x, z)
    positions.setY(i, y)
    color.copy(low).lerp(high, Math.min(1, y / 85)).multiplyScalar(.96 + Math.sin(x * .28 + z * .1) * .04)
    colors.set([color.r, color.g, color.b], i * 3)
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  terrain.computeVertexNormals()
  const terrainMesh = new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }))
  scene.add(terrainMesh)
  class GroundRoute extends THREE.Curve<THREE.Vector3> {
    constructor() { super() }
    getPoint(t: number, target = new THREE.Vector3()) {
      const p = routePosition(t)
      return target.set(p.x, p.y, p.z)
    }
    getPointAt(t: number, target = new THREE.Vector3()) { return this.getPoint(t, target) }
  }
  const curve = new GroundRoute()
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 1600, .085, 5, false), new THREE.MeshBasicMaterial({ color: '#e0ffff', fog: false })))
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 1600, .25, 5, false), new THREE.MeshBasicMaterial({ color: '#73e4ff', transparent: true, opacity: .3, depthWrite: false, fog: false })))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(238,255,255,1)')
  gradient.addColorStop(.16, 'rgba(154,238,255,.95)')
  gradient.addColorStop(.4, 'rgba(113,220,255,.3)')
  gradient.addColorStop(1, 'rgba(113,220,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const glowTexture = new THREE.CanvasTexture(canvas)
  const sprite = (size: number) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, transparent: true, depthWrite: false, fog: true }))
    glow.scale.set(size, size, 1)
    return glow
  }
  const sphere = new THREE.SphereGeometry(.32, 12, 8), ring = new THREE.TorusGeometry(.85, .045, 6, 36)
  const nodes = stationProgress.map(progress => {
    const point = routePosition(progress), group = new THREE.Group()
    group.position.set(point.x, point.y + .1, point.z)
    const material = new THREE.MeshBasicMaterial({ color: '#a1d5e6', transparent: true, opacity: .6, fog: false })
    const halo = sprite(5), orbit = new THREE.Mesh(ring, material)
    const normal = new THREE.Vector3(terrainHeight(point.x - .2, point.z) - terrainHeight(point.x + .2, point.z), .4, terrainHeight(point.x, point.z - .2) - terrainHeight(point.x, point.z + .2)).normalize()
    orbit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    group.add(new THREE.Mesh(sphere, material), orbit, halo)
    scene.add(group)
    return { group, material, halo }
  })
  const traveller = new THREE.Group()
  const travellerHalo = sprite(travellerSettings.haloSize)
  travellerHalo.material.opacity = travellerSettings.haloOpacity
  const groundLight = new THREE.PointLight(travellerSettings.lightColor, travellerSettings.lightIntensity, travellerSettings.lightDistance, travellerSettings.lightDecay)
  traveller.add(travellerHalo, new THREE.Mesh(new THREE.SphereGeometry(.23, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false })), groundLight)
  scene.add(traveller)
  // A fixed clearance based on the steepest rendered triangle keeps the entire
  // billboard clear at every orientation, without height jumps at cell boundaries.
  const { width: terrainWidth, height: terrainDepth, widthSegments, heightSegments } = terrain.parameters
  const cellWidth = terrainWidth / widthSegments, cellDepth = terrainDepth / heightSegments
  const stride = widthSegments + 1
  let maxSlope = 0
  for (let row = 0; row < heightSegments; row++) {
    for (let col = 0; col < widthSegments; col++) {
      const index = row * stride + col
      const a = positions.getY(index), b = positions.getY(index + stride)
      const c = positions.getY(index + stride + 1), d = positions.getY(index + 1)
      maxSlope = Math.max(maxSlope, Math.hypot((d - a) / cellWidth, (b - a) / cellDepth), Math.hypot((c - b) / cellWidth, (c - d) / cellDepth))
    }
  }
  const haloClearance = travellerSettings.haloSize / Math.SQRT2 * Math.hypot(1, maxSlope) + travellerSettings.groundClearance
  const travellerHeight = (x: number, z: number) => {
    const column = Math.min(widthSegments - .00001, Math.max(0, (x + terrainWidth / 2) / cellWidth))
    const row = Math.min(heightSegments - .00001, Math.max(0, (z - 210 + terrainDepth / 2) / cellDepth))
    const index = Math.floor(row) * stride + Math.floor(column)
    const u = column % 1, v = row % 1
    const a = positions.getY(index), b = positions.getY(index + stride)
    const c = positions.getY(index + stride + 1), d = positions.getY(index + 1)
    const ground = u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v)
    return ground + haloClearance
  }
  const placements = createVegetationLayout()
  const trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 3.6, 5), new THREE.MeshStandardMaterial({ color: '#568e98', roughness: 1, flatShading: true }), placements.length)
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.1, .15, 1.7, 4), new THREE.MeshStandardMaterial({ color: '#668996' }), placements.length)
  const dummy = new THREE.Object3D()
  const groundRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
  terrainMesh.updateMatrixWorld()
  placements.forEach(({ x, z, scale, rotation }, i) => {
    // Sample the rendered triangles once: the analytic surface differs slightly.
    groundRay.ray.origin.set(x, 200, z)
    const y = groundRay.intersectObject(terrainMesh, false)[0]?.point.y ?? terrainHeight(x, z)
    dummy.rotation.set(0, rotation, 0)
    dummy.position.set(x, y + 2 * scale, z)
    dummy.scale.setScalar(scale); dummy.updateMatrix(); trees.setMatrixAt(i, dummy.matrix)
    dummy.position.y = y + .85 * scale
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix)
  })
  scene.add(trees, trunks)
  const labels = Array.from(host.querySelectorAll<HTMLElement>('[data-station]'))
  const projected = new THREE.Vector3(), target = new THREE.Vector3(), labelOffset = new THREE.Vector3(0, 2.4, 0)
  const clearFog = new THREE.Color('#bfd8e4'), stormFog = new THREE.Color('#7f95a8'), sunnyFog = new THREE.Color('#d7e7e6')
  let width = 1, height = 1, lastFrame = 0, lastProgress = -1, disposed = false
  const resize = () => {
    width = host.clientWidth; height = host.clientHeight
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); lastProgress = -1
    const framing = width <= 760 ? cameraSettings.mobile : cameraSettings.desktop
    // Shift the optical centre into the clear area beside the HTML panel, without
    // rotating away from the route or changing the terrain / field of view.
    camera.setViewOffset(width, height, -(framing.screenAnchorX - .5) * width, 0, width, height)
    weatherLayer.resize(width, height)
  }
  const observer = new ResizeObserver(resize)
  observer.observe(host); resize()
  const render = (time: number) => {
    if (disposed || document.hidden || time - lastFrame < 32) return
    const dt = Math.min((time - lastFrame) / 1000, .06)
    lastFrame = time
    const { progress, chapter } = read(), weather = weatherAt(progress)
    if (progress !== lastProgress) {
      const point = routePosition(progress), pose = cameraPose(progress, width <= 760)
      camera.position.set(pose.x, pose.y, pose.z)
      target.set(pose.target.x, pose.target.y, pose.target.z)
      camera.lookAt(target); camera.updateMatrixWorld()
      traveller.position.set(point.x, travellerHeight(point.x, point.z), point.z)
      fog.color.copy(clearFog).lerp(stormFog, weather.storm).lerp(sunnyFog, weather.sun)
      fog.density = .0018 + weather.mist * .002 + weather.storm * .0008
      sunlight.intensity = 2.2 - weather.storm * 1.85 + weather.sun * .5
      sunlight.color.set('#fff1d0').lerp(new THREE.Color('#c7dbff'), weather.storm)
      ambient.intensity = 2 - weather.storm * .95
      host.dataset.cameraClearance = (pose.y - terrainHeight(pose.x, pose.z)).toFixed(2)
      host.dataset.cameraPosition = JSON.stringify([pose.x, pose.y, pose.z])
      host.dataset.routeElevation = point.y.toFixed(2)
      projected.copy(traveller.position).project(camera)
      host.dataset.markerVisible = String(Math.abs(projected.x) < .95 && Math.abs(projected.y) < .95 && projected.z < 1 && !terrainOccludes(pose, traveller.position))
      host.dataset.markerScreen = JSON.stringify([projected.x, projected.y])
      host.dataset.sceneProgress = progress.toFixed(5)
      lastProgress = progress
    }
    nodes.forEach((node, i) => {
      const current = i === chapter, opacity = current ? 1 : i < chapter ? .65 : .35
      node.material.opacity += (opacity - node.material.opacity) * (1 - Math.exp(-9 * dt))
      node.material.color.set(current ? '#f4ffff' : '#83d7e8')
      node.halo.material.opacity += ((current ? .95 : i < chapter ? .35 : .12) - node.halo.material.opacity) * (1 - Math.exp(-9 * dt))
      node.halo.scale.setScalar(current ? 5.2 + Math.sin(time * .0014) * .12 : 3)
      const label = labels[i]
      if (label) {
        projected.copy(node.group.position).add(labelOffset).project(camera)
        const visible = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .97 && Math.abs(projected.y) < .9 && camera.position.distanceTo(node.group.position) < 132 && !terrainOccludes(camera.position, node.group.position)
        label.style.transform = `translate(${(projected.x * .5 + .5) * width}px, ${(-projected.y * .5 + .5) * height}px) translate(-50%, -100%)`
        label.style.opacity = visible ? current ? '1' : '.65' : '0'
        label.dataset.state = current ? 'current' : i < chapter ? 'passed' : 'future'
      }
    })
    weatherLayer.renderSky(renderer, progress, time)
    renderer.render(scene, camera)
    weatherLayer.renderRain(renderer, camera, progress, time)
  }
  const contextLost = (event: Event) => { event.preventDefault(); renderer.setAnimationLoop(null); onFailure() }
  renderer.domElement.addEventListener('webglcontextlost', contextLost)
  renderer.setAnimationLoop(render)
  return () => {
    disposed = true; renderer.setAnimationLoop(null); observer.disconnect()
    renderer.domElement.removeEventListener('webglcontextlost', contextLost)
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
    scene.traverse(object => {
      const mesh = object as THREE.Mesh
      if (mesh.geometry) geometries.add(mesh.geometry)
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(material => materials.add(material))
    })
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose())
    trees.dispose(); trunks.dispose(); glowTexture.dispose(); weatherLayer.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
  }
}
