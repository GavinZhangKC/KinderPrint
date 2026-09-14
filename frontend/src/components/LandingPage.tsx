import { useEffect, useRef } from 'react'
import logo from '../assets/LogoMark.png'
import LiquidChrome from './LiquidChrome'
import '../styles/landing.css'

interface LandingPageProps {
  onInsight: () => void
  onMap: () => void
}

interface HomeHeaderProps extends LandingPageProps {
  onHome: () => void
  onAboutUs: () => void
}

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

function HomeHeader({ onHome, onInsight, onMap, onAboutUs }: HomeHeaderProps) {
  return (
    <header className="glass home-header" data-no-ripple>
      <button className="home-brand" type="button" onClick={onHome} aria-label="Go to KinderPrint home">
        <img src={logo} alt="" />
        <span>KinderPrint</span>
      </button>
      <nav className="home-nav" aria-label="Primary navigation">
        <button type="button" aria-current="page" onClick={onHome}>Home</button>
        <button type="button" onClick={onInsight}>Insight Journey</button>
        <button type="button" onClick={onMap}>Map</button>
        <button type="button" onClick={onAboutUs}>About Us</button>
      </nav>
    </header>
  )
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function LandingPage({ onInsight, onMap }: LandingPageProps) {
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
        onMap={onMap}
        onAboutUs={() => scrollToSection('home-about')}
      />

      <main className="home-content">
        <section className="home-hero" id="home-hero" aria-labelledby="landing-title">
          <LiquidChrome
            className="home-hero-liquid-chrome"
            speed={0.15}
            amplitude={0.3}
            frequencyX={2.5}
            frequencyY={1.5}
            interactive
          />
          <div className="home-hero-copy">
            <h1 id="landing-title">Discover how neighbourhoods<br />shape childhood.</h1>
            <p className="landing-subheading">
              Child development + community + environment.
            </p>
            <p className="landing-copy">
              Explore the connections between local conditions and children’s development
              through a clearer, more engaging evidence experience.
            </p>
            <div className="home-hero-actions">
              <button className="button primary home-hero-button" type="button" onClick={onMap}>
                Enter the Map <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        </section>

        <section className="home-insight" id="home-insight" aria-labelledby="home-insight-title">
          <div className="home-section-intro">
            <h2 id="home-insight-title">One neighbourhood, viewed through connected evidence.</h2>
            <p>
              KinderPrint brings environmental conditions and child development indicators into
              the same story, so patterns are easier to see and questions are easier to ask.
            </p>
          </div>

          <dl className="home-indicators" aria-label="Insight lenses">
            <div><dt>01</dt><dd>Child development</dd><dd className="home-indicator-note">AEDC outcomes</dd></div>
            <div><dt>02</dt><dd>Heat exposure</dd><dd className="home-indicator-note">Urban environment</dd></div>
            <div><dt>03</dt><dd>Green space</dd><dd className="home-indicator-note">Canopy and access</dd></div>
          </dl>

          <blockquote className="home-insight-statement">
            <span>Evidence to explore</span>
            <p>Compare child development, social context and environmental conditions without treating area-level association as causation.</p>
          </blockquote>

          <button className="button primary home-section-button" type="button" onClick={onInsight}>
            Enter the 3D Insight Journey <span aria-hidden="true">↗</span>
          </button>
        </section>

        <section className="home-about" id="home-about" aria-labelledby="home-about-title">
          <div className="home-about-mark" aria-hidden="true"><img src={logo} alt="" /></div>
          <div className="home-about-copy">
            <h2 id="home-about-title">Evidence for thoughtful local exploration.</h2>
            <p>
              KinderPrint brings together neighbourhood-level child development, social and
              environmental evidence to help users explore local conditions and identify areas
              for further investigation.
            </p>
            <p className="home-about-note">
              It supports area-level exploration and comparison only. It does not assess
              individual children or imply causal relationships.
            </p>
          </div>
        </section>

        <section
          className="home-explore"
          id="home-explore"
          aria-labelledby="home-explore-title"
        >
          <p className="home-section-kicker">Continue exploring</p>
          <h2 id="home-explore-title">Explore KinderPrint</h2>

          <nav className="home-explore-nav" aria-label="Explore KinderPrint">
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
