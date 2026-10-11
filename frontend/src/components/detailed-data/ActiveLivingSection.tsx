import { indicatorStatusLabel } from '../../services/profileAdapter'
import type { IndicatorProvenance, Neighbourhood } from '../../types/neighbourhood'
import SectionEvidence from './SectionEvidence'

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
          </div>
        )
      })}
      <SectionEvidence entries={metrics.map((metric) => ({
        label: metric.label,
        provenance: neighbourhood.indicatorProvenance[metric.id],
      }))} />
    </section>
  )
}
