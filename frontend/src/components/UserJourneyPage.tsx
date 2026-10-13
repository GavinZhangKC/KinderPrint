/**
 * User Journey: a short guided tour of what Vkinder does. A muted film plays in the background:
 * the Vkinder opening image for one second, then Melbourne at night, Albert Park, forest, solar,
 * the Great Ocean Road, digital health and families. Scrolling moves through six cards, one per part of the site, each with a link to try it. The last panel links to
 * About us (/about), the previous home page.
 */
import { useEffect, useRef, useState } from 'react'
import BrandHeader from './BrandHeader'
import './UserJourneyPage.css'

interface Props {
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
  onHealth: () => void
}

interface Step { kicker: string; title: string; text: string; tags: string[]; action: string; go: () => void }

export default function UserJourneyPage({ onHome, onInsight, onMap, onSimulation, onHealth }: Props) {
  const steps: Step[] = [
    { kicker: 'Explore Melbourne', title: 'Compare every area on one map', text: 'See where young children are doing well and where they need more support, side by side across Greater Melbourne.', tags: ['Child development', 'Heat', 'Social disadvantage', 'Tree cover', 'Green space'], action: 'Open the map', go: onMap },
    { kicker: 'Your area’s child health', title: 'One board for your suburb', text: 'Everyday guidance for parents, and the evidence practitioners need, for the area you choose.', tags: ['Today', 'Play today', 'Vaccines', 'Seasons', 'Care nearby'], action: 'Open Child Health', go: onHealth },
    { kicker: 'Find where to live', title: 'Shortlist suburbs that fit your family', text: 'Choose what matters to you and see nearby areas that match, with how stable the shortlist is.', tags: ['Your priorities', 'Within a radius', 'Compare side by side'], action: 'Try Where to live', go: () => window.location.assign('/where-to-live?view=find') },
    { kicker: 'Simulate a scenario', title: 'What if the environment changed?', text: 'Adjust tree canopy, urban heat or open space and see how children’s development outcomes respond.', tags: ['Tree canopy', 'Urban heat', 'Open space'], action: 'Open Simulation', go: onSimulation },
    { kicker: 'What if this area changed?', title: 'Learn from areas that already have it', text: 'See how children are doing in similar Melbourne areas that already have more trees or cooler streets.', tags: ['Matched areas', 'Area-level evidence'], action: 'Compare a change', go: () => window.location.assign('/where-to-live?view=plan') },
    { kicker: 'Plan for 2031', title: 'Will services keep up?', text: 'Projected numbers of children by area, and whether childcare, GPs and schools keep pace if nothing new opens. Choose an area, then open In 2031 on its board.', tags: ['Child population', 'Childcare places', 'GPs', 'Schools'], action: 'Choose an area', go: onMap },
  ]
  const segments = steps.length + 2 // intro, the steps, the ending
  const [step, setStep] = useState(-1) // -1 intro, 0..5 cards, 6 ending
  const [progress, setProgress] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      setProgress(p)
      setStep(Math.min(segments - 1, Math.floor(p * segments)) - 1)
    }
    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { window.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [segments])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) video.pause()
    else void video.play().catch(() => {})
  }, [])

  const goTo = (index: number) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    window.scrollTo({ top: max * (index + 1.5) / segments, behavior: 'smooth' })
  }

  return <div className="uj-page">
    <div className="uj-stage" aria-hidden="true">
      <video ref={videoRef} muted playsInline autoPlay loop preload="auto" poster="/user-journey/journey_poster.jpg">
        <source src="/user-journey/journey.mp4" type="video/mp4" />
      </video>
      <div className="uj-shade" />
    </div>

    <div className="uj-header">
      <BrandHeader activePage="home" onHome={onHome} onInsight={onInsight} onMap={onMap} onSimulation={onSimulation} onHealth={onHealth} />
    </div>

    <section className={`uj-intro${step < 0 ? ' is-on' : ''}`} aria-hidden={step >= 0}>
      <p className="uj-kicker">Welcome to Vkinder</p>
      <h1>Healthier childhoods start with the place you live.</h1>
      <p>A short flight across Melbourne and six things you can do with Vkinder, from finding your area to planning for 2031. Scroll to take the tour.</p>
      <div className="uj-cue" aria-hidden="true"><i />Scroll</div>
    </section>

    <div className="uj-cards" aria-live="polite">
      {steps.map((item, index) => <article key={item.kicker} className={`uj-card${index === step ? ' is-on' : ''}${index < step ? ' is-past' : ''}`} aria-hidden={index !== step}>
        <p className="uj-card-n">{item.kicker}<em>{index + 1} / {steps.length}</em></p>
        <h2>{item.title}</h2>
        <p>{item.text}</p>
        <ul>{item.tags.map(tag => <li key={tag}>{tag}</li>)}</ul>
        <button type="button" tabIndex={index === step ? 0 : -1} onClick={item.go}>{item.action} <span aria-hidden="true">→</span></button>
      </article>)}
    </div>

    <section className={`uj-end${step >= steps.length ? ' is-on' : ''}`} aria-hidden={step < steps.length}>
      <h2>Ready to explore?</h2>
      <p>Start with your suburb on the map, or jump straight to the part you need.</p>
      <div className="uj-end-row">
        <button type="button" onClick={onMap}>Open the map</button>
        <button type="button" className="ghost" onClick={() => window.location.assign('/where-to-live?view=find')}>Where to live</button>
        <button type="button" className="ghost" onClick={() => window.location.assign('/about')}>About us</button>
      </div>
    </section>

    <nav className="uj-dots" aria-label="Tour steps">
      {steps.map((item, index) => <button key={item.kicker} type="button" aria-current={index === step ? 'step' : undefined} aria-label={`${index + 1} of ${steps.length}: ${item.kicker}`} onClick={() => goTo(index)}><span>{item.kicker}</span><i /></button>)}
    </nav>
    <div className="uj-bar" style={{ transform: `scaleX(${progress})` }} />
    <p className="uj-credit">Footage: Pexels (Peter Erb, Andy Nguyen, Tetrakis Sphericon, Danilo Riba, K, Pat Whelen, Ketut Subiyanto, Evgenij Mikhailov, Yan Krukau)</p>
    <div className="uj-spacer" />
  </div>
}
