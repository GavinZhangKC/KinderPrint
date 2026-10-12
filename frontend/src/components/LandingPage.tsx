import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import logo from '../assets/LogoMark.png'
import InfiniteImageGallery from './InfiniteImageGallery'
import '../styles/landing.css'

interface LandingPageProps {
  onInsight: () => void
  onSimulation: () => void
  onMap: () => void
  onHealth: () => void
}

interface HomeHeaderProps extends LandingPageProps {
  onHome: () => void
}

const heroVideoSources = [
  '/BackgroundVideo.mp4',
  '/BackgroundVideo2.mp4',
  '/BackgroundVideo3.mp4',
  '/BackgroundVideo4.mp4',
  '/BackgroundVideo5.mp4',
] as const

const heroVideoCrossfadeSeconds = 0.9
const heroVideoPlaybackRates = [0.9, 0.9, 0.85, 0.85, 0.85] as const

const homeThemeStripItems = [
  'Child development',
  'Locality context',
  'Heat exposure',
  'Green space',
  'Early years',
  'Greater Melbourne',
  'SA2 localities',
] as const

const homeDiscoveryPriorities = [
  'Learning and development',
  'Social and emotional wellbeing',
  'Physical development and active living',
  'Respiratory environment',
  'Heat and outdoor comfort',
  'Parks, playgrounds and nature',
  'Healthcare access',
  'Early-childhood support',
] as const

const exploreItems = [
  { id: 'insight', number: '01', label: 'Insight Journey', videoSrc: '/insight-preview.mp4' },
  { id: 'map', number: '02', label: 'Interactive Map', videoSrc: '/map-preview.mp4' },
  { id: 'about', number: '03', label: 'About Us', videoSrc: '/about-preview.mp4' },
] as const

type ExploreItemId = typeof exploreItems[number]['id']

interface ExploreMenuLinkProps {
  item: typeof exploreItems[number]
  onSelect: (id: ExploreItemId) => void
}

function ExploreMenuLink({ item, onSelect }: ExploreMenuLinkProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = item.id === 'map' ? 2 : 0.85
    video.pause()
    video.currentTime = 0
  }, [])

  const playPreview = () => {
    if (
      !window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) return
    void videoRef.current?.play().catch(() => undefined)
  }

  const resetPreviewAfterClosing = () => {
    const video = videoRef.current
    if (!video || video.closest('.home-explore-link')?.matches(':hover, :focus-visible')) return
    video.pause()
    video.currentTime = 0
  }

  return (
    <button
      className="home-explore-link"
      type="button"
      onClick={() => onSelect(item.id)}
      onMouseEnter={playPreview}
      onFocus={playPreview}
    >
      <span
        className="home-explore-row-preview"
        aria-hidden="true"
        onTransitionEnd={(event) => {
          if (event.propertyName === 'clip-path') resetPreviewAfterClosing()
        }}
      >
        <video
          ref={videoRef}
          src={item.videoSrc}
          muted
          loop
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => { event.currentTarget.currentTime = 0.1 }}
        />
        <span className="home-explore-row-veil" />
      </span>
      <span className="home-explore-number">{item.number}</span>
      <span className="home-explore-label">{item.label}</span>
      <span className="home-explore-arrow" aria-hidden="true">↗</span>
    </button>
  )
}

function HomeHeader({ onHome, onInsight, onSimulation, onMap, onHealth }: HomeHeaderProps) {
  return (
    <header className="glass home-header" data-no-ripple>
      <button className="home-brand" type="button" onClick={onHome} aria-label="Go to Vkinder home">
        <img src={logo} alt="" />
        <span>Vkinder</span>
      </button>
      <nav className="home-nav" aria-label="Primary navigation">
        <button type="button" aria-current="page" onClick={onHome}>Home</button>
        <button type="button" onClick={onInsight}>Insight Journey</button>
        <button type="button" onClick={onSimulation}>Simulation</button>
        <button type="button" onClick={onHealth}>Child Health</button>
      </nav>
      <button className="home-nav-cta" type="button" onClick={onMap}>Explore Map</button>
    </header>
  )
}

