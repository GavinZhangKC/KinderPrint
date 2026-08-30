import { useMemo, useState } from 'react'
import { getNeighbourhood, neighbourhoods, similarNeighbourhoods } from '../data/mockData'
import type { Neighbourhood } from '../types/neighbourhood'

interface ComparePanelProps {
  source: Neighbourhood
  comparison: Neighbourhood | null
  onSelectComparison: (neighbourhood: Neighbourhood | null) => void
  onBack: () => void
  onCompare: () => void
}

const PAGE_SIZE = 3

export default function ComparePanel({ source, comparison, onSelectComparison, onBack, onCompare }: ComparePanelProps) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)

  const suggestions = similarNeighbourhoods[source.id] ?? []
  const pageCount = Math.max(1, Math.ceil(suggestions.length / PAGE_SIZE))
  const visibleSuggestions = suggestions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []
    return neighbourhoods.filter((item) => item.id !== source.id && item.name.toLowerCase().includes(normalized)).slice(0, 4)
  }, [query, source.id])

  return (
    <aside className="glass compare-panel page-enter" aria-labelledby="compare-panel-title">
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
            onSelectComparison(null)
            setQuery(event.target.value)
          }}
        />
        <span className="search-glyph" aria-hidden="true">⌕</span>
      </div>
      {query && !comparison && (
        <div className="search-popover glass-subtle">
          {searchResults.length ? searchResults.map((item) => (
            <button type="button" key={item.id} onClick={() => { onSelectComparison(item); setQuery('') }}>{item.name}</button>
          )) : <span>No neighbourhood found</span>}
        </div>
      )}

      <section className="similar-section" aria-labelledby="similar-heading">
        <h2 id="similar-heading">Similar Neighbourhoods</h2>
        {suggestions.length ? (
          <>
            <p>Suggested areas with similar social and demographic characteristics.</p>
            <div className="similar-list">
              {visibleSuggestions.map((suggestion) => {
                const item = getNeighbourhood(suggestion.neighbourhoodId)
                if (!item) return null
                return (
                  <article className={`glass-subtle similar-row ${comparison?.id === item.id ? 'is-picked' : ''}`} key={item.id}>
                    <div><strong>{item.name}</strong><small>{suggestion.similarity}% similarity</small></div>
                    <button type="button" onClick={() => onSelectComparison(item)}>{comparison?.id === item.id ? 'Selected' : 'Select'}</button>
                  </article>
                )
              })}
            </div>
            {pageCount > 1 && (
              <div className="similar-pagination" aria-label="Similar neighbourhood pages">
                <button type="button" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>‹</button>
                <span>{page + 1} / {pageCount}</span>
                <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>›</button>
              </div>
            )}
          </>
        ) : (
          <div className="glass-subtle no-similar-state">No similar neighbourhoods were found for the selected area.</div>
        )}
      </section>

      <div className="or-divider"><span>OR</span><i /></div>
      <div className="glass-subtle select-map-card">
        <strong>Select directly on the map</strong>
        <p>Click another neighbourhood boundary. Hovered areas can highlight before selection.</p>
      </div>

      <div className="compare-actions">
        <button className="button secondary" type="button" onClick={onBack}>Back to Profile</button>
        <button className="button primary" type="button" disabled={!comparison} onClick={onCompare}>Compare</button>
      </div>
      {!comparison && <div className="selection-hint">Select a second neighbourhood to continue.</div>}
    </aside>
  )
}
