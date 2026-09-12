interface LocalitySuitabilityPanelProps {
  criteria: string[]
  onToggle: (criterion: string) => void
  localities: Array<{
    id: string
    name: string
    geographic_unit: string
    score: number
    criteria: string[]
  }>
  loading: boolean
  error: string | null
}

const optionMeta: Record<string, { label: string; description: string }> = {
  child_development: { label: 'Child development', description: 'Education and developmental readiness' },
  green_space: { label: 'Green space', description: 'Parks and vegetation access' },
  low_disadvantage: { label: 'Low disadvantage', description: 'Lower social disadvantage' },
  low_heat: { label: 'Low heat', description: 'Lower heat exposure' },
}

export default function LocalitySuitabilityPanel({
  criteria,
  onToggle,
  localities,
  loading,
  error,
}: LocalitySuitabilityPanelProps) {
  const activeCriteria = new Set(criteria)

  return (
    <section className="glass map-control suitability-card" aria-labelledby="suitability-title">
      <div className="suitability-header">
        <h2 id="suitability-title">Locality suitability</h2>
        <span
          className="suitability-help"
          aria-label="How the suitability score is calculated"
          data-tooltip="This score is a weighted average across the selected criteria. It compares areas using approved local indicators for child development, green space, disadvantage, heat and childcare access. Higher scores indicate stronger overall conditions for raising children, but it remains a relative neighbourhood indicator, not a prediction."
        >
          ?
        </span>
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
          <p>No localities match these criteria.</p>
        ) : (
          <ol>
            {localities.map((locality, index) => (
              <li key={locality.id}>
                <span className="rank">#{index + 1}</span>
                <div>
                  <strong>{locality.name}</strong>
                  <small>{locality.geographic_unit}</small>
                </div>
                <span className="score">{locality.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