function HeroBackgroundVideo() {
  const videoARef = useRef<HTMLVideoElement>(null)
  const videoBRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const videoA = videoARef.current
    const videoB = videoBRef.current
    if (!videoA || !videoB) return

    const videos = [videoA, videoB]
    const videoSourceIndexes = new Map<HTMLVideoElement, number>([
      [videoA, 0],
      [videoB, 1],
    ])
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let activeVideoIndex = 0
    let activeSourceIndex = 0
    let isCrossfading = false
    let fadeTimer: number | undefined
    let isDisposed = false

    const configurePlayback = (video: HTMLVideoElement) => {
      const sourceIndex = videoSourceIndexes.get(video) ?? 0
      const playbackRate = heroVideoPlaybackRates[sourceIndex]
      video.muted = true
      video.defaultPlaybackRate = playbackRate
      video.playbackRate = playbackRate
    }

    const prepareVideo = (video: HTMLVideoElement, sourceIndex: number) => {
      video.pause()
      video.classList.remove('is-visible')
      videoSourceIndexes.set(video, sourceIndex)
      video.src = heroVideoSources[sourceIndex]
      video.load()
      configurePlayback(video)
    }

    const beginCrossfade = () => {
      if (isCrossfading || reducedMotion.matches || isDisposed) return

      const outgoingVideo = videos[activeVideoIndex]
      const incomingVideoIndex = activeVideoIndex === 0 ? 1 : 0
      const incomingVideo = videos[incomingVideoIndex]
      isCrossfading = true
      incomingVideo.currentTime = 0
      configurePlayback(incomingVideo)

      void incomingVideo.play().then(() => {
        if (isDisposed || reducedMotion.matches) return

        incomingVideo.classList.add('is-visible')
        outgoingVideo.classList.remove('is-visible')

        fadeTimer = window.setTimeout(() => {
          outgoingVideo.pause()
          outgoingVideo.currentTime = 0

          activeVideoIndex = incomingVideoIndex
          activeSourceIndex = (activeSourceIndex + 1) % heroVideoSources.length
          const nextSourceIndex = (activeSourceIndex + 1) % heroVideoSources.length
          prepareVideo(outgoingVideo, nextSourceIndex)
          isCrossfading = false
        }, heroVideoCrossfadeSeconds * 1000)
      }).catch(() => {
        isCrossfading = false
      })
    }

    const handlePlaybackProgress = (event: Event) => {
      const video = event.currentTarget as HTMLVideoElement
      if (video !== videos[activeVideoIndex] || !Number.isFinite(video.duration)) return

      if (video.duration - video.currentTime <= heroVideoCrossfadeSeconds) {
        beginCrossfade()
      }
    }

    const handleLoadedMetadata = (event: Event) => {
      configurePlayback(event.currentTarget as HTMLVideoElement)
    }

    const resetSequence = () => {
      if (fadeTimer !== undefined) {
        window.clearTimeout(fadeTimer)
        fadeTimer = undefined
      }

      activeVideoIndex = 0
      activeSourceIndex = 0
      isCrossfading = false
      prepareVideo(videoA, 0)
      prepareVideo(videoB, 1)
      videoA.classList.add('is-visible')

      if (!reducedMotion.matches) {
        void videoA.play().catch(() => undefined)
      }
    }

    const handleMotionPreferenceChange = () => {
      if (reducedMotion.matches) {
        videos.forEach((video) => video.pause())
        if (fadeTimer !== undefined) {
          window.clearTimeout(fadeTimer)
          fadeTimer = undefined
        }
        return
      }

      resetSequence()
    }

    videos.forEach((video) => {
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('timeupdate', handlePlaybackProgress)
      video.addEventListener('ended', beginCrossfade)
    })
    reducedMotion.addEventListener('change', handleMotionPreferenceChange)
    resetSequence()

    return () => {
      isDisposed = true
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer)
      videos.forEach((video) => {
        video.pause()
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('timeupdate', handlePlaybackProgress)
        video.removeEventListener('ended', beginCrossfade)
      })
      reducedMotion.removeEventListener('change', handleMotionPreferenceChange)
    }
  }, [])

  return (
    <div className="home-hero-story-video" aria-hidden="true">
      <video
        ref={videoARef}
        className="home-hero-story-video__media is-visible"
        src={heroVideoSources[0]}
        autoPlay
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
      />
      <video
        ref={videoBRef}
        className="home-hero-story-video__media"
        src={heroVideoSources[1]}
        autoPlay
        muted
        playsInline
        preload="auto"
        tabIndex={-1}
      />
    </div>
  )
}

