import type {
  ApiEnvelope,
  ApiStatus,
  ApprovedComparisonIndicator,
  EnvironmentalDifference,
  NeighbourhoodComparison,
  OutcomeComparison,
  PatternInsight,
  PatternInsightItem,
} from '../services/api'

interface DetailedComparisonProps {
  comparisonResult: NeighbourhoodComparison
  limitations: string[]
  outcomeComparison: ApiEnvelope<OutcomeComparison> | null
  outcomeError: string | null
  environmentalDifference: ApiEnvelope<EnvironmentalDifference> | null
  environmentalError: string | null
  patternInsight: ApiEnvelope<PatternInsight> | null
  patternError: string | null
  onBack: () => void
}

const statusLabels: Record<string, string> = {
  available: 'Available',
  limited: 'Limited data',
  unavailable: 'Unavailable',
  missing: 'Data missing',
  incompatible: 'Incompatible',
  no_pattern: 'No pattern',
}

function displayValue(value: number | string | null, status: ApiStatus | string) {
  if ((status !== 'available' && status !== 'limited') || value === null) {
    return statusLabels[status] ?? 'Not available'
  }

  return typeof value === 'number'
    ? new Intl.NumberFormat('en-AU', { maximumFractionDigits: 2 }).format(value)
    : value
}

function displayComparisonValue(
  value: number | string | null,
  status: ApiStatus | string,
  unit: string | null,
) {
  const displayed = displayValue(value, status)
  if (value === null || (status !== 'available' && status !== 'limited') || !unit) {
    return displayed
  }

  return unit === '%' ? `${displayed}%` : `${displayed} ${unit}`
}

interface ApprovedComparisonSectionProps {
  eyebrow: string
  title: string
  sourceName: string
  comparedName: string
  status: ApiStatus | null
  indicators: ApprovedComparisonIndicator[]
  limitations: string[]
  unavailableMessage: string | null
  standoutIds?: string[]
}

