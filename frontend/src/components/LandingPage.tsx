import logo from '../assets/LogoMark.png'
import '../styles/landing.css'

interface LandingPageProps {
  onExplore?: () => void
}

export default function LandingPage({ onExplore }: LandingPageProps) {
  const handleExplore = () => {
    if (onExplore) {
      onExplore()
      return
    }

    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="landing-page" aria-labelledby="landing-title">
      <div className="landing-brand" aria-label="KinderPrint">
        <img src={logo} alt="" />
        <span>KinderPrint</span>
      </div>

      <div className="glass landing-panel">
        <p className="landing-kicker">Neighbourhood evidence, brought together</p>
        <h1 id="landing-title">See the bigger picture of where children grow.</h1>
        <p className="landing-copy">
          Explore child development, social, and environmental evidence across local
          communities in one clear view.
        </p>
        <button className="glass landing-button" type="button" onClick={handleExplore}>
          Explore
          <span aria-hidden="true">↓</span>
        </button>
      </div>
    </section>
  )
}
