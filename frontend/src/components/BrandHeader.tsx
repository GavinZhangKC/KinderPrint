import logo from '../assets/LogoMark.png'

interface BrandHeaderProps {
  onLogoClick: () => void
  onExplore: () => void
  onBackToMenu: () => void
}

export default function BrandHeader({ onLogoClick, onExplore, onBackToMenu }: BrandHeaderProps) {
  return (
    <header className="glass nav-shell">
      <button className="brand-button" type="button" onClick={onLogoClick} aria-label="Go to KinderPrint landing page">
        <img src={logo} alt="" className="brand-logo" />
        <span>KinderPrint</span>
      </button>
      <nav className="nav-links" aria-label="Primary navigation">
        <button className="active" type="button" onClick={onExplore}>Explore</button>
        <button type="button" onClick={onBackToMenu}>Back to Menu</button>
      </nav>
    </header>
  )
}