function ApprovedComparisonSection({
  eyebrow,
  title,
  sourceName,
  comparedName,
  status,
  indicators,
  limitations,
  unavailableMessage,
  standoutIds = [],
}: ApprovedComparisonSectionProps) {
  const standoutIndicatorIds = new Set(standoutIds)
  const canRenderIndicators = (status === 'available' || status === 'limited') && indicators.length > 0
  const stateMessage = unavailableMessage ?? (
    status === 'missing'
      ? 'Approved comparison data is missing.'
      : status === 'incompatible'
        ? 'These localities are incompatible for this comparison.'
        : 'Approved comparison data is currently unavailable.'
  )

  return (
    <section className="glass comparison-section reveal-section">
      <span className="eyebrow">{eyebrow}</span>
      <h3>{title}</h3>

      {canRenderIndicators ? (
        <div className="environment-comparison-grid">
          {indicators.map((indicator) => (
            <article
              className={`glass-subtle environmental-compare-card approved-comparison-card${standoutIndicatorIds.has(indicator.id) ? ' is-standout' : ''}`}
              key={indicator.id}
            >
              <h4>{indicator.name}</h4>
              <div className="compare-value-row">
                <span className="comparison-value-label">
                  {sourceName}
                  <small>{statusLabels[indicator.neighbourhood_a.status] ?? indicator.neighbourhood_a.status}</small>
                </span>
                <strong>{displayComparisonValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status, indicator.unit)}</strong>
              </div>
              <div className="compare-value-row">
                <span className="comparison-value-label">
                  {comparedName}
                  <small>{statusLabels[indicator.neighbourhood_b.status] ?? indicator.neighbourhood_b.status}</small>
                </span>
                <strong>{displayComparisonValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status, indicator.unit)}</strong>
              </div>
              <div className="compare-value-row approved-difference-row">
                <span className="comparison-value-label">
                  Approved difference
                  <small>{statusLabels[indicator.approved_difference.status] ?? indicator.approved_difference.status}</small>
                </span>
                <strong>{displayComparisonValue(indicator.approved_difference.value, indicator.approved_difference.status, indicator.unit)}</strong>
              </div>
              {(indicator.source || indicator.reference_year !== null) && (
                <p className="approved-comparison-meta">
                  {[indicator.source, indicator.reference_year].filter((item) => item !== null && item !== '').join(' · ')}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="comparison-section-state">{stateMessage}</p>
      )}

      {limitations.length > 0 && (
        <div className="comparison-section-limitations">
          {limitations.map((message) => <p key={message}>{message}</p>)}
        </div>
      )}
    </section>
  )
}

function isUserFacingPatternMessage(message: string) {
  return !/(environment variable|file path|\.json\b|configured|configuration|backend|KINDERPRINT_)/i.test(message)
}

function displayAssessmentValue(value: number | string | null, status: ApiStatus | string) {
  if (value === null || (status !== 'available' && status !== 'limited')) {
    return statusLabels[status] ?? 'Not available'
  }

  return String(value)
}

function SupportingEvidenceGroup({
  title,
  indicatorIds,
  indicators,
  sourceName,
  comparedName,
}: {
  title: string
  indicatorIds: string[]
  indicators: ApprovedComparisonIndicator[]
  sourceName: string
  comparedName: string
}) {
  if (indicatorIds.length === 0) return null

  const indicatorById = new Map(indicators.map((indicator) => [indicator.id, indicator]))

  return (
    <div className="pattern-evidence-group">
      <h5>{title}</h5>
      <ul>
        {indicatorIds.map((id) => {
          const indicator = indicatorById.get(id)
          return (
            <li key={id}>
              <strong>{indicator?.name ?? id}</strong>
              {indicator && <small>{id}</small>}
              {indicator && (
                <div className="pattern-evidence-values">
                  <span>{sourceName}: {displayComparisonValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status, indicator.unit)}</span>
                  <span>{comparedName}: {displayComparisonValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status, indicator.unit)}</span>
                  <span>Approved difference: {displayComparisonValue(indicator.approved_difference.value, indicator.approved_difference.status, indicator.unit)}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function PatternInsightSection({
  sourceName,
  comparedName,
  response,
  pairMatches,
  error,
}: {
  sourceName: string
  comparedName: string
  response: ApiEnvelope<PatternInsight> | null
  pairMatches: boolean
  error: string | null
}) {
  const status = pairMatches ? response?.status ?? null : null
  const patterns = pairMatches ? response?.data.patterns ?? [] : []
  const limitations = (response?.limitations ?? [])
    .filter((item) => !/_dataset_(not_configured|unavailable|unreadable|invalid)$/.test(item.code))
    .map((item) => item.message)
    .filter(isUserFacingPatternMessage)
  const canRenderPatterns = (status === 'available' || status === 'limited') && patterns.length > 0
  const stateMessage = error ?? (
    status === 'no_pattern'
      ? 'No supported pattern is available for this comparison.'
      : status === 'incompatible'
        ? 'These localities are incompatible for pattern insight.'
        : 'Pattern insight is currently unavailable.'
  )

  return (
    <section className="glass comparison-section reveal-section pattern-insight-section">
      <span className="eyebrow">KEY INSIGHT</span>
      <h3>Pattern Insight</h3>

      {canRenderPatterns ? (
        <div className="pattern-insight-list">
          {patterns.map((pattern: PatternInsightItem) => (
            <article className="glass-subtle pattern-insight-card" key={pattern.id}>
              <div className="pattern-insight-heading">
                <h4>{pattern.title}</h4>
                <span>{statusLabels[pattern.status] ?? pattern.status}</span>
              </div>
              <p>{pattern.description}</p>
              <dl className="pattern-assessments">
                {([
                  ['Confidence', pattern.confidence],
                  ['Quality', pattern.quality],
                  ['Stability', pattern.stability],
                ] as const).map(([label, assessment]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{displayAssessmentValue(assessment.value, assessment.status)}</dd>
                    <small>{statusLabels[assessment.status] ?? assessment.status}</small>
                  </div>
                ))}
              </dl>

              {(pattern.supporting_outcome_indicator_ids.length > 0
                || pattern.supporting_environmental_indicator_ids.length > 0) && (
                <details className="pattern-supporting-evidence">
                  <summary>View supporting evidence</summary>
                  <div className="pattern-supporting-evidence-content">
                    <SupportingEvidenceGroup
                      title="Child Development"
                      indicatorIds={pattern.supporting_outcome_indicator_ids}
                      indicators={response?.data.supporting_outcome_indicators ?? []}
                      sourceName={sourceName}
                      comparedName={comparedName}
                    />
                    <SupportingEvidenceGroup
                      title="Environment"
                      indicatorIds={pattern.supporting_environmental_indicator_ids}
                      indicators={response?.data.supporting_environmental_indicators ?? []}
                      sourceName={sourceName}
                      comparedName={comparedName}
                    />
                  </div>
                </details>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="comparison-section-state">{stateMessage}</p>
      )}

      {limitations.length > 0 && (
        <div className="comparison-section-limitations">
          {limitations.map((message) => <p key={message}>{message}</p>)}
        </div>
      )}
    </section>
  )
}

export default function DetailedComparison({
  comparisonResult,
  limitations,
  outcomeComparison,
  outcomeError,
  environmentalDifference,
  environmentalError,
  patternInsight,
  patternError,
  onBack,
}: DetailedComparisonProps) {
  const source = comparisonResult.source_neighbourhood
  const compared = comparisonResult.comparison_neighbourhood
  const outcomePairMatches = outcomeComparison?.data?.neighbourhood_a?.id === source.id
    && outcomeComparison?.data?.neighbourhood_b?.id === compared.id
  const environmentalPairMatches = environmentalDifference?.data?.neighbourhood_a?.id === source.id
    && environmentalDifference?.data?.neighbourhood_b?.id === compared.id
  const patternPairMatches = patternInsight?.data?.neighbourhood_a?.id === source.id
    && patternInsight?.data?.neighbourhood_b?.id === compared.id

  return (
    <main className="comparison-page page-enter">
      <div className="comparison-heading-row">
        <div>
          <button className="text-back" type="button" onClick={onBack}>← Back to map</button>
          <h1>Detailed Comparison</h1>
          <h2>{source.name} <span>vs</span> {compared.name}</h2>
          <p>Approved side-by-side indicators returned by the KinderPrint comparison API.</p>
        </div>
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

      <ApprovedComparisonSection
        eyebrow="CHILD DEVELOPMENT"
        title="Outcome comparison"
        sourceName={source.name}
        comparedName={compared.name}
        status={outcomePairMatches ? outcomeComparison?.status ?? null : null}
        indicators={outcomePairMatches ? outcomeComparison?.data.outcome_indicators ?? [] : []}
        limitations={outcomeComparison?.limitations.map((item) => item.message) ?? []}
        unavailableMessage={outcomeError}
      />

      <ApprovedComparisonSection
        eyebrow="ENVIRONMENT"
        title="Environmental comparison"
        sourceName={source.name}
        comparedName={compared.name}
        status={environmentalPairMatches ? environmentalDifference?.status ?? null : null}
        indicators={environmentalPairMatches ? environmentalDifference?.data.environmental_indicators ?? [] : []}
        limitations={environmentalDifference?.limitations.map((item) => item.message) ?? []}
        unavailableMessage={environmentalError}
        standoutIds={environmentalPairMatches ? environmentalDifference?.data.approved_standout_indicator_ids ?? [] : []}
      />

      <PatternInsightSection
        sourceName={source.name}
        comparedName={compared.name}
        response={patternInsight}
        pairMatches={patternPairMatches}
        error={patternError}
      />

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
