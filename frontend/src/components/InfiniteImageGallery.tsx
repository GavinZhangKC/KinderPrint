import { useEffect, useRef, useState } from 'react'
import { Camera, Mesh, Plane, Program, Renderer, Texture, Transform } from 'ogl'

import './InfiniteImageGallery.css'

const galleryItems = [
  { src: '/Images/01_higher-risk_sick-child_5858715.jpg', alt: 'A child receiving care while unwell', width: 220, height: 292, y: -30 },
  { src: '/Images/02_higher-risk_night-phone_7414092.jpg', alt: 'A child using a phone at night', width: 330, height: 210, y: 72 },
  { src: '/Images/03_higher-risk_night-tablet_7414103.jpg', alt: 'A child using a tablet at night', width: 292, height: 184, y: -76 },
  { src: '/Images/04_higher-risk_less-supportive-street_17354198.jpg', alt: 'A child in a less supportive street environment', width: 218, height: 304, y: 22 },
  { src: '/Images/05_typical_child-tablet_4145077.jpg', alt: 'A child using a tablet at home', width: 348, height: 220, y: -58 },
  { src: '/Images/06_typical_family-tablet_4473772.jpg', alt: 'A family sharing a tablet', width: 306, height: 196, y: 70 },
  { src: '/Images/07_typical_school-lunch_5905614.jpg', alt: 'Children sharing lunch at school', width: 366, height: 226, y: -32 },
  { src: '/Images/08_typical_health-check_8460047.jpg', alt: 'A child attending a routine health check', width: 310, height: 198, y: 72 },
  { src: '/Images/09_supportive_running-green-space_7105875.jpg', alt: 'A child running through green space', width: 218, height: 304, y: -26 },
  { src: '/Images/10_supportive_playing-green-park_4453147.jpg', alt: 'Children playing together in a green park', width: 360, height: 222, y: 62 },
  { src: '/Images/11_supportive_cycling-green-park_38899615.jpg', alt: 'Children cycling through a green park', width: 336, height: 210, y: -66 },
  { src: '/Images/12_supportive_family-cycling_7982166.jpg', alt: 'A family cycling together outdoors', width: 224, height: 300, y: 28 },
] as const

const vertexShader = `
  attribute vec3 position;
  attribute vec2 uv;

  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uVelocity;
  uniform float uPhase;

  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 displaced = position;
    float wave = sin((uv.y + uPhase) * 3.14159265 + uTime * 0.7);
    displaced.x += wave * uVelocity * 0.035;
    displaced.z += sin(uv.x * 3.14159265) * abs(uVelocity) * 0.025;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`

const fragmentShader = `
  precision highp float;

  uniform sampler2D uTexture;
  uniform vec2 uImageSize;
  uniform vec2 uPlaneSize;

  varying vec2 vUv;

  vec2 coverUv(vec2 uv, vec2 planeSize, vec2 imageSize) {
    float planeRatio = planeSize.x / planeSize.y;
    float imageRatio = imageSize.x / imageSize.y;
    vec2 scale = vec2(1.0);

    if (planeRatio > imageRatio) {
      scale.y = imageRatio / planeRatio;
    } else {
      scale.x = planeRatio / imageRatio;
    }

    return (uv - 0.5) * scale + 0.5;
  }

  void main() {
    vec2 uv = coverUv(vUv, uPlaneSize, uImageSize);
    vec4 colour = texture2D(uTexture, uv);
    vec3 paleBlue = vec3(0.89, 0.95, 1.0);

    colour.rgb = mix(colour.rgb, paleBlue, 0.07);
    gl_FragColor = colour;
  }
`

interface GalleryMedia {
  index: number
  mesh: Mesh
  program: Program
}

