import { useEffect, useRef } from 'react'
import { indicatorStatusLabel } from '../services/profileAdapter'
import type { IndicatorProvenance, Neighbourhood } from '../types/neighbourhood'
import ActiveLivingSection from './detailed-data/ActiveLivingSection'
import EarlyChildhoodServicesSection from './detailed-data/EarlyChildhoodServicesSection'
import EvidenceSection from './detailed-data/EvidenceSection'
import IndustrialContextSection from './detailed-data/IndustrialContextSection'
import PopulationOutlookSection from './detailed-data/PopulationOutlookSection'
import TrafficContextSection from './detailed-data/TrafficContextSection'

interface DetailedDataDrawerProps {
  neighbourhood: Neighbourhood
  onClose: () => void
  isActive: boolean
  onActivate: () => void
}

function display(value: number | null, suffix = '') {
  return value === null ? 'Not available' : `${value}${suffix}`
}

function IndicatorProvenanceDetails({ details }: { details?: IndicatorProvenance }) {
  if (!details) return null

  return (
    <EvidenceSection
      items={[
        { label: 'Source', value: details.source },
        { label: 'Reference year', value: details.referenceYear },
        { label: 'Geographic unit', value: details.geographicUnit },
        { label: 'Data status', value: details.status ? indicatorStatusLabel(details.status) : null },
        { label: 'Data quality', value: details.dataQuality },
      ]}
      limitations={details.limitations}
      notices={details.notices}
    />
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
          <h3>Social Context</h3>
          <div className="drawer-metric"><span>SEIFA IRSD national decile</span><strong>{display(neighbourhood.socialDisadvantageDecile)}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.seifa_irsd_decile} /></div>
        </section>
        <section>
          <h3>Environment</h3>
          <div className="drawer-metric"><span>Urban heat island effect</span><strong>{display(neighbourhood.heatExposure, '°C')}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.env_urban_heat} /></div>
          <div className="drawer-metric"><span>Tree canopy</span><strong>{display(neighbourhood.treeCanopy, '%')}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.env_vegetation_cover} /></div>
          <div className="drawer-metric"><span>Public open space</span><strong>{display(neighbourhood.greenSpaceAccess, '%')}</strong><IndicatorProvenanceDetails details={neighbourhood.indicatorProvenance.env_open_space_access} /></div>
        </section>
        <ActiveLivingSection neighbourhood={neighbourhood} />
        <TrafficContextSection neighbourhoodId={neighbourhood.id} />
        <IndustrialContextSection neighbourhoodId={neighbourhood.id} />
        <EarlyChildhoodServicesSection neighbourhoodId={neighbourhood.id} />
        <PopulationOutlookSection neighbourhoodId={neighbourhood.id} />
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
