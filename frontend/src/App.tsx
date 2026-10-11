import { useEffect, useRef, useState } from 'react'

import './styles.css'
import './components/SimulationPage.css'

import BrandHeader from './components/BrandHeader'
import DigitalHealthHub from './components/DigitalHealthHub'
import InsightPage from './components/InsightPage'
import Legend from './components/Legend'
import LandingPage from './components/LandingPage'
import NeighbourhoodMap from './components/NeighbourhoodMap'
import PreferencePanel from './components/PreferencePanel'
import SimulationPage from './components/SimulationPage'
import WaterRippleBackground from './components/WaterRippleBackground'
import WhereToLivePage from './components/where/WhereToLivePage'

import { useNeighbourhoodSearch } from './hooks/useNeighbourhoodSearch'

import type { PreferenceId } from './types/neighbourhood'

type AppPage =
  | 'landing'
  | 'insight-legacy'
  | 'map'
  | 'simulation'
  | 'health'
  | 'where'

function initialAppPage(): AppPage {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  if (pathname === '/insight-journey-legacy') return 'insight-legacy'
  if (pathname === '/map') return 'map'
  if (pathname === '/simulation') return 'simulation'
  if (pathname === '/child-health' || pathname === '/health') return 'health'
  if (pathname === '/where-to-live') return 'where'

  // Keep old shared-page links working while navigation moves to real paths.
  const requestedPage = new URLSearchParams(window.location.search).get('page')
  if (requestedPage === 'map' || requestedPage === 'simulation' || requestedPage === 'health') {
    return requestedPage
  }

  return 'landing'
}

function appPagePath(page: Exclude<AppPage, 'insight-legacy'>) {
  if (page === 'map') return '/map'
  if (page === 'simulation') return '/simulation'
  if (page === 'health') return '/child-health'
  if (page === 'where') return '/where-to-live'
  return '/'
}

function navigateToAppPage(page: Exclude<AppPage, 'insight-legacy'>) {
  window.location.assign(appPagePath(page))
}

/** The Child Health board (parent and practitioner views) for one area. */
export function childHealthUrl(id: string, name?: string | null) {
  return `/child-health?area=${encodeURIComponent(id)}${name ? `&name=${encodeURIComponent(name)}` : ''}`
}

const SA2_PATTERN = /^\d{9}$/

