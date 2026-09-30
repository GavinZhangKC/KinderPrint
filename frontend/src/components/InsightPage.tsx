import { useEffect, useRef, useState } from 'react'
import BrandHeader from './BrandHeader'
import ChapterEvidence, { chapterCopy } from './insight/ChapterEvidence'
import { chapters } from './insight/journey'
import { useInsightData } from './insight/useInsightData'
import { useJourney } from './insight/useJourney'
import './InsightPage.css'

interface InsightPageProps {
  onLogoClick: () => void
  onExploreMap: () => void
  onSimulation: () => void
  onHealth: () => void
}

export default function InsightPage({ onLogoClick, onExploreMap, onSimulation, onHealth }: InsightPageProps) {
  const { rootRef, journey, chapter, reducedMotion, goToChapter } = useJourney()
  const { state, retry } = useInsightData()
  const sceneRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const audioAutoStartRef = useRef(false)
  const [sceneStatus, setSceneStatus] = useState<'loading' | 'ready' | 'static'>('loading')
  const [isAudioPlaying, setIsAudioPlaying] = useState(false)

  const toggleAudio = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try {
        await audio.play()
      } catch {
        setIsAudioPlaying(false)
      }
    } else {
      audio.pause()
    }
  }

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = 0.3
    const startAtTwoSeconds = () => {
      if (!audio || audioAutoStartRef.current || !audio.paused) return
      audioAutoStartRef.current = true
      audio.currentTime = 4
      void audio.play().catch(() => setIsAudioPlaying(false))
    }
    if (audio?.readyState && audio.readyState >= 1) startAtTwoSeconds()
    else audio?.addEventListener('loadedmetadata', startAtTwoSeconds, { once: true })
    return () => {
      audio?.removeEventListener('loadedmetadata', startAtTwoSeconds)
      audio?.pause()
    }
  }, [])
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
    <BrandHeader
      activePage="insight"
      onHome={onLogoClick}
      onInsight={() => goToChapter(0)}
      onMap={onExploreMap}
      onSimulation={onSimulation}
      onHealth={onHealth}
    />
    <button
      type="button"
      className="insight-audio-control"
      aria-label={isAudioPlaying ? 'Pause background music' : 'Play background music'}
      aria-pressed={isAudioPlaying}
      onClick={toggleAudio}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 9v6h4l5 4V5L8 9H4Z" />
        {isAudioPlaying ? <path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" /> : <path d="m16 10 4 4m0-4-4 4" />}
      </svg>
    </button>
    <audio
      ref={audioRef}
      className="insight-audio"
      src="/Music.mp3"
      loop
      preload="auto"
      aria-hidden="true"
      onPlay={() => setIsAudioPlaying(true)}
      onPause={() => setIsAudioPlaying(false)}
      onError={() => setIsAudioPlaying(false)}
    />
    <main className="insight-chapters">
      {chapters.map((item, index) => {
        const Heading = index === 0 ? 'h1' : 'h2'
        return <section className={`insight-chapter${index === chapters.length - 1 ? ' insight-chapter--final' : ''}`} id={`insight-chapter-${index + 1}`} key={item.title} aria-labelledby={`insight-heading-${index + 1}`}>
          <article className="insight-panel">
            <p className="insight-kicker"><span>{String(index + 1).padStart(2, '0')} / {String(chapters.length).padStart(2, '0')}</span> {['THE STARTING POINT', 'ENVIRONMENTAL PRESSURE', 'GREEN COVER', 'CHILD DEVELOPMENT', 'CONNECTING THE SIGNALS', 'ROOM FOR CHANGE', 'A BRIGHTER OUTLOOK'][index]}</p>
            <Heading id={`insight-heading-${index + 1}`} tabIndex={-1}>{item.title}</Heading>
            <p className="insight-intro">{chapterCopy[index]}</p>
            <ChapterEvidence chapter={index} state={state} retry={retry} />
            {index === chapters.length - 1 && <div className="insight-actions">
              <button type="button" className="button primary" onClick={onExploreMap}>Explore the map <span aria-hidden="true">↗</span></button>
              <button type="button" className="button secondary" onClick={() => goToChapter(0)}>Replay the journey <span aria-hidden="true">↺</span></button>
            </div>}
          </article>
        </section>
      })}
    </main>
    <nav className="insight-progress" aria-label="Journey chapters">
      {chapters.map((item, index) => <button type="button" key={item.title} aria-label={`${index + 1} of ${chapters.length}: ${item.title}`} aria-current={chapter === index ? 'step' : undefined} onClick={() => goToChapter(index)}>
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
