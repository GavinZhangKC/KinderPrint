import { useState } from 'react'

import logo from '../assets/LogoMark.png'
import { useNeighbourhoodSearch } from '../hooks/useNeighbourhoodSearch'

interface SimulationPageProps {
  onLogoClick: () => void
  onBackToMenu: () => void
  onExploreMap: () => void
}

export default function SimulationPage({
  onLogoClick,
  onBackToMenu,
  onExploreMap,
}: SimulationPageProps) {
  const [selectedNeighbourhood, setSelectedNeighbourhood] = useState('')

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
      setSearch(item.name)
    },
  })

  const handleSearchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await submitSearch()
  }

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
          <span className="simulation-pill">Scenario modelling</span>
        </div>

        <p className="simulation-subtitle">
          Test how changes in neighbourhood conditions could influence modelled child-development outcomes.
        </p>

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
                    disabled={searchLoading}
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
                  <span>Current 22.7%</span>
                </div>
                <div className="slider-control">
                  <input type="range" min="0" max="100" value="35" readOnly aria-label="Tree canopy" />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>35.0%</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>Public open space</label>
                  <span>Current 31.6%</span>
                </div>
                <div className="slider-control">
                  <input type="range" min="0" max="100" value="42" readOnly aria-label="Public open space" />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>42.0%</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>Urban heat island effect</label>
                  <span>Current 6.5°C</span>
                </div>
                <div className="slider-control">
                  <input type="range" min="0" max="20" value="4.8" readOnly aria-label="Urban heat island effect" />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>4.8°C</strong>
                  </div>
                </div>
              </div>
            </div>

            <p className="scenario-note">
              Uses the selected neighbourhood baseline and the proposed scenario values.
            </p>

            <div className="action-row simulation-actions">
              <button type="button" className="button button-secondary">Reset</button>
              <button type="button" className="button button-primary">Run Simulation</button>
            </div>
          </section>

          <section className="simulation-panel">
            <div className="results-header">
              <h2>Simulation Results</h2>
              <span className="ready-pill">Ready</span>
            </div>

            <div className="result-cards">
              <article className="result-card">
                <div className="result-card-header">
                  <span>Heat exposure</span>
                </div>
                <div className="result-card-body">
                  <strong>High</strong>
                  <span className="result-arrow">→</span>
                  <strong>Moderate</strong>
                </div>
                <div className="result-status success">Improves</div>
              </article>

              <article className="result-card">
                <div className="result-card-header">
                  <span>Tree canopy</span>
                </div>
                <div className="result-card-body">
                  <strong>22.7%</strong>
                  <span className="result-arrow">→</span>
                  <strong>35.0%</strong>
                </div>
                <div className="result-status success">+12.3 pp</div>
              </article>

              <article className="result-card">
                <div className="result-card-header">
                  <span>Modelled vulnerability</span>
                </div>
                <div className="result-card-body">
                  <strong>25%</strong>
                  <span className="result-arrow">→</span>
                  <strong>18%</strong>
                </div>
                <div className="result-status success">Lower</div>
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

              <div className="comparison-row">
                <span className="comparison-label">Heat exposure</span>
                <div className="comparison-bar baseline" style={{ width: '58%' }} />
                <div className="comparison-bar simulated" style={{ width: '42%' }} />
              </div>

              <div className="comparison-row">
                <span className="comparison-label">Tree canopy</span>
                <div className="comparison-bar baseline" style={{ width: '36%' }} />
                <div className="comparison-bar simulated" style={{ width: '62%' }} />
              </div>

              <div className="comparison-row">
                <span className="comparison-label">Public open space</span>
                <div className="comparison-bar baseline" style={{ width: '48%' }} />
                <div className="comparison-bar simulated" style={{ width: '68%' }} />
              </div>

              <div className="comparison-row">
                <span className="comparison-label">Vulnerability</span>
                <div className="comparison-bar baseline" style={{ width: '64%' }} />
                <div className="comparison-bar simulated" style={{ width: '46%' }} />
              </div>
            </div>

            <div className="insight-box">
              <div className="insight-box-header">
                <h3>Model Insight</h3>
                <span className="confidence-pill">Confidence · Medium</span>
              </div>
              <p>
                Increasing tree canopy and public open space while reducing heat exposure produces a lowered vulnerability estimate for this scenario.
              </p>
              <div className="projected-change">
                <span>Projected change:</span>
                <strong>25% → 18%</strong>
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