function HomeThemeStrip() {
  const renderItems = (isDuplicate = false) => (
    <ul className="home-theme-strip__list" aria-hidden={isDuplicate || undefined}>
      {homeThemeStripItems.map((item) => <li key={item}>{item}</li>)}
    </ul>
  )

  return (
    <section className="home-theme-strip" aria-label="Vkinder themes">
      <div className="home-theme-strip__track">
        {renderItems()}
        {renderItems(true)}
      </div>
    </section>
  )
}

function HomeDiscoverySection() {
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null)
  const [hasEntered, setHasEntered] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) {
      setHasEntered(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setHasEntered(true)
      observer.disconnect()
    }, {
      threshold: 0.18,
      rootMargin: '0px 0px -10% 0px',
    })

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className={`home-insight home-discovery ${hasEntered ? 'is-visible' : ''}`}
      id="home-insight"
      aria-labelledby="home-discovery-title"
    >
      <div className="home-discovery-copy">
        <p className="home-section-kicker">Discovery</p>
        <h2 id="home-discovery-title">What matters most<br />for your child?</h2>
        <p>
          Not a form to fill in. A first look at the layers behind a childhood.
          Choose a focus, then enter the live Melbourne map.
        </p>
      </div>

      <div className="home-discovery-tools">
        <div className="home-discovery-priorities" role="group" aria-label="Choose an exploration focus">
          {homeDiscoveryPriorities.map((priority, index) => (
            <button
              key={priority}
              type="button"
              style={{ '--priority-index': index } as CSSProperties}
              aria-pressed={selectedPriority === priority}
              onClick={() => setSelectedPriority(selectedPriority === priority ? null : priority)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              {priority}
            </button>
          ))}
        </div>

        <div className="home-discovery-gallery-stage">
          <InfiniteImageGallery />

        </div>
      </div>
    </section>
  )
}

function HomeCompareSection({ onMap }: Pick<LandingPageProps, 'onMap'>) {
  const [hasEntered, setHasEntered] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) {
      setHasEntered(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setHasEntered(true)
      observer.disconnect()
    }, {
      threshold: 0.18,
      rootMargin: '0px 0px -10% 0px',
    })

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className={`home-compare-story ${hasEntered ? 'is-visible' : ''}`}
      aria-labelledby="home-compare-title"
    >
      <div className="home-compare-copy">
        <p className="home-section-kicker">Compare</p>
        <h2 id="home-compare-title">Two prints,<br />side by side.</h2>
        <p>
          Compare localities layer by layer. Never ranked, never reduced to a single score,
          and always with evidence status attached.
        </p>
        <button type="button" onClick={onMap}>
          Open the comparison studio <span aria-hidden="true">↗</span>
        </button>
      </div>

      <div className="home-compare-lines" aria-hidden="true">
        <span>Child development</span><i />
        <span>Environment</span><i />
        <span>Early years</span><i />
      </div>
    </section>
  )
}

function HomeSimulationSection({ onSimulation }: Pick<LandingPageProps, 'onSimulation'>) {
  const [hasEntered, setHasEntered] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) {
      setHasEntered(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setHasEntered(true)
      observer.disconnect()
    }, {
      threshold: 0.18,
      rootMargin: '0px 0px -10% 0px',
    })

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  const scenarioInputs = [
    'Tree canopy',
    'Urban heat',
    'Open space',
    'Road traffic intensity',
    'Bushfire-prone land share',
  ]

  return (
    <section
      ref={sectionRef}
      className={`home-simulation-story ${hasEntered ? 'is-visible' : ''}`}
      id="home-simulation"
      aria-labelledby="home-simulation-title"
    >
      <div className="home-simulation-copy">
        <p className="home-section-kicker">Simulation Engine</p>
        <h2 id="home-simulation-title">Change the conditions.<br />Explore the pattern.</h2>
        <p>
          Adjust environmental conditions and compare area-level child-development patterns.
          Explore how a scenario changes the picture, with the evidence and its limits kept visible.
        </p>
        <button type="button" onClick={onSimulation}>
          Open the Simulation Engine <span aria-hidden="true">↗</span>
        </button>
      </div>

      <div className="home-simulation-model" role="group" aria-label="Simulation model inputs">
        <div className="home-simulation-model-heading">
          <span>Scenario inputs</span>
          <span>01 / 05</span>
        </div>
        <ul>
          {scenarioInputs.map((input, index) => (
            <li key={input} style={{ '--input-index': index } as CSSProperties}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{input}</strong>
              <i aria-hidden="true" />
            </li>
          ))}
        </ul>
        <p>Area-level associations, not individual predictions.</p>
      </div>
    </section>
  )
}

