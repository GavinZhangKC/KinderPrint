import * as THREE from 'three'

/** Reference dimensions are scaled together for the current 57-unit camera setback. */
export const rainSettings = {
  seed: 91357,
  desktopCount: 1050,
  mobileCount: 420,
  sceneScale: 1.2,
  volume: { width: 150, height: 70, depth: 150 },
  endpointOffset: { x: .22, y: 1.3 },
  speed: 24,
  bottomOffset: -5,
  fade: { nearStart: 5, nearEnd: 15, farStart: 70, farEnd: 120 },
  color: [.69, .81, .95] as const,
  opacity: .34,
}

export function createJourneyRain() {
  const config = rainSettings, scale = config.sceneScale
  let seed = config.seed >>> 0
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const size = new THREE.Vector3(config.volume.width, config.volume.height, config.volume.depth).multiplyScalar(scale)
  const positions = new Float32Array(config.desktopCount * 6)
  const ends = new Float32Array(config.desktopCount * 2)
  for (let i = 0; i < config.desktopCount; i++) {
    const x = random() * size.x, y = random() * size.y, z = random() * size.z
    // Both endpoints share a phase, so a line never stretches across the wrap boundary.
    positions.set([x, y, z, x, y, z], i * 6)
    ends[i * 2 + 1] = 1
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1))
  const material = new THREE.ShaderMaterial({
    vertexShader: `
      attribute float aEnd;
      uniform float uTime, uSpeed, uBottom;
      uniform vec3 uSize;
      uniform vec2 uOffset;
      varying float vDistance;
      void main() {
        // A world-aligned wrapping volume: translation/turning does not rotate or
        // drag living rain with the screen. Only out-of-volume positions wrap.
        vec3 origin = cameraPosition - uSize * .5;
        origin.y += uBottom;
        vec3 p = position;
        p.y -= uTime * uSpeed;
        p = mod(p - origin, uSize) + origin;
        p.xy += aEnd * uOffset;
        vec4 view = viewMatrix * vec4(p, 1.);
        vDistance = -view.z;
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform float uRain, uOpacity;
      uniform vec3 uColor;
      uniform vec4 uFade;
      varying float vDistance;
      void main() {
        float distanceFade = smoothstep(uFade.x, uFade.y, vDistance)
          * (1. - smoothstep(uFade.z, uFade.w, vDistance));
        gl_FragColor = vec4(uColor, distanceFade * uRain * uOpacity);
      }`,
    uniforms: {
      uTime: { value: 0 }, uRain: { value: 0 },
      uSpeed: { value: config.speed * scale }, uBottom: { value: config.bottomOffset * scale },
      uSize: { value: size },
      uOffset: { value: new THREE.Vector2(config.endpointOffset.x, config.endpointOffset.y).multiplyScalar(scale) },
      uFade: { value: new THREE.Vector4(config.fade.nearStart, config.fade.nearEnd, config.fade.farStart, config.fade.farEnd).multiplyScalar(scale) },
      uColor: { value: new THREE.Vector3(...config.color) }, uOpacity: { value: config.opacity },
    },
    transparent: true, depthWrite: false, depthTest: true,
  })
  const scene = new THREE.Scene(), rain = new THREE.LineSegments(geometry, material)
  rain.frustumCulled = false
  scene.add(rain)
  let startTime: number | undefined
  return {
    resize(width: number) {
      geometry.setDrawRange(0, (width <= 760 ? config.mobileCount : config.desktopCount) * 2)
    },
    render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, intensity: number, time: number) {
      startTime ??= time
      material.uniforms.uTime.value = (time - startTime) / 1000
      material.uniforms.uRain.value = intensity
      // Reuse the terrain's perspective camera and depth buffer, behind HTML UI.
      if (intensity > .005) renderer.render(scene, camera)
    },
    dispose() { geometry.dispose(); material.dispose() },
  }
}
