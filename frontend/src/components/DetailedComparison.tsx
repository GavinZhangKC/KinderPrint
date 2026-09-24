import type { CSSProperties } from 'react'
import type {
  ApiEnvelope, ApiStatus, ApprovedComparisonIndicator, EnvironmentalDifference,
  MultiComparisonField, MultiNeighbourhoodComparison, OutcomeComparison, PatternInsight,
} from '../services/api'
import './DetailedComparison.css'

interface DetailedComparisonProps {
  comparisonResult: MultiNeighbourhoodComparison
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
  available: 'Available', limited: 'Limited', unavailable: 'Unavailable', missing: 'Missing',
  incompatible: 'Incompatible', suppressed: 'Suppressed', no_pattern: 'No pattern',
}
const numberFormat = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 })
const isAvailable = (status: ApiStatus | string) => status === 'available' || status === 'limited'

function numericValue(value: number | string | null, status: ApiStatus | string) {
  if (!isAvailable(status) || value === null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formattedValue(value: number | string | null, status: ApiStatus | string, unit?: string | null) {
  if (!isAvailable(status) || value === null) return statusLabels[status] ?? 'Unavailable'
  const shown = typeof value === 'number' ? numberFormat.format(value) : value
  if (!unit) return String(shown)
  const normalisedUnit = unit.toLowerCase()
  if (normalisedUnit === '%' || normalisedUnit === 'percent' || normalisedUnit === 'percentage') return `${shown}%`
  if (normalisedUnit === 'count' || normalisedUnit === 'number') return String(shown)
  return `${shown} ${unit}`
}

function differenceLabel(indicator: ApprovedComparisonIndicator) {
  const difference = numericValue(indicator.approved_difference.value, indicator.approved_difference.status)
  if (difference === null) return statusLabels[indicator.approved_difference.status] ?? 'Unavailable'
  const sign = difference > 0 ? '+' : ''
  const suffix = indicator.unit === '%' ? ' pp' : indicator.unit ? ` ${indicator.unit}` : ''
  return `${sign}${numberFormat.format(difference)}${suffix}`
}

function pairPositions(a: number | null, b: number | null) {
  if (a === null || b === null) return { a: 22, b: 78 }
  const low = Math.min(a, b); const high = Math.max(a, b)
  const padding = Math.max((high - low) * .8, Math.abs(high) * .08, 1)
  const position = (value: number) => 8 + ((value - (low - padding)) / ((high + padding) - (low - padding))) * 84
  return { a: position(a), b: position(b) }
}

function provenance(indicator: ApprovedComparisonIndicator) {
  return [indicator.source, indicator.reference_year, indicator.geographic_unit]
    .filter((value) => value !== null && value !== undefined && value !== '').join(' · ')
}

function DumbbellChart({ indicators, sourceName, comparedName, showDifference = true }: {
  indicators: ApprovedComparisonIndicator[]; sourceName: string; comparedName: string; showDifference?: boolean
}) {
  return <div className="dc-dumbbell-chart">
    <div className="dc-legend"><span><i className="dc-dot dc-dot-a" />{sourceName}</span><span><i className="dc-dot dc-dot-b" />{comparedName}</span></div>
    {indicators.map((indicator) => {
      const a = numericValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status)
      const b = numericValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status)
      const positions = pairPositions(a, b)
      return <div className={`dc-dumbbell-row${showDifference ? '' : ' dc-dumbbell-no-difference'}`} key={indicator.id}>
        <div className="dc-chart-label"><strong>{indicator.name}</strong><small>{provenance(indicator)}</small></div>
        <span className="dc-value dc-value-a">{formattedValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status, indicator.unit)}</span>
        <div className="dc-dumbbell-track" aria-label={`${indicator.name} comparison`}>
          {a !== null && b !== null && <span className="dc-dumbbell-line" style={{ left: `${Math.min(positions.a, positions.b)}%`, width: `${Math.abs(positions.b - positions.a)}%` }} />}
          <span className="dc-point dc-point-a" style={{ left: `${positions.a}%` }} /><span className="dc-point dc-point-b" style={{ left: `${positions.b}%` }} />
        </div>
        <span className="dc-value dc-value-b">{formattedValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status, indicator.unit)}</span>
        {showDifference && <strong className="dc-difference">{differenceLabel(indicator)}</strong>}
      </div>
    })}
  </div>
}