const homeEvidencePrinciples = [
  'Aggregate, never individual',
  'Description, not diagnosis',
  'Difference, not deficiency',
  'No “best suburb” list',
] as const

function HomeEvidenceSection() {
  const [hasEntered, setHasEntered] = useState(false)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) {
      setHasEntered(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setHasEntered(true)
      observer.disconnect()
    }, {
      threshold: 0.18,
      rootMargin: '0px 0px -10% 0px',
    })

    observer.observe(section)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      ref={sectionRef}
      className={`home-about home-evidence ${hasEntered ? 'is-visible' : ''}`}
      id="home-about"
      aria-labelledby="home-evidence-title"
    >
      <div className="home-evidence-copy">
        <p className="home-section-kicker">Scientific transparency</p>
        <h2 id="home-evidence-title">
          What this<br />evidence is,<br />and what it is<br />not.
        </h2>
        <p>
          Vkinder supports serious exploration by making the boundary of every layer visible.
        </p>
      </div>

      <ul className="home-evidence-principles">
        {homeEvidencePrinciples.map((principle, index) => (
          <li
            key={principle}
            style={{ '--evidence-index': index } as CSSProperties}
          >
            <span aria-hidden="true" />
            <strong>{principle}</strong>
          </li>
        ))}
      </ul>
    </section>
  )
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function LandingPage({ onInsight, onSimulation, onMap, onHealth }: LandingPageProps) {
  const openExploreItem = (id: ExploreItemId) => {
    if (id === 'insight') onInsight()
    else if (id === 'map') onMap()
    else scrollToSection('home-about')
  }

  return (
    <div className="landing-page home-page" id="home" data-ripple-surface>
      <HomeHeader
        onHome={() => scrollToSection('home-hero')}
        onInsight={onInsight}
        onSimulation={onSimulation}
        onMap={onMap}
        onHealth={onHealth}
      />

      <main className="home-content">
        <section className="home-hero" id="home-hero" aria-labelledby="landing-title">
          <HeroBackgroundVideo />
          <div className="home-hero-copy">
            <h1 id="landing-title">Where Children<br />Growth<br />Matter<span aria-hidden="true">.</span></h1>
            <p className="landing-subheading">
              Explore how child development, environment and<br />health-support conditions differ across Melbourne.
            </p>
            <p className="landing-copy">
              Peel back the layers of a place, from heat and nature<br />to early-years support and observed development patterns.
            </p>
            <div className="home-hero-actions">
              <button className="button primary home-hero-button" type="button" onClick={onMap}>
                Explore Melbourne <span aria-hidden="true">↗</span>
              </button>
              <button className="button secondary home-hero-secondary" type="button" onClick={onHealth}>
                Explore child health <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </section>

        <HomeThemeStrip />

        <HomeDiscoverySection />

        <HomeCompareSection onMap={onMap} />

        <HomeSimulationSection onSimulation={onSimulation} />

        <HomeEvidenceSection />

        <section
          className="home-explore"
          id="home-explore"
          aria-labelledby="home-explore-title"
        >
          <p className="home-section-kicker">Continue exploring</p>
          <h2 id="home-explore-title">Explore Vkinder</h2>

          <nav className="home-explore-nav" aria-label="Explore Vkinder">
            {exploreItems.map((item) => (
              <ExploreMenuLink
                key={item.id}
                item={item}
                onSelect={openExploreItem}
              />
            ))}
          </nav>
        </section>
      </main>
    </div>
  )
}
