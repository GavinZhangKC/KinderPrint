import { useEffect, useRef, useState } from 'react'

import './styles.css'
import './components/SimulationPage.css'

import BrandHeader from './components/BrandHeader'
import ComparePanel from './components/ComparePanel'
import DetailedDataDrawer from './components/DetailedDataDrawer'
import DigitalHealthHub, { ChildHealthComparisonPage } from './components/DigitalHealthHub'
import InsightPage from './components/InsightPage'
import Legend from './components/Legend'
import LandingPage from './components/LandingPage'
import NeighbourhoodMap from './components/NeighbourhoodMap'
import PreferencePanel from './components/PreferencePanel'
import ProfileModal from './components/ProfileModal'
import SimulationPage from './components/SimulationPage'
import WaterRippleBackground from './components/WaterRippleBackground'
import WhereToLive from './components/where/WhereToLive'

import { useNeighbourhoodSearch } from './hooks/useNeighbourhoodSearch'

import { api } from './services/api'
import { toNeighbourhood } from './services/profileAdapter'

import type {
  MultiNeighbourhoodComparison,
} from './services/api'

import type {
  Neighbourhood,
  PreferenceId,
} from './types/neighbourhood'

type View =
  | 'map'
  | 'profile'
  | 'compare-select'
  | 'comparison'

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

export default function App() {
const appPage = initialAppPage()

const [view, setView] =
    useState<View>('map')

  const [selected, setSelected] =
    useState<Neighbourhood | null>(null)

  const [comparisons, setComparisons] =
    useState<Neighbourhood[]>([])
  const [comparisonResult, setComparisonResult] =
    useState<MultiNeighbourhoodComparison | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [isMapSelectionMode, setIsMapSelectionMode] = useState(false)
  const compareRequestNumberRef = useRef(0)
  const profileRequestNumberRef = useRef(0)
  const [profileError, setProfileError] = useState<string | null>(null)
  const neighbourhoodSearchRef = useRef<HTMLDivElement>(null)

  const [preference, setPreference] =
    useState<PreferenceId | null>(null)


  const [
    showDataDrawer,
    setShowDataDrawer,
  ] = useState(false)
  const [activeProfilePanel, setActiveProfilePanel] =
    useState<'profile' | 'drawer'>('profile')
const [
    mapSelectedId,
    setMapSelectedId,
  ] = useState<string | null>(null)
const [
    mapFocusId,
    setMapFocusId,
  ] = useState<string | null>(null)
  const {
    search,
    setSearch,
    showSearchResults,
    setShowSearchResults,
    searchResults,
    setSearchResults,
    searchLoading,
    searchError,
    handleSearchResultSelect,
    submitSearch,
  } = useNeighbourhoodSearch({
    onSelectResult: async (item) => {
      await handleMapSelect(item.id, item.name, true)
    },
  })
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
function resetComparisonState() {
    compareRequestNumberRef.current += 1
    setIsMapSelectionMode(false)
    setComparisons([])
    setComparisonResult(null)
    setCompareError(null)
    setCompareLoading(false)
  }
function handleCloseCompare(targetView: 'profile' | 'map' = 'profile') {
    profileRequestNumberRef.current += 1
    resetComparisonState()
    setMapSelectedId(selected?.id ?? null)
    setMapFocusId(null)
    setView(targetView === 'profile' && selected ? 'profile' : 'map')
  }
function resetExplore() {
    profileRequestNumberRef.current += 1
    setView('map')

    setSelected(null)
    resetComparisonState()

    setMapSelectedId(null)
    setMapFocusId(null)

    setSearch('')
    setSearchResults([])
    setShowSearchResults(false)
    setProfileError(null)

    setShowDataDrawer(false)
  }
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
    resetExplore()
    window.location.assign('/insight-journey')
  }
function openHealthPage() {
    navigateToAppPage('health')
  }
