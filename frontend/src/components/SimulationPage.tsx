import { useState } from 'react'

import logo from '../assets/LogoMark.png'
import { useNeighbourhoodSearch } from '../hooks/useNeighbourhoodSearch'
import { api } from '../services/api'
import { toNeighbourhood } from '../services/profileAdapter'

interface SimulationPageProps {
  onLogoClick: () => void
  onBackToMenu: () => void
  onExploreMap: () => void
}

interface SimulationBaseline {
  id: string
  name: string
  treeCanopy: number
  openSpace: number
  heatExposure: number
  vulnerability: number
  childDevelopment: number
  serviceAccess: number
  futureDemand: number
  environmentQuality: number
  trafficPressure: number
  industrialPressure: number
}

interface ScenarioValues {
  treeCanopy: number
  openSpace: number
  heat: number
}

interface ScenarioResult {
  heatExposure: string
  heatDirection: string
  vulnerabilityDirection: string
  treeCanopy: number
  baselineTreeCanopy: number
  vulnerability: number
  baselineVulnerability: number
  developmentScore: number
  baselineDevelopmentScore: number
  developmentDirection: string
  projectedChange: string
  projectedDevelopmentChange: string
  modelContext: string
  insight: string
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

type ComparisonMetric = {
  id: 'heat' | 'treeCanopy' | 'openSpace' | 'vulnerability'
  label: string
  unit: string
  baseline: number
  simulated: number
  max: number
  lowerIsBetter: boolean
}

function formatMetricValue(value: number, unit: string) {
  return `${value.toFixed(1)}${unit}`
}

function metricDirection(metric: ComparisonMetric) {
  const delta = metric.simulated - metric.baseline
  if (Math.abs(delta) < 0.05) {
    return { delta, label: 'No meaningful change', tone: 'neutral' as const }
  }
  const improves = metric.lowerIsBetter ? delta < 0 : delta > 0
  return {
    delta,
    label: improves ? 'Improves' : 'Worsens',
    tone: improves ? 'improves' as const : 'worsens' as const,
  }
}

function buildScenarioResult(baseline: SimulationBaseline, values: ScenarioValues): ScenarioResult {
  const treeIncrease = values.treeCanopy - baseline.treeCanopy
  const openSpaceIncrease = values.openSpace - baseline.openSpace
  const heatReduction = baseline.heatExposure - values.heat
  const vulnerabilityAdjustment = (treeIncrease * 0.25) + (openSpaceIncrease * 0.18) + (heatReduction * 2.1)
  const developmentAdjustment = (treeIncrease * 0.22) + (openSpaceIncrease * 0.16) + (heatReduction * 1.6)

  // Higher local service capacity makes built-environment gains easier to convert into outcomes,
  // while stronger projected child demand and context pressure dampen expected effect size.
  const serviceCapacityFactor = clamp(0.85 + (baseline.serviceAccess / 100) * 0.35, 0.85, 1.2)
  const demandPressureFactor = clamp(1.15 - (baseline.futureDemand / 100) * 0.35, 0.8, 1.15)
  const backgroundPressure = (baseline.trafficPressure + baseline.industrialPressure) / 2
  const pressureDampeningFactor = clamp(1.1 - (backgroundPressure / 100) * 0.35, 0.75, 1.1)
  const contextMultiplier = clamp((serviceCapacityFactor + demandPressureFactor + pressureDampeningFactor) / 3, 0.7, 1.2)

  const effectiveVulnerabilityAdjustment = vulnerabilityAdjustment > 0
    ? vulnerabilityAdjustment * contextMultiplier
    : vulnerabilityAdjustment
  const effectiveDevelopmentAdjustment = developmentAdjustment > 0
    ? developmentAdjustment * contextMultiplier
    : developmentAdjustment

  const projectedVulnerability = clamp(
    baseline.vulnerability - effectiveVulnerabilityAdjustment,
    5,
    100,
  )

  const projectedDevelopment = clamp(
    baseline.childDevelopment + effectiveDevelopmentAdjustment,
    30,
    100,
  )

  const heatExposure = values.heat <= 5 ? 'Moderate' : values.heat <= 8 ? 'High' : 'Very high'
  const heatDirection = heatReduction > 0 ? 'Improves' : 'Higher exposure'
  const vulnerabilityDirection = projectedVulnerability < baseline.vulnerability ? 'Improves' : projectedVulnerability > baseline.vulnerability ? 'Higher risk' : 'No change'
  const developmentDirection = projectedDevelopment > baseline.childDevelopment ? 'Improves' : 'Lower outlook'
  const modelContext = `Service ${baseline.serviceAccess.toFixed(1)} · Demand ${baseline.futureDemand.toFixed(1)} · Traffic ${baseline.trafficPressure.toFixed(1)} · Industrial ${baseline.industrialPressure.toFixed(1)} · Multiplier ${contextMultiplier.toFixed(2)}x`
  const insight = heatReduction > 0
    ? 'Reducing heat exposure while increasing canopy and green access produces a lower estimated vulnerability profile for this area, adjusted for local service access and projected demand pressure.'
    : 'This scenario increases heat pressure and reduces the expected benefit from buffering child-development outcomes, even after applying local service-access and demand context.'

  return {
    heatExposure,
    heatDirection,
    vulnerabilityDirection,
    treeCanopy: values.treeCanopy,
    baselineTreeCanopy: baseline.treeCanopy,
    vulnerability: Number(projectedVulnerability.toFixed(1)),
    baselineVulnerability: baseline.vulnerability,
    developmentScore: Number(projectedDevelopment.toFixed(1)),
    baselineDevelopmentScore: baseline.childDevelopment,
    developmentDirection,
    projectedChange: `${Number(baseline.vulnerability.toFixed(1))}% → ${Number(projectedVulnerability.toFixed(1))}%`,
    projectedDevelopmentChange: `${Number(baseline.childDevelopment.toFixed(1))} → ${Number(projectedDevelopment.toFixed(1))}`,
    modelContext,
    insight,
  }
}

export default function SimulationPage({
  onLogoClick,
  onBackToMenu,
  onExploreMap,
}: SimulationPageProps) {
  const [selectedNeighbourhood, setSelectedNeighbourhood] = useState('')
  const [selectedNeighbourhoodId, setSelectedNeighbourhoodId] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<SimulationBaseline | null>(null)
  const [scenarioValues, setScenarioValues] = useState<ScenarioValues>({
    treeCanopy: 35,
    openSpace: 42,
    heat: 4.8,
  })
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null)
  const [scenarioLoading, setScenarioLoading] = useState(false)

