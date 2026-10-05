import { useEffect, useRef, useState } from 'react'
import logo from '../../assets/LogoMark.png'
import BrandHeader from '../BrandHeader'
import CesiumScene, {
  journeyChapterIndexAtProgress,
  parkvilleJourneyChapters,
  parkvilleJourneyRouteLengthMetres,
} from './CesiumScene'
import type { CesiumSceneHandle } from './CesiumScene'
import JourneyLocationCards, { journeyLocationCardSide } from './JourneyLocationCards'
import type { JourneyLocationCardsHandle } from './JourneyLocationCards'
import {
  parkvilleCoverage,
  verifiedParkvilleLocations,
} from './parkvilleVerification'
import '../../styles/global.css'
import '../BrandHeader.css'
import './CesiumExperimentPage.css'

interface CesiumExperimentPageProps {
  onHome?: () => void
  onInsight?: () => void
  onMap?: () => void
  onSimulation?: () => void
  onHealth?: () => void
}

function openAppPage(page: 'home' | 'map' | 'simulation' | 'health') {
  const destination = page === 'home'
    ? '/'
    : page === 'health'
      ? '/child-health'
      : `/${page}`
  window.location.assign(destination)
}

function coverageLabel(status: 'within' | 'within-near-edge' | 'outside') {
  if (status === 'within-near-edge') return 'Within coverage - near edge'
  if (status === 'outside') return 'Outside coverage'
  return 'Within coverage'
}

type SceneLoadStatus = 'initializing' | 'resources' | 'preparing' | 'ready' | 'error'

interface SceneLoadState {
  status: SceneLoadStatus
  loaded: number
  total: number
  detail: string
  error?: string
}

function initialSceneLoadState(): SceneLoadState {
  return {
    status: 'initializing',
    loaded: 0,
    total: 0,
    detail: 'Starting the 3D renderer...',
  }
}

const journeyNarrative = [
  {
    eyebrow: 'The starting point',
    intro: 'Begin at Parkville\'s western health gateway, where specialist children\'s care sits within a broader network of everyday services, education and open space.',
    insight: 'A major paediatric landmark anchors the journey and establishes the precinct\'s child-health focus.',
  },
  {
    eyebrow: 'Green cover',
    intro: 'The route opens onto Royal Park. Its mature landscape provides a sharp contrast to the dense hospital and university buildings nearby.',
    insight: 'Large public green spaces can support play, movement, shade and respite close to essential services.',
  },
  {
    eyebrow: 'Early years',
    intro: 'Moving east, the journey reaches a local early-childhood service woven into the surrounding streets rather than separated from daily neighbourhood life.',
    insight: 'Accessible early-learning services help connect care, family routines and the places children encounter every day.',
  },
  {
    eyebrow: 'Learning environment',
    intro: 'At University High School, the precinct shifts from early-years support toward the environments that shape learning through adolescence.',
    insight: 'Education infrastructure forms part of the same connected local system as health care, transport and public space.',
  },
  {
    eyebrow: 'A continuum of care',
    intro: 'The Royal Women\'s Hospital highlights how maternal health, newborn care and family wellbeing are physically connected within Parkville.',
    insight: 'Co-located services can make transitions between maternal, newborn and paediatric care easier to understand and navigate.',
  },
  {
    eyebrow: 'Connected health',
    intro: 'The Royal Melbourne Hospital expands the view from specialist family services to a wider health precinct serving the whole community.',
    insight: 'The strength of the precinct comes from proximity: institutions, research and clinical services operate as a connected network.',
  },
  {
    eyebrow: 'A shared future',
    intro: 'The journey concludes at the University of Melbourne, where education and research connect the places visited along the route.',
    insight: 'A child-friendly precinct is shaped by the relationships between care, learning, green space and the public realm—not by any single landmark.',
  },
] as const

function smoothstep(value: number) {
  const bounded = Math.min(1, Math.max(0, value))
  return bounded * bounded * (3 - 2 * bounded)
}

