import logo from '../assets/LogoMark.png'
import LiquidChrome from './LiquidChrome'
import AmbientStoryVideo from './AmbientStoryVideo'
import TemplateHomeSections from './TemplateHomeSections'
import '../styles/landing.css'
import '../styles/emergent-typography-scale.css'

interface LandingPageProps {
  onInsight: () => void
  onMap: () => void
}

interface HomeHeaderProps extends LandingPageProps {
  onHome: () => void
  onAboutUs: () => void
}

function HomeHeader({ onHome, onInsight, onMap, onAboutUs }: HomeHeaderProps) {
  return (
    <header className="glass home-header" data-no-ripple>
      <button className="home-brand" type="button" onClick={onHome} aria-label="Go to KinderPrint home">
        <img src={logo} alt="" />
        <span>KinderPrint</span>
      </button>
      <nav className="home-nav" aria-label="Primary navigation">
        <button type="button" aria-current="page" onClick={onMap}>Explore</button>
        <button type="button" onClick={onMap}>Compare</button>
        <button type="button" onClick={onInsight}>Health Pathways</button>
        <button type="button" onClick={() => scrollToSection('home-evidence')}>Evidence</button>
        <button type="button" onClick={onAboutUs}>About Us</button>
        <button className="home-nav-cta" type="button" onClick={onMap}>Explore map</button>
      </nav>
    </header>
  )
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function LandingPage({ onInsight, onMap }: LandingPageProps) {
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
          <AmbientStoryVideo
            className="home-hero-story-video"
            mp4Src="/media/hero-childhood-place.mp4"
            posterSrc="/media/hero-childhood-place-poster.png"
            position="center center"
          />
          <div className="home-hero-copy">
            <p className="landing-kicker">Child health · environment · place</p>
            <h1 id="landing-title">Where Children<br />Growth<br />Matter<span aria-hidden="true">.</span></h1>
            <p className="landing-subheading">
              Explore how child development, environment and health-support conditions differ across Melbourne.
            </p>
            <p className="landing-copy">
              Peel back the layers of a place—from heat and nature to early-years support and observed development patterns.
            </p>
            <div className="home-hero-actions">
              <button className="button primary home-hero-button" type="button" onClick={onMap}>
                Explore Melbourne <span aria-hidden="true">↗</span>
              </button>
              <button className="button secondary home-hero-secondary" type="button" onClick={onInsight}>
                See how KinderPrint works
              </button>
            </div>
            <p className="home-hero-trust">Locality-level evidence for exploration and comparison—not individual assessment or causal advice.</p>
          </div>
        </section>
        <TemplateHomeSections onInsight={onInsight} onMap={onMap} />
      </main>
    </div>
  )
}
