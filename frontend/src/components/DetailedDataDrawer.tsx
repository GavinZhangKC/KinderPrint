import { useEffect, useRef } from 'react'
import type { Neighbourhood } from '../types/neighbourhood'

interface DetailedDataDrawerProps {
  neighbourhood: Neighbourhood
  onClose: () => void
  isActive: boolean
  onActivate: () => void
}

function display(value: number | null, suffix = '') {
  return value === null ? 'Not available' : `${value}${suffix}`
}

export default function DetailedDataDrawer({ neighbourhood, onClose, isActive, onActivate }: DetailedDataDrawerProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0
    }
  }, [neighbourhood.id])

  return (
    <aside className={`glass data-drawer page-enter ${isActive ? 'is-active' : ''}`} aria-label="Detailed neighbourhood data" onPointerDown={onActivate}>
      <header className="drawer-header">
        <div className="drawer-heading">
          <span className="eyebrow">Detailed evidence</span>
          <h2>{neighbourhood.name}</h2>
          <p>On track on all five domains</p>
        </div>
        <button className="icon-close" type="button" onClick={onClose} aria-label="Close detailed data">×</button>
      </header>

      <div ref={bodyRef} className="data-drawer-scroll">
        <section>
          <h3>Child Development</h3>
          <div className="drawer-metric"><span>On track on all five domains</span><strong>{display(neighbourhood.childDevelopmentScore, '%')}</strong></div>
          <div className="drawer-metric"><span>Developmental vulnerability</span><strong>{display(neighbourhood.developmentalVulnerability, '%')}</strong></div>
        </section>
        <section>
          <h3>Social Context</h3>
          <div className="drawer-metric"><span>SEIFA IRSD national decile</span><strong>{display(neighbourhood.socialDisadvantageDecile)}</strong></div>
        </section>
        <section>
          <h3>Environment</h3>
          <div className="drawer-metric"><span>Urban heat island effect</span><strong>{display(neighbourhood.heatExposure, '°C')}</strong></div>
          <div className="drawer-metric"><span>Tree canopy</span><strong>{display(neighbourhood.treeCanopy, '%')}</strong></div>
          <div className="drawer-metric"><span>Public open space</span><strong>{display(neighbourhood.greenSpaceAccess, '%')}</strong></div>
        </section>
        <section className="drawer-info">
          <h3>Data Information</h3>
          <p>{neighbourhood.sources.join(' · ')}</p>
          <p>{neighbourhood.geographicUnit} · {neighbourhood.referencePeriod}</p>
          {neighbourhood.dataQuality && <small>{neighbourhood.dataQuality}</small>}
          {neighbourhood.limitations.map((message) => (
            <small key={message}>{message}</small>
          ))}
          {neighbourhood.notices.map((message) => (
            <small key={message}>{message}</small>
          ))}
          <small>Area-level indicators only.</small>
        </section>
      </div>
    </aside>
  )
}
