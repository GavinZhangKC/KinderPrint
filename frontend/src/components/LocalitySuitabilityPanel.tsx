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

type SuitabilityOption = {
  id: string
  label: string
  description: string
  source: string
  available: boolean
}

const optionGroups: Array<{ title: string; summary: string; options: SuitabilityOption[] }> = [
  {
    title: 'Child development',
    summary: 'Population-level AEDC results for children in their first year of school.',
    options: [
      { id: 'development_on_track', label: 'On track across all five domains', description: 'Share of assessed children developmentally on track in physical health, social competence, emotional maturity, language and cognitive skills, and communication.', source: 'AEDC, 2024', available: true },
      { id: 'lower_developmental_vulnerability', label: 'Lower developmental vulnerability', description: 'Areas with a lower share of assessed children vulnerable on one or more AEDC domains.', source: 'AEDC, 2024', available: true },
      { id: 'respiratory_health', label: 'Respiratory and lung health', description: 'Asthma and respiratory outcomes are not available at the approved SA2 reporting level.', source: 'Data unavailable', available: false },
      { id: 'other_clinical_health', label: 'Other clinical child health', description: 'Locality-level liver, neurological, eye and other clinical outcomes are not available in the approved datasets.', source: 'Data unavailable', available: false },
    ],
  },
  {
    title: 'Environment',
    summary: 'Measured characteristics of the physical environment—not inferred health effects.',
    options: [
      { id: 'tree_canopy', label: 'More tree canopy', description: 'Ranks areas using measured vegetation and canopy coverage.', source: 'Victorian environmental data', available: true },
      { id: 'public_open_space', label: 'More public open space', description: 'Ranks areas by the available public open-space indicator.', source: 'Victorian environmental data', available: true },
      { id: 'lower_urban_heat', label: 'Lower urban heat', description: 'Ranks areas with lower measured urban heat exposure.', source: 'Victorian environmental data', available: true },
      { id: 'air_quality', label: 'Local air quality', description: 'Monitoring-station observations cannot defensibly rank every SA2 locality.', source: 'Locality data unavailable', available: false },
    ],
  },
  {
    title: 'Healthcare access',
    summary: 'Clinical service filters will remain off until a legitimate locality-level directory is integrated.',
    options: [
      { id: 'paediatric_services', label: 'Paediatricians and child-health services', description: 'No approved SA2-level coverage or capacity dataset is currently integrated.', source: 'Planned', available: false },
      { id: 'specialist_services', label: 'Eye, brain and other specialist clinics', description: 'Clinic presence alone would not establish quality, availability or suitability for children.', source: 'Planned', available: false },
    ],
  },
  {
    title: 'Community context',
    summary: 'Area-level context that may help comparison but does not describe every household.',
    options: [
      { id: 'socioeconomic_resources', label: 'Greater socioeconomic resources', description: 'Uses the ABS IRSD decile. Higher scores indicate fewer area-level indicators of disadvantage—not a judgement about residents.', source: 'ABS SEIFA IRSD', available: true },
    ],
  },
]

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

      <p className="suitability-intro">Choose the evidence that matters to your comparison. Results are relative area-level matches, not medical or personal advice.</p>

      <div className="suitability-options" aria-label="Suitability filters">
        {optionGroups.map((group) => (
          <fieldset key={group.title} className="suitability-group">
            <legend>{group.title}</legend>
            <p>{group.summary}</p>
            {group.options.map((option) => (
              <label key={option.id} className={`suitability-option${option.available ? '' : ' is-unavailable'}`}>
                <input
                  type="checkbox"
                  checked={activeCriteria.has(option.id)}
                  disabled={!option.available}
                  onChange={() => onToggle(option.id)}
                />
                <span className="suitability-option-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                  <em>{option.available ? option.source : `${option.source} · unavailable`}</em>
                </span>
              </label>
            ))}
          </fieldset>
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
                    <span className="score">{locality.score === null ? 'N/A' : <>{locality.score.toFixed(0)}<small>/100</small></>}</span>
                  </button>
                </li>
              ))}
            </ol>
            {notice ? <p className="suitability-notice">{notice}</p> : null}
            <p className="suitability-score-note">Relative evidence fit for the selected indicators. It is not an overall suburb rating.</p>
          </>
        )}
      </div>
    </section>
  )
}
