import type { ReactNode } from 'react'

import logo from '../assets/LogoMark.png'
import ThemeSwitcher from './ThemeSwitcher'
import '../styles/site.css'

interface BrandHeaderProps {
  activePage: 'home' | 'insight' | 'map' | 'simulation' | 'health' | 'where' | 'about'
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
  onHealth: () => void
  leadingAction?: ReactNode
}

// One header for every page. Home is the guided tour (the old landing page now lives at /about);
// the map is the shared entry point for Child Health; Where to live has its own item.
export default function BrandHeader({ activePage, onInsight, onMap, onSimulation, leadingAction }: BrandHeaderProps) {
  const home = activePage === 'home' || activePage === 'insight'
  const explore = activePage === 'health' || activePage === 'map'
  const where = activePage === 'where'
  const item = (on: boolean) => ({ className: on ? 'active' : undefined, 'aria-current': on ? 'page' as const : undefined })
  return (
    <header className="glass nav-shell">
      <div className="brand-cluster">
        {leadingAction ?? null}
        <button className="brand-button" type="button" onClick={onInsight} aria-label="Go to Vkinder home">
          <img src={logo} alt="" className="brand-logo" />
          <span>Vkinder</span>
        </button>
        <ThemeSwitcher />
      </div>
      <nav className="nav-links" aria-label="Primary navigation">
        <button {...item(home)} type="button" onClick={onInsight}>Home</button>
        <button {...item(explore)} type="button" onClick={onMap}>Child Health Explore</button>
        <button {...item(where)} type="button" onClick={() => window.location.assign('/where-to-live')}>Where to live</button>
        <button {...item(activePage === 'simulation')} type="button" onClick={onSimulation}>Simulation</button>
      </nav>
    </header>
  )
}
