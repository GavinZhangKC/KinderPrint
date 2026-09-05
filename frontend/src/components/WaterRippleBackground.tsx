import { useEffect, useRef } from 'react'
import $ from 'jquery'
import 'jquery.ripples'

import './WaterRippleBackground.css'

const MIN_DISTANCE = 15
const MIN_INTERVAL = 50
const DROP_RADIUS = 21
const DROP_STRENGTH = 0.025
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
    } catch (error) {
      console.warn('Water ripple background is unavailable; using the static background.', error)
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (!initialized || event.pointerType !== 'mouse') return

      const target = event.target
      if (!(target instanceof Element)) return
      if (!target.closest('[data-ripple-surface]') || target.closest(EXCLUDED_ELEMENTS)) return

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
    }

    const handleVisibilityChange = () => {
      if (!initialized) return
      $background.ripples(document.hidden ? 'pause' : 'play')
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('resize', handleResize)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (initialized) $background.ripples('destroy')
    }
  }, [])

  return <div ref={backgroundRef} className="water-ripple-background" aria-hidden="true" />
}
