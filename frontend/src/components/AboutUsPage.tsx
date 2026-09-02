import logo from '../assets/LogoMark.png'
import '../styles/about-us.css'

interface AboutUsPageProps {
  onBack: () => void
}

export default function AboutUsPage({ onBack }: AboutUsPageProps) {
  return (
    <section className="about-us-page" id="about-us" aria-labelledby="about-us-title">
      <button className="back-to-menu-button" type="button" onClick={onBack}>
        ← Back to Menu
      </button>
      <article className="glass about-us-panel">
        <div className="about-us-logo" aria-hidden="true">
          <img src={logo} alt="" />
        </div>

        <div className="about-us-content">
          <p className="about-us-kicker">About KinderPrint</p>
          <h2 id="about-us-title">Evidence for thoughtful local exploration.</h2>
          <p>
            KinderPrint brings together neighbourhood-level child development, social and
            environmental evidence to help users explore local conditions and identify areas
            for further investigation.
          </p>
          <p className="about-us-note">
            It supports area-level exploration and comparison only. It does not assess
            individual children or imply causal relationships.
          </p>
        </div>
      </article>
    </section>
  )
}
