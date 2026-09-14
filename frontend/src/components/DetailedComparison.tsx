import type {
  ApiStatus,
  EnvironmentalDifference,
  NeighbourhoodComparison,
  OutcomeComparison,
} from '../services/api'

interface DetailedComparisonProps {
  comparisonResult: NeighbourhoodComparison
  outcomeComparison: OutcomeComparison | null
  environmentalDifference: EnvironmentalDifference | null
  limitations: string[]
  onBack: () => void
}

function displayValue(value: number | string | null, status: ApiStatus | string) {
  if ((status !== 'available' && status !== 'limited') || value === null) {
    return 'Not available'
  }

  return typeof value === 'number'
    ? new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(value)
    : value
}

export default function DetailedComparison({
  comparisonResult, outcomeComparison, environmentalDifference, limitations, onBack,
}: DetailedComparisonProps) {
  const source = comparisonResult.source_neighbourhood
  const compared = comparisonResult.comparison_neighbourhood

  return (
    <main className="comparison-page page-enter">
      <div className="comparison-heading-row">
        <div>
          <button className="text-back" type="button" onClick={onBack}>← Back to map</button>
          <h1>Detailed Comparison</h1>
          <h2>{source.name} <span>vs</span> {compared.name}</h2>
          <p>Approved side-by-side indicators returned by the KinderPrint comparison API.</p>
        </div>
        <span className="similarity-chip">{comparisonResult.match_strength ?? 'Not available'} match</span>
      </div>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">COMPARISON BASIS</span>
        <h3>Social and demographic matching measures</h3>
        {comparisonResult.similarity_basis.length > 0 ? (
          <p className="section-copy">{comparisonResult.similarity_basis.join(' · ')}</p>
        ) : (
          <p className="section-copy">No approved similarity basis is available.</p>
        )}
      </section>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">CHILD DEVELOPMENT OUTCOME</span>
        <h3>Approved AEDC matched-area comparison</h3>
        {outcomeComparison?.outcome_indicators.length ? (
          <div className="difference-grid">
            {outcomeComparison.outcome_indicators.map((indicator) => (
              <article className="glass-subtle difference-card" key={indicator.id}>
                <span>{indicator.unit}</span>
                <div>
                  <h3>{indicator.name}</h3>
                  <p>{source.name}: {displayValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status)} · {compared.name}: {displayValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status)} · Difference (first minus second): {displayValue(indicator.approved_difference.value, indicator.approved_difference.status)}</p>
                  <p>{indicator.source} · {indicator.reference_year} · aggregate area-level data</p>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="section-copy">No approved AEDC outcome comparison is available for this selected pair.</p>}
      </section>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">ENVIRONMENTAL DIFFERENCES</span>
        <h3>Harmonised matched-area indicators</h3>
        {environmentalDifference?.environmental_indicators.length ? (
          <div className="environment-comparison-grid">
            {environmentalDifference.environmental_indicators.map((indicator) => {
              const standout = environmentalDifference.approved_standout_indicator_ids.includes(indicator.id)
              return <article className="glass-subtle environmental-compare-card" key={indicator.id}>
                <h4>{indicator.name}{standout ? ' · largest standardised difference' : ''}</h4>
                <div className="compare-value-row"><span>{source.name}</span><strong>{displayValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status)} {indicator.unit}</strong></div>
                <div className="compare-value-row"><span>{compared.name}</span><strong>{displayValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status)} {indicator.unit}</strong></div>
                <p>Difference (first minus second): <strong>{displayValue(indicator.approved_difference.value, indicator.approved_difference.status)} {indicator.unit}</strong></p>
                <p>{indicator.source} · {indicator.reference_year}</p>
              </article>
            })}
          </div>
        ) : <p className="section-copy">No complete approved environmental comparison is available for this pair. Missing coverage has not been estimated.</p>}
      </section>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">SIDE-BY-SIDE INDICATORS</span>
        <h3>Approved comparison values</h3>
        {comparisonResult.side_by_side.length > 0 ? (
          <div className="environment-comparison-grid">
            {comparisonResult.side_by_side.map((field) => (
              <article className="glass-subtle environmental-compare-card" key={field.id}>
                <h4>{field.name}</h4>
                <div className="compare-value-row">
                  <span>{source.name}</span>
                  <strong>{displayValue(field.source_value, field.source_status)}</strong>
                </div>
                <div className="compare-value-row">
                  <span>{compared.name}</span>
                  <strong>{displayValue(field.comparison_value, field.comparison_status)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="section-copy">No approved side-by-side indicators are available.</p>
        )}
      </section>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">DATA LIMITATIONS</span>
        <div className="comparison-notice">
          {limitations.length > 0 ? limitations.map((message) => (
            <p key={message}>{message}</p>
          )) : <p>No comparison limitations were reported. Area-level differences still do not establish causation or describe individual children.</p>}
        </div>
      </section>
    </main>
  )
}
