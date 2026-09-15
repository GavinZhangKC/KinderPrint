import * as THREE from 'three'
import { stationProgress, weatherAt, type JourneyState } from './journey'
import { routePosition, routeLength, terrainHeight, cameraPose, cameraSettings, terrainOccludes } from './landscape'
import { createJourneyWeather } from './JourneyWeather'
import { createShrubLayout, createVegetationLayout } from './vegetation'
import { createTerrainSurface } from './TerrainSurface'

/** Local traveller lighting only; all distances are scene units. */
export const travellerSettings = {
  haloSize: 2.15,
  haloOpacity: .82,
  groundClearance: .15,
  lightColor: '#ffe0a3',
  lightIntensity: 18,
  lightDistance: 14,
  lightDecay: 2,
}

/** One continuous fictional terrain; no geography or data is encoded in it. */
export function createJourneyScene(host: HTMLElement, read: () => JourneyState, onFailure: () => void) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.autoClear = false
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  host.prepend(renderer.domElement)
  const scene = new THREE.Scene()
  const fog = new THREE.FogExp2('#9eb7ad', .00235)
  scene.fog = fog
  const camera = new THREE.PerspectiveCamera(52, 1, .2, 600)
  const weatherLayer = createJourneyWeather()
  host.dataset.routeLength = routeLength.toFixed(2)
  const ambient = new THREE.HemisphereLight('#dcece5', '#263f3d', 1.5)
  const sunlight = new THREE.DirectionalLight('#ffe8bd', 2.15)
  sunlight.position.set(-80, 145, 185)
  sunlight.target.position.set(0, 14, 300)
  sunlight.castShadow = true
  sunlight.shadow.mapSize.set(2048, 2048)
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -360
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 360
  sunlight.shadow.camera.near = 1
  sunlight.shadow.camera.far = 520
  sunlight.shadow.bias = -.00025
  sunlight.shadow.normalBias = .12
  sunlight.shadow.radius = 3
  scene.add(ambient, sunlight, sunlight.target)
  const terrainCenterZ = 300
  const terrain = new THREE.PlaneGeometry(720, 1040, 180, 220)
  terrain.rotateX(-Math.PI / 2)
  terrain.translate(0, 0, terrainCenterZ)
  const terrainSurface = createTerrainSurface(terrain)
  const positions = terrain.attributes.position
  const terrainMesh = new THREE.Mesh(terrain, terrainSurface.material)
  terrainMesh.receiveShadow = true
  scene.add(terrainMesh)
  class GroundRoute extends THREE.Curve<THREE.Vector3> {
    constructor() { super() }
    getPoint(t: number, target = new THREE.Vector3()) {
      const p = routePosition(t)
      return target.set(p.x, terrainHeight(p.x, p.z) + .08, p.z)
    }
    getPointAt(t: number, target = new THREE.Vector3()) { return this.getPoint(t, target) }
  }
  const curve = new GroundRoute()
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 1600, .075, 6, false), new THREE.MeshStandardMaterial({ color: '#f3d69a', emissive: '#d3a552', emissiveIntensity: .3, roughness: .7, fog: true })))
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 1600, .34, 6, false), new THREE.MeshBasicMaterial({ color: '#f0c978', transparent: true, opacity: .1, depthWrite: false, fog: true })))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,252,225,1)')
  gradient.addColorStop(.16, 'rgba(255,224,163,.96)')
  gradient.addColorStop(.42, 'rgba(211,165,82,.34)')
  gradient.addColorStop(1, 'rgba(211,165,82,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  const glowTexture = new THREE.CanvasTexture(canvas)
  const sprite = (size: number, foreground: boolean) => {
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthTest: !foreground,
      depthWrite: false,
      fog: !foreground,
    }))
    glow.scale.set(size, size, 1)
    if (foreground) glow.renderOrder = 20
    return glow
  }
  const sphere = new THREE.SphereGeometry(.32, 12, 8), ring = new THREE.TorusGeometry(.85, .045, 6, 36)
  const nodes = stationProgress.map(progress => {
    const point = routePosition(progress), group = new THREE.Group()
    group.position.set(point.x, point.y + .1, point.z)
    const material = new THREE.MeshBasicMaterial({ color: '#a1d5e6', transparent: true, opacity: .6, depthTest: true, depthWrite: false, fog: true })
    // Only the atmospheric halo floats above the terrain. The marker core and
    // orbit remain depth-tested so a ridge can hide the node itself.
    const halo = sprite(5, true), orbit = new THREE.Mesh(ring, material)
    const normal = new THREE.Vector3(terrainHeight(point.x - .2, point.z) - terrainHeight(point.x + .2, point.z), .4, terrainHeight(point.x, point.z - .2) - terrainHeight(point.x, point.z + .2)).normalize()
    orbit.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
    const marker = new THREE.Mesh(sphere, material)
    group.add(marker, orbit, halo)
    scene.add(group)
    return { group, material, halo }
  })
  const traveller = new THREE.Group()
  // Keep the moving point's halo readable while its spherical core remains
  // depth-tested against the terrain.
  const travellerHalo = sprite(travellerSettings.haloSize, true)
  travellerHalo.material.opacity = travellerSettings.haloOpacity
  const groundLight = new THREE.PointLight(travellerSettings.lightColor, travellerSettings.lightIntensity, travellerSettings.lightDistance, travellerSettings.lightDecay)
  traveller.add(travellerHalo, new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff8de', fog: false })), groundLight)
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
    const row = Math.min(heightSegments - .00001, Math.max(0, (z - terrainCenterZ + terrainDepth / 2) / cellDepth))
    const index = Math.floor(row) * stride + Math.floor(column)
    const u = column % 1, v = row % 1
    const a = positions.getY(index), b = positions.getY(index + stride)
    const c = positions.getY(index + stride + 1), d = positions.getY(index + 1)
    const ground = u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v)
    return ground + haloClearance
  }
  const placements = createVegetationLayout()
  const treeCanvas = document.createElement('canvas')
  treeCanvas.width = 256
  treeCanvas.height = 384
  const treeContext = treeCanvas.getContext('2d')!
  treeContext.clearRect(0, 0, treeCanvas.width, treeCanvas.height)
  treeContext.lineCap = 'round'
  treeContext.strokeStyle = 'rgba(79,58,42,.96)'
  treeContext.lineWidth = 15
  treeContext.beginPath(); treeContext.moveTo(128, 378); treeContext.quadraticCurveTo(120, 250, 132, 126); treeContext.stroke()
  const branches = [[130,230,70,142],[128,214,188,126],[130,178,88,96],[132,166,174,78],[128,138,116,54]]
  branches.forEach(([x1,y1,x2,y2], index) => {
    treeContext.strokeStyle = `rgba(85,62,43,${.86 - index * .07})`
    treeContext.lineWidth = 8 - index * .7
    treeContext.beginPath(); treeContext.moveTo(x1,y1); treeContext.quadraticCurveTo((x1+x2)/2, y1-20, x2,y2); treeContext.stroke()
  })
  let leafSeed = 9217
  const leafRandom = () => { leafSeed = (Math.imul(leafSeed, 1664525) + 1013904223) >>> 0; return leafSeed / 4294967296 }
  const leafColors = ['rgba(47,89,64,.92)','rgba(64,108,75,.9)','rgba(83,127,85,.88)','rgba(105,144,93,.82)']
  for (let i = 0; i < 215; i++) {
    const angle = leafRandom() * Math.PI * 2
    const radius = Math.sqrt(leafRandom())
    const x = 128 + Math.cos(angle) * radius * (94 - Math.max(0, 115 - (120 + Math.sin(angle) * 34)) * .15)
    const y = 122 + Math.sin(angle) * radius * 98
    const size = 4 + leafRandom() * 8
    treeContext.save()
    treeContext.translate(x, y)
    treeContext.rotate(angle + leafRandom())
    treeContext.fillStyle = leafColors[Math.floor(leafRandom() * leafColors.length)]
    treeContext.beginPath(); treeContext.ellipse(0, 0, size, size * .46, 0, 0, Math.PI * 2); treeContext.fill()
    treeContext.restore()
  }
  const treeTexture = new THREE.CanvasTexture(treeCanvas)
  treeTexture.colorSpace = THREE.SRGBColorSpace
  treeTexture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const billboardMaterial = new THREE.MeshStandardMaterial({ map: treeTexture, transparent: true, alphaTest: .12, side: THREE.DoubleSide, roughness: .92 })
  const billboardGeometry = new THREE.PlaneGeometry(5.8, 8.7)
  const treeBillboardsA = new THREE.InstancedMesh(billboardGeometry, billboardMaterial, placements.length)
  const treeBillboardsB = new THREE.InstancedMesh(billboardGeometry, billboardMaterial, placements.length)
  treeBillboardsA.castShadow = treeBillboardsB.castShadow = true
  const crownLobes = [
    { x: 0, y: 0, z: 0, size: 1.18 },
    { x: -.76, y: -.12, z: .14, size: .8 },
    { x: .72, y: -.05, z: .2, size: .86 },
    { x: .08, y: .5, z: -.25, size: .76 },
    { x: -.3, y: .25, z: -.68, size: .68 },
    { x: .42, y: .18, z: .64, size: .64 },
  ]
  const crownMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#19392b',
    emissiveIntensity: .16,
    roughness: .9,
    metalness: 0,
    flatShading: false,
    vertexColors: true,
  })
  const trees = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), crownMaterial, placements.length * crownLobes.length)
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(.14, .3, 2.8, 9),
    new THREE.MeshStandardMaterial({ color: '#725844', roughness: 1 }),
    placements.length,
  )
  trees.castShadow = true
  trees.receiveShadow = true
  trunks.castShadow = true
  const dummy = new THREE.Object3D()
  const groundRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
  terrainMesh.updateMatrixWorld()
  const crownColors = ['#426f5a', '#527e64', '#658e6b', '#789b73']
  placements.forEach(({ x, z, scale, rotation }, i) => {
    // Sample the rendered triangles once: the analytic surface differs slightly.
    groundRay.ray.origin.set(x, 200, z)
    const y = groundRay.intersectObject(terrainMesh, false)[0]?.point.y ?? terrainHeight(x, z)
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    crownLobes.forEach((lobe, lobeIndex) => {
      const lobeScale = scale * lobe.size
      dummy.rotation.set(rotation * .18, rotation + lobeIndex * .37, rotation * .08)
      dummy.position.set(
        x + (lobe.x * cos - lobe.z * sin) * scale,
        y + (3.2 + lobe.y) * scale,
        z + (lobe.x * sin + lobe.z * cos) * scale,
      )
      dummy.scale.set(lobeScale * 1.3, lobeScale * .82, lobeScale * 1.08)
      dummy.updateMatrix()
      const instance = i * crownLobes.length + lobeIndex
      trees.setMatrixAt(instance, dummy.matrix)
      trees.setColorAt(instance, new THREE.Color(crownColors[(i + lobeIndex) % crownColors.length]))
    })
    dummy.rotation.set(0, rotation, 0)
    dummy.position.set(x, y + 1.4 * scale, z)
    dummy.scale.set(scale, scale, scale)
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix)
    dummy.position.set(x, y + 4.25 * scale, z)
    dummy.rotation.set(0, rotation, 0)
    dummy.scale.set(scale, scale, scale)
    dummy.updateMatrix(); treeBillboardsA.setMatrixAt(i, dummy.matrix)
    dummy.rotation.y = rotation + Math.PI / 2
    dummy.updateMatrix(); treeBillboardsB.setMatrixAt(i, dummy.matrix)
  })
  trees.instanceMatrix.needsUpdate = true
  trunks.instanceMatrix.needsUpdate = true
  if (trees.instanceColor) trees.instanceColor.needsUpdate = true
  treeBillboardsA.instanceMatrix.needsUpdate = true
  treeBillboardsB.instanceMatrix.needsUpdate = true
  // Crossed alpha-cutout foliage planes provide detailed crowns at journey scale;
  // retain the procedural crown instances only as layout data, not visible meshes.
  scene.add(trunks, treeBillboardsA, treeBillboardsB)
  const shrubPlacements = createShrubLayout(placements)
  const shrubs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(.72, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#5f9972', roughness: 1, flatShading: true }),
    shrubPlacements.length * 3,
  )
  shrubs.castShadow = true
  shrubPlacements.forEach(({ x, z, scale, rotation }, shrubIndex) => {
    groundRay.ray.origin.set(x, 200, z)
    const y = groundRay.intersectObject(terrainMesh, false)[0]?.point.y ?? terrainHeight(x, z)
    const lobes = [
      { x: 0, z: 0, size: 1 },
      { x: -.58, z: .16, size: .82 },
      { x: .55, z: .22, size: .76 },
    ]
    lobes.forEach((lobe, lobeIndex) => {
      const cos = Math.cos(rotation)
      const sin = Math.sin(rotation)
      dummy.position.set(
        x + (lobe.x * cos - lobe.z * sin) * scale,
        y + .48 * scale * lobe.size,
        z + (lobe.x * sin + lobe.z * cos) * scale,
      )
      dummy.rotation.set(0, rotation, 0)
      dummy.scale.set(scale * lobe.size, scale * lobe.size * .72, scale * lobe.size)
      dummy.updateMatrix()
      shrubs.setMatrixAt(shrubIndex * 3 + lobeIndex, dummy.matrix)
    })
  })
  scene.add(shrubs)
  const labels = Array.from(host.querySelectorAll<HTMLElement>('[data-station]'))
  const projected = new THREE.Vector3(), target = new THREE.Vector3(), labelOffset = new THREE.Vector3(0, 2.4, 0)
  const clearFog = new THREE.Color('#9eb7ad'), stormFog = new THREE.Color('#52696b'), sunnyFog = new THREE.Color('#d4dfd3')
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
      fog.density = .002 + weather.mist * .0023 + weather.storm * .00065
      sunlight.intensity = 2.15 - weather.storm * 1.25 + weather.sun * .45
      sunlight.color.set('#ffe8bd').lerp(new THREE.Color('#b9ced0'), weather.storm)
      ambient.intensity = 1.5 - weather.storm * .42 + weather.sun * .14
      terrainSurface.setRain(weather.rain)
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
      node.material.color.set(current ? '#fff3cf' : '#a7cabe')
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
    trees.dispose(); trunks.dispose(); shrubs.dispose(); treeBillboardsA.dispose(); treeBillboardsB.dispose(); treeTexture.dispose(); terrainSurface.dispose(); glowTexture.dispose(); weatherLayer.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
  }
}
