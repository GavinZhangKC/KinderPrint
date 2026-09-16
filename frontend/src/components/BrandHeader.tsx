import logo from '../assets/LogoMark.png'

interface BrandHeaderProps {
  activePage: 'home' | 'insight' | 'map' | 'simulation'
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
}

export default function BrandHeader({ activePage, onHome, onInsight, onMap, onSimulation }: BrandHeaderProps) {
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
        <button className={activePage === 'simulation' ? 'active' : undefined} aria-current={activePage === 'simulation' ? 'page' : undefined} type="button" onClick={onSimulation}>Simulation</button>
      </nav>
    </header>
  )
}
