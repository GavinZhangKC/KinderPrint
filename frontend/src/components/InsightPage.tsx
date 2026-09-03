import logo from '../assets/LogoMark.png'
import '../styles/about-us.css'

interface InsightPageProps {
  onBack: () => void
}

export default function InsightPage({ onBack }: InsightPageProps) {
  return (
    <section className="about-us-page" aria-labelledby="insight-title">
      <button className="back-to-menu-button" type="button" onClick={onBack}>
        ← Back to Menu
      </button>

      <article className="glass about-us-panel">
        <div className="about-us-logo" aria-hidden="true">
          <img src={logo} alt="" />
        </div>

        <div className="about-us-content">
          <p className="about-us-kicker">KinderPrint Insight</p>
          <h2 id="insight-title">Understand neighbourhood evidence at a glance.</h2>
          <p>
            Explore the child development, social and environmental factors available for
            each neighbourhood.
          </p>
          <p className="about-us-note">
            These insights support local exploration and further investigation using
            area-level information.
          </p>
        </div>
      </article>
    </section>
  )
}
