import { useEffect, useRef } from 'react'
import $ from 'jquery'
import 'jquery.ripples'

import './WaterRippleBackground.css'

const MIN_DISTANCE = 15
const MIN_INTERVAL = 50
const DROP_RADIUS = 21
const DROP_STRENGTH = 0.025
const TRAIL_VERTEX_SHADER = `
  precision highp float;
  attribute vec2 vertex;
  uniform vec2 containerRatio;
  varying vec2 ripplesCoord;

  void main() {
    ripplesCoord = vec2(vertex.x, -vertex.y) * containerRatio * 0.5 + 0.5;
    gl_Position = vec4(vertex.x, -vertex.y, 0.0, 1.0);
  }
`
const TRAIL_FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D samplerRipples;
  uniform vec2 delta;
  varying vec2 ripplesCoord;

  void main() {
    float height = texture2D(samplerRipples, ripplesCoord).r;
    float heightX = texture2D(samplerRipples, vec2(ripplesCoord.x + delta.x, ripplesCoord.y)).r;
    float heightY = texture2D(samplerRipples, vec2(ripplesCoord.x, ripplesCoord.y + delta.y)).r;
    vec3 dx = vec3(delta.x, heightX - height, 0.0);
    vec3 dy = vec3(0.0, heightY - height, delta.y);
    vec2 offset = -normalize(cross(dy, dx)).xz;
    float specular = pow(max(0.0, dot(offset, normalize(vec2(-0.6, 1.0)))), 4.0);
    float trailAlpha = specular * 0.36;

    gl_FragColor = vec4(vec3(0.0), trailAlpha);
  }
`
const EXCLUDED_ELEMENTS = [
  '[data-no-ripple]',
  'button',
  'a',
  'input',
  'textarea',
  'select',
  'video',
  'img',
  'header',
  'nav',
  'canvas',
  '[role="button"]',
  '.mapboxgl-map',
  '.mapboxgl-canvas-container',
].join(',')

type RippleProgram = {
  id: WebGLProgram
  uniforms: Record<string, Float32Array>
  locations: Record<string, WebGLUniformLocation | null>
}

type RippleInstance = {
  context: WebGLRenderingContext
  renderProgram: RippleProgram
  textureDelta: Float32Array
}

function colourMouseTrail(instance: RippleInstance) {
  const gl = instance.context
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('Unable to create mouse ripple shader.')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) ?? 'Unable to compile mouse ripple shader.'
      gl.deleteShader(shader)
      throw new Error(message)
    }
    return shader
  }

  const vertexShader = compile(gl.VERTEX_SHADER, TRAIL_VERTEX_SHADER)
  const fragmentShader = compile(gl.FRAGMENT_SHADER, TRAIL_FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    throw new Error('Unable to create mouse ripple program.')
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.bindAttribLocation(program, 0, 'vertex')
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'Unable to link mouse ripple program.'
    gl.deleteProgram(program)
    throw new Error(message)
  }

  const previousProgram = instance.renderProgram.id
  instance.renderProgram = {
    id: program,
    uniforms: {},
    locations: {
      perturbance: null,
      topLeft: null,
      bottomRight: null,
      containerRatio: gl.getUniformLocation(program, 'containerRatio'),
      samplerBackground: null,
      samplerRipples: gl.getUniformLocation(program, 'samplerRipples'),
      delta: gl.getUniformLocation(program, 'delta'),
    },
  }
  gl.useProgram(program)
  gl.uniform2fv(instance.renderProgram.locations.delta, instance.textureDelta)
  gl.clearColor(0, 0, 0, 0)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.deleteProgram(previousProgram)
}

export default function WaterRippleBackground() {
  const backgroundRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const background = backgroundRef.current
    if (
      !background ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(pointer: coarse)').matches
    ) {
      return
    }

    const $background = $(background)
    const homepage = background.parentElement?.querySelector('.home-page')
    const firstWhiteSection = homepage?.querySelector('.home-insight')
    let initialized = false
    let lastDropAt = 0
    let lastX: number | null = null
    let lastY: number | null = null

    try {
      $background.ripples({
        imageUrl: '/water-ripple-background.svg',
        resolution: 512,
        dropRadius: 20,
        perturbance: 0.03,
        interactive: false,
      })
      initialized = true

      if (homepage) {
        const instance = $background.data('ripples') as RippleInstance | undefined
        if (!instance) throw new Error('Unable to access the mouse ripple renderer.')
        colourMouseTrail(instance)
      }
    } catch (error) {
      if (initialized) {
        $background.ripples('destroy')
        initialized = false
      }
      console.warn('Water ripple background is unavailable; using the static background.', error)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!initialized || event.pointerType !== 'mouse') return

      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest('[data-ripple-surface]') || target.closest(EXCLUDED_ELEMENTS)) return
      if (homepage && target.closest('.home-hero')) return

      const now = performance.now()
      const distance = lastX === null || lastY === null
        ? Infinity
        : Math.hypot(event.clientX - lastX, event.clientY - lastY)

      if (now - lastDropAt < MIN_INTERVAL || distance < MIN_DISTANCE) return

      const rect = background.getBoundingClientRect()
      $background.ripples(
        'drop',
        event.clientX - rect.left,
        event.clientY - rect.top,
        DROP_RADIUS,
        DROP_STRENGTH,
      )

      lastDropAt = now
      lastX = event.clientX
      lastY = event.clientY
    }

    const handleResize = () => {
      if (initialized) $background.ripples('updateSize')
      updateHomepageClip()
    }

    const updateHomepageClip = () => {
      if (!firstWhiteSection) return
      const sectionTop = firstWhiteSection.getBoundingClientRect().top
      const visibleTop = Math.min(window.innerHeight, Math.max(0, sectionTop))
      background.style.setProperty('--mouse-ripple-top', `${visibleTop}px`)
    }

    const handleVisibilityChange = () => {
      if (!initialized) return
      $background.ripples(document.hidden ? 'pause' : 'play')
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('scroll', updateHomepageClip, { passive: true })
    window.addEventListener('resize', handleResize)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    updateHomepageClip()

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('scroll', updateHomepageClip)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (initialized) $background.ripples('destroy')
    }
  }, [])

  return <div ref={backgroundRef} className="water-ripple-background" aria-hidden="true" />
}
