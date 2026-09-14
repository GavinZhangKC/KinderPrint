import { useEffect, useRef } from 'react'
import { indicatorStatusLabel } from '../services/profileAdapter'
import type { IndicatorProvenance, Neighbourhood } from '../types/neighbourhood'

interface DetailedDataDrawerProps {
  neighbourhood: Neighbourhood
  onClose: () => void
  isActive: boolean
  onActivate: () => void
}

function display(value: number | null, suffix = '') {
  return value === null ? 'Not available' : `${value}${suffix}`
}

function isUserFacingEvidenceMessage(message: string) {
  return !/(environment variable|file path|\.json\b|configured|configuration|backend|KINDERPRINT_)/i.test(message)
}

function IndicatorProvenanceDetails({ details }: { details?: IndicatorProvenance }) {
  if (!details) return null

  const limitations = details.limitations.filter(isUserFacingEvidenceMessage)
  const notices = details.notices.filter(isUserFacingEvidenceMessage)
  const hasEvidence = Boolean(
    details.status
    || details.source
    || details.referenceYear !== null
    || details.geographicUnit
    || details.dataQuality
    || limitations.length
    || notices.length,
  )

  if (!hasEvidence) return null

  return (
    <details className="drawer-evidence">
      <summary><span>Evidence</span></summary>
      <div className="drawer-metric-provenance">
        <dl>
          {details.source && <div><dt>Source</dt><dd>{details.source}</dd></div>}
          {details.referenceYear !== null && <div><dt>Reference year</dt><dd>{details.referenceYear}</dd></div>}
          {details.geographicUnit && <div><dt>Geographic unit</dt><dd>{details.geographicUnit}</dd></div>}
          {details.status && <div><dt>Data status</dt><dd>{indicatorStatusLabel(details.status)}</dd></div>}
          {details.dataQuality && <div><dt>Data quality</dt><dd>{details.dataQuality}</dd></div>}
        </dl>
        {limitations.map((message) => <p className="evidence-limitation" key={message}>{message}</p>)}
        {notices.map((message) => <p className="evidence-notice" key={message}>{message}</p>)}
      </div>
    </details>
  )
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
          <div className="drawer-metric"><span>On track on all five domains</span><strong>{display(neighbourhood.childDevelopmentScore, '%')}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.aedc_on_track_five} /></div>
          <div className="drawer-metric"><span>Developmental vulnerability</span><strong>{display(neighbourhood.developmentalVulnerability, '%')}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.aedc_vulnerable_one_or_more} /></div>
        </section>
        <section>
          <h3>Early Childhood Services</h3>
          <div className="drawer-metric"><span>Active education and care services</span><strong>{display(neighbourhood.activeEducationCareServices)}</strong></div>
          <div className="drawer-metric"><span>Total approved places</span><strong>{display(neighbourhood.totalApprovedPlaces)}</strong></div>
          <div className="drawer-metric"><span>Kindergarten services</span><strong>{display(neighbourhood.kindergartenServices)}</strong></div>
          <div className="drawer-metric"><span>Long day care services</span><strong>{display(neighbourhood.longDayCareServices)}</strong></div>
          <div className="drawer-metric"><span>Services with a current rating</span><strong>{display(neighbourhood.serviceRatingCoverage, '%')}</strong></div>
          <small>Accepted Open G-NAF matches only. These counts do not measure accessibility or service quality.</small>
        </section>
        <section>
          <h3>Population Outlook</h3>
          <div className="drawer-metric"><span>Projected children aged 0–14</span><strong>{display(neighbourhood.projectedChildren0To14)}</strong></div>
          <div className="drawer-metric"><span>Projection year</span><strong>{display(neighbourhood.projectionYear)}</strong></div>
          <small>Native-SA2 VIF projection. Combined reporting localities remain unavailable rather than being estimated.</small>
        </section>
        <section>
          <h3>Transport and Industry Context</h3>
          <div className="drawer-metric"><span>Length-weighted daily traffic</span><strong>{display(neighbourhood.lengthWeightedTraffic)}</strong></div>
          <div className="drawer-metric"><span>High-traffic declared-road share</span><strong>{display(neighbourhood.highTrafficRoadShare, '%')}</strong></div>
          <div className="drawer-metric"><span>NPI reporting facilities</span><strong>{display(neighbourhood.npiFacilities)}</strong></div>
          <div className="drawer-metric"><span>Nearest NPI facility</span><strong>{display(neighbourhood.nearestNpiFacilityKm, ' km')}</strong></div>
          <small>Context only: these values are not personal exposure, ambient air quality or health-risk measures.</small>
        </section>
        <section>
          <h3>Social Context</h3>
          <div className="drawer-metric"><span>SEIFA IRSD national decile</span><strong>{display(neighbourhood.socialDisadvantageDecile)}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.seifa_irsd_decile} /></div>
        </section>
        <section>
          <h3>Environment</h3>
          <div className="drawer-metric"><span>Urban heat island effect</span><strong>{display(neighbourhood.heatExposure, '°C')}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.env_urban_heat} /></div>
          <div className="drawer-metric"><span>Tree canopy</span><strong>{display(neighbourhood.treeCanopy, '%')}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.env_vegetation_cover} /></div>
          <div className="drawer-metric"><span>Public open space</span><strong>{display(neighbourhood.greenSpaceAccess, '%')}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.env_open_space_access} /></div>
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