function PairedColumns({ indicator, names }: { indicator: ApprovedComparisonIndicator; names: [string, string] }) {
  const a = numericValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status)
  const b = numericValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status)
  const max = Math.max(a ?? 0, b ?? 0, 1)
  return <div className="dc-column-visual">{[
    { value: a, raw: indicator.neighbourhood_a, className: 'dc-column-a' },
    { value: b, raw: indicator.neighbourhood_b, className: 'dc-column-b' },
  ].map((item, index) => <div className="dc-column-item" key={names[index]}>
    <strong>{formattedValue(item.raw.value, item.raw.status, indicator.unit)}</strong>
    <div className="dc-column-well"><i className={item.className} style={{ height: `${((item.value ?? 0) / max) * 100}%` }} /></div><span>{names[index]}</span>
  </div>)}</div>
}

function TemperatureRail({ indicator, names }: { indicator: ApprovedComparisonIndicator; names: [string, string] }) {
  const a = numericValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status)
  const b = numericValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status)
  const positions = pairPositions(a, b)
  return <div className="dc-temperature-visual">
    <div className="dc-temperature-values"><span><i className="dc-dot dc-dot-a" />{names[0]} <strong>{formattedValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status, indicator.unit)}</strong></span><span><i className="dc-dot dc-dot-b" />{names[1]} <strong>{formattedValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status, indicator.unit)}</strong></span></div>
    <div className="dc-temperature-scale"><span className="dc-temp-marker dc-temp-a" style={{ left: `${positions.a}%` }} /><span className="dc-temp-marker dc-temp-b" style={{ left: `${positions.b}%` }} /></div>
    <div className="dc-scale-labels"><span>Lower</span><span>Higher</span></div>
  </div>
}

function LollipopComparison({ indicator, names }: { indicator: ApprovedComparisonIndicator; names: [string, string] }) {
  const a = numericValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status)
  const b = numericValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status)
  const max = Math.max(a ?? 0, b ?? 0, 1)
  return <div className="dc-lollipop-visual">{[
    { name: names[0], value: a, raw: indicator.neighbourhood_a, className: 'dc-lollipop-a' },
    { name: names[1], value: b, raw: indicator.neighbourhood_b, className: 'dc-lollipop-b' },
  ].map((item) => <div className="dc-lollipop-row" key={item.name}><span>{item.name}</span><div><i className={item.className} style={{ width: `${((item.value ?? 0) / max) * 88}%` }} /></div><strong>{formattedValue(item.raw.value, item.raw.status, indicator.unit)}</strong></div>)}</div>
}

function EnvironmentVisual({ indicator, index, names }: { indicator: ApprovedComparisonIndicator; index: number; names: [string, string] }) {
  const descriptor = `${indicator.id} ${indicator.name}`.toLowerCase()
  if (/heat|temperature|thermal/.test(descriptor)) return <TemperatureRail indicator={indicator} names={names} />
  if (/canopy|tree|green|open space|park/.test(descriptor) || index === 0) return <PairedColumns indicator={indicator} names={names} />
  return <LollipopComparison indicator={indicator} names={names} />
}

