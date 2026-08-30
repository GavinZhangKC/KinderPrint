import MetricRing from './MetricRing'
import StatusBadge from './StatusBadge'
import type { Neighbourhood } from '../types/neighbourhood'

interface ProfileModalProps {
  neighbourhood: Neighbourhood
  onCompare: () => void
  onExploreData: () => void
  onClose: () => void
}

export default function ProfileModal({ neighbourhood, onCompare, onExploreData, onClose }: ProfileModalProps) {
  return (
    <section className="glass profile-modal page-enter" aria-labelledby="profile-title">
      <button className="icon-close" type="button" onClick={onClose} aria-label="Close profile">×</button>
      <h1 id="profile-title">{neighbourhood.name} Profile</h1>
      <p className="profile-subtitle">A snapshot of child development, social and environmental conditions in this neighbourhood.</p>

      <div className="profile-meta glass-subtle">
        <span>{neighbourhood.geographicUnit} · Reference period {neighbourhood.referencePeriod}</span>
        <span className="priority-inline">Priority for Investigation <StatusBadge status={neighbourhood.priority === 'High' ? 'Concern' : neighbourhood.priority === 'Low' ? 'Strong' : 'Moderate'} compact /></span>
      </div>

      <div className="profile-domain-grid">
        <article className="glass-subtle profile-domain-card child-card">
          <h2>CHILD DEVELOPMENT</h2>
          <MetricRing value={neighbourhood.childDevelopmentScore} label="Child development score" />
          <StatusBadge status={neighbourhood.childDevelopmentScore >= 72 ? 'Strong' : neighbourhood.childDevelopmentScore >= 62 ? 'Moderate' : 'Concern'} />
          <p>Developmental outcomes relative to the prototype reference level</p>
        </article>

        <article className="glass-subtle profile-domain-card social-card">
          <h2>SOCIAL CONTEXT</h2>
          <p className="metric-label">Socioeconomic<br />disadvantage</p>
          <strong className="metric-large">{neighbourhood.socialDisadvantage}</strong>
          <StatusBadge status={neighbourhood.socialDisadvantage === 'High' ? 'Concern' : neighbourhood.socialDisadvantage === 'Low' ? 'Strong' : 'Moderate'} />
          <p>Relative disadvantage within the selected area</p>
        </article>

        <article className="glass-subtle profile-domain-card environment-card">
          <h2>ENVIRONMENT</h2>
          <div className="environment-row"><span>Heat exposure</span><strong>{neighbourhood.heatExposure}</strong><StatusBadge compact status={neighbourhood.heatExposure === 'High' ? 'Concern' : neighbourhood.heatExposure === 'Low' ? 'Strong' : 'Moderate'} /></div>
          <div className="environment-row"><span>Tree canopy</span><strong>{neighbourhood.treeCanopy}%</strong><StatusBadge compact status={neighbourhood.treeCanopy >= 50 ? 'Strong' : neighbourhood.treeCanopy >= 30 ? 'Moderate' : 'Concern'} /></div>
          <div className="environment-row"><span>Green-space access</span><strong>{neighbourhood.greenSpaceAccess}%</strong><StatusBadge compact status={neighbourhood.greenSpaceAccess >= 70 ? 'Strong' : neighbourhood.greenSpaceAccess >= 50 ? 'Moderate' : 'Concern'} /></div>
        </article>
      </div>

      <article className="glass-subtle key-insight-card">
        <h2>Key Insight</h2>
        <p>{neighbourhood.keyInsight}</p>
      </article>

      <div className="profile-actions">
        <button className="button secondary" type="button" onClick={onCompare}>Compare Neighbourhoods</button>
        <button className="button primary" type="button" onClick={onExploreData}>Explore Detailed Data</button>
      </div>
    </section>
  )
}