interface GalleryLayout {
  baseCenter: number
  width: number
  height: number
  y: number
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

export default function InfiniteImageGallery() {
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  ))

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = () => setReducedMotion(motionPreference.matches)
    motionPreference.addEventListener('change', handleChange)
    return () => motionPreference.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host || reducedMotion) return

    let disposed = false
    let initialised = false
    let isNearViewport = false
    let animationFrame = 0
    let lastFrameTime = 0
    let scrollOffset = 0
    let smoothSpeed = 0
    let totalTrackWidth = 1
    let layoutScale = 1
    let galleryWidth = 1
    let galleryHeight = 1
    let itemLayouts: GalleryLayout[] = []
    let geometry: Plane | null = null
    let renderer: Renderer | null = null
    let camera: Camera | null = null
    let scene: Transform | null = null
    const media: GalleryMedia[] = []
    const programs: Program[] = []

    const activeItems = window.innerWidth <= 680
      ? galleryItems.filter((_, index) => index % 2 === 0)
      : galleryItems

    const resize = () => {
      if (!renderer || !camera) return
      const bounds = host.getBoundingClientRect()
      galleryWidth = Math.max(1, bounds.width)
      galleryHeight = Math.max(1, bounds.height)
      layoutScale = galleryWidth <= 680 ? 0.72 : galleryWidth <= 960 ? 0.86 : 1

      renderer.setSize(galleryWidth, galleryHeight)
      camera.perspective({ aspect: galleryWidth / galleryHeight })

      const worldHeight = 2 * Math.tan(45 * Math.PI / 360) * 20
      const worldPerPixel = worldHeight / galleryHeight
      const gap = (galleryWidth <= 680 ? 42 : 72) * layoutScale
      let cursor = 0

      itemLayouts = activeItems.map((item) => {
        const width = item.width * layoutScale
        const height = item.height * layoutScale
        const layout = {
          baseCenter: cursor + width / 2,
          width,
          height,
          y: item.y * layoutScale,
        }
        cursor += width + gap
        return layout
      })

      media.forEach((item) => {
        const layout = itemLayouts[item.index]
        item.mesh.scale.set(layout.width * worldPerPixel, layout.height * worldPerPixel, 1)
        item.mesh.position.y = -layout.y * worldPerPixel
        item.program.uniforms.uPlaneSize.value = [layout.width, layout.height]
      })

      totalTrackWidth = Math.max(cursor, galleryWidth + 1)
    }

    const render = (time: number) => {
      animationFrame = 0
      if (!renderer || !camera || !scene || !isNearViewport || disposed) return

      const delta = lastFrameTime === 0 ? 16 : Math.min(40, time - lastFrameTime)
      lastFrameTime = time
      const targetSpeed = 0.038
      smoothSpeed += (targetSpeed - smoothSpeed) * Math.min(1, delta * 0.0045)
      scrollOffset -= smoothSpeed * delta

      const worldHeight = 2 * Math.tan(45 * Math.PI / 360) * 20
      const worldPerPixel = worldHeight / galleryHeight
      const velocity = Math.min(1, smoothSpeed / targetSpeed)

      media.forEach((item, index) => {
        const layout = itemLayouts[item.index]
        const wrapped = positiveModulo(
          layout.baseCenter + scrollOffset + totalTrackWidth / 2,
          totalTrackWidth,
        ) - totalTrackWidth / 2
        item.mesh.position.x = wrapped * worldPerPixel
        item.program.uniforms.uTime.value = time * 0.001
        item.program.uniforms.uVelocity.value = velocity
        item.program.uniforms.uPhase.value = index * 0.37
      })

      renderer.render({ scene, camera })
      animationFrame = window.requestAnimationFrame(render)
    }

    const start = () => {
      if (animationFrame || disposed) return
      lastFrameTime = 0
      animationFrame = window.requestAnimationFrame(render)
    }

    const stop = () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      smoothSpeed = 0
    }

    const initialise = () => {
      if (initialised || disposed) return
      initialised = true

      renderer = new Renderer({
        alpha: true,
        antialias: true,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
        powerPreference: 'low-power',
      })
      const gl = renderer.gl
      gl.clearColor(0, 0, 0, 0)
      renderer.gl.canvas.className = 'infinite-image-gallery__canvas'
      host.appendChild(renderer.gl.canvas)

      camera = new Camera(gl, { fov: 45 })
      camera.position.z = 20
      scene = new Transform()
      geometry = new Plane(gl, { widthSegments: 12, heightSegments: 6 })

      activeItems.forEach((item, index) => {
        const image = new Image()
        image.decoding = 'async'
        image.onload = () => {
          if (disposed || !renderer || !scene || !geometry) return

          const texture = new Texture(renderer.gl, {
            image,
            generateMipmaps: false,
          })
          const program = new Program(renderer.gl, {
            vertex: vertexShader,
            fragment: fragmentShader,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            cullFace: false,
            uniforms: {
              uTexture: { value: texture },
              uImageSize: { value: [image.naturalWidth, image.naturalHeight] },
              uPlaneSize: { value: [item.width, item.height] },
              uTime: { value: 0 },
              uVelocity: { value: 0 },
              uPhase: { value: index * 0.37 },
            },
          })
          const mesh = new Mesh(renderer.gl, { geometry, program })
          mesh.setParent(scene)
          programs.push(program)
          media.push({
            index,
            mesh,
            program,
          })
          resize()
        }
        image.src = item.src
      })

      resize()
    }

    const visibilityObserver = new IntersectionObserver(([entry]) => {
      isNearViewport = entry.isIntersecting
      if (isNearViewport) {
        initialise()
        start()
      } else {
        stop()
      }
    }, { rootMargin: '320px 0px' })

    const resizeObserver = new ResizeObserver(resize)
    visibilityObserver.observe(host)
    resizeObserver.observe(host)

    return () => {
      disposed = true
      stop()
      visibilityObserver.disconnect()
      resizeObserver.disconnect()
      geometry?.remove()
      programs.forEach((program) => program.remove())

      if (renderer) {
        renderer.gl.getExtension('WEBGL_lose_context')?.loseContext()
        renderer.gl.canvas.remove()
      }
    }
  }, [reducedMotion])

  return (
    <section className="infinite-image-gallery" aria-label="Child health and neighbourhood environments">
      {reducedMotion ? (
        <div className="infinite-image-gallery__static">
          {galleryItems.map((item) => (
            <img key={item.src} src={item.src} alt={item.alt} loading="lazy" />
          ))}
        </div>
      ) : (
        <div ref={canvasHostRef} className="infinite-image-gallery__stage" aria-hidden="true" />
      )}
    </section>
  )
}
