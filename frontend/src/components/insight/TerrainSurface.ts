import * as THREE from 'three'
import { clamp, smoothstep } from './journey'
import { terrainHeight } from './landscape'

const grass = new THREE.Color('#789487')
const dampGrass = new THREE.Color('#567675')
const earth = new THREE.Color('#81796d')
const rock = new THREE.Color('#7a8790')
const highRock = new THREE.Color('#9aa8ae')

const surfaceNoise = (x: number, z: number) => (
  Math.sin(x * .043 + z * .019) * .5
  + Math.sin(x * -.017 + z * .057 + 1.8) * .3
  + Math.sin(x * .11 + z * -.083 + 4.2) * .2
)

function textureNoise(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const fadeX = fx * fx * (3 - 2 * fx), fadeY = fy * fy * (3 - 2 * fy)
  const hash = (px: number, py: number) => {
    const value = Math.sin(px * 127.1 + py * 311.7) * 43758.5453123
    return value - Math.floor(value)
  }
  const a = hash(ix, iy), b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1)
  return (a + (b - a) * fadeX) + ((c + (d - c) * fadeX) - (a + (b - a) * fadeX)) * fadeY
}

function detailHeight(x: number, y: number) {
  let value = 0, amplitude = .55, frequency = .055
  for (let octave = 0; octave < 4; octave++) {
    value += textureNoise(x * frequency, y * frequency) * amplitude
    frequency *= 2.07
    amplitude *= .48
  }
  return value
}

/** A single non-repeating procedural surface spanning the whole terrain. */
function createDetailMaps() {
  const width = 256, height = 320
  const heights = new Float32Array(width * height)
  const normalPixels = new Uint8Array(width * height * 4)
  const roughnessPixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) heights[y * width + x] = detailHeight(x, y)
  }
  const sample = (x: number, y: number) => heights[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4
      const dx = sample(x + 1, y) - sample(x - 1, y)
      const dy = sample(x, y + 1) - sample(x, y - 1)
      const length = Math.hypot(dx * 1.8, dy * 1.8, 1)
      normalPixels[offset] = Math.round((-dx * 1.8 / length * .5 + .5) * 255)
      normalPixels[offset + 1] = Math.round((-dy * 1.8 / length * .5 + .5) * 255)
      normalPixels[offset + 2] = Math.round((1 / length * .5 + .5) * 255)
      normalPixels[offset + 3] = 255
      const grain = textureNoise(x * .17 + 19, y * .17 + 31)
      const roughness = Math.round((.78 + grain * .2) * 255)
      roughnessPixels.set([roughness, roughness, roughness, 255], offset)
    }
  }
  const makeTexture = (pixels: Uint8Array) => {
    const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
    texture.colorSpace = THREE.NoColorSpace
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
    texture.minFilter = THREE.LinearMipmapLinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.needsUpdate = true
    return texture
  }
  return { normalMap: makeTexture(normalPixels), roughnessMap: makeTexture(roughnessPixels) }
}

export function createTerrainSurface(terrain: THREE.PlaneGeometry) {
  const positions = terrain.attributes.position
  const colors = new Float32Array(positions.count * 3)
  const surface = new Float32Array(positions.count * 3)
  const color = new THREE.Color()
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i), y = terrainHeight(x, z)
    positions.setY(i, y)
    const dx = (terrainHeight(x + 1, z) - terrainHeight(x - 1, z)) * .5
    const dz = (terrainHeight(x, z + 1) - terrainHeight(x, z - 1)) * .5
    const slope = Math.hypot(dx, dz)
    const steep = smoothstep((slope - .16) / .72)
    const flat = 1 - smoothstep((slope - .06) / .34)
    const low = 1 - smoothstep((y - 8) / 28)
    const moisture = clamp(.13 + low * .7 + surfaceNoise(x, z) * .13 - steep * .2)
    const puddle = clamp(low * flat * (.72 + surfaceNoise(x + 41, z - 17) * .22))
    const altitude = smoothstep((y - 40) / 38)

    color.copy(grass).lerp(dampGrass, moisture * .72)
    color.lerp(earth, clamp(.12 + steep * .42 - moisture * .18))
    color.lerp(rock, steep * (.76 + altitude * .16))
    color.lerp(highRock, altitude * steep * .28)
    color.multiplyScalar(.965 + surfaceNoise(x * 1.7, z * 1.7) * .035)
    colors.set([color.r, color.g, color.b], i * 3)
    surface.set([steep, moisture, puddle], i * 3)
  }
  terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  terrain.setAttribute('terrainSurface', new THREE.BufferAttribute(surface, 3))
  terrain.computeVertexNormals()

  const { normalMap, roughnessMap } = createDetailMaps()
  const rainUniform = { value: 0 }
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: .98,
    metalness: 0,
    normalMap,
    normalScale: new THREE.Vector2(.28, .28),
    roughnessMap,
  })
  material.onBeforeCompile = shader => {
    shader.uniforms.uTerrainRain = rainUniform
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 terrainSurface;\nvarying vec3 vTerrainSurface;\nvarying vec3 vTerrainPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainSurface = terrainSurface;\nvTerrainPosition = transformed;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTerrainRain;
varying vec3 vTerrainSurface;
varying vec3 vTerrainPosition;
float terrainGrain(vec2 p) {
  return sin(p.x * .73 + p.y * .41) * .5 + sin(p.x * -.29 + p.y * .91 + 2.1) * .3;
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float terrainMicro = terrainGrain(vTerrainPosition.xz) * .025;
float terrainWet = uTerrainRain * (.16 + vTerrainSurface.y * .48);
diffuseColor.rgb *= 1.0 + terrainMicro;
diffuseColor.rgb *= mix(vec3(1.0), vec3(.70, .77, .79), terrainWet);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.78, .84, .86), uTerrainRain * vTerrainSurface.z * .22);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor *= 1.0 - uTerrainRain * (.10 + vTerrainSurface.y * .18);
roughnessFactor = mix(roughnessFactor, .38 + terrainMicro, uTerrainRain * vTerrainSurface.z * .56);
roughnessFactor = clamp(roughnessFactor, .34, 1.0);`)
  }
  material.customProgramCacheKey = () => 'kinderprint-terrain-surface-v1'

  return {
    material,
    setRain(intensity: number) { rainUniform.value = clamp(intensity) },
    dispose() { normalMap.dispose(); roughnessMap.dispose() },
  }
}
