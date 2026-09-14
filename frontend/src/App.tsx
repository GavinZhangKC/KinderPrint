import { useEffect, useRef, useState } from 'react'

import './styles.css'

import AboutUsPage from './components/AboutUsPage'
import BrandHeader from './components/BrandHeader'
import ComparePanel from './components/ComparePanel'
import DetailedComparison from './components/DetailedComparison'
import DetailedComparisonWeather, { getDevelopmentWeatherState } from './components/DetailedComparisonWeather'
import DetailedDataDrawer from './components/DetailedDataDrawer'
import InsightPage from './components/InsightPage'
import InteractiveAtmosphere from './components/InteractiveAtmosphere'
import Legend from './components/Legend'
import LandingPage from './components/LandingPage'
import MenuPage from './components/MenuPage'
import LocalitySuitabilityPanel from './components/LocalitySuitabilityPanel'
import NeighbourhoodMap from './components/NeighbourhoodMap'
import PreferencePanel from './components/PreferencePanel'
import ProfileModal from './components/ProfileModal'
import WaterRippleBackground from './components/WaterRippleBackground'

import { useNeighbourhoodSearch } from './hooks/useNeighbourhoodSearch'

import { api } from './services/api'
import { toNeighbourhood } from './services/profileAdapter'

import type {
  ApiEnvelope,
  EnvironmentalDifference,
  MultiNeighbourhoodComparison,
  OutcomeComparison,
  PatternInsight,
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

export default function App() {
const [appPage, setAppPage] =
    useState<AppPage>('landing')

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
  const [comparisonLimitations, setComparisonLimitations] =
    useState<string[]>([])
  const [outcomeComparison, setOutcomeComparison] =
    useState<ApiEnvelope<OutcomeComparison> | null>(null)
  const [environmentalDifference, setEnvironmentalDifference] =
    useState<ApiEnvelope<EnvironmentalDifference> | null>(null)
  const [outcomeComparisonError, setOutcomeComparisonError] = useState<string | null>(null)
  const [environmentalDifferenceError, setEnvironmentalDifferenceError] = useState<string | null>(null)
  const [patternInsight, setPatternInsight] =
    useState<ApiEnvelope<PatternInsight> | null>(null)
  const [patternInsightError, setPatternInsightError] = useState<string | null>(null)
  const [isMapSelectionMode, setIsMapSelectionMode] = useState(false)
  const compareRequestNumberRef = useRef(0)
  const profileRequestNumberRef = useRef(0)
  const [profileError, setProfileError] = useState<string | null>(null)
  const neighbourhoodSearchRef = useRef<HTMLDivElement>(null)

  const [preference, setPreference] =
    useState<PreferenceId | null>(null)

  const [suitabilityCriteria, setSuitabilityCriteria] =
    useState<string[]>([])
  const [suitabilityResults, setSuitabilityResults] =
    useState<Array<{ id: string; name: string; geographic_unit: string; score: number | null; status: string; criteria: string[] }>>([])
  const [suitabilityLoading, setSuitabilityLoading] = useState(false)
  const [suitabilityError, setSuitabilityError] = useState<string | null>(null)
  const [suitabilityNotice, setSuitabilityNotice] = useState<string | null>(null)
  const [isSuitabilityModalOpen, setIsSuitabilityModalOpen] = useState(false)
  const suitabilityModalRef = useRef<HTMLDivElement>(null)
  const suitabilityCloseButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (suitabilityCriteria.length === 0) {
      setSuitabilityResults([])
      setSuitabilityLoading(false)
      setSuitabilityError(null)
      setSuitabilityNotice(null)
      return
    }

    let isActive = true

    async function loadSuitableLocalities() {
      try {
        setSuitabilityLoading(true)
        setSuitabilityError(null)
        setSuitabilityNotice(null)

        const response = await api.getSuitableLocalities(suitabilityCriteria, 5)
        if (!isActive) {
          return
        }

        if (response.status !== 'available' && response.status !== 'limited') {
          setSuitabilityResults([])
          setSuitabilityError(response.limitations[0]?.message ?? 'Suitable localities are unavailable.')
          return
        }

        setSuitabilityResults(response.data.localities)
        setSuitabilityNotice(response.limitations[0]?.message ?? null)
      } catch (error) {
        if (!isActive) {
          return
        }

        setSuitabilityResults([])
        setSuitabilityNotice(null)
        setSuitabilityError(error instanceof Error ? error.message : 'Could not load suitability rankings.')
      } finally {
        if (isActive) {
          setSuitabilityLoading(false)
        }
      }
    }

    void loadSuitableLocalities()
    return () => {
      isActive = false
    }
  }, [suitabilityCriteria])

  useEffect(() => {
    if (!isSuitabilityModalOpen) {
      return
    }

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    suitabilityCloseButtonRef.current?.focus()

    const handleModalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSuitabilityModalOpen(false)
        return
      }

      if (event.key !== 'Tab' || !suitabilityModalRef.current) {
        return
      }

      const focusableElements = Array.from(
        suitabilityModalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      )

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (!firstElement || !lastElement) {
        event.preventDefault()
        return
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    window.addEventListener('keydown', handleModalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleModalKeyDown)
      previouslyFocused?.focus()
    }
  }, [isSuitabilityModalOpen])

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
    setComparisonLimitations([])
    setOutcomeComparison(null)
    setEnvironmentalDifference(null)
    setOutcomeComparisonError(null)
    setEnvironmentalDifferenceError(null)
    setPatternInsight(null)
    setPatternInsightError(null)
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
    resetExplore()
    setAppPage('landing')
  }
