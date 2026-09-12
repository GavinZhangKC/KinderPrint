import { useEffect, useRef, useState } from 'react'

import './styles.css'
import './components/SimulationPage.css'

import AboutUsPage from './components/AboutUsPage'
import BrandHeader from './components/BrandHeader'
import ComparePanel from './components/ComparePanel'
import DetailedComparison from './components/DetailedComparison'
import DetailedDataDrawer from './components/DetailedDataDrawer'
import InsightPage from './components/InsightPage'
import Legend from './components/Legend'
import LandingPage from './components/LandingPage'
import MenuPage from './components/MenuPage'
import NeighbourhoodMap from './components/NeighbourhoodMap'
import PreferencePanel from './components/PreferencePanel'
import ProfileModal from './components/ProfileModal'
import SimulationPage from './components/SimulationPage'
import WaterRippleBackground from './components/WaterRippleBackground'

import { useNeighbourhoodSearch } from './hooks/useNeighbourhoodSearch'

import { api } from './services/api'
import { toNeighbourhood } from './services/profileAdapter'

import type {
  NeighbourhoodComparison,
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
  | 'menu'
  | 'insight'
  | 'map'
  | 'about'
  | 'simulation'

export default function App() {
const [appPage, setAppPage] =
    useState<AppPage>('landing')

const [view, setView] =
    useState<View>('map')

  const [selected, setSelected] =
    useState<Neighbourhood | null>(null)

  const [comparison, setComparison] =
    useState<Neighbourhood | null>(null)
  const [comparisonResult, setComparisonResult] =
    useState<NeighbourhoodComparison | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [comparisonLimitations, setComparisonLimitations] =
    useState<string[]>([])
  const [isMapSelectionMode, setIsMapSelectionMode] = useState(false)
  const compareRequestNumberRef = useRef(0)

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
    handleSearchResultSelect,
    submitSearch,
  } = useNeighbourhoodSearch({
    onSelectResult: async (item) => {
      await handleMapSelect(item.id, item.name, true)
    },
  })
function resetComparisonState() {
    compareRequestNumberRef.current += 1
    setIsMapSelectionMode(false)
    setComparison(null)
    setComparisonResult(null)
    setCompareError(null)
    setCompareLoading(false)
    setComparisonLimitations([])
  }
function handleCloseCompare(targetView: 'profile' | 'map' = 'profile') {
    resetComparisonState()
    setMapSelectedId(selected?.id ?? null)
    setMapFocusId(null)
    setView(targetView === 'profile' && selected ? 'profile' : 'map')
  }
function resetExplore() {
    setView('map')

    setSelected(null)
    resetComparisonState()

    setMapSelectedId(null)
    setMapFocusId(null)

    setSearch('')
    setSearchResults([])
    setShowSearchResults(false)

    setShowDataDrawer(false)
  }
function backToMenu() {
    resetExplore()
    setAppPage('menu')
  }
function backToLanding() {
    resetExplore()
    setAppPage('landing')
  }
function openMapPage() {
    resetExplore()
    setAppPage('map')
  }
function choosePrimary(
    neighbourhood: Neighbourhood,
  ) {
    setSelected(neighbourhood)

    setComparison(null)

    setSearch(neighbourhood.name)

    setShowSearchResults(false)

    setView('profile')
  }
async function handleMapSelect(
    id: string,
    name?: string,
    focusMap = true,
  ) {
    setMapSelectedId(id)
    setMapFocusId(focusMap ? id : null)
    setSearch(name ?? id)
    setShowSearchResults(false)

    try {
      const [profileResponse, priorityResponse, explanationResponse] = await Promise.all([
        api.getProfile(id),
        api.getPriority(id),
        api.getExplanation(id),
      ])

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
        explanationResponse.status === 'available' || explanationResponse.status === 'limited'
          ? explanationResponse.data : null,
        {
          metadata: profileResponse.metadata,
          limitations: [profileResponse, priorityResponse, explanationResponse]
            .flatMap((response) => response.limitations)
            .map((item) => item.message),
          notices: [profileResponse, priorityResponse, explanationResponse]
            .flatMap((response) => response.notices)
            .map((item) => item.message)
            .filter((message) => message && message !== 'TBC'),
        },
        id,
        name,
      )

      if (view === 'compare-select' && selected) {
        if (realNeighbourhood.id !== selected.id) {
          setComparison(realNeighbourhood)
        }
        return
      }

      choosePrimary(realNeighbourhood)
    } catch (error) {
      console.error('Failed to load location profile:', error)
      setSelected(null)
      setComparison(null)
      setView('map')
    }
  }
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
      !comparison
    ) {
      return
    }

    const requestNumber = ++compareRequestNumberRef.current

    try {
      setCompareLoading(true)
      setCompareError(null)
      const response = await api.compare(selected.id, comparison.id)
      if (requestNumber !== compareRequestNumberRef.current) {
        return
      }
      if (response.status !== 'available' && response.status !== 'limited') {
        throw new Error(response.limitations[0]?.message ?? 'No approved comparison is available for these neighbourhoods.')
      }
      setComparisonResult(response.data)
      setComparisonLimitations(response.limitations.map((item) => item.message))
      setView('comparison')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      if (requestNumber !== compareRequestNumberRef.current) {
        return
      }
      console.error('Failed to compare neighbourhoods:', error)
      setComparisonResult(null)
      setComparisonLimitations([])
      setCompareError(error instanceof Error ? error.message : 'Could not load this comparison.')
    } finally {
      if (requestNumber === compareRequestNumberRef.current) {
        setCompareLoading(false)
      }
    }
  }
