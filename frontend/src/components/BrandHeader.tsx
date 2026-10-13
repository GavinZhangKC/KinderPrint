import type { ReactNode } from 'react'

import logo from '../assets/LogoMark.png'
import ThemeSwitcher from './ThemeSwitcher'

interface BrandHeaderProps {
  activePage: 'home' | 'insight' | 'map' | 'simulation' | 'health' | 'where'
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
  onHealth: () => void
  leadingAction?: ReactNode
}

// The map is the shared entry point for Child Health and Where to live.
export default function BrandHeader({ activePage, onHome, onInsight, onMap, onSimulation, leadingAction }: BrandHeaderProps) {
  const explore = activePage === 'health' || activePage === 'map' || activePage === 'where'
  return (
    <header className="glass nav-shell">
      <div className="brand-cluster">
        {leadingAction ?? null}
        <button className="brand-button" type="button" onClick={onHome} aria-label="Go to Vkinder home">
          <img src={logo} alt="" className="brand-logo" />
          <span>Vkinder</span>
        </button>
        <ThemeSwitcher />
      </div>
      <nav className="nav-links" aria-label="Primary navigation">
        <button className={activePage === 'home' ? 'active' : undefined} aria-current={activePage === 'home' ? 'page' : undefined} type="button" onClick={onHome}>Home</button>
        <button className={activePage === 'insight' ? 'active' : undefined} aria-current={activePage === 'insight' ? 'page' : undefined} type="button" onClick={onInsight}>User Journey</button>
        <button className={activePage === 'simulation' ? 'active' : undefined} aria-current={activePage === 'simulation' ? 'page' : undefined} type="button" onClick={onSimulation}>Simulation</button>
        <button className={explore ? 'active' : undefined} aria-current={explore ? 'page' : undefined} type="button" onClick={onMap}>Child Health Explore</button>
      </nav>
    </header>
  )
}