function ContextVisual({ field, names, index }: { field: MultiComparisonField; names: [string, string]; index: number }) {
  const first = field.values[0]; const second = field.values[1]
  const a = first ? numericValue(first.value, first.status) : null
  const b = second ? numericValue(second.value, second.status) : null
  const max = Math.max(a ?? 0, b ?? 0, 1)
  if (index % 3 === 1) return <div className="dc-context-rings">{[first, second].map((item, itemIndex) => {
    const value = item ? numericValue(item.value, item.status) : null
    const ratio = Math.max(0, Math.min(100, ((value ?? 0) / max) * 100))
    return <div key={names[itemIndex]}><div className={`dc-ring dc-ring-${itemIndex === 0 ? 'a' : 'b'}`} style={{ '--ring-value': `${ratio * 3.6}deg` } as CSSProperties}><strong>{item ? formattedValue(item.value, item.status, field.unit) : 'Unavailable'}</strong></div><span>{names[itemIndex]}</span></div>
  })}</div>
  if (index % 3 === 2) {
    const positions = pairPositions(a, b)
    return <div className="dc-context-range"><div><span className="dc-context-marker dc-context-marker-a" style={{ left: `${positions.a}%` }} /><span className="dc-context-marker dc-context-marker-b" style={{ left: `${positions.b}%` }} /></div><p><span>{names[0]} <strong>{first ? formattedValue(first.value, first.status, field.unit) : 'Unavailable'}</strong></span><span>{names[1]} <strong>{second ? formattedValue(second.value, second.status, field.unit) : 'Unavailable'}</strong></span></p></div>
  }
  return <div className="dc-context-bars">{[first, second].map((item, itemIndex) => {
    const value = item ? numericValue(item.value, item.status) : null
    return <div key={names[itemIndex]}><span>{names[itemIndex]}</span><div><i className={itemIndex === 0 ? 'dc-bar-a' : 'dc-bar-b'} style={{ width: `${((value ?? 0) / max) * 100}%` }} /></div><strong>{item ? formattedValue(item.value, item.status, field.unit) : 'Unavailable'}</strong></div>
  })}</div>
}

function availabilityMessage(status: ApiStatus | null, error: string | null, fallback: string) {
  if (error && !/(environment variable|file path|\.json\b|backend|configured)/i.test(error)) return error
  if (status === 'limited') return 'Available with documented limitations.'
  return fallback
}

function fieldToIndicator(field: MultiComparisonField): ApprovedComparisonIndicator {
  const a = field.values[0] ?? { value: null, status: 'unavailable' }
  const b = field.values[1] ?? { value: null, status: 'unavailable' }
  return {
    id: field.id,
    name: field.name,
    unit: field.unit,
    neighbourhood_a: { value: a.value, status: a.status },
    neighbourhood_b: { value: b.value, status: b.status },
    approved_difference: { value: null, status: 'unavailable' },
    source: field.source,
    reference_year: field.reference_year,
    geographic_unit: field.geographic_unit,
  }
}

function indicatorFamily(field: MultiComparisonField) {
  const descriptor = `${field.id} ${field.name}`.toLowerCase()
  if (/aedc|develop|on track|physical health|social competence|emotional maturity|language|communication/.test(descriptor)) return 'development'
  if (/environment|vegetation|canopy|tree|green space|open space|urban heat|temperature|thermal/.test(descriptor)) return 'environment'
  return 'context'
}

