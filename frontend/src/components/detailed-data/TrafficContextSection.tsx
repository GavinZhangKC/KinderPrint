import { useEffect, useState } from 'react'
import { api, type ApiEnvelope, type ContextMetricDefinition, type NeighbourhoodContext } from '../../services/api'
import { indicatorStatusLabel } from '../../services/profileAdapter'
import EvidenceSection from './EvidenceSection'

function displayMetric(value: number | null, status: string, unit?: string) {
  if (value === null || (status !== 'available' && status !== 'limited')) {
    return indicatorStatusLabel(status)
  }

  const formatted = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 4 }).format(value)
  if (unit === 'percent') return `${formatted}%`
  if (unit === 'km') return `${formatted} km`
  if (unit === 'vehicles_per_day') return `${formatted} vehicles/day`
  return unit && unit !== 'count' ? `${formatted} ${unit}` : formatted
}

export default function TrafficContextSection({ neighbourhoodId }: { neighbourhoodId: string }) {
  const [response, setResponse] = useState<ApiEnvelope<NeighbourhoodContext | null> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setResponse(null)
    setLoading(true)

    void api.getTrafficContext(neighbourhoodId, controller.signal)
      .then(setResponse)
      .catch(() => {
        if (!controller.signal.aborted) setResponse(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [neighbourhoodId])

  const data = response?.data
  const metrics = data ? Object.entries(data.metrics) : []
  const canDisplay = Boolean(
    metrics.length > 0 && (response?.status === 'available' || response?.status === 'limited'),
  )
  const definitions = (response?.metadata.metric_definitions ?? {}) as Record<string, ContextMetricDefinition>
  const metadataString = (key: string) => {
    const value = response?.metadata[key]
    return typeof value === 'string' && value ? value : null
  }

  return (
    <section>
      <h3>Traffic Context</h3>
      {loading && <p className="drawer-section-state">Loading traffic context…</p>}
      {!loading && !canDisplay && (
        <p className="drawer-section-state">Traffic context is currently unavailable for this locality.</p>
      )}
      {!loading && canDisplay && (
        <>
          {metrics.map(([id, metric]) => {
            const definition = definitions[id]
            return (
              <div className="drawer-metric" key={id}>
                <span>{definition?.name ?? id}</span>
                <strong>{displayMetric(metric.value, metric.status, definition?.unit)}</strong>
              </div>
            )
          })}
          <div className="drawer-metric">
            <EvidenceSection
              items={[
                { label: 'Source', value: metadataString('source') },
                { label: 'Publisher', value: metadataString('publisher') },
                { label: 'Reference year', value: metadataString('reference_year') },
                { label: 'Geographic unit', value: metadataString('geographic_unit') },
                { label: 'Data status', value: response ? indicatorStatusLabel(response.status) : null },
                { label: 'Data quality', value: metadataString('data_quality') },
              ]}
              limitations={(response?.limitations ?? []).map((item) => item.message)}
              notices={[
                metadataString('methodology') ?? '',
                metadataString('coverage') ?? '',
                ...(response?.notices ?? []).map((item) => item.message),
              ]}
            />
          </div>
        </>
      )}
    </section>
  )
}
