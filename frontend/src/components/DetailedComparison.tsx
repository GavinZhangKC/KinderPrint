import type { ApiStatus, NeighbourhoodComparison } from '../services/api'

interface DetailedComparisonProps {
  comparisonResult: NeighbourhoodComparison
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

export default function DetailedComparison({ comparisonResult, limitations, onBack }: DetailedComparisonProps) {
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
          )) : <p>No comparison limitations were reported.</p>}
        </div>
      </section>
    </main>
  )
}
