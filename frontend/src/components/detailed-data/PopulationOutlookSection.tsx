import { useEffect, useState } from 'react'
import { api, type ApiEnvelope, type PopulationProjectionResponse } from '../../services/api'
import { indicatorStatusLabel } from '../../services/profileAdapter'
import EvidenceSection from './EvidenceSection'

function displayPopulation(value: number | null) {
  return value === null
    ? 'Not available'
    : new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(value)
}

export default function PopulationOutlookSection({ neighbourhoodId }: { neighbourhoodId: string }) {
  const [response, setResponse] = useState<ApiEnvelope<PopulationProjectionResponse> | null>(null)
  const [loading, setLoading] = useState(true)
  const supportsNativeSa2 = /^\d{9}$/.test(neighbourhoodId)

  useEffect(() => {
    const controller = new AbortController()
    setResponse(null)

    if (!supportsNativeSa2) {
      setLoading(false)
      return () => controller.abort()
    }

    setLoading(true)
    void api.getPopulationProjections(neighbourhoodId, controller.signal)
      .then(setResponse)
      .catch(() => {
        if (!controller.signal.aborted) setResponse(null)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [neighbourhoodId, supportsNativeSa2])

  const projections = [...(response?.data.projections ?? [])]
    .sort((a, b) => a.projection_year - b.projection_year)
  const canDisplay = Boolean(
    projections.length > 0 && (response?.status === 'available' || response?.status === 'limited'),
  )
  const metadataString = (key: string) => {
    const value = response?.metadata[key]
    return typeof value === 'string' && value ? value : null
  }

  return (
    <section>
      <h3>Population Outlook</h3>
      {loading && <p className="drawer-section-state">Loading population projections…</p>}
      {!loading && !canDisplay && (
        <p className="drawer-section-state">
          Population projections are currently unavailable for this locality.
        </p>
      )}
      {!loading && canDisplay && (
        <>
          <div className="population-projection-list">
            {projections.map((projection) => (
              <article className="population-projection-year" key={`${projection.projection_year}-${projection.sex}`}>
                <strong>{projection.projection_year}</strong>
                <dl>
                  <div><dt>Ages 0–4</dt><dd>{displayPopulation(projection.population_age_0_4_projected)}</dd></div>
                  <div><dt>Ages 5–9</dt><dd>{displayPopulation(projection.population_age_5_9_projected)}</dd></div>
                  <div><dt>Ages 10–14</dt><dd>{displayPopulation(projection.population_age_10_14_projected)}</dd></div>
                  <div><dt>All ages</dt><dd>{displayPopulation(projection.population_all_ages_projected)}</dd></div>
                </dl>
              </article>
            ))}
          </div>
          <div className="drawer-metric">
            <EvidenceSection
              items={[
                { label: 'Source', value: metadataString('source') },
                { label: 'Geographic unit', value: metadataString('geographic_unit') },
                { label: 'Data status', value: response ? indicatorStatusLabel(response.status) : null },
                { label: 'Value type', value: metadataString('value_type') },
                { label: 'Population group', value: projections[0]?.sex ?? null },
              ]}
              limitations={(response?.limitations ?? []).map((item) => item.message)}
              notices={(response?.notices ?? []).map((item) => item.message)}
            />
          </div>
        </>
      )}
    </section>
  )
}