  const {
    search,
    setSearch,
    showSearchResults,
    setShowSearchResults,
    searchResults,
    searchLoading,
    handleSearchResultSelect,
    submitSearch,
  } = useNeighbourhoodSearch({
    onSelectResult: async (item) => {
      setSelectedNeighbourhood(item.name)
      setSelectedNeighbourhoodId(item.id)
      setSearch(item.name)
      await loadNeighbourhoodScenario(item.id, item.name)
    },
  })

  async function loadNeighbourhoodScenario(id: string, name: string) {
    setScenarioLoading(true)

    try {
      const [
        profileResponse,
        priorityResponse,
        explanationResponse,
        trafficResponse,
        industrialResponse,
      ] = await Promise.all([
        api.getProfile(id),
        api.getPriority(id),
        api.getExplanation(id),
        api.getTrafficContext(id),
        api.getIndustrialEmissionsContext(id),
      ])

      if (profileResponse.status !== 'available' && profileResponse.status !== 'limited') {
        throw new Error(profileResponse.limitations[0]?.message ?? 'The neighbourhood profile is unavailable.')
      }

      const neighbourhood = toNeighbourhood(
        profileResponse.data,
        priorityResponse.status === 'available' || priorityResponse.status === 'limited'
          ? priorityResponse.data
          : null,
        explanationResponse.status === 'available' || explanationResponse.status === 'limited'
          ? explanationResponse.data
          : null,
        {
          metadata: profileResponse.metadata,
          profileLimitations: profileResponse.limitations,
          profileNotices: profileResponse.notices,
          limitations: [profileResponse, priorityResponse, explanationResponse]
            .flatMap((response) => response.limitations)
            .map((item) => item.message),
          notices: [profileResponse, priorityResponse, explanationResponse]
            .flatMap((response) => response.notices)
            .map((item) => item.message)
            .filter(Boolean),
        },
        id,
        name,
      )

      const metricValue = (response: typeof trafficResponse | typeof industrialResponse, key: string): number | null => {
        if (response.status !== 'available' && response.status !== 'limited') {
          return null
        }
        const metric = response.data.metrics?.[key]
        return metric && metric.status === 'available' && typeof metric.value === 'number' && Number.isFinite(metric.value)
          ? metric.value
          : null
      }

      const average = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null

      const trafficPressureComponents: number[] = []
      const highTrafficShare = metricValue(trafficResponse, 'high_traffic_road_share_pct')
      if (highTrafficShare !== null) {
        trafficPressureComponents.push(clamp(highTrafficShare, 0, 100))
      }
      const weightedAadt = metricValue(trafficResponse, 'length_weighted_aadt')
      if (weightedAadt !== null) {
        trafficPressureComponents.push(clamp((weightedAadt / 20000) * 100, 0, 100))
      }
      const heavyAadt = metricValue(trafficResponse, 'length_weighted_heavy_aadt')
      if (heavyAadt !== null) {
        trafficPressureComponents.push(clamp((heavyAadt / 2500) * 100, 0, 100))
      }
      const trafficPressure = average(trafficPressureComponents)

      const industrialPressureComponents: number[] = []
      const respiratoryFacilities = metricValue(industrialResponse, 'npi_respiratory_reporting_facilities')
      if (respiratoryFacilities !== null) {
        industrialPressureComponents.push(clamp(respiratoryFacilities * 20, 0, 100))
      }
      const nearestRespiratoryFacility = metricValue(industrialResponse, 'nearest_npi_respiratory_reporting_facility_km')
      if (nearestRespiratoryFacility !== null) {
        industrialPressureComponents.push(clamp((5 - nearestRespiratoryFacility) / 5 * 100, 0, 100))
      }
      const industrialPressure = average(industrialPressureComponents)

      const nextBaseline: SimulationBaseline = {
        id: neighbourhood.id,
        name: neighbourhood.name,
        treeCanopy: clamp(neighbourhood.treeCanopy ?? 22.7, 0, 100),
        openSpace: clamp(neighbourhood.greenSpaceAccess ?? 31.6, 0, 100),
        heatExposure: clamp(neighbourhood.heatExposure ?? 6.5, 0, 20),
        vulnerability: clamp(neighbourhood.developmentalVulnerability ?? 25, 0, 100),
        childDevelopment: clamp(neighbourhood.childDevelopmentScore ?? 68, 0, 100),
        serviceAccess: clamp(neighbourhood.serviceAccessScore ?? neighbourhood.environmentQualityScore ?? 50, 0, 100),
        futureDemand: clamp(neighbourhood.futureDemandScore ?? 50, 0, 100),
        environmentQuality: clamp(
          neighbourhood.environmentQualityScore
          ?? ((neighbourhood.treeCanopy ?? 22.7) + (neighbourhood.greenSpaceAccess ?? 31.6)) / 2,
          0,
          100,
        ),
        trafficPressure: clamp(trafficPressure ?? 50, 0, 100),
        industrialPressure: clamp(industrialPressure ?? 50, 0, 100),
      }

      setBaseline(nextBaseline)
      setScenarioValues({
        treeCanopy: nextBaseline.treeCanopy,
        openSpace: nextBaseline.openSpace,
        heat: nextBaseline.heatExposure,
      })
      setScenarioResult(buildScenarioResult(nextBaseline, {
        treeCanopy: nextBaseline.treeCanopy,
        openSpace: nextBaseline.openSpace,
        heat: nextBaseline.heatExposure,
      }))
    } catch (error) {
      console.error('Failed to load simulation baseline:', error)
      setBaseline(null)
      setScenarioResult(null)
    } finally {
      setScenarioLoading(false)
    }
  }

