import { useEffect, useRef, useState } from 'react'
import BrandHeader from './BrandHeader'
import ChapterEvidence, { chapterCopy } from './insight/ChapterEvidence'
import { chapters } from './insight/journey'
import { useInsightData } from './insight/useInsightData'
import { useJourney } from './insight/useJourney'
import './InsightPage.css'

interface InsightPageProps {
  onLogoClick: () => void
  onBackToMenu: () => void
  onExploreMap: () => void
}

export default function InsightPage({ onLogoClick, onBackToMenu, onExploreMap }: InsightPageProps) {
  const { rootRef, journey, chapter, reducedMotion, goToChapter } = useJourney()
  const { state, retry } = useInsightData()
  const sceneRef = useRef<HTMLDivElement>(null)
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'static'>('loading')
  useEffect(() => {
    document.documentElement.classList.add('insight-scrollbar-hidden')
    window.scrollTo({ top: 0, behavior: 'instant' })
    return () => {
      document.documentElement.classList.remove('insight-scrollbar-hidden')
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
  }, [])
  useEffect(() => {
    if (reducedMotion) { setSceneStatus('static'); return }
    let cancelled = false
    let dispose: (() => void) | undefined
    setSceneStatus('loading')
    void import('./insight/JourneyScene').then(({ createJourneyScene }) => {
      if (cancelled || !sceneRef.current) return
      dispose = createJourneyScene(sceneRef.current, () => journey.current, () => setSceneStatus('static'))
      setSceneStatus('ready')
    }).catch(() => { if (!cancelled) setSceneStatus('static') })
    return () => { cancelled = true; dispose?.() }
  }, [reducedMotion, journey])

  return <div className="insight-page" ref={rootRef} data-scene={sceneStatus} data-reduced-motion={reducedMotion}>
    <a className="insight-skip" href="#insight-chapter-1" onClick={event => { event.preventDefault(); goToChapter(0) }}>Skip to journey content</a>
    <div className="insight-backdrop" aria-hidden="true">
      <div className="insight-sky" /><div className="insight-sun" /><div className="insight-fallback" />
      <div className="insight-scene" ref={sceneRef}>
        {chapters.map((_, index) => <span className="insight-station" data-station={index} key={index}>{String(index + 1).padStart(2, '0')}</span>)}
      </div>
      <div className="insight-clouds" /><div className="insight-atmosphere" />
    </div>
    <BrandHeader onLogoClick={onLogoClick} onExplore={onExploreMap} onBackToMenu={onBackToMenu} />
    <aside className="insight-journey-status" aria-label="Journey status">
      <span className="insight-weather-icon" aria-hidden="true">{['◌', '☁', '☂', '◒', '☀'][chapter]}</span>
      <div><span>THE INSIGHT JOURNEY</span><p aria-live="polite">{String(chapter + 1).padStart(2, '0')} / 05 <i /> {chapters[chapter].weather}</p></div>
    </aside>
    <main className="insight-chapters">
      {chapters.map((item, index) => {
        const Heading = index === 0 ? 'h1' : 'h2'
        return <section className={`insight-chapter${index === 4 ? ' insight-chapter--final' : ''}`} id={`insight-chapter-${index + 1}`} key={item.title} aria-labelledby={`insight-heading-${index + 1}`}>
          <article className="insight-panel">
            <p className="insight-kicker"><span>{String(index + 1).padStart(2, '0')} / 05</span> {['THE STARTING POINT', 'READING THE EVIDENCE', 'LOOKING DEEPER', 'POSSIBILITY IN VIEW', 'THE JOURNEY CONTINUES'][index]}</p>
            <Heading id={`insight-heading-${index + 1}`} tabIndex={-1}>{item.title}</Heading>
            <p className="insight-intro">{chapterCopy[index]}</p>
            <ChapterEvidence chapter={index} state={state} retry={retry} />
            {index === 4 && <div className="insight-actions">
              <button type="button" className="button primary" onClick={onExploreMap}>Explore the map <span aria-hidden="true">↗</span></button>
              <button type="button" className="button secondary" onClick={() => goToChapter(0)}>Replay the journey <span aria-hidden="true">↺</span></button>
            </div>}
          </article>
        </section>
      })}
    </main>
    <nav className="insight-progress" aria-label="Journey chapters">
      {chapters.map((item, index) => <button type="button" key={item.title} aria-label={`${index + 1} of 5: ${item.title}`} aria-current={chapter === index ? 'step' : undefined} onClick={() => goToChapter(index)}>
        <span className="insight-nav-mark" aria-hidden="true" />
        <span className="insight-nav-tooltip" aria-hidden="true">{String(index + 1).padStart(2, '0')} · {item.title}</span>
      </button>)}
    </nav>
    <div className="insight-scroll-hint" aria-hidden="true">
      <span>Scroll down to explore the journey</span>
      <span className="insight-scroll-arrow" aria-hidden="true">↓</span>
    </div>
  </div>
}
