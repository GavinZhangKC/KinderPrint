import logo from '../assets/LogoMark.png'

interface BrandHeaderProps {
  activePage: 'home' | 'insight' | 'map' | 'about'
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
  onAboutUs: () => void
}

export default function BrandHeader({ activePage, onHome, onInsight, onMap, onSimulation, onAboutUs }: BrandHeaderProps) {
  return (
    <header className="glass nav-shell">
      <button className="brand-button" type="button" onClick={onHome} aria-label="Go to Vkinder home">
        <img src={logo} alt="" className="brand-logo" />
        <span>Vkinder</span>
      </button>
      <nav className="nav-links" aria-label="Primary navigation">
        <button className={activePage === 'home' ? 'active' : undefined} aria-current={activePage === 'home' ? 'page' : undefined} type="button" onClick={onHome}>Home</button>
        <button className={activePage === 'insight' ? 'active' : undefined} aria-current={activePage === 'insight' ? 'page' : undefined} type="button" onClick={onInsight}>Insight Journey</button>
        <button className={activePage === 'map' ? 'active' : undefined} aria-current={activePage === 'map' ? 'page' : undefined} type="button" onClick={onMap}>Map</button>
        <button type="button" onClick={onSimulation}>Simulation</button>
        <button className={activePage === 'about' ? 'active' : undefined} aria-current={activePage === 'about' ? 'page' : undefined} type="button" onClick={onAboutUs}>About Us</button>
      </nav>
    </header>
  )
}
