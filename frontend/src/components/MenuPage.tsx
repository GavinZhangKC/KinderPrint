import '../styles/menu.css'

interface MenuPageProps {
  onInsight?: () => void
  onMap?: () => void
  onAboutUs?: () => void
}

export default function MenuPage({ onInsight, onMap, onAboutUs }: MenuPageProps) {
  return (
    <section className="menu-page" id="menu" aria-labelledby="menu-title">
      <div className="menu-intro">
        <p>Explore KinderPrint</p>
        <h2 id="menu-title">Choose where to begin.</h2>
      </div>

      <nav className="menu-links" aria-label="Explore sections">
        <button className="menu-link menu-link-active" type="button" onClick={onInsight}>
          <span>01</span> INSIGHT
        </button>
        <button className="menu-link" type="button" onClick={onMap}>
          <span>02</span> MAP
        </button>
        <button className="menu-link" type="button" onClick={onAboutUs}>
          <span>03</span> ABOUT US
        </button>
      </nav>

      <div className="menu-visual" aria-hidden="true">
        <div className="menu-orb menu-orb-large" />
        <div className="menu-orb menu-orb-small" />
        <div className="glass menu-visual-card">
          <span>INSIGHT</span>
          <strong>Local evidence, clearly connected.</strong>
        </div>
      </div>
    </section>
  )
}
