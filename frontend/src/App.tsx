import { useEffect, useState } from 'react'

import './styles.css'

import BrandHeader from './components/BrandHeader'
import ComparePanel from './components/ComparePanel'
import DetailedComparison from './components/DetailedComparison'
import DetailedDataDrawer from './components/DetailedDataDrawer'
import Legend from './components/Legend'
import NeighbourhoodMap from './components/NeighbourhoodMap'
import PreferencePanel from './components/PreferencePanel'
import ProfileModal from './components/ProfileModal'

import { api } from './services/api'
import { toNeighbourhood } from './services/profileAdapter'

import type {
  NeighbourhoodComparison,
  NeighbourhoodSearchResult,
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

export default function App() {
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

  const [mapComparisonEnabled, setMapComparisonEnabled] =
    useState(false)


  const [preference, setPreference] =
    useState<PreferenceId | null>(null)

  const [search, setSearch] =
    useState('')

  const [
    showSearchResults,
    setShowSearchResults,
  ] = useState(false)

  const [
    showDataDrawer,
    setShowDataDrawer,
  ] = useState(false)
const [
    mapSelectedId,
    setMapSelectedId,
  ] = useState<string | null>(null)
const [
    mapFocusId,
    setMapFocusId,
  ] = useState<string | null>(null)
const [
    searchResults,
    setSearchResults,
  ] = useState<NeighbourhoodSearchResult[]>([])

  const [
    searchLoading,
    setSearchLoading,
  ] = useState(false)
useEffect(() => {
    if (!showSearchResults) {
      return
    }

    const timer = window.setTimeout(
      async () => {
        try {
          setSearchLoading(true)

          const response =
            await api.searchNeighbourhoods(
              search.trim(),
            )

          if (
            response.status === 'available' ||
            response.status === 'limited'
          ) {
            setSearchResults(
              response.data.slice(0, 8),
            )
          } else {
            setSearchResults([])
          }
        } catch (error) {
          console.error(
            'Failed to search neighbourhoods:',
            error,
          )

          setSearchResults([])
        } finally {
          setSearchLoading(false)
        }
      },
      250,
    )

    return () => {
      window.clearTimeout(timer)
    }
  }, [
    search,
    showSearchResults,
  ])
function resetExplore() {
    setView('map')

    setSelected(null)
    setComparison(null)
    setMapComparisonEnabled(false)

    setMapSelectedId(null)
    setMapFocusId(null)

    setSearch('')
    setSearchResults([])
    setShowSearchResults(false)

    setShowDataDrawer(false)
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
async function handleSearchResultSelect(
    item: NeighbourhoodSearchResult,
  ) {
    setSearch(item.name)
    setShowSearchResults(false)
    await handleMapSelect(item.id, item.name, true)
  }
async function submitSearch() {
    const query = search.trim()

    if (!query) {
      setShowSearchResults(true)
      return
    }

    try {
      setSearchLoading(true)
const response =
        await api.searchNeighbourhoods(query)

      if (
        response.status !== 'available' &&
        response.status !== 'limited'
      ) {
        setSearchResults([])
        setShowSearchResults(true)
        return
      }

      const results =
        response.data.slice(0, 8)

      setSearchResults(results)

      if (results.length === 0) {
        setShowSearchResults(true)
        return
      }
const normalizedQuery =
        query.toLowerCase()

      const exactMatch =
        results.find(
          (item) =>
            item.name.toLowerCase() ===
            normalizedQuery,
        )

      await handleSearchResultSelect(
        exactMatch ?? results[0],
      )
    } catch (error) {
      console.error(
        'Failed to submit neighbourhood search:',
        error,
      )

      setSearchResults([])
      setShowSearchResults(true)
    } finally {
      setSearchLoading(false)
    }
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

    setMapComparisonEnabled(false)
    setComparison(null)

    setShowDataDrawer(false)

    setView('compare-select')
  }

  async function openComparisonResult() {
    if (
      !selected ||
      !comparison
    ) {
      return
    }

    try {
      setCompareLoading(true)
      setCompareError(null)
      const response = await api.compare(selected.id, comparison.id)
      if (response.status !== 'available' && response.status !== 'limited') {
        throw new Error(response.limitations[0]?.message ?? 'No approved comparison is available for these neighbourhoods.')
      }
      setComparisonResult(response.data)
      setComparisonLimitations(response.limitations.map((item) => item.message))
      setView('comparison')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      console.error('Failed to compare neighbourhoods:', error)
      setComparisonResult(null)
      setComparisonLimitations([])
      setCompareError(error instanceof Error ? error.message : 'Could not load this comparison.')
    } finally {
      setCompareLoading(false)
    }
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
          onExplore={resetExplore}
        />

        <DetailedComparison
          comparisonResult={comparisonResult}
          limitations={comparisonLimitations}
          onBack={() =>
            setView('compare-select')
          }
        />
      </div>
    )
  }
return (
    <div
      className="app-background"
      id="explore"
    >
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <BrandHeader
        onExplore={resetExplore}
      />

      <main className="map-shell">
        <section className="glass map-surface">

          {
}

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

            {
}

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

          {
}

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

            compareMode={
              view ===
              'compare-select' && mapComparisonEnabled
            }

            selectionEnabled={
              view !== 'compare-select' || mapComparisonEnabled
            }

            onSelect={(id, name) => {
              if (view === 'compare-select') {
                setMapComparisonEnabled(false)
              }
              void handleMapSelect(id, name)
            }}
          />

          {
}

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

          {
}

          {view === 'profile' && selected && (
            <div className={`profile-interaction-lock ${showDataDrawer ? 'has-data-drawer' : ''}`} aria-modal="true" role="dialog">
              <ProfileModal
                neighbourhood={
                  selected
                }

                onCompare={
                  startComparison
                }

                onExploreData={() =>
                  setShowDataDrawer(
                    true,
                  )
                }

                onClose={() =>
                  setView('map')
                }
              />
            </div>
          )}

          {
}

          {view ===
            'compare-select' &&
            selected &&
            !mapComparisonEnabled && (
              <ComparePanel
                source={selected}

                comparison={
                  comparison
                }

                onSelectResult={async (item) => {
                  await handleMapSelect(item.id, item.name, false)
                }}

                onClearComparison={() => {
                  setMapComparisonEnabled(false)
                  setComparison(null)
                  setCompareError(null)
                }}

                onBack={() => {
                  setMapComparisonEnabled(false)
                  setView('profile')
                }}

                onCompare={openComparisonResult}

                compareLoading={compareLoading}

                compareError={compareError}

                mapSelectionEnabled={mapComparisonEnabled}

                onToggleMapSelection={() => {
                  setMapComparisonEnabled((enabled) => !enabled)
                  setCompareError(null)
                }}
              />
            )}

          {view === 'compare-select' && mapComparisonEnabled && (
            <div className="glass map-selection-banner" role="status">
              <div>
                <strong>Choose neighbourhood 2</strong>
                <span>Click a neighbourhood boundary on the map.</span>
              </div>
              <button type="button" onClick={() => setMapComparisonEnabled(false)}>
                Cancel
              </button>
            </div>
          )}


          {showDataDrawer &&
            selected && (
              <DetailedDataDrawer
                neighbourhood={
                  selected
                }

                onClose={() =>
                  setShowDataDrawer(
                    false,
                  )
                }
              />
            )}

        </section>
      </main>
    </div>
  )
}
