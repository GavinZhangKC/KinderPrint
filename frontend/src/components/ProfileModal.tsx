import MetricRing from './MetricRing'
import type { Neighbourhood } from '../types/neighbourhood'

interface ProfileModalProps {
  neighbourhood: Neighbourhood
  onCompare: () => void
  onExploreData: () => void
  onClose: () => void
  onActivate: () => void
}

function display(value: number | null, suffix = '') {
  return value === null ? 'Not available' : `${value}${suffix}`
}

export default function ProfileModal({ neighbourhood, onCompare, onExploreData, onClose, onActivate }: ProfileModalProps) {
  return (
    <section className="glass profile-modal page-enter" aria-labelledby="profile-title" onPointerDown={onActivate}>
      <button className="icon-close" type="button" onClick={onClose} aria-label="Close profile">×</button>
      <h1 id="profile-title">{neighbourhood.name} Profile</h1>
      <p className="profile-subtitle">A snapshot of child development, social and environmental conditions in this neighbourhood.</p>

      <div className="profile-meta glass-subtle">
        <span>{neighbourhood.geographicUnit} · Reference period {neighbourhood.referencePeriod}</span>
        <span className="priority-inline">Priority for Investigation <strong>{neighbourhood.priority ?? 'Not available'}</strong></span>
      </div>

      <div className="profile-domain-grid">
        <article className="glass-subtle profile-domain-card child-card">
          <h2>CHILD DEVELOPMENT</h2>
          <MetricRing value={neighbourhood.childDevelopmentScore} label="Child development score" />
          <p>On track on all five AEDC domains</p>
        </article>

        <article className="glass-subtle profile-domain-card social-card">
          <h2>SOCIAL CONTEXT</h2>
          <p className="metric-label">Socioeconomic<br />disadvantage</p>
          <strong className="metric-large">{display(neighbourhood.socialDisadvantageDecile)}</strong>
          <p>National SEIFA IRSD decile</p>
        </article>

        <article className="glass-subtle profile-domain-card environment-card">
          <h2>ENVIRONMENT</h2>
          <div className="environment-row"><span>Urban heat island effect</span><strong>{display(neighbourhood.heatExposure, '°C')}</strong></div>
          <div className="environment-row"><span>Tree canopy</span><strong>{display(neighbourhood.treeCanopy, '%')}</strong></div>
          <div className="environment-row"><span>Public open space</span><strong>{display(neighbourhood.greenSpaceAccess, '%')}</strong></div>
        </article>
      </div>

      <article className="glass-subtle key-insight-card">
        <h2>Early Childhood Service Context</h2>
        {neighbourhood.activeEducationCareServices === null ? (
          <p>No validated aggregate service context is available.</p>
        ) : (
          <p>
            <strong>{neighbourhood.activeEducationCareServices}</strong> active education and care services ·{' '}
            <strong>{display(neighbourhood.totalApprovedPlaces)}</strong> total approved places ·{' '}
            <strong>{neighbourhood.kindergartenServices}</strong> kindergarten services
          </p>
        )}
        <p>Accepted Open G-NAF matches only. Counts describe local service context, not accessibility, quality or capacity sufficiency.</p>
      </article>

      <article className="glass-subtle key-insight-card">
        <h2>Highlighted Factors</h2>
        {neighbourhood.highlightedFactors.length > 0 ? (
          <ul>
            {neighbourhood.highlightedFactors.map((factor) => <li key={factor}>{factor}</li>)}
          </ul>
        ) : (
          <p>No approved highlighted factors are available.</p>
        )}
      </article>

      <div className="profile-actions">
        <button className="button secondary" type="button" onClick={onCompare}>Compare Neighbourhoods</button>
        <button className="button primary" type="button" onClick={onExploreData}>Explore Detailed Data</button>
      </div>
    </section>
  )
}