if (appPage === 'landing' || appPage === 'menu') {
    return (
      <div className="entry-pages">
        <WaterRippleBackground />
        {appPage === 'landing' ? (
          <LandingPage onExplore={() => setAppPage('menu')} />
        ) : (
          <MenuPage
            onInsight={() => setAppPage('insight')}
            onMap={() => setAppPage('map')}
            onSimulation={() => setAppPage('simulation')}
            onAboutUs={() => setAppPage('about')}
          />
        )}
      </div>
    )
  }

  if (appPage === 'about') {
    return <AboutUsPage onBack={backToMenu} />
  }

  if (appPage === 'simulation') {
    return (
      <SimulationPage
        onLogoClick={backToLanding}
        onBackToMenu={backToMenu}
        onExploreMap={openMapPage}
      />
    )
  }

  if (appPage === 'insight') {
    return (
      <InsightPage
        onLogoClick={backToLanding}
        onBackToMenu={backToMenu}
        onExploreMap={openMapPage}
      />
    )
  }

if (
    view === 'comparison' &&
    selected &&
    comparison &&
    comparisonResult
  ) {
    return (
      <div className="app-background detailed-background">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <BrandHeader
          onLogoClick={backToLanding}
          onExplore={resetExplore}
          onBackToMenu={backToMenu}
        />

        <DetailedComparison
          comparisonResult={comparisonResult}
          limitations={comparisonLimitations}
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
          onLogoClick={backToLanding}
          onExplore={resetExplore}
          onBackToMenu={backToMenu}
        />

      <main className="map-shell">
        <section className="glass map-surface">

          <div className="neighbourhood-search-block">
            <label htmlFor="neighbourhood-search">
              Neighbourhood
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

                  setShowSearchResults(true)
setMapSelectedId(null)
                  setMapFocusId(null)

                  if (selected) {
                    setSelected(null)
                    setComparison(null)
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

                  {!searchLoading &&
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
                    searchResults.length ===
                      0 && (
                      <div className="search-state">
                        No neighbourhood found
                      </div>
                    )}

                </div>
              )}

          </div>


          <NeighbourhoodMap
            preference={preference}

            selectedId={
              selected?.id ??
              mapSelectedId
            }

            focusId={mapFocusId}

            comparisonId={
              comparison?.id ??
              null
            }

            compareMode={view === 'compare-select'}

            selectionEnabled={view !== 'compare-select' || isMapSelectionMode}

            onSelect={(id, name) => {
              if (view === 'compare-select' && id === selected?.id) {
                return
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

                comparison={
                  comparison
                }

                onSelectResult={async (item) => {
                  await handleMapSelect(item.id, item.name, false)
                  setIsMapSelectionMode(false)
                }}

                mapSelectionEnabled={isMapSelectionMode}

                onToggleMapSelection={() => {
                  setIsMapSelectionMode((enabled) => !enabled)
                }}

                onClearComparison={() => {
                  setComparison(null)
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
