import { useEffect, useState } from 'react'
import { api } from '../services/api'
import type { NeighbourhoodSearchResult } from '../services/api'
import type { Neighbourhood } from '../types/neighbourhood'

interface ComparePanelProps {
  source: Neighbourhood
  comparison: Neighbourhood | null
  onSelectResult: (result: NeighbourhoodSearchResult) => Promise<void>
  onClearComparison: () => void
  onBack: () => void
  onCompare: () => Promise<void>
  compareLoading: boolean
  compareError: string | null
  mapSelectionEnabled: boolean
  onToggleMapSelection: () => void
}

export default function ComparePanel({ source, comparison, onSelectResult, onClearComparison, onBack, onCompare, compareLoading, compareError, mapSelectionEnabled, onToggleMapSelection }: ComparePanelProps) {
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<NeighbourhoodSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [recommended, setRecommended] = useState<NeighbourhoodSearchResult | null>(null)
  const [matchStrength, setMatchStrength] = useState<string | null>(null)

  useEffect(() => {
    const normalized = query.trim()
    if (!normalized || comparison) {
      setSearchResults([])
      return
    }
    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true)
        const response = await api.searchNeighbourhoods(normalized)
        setSearchResults(response.status === 'available' || response.status === 'limited'
          ? response.data.filter((item) => item.id !== source.id).slice(0, 4)
          : [])
      } catch (error) {
        console.error('Failed to search comparison neighbourhoods:', error)
        setSearchResults([])
      } finally {
        setSearchLoading(false)
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
    setQuery('')
    setSearchResults([])
    await onSelectResult(result)
  }

  return (
    <aside className="glass compare-panel page-enter" aria-labelledby="compare-panel-title">
      <div className="compare-panel-scroll">
      <div className="compare-panel-scroll">      
        <h1 id="compare-panel-title">Compare Neighbourhoods</h1>
        <p className="compare-intro">Keep {source.name} as your starting point, then search for or select a second neighbourhood on the map.</p>

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
              onClearComparison()
              setQuery(event.target.value)
            }}
          />
          <span className="search-glyph" aria-hidden="true">⌕</span>
        </div>
        {query && !comparison && (
          <div className="search-popover glass-subtle">
            {searchLoading ? <span>Searching...</span> : searchResults.length ? searchResults.map((item) => (
              <button type="button" key={item.id} onClick={() => { void choose(item) }}>{item.name}</button>
            )) : <span>No neighbourhood found</span>}
          </div>
        )}

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

        <div className="or-divider"><span>OR</span><i /></div>
        <button
          className={`glass-subtle select-map-card ${mapSelectionEnabled ? 'is-active' : ''}`}
          type="button"
          aria-pressed={mapSelectionEnabled}
          onClick={onToggleMapSelection}
        >
          <strong>{mapSelectionEnabled ? 'Map selection enabled' : 'Select directly on the map'}</strong>
          <p>{mapSelectionEnabled ? 'Now click a neighbourhood boundary on the map.' : 'Click here first to enable neighbourhood selection on the map.'}</p>
        </button>

        <div className="compare-actions">
          <button className="button secondary" type="button" onClick={onBack}>Back to Profile</button>
          <button className="button primary" type="button" disabled={!comparison || compareLoading} onClick={() => { void onCompare() }}>{compareLoading ? 'Comparing...' : 'Compare'}</button>
        </div>
        {compareError && <div className="selection-hint" role="alert">{compareError}</div>}
        {!comparison && <div className="selection-hint">Select a second neighbourhood to continue.</div>}
      </div>
      </div>
    </aside>
  )
}
