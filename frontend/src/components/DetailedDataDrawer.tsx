import type { Neighbourhood } from '../types/neighbourhood'

interface DetailedDataDrawerProps {
  neighbourhood: Neighbourhood
  onClose: () => void
}

export default function DetailedDataDrawer({ neighbourhood, onClose }: DetailedDataDrawerProps) {
  return (
    <aside className="glass data-drawer page-enter" aria-label="Detailed neighbourhood data">
      <div className="drawer-header">
        <div>
          <span className="eyebrow">Detailed evidence</span>
          <h2>{neighbourhood.name}</h2>
        </div>
        <button className="icon-close" type="button" onClick={onClose} aria-label="Close detailed data">×</button>
      </div>
      <section>
        <h3>Child Development</h3>
        <div className="drawer-metric"><span>Development score</span><strong>{neighbourhood.childDevelopmentScore}%</strong></div>
        <div className="drawer-metric"><span>Developmental vulnerability</span><strong>{neighbourhood.developmentalVulnerability}%</strong></div>
      </section>
      <section>
        <h3>Social Context</h3>
        <div className="drawer-metric"><span>Socioeconomic disadvantage</span><strong>{neighbourhood.socialDisadvantage}</strong></div>
      </section>
      <section>
        <h3>Environment</h3>
        <div className="drawer-metric"><span>Heat exposure</span><strong>{neighbourhood.heatExposure}</strong></div>
        <div className="drawer-metric"><span>Tree canopy</span><strong>{neighbourhood.treeCanopy}%</strong></div>
        <div className="drawer-metric"><span>Green-space access</span><strong>{neighbourhood.greenSpaceAccess}%</strong></div>
      </section>
      <section className="drawer-info">
        <h3>Data Information</h3>
        <p>{neighbourhood.sources.join(' · ')}</p>
        <p>{neighbourhood.geographicUnit} · {neighbourhood.referencePeriod}</p>
        <small>Prototype interface values. Replace with approved backend outputs before submission. Area-level indicators only.</small>
      </section>
    </aside>
  )
}
