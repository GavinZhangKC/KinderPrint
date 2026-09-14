import logo from '../assets/LogoMark.png'

interface BrandHeaderProps {
  activePage: 'home' | 'insight' | 'map' | 'about'
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onAboutUs: () => void
}

export default function BrandHeader({ activePage, onHome, onInsight, onMap, onAboutUs }: BrandHeaderProps) {
  return (
    <header className="glass nav-shell">
      <button className="brand-button" type="button" onClick={onHome} aria-label="Go to KinderPrint home">
        <img src={logo} alt="" className="brand-logo" />
        <span className="brand-wordmark">KinderPrint<small>Evidence platform</small></span>
      </button>
      <nav className="nav-links" aria-label="Primary navigation">
        <button className={activePage === 'home' ? 'active' : undefined} aria-current={activePage === 'home' ? 'page' : undefined} type="button" onClick={onHome}>Home</button>
        <button className={activePage === 'insight' ? 'active' : undefined} aria-current={activePage === 'insight' ? 'page' : undefined} type="button" onClick={onInsight}>Evidence Journey</button>
        <button className={activePage === 'map' ? 'active' : undefined} aria-current={activePage === 'map' ? 'page' : undefined} type="button" onClick={onMap}>Explore Map</button>
        <button className={activePage === 'about' ? 'active' : undefined} aria-current={activePage === 'about' ? 'page' : undefined} type="button" onClick={onAboutUs}>About Us</button>
      </nav>
      <div className="header-data-status"><i /> Data validated</div>
    </header>
  )
}
