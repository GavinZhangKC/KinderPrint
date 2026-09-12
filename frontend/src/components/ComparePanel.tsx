import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'
import type { NeighbourhoodSearchResult } from '../services/api'
import type { Neighbourhood } from '../types/neighbourhood'

interface ComparePanelProps {
  source: Neighbourhood
  comparison: Neighbourhood | null
  onSelectResult: (result: NeighbourhoodSearchResult) => Promise<void>
  mapSelectionEnabled: boolean
  onToggleMapSelection: () => void
  onClearComparison: () => void
  onBack: () => void
  onCompare: () => Promise<void>
  compareLoading: boolean
  compareError: string | null
}

export default function ComparePanel({ source, comparison, onSelectResult, mapSelectionEnabled, onToggleMapSelection, onClearComparison, onBack, onCompare, compareLoading, compareError }: ComparePanelProps) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NeighbourhoodSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [recommended, setRecommended] = useState<NeighbourhoodSearchResult | null>(null)
  const [matchStrength, setMatchStrength] = useState<string | null>(null)
  const searchRequestNumberRef = useRef(0)

  useEffect(() => {
    const requestNumber = ++searchRequestNumberRef.current
    const normalized = query.trim()
    if (!normalized || comparison) {
      setSearchResults([])
      setSearchLoading(false)
      setSearchError(null)
      return
    }
    const timer = window.setTimeout(async () => {
      if (requestNumber !== searchRequestNumberRef.current) return
      try {
        setSearchLoading(true)
        setSearchError(null)
        const response = await api.searchNeighbourhoods(normalized)
        if (requestNumber !== searchRequestNumberRef.current) return
        setSearchResults(response.status === 'available' || response.status === 'limited'
          ? response.data.filter((item) => item.id !== source.id).slice(0, 4)
          : [])
      } catch (error) {
        if (requestNumber !== searchRequestNumberRef.current) return
        console.error('Failed to search comparison neighbourhoods:', error)
        setSearchResults([])
        setSearchError('Could not search neighbourhoods. Please try again.')
      } finally {
        if (requestNumber === searchRequestNumberRef.current) setSearchLoading(false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [comparison, query, source.id])

  useEffect(() => {
    let active = true
    void api.getMatch(source.id).then((response) => {
      if (!active) return
      if (response.status === 'available' || response.status === 'limited') {
        setRecommended(response.data.matched_neighbourhood)
        setMatchStrength(response.data.match_strength)
      } else {
        setRecommended(null)
        setMatchStrength(null)
      }
    }).catch((error) => {
      console.error('Failed to load recommended comparison:', error)
      if (active) {
        setRecommended(null)
        setMatchStrength(null)
      }
    })
    return () => { active = false }
  }, [source.id])

  async function choose(result: NeighbourhoodSearchResult) {
    if (result.id === source.id) {
      return
    }

    searchRequestNumberRef.current += 1
    setQuery('')
    setSearchResults([])
    setSearchLoading(false)
    setSearchError(null)
    await onSelectResult(result)
  }

  return (
    <aside className="glass compare-panel page-enter" aria-labelledby="compare-panel-title">
      <header className="compare-panel__header">
        <h1 id="compare-panel-title">Compare Neighbourhoods</h1>
        <p className="compare-intro">Keep {source.name} as your starting point, then search for or choose a recommended second neighbourhood.</p>
      </header>

      <div className="compare-panel-scroll compare-panel__body">
        <label className="panel-label">NEIGHBOURHOOD 1</label>
        <div className="glass-subtle selected-neighbourhood-row">
          <strong>{source.name}</strong>
          <span className="selected-pill">Selected</span>
        </div>

        <label className="panel-label" htmlFor="compare-search">NEIGHBOURHOOD 2</label>
        <div className="compare-search-wrap">
          <input
            id="compare-search"
            type="search"
            value={comparison ? comparison.name : query}
            placeholder="Search a neighbourhood"
            onChange={(event) => {
              searchRequestNumberRef.current += 1
              onClearComparison()
              setQuery(event.target.value)
              setSearchLoading(false)
              setSearchError(null)
            }}
          />
          <span className="search-glyph" aria-hidden="true">⌕</span>
        </div>
        {query && !comparison && (
          <div className="search-popover glass-subtle">
            {searchLoading ? <span>Searching...</span> : searchError ? <span className="search-error" role="alert">{searchError}</span> : searchResults.length ? searchResults.map((item) => (
              <button type="button" key={item.id} onClick={() => { void choose(item) }}>{item.name}</button>
            )) : <span>No neighbourhood found</span>}
          </div>
        )}

        <div className="or-divider" aria-hidden="true">
          <i />
          <span>OR</span>
          <i />
        </div>

        <button
          className={`glass-subtle select-map-card ${mapSelectionEnabled ? 'is-active' : ''}`}
          type="button"
          aria-pressed={mapSelectionEnabled}
          onClick={onToggleMapSelection}
        >
          <strong>{mapSelectionEnabled ? 'Selecting on the map…' : 'Select directly on the map'}</strong>
          <p>
            {mapSelectionEnabled
              ? 'Click a neighbourhood on the map, or click here to cancel.'
              : 'Click here first to enable neighbourhood selection on the map.'}
          </p>
        </button>

        <section className="similar-section" aria-labelledby="similar-heading">
          <h2 id="similar-heading">Similar Neighbourhoods</h2>
          {recommended ? (
            <div>
              <p>Suggested areas with similar social and demographic characteristics.</p>
              <div className="similar-list">
                <article className={`glass-subtle similar-row ${comparison?.id === recommended.id ? 'is-picked' : ''}`}>
                  <div><strong>{recommended.name}</strong><small>{matchStrength ?? 'Available'} match</small></div>
                  <button type="button" onClick={() => { void choose(recommended) }}>{comparison?.id === recommended.id ? 'Selected' : 'Select'}</button>
                </article>
              </div>
            </div>
          ) : (
            <div className="glass-subtle no-similar-state">No similar neighbourhoods were found for the selected area.</div>
          )}
        </section>
      </div>

      <footer className="compare-panel__footer">
        <div className="compare-actions">
          <button className="button secondary" type="button" onClick={onBack}>Back to Profile</button>
          <button className="button primary" type="button" disabled={!comparison || compareLoading} onClick={() => { void onCompare() }}>{compareLoading ? 'Comparing...' : 'Compare'}</button>
        </div>
        {compareError && <div className="selection-hint" role="alert">{compareError}</div>}
        {!comparison && <div className="selection-hint">Select a second neighbourhood to continue.</div>}
      </footer>
    </aside>
  )
}
