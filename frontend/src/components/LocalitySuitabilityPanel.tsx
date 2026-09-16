interface LocalitySuitabilityPanelProps {
  criteria: string[]
  onToggle: (criterion: string) => void
  localities: Array<{
    id: string
    name: string
    geographic_unit: string
    score: number | null
    status: string
    criteria: string[]
  }>
  loading: boolean
  error: string | null
  notice: string | null
  onSelectLocality: (id: string, name: string) => void
}

const optionMeta: Record<string, { label: string; description: string }> = {
  child_development: { label: 'Child development', description: 'Education and developmental readiness' },
  green_space: { label: 'Green space', description: 'Parks and vegetation access' },
  low_disadvantage: { label: 'Low disadvantage', description: 'Lower social disadvantage' },
  low_heat: { label: 'Low heat', description: 'Lower heat exposure' },
  service_access: { label: 'Service access', description: 'Early-childhood service availability and catchment access' },
  future_demand: { label: 'Future demand', description: 'Projected child population pressure and future capacity needs' },
  environment_quality: { label: 'Environment quality', description: 'Air quality, exposure and healthy-environment conditions' },
}

export default function LocalitySuitabilityPanel({
  criteria,
  onToggle,
  localities,
  loading,
  error,
  notice,
  onSelectLocality,
}: LocalitySuitabilityPanelProps) {
  const activeCriteria = new Set(criteria)

  return (
    <section className="glass map-control suitability-card" aria-labelledby="suitability-title">
      <div className="suitability-header">
        <h2 id="suitability-title">Locality suitability</h2>
        <button
          type="button"
          className="suitability-help"
          aria-label="How the suitability score is calculated"
          data-tooltip="This provisional score compares aggregate area-level indicators for the selected criteria. It is an investigation aid, not an assessment of individual children or proof that one neighbourhood is better than another."
        >
          ?
        </button>
      </div>

      <div className="suitability-options" role="group" aria-label="Suitability filters">
        {Object.entries(optionMeta).map(([id, meta]) => (
          <label key={id} className="suitability-option">
            <input
              type="checkbox"
              checked={activeCriteria.has(id)}
              onChange={() => onToggle(id)}
            />
            <span>{meta.label}</span>
          </label>
        ))}
      </div>

      <div className="suitability-results" aria-live="polite">
        {loading ? (
          <p>Calculating suitable localities…</p>
        ) : error ? (
          <p className="suitability-error">{error}</p>
        ) : localities.length === 0 ? (
          <p>{criteria.length === 0 ? 'Select one or more criteria to view results.' : 'No supported results are available.'}</p>
        ) : (
          <>
            <ol>
              {localities.map((locality, index) => (
                <li key={locality.id}>
                  <button
                    type="button"
                    className="suitability-result-button"
                    onClick={() => onSelectLocality(locality.id, locality.name)}
                    aria-label={`View ${locality.name}`}
                  >
                    <span className="rank">#{index + 1}</span>
                    <span className="suitability-result-name">
                      <strong>{locality.name}</strong>
                      <small>{locality.geographic_unit}</small>
                    </span>
                    <span className="score">{locality.score === null ? 'N/A' : locality.score.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ol>
            {notice ? <p className="suitability-notice">{notice}</p> : null}
          </>
        )}
      </div>
    </section>
  )
}