export default function DetailedComparison({ comparisonResult, limitations, outcomeComparison, outcomeError, environmentalDifference, environmentalError, patternInsight, patternError, onBack }: DetailedComparisonProps) {
  const [source, compared] = comparisonResult.neighbourhoods
  const names: [string, string] = [source?.name ?? 'Locality A', compared?.name ?? 'Locality B']
  const outcomeMatches = outcomeComparison?.data?.neighbourhood_a?.id === source?.id && outcomeComparison?.data?.neighbourhood_b?.id === compared?.id
  const environmentMatches = environmentalDifference?.data?.neighbourhood_a?.id === source?.id && environmentalDifference?.data?.neighbourhood_b?.id === compared?.id
  const patternMatches = patternInsight?.data?.neighbourhood_a?.id === source?.id && patternInsight?.data?.neighbourhood_b?.id === compared?.id
  const outcomes = outcomeMatches ? outcomeComparison?.data.outcome_indicators ?? [] : []
  const environment = environmentMatches ? environmentalDifference?.data.environmental_indicators ?? [] : []
  const patterns = patternMatches ? patternInsight?.data.patterns ?? [] : []
  const generalDevelopmentFields = comparisonResult.side_by_side.filter((field) => indicatorFamily(field) === 'development')
  const generalEnvironmentFields = comparisonResult.side_by_side.filter((field) => indicatorFamily(field) === 'environment')
  const contextFields = comparisonResult.side_by_side.filter((field) => indicatorFamily(field) === 'context')
  const displayedOutcomes = outcomes.length > 0 ? outcomes : generalDevelopmentFields.map(fieldToIndicator)
  const displayedEnvironment = environment.length > 0 ? environment : generalEnvironmentFields.map(fieldToIndicator)
  const outcomeUsesApprovedDifference = outcomes.length > 0
  const summaryIndicators = [...displayedOutcomes.slice(0, 2), ...displayedEnvironment.slice(0, 2)].slice(0, 4)
  const hasComparisonBasis = comparisonResult.similarity_basis.length > 0 || comparisonResult.match_strength !== null

  return <main className="dc-dashboard page-enter">
    <aside className="dc-sidebar"><button className="dc-wordmark" type="button" onClick={onBack}>Vkinder</button><nav>
      <a className="is-active" href="#comparison-overview"><span>⌂</span>Overview</a><a href="#comparison-development"><span>▥</span>Child development</a><a href="#comparison-environment"><span>◒</span>Environment</a><a href="#comparison-context"><span>◉</span>Locality context</a><a href="#comparison-evidence"><span>▤</span>Evidence</a>
    </nav></aside>
    <div className="dc-main">
      <header className="dc-topbar"><button type="button" onClick={onBack} aria-label="Back to map">←</button><div className="dc-breadcrumb">Locality explorer <span>/</span> Detailed comparison</div><span>{names[0]} and {names[1]}</span></header>
      <section className="dc-overview" id="comparison-overview">
        <div className="dc-title-row"><div><h1>Detailed comparison</h1><p>Locality-level evidence shown side by side.</p></div><button className="dc-download" type="button" onClick={() => window.print()}>Download report</button></div>
        <div className="dc-locality-bar"><div><small>Locality A</small><strong><i className="dc-pin dc-pin-a" />{names[0]}</strong></div><span>⇄</span><div><small>Locality B</small><strong><i className="dc-pin dc-pin-b" />{names[1]}</strong></div></div>
        {summaryIndicators.length > 0 && <div className="dc-kpi-grid">{summaryIndicators.map((indicator) => <article className="dc-card dc-kpi-card" key={indicator.id}><h2>{indicator.name}</h2><div><strong className="dc-value-a">{formattedValue(indicator.neighbourhood_a.value, indicator.neighbourhood_a.status, indicator.unit)}</strong><i /><strong className="dc-value-b">{formattedValue(indicator.neighbourhood_b.value, indicator.neighbourhood_b.status, indicator.unit)}</strong></div><p><span>{names[0]}</span><span>{names[1]}</span></p></article>)}</div>}
        <div className={`dc-overview-grid${hasComparisonBasis ? '' : ' dc-overview-grid-single'}`}>{hasComparisonBasis && <article className="dc-card dc-basis-card"><h2>Comparison basis</h2><p>{comparisonResult.similarity_basis.join(' · ')}</p><dl><div><dt>Match strength</dt><dd>{comparisonResult.match_strength ?? 'Not stated'}</dd></div><div><dt>Geography</dt><dd>{source?.geographic_unit ?? 'SA2'}</dd></div></dl></article>}<article className="dc-card dc-glance-card"><div className="dc-section-heading"><div><h2>At a glance</h2><p>Selected available indicators</p></div><div className="dc-legend"><span><i className="dc-dot dc-dot-a" />{names[0]}</span><span><i className="dc-dot dc-dot-b" />{names[1]}</span></div></div>{summaryIndicators.length > 0 ? <DumbbellChart indicators={summaryIndicators} sourceName={names[0]} comparedName={names[1]} showDifference={false} /> : <p className="dc-compact-state">No comparable indicators are available for this pair.</p>}</article></div>
      </section>
      <section className="dc-report-section" id="comparison-development"><div className="dc-report-heading"><span>01</span><div><h2>Child development</h2><p>AEDC outcome domains, compared without combining them into a single score.</p></div></div><div className="dc-section-grid"><article className="dc-card dc-chart-card"><h3>Development outcomes</h3>{displayedOutcomes.length > 0 ? <DumbbellChart indicators={displayedOutcomes} sourceName={names[0]} comparedName={names[1]} showDifference={outcomeUsesApprovedDifference} /> : <p className="dc-compact-state">{availabilityMessage(outcomeComparison?.status ?? null, outcomeError, 'Child-development indicators are unavailable for this pair.')}</p>}</article><article className="dc-card dc-insight-card"><h3>How to read this</h3><p>Dots show each locality's published aggregate value. A connecting line makes the separation visible without implying causation.</p><small>Aggregate outcomes describe localities, not individual children.</small></article></div></section>
      <section className="dc-report-section" id="comparison-environment"><div className="dc-report-heading"><span>02</span><div><h2>Environment</h2><p>Each indicator uses a visual form suited to its measurement.</p></div></div>{displayedEnvironment.length > 0 ? <div className="dc-environment-grid">{displayedEnvironment.map((indicator, index) => <article className="dc-card dc-environment-card" key={indicator.id}><div className="dc-card-heading"><h3>{indicator.name}</h3>{environment.length > 0 && <strong>{differenceLabel(indicator)}</strong>}</div><EnvironmentVisual indicator={indicator} index={index} names={names} /><footer><span>{provenance(indicator)}</span><span>{environment.length > 0 ? statusLabels[indicator.approved_difference.status] ?? indicator.approved_difference.status : 'Side-by-side values'}</span></footer></article>)}</div> : <div className="dc-card dc-compact-state">{availabilityMessage(environmentalDifference?.status ?? null, environmentalError, 'Environmental indicators are unavailable for this pair.')}</div>}</section>
      <section className="dc-report-section" id="comparison-context"><div className="dc-report-heading"><span>03</span><div><h2>Locality context</h2><p>Supporting measures shown without implying cause, quality or suitability.</p></div></div>{contextFields.length > 0 ? <div className="dc-context-grid">{contextFields.map((field, index) => <article className="dc-card dc-context-card" key={field.id}><h3>{field.name}</h3><ContextVisual field={field} names={names} index={index} /><footer>{[field.source, field.reference_year, field.geographic_unit].filter(Boolean).join(' · ')}</footer></article>)}</div> : <div className="dc-card dc-compact-state">No additional locality-context indicators are available.</div>}</section>
      <section className="dc-report-section" id="comparison-evidence"><div className="dc-report-heading"><span>04</span><div><h2>Evidence</h2><p>Interpretation, provenance and limitations remain visible.</p></div></div><div className={`dc-evidence-grid${patterns.length > 0 ? '' : ' dc-evidence-grid-single'}`}>{patterns.length > 0 && <article className="dc-card"><h3>Supported patterns</h3>{patterns.map((pattern) => <details className="dc-pattern" key={pattern.id}><summary><span>{pattern.title}</span><small>{statusLabels[pattern.status] ?? pattern.status}</small></summary><p>{pattern.description}</p><div><span>Confidence <strong>{formattedValue(pattern.confidence.value, pattern.confidence.status)}</strong></span><span>Quality <strong>{formattedValue(pattern.quality.value, pattern.quality.status)}</strong></span><span>Stability <strong>{formattedValue(pattern.stability.value, pattern.stability.status)}</strong></span></div></details>)}</article>}<article className="dc-card"><h3>Limitations</h3><ul className="dc-limitations">{(limitations.length > 0 ? limitations : ['No additional comparison limitations were reported.']).map((message) => <li key={message}>{message}</li>)}</ul>{patterns.length === 0 && patternError && <p className="dc-evidence-note">Pattern analysis is not available for this locality pair; the displayed indicators remain valid for side-by-side comparison.</p>}</article></div></section>
    </div>
  </main>
}
