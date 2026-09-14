import { useEffect, useRef } from 'react'
import './InteractiveAtmosphere.css'

interface InteractiveAtmosphereProps {
  mode?: 'explore' | 'compare'
}

export default function InteractiveAtmosphere({ mode = 'explore' }: InteractiveAtmosphereProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let targetX = 0
    let targetY = 0
    let currentX = 0
    let currentY = 0
    const render = () => {
      currentX += (targetX - currentX) * 0.075
      currentY += (targetY - currentY) * 0.075
      root.style.setProperty('--atmosphere-x', currentX.toFixed(3))
      root.style.setProperty('--atmosphere-y', currentY.toFixed(3))
      frame = requestAnimationFrame(render)
    }
    const move = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5
      targetY = event.clientY / window.innerHeight - 0.5
      const surface = (event.target as Element | null)?.closest<HTMLElement>(
        '.profile-domain-card, .key-insight-card, .summary-card, .environmental-compare-card, .next-step-card',
      )
      if (surface) {
        const bounds = surface.getBoundingClientRect()
        surface.style.setProperty('--surface-x', ((event.clientX - bounds.left) / bounds.width - 0.5).toFixed(3))
        surface.style.setProperty('--surface-y', ((event.clientY - bounds.top) / bounds.height - 0.5).toFixed(3))
      }
    }
    const leave = (event: PointerEvent) => {
      const surface = (event.target as Element | null)?.closest<HTMLElement>(
        '.profile-domain-card, .key-insight-card, .summary-card, .environmental-compare-card, .next-step-card',
      )
      if (surface && !surface.contains(event.relatedTarget as Node | null)) {
        surface.style.removeProperty('--surface-x')
        surface.style.removeProperty('--surface-y')
      }
    }
    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerout', leave, { passive: true })
    frame = requestAnimationFrame(render)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerout', leave)
      cancelAnimationFrame(frame)
    }
  }, [])

  return <div className="interactive-atmosphere" data-mode={mode} ref={rootRef} aria-hidden="true">
    <div className="atmosphere-sky" />
    <div className="atmosphere-sun" />
    <div className="atmosphere-cloud atmosphere-cloud-a" />
    <div className="atmosphere-cloud atmosphere-cloud-b" />
    <div className="atmosphere-land atmosphere-land-back" />
    <div className="atmosphere-land atmosphere-land-front" />
    <div className="atmosphere-grain" />
  </div>
}
