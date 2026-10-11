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
  onWhere?: () => void
  leadingAction?: ReactNode
}

export default function BrandHeader({ activePage, onHome, onInsight, onMap, onSimulation, onHealth, onWhere, leadingAction }: BrandHeaderProps) {
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
        <button className={activePage === 'insight' ? 'active' : undefined} aria-current={activePage === 'insight' ? 'page' : undefined} type="button" onClick={onInsight}>Insight Journey</button>
        <button className={activePage === 'map' ? 'active' : undefined} aria-current={activePage === 'map' ? 'page' : undefined} type="button" onClick={onMap}>Map</button>
        <button className={activePage === 'simulation' ? 'active' : undefined} aria-current={activePage === 'simulation' ? 'page' : undefined} type="button" onClick={onSimulation}>Simulation</button>
        <button className={activePage === 'health' ? 'active' : undefined} aria-current={activePage === 'health' ? 'page' : undefined} type="button" onClick={onHealth}>Child Health</button>
        <button className={activePage === 'where' ? 'active' : undefined} aria-current={activePage === 'where' ? 'page' : undefined} type="button" onClick={onWhere ?? (() => window.location.assign('/where-to-live'))}>Where to live</button>
      </nav>
    </header>
  )
}
