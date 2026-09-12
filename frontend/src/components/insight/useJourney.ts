import { useEffect, useRef, useState } from 'react'
import { journeyAtScroll, scrollHintOpacity, weatherAt, type JourneyState } from './journey'

export function useJourney() {
  const rootRef = useRef<HTMLDivElement>(null)
  const journey = useRef<JourneyState>({ progress: 0, chapter: 0, reducedMotion: false })
  const anchorsRef = useRef([0, 1, 2, 3, 4])
  const [chapter, setChapter] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  useEffect(() => {
    const root = rootRef.current!
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sections = Array.from(root.querySelectorAll<HTMLElement>('.insight-chapter'))
    let frame = 0
    const tick = () => {
      frame = 0
      const scroll = Math.max(0, -root.getBoundingClientRect().top)
      const mapped = journeyAtScroll(scroll, anchorsRef.current, journey.current.chapter)
      journey.current.progress = mapped.progress
      if (mapped.chapter !== journey.current.chapter) {
        journey.current.chapter = mapped.chapter
        setChapter(mapped.chapter)
      }
      const weather = weatherAt(mapped.progress)
      root.style.setProperty('--journey-progress', String(mapped.progress))
      root.style.setProperty('--storm', String(weather.storm))
      root.style.setProperty('--sun', String(weather.sun))
      root.style.setProperty('--rain', String(weather.rain))
      const hintOpacity = scrollHintOpacity(mapped.progress)
      root.style.setProperty('--scroll-hint-opacity', String(hintOpacity))
      root.dataset.scrollHint = hintOpacity > 0 ? 'visible' : 'hidden'
      root.dataset.progress = mapped.progress.toFixed(5)
      root.dataset.chapter = String(mapped.chapter + 1)
      sections.forEach((section, index) => { section.dataset.active = String(index === mapped.chapter) })
    }
    const update = () => { if (!frame) frame = requestAnimationFrame(tick) }
    const measure = () => {
      // Measure natural panel placement, not its current sticky bounding box.
      const readingLine = innerHeight * (innerWidth <= 760 ? .38 : .46)
      anchorsRef.current = sections.map((section, index) => {
        const start = index === 0 ? 0 : Math.max(0, section.offsetTop + parseFloat(getComputedStyle(section).paddingTop) - readingLine)
        section.dataset.arrival = String(start)
        return start
      })
      root.dataset.readingLine = String(readingLine)
      update()
    }
    const motion = () => {
      journey.current.reducedMotion = media.matches
      setReducedMotion(media.matches)
      update()
    }
    const resize = new ResizeObserver(measure)
    resize.observe(root)
    sections.forEach(section => resize.observe(section))
    media.addEventListener('change', motion)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', measure)
    motion(); measure()
    return () => {
      cancelAnimationFrame(frame); resize.disconnect()
      media.removeEventListener('change', motion)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', measure)
    }
  }, [])

  function goToChapter(index: number) {
    const section = rootRef.current?.querySelector<HTMLElement>(`#insight-chapter-${index + 1}`)
    if (!section) return
    const anchors = anchorsRef.current
    const readingLine = innerHeight * (innerWidth <= 760 ? .38 : .46)
    const readingOffset = index === 0 ? 0 : Math.min(Math.max(0, readingLine - (innerWidth <= 760 ? 144 : 120)), (anchors[Math.min(4, index + 1)] - anchors[index] || innerHeight) * .17)
    const top = index === 4 ? section.offsetTop : anchors[index] + readingOffset
    window.scrollTo({ top, behavior: reducedMotion ? 'instant' : 'smooth' })
    section.querySelector<HTMLElement>('h1, h2')?.focus({ preventScroll: true })
  }
  return { rootRef, journey, chapter, reducedMotion, goToChapter }
}
