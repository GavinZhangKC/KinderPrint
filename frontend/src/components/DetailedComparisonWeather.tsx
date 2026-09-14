import { useEffect, useRef, type RefObject } from 'react'
import type RaindropFX from 'raindrop-fx'
import './DetailedComparisonWeather.css'

export type DevelopmentWeatherState = 'good' | 'medium' | 'poor'

export const WEATHER_BACKGROUNDS = {
  good: 'https://images.unsplash.com/photo-1499346030926-9a72daac6c63?auto=format&fit=crop&w=2400&q=90',
  medium: 'https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=2200&q=88',
  poor: '/weather-poor.jpg',
} as const

export function getDevelopmentWeatherState(priorityValue: string | null | undefined): DevelopmentWeatherState {
  const priority = String(priorityValue ?? '').trim().toLowerCase()

  if (['low', 'lower'].includes(priority)) return 'good'
  if (['moderate', 'medium'].includes(priority)) return 'medium'
  if (['high', 'higher'].includes(priority)) return 'poor'

  return 'medium'
}

async function preloadImage(source: string) {
  const image = new Image()
  image.decoding = 'async'
  image.src = source

  if (!image.complete) {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Could not load the local rain background image.'))
    })
  }

  await image.decode()
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function useGlassRaindrops(canvasRef: RefObject<HTMLCanvasElement | null>, isPoorWeather: boolean) {
  useEffect(() => {
    const canvas = canvasRef.current
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!canvas || !isPoorWeather || reducedMotion) return
    if (typeof WebGL2RenderingContext === 'undefined') return

    let cancelled = false
    let started = false
    let raindropFx: RaindropFX | null = null

    const resize = () => {
      if (!raindropFx || !started) return
      const rect = canvas.getBoundingClientRect()
      raindropFx.resize(
        Math.max(1, Math.round(rect.width)),
        Math.max(1, Math.round(rect.height)),
      )
    }

    const start = async () => {
      try {
        await preloadImage(WEATHER_BACKGROUNDS.poor)
        if (cancelled) return

        await nextAnimationFrame()
        if (cancelled) return

        const rect = canvas.getBoundingClientRect()
        const width = Math.round(rect.width)
        const height = Math.round(rect.height)
        if (width <= 0 || height <= 0) {
          throw new Error('The glass raindrop canvas has no renderable size.')
        }
        canvas.width = width
        canvas.height = height

        const { default: RaindropFXConstructor } = await import('raindrop-fx')
        if (cancelled) return

        raindropFx = new RaindropFXConstructor({
          canvas,
          background: WEATHER_BACKGROUNDS.poor,
          spawnSize: [28, 88],
          spawnInterval: [.08, .2],
          spawnLimit: 520,
          slipRate: .42,
          motionInterval: [.45, 3.2],
          xShifting: [-.025, .025],
          colliderSize: .86,
          trailDropDensity: .18,
          trailDropSize: [.28, .46],
          trailDistance: [22, 38],
          trailSpread: .5,
          initialSpread: .56,
          shrinkRate: .014,
          velocitySpread: .28,
          evaporate: 18,
          gravity: 1900,
          backgroundBlurSteps: 3,
          mist: true,
          mistColor: [.02, .035, .05, .24],
          mistTime: 8,
          mistBlurStep: 4,
          dropletsPerSeconds: 520,
          dropletSize: [9, 22],
          smoothRaindrop: [.955, 1],
          refractBase: .36,
          refractScale: .58,
          raindropCompose: 'smoother',
          raindropLightPos: [-.7, .8, 2, 0],
          raindropDiffuseLight: [.24, .27, .3],
          raindropShadowOffset: .68,
          raindropEraserSize: [.93, 1],
          raindropSpecularLight: [.22, .25, .28],
          raindropSpecularShininess: 180,
          raindropLightBump: .58,
        })
        await raindropFx.start()
        started = true
        if (cancelled) {
          raindropFx.stop()
          return
        }
        resize()

        await nextAnimationFrame()
        await nextAnimationFrame()
        if (cancelled) return

        const gl = canvas.getContext('webgl2')
        if (!gl || gl.isContextLost() || canvas.width <= 0 || canvas.height <= 0) {
          throw new Error('RaindropFX did not produce an active WebGL canvas.')
        }
        gl.finish()
        canvas.dataset.raindropFx = 'running'
      } catch (error) {
        console.warn('Could not start the glass raindrop effect:', error)
        raindropFx?.stop()
        raindropFx = null
      }
    }

    window.addEventListener('resize', resize)
    void start()

    return () => {
      cancelled = true
      window.removeEventListener('resize', resize)
      raindropFx?.stop()
      delete canvas.dataset.raindropFx
    }
  }, [canvasRef, isPoorWeather])
}

export default function DetailedComparisonWeather({ state }: { state: DevelopmentWeatherState }) {
  const glassCanvasRef = useRef<HTMLCanvasElement>(null)
  const isPoorWeather = state === 'poor'

  useGlassRaindrops(glassCanvasRef, isPoorWeather)

  return (
    <>
      {(Object.entries(WEATHER_BACKGROUNDS) as Array<[DevelopmentWeatherState, string]>).map(([name, url]) => (
        <div
          className={`weather-background ${name}`}
          key={name}
          style={{ backgroundImage: `url(${url})` }}
          aria-hidden="true"
        />
      ))}
      <div className="weather-atmosphere" aria-hidden="true" />
      <div className="weather-cloud-layer" aria-hidden="true" />
      <canvas ref={glassCanvasRef} className="rain-glass-layer" aria-hidden="true" />
      <div className="weather-vignette" aria-hidden="true" />
    </>
  )
}