function choosePrimary(
    neighbourhood: Neighbourhood,
  ) {
    setSelected(neighbourhood)

    setComparisons([])

    setSearch(neighbourhood.name)

    setShowSearchResults(false)

    setView('profile')
  }
  async function handleMapSelect(
    id: string,
    name?: string,
    focusMap = true,
  ) {
    const requestNumber = ++profileRequestNumberRef.current
    setMapSelectedId(id)
    setMapFocusId(focusMap ? id : null)
    setSearch(name ?? id)
    setShowSearchResults(false)
    setProfileError(null)

    try {
      const [profileResponse, priorityResponse] = await Promise.all([
        api.getProfile(id),
        api.getPriority(id),
      ])
      if (requestNumber !== profileRequestNumberRef.current) return

      if (
        profileResponse.status !== 'available' &&
        profileResponse.status !== 'limited'
      ) {
        throw new Error(
          profileResponse.limitations[0]?.message ??
            'The location profile is unavailable.',
        )
      }

      const realNeighbourhood = toNeighbourhood(
        profileResponse.data,
        priorityResponse.status === 'available' || priorityResponse.status === 'limited'
          ? priorityResponse.data
          : null,
        null,
        {
          metadata: profileResponse.metadata,
          profileLimitations: profileResponse.limitations,
          profileNotices: profileResponse.notices,
          limitations: [profileResponse, priorityResponse]
            .flatMap((response) => response.limitations)
            .map((item) => item.message),
          notices: [profileResponse, priorityResponse]
            .flatMap((response) => response.notices)
            .map((item) => item.message)
            .filter((message) => message && message !== 'TBC'),
        },
        id,
        name,
      )

      if (view === 'compare-select' && selected) {
        setComparisons((current) => {
          if (
            realNeighbourhood.id === selected.id
            || current.some((item) => item.id === realNeighbourhood.id)
            || current.length >= 1
          ) {
            return current
          }

          return [...current, realNeighbourhood]
        })
        return
      }

      choosePrimary(realNeighbourhood)
    } catch (error) {
      if (requestNumber !== profileRequestNumberRef.current) return
      console.error('Failed to load location profile:', error)
      if (view === 'compare-select' && selected) {
        setCompareError(error instanceof Error ? error.message : 'Could not add this neighbourhood.')
      } else {
        setSelected(null)
        setComparisons([])
        setView('map')
        setProfileError(error instanceof Error ? error.message : 'Could not load this neighbourhood. Please try again.')
      }
    }
  }
  // Deep link from "Where to live": /map?area=<SA2 code> opens that area's profile.
  const deepLinkedAreaRef = useRef(false)
  useEffect(() => {
    if (appPage !== 'map' || deepLinkedAreaRef.current) return
    deepLinkedAreaRef.current = true
    const area = new URLSearchParams(window.location.search).get('area')
    if (area && /^\d{9}$/.test(area)) void handleMapSelect(area, undefined, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

function startComparison() {
    if (!selected) {
      return
    }

    resetComparisonState()

    setShowDataDrawer(false)

    setView('compare-select')
  }

  useEffect(() => {
    if (view !== 'compare-select' || !isMapSelectionMode) {
      return
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMapSelectionMode(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isMapSelectionMode, view])

  async function openComparisonResult() {
    if (
      !selected ||
      comparisons.length === 0
    ) {
      return
    }

    const requestNumber = ++compareRequestNumberRef.current

    try {
      setCompareLoading(true)
      setCompareError(null)
      setComparisonResult(null)

      const selectedIds = [selected.id, ...comparisons.map((item) => item.id)]
      const response = await api.compare(selectedIds)
      if (requestNumber !== compareRequestNumberRef.current) {
        return
      }

      if (response.status !== 'available' && response.status !== 'limited') {
        throw new Error(response.limitations[0]?.message ?? 'No approved comparison is available for these neighbourhoods.')
      }
      setComparisonResult(response.data)
      setView('comparison')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      if (requestNumber !== compareRequestNumberRef.current) {
        return
      }
      console.error('Failed to compare neighbourhoods:', error)
      setComparisonResult(null)
      setCompareError(error instanceof Error ? error.message : 'Could not load this comparison.')
    } finally {
      if (requestNumber === compareRequestNumberRef.current) {
        setCompareLoading(false)
      }
    }
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
    return <WhereToLive
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

if (
    view === 'comparison' &&
    selected &&
    comparisons.length > 0 &&
    comparisonResult
  ) {
    const secondary = comparisons[0]

    return (
      <div className="app-background map-page standalone-comparison-page">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />
        <BrandHeader
          activePage="map"
          onHome={backToLanding}
          onInsight={openInsightPage}
          onMap={resetExplore}
          onSimulation={openSimulationPage}
          onHealth={openHealthPage}
        />
        <ChildHealthComparisonPage
          primary={{ id: selected.id, name: selected.name, geographic_unit: selected.geographicUnit }}
          secondary={{ id: secondary.id, name: secondary.name, geographic_unit: secondary.geographicUnit }}
          onBack={() => handleCloseCompare('profile')}
        />
      </div>
    )
  }
return (
    <div
      className="app-background map-page"
      id="explore"
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <BrandHeader
          activePage="map"
          onHome={backToLanding}
          onInsight={openInsightPage}
          onMap={resetExplore}
          onSimulation={openSimulationPage}
          onHealth={openHealthPage}
        />

      <main className="map-shell">
        <section className="glass map-surface">

          <div className="neighbourhood-search-block" ref={neighbourhoodSearchRef}>
            <label htmlFor="neighbourhood-search">
              Search Neighbourhood
            </label>

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
                placeholder="Select a neighbourhood"
                autoComplete="off"

                onFocus={() => {
                  setShowSearchResults(true)
                }}

                onChange={(event) => {
                  const value =
                    event.target.value

                  setSearch(value)
                  profileRequestNumberRef.current += 1
                  setProfileError(null)

                  setShowSearchResults(true)
setMapSelectedId(null)
                  setMapFocusId(null)

                  if (selected) {
                    setSelected(null)
                    setComparisons([])
                    setView('map')
                  }
                }}
              />

              <button
                className="search-submit-button"
                type="submit"
                aria-label="Search neighbourhood"
                disabled={searchLoading}
              >
                <span aria-hidden="true">
                  ⌕
                </span>
              </button>
            </form>

            {showSearchResults &&
              !selected && (
                <div className="glass search-results">

                  {searchLoading && (
                    <div className="search-state">
                      Searching neighbourhoods…
                    </div>
                  )}

                  {!searchLoading && searchError && (
                    <div className="search-state search-state--error" role="alert">
                      {searchError}
                    </div>
                  )}

                  {!searchLoading &&
                    !searchError &&
                    searchResults.length > 0 &&
                    searchResults.map(
                      (item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            void handleSearchResultSelect(item)
                          }}
                        >
                          <span>
                            {item.name}
                          </span>

                          <small>
                            {
                              item.geographic_unit
                            }
                          </small>
                        </button>
                      ),
                    )}

                  {!searchLoading &&
                    !searchError &&
                    searchResults.length ===
                      0 && (
                      <div className="search-state">
                        No neighbourhood found
                      </div>
                    )}

                </div>
              )}

            {profileError && (
              <div className="glass map-request-error" role="alert">
                {profileError}
              </div>
            )}

          </div>

          <a className="glass map-where-link" href="/where-to-live">
            Compare areas for your family
          </a>


          <NeighbourhoodMap
            preference={preference}

            selectedId={
              selected?.id ??
              mapSelectedId
            }

            focusId={mapFocusId}

            comparisonIds={comparisons.map((item) => item.id)}

            compareMode={view === 'compare-select'}

            selectionEnabled={view !== 'compare-select' || isMapSelectionMode}

            onSelect={(id, name) => {
              if (view === 'compare-select') {
                if (id === selected?.id) return

                if (comparisons.some((item) => item.id === id)) {
                  setComparisons((current) => current.filter((item) => item.id !== id))
                  setCompareError(null)
                  return
                }

                if (comparisons.length >= 1) {
                  setCompareError('The comparison page compares two localities at a time.')
                  return
                }
              }

              void handleMapSelect(id, name).then(() => {
                if (view === 'compare-select') {
                  setIsMapSelectionMode(false)
                }
              })
            }}
          />


          <div className="map-controls-row">
            <PreferencePanel
              value={preference}
              onChange={setPreference}
            />

            {preference ? (
              <Legend
                preference={preference}
              />
            ) : null}
          </div>


          {view === 'profile' && selected && (
            <div className={`profile-interaction-lock profile-stage ${showDataDrawer ? 'has-data-drawer' : ''}`} aria-modal="true" role="dialog">
              <div className={`profile-motion-wrapper ${activeProfilePanel === 'profile' ? 'is-active' : ''}`}>
                <ProfileModal
                  neighbourhood={
                    selected
                  }

                  onCompare={
                    startComparison
                  }

                  onExploreData={() => {
                    setActiveProfilePanel('drawer')
                    setShowDataDrawer(true)
                  }}

                  onActivate={() => setActiveProfilePanel('profile')}

                  onClose={() =>
                    setView('map')
                  }
                />
              </div>

              {showDataDrawer && (
                <DetailedDataDrawer
                  neighbourhood={selected}
                  isActive={activeProfilePanel === 'drawer'}
                  onActivate={() => setActiveProfilePanel('drawer')}
                  onClose={() => {
                    setShowDataDrawer(false)
                    setActiveProfilePanel('profile')
                  }}
                />
              )}
            </div>
          )}


          {view ===
            'compare-select' &&
            selected && (
              <ComparePanel
                source={selected}

                comparisons={comparisons}

                onSelectResult={async (item) => {
                  await handleMapSelect(item.id, item.name, false)
                  setIsMapSelectionMode(false)
                }}

                mapSelectionEnabled={isMapSelectionMode}

                onToggleMapSelection={() => {
                  setIsMapSelectionMode((enabled) => !enabled)
                }}

                onDeselectResult={(id) => {
                  setComparisons((current) => current.filter((item) => item.id !== id))
                  setCompareError(null)
                }}

                onBack={() => {
                  handleCloseCompare('profile')
                }}

                onCompare={openComparisonResult}

                compareLoading={compareLoading}

                compareError={compareError}

              />
            )}


        </section>
      </main>

    </div>
  )
}
