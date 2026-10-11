import { useEffect, useState } from 'react'
import { api, type ApiEnvelope, type EarlyChildhoodServices } from '../../services/api'
import { indicatorStatusLabel } from '../../services/profileAdapter'
import EvidenceSection from './EvidenceSection'

function display(value: number | null, suffix = '') {
  return value === null ? 'Not available' : `${value}${suffix}`
}

export default function EarlyChildhoodServicesSection({ neighbourhoodId }: { neighbourhoodId: string }) {
  const [response, setResponse] = useState<ApiEnvelope<EarlyChildhoodServices | null> | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    setResponse(null)
    setLoading(true)

    void api.getEarlyChildhoodServices(neighbourhoodId, controller.signal)
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
  const canDisplay = Boolean(
    data && (response?.status === 'available' || response?.status === 'limited'),
  )
  const metadataString = (key: string) => {
    const value = response?.metadata[key]
    return typeof value === 'string' && value ? value : null
  }

  return (
    <section>
      <h3>Early Childhood Services</h3>
      {loading && <p className="drawer-section-state">Loading service information…</p>}
      {!loading && !canDisplay && (
        <p className="drawer-section-state">
          {response?.status === 'missing'
            ? 'Early childhood service information is not available for this locality.'
            : 'Early childhood service information is currently unavailable.'}
        </p>
      )}
      {!loading && canDisplay && data && (
        <>
          <div className="drawer-metric"><span>Active education and care services</span><strong>{display(data.active_education_care_services)}</strong></div>
          <div className="drawer-metric"><span>Long day care services</span><strong>{display(data.long_day_care_services)}</strong></div>
          <div className="drawer-metric"><span>Kindergarten services</span><strong>{display(data.kindergarten_services)}</strong></div>
          <div className="drawer-metric"><span>Services with approved places</span><strong>{display(data.services_with_approved_places)}</strong></div>
          <div className="drawer-metric"><span>Total approved places</span><strong>{display(data.total_approved_places)}</strong></div>
          <div className="drawer-metric"><span>Services with a current rating</span><strong>{display(data.services_with_current_rating)}</strong></div>
          <div className="drawer-metric"><span>Rating coverage</span><strong>{display(data.rating_coverage_pct, '%')}</strong></div>
          <div className="drawer-metric">
            <EvidenceSection
              items={[
                { label: 'Source', value: metadataString('source') },
                { label: 'Geographic unit', value: metadataString('geographic_unit') },
                { label: 'Data status', value: response ? indicatorStatusLabel(response.status) : null },
                { label: 'Match policy', value: metadataString('match_policy') },
                { label: 'Exact service matches', value: display(data.exact_match_services) },
                { label: 'High-confidence matches', value: display(data.high_confidence_match_services) },
              ]}
              limitations={(response?.limitations ?? []).map((item) => item.message)}
              notices={[
                metadataString('interpretation') ?? '',
                ...(response?.notices ?? []).map((item) => item.message),
              ]}
            />
          </div>
        </>
      )}
    </section>
  )
}