export default function App() {
  const appPage = initialAppPage()

  const [preference, setPreference] = useState<PreferenceId | null>(null)
  // An area the map has been asked to show (from a deep link or the search box).
  const [focused, setFocused] = useState<{ id: string; name: string | null } | null>(() => {
    if (appPage !== 'map') return null
    const query = new URLSearchParams(window.location.search)
    const id = query.get('area')
    return id && SA2_PATTERN.test(id) ? { id, name: query.get('name') } : null
  })
  const neighbourhoodSearchRef = useRef<HTMLDivElement>(null)

  const {
    search,
    setSearch,
    showSearchResults,
    setShowSearchResults,
    searchResults,
    searchLoading,
    searchError,
    handleSearchResultSelect,
    submitSearch,
  } = useNeighbourhoodSearch({
    onSelectResult: async (item) => {
      setFocused({ id: item.id, name: item.name })
    },
  })

  useEffect(() => {
    if (focused?.name) setSearch(focused.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!showSearchResults) return
    const closeSearchOnOutsideClick = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && !neighbourhoodSearchRef.current?.contains(target)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener('pointerdown', closeSearchOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeSearchOnOutsideClick)
  }, [showSearchResults])

  function backToLanding() {
    navigateToAppPage('landing')
  }
  function openMapPage() {
    navigateToAppPage('map')
  }
  function openSimulationPage() {
    navigateToAppPage('simulation')
  }
  function openInsightPage() {
    window.location.assign('/insight-journey')
  }
  function openHealthPage() {
    navigateToAppPage('health')
  }
  /** Clicking an area anywhere on the map opens its Child Health board. */
  function openChildHealth(id: string, name?: string | null) {
    window.location.assign(childHealthUrl(id, name))
  }

  if (appPage === 'landing') {
    return (
      <div className="entry-pages">
        <WaterRippleBackground />
        <LandingPage
          onInsight={openInsightPage}
          onSimulation={openSimulationPage}
          onMap={openMapPage}
          onHealth={openHealthPage}
        />
      </div>
    )
  }

  if (appPage === 'simulation') {
    return (
      <SimulationPage
        onHome={backToLanding}
        onInsight={openInsightPage}
        onExploreMap={openMapPage}
        onSimulation={openSimulationPage}
        onHealth={openHealthPage}
      />
    )
  }

  if (appPage === 'insight-legacy') {
    return (
      <InsightPage
        onLogoClick={backToLanding}
        onInsight={openInsightPage}
        onExploreMap={openMapPage}
        onSimulation={openSimulationPage}
        onHealth={openHealthPage}
      />
    )
  }

  if (appPage === 'where') {
    return <WhereToLivePage
      onHome={backToLanding}
      onInsight={openInsightPage}
      onMap={openMapPage}
      onSimulation={openSimulationPage}
      onHealth={openHealthPage}
    />
  }

  if (appPage === 'health') {
    return <DigitalHealthHub
      onHome={backToLanding}
      onInsight={openInsightPage}
      onSimulation={openSimulationPage}
      onMap={openMapPage}
      onHealth={openHealthPage}
    />
  }

  return (
    <div className="app-background map-page" id="explore">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <BrandHeader
        activePage="map"
        onHome={backToLanding}
        onInsight={openInsightPage}
        onMap={() => { setFocused(null); setSearch('') }}
        onSimulation={openSimulationPage}
        onHealth={openHealthPage}
      />

      <main className="map-shell">
        <section className="glass map-surface">

          <div className="neighbourhood-search-block" ref={neighbourhoodSearchRef}>
            <label htmlFor="neighbourhood-search">Search neighbourhood</label>

            <form
              className="glass search-input-shell"
              onSubmit={(event) => {
                event.preventDefault()
                void submitSearch()
              }}
            >
              <input
                id="neighbourhood-search"
                type="search"
                value={search}
                placeholder="Search a suburb, then open its child health board"
                autoComplete="off"
                onFocus={() => setShowSearchResults(true)}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setShowSearchResults(true)
                  setFocused(null)
                }}
              />
              <button className="search-submit-button" type="submit" aria-label="Search neighbourhood" disabled={searchLoading}>
                <span aria-hidden="true">⌕</span>
              </button>
            </form>

            {showSearchResults && (
              <div className="glass search-results">
                {searchLoading && <div className="search-state">Searching neighbourhoods…</div>}
                {!searchLoading && searchError && <div className="search-state search-state--error" role="alert">{searchError}</div>}
                {!searchLoading && !searchError && searchResults.length > 0 && searchResults.map((item) => (
                  <button key={item.id} type="button" onClick={() => { void handleSearchResultSelect(item) }}>
                    <span>{item.name}</span>
                    <small>{item.geographic_unit}</small>
                  </button>
                ))}
                {!searchLoading && !searchError && searchResults.length === 0 && <div className="search-state">No neighbourhood found</div>}
              </div>
            )}

            {focused && (
              <div className="glass map-area-card" role="status">
                <span>{focused.name ? <><b>{focused.name}</b> is highlighted on the map.</> : 'This area is highlighted on the map.'}</span>
                <button type="button" className="map-area-card__open" onClick={() => openChildHealth(focused.id, focused.name)}>
                  Open its child health board
                </button>
              </div>
            )}
          </div>

          <a className="glass map-where-link" href="/where-to-live">Compare areas for your family</a>

          <NeighbourhoodMap
            preference={preference}
            selectedId={focused?.id ?? null}
            focusId={focused?.id ?? null}
            onSelect={(id, name) => openChildHealth(id, name)}
          />

          <div className="map-controls-row">
            <PreferencePanel value={preference} onChange={setPreference} />
            {preference ? <Legend preference={preference} /> : null}
          </div>

          <p className="map-click-hint glass">Select any area on the map to open its child health board.</p>
        </section>
      </main>
    </div>
  )
}