function openMapPage() {
    resetExplore()
    setAppPage('map')
  }
function openInsightPage() {
    resetExplore()
    setAppPage('insight')
  }
function openAboutUsSection() {
    resetExplore()
    setAppPage('landing')
    window.setTimeout(() => {
      document.getElementById('home-about')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
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
            || current.length >= 3
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
      setComparisonLimitations([])
      setOutcomeComparison(null)
      setEnvironmentalDifference(null)
      setOutcomeComparisonError(null)
      setEnvironmentalDifferenceError(null)
      setPatternInsight(null)
      setPatternInsightError(null)

      const selectedIds = [selected.id, ...comparisons.map((item) => item.id)]
      const pairedLocality = comparisons.length === 1 ? comparisons[0] : null
      const comparisonRequest = api.compare(selectedIds)
      const advancedRequests = pairedLocality
        ? Promise.allSettled([
            api.getOutcomeComparison(selected.id, pairedLocality.id),
            api.getEnvironmentalDifference(selected.id, pairedLocality.id),
            api.getPatternInsight(selected.id, pairedLocality.id),
          ])
        : Promise.resolve(null)
      const [response, advancedResults] = await Promise.all([
        comparisonRequest,
        advancedRequests,
      ])
      if (requestNumber !== compareRequestNumberRef.current) {
        return
      }

      if (response.status !== 'available' && response.status !== 'limited') {
        throw new Error(response.limitations[0]?.message ?? 'No approved comparison is available for these neighbourhoods.')
      }
      setComparisonResult(response.data)
      setComparisonLimitations(response.limitations.map((item) => item.message))
      if (advancedResults) {
        const [outcomeRequest, environmentRequest, patternRequest] = advancedResults
        if (outcomeRequest.status === 'fulfilled') {
          setOutcomeComparison(outcomeRequest.value)
        } else {
          setOutcomeComparisonError('Child development comparison data is currently unavailable.')
        }
        if (environmentRequest.status === 'fulfilled') {
          setEnvironmentalDifference(environmentRequest.value)
        } else {
          setEnvironmentalDifferenceError('Environmental comparison data is currently unavailable.')
        }
        if (patternRequest.status === 'fulfilled') {
          setPatternInsight(patternRequest.value)
        } else {
          setPatternInsightError('Pattern insight is currently unavailable.')
        }
      }
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
if (appPage === 'landing') {
    return (
      <div className="entry-pages">
        <WaterRippleBackground />
        <LandingPage
          onInsight={openInsightPage}
          onMap={openMapPage}
        />
      </div>
    )
  }

  if (appPage === 'menu') {
    return (
      <div className="entry-pages">
        <WaterRippleBackground />
        <MenuPage
          onInsight={openInsightPage}
          onMap={openMapPage}
          onAboutUs={() => setAppPage('about')}
        />
      </div>
    )
  }

  if (appPage === 'about') {
    return <AboutUsPage onHome={backToLanding} onInsight={openInsightPage} onMap={openMapPage} />
  }

  if (appPage === 'insight') {
    return (
      <InsightPage
        onLogoClick={backToLanding}
        onAboutUs={openAboutUsSection}
        onExploreMap={openMapPage}
      />
    )
  }

if (
    view === 'comparison' &&
    selected &&
    comparisons.length > 0 &&
    comparisonResult
  ) {
    const weatherState = getDevelopmentWeatherState(selected.priority)

    return (
      <div
        className="app-background detailed-background detailed-comparison-scene"
        data-state={weatherState}
      >
        <DetailedComparisonWeather state={weatherState} />
        <InteractiveAtmosphere mode="compare" />

        <BrandHeader
          activePage="map"
          onHome={backToLanding}
          onInsight={openInsightPage}
          onMap={resetExplore}
          onAboutUs={openAboutUsSection}
        />

        <DetailedComparison
          comparisonResult={comparisonResult}
          limitations={comparisonLimitations}
          outcomeComparison={outcomeComparison}
          outcomeError={outcomeComparisonError}
          environmentalDifference={environmentalDifference}
          environmentalError={environmentalDifferenceError}
          patternInsight={patternInsight}
          patternError={patternInsightError}
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
          onAboutUs={openAboutUsSection}
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

          <button
            type="button"
            className="glass suitability-launch-button"
            aria-haspopup="dialog"
            aria-expanded={isSuitabilityModalOpen}
            aria-controls="suitability-modal"
            onClick={() => setIsSuitabilityModalOpen(true)}
          >
            Find suitable areas
          </button>


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

                if (comparisons.length >= 3) {
                  setCompareError('You can compare up to four localities.')
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

      {isSuitabilityModalOpen && (
        <div className="suitability-modal-backdrop">
          <div
            id="suitability-modal"
            ref={suitabilityModalRef}
            className="suitability-modal-shell page-enter"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suitability-title"
          >
            <button
              ref={suitabilityCloseButtonRef}
              className="icon-close suitability-modal-close"
              type="button"
              onClick={() => setIsSuitabilityModalOpen(false)}
              aria-label="Close locality suitability"
            >
              ×
            </button>

            <LocalitySuitabilityPanel
              criteria={suitabilityCriteria}
              onToggle={(criterion) => {
                setSuitabilityCriteria((current) => {
                  if (current.includes(criterion)) {
                    return current.filter((item) => item !== criterion)
                  }

                  return [...current, criterion]
                })
              }}
              localities={suitabilityResults}
              loading={suitabilityLoading}
              error={suitabilityError}
              notice={suitabilityNotice}
              onSelectLocality={(id, name) => {
                setIsSuitabilityModalOpen(false)
                void handleMapSelect(id, name, true)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
