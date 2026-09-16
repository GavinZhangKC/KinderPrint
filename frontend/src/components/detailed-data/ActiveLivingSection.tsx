import { indicatorStatusLabel } from '../../services/profileAdapter'
import type { IndicatorProvenance, Neighbourhood } from '../../types/neighbourhood'
import EvidenceSection from './EvidenceSection'

interface ActiveLivingMetric {
  id: string
  label: string
  value: number | null
  unit: string
}

function displayMetric(value: number | null, provenance?: IndicatorProvenance, unit = '') {
  if (value === null) {
    return indicatorStatusLabel(provenance?.status ?? 'unavailable')
  }

  return `${new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 }).format(value)}${unit}`
}

function MetricEvidence({ provenance }: { provenance?: IndicatorProvenance }) {
  if (!provenance) return null

  return (
    <EvidenceSection
      items={[
        { label: 'Source', value: provenance.source },
        { label: 'Reference year', value: provenance.referenceYear },
        { label: 'Geographic unit', value: provenance.geographicUnit },
        { label: 'Data status', value: indicatorStatusLabel(provenance.status) },
        { label: 'Data quality', value: provenance.dataQuality },
      ]}
      limitations={provenance.limitations}
      notices={provenance.notices}
    />
  )
}

export default function ActiveLivingSection({ neighbourhood }: { neighbourhood: Neighbourhood }) {
  const metrics: ActiveLivingMetric[] = [
    {
      id: 'env_open_space_access',
      label: 'Public open space',
      value: neighbourhood.greenSpaceAccess,
      unit: '%',
    },
    {
      id: 'env_vegetation_cover',
      label: 'Tree canopy cover',
      value: neighbourhood.treeCanopy,
      unit: '%',
    },
    {
      id: 'env_urban_heat',
      label: 'Urban heat island effect',
      value: neighbourhood.heatExposure,
      unit: '°C',
    },
  ]

  return (
    <section>
      <h3>Active Living</h3>
      <p className="drawer-section-intro">Local environmental conditions that may support outdoor activity.</p>
      {metrics.map((metric) => {
        const provenance = neighbourhood.indicatorProvenance[metric.id]

        return (
          <div className="drawer-metric" key={metric.id}>
            <span>{metric.label}</span>
            <strong>{displayMetric(metric.value, provenance, metric.unit)}</strong>
            <MetricEvidence provenance={provenance} />
          </div>
        )
      })}
    </section>
  )
}
