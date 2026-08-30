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

import {
  getNeighbourhood,
  similarNeighbourhoods,
} from './data/mockData'

import { api } from './services/api'
import { toNeighbourhood } from './services/profileAdapter'

import type {
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
    const prototypeNeighbourhood = getNeighbourhood(id)

    if (prototypeNeighbourhood) {
      if (view === 'compare-select' && selected) {
        if (prototypeNeighbourhood.id !== selected.id) {
          setComparison(prototypeNeighbourhood)
        }
        return
      }

      choosePrimary(prototypeNeighbourhood)
      return
    }

    setMapSelectedId(id)
    setMapFocusId(focusMap ? id : null)
    setSearch(name ?? id)
    setShowSearchResults(false)

    try {
      const [profileResponse, priorityResponse] = await Promise.all([
        api.getProfile(id),
        api.getPriority(id),
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

    setComparison(null)

    setShowDataDrawer(false)

    setView('compare-select')
  }

  function openComparisonResult() {
    if (
      !selected ||
      !comparison
    ) {
      return
    }

    setView('comparison')

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }
const similarity =
    selected && comparison
      ? (
          similarNeighbourhoods[
            selected.id
          ] ?? []
        ).find(
          (item) =>
            item.neighbourhoodId ===
            comparison.id,
        )?.similarity ?? 70
      : 0
if (
    view === 'comparison' &&
    selected &&
    comparison
  ) {
    return (
      <div className="app-background detailed-background">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <BrandHeader
          onExplore={resetExplore}
        />

        <DetailedComparison
          a={selected}
          b={comparison}
          similarity={similarity}
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
              'compare-select'
            }

            onSelect={
              handleMapSelect
            }
          />

          {
}

          <div className="map-controls-row">
            <PreferencePanel
              value={preference}
              onChange={setPreference}
            />

            <Legend
              preference={preference}
            />
          </div>

          {
}

          {view === 'profile' && selected && (
            <div className="profile-interaction-lock" aria-modal="true" role="dialog">
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
            selected && (
              <ComparePanel
                source={selected}

                comparison={
                  comparison
                }

                onSelectComparison={
                  setComparison
                }

                onBack={() =>
                  setView('profile')
                }

                onCompare={
                  openComparisonResult
                }
              />
            )}

          {
}

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