  const handleSearchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await submitSearch()
  }

  const runSimulation = () => {
    if (!baseline) {
      return
    }

    setScenarioResult(buildScenarioResult(baseline, scenarioValues))
  }

  const resetScenario = () => {
    if (!baseline) {
      return
    }

    const defaultValues = {
      treeCanopy: baseline.treeCanopy,
      openSpace: baseline.openSpace,
      heat: baseline.heatExposure,
    }

    setScenarioValues(defaultValues)
    setScenarioResult(buildScenarioResult(baseline, defaultValues))
  }

  const comparisonMetrics: ComparisonMetric[] = baseline ? [
    {
      id: 'heat',
      label: 'Heat exposure',
      unit: '°C',
      baseline: baseline.heatExposure,
      simulated: scenarioValues.heat,
      max: 20,
      lowerIsBetter: true,
    },
    {
      id: 'treeCanopy',
      label: 'Tree canopy',
      unit: '%',
      baseline: baseline.treeCanopy,
      simulated: scenarioValues.treeCanopy,
      max: 100,
      lowerIsBetter: false,
    },
    {
      id: 'openSpace',
      label: 'Public open space',
      unit: '%',
      baseline: baseline.openSpace,
      simulated: scenarioValues.openSpace,
      max: 100,
      lowerIsBetter: false,
    },
    {
      id: 'vulnerability',
      label: 'Vulnerability',
      unit: '%',
      baseline: baseline.vulnerability,
      simulated: scenarioResult?.vulnerability ?? baseline.vulnerability,
      max: 100,
      lowerIsBetter: true,
    },
  ] : []

  return (
    <div className="simulation-shell">
      <header className="simulation-topbar glass">
        <button className="brand-button" type="button" onClick={onLogoClick} aria-label="Go to KinderPrint landing page">
          <img src={logo} alt="" className="brand-logo" />
          <span>KinderPrint</span>
        </button>
      </header>

      <main className="simulation-main glass">
        <div className="simulation-header-row">
          <h1>Simulation Engine</h1>
          <span className="simulation-pill">Illustrative scenario</span>
        </div>

        <p className="simulation-subtitle">
          Test how changes in neighbourhood conditions could influence modelled child-development outcomes.
        </p>

        <div className="simulation-assumption-banner">
          <span>Model assumptions: evidence-based planning estimate, not a forecast</span>
          <div className="assumption-info-wrap">
            <button type="button" className="assumption-info-trigger" aria-label="Explain the simulation formula">
              i
            </button>
            <div className="assumption-info-tooltip">
              <strong>Scenario formula</strong>
              <p>Estimated vulnerability = baseline vulnerability − (tree canopy gain × 0.25) − (open space gain × 0.18) − (heat reduction × 2.1)</p>
              <p>Estimated child-development outlook = baseline score + (tree canopy gain × 0.22) + (open space gain × 0.16) + (heat reduction × 1.6)</p>
              <p>Effects are context-adjusted using local service access, projected future demand, and available traffic and industrial context indicators.</p>
              <p>Values are clamped to realistic ranges to keep the estimate stable and interpretable for planning comparisons.</p>
            </div>
          </div>
        </div>

        <div className="simulation-grid">
          <section className="simulation-panel">
            <h2>Build a Scenario</h2>

            <div className="field-group">
              <label htmlFor="simulation-neighbourhood">Neighbourhood</label>
              <div className="simulation-search-wrap">
                <form
                  className="glass search-input-shell simulation-search-shell"
                  onSubmit={handleSearchSubmit}
                >
                  <input
                    id="simulation-neighbourhood"
                    type="search"
                    value={search}
                    placeholder={selectedNeighbourhood || 'Search neighbourhood'}
                    autoComplete="off"
                    onFocus={() => setShowSearchResults(true)}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setSearch(nextValue)
                      setShowSearchResults(true)
                    }}
                  />
                  <button
                    className="search-submit-button"
                    type="submit"
                    aria-label="Search neighbourhood"
                    disabled={searchLoading || scenarioLoading}
                  >
                    <span aria-hidden="true">⌕</span>
                  </button>
                </form>

                {showSearchResults && (
                  <div className="glass simulation-search-results">
                    {searchLoading && (
                      <div className="search-state">Searching neighbourhoods…</div>
                    )}

                    {!searchLoading && searchResults.length > 0 && searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          void handleSearchResultSelect(item)
                        }}
                      >
                        <span>{item.name}</span>
                        <small>{item.geographic_unit}</small>
                      </button>
                    ))}

                    {!searchLoading && searchResults.length === 0 && (
                      <div className="search-state">No neighbourhood found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="field-group scenario-variables">
              <h3>Scenario Variables</h3>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>Tree canopy</label>
                  <span>Current {baseline ? `${baseline.treeCanopy.toFixed(1)}%` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={scenarioValues.treeCanopy}
                    onChange={(event) => setScenarioValues((current) => ({ ...current, treeCanopy: Number(event.target.value) }))}
                    aria-label="Tree canopy"
                  />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>{scenarioValues.treeCanopy.toFixed(1)}%</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>Public open space</label>
                  <span>Current {baseline ? `${baseline.openSpace.toFixed(1)}%` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    value={scenarioValues.openSpace}
                    onChange={(event) => setScenarioValues((current) => ({ ...current, openSpace: Number(event.target.value) }))}
                    aria-label="Public open space"
                  />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>{scenarioValues.openSpace.toFixed(1)}%</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>Urban heat island effect</label>
                  <span>Current {baseline ? `${baseline.heatExposure.toFixed(1)}°C` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.1"
                    value={scenarioValues.heat}
                    onChange={(event) => setScenarioValues((current) => ({ ...current, heat: Number(event.target.value) }))}
                    aria-label="Urban heat island effect"
                  />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>{scenarioValues.heat.toFixed(1)}°C</strong>
                  </div>
                </div>
              </div>
            </div>

            <p className="scenario-note">
              Assumes the current neighbourhood baseline and applies a simple evidence-based sensitivity model to compare planning options.
            </p>

            <div className="method-panel">
              <h3>How the estimate is built</h3>
              <ul>
                <li>Tree canopy and public open space improvements lower vulnerability in the scenario model.</li>
                <li>Lower heat exposure reduces the expected pressure on child-development outcomes.</li>
                <li>Higher local service access amplifies expected gains, while stronger projected demand dampens gains.</li>
                <li>Higher traffic and industrial context pressure further dampens estimated gains in the scenario output.</li>
                <li>The output is a planning comparison, not a forecast of a future year-by-year trend.</li>
              </ul>
            </div>

            <div className="action-row simulation-actions">
              <button type="button" className="button button-secondary" onClick={resetScenario} disabled={!baseline}>Reset</button>
              <button type="button" className="button button-primary" onClick={runSimulation} disabled={!baseline}>Run Simulation</button>
            </div>
          </section>

          <section className="simulation-panel">
            <div className="results-header">
              <h2>Simulation Results</h2>
              <span className="ready-pill">{scenarioResult ? 'Estimate ready' : 'Awaiting data'}</span>
            </div>

            <div className="result-cards">
              <article className="result-card">
                <div className="result-card-header">
                  <span>Heat exposure</span>
                </div>
                <div className="result-card-body">
                  <strong>{baseline ? `${baseline.heatExposure.toFixed(1)}°C` : '—'}</strong>
                  <span className="result-arrow">→</span>
                  <strong>{scenarioResult ? `${scenarioValues.heat.toFixed(1)}°C` : '—'}</strong>
                </div>
                <div className="result-status success">{scenarioResult ? scenarioResult.heatDirection : 'Select area'}</div>
              </article>

              <article className="result-card">
                <div className="result-card-header">
                  <span>Tree canopy</span>
                </div>
                <div className="result-card-body">
                  <strong>{baseline ? `${baseline.treeCanopy.toFixed(1)}%` : '—'}</strong>
                  <span className="result-arrow">→</span>
                  <strong>{scenarioValues.treeCanopy.toFixed(1)}%</strong>
                </div>
                <div className="result-status success">{baseline ? `+${(scenarioValues.treeCanopy - baseline.treeCanopy).toFixed(1)} pp` : '—'}</div>
              </article>

              <article className="result-card">
                <div className="result-card-header">
                  <span>Modelled vulnerability</span>
                </div>
                <div className="result-card-body">
                  <strong>{baseline ? `${baseline.vulnerability.toFixed(1)}%` : '—'}</strong>
                  <span className="result-arrow">→</span>
                  <strong>{scenarioResult ? `${scenarioResult.vulnerability.toFixed(1)}%` : '—'}</strong>
                </div>
                <div className="result-status success">{scenarioResult ? scenarioResult.vulnerabilityDirection : 'Pending'}</div>
              </article>

              <article className="result-card">
                <div className="result-card-header">
                  <span>Child-development outlook</span>
                </div>
                <div className="result-card-body">
                  <strong>{baseline ? `${baseline.childDevelopment.toFixed(1)}` : '—'}</strong>
                  <span className="result-arrow">→</span>
                  <strong>{scenarioResult ? `${scenarioResult.developmentScore.toFixed(1)}` : '—'}</strong>
                </div>
                <div className="result-status success">{scenarioResult ? scenarioResult.developmentDirection : 'Pending'}</div>
              </article>
            </div>

            <div className="comparison-panel">
              <div className="comparison-header">
                <h3>Scenario Comparison</h3>
                <div className="comparison-legend">
                  <span>Baseline</span>
                  <span>Simulated</span>
                </div>
              </div>

              {!baseline && (
                <div className="comparison-empty">Select a neighbourhood to view a clear baseline vs simulated comparison.</div>
              )}

              {baseline && comparisonMetrics.map((metric) => {
                const direction = metricDirection(metric)
                const baselineWidth = clamp((metric.baseline / metric.max) * 100, 0, 100)
                const simulatedWidth = clamp((metric.simulated / metric.max) * 100, 0, 100)
                const deltaPrefix = direction.delta > 0 ? '+' : ''
                return (
                  <div className="comparison-row" key={metric.id}>
                    <div className="comparison-metric">
                      <span className="comparison-label">{metric.label}</span>
                      <span className="comparison-rule">{metric.lowerIsBetter ? 'Lower is better' : 'Higher is better'}</span>
                    </div>
                    <div className="comparison-values">
                      <span className="comparison-value baseline">{formatMetricValue(metric.baseline, metric.unit)}</span>
                      <span className="comparison-arrow">→</span>
                      <span className="comparison-value simulated">{formatMetricValue(metric.simulated, metric.unit)}</span>
                      <span className={`comparison-delta ${direction.tone}`}>
                        {`${deltaPrefix}${direction.delta.toFixed(1)}${metric.unit} · ${direction.label}`}
                      </span>
                    </div>
                    <div className="comparison-track" role="img" aria-label={`${metric.label} baseline ${formatMetricValue(metric.baseline, metric.unit)} simulated ${formatMetricValue(metric.simulated, metric.unit)}`}>
                      <div className="comparison-track-fill baseline" style={{ width: `${baselineWidth}%` }} />
                      <div className="comparison-track-fill simulated" style={{ width: `${simulatedWidth}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="insight-box">
              <div className="insight-box-header">
                <h3>Model Insight</h3>
                <span className="confidence-pill">Confidence · Medium</span>
              </div>
              <p>{scenarioResult ? scenarioResult.insight : 'Select a neighbourhood and run the model to update the scenario estimate. This is an illustrative model output, not a future forecast.'}</p>
              <div className="projected-change secondary">
                <span>Model context:</span>
                <strong>{scenarioResult ? scenarioResult.modelContext : `${baseline?.serviceAccess?.toFixed(1) ?? '50.0'} · ${baseline?.futureDemand?.toFixed(1) ?? '50.0'}`}</strong>
              </div>
              <div className="projected-change">
                <span>Vulnerability change:</span>
                <strong>{scenarioResult ? scenarioResult.projectedChange : `${baseline?.vulnerability ?? 25}% → ${baseline?.vulnerability ?? 25}%`}</strong>
              </div>
              <div className="projected-change secondary">
                <span>Development outlook:</span>
                <strong>{scenarioResult ? scenarioResult.projectedDevelopmentChange : `${baseline?.childDevelopment ?? 68} → ${baseline?.childDevelopment ?? 68}`}</strong>
              </div>
            </div>

            <div className="action-row results-actions">
              <button type="button" className="button button-secondary" onClick={onBackToMenu}>Back to Menu</button>
              <button type="button" className="button button-primary" onClick={onExploreMap}>Explore Map</button>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