function narrativePanelOpacity(progress: number, chapterIndex: number) {
  const chapterProgress = parkvilleJourneyChapters[chapterIndex].routeProgress
  const previousProgress = chapterIndex === 0
    ? 0
    : parkvilleJourneyChapters[chapterIndex - 1].routeProgress
  const nextProgress = chapterIndex === parkvilleJourneyChapters.length - 1
    ? 1
    : parkvilleJourneyChapters[chapterIndex + 1].routeProgress
  const intervalStart = chapterIndex === 0
    ? 0
    : (previousProgress + chapterProgress) / 2
  const intervalEnd = chapterIndex === parkvilleJourneyChapters.length - 1
    ? 1
    : (chapterProgress + nextProgress) / 2
  const localProgress = (
    (progress - intervalStart)
    / Math.max(0.0001, intervalEnd - intervalStart)
  )

  // Reserve the centre of each chapter for reading. The outer portions are
  // deliberately longer fades so the panel arrives and leaves with the camera.
  const fadeIn = smoothstep(localProgress / 0.22)
  const fadeOut = 1 - smoothstep((localProgress - 0.72) / 0.28)
  return Math.min(fadeIn, fadeOut)
}

export default function CesiumExperimentPage({
  onHome = () => openAppPage('home'),
  onInsight,
  onMap = () => openAppPage('map'),
  onSimulation = () => openAppPage('simulation'),
  onHealth = () => openAppPage('health'),
}: CesiumExperimentPageProps) {
  const journeyRef = useRef<HTMLElement>(null)
  const sceneRef = useRef<CesiumSceneHandle>(null)
  const locationCardsRef = useRef<JourneyLocationCardsHandle>(null)
  const targetJourneyProgressRef = useRef(0)
  const renderedJourneyProgressRef = useRef(0)
  const journeyVelocityRef = useRef(0)
  const verificationModeRef = useRef(false)
  const journeyPausedRef = useRef(false)
  const sceneReadyRef = useRef(false)
  const pauseJourneyAnimationRef = useRef<() => void>(() => undefined)
  const resumeJourneyAnimationRef = useRef<() => void>(() => undefined)
  const [verificationMode, setVerificationMode] = useState(false)
  const [sceneAttempt, setSceneAttempt] = useState(0)
  const [sceneLoadState, setSceneLoadState] = useState<SceneLoadState>(
    initialSceneLoadState,
  )
  const [locationDetailOpen, setLocationDetailOpen] = useState(false)
  const [journeyProgress, setJourneyProgress] = useState(0)
  const [activeChapterIndex, setActiveChapterIndex] = useState(0)
  const [selectedLocationId, setSelectedLocationId] = useState(
    verifiedParkvilleLocations[0].id,
  )
  const selectedLocation = verifiedParkvilleLocations.find(
    (location) => location.id === selectedLocationId,
  ) ?? verifiedParkvilleLocations[0]
  const activeChapter = parkvilleJourneyChapters[activeChapterIndex]
  const activeNarrative = journeyNarrative[activeChapterIndex]
  const activeLocation = verifiedParkvilleLocations.find(
    (location) => location.id === activeChapter.locationId,
  ) ?? verifiedParkvilleLocations[0]
  const locationCardSide = journeyLocationCardSide(activeChapter.locationId)
  const narrativePanelSide = locationCardSide === 'left' ? 'right' : 'left'
  const narrativeOpacity = narrativePanelOpacity(
    journeyProgress,
    activeChapterIndex,
  )
  const narrativeVisible = narrativeOpacity > 0.025
  const sceneLoading = sceneLoadState.status !== 'ready'
  const resourceProgress = sceneLoadState.total > 0
    ? Math.round(sceneLoadState.loaded / sceneLoadState.total * 100)
    : 0

  useEffect(() => {
    document.documentElement.classList.add('cesium-scrollbar-hidden')
    return () => document.documentElement.classList.remove('cesium-scrollbar-hidden')
  }, [])

  useEffect(() => {
    if (!sceneLoading) return

    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousRootOverflow
    }
  }, [sceneLoading])

  useEffect(() => {
    let animationFrame = 0
    let previousFrameTime = 0

    const readScrollProgress = () => {
      const journey = journeyRef.current
      if (!journey) return 0

      const journeyTop = journey.getBoundingClientRect().top + window.scrollY
      const scrollRange = Math.max(1, journey.offsetHeight - window.innerHeight)
      return Math.min(
        1,
        Math.max(0, (window.scrollY - journeyTop) / scrollRange),
      )
    }

    const renderJourneyProgress = (progress: number) => {
      const chapterIndex = journeyChapterIndexAtProgress(progress)

      setJourneyProgress(progress)
      setActiveChapterIndex(chapterIndex)

      if (!verificationModeRef.current) {
        sceneRef.current?.setJourneyProgress(progress)
      }
    }

    const animateJourney = (frameTime: number) => {
      animationFrame = 0
      if (!sceneReadyRef.current || journeyPausedRef.current) {
        previousFrameTime = 0
        journeyVelocityRef.current = 0
        return
      }

      const elapsedSeconds = previousFrameTime === 0
        ? 1 / 60
        : Math.min(0.05, (frameTime - previousFrameTime) / 1000)
      previousFrameTime = frameTime

      const target = targetJourneyProgressRef.current
      const current = renderedJourneyProgressRef.current
      const springStrength = 58
      const springDamping = 15
      const acceleration = (
        (target - current) * springStrength
        - journeyVelocityRef.current * springDamping
      )

      journeyVelocityRef.current += acceleration * elapsedSeconds
      let next = current + journeyVelocityRef.current * elapsedSeconds
      next = Math.min(1, Math.max(0, next))

      const settled = (
        Math.abs(target - next) < 0.00004
        && Math.abs(journeyVelocityRef.current) < 0.0002
      )

      if (settled) {
        next = target
        journeyVelocityRef.current = 0
      }

      renderedJourneyProgressRef.current = next
      renderJourneyProgress(next)

      if (!settled) {
        animationFrame = window.requestAnimationFrame(animateJourney)
      } else {
        previousFrameTime = 0
      }
    }

    const scheduleJourneyAnimation = () => {
      if (!sceneReadyRef.current || journeyPausedRef.current) return
      targetJourneyProgressRef.current = readScrollProgress()
      if (animationFrame === 0) {
        previousFrameTime = 0
        animationFrame = window.requestAnimationFrame(animateJourney)
      }
    }

    pauseJourneyAnimationRef.current = () => {
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
      animationFrame = 0
      previousFrameTime = 0
      journeyVelocityRef.current = 0
      targetJourneyProgressRef.current = renderedJourneyProgressRef.current
    }
    resumeJourneyAnimationRef.current = scheduleJourneyAnimation

    const initialProgress = readScrollProgress()
    targetJourneyProgressRef.current = initialProgress
    renderedJourneyProgressRef.current = initialProgress
    renderJourneyProgress(initialProgress)

    window.addEventListener('scroll', scheduleJourneyAnimation, { passive: true })
    window.addEventListener('resize', scheduleJourneyAnimation)

    return () => {
      window.removeEventListener('scroll', scheduleJourneyAnimation)
      window.removeEventListener('resize', scheduleJourneyAnimation)
      if (animationFrame !== 0) window.cancelAnimationFrame(animationFrame)
      pauseJourneyAnimationRef.current = () => undefined
      resumeJourneyAnimationRef.current = () => undefined
    }
  }, [])

  useEffect(() => {
    if (!locationDetailOpen) return

    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousRootOverflow
    }
  }, [locationDetailOpen])

  function handleLocationDetailChange(expanded: boolean) {
    journeyPausedRef.current = expanded
    setLocationDetailOpen(expanded)
    sceneRef.current?.setJourneyPaused(expanded)
    if (expanded) {
      pauseJourneyAnimationRef.current()
    } else {
      window.requestAnimationFrame(() => resumeJourneyAnimationRef.current())
    }
  }

  function toggleVerificationMode() {
    const enabled = !verificationMode
    verificationModeRef.current = enabled
    setVerificationMode(enabled)
    sceneRef.current?.setVerificationMode(enabled)

    if (!enabled) {
      sceneRef.current?.setJourneyProgress(renderedJourneyProgressRef.current)
    }
  }

  function focusLocation(locationId: string) {
    setSelectedLocationId(locationId)
    sceneRef.current?.focusOnVerifiedLocation(locationId)
  }

  function focusRouteChapter(chapterIndex: number) {
    const chapter = parkvilleJourneyChapters[chapterIndex]
    targetJourneyProgressRef.current = chapter.routeProgress
    renderedJourneyProgressRef.current = chapter.routeProgress
    journeyVelocityRef.current = 0
    setJourneyProgress(chapter.routeProgress)
    setActiveChapterIndex(chapterIndex)
    sceneRef.current?.setJourneyProgress(chapter.routeProgress)
  }

  function goToJourneyChapter(chapterIndex: number) {
    const journey = journeyRef.current
    if (!journey) {
      focusRouteChapter(chapterIndex)
      return
    }

    const chapter = parkvilleJourneyChapters[chapterIndex]
    const journeyTop = journey.getBoundingClientRect().top + window.scrollY
    const scrollRange = Math.max(1, journey.offsetHeight - window.innerHeight)
    window.scrollTo({
      top: journeyTop + chapter.routeProgress * scrollRange,
      behavior: 'smooth',
    })
  }

  function handleSceneReady() {
    sceneReadyRef.current = true
    setSceneLoadState((current) => ({
      ...current,
      status: 'ready',
      detail: 'Journey ready',
    }))
    window.requestAnimationFrame(() => resumeJourneyAnimationRef.current())
  }

  function retrySceneLoad() {
    sceneReadyRef.current = false
    setSceneLoadState(initialSceneLoadState())
    setSceneAttempt((attempt) => attempt + 1)
  }

  return (
    <main
      ref={journeyRef}
      className={`cesium-experiment ${sceneLoading ? 'is-loading' : ''}`}
      aria-busy={sceneLoading}
    >
      <div className={`cesium-experiment-stage ${verificationMode ? 'is-verification' : ''} ${sceneLoading ? 'is-loading' : ''}`}>
        <a className="cesium-journey-skip" href="#parkville-journey-panel">
          Skip to journey content
        </a>

        <CesiumScene
          key={sceneAttempt}
          ref={sceneRef}
          onVerificationLocationSelect={setSelectedLocationId}
          onJourneyOverlayUpdate={(anchors) => {
            locationCardsRef.current?.updateAnchors(anchors)
          }}
          onLoadProgress={(loaded, total, label) => {
            setSceneLoadState({
              status: 'resources',
              loaded,
              total,
              detail: label,
            })
          }}
          onLoadPhaseChange={(phase) => {
            setSceneLoadState((current) => ({
              ...current,
              status: phase,
              detail: phase === 'resources'
                ? 'Loading local Melbourne data...'
                : 'Preparing buildings and landscape...',
            }))
          }}
          onReady={handleSceneReady}
          onLoadError={(error) => {
            sceneReadyRef.current = false
            setSceneLoadState((current) => ({
              ...current,
              status: 'error',
              detail: 'The Parkville scene could not be prepared.',
              error,
            }))
          }}
        />

        <div
          className={`cesium-loading-overlay ${sceneLoadState.status === 'ready' ? 'is-ready' : ''} ${sceneLoadState.status === 'error' ? 'has-error' : ''}`}
          aria-hidden={sceneLoadState.status === 'ready'}
        >
          <span className="cesium-loading-glow cesium-loading-glow-one" aria-hidden="true" />
          <span className="cesium-loading-glow cesium-loading-glow-two" aria-hidden="true" />
          <section
            className="cesium-loading-panel"
            role={sceneLoadState.status === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <div className="cesium-loading-brand" aria-hidden="true">
              <img src={logo} alt="" />
              <span>Vkinder</span>
            </div>
            <p className="cesium-loading-kicker">Parkville in 3D</p>
            <h1>
              {sceneLoadState.status === 'error'
                ? 'Journey interrupted'
                : 'Preparing your journey'}
            </h1>
            <p className="cesium-loading-copy">
              {sceneLoadState.status === 'error'
                ? 'We couldn\'t finish building your Melbourne experience.'
                : 'Building your Melbourne experience...'}
            </p>

            {sceneLoadState.status === 'error' ? (
              <div className="cesium-loading-error">
                <p>{sceneLoadState.detail}</p>
                {sceneLoadState.error && <small>{sceneLoadState.error}</small>}
                <button type="button" onClick={retrySceneLoad}>Retry</button>
              </div>
            ) : (
              <div className="cesium-loading-progress-wrap">
                <div
                  className={`cesium-loading-track ${sceneLoadState.status === 'resources' ? 'is-determinate' : 'is-indeterminate'}`}
                  role="progressbar"
                  aria-label="Parkville scene loading progress"
                  aria-valuemin={sceneLoadState.status === 'resources' ? 0 : undefined}
                  aria-valuemax={sceneLoadState.status === 'resources' ? 100 : undefined}
                  aria-valuenow={sceneLoadState.status === 'resources' ? resourceProgress : undefined}
                  aria-valuetext={sceneLoadState.status === 'resources'
                    ? `${resourceProgress}%`
                    : sceneLoadState.detail}
                >
                  <i style={sceneLoadState.status === 'resources'
                    ? { width: `${resourceProgress}%` }
                    : undefined}
                  />
                </div>
                <div className="cesium-loading-meta">
                  <span>{sceneLoadState.detail}</span>
                  <strong>
                    {sceneLoadState.status === 'resources'
                      ? `${resourceProgress}%`
                      : 'Preparing'}
                  </strong>
                </div>
              </div>
            )}
          </section>
        </div>

        {!verificationMode && (
          <JourneyLocationCards
            ref={locationCardsRef}
            chapters={parkvilleJourneyChapters}
            locations={verifiedParkvilleLocations}
            onExpandedChange={handleLocationDetailChange}
          />
        )}

        {!verificationMode && (
          <article
            id="parkville-journey-panel"
            className={`journey-chapter is-${narrativePanelSide}`}
            aria-live="polite"
            aria-hidden={!narrativeVisible}
            data-visible={narrativeVisible}
            style={{ opacity: narrativeOpacity }}
          >
            <p className="journey-chapter-kicker">
              <span>
                {String(activeChapter.chapter).padStart(2, '0')} /{' '}
                {String(parkvilleJourneyChapters.length).padStart(2, '0')}
              </span>
              {activeNarrative.eyebrow}
            </p>
            <h1>{activeChapter.title}</h1>
            <p className="journey-chapter-intro">{activeNarrative.intro}</p>

            <div className="journey-chapter-evidence">
              <p className="journey-chapter-example">
                A closer look <span>{activeLocation.name}</span>
              </p>
              <strong>{activeLocation.category}</strong>
              <p>{activeNarrative.insight}</p>
              <cite>
                {coverageLabel(activeLocation.coverage)} &middot;{' '}
                {activeLocation.source}
              </cite>
            </div>

            <footer className="journey-chapter-footer">
              <div className="journey-progress-meta">
                <span>{activeChapter.theme}</span>
                <span>{Math.round(journeyProgress * 100)}% complete</span>
              </div>
              <div
                className="journey-progress"
                role="progressbar"
                aria-label="Parkville journey progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(journeyProgress * 100)}
              >
                <i style={{ width: `${journeyProgress * 100}%` }} />
              </div>
            </footer>
          </article>
        )}

        <BrandHeader
          activePage="insight"
          onHome={onHome}
          onInsight={onInsight ?? (() => goToJourneyChapter(0))}
          onMap={onMap}
          onSimulation={onSimulation}
          onHealth={onHealth}
          leadingAction={(
            <button
              type="button"
              className={`verification-toggle ${verificationMode ? 'is-active' : ''}`}
              aria-label={verificationMode ? 'Close data verification' : 'Verify journey data'}
              aria-pressed={verificationMode}
              aria-controls="location-verification-panel"
              onClick={toggleVerificationMode}
            >
              <span className="verification-toggle-dot" aria-hidden="true" />
              <span className="verification-toggle-label">
                {verificationMode ? 'Close verification' : 'Verify data'}
              </span>
            </button>
          )}
        />

        {!verificationMode && (
          <nav className="cesium-journey-nav" aria-label="Journey chapters">
            {parkvilleJourneyChapters.map((chapter, chapterIndex) => (
              <button
                type="button"
                key={chapter.id}
                aria-label={`${chapterIndex + 1} of ${parkvilleJourneyChapters.length}: ${chapter.title}`}
                aria-current={chapterIndex === activeChapterIndex ? 'step' : undefined}
                onClick={() => goToJourneyChapter(chapterIndex)}
              >
                <span className="cesium-journey-nav-mark" aria-hidden="true" />
                <span className="cesium-journey-nav-tooltip" aria-hidden="true">
                  {String(chapterIndex + 1).padStart(2, '0')} &middot; {chapter.title}
                </span>
              </button>
            ))}
          </nav>
        )}

        {!verificationMode && (
          <div
            className="cesium-scroll-hint"
            aria-hidden="true"
            style={{ opacity: Math.max(0, 1 - journeyProgress / 0.08) }}
          >
            <span>Scroll down to explore the journey</span>
            <span className="cesium-scroll-arrow">&#8595;</span>
          </div>
        )}

        {verificationMode && (
          <aside
            id="location-verification-panel"
            className="verification-panel"
            aria-label="Parkville location verification"
          >
            <header className="verification-panel-header">
              <span>Development tool</span>
              <h2>Location verification</h2>
              <p>
                The blue ring shows the {parkvilleCoverage.radiusMetres} m local
                building and road data boundary.
              </p>
              <p>
                The continuous route is approximately{' '}
                {(parkvilleJourneyRouteLengthMetres / 1000).toFixed(1)} km.
              </p>
            </header>

            <div className="verification-legend" aria-label="Verification legend">
              <span><i className="is-verified" /> Verified source</span>
              <span><i className="is-approximate" /> Approximate stop</span>
            </div>

            <section className="verification-section">
              <h3>Verified locations</h3>
              <div className="verification-location-list">
                {verifiedParkvilleLocations.map((location) => (
                  <button
                    key={location.id}
                    type="button"
                    className={location.id === selectedLocation.id ? 'is-selected' : ''}
                    onClick={() => focusLocation(location.id)}
                  >
                    <span>
                      <strong>{location.name}</strong>
                      <small>{location.category}</small>
                    </span>
                    <em className={`coverage-${location.coverage}`}>
                      {coverageLabel(location.coverage)}
                    </em>
                  </button>
                ))}
              </div>
            </section>

            <section className="verification-detail" aria-live="polite">
              <div>
                <span className="verification-status">Verified</span>
                <span>{selectedLocation.category}</span>
              </div>
              <h3>{selectedLocation.name}</h3>
              <dl>
                <div>
                  <dt>Latitude</dt>
                  <dd>{selectedLocation.latitude.toFixed(7)}</dd>
                </div>
                <div>
                  <dt>Longitude</dt>
                  <dd>{selectedLocation.longitude.toFixed(7)}</dd>
                </div>
                <div>
                  <dt>Coverage</dt>
                  <dd>{coverageLabel(selectedLocation.coverage)}</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{selectedLocation.source}</dd>
                </div>
              </dl>
            </section>

            <section className="verification-section verification-stops">
              <h3>Seven route milestones</h3>
              <ol>
                {parkvilleJourneyChapters.map((chapter, chapterIndex) => (
                  <li key={chapter.id}>
                    <button
                      type="button"
                      onClick={() => focusRouteChapter(chapterIndex)}
                    >
                      <span>{chapter.chapter}</span>
                      <div>
                        <strong>{chapter.title}</strong>
                        <small>{chapter.theme} &middot; {chapter.locations.join(', ')}</small>
                      </div>
                      <em className="is-verified">Verified</em>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </aside>
        )}

        <div className="cesium-experiment-attribution">
          City of Melbourne local data &middot; CC BY datasets and documented visual approximations
        </div>
      </div>
    </main>
  )
}
