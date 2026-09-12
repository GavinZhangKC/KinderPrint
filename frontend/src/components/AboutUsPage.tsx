import logo from '../assets/LogoMark.png'
import BrandHeader from './BrandHeader'
import '../styles/about-us.css'

interface AboutUsPageProps {
  onHome: () => void
  onInsight: () => void
  onMap: () => void
}

export default function AboutUsPage({ onHome, onInsight, onMap }: AboutUsPageProps) {
  return (
    <section className="about-us-page" id="about-us" aria-labelledby="about-us-title">
      <BrandHeader
        activePage="about"
        onHome={onHome}
        onInsight={onInsight}
        onMap={onMap}
        onAboutUs={() => document.getElementById('about-us')?.scrollIntoView({ behavior: 'smooth' })}
      />
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
