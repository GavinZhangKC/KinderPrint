import logo from '../assets/LogoMark.png'

interface BrandHeaderProps {
  onExplore: () => void
}

export default function BrandHeader({ onExplore }: BrandHeaderProps) {
  return (
    <header className="glass nav-shell">
      <button className="brand-button" type="button" onClick={onExplore} aria-label="Go to KinderPrint Explore">
        <img src={logo} alt="" className="brand-logo" />
        <span>KinderPrint</span>
      </button>
      <nav className="nav-links" aria-label="Primary navigation">
        <button className="active" type="button" onClick={onExplore}>Explore</button>
      </nav>
    </header>
  )
}
