import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'

import './LiquidChrome.css'

type Color = readonly [number, number, number]

interface LiquidChromeProps {
  className?: string
  baseColor?: Color
  speed?: number
  amplitude?: number
  frequencyX?: number
  frequencyY?: number
  interactive?: boolean
}

const vertexShader = `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

const fragmentShader = `
  precision highp float;
  uniform float uTime;
  uniform vec3 uResolution;
  uniform vec3 uBaseColor;
  uniform float uAmplitude;
  uniform float uFrequencyX;
  uniform float uFrequencyY;
  uniform vec2 uMouse;
  varying vec2 vUv;

  vec4 renderImage(vec2 uvCoord) {
    vec2 fragCoord = uvCoord * uResolution.xy;
    vec2 uv = (2.0 * fragCoord - uResolution.xy) / min(uResolution.x, uResolution.y);
    vec2 pointerOffset = (uMouse - 0.5) * 0.55;

    for (float i = 1.0; i < 10.0; i++) {
      uv.x += uAmplitude / i * cos(i * uFrequencyX * uv.y + uTime + pointerOffset.x);
      uv.y += uAmplitude / i * cos(i * uFrequencyY * uv.x + uTime + pointerOffset.y);
    }

    vec2 diff = uvCoord - uMouse;
    float dist = length(diff);
    float falloff = exp(-dist * 24.0);
    float ripple = sin(10.0 * dist - uTime * 2.0) * 0.012;
    uv += (diff / (dist + 0.0001)) * ripple * falloff;

    float reflection = max(abs(sin(uTime - uv.y - uv.x)), 0.13);
    vec3 color = min(uBaseColor / reflection, vec3(1.0));
    return vec4(color, 1.0);
  }

  void main() {
    vec4 color = vec4(0.0);
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        vec2 offset = vec2(float(x), float(y)) / min(uResolution.x, uResolution.y);
        color += renderImage(vUv + offset);
      }
    }
    gl_FragColor = color / 9.0;
  }
`

function brandBaseColor(): Color {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()
  const match = /^#([0-9a-f]{6})$/i.exec(value)
  if (!match) return [0.035, 0.075, 0.15]

  const numeric = Number.parseInt(match[1], 16)
  return [
    ((numeric >> 16) & 255) / 255 * 0.24,
    ((numeric >> 8) & 255) / 255 * 0.24,
    (numeric & 255) / 255 * 0.24,
  ]
}

export default function LiquidChrome({
  className = '',
  baseColor,
  speed = 0.15,
  amplitude = 0.3,
  frequencyX = 2.5,
  frequencyY = 1.5,
  interactive = true,
}: LiquidChromeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const red = baseColor?.[0]
  const green = baseColor?.[1]
  const blue = baseColor?.[2]

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resolvedColor = red === undefined || green === undefined || blue === undefined
      ? brandBaseColor()
      : [red, green, blue] as const
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionPreference.matches
    let withinHeroRange = true
    let pageVisible = !document.hidden
    let animationFrame = 0
    let renderer: Renderer | null = null

    try {
      renderer = new Renderer({
        antialias: true,
        alpha: false,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
        powerPreference: 'low-power',
      })
      const gl = renderer.gl
      gl.clearColor(resolvedColor[0], resolvedColor[1], resolvedColor[2], 1)

      const geometry = new Triangle(gl)
      const mouse = new Float32Array([0.5, 0.5])
      const targetMouse = new Float32Array([0.5, 0.5])
      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uResolution: { value: new Float32Array([1, 1, 1]) },
          uBaseColor: { value: new Float32Array(resolvedColor) },
          uAmplitude: { value: amplitude },
          uFrequencyX: { value: frequencyX },
          uFrequencyY: { value: frequencyY },
          uMouse: { value: mouse },
        },
      })
      const mesh = new Mesh(gl, { geometry, program })
      gl.canvas.className = 'liquid-chrome-canvas'
      container.appendChild(gl.canvas)

      const resize = () => {
        const width = Math.max(1, container.clientWidth)
        const height = Math.max(1, container.clientHeight)
        renderer?.setSize(width, height)
        const resolution = program.uniforms.uResolution.value as Float32Array
        resolution[0] = gl.canvas.width
        resolution[1] = gl.canvas.height
        resolution[2] = gl.canvas.width / gl.canvas.height
      }

      const canAnimate = () => !reducedMotion && withinHeroRange && pageVisible

      const render = (time: number) => {
        animationFrame = 0
        mouse[0] += (targetMouse[0] - mouse[0]) * 0.035
        mouse[1] += (targetMouse[1] - mouse[1]) * 0.035
        program.uniforms.uTime.value = time * 0.001 * speed
        renderer?.render({ scene: mesh })
        if (canAnimate()) animationFrame = requestAnimationFrame(render)
      }

      const start = () => {
        if (canAnimate() && animationFrame === 0) animationFrame = requestAnimationFrame(render)
      }

      const stop = () => {
        if (animationFrame !== 0) cancelAnimationFrame(animationFrame)
        animationFrame = 0
      }

      const updateScrollRange = () => {
        const heroStart = container.offsetTop
        withinHeroRange = window.scrollY < heroStart + container.offsetHeight
        if (withinHeroRange) start()
        else stop()
      }

      const handlePointerMove = (event: PointerEvent) => {
        if (!interactive || !withinHeroRange) return
        const rect = container.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right
          || event.clientY < rect.top || event.clientY > rect.bottom) return
        targetMouse[0] = (event.clientX - rect.left) / rect.width
        targetMouse[1] = 1 - (event.clientY - rect.top) / rect.height
      }

      const handleVisibilityChange = () => {
        pageVisible = !document.hidden
        if (pageVisible) start()
        else stop()
      }

      const handleMotionPreference = (event: MediaQueryListEvent) => {
        reducedMotion = event.matches
        if (reducedMotion) {
          stop()
          renderer?.render({ scene: mesh })
        } else {
          start()
        }
      }

      const resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
      resize()
      renderer.render({ scene: mesh })

      window.addEventListener('scroll', updateScrollRange, { passive: true })
      if (interactive) window.addEventListener('pointermove', handlePointerMove, { passive: true })
      document.addEventListener('visibilitychange', handleVisibilityChange)
      motionPreference.addEventListener('change', handleMotionPreference)
      updateScrollRange()

      return () => {
        stop()
        resizeObserver.disconnect()
        window.removeEventListener('scroll', updateScrollRange)
        if (interactive) window.removeEventListener('pointermove', handlePointerMove)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        motionPreference.removeEventListener('change', handleMotionPreference)
        program.remove()
        geometry.remove()
        gl.canvas.remove()
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      }
    } catch (error) {
      console.warn('LiquidChrome is unavailable; using the fallback background.', error)
      renderer?.gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [amplitude, blue, frequencyX, frequencyY, green, interactive, red, speed])

  return (
    <div
      ref={containerRef}
      className={`liquid-chrome ${className}`.trim()}
      aria-hidden="true"
    />
  )
}
