import { useEffect, useRef } from 'react'
import './InteractiveAtmosphere.css'

interface InteractiveAtmosphereProps {
  mode?: 'explore' | 'compare'
}

const SURFACE_SELECTOR = [
  '.profile-domain-card',
  '.key-insight-card',
  '.summary-card',
  '.environmental-compare-card',
  '.next-step-card',
].join(', ')

const MAGNETIC_SELECTOR = [
  '.button',
  '.nav-links button',
  '.brand-button',
  '.icon-close',
  '.suitability-result-button',
].join(', ')

function closestTarget(target: EventTarget | null, selector: string) {
  return target instanceof Element ? target.closest<HTMLElement>(selector) : null
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
    let targetScroll = 0
    let currentScroll = 0

    const render = () => {
      currentX += (targetX - currentX) * 0.075
      currentY += (targetY - currentY) * 0.075
      currentScroll += (targetScroll - currentScroll) * 0.06
      root.style.setProperty('--atmosphere-x', currentX.toFixed(3))
      root.style.setProperty('--atmosphere-y', currentY.toFixed(3))
      root.style.setProperty('--journey-scroll', currentScroll.toFixed(3))
      frame = window.requestAnimationFrame(render)
    }

    const move = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5
      targetY = event.clientY / window.innerHeight - 0.5

      const surface = closestTarget(event.target, SURFACE_SELECTOR)
      if (surface) {
        const bounds = surface.getBoundingClientRect()
        surface.style.setProperty('--surface-x', ((event.clientX - bounds.left) / bounds.width - 0.5).toFixed(3))
        surface.style.setProperty('--surface-y', ((event.clientY - bounds.top) / bounds.height - 0.5).toFixed(3))
      }

      const magnetic = closestTarget(event.target, MAGNETIC_SELECTOR)
      if (magnetic) {
        const bounds = magnetic.getBoundingClientRect()
        magnetic.style.setProperty('--magnetic-x', `${(event.clientX - bounds.left - bounds.width / 2) * 0.1}px`)
        magnetic.style.setProperty('--magnetic-y', `${(event.clientY - bounds.top - bounds.height / 2) * 0.1}px`)
      }
    }

    const leave = (event: PointerEvent) => {
      const surface = closestTarget(event.target, SURFACE_SELECTOR)
      if (surface && !surface.contains(event.relatedTarget as Node | null)) {
        surface.style.removeProperty('--surface-x')
        surface.style.removeProperty('--surface-y')
      }

      const magnetic = closestTarget(event.target, MAGNETIC_SELECTOR)
      if (magnetic && !magnetic.contains(event.relatedTarget as Node | null)) {
        magnetic.style.removeProperty('--magnetic-x')
        magnetic.style.removeProperty('--magnetic-y')
      }
    }

    const scroll = () => {
      const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      targetScroll = Math.min(1, window.scrollY / range)
    }

    const pulse = (event: PointerEvent) => {
      const mark = document.createElement('span')
      mark.className = 'atmosphere-pulse'
      mark.style.left = `${event.clientX}px`
      mark.style.top = `${event.clientY}px`
      root.appendChild(mark)
      mark.addEventListener('animationend', () => mark.remove(), { once: true })
    }

    window.addEventListener('pointermove', move, { passive: true })
    window.addEventListener('pointerout', leave, { passive: true })
    window.addEventListener('scroll', scroll, { passive: true })
    window.addEventListener('pointerdown', pulse, { passive: true })
    scroll()
    frame = window.requestAnimationFrame(render)

    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerout', leave)
      window.removeEventListener('scroll', scroll)
      window.removeEventListener('pointerdown', pulse)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="interactive-atmosphere" data-mode={mode} ref={rootRef} aria-hidden="true">
      <div className="atmosphere-progress" />
      <div className="atmosphere-sky" />
      <div className="atmosphere-aurora atmosphere-aurora-a" />
      <div className="atmosphere-aurora atmosphere-aurora-b" />
      <div className="atmosphere-sun" />
      <div className="atmosphere-pointer-light" />
      <div className="atmosphere-cloud atmosphere-cloud-a" />
      <div className="atmosphere-cloud atmosphere-cloud-b" />
      <div className="atmosphere-land atmosphere-land-back" />
      <div className="atmosphere-land atmosphere-land-front" />
      <div className="atmosphere-grain" />
      <div className="atmosphere-caption">Explore · connect · compare</div>
    </div>
  )
}
