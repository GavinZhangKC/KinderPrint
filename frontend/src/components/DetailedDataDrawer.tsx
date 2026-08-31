import type { Neighbourhood } from '../types/neighbourhood'

interface DetailedDataDrawerProps {
  neighbourhood: Neighbourhood
  onClose: () => void
}

function display(value: number | null, suffix = '') {
  return value === null ? 'Not available' : `${value}${suffix}`
}

export default function DetailedDataDrawer({ neighbourhood, onClose }: DetailedDataDrawerProps) {
  return (
    <aside className="glass data-drawer page-enter" aria-label="Detailed neighbourhood data">
      <div className="data-drawer-scroll">
      <div className="drawer-header">
        <div>
          <span className="eyebrow">Detailed evidence</span>
          <h2>{neighbourhood.name}</h2>
        </div>
        <button className="icon-close" type="button" onClick={onClose} aria-label="Close detailed data">×</button>
      </div>
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
