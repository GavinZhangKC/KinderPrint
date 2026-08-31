import { useEffect, useState } from 'react'

import { api } from '../services/api'

import type { NeighbourhoodSearchResult } from '../services/api'

interface UseNeighbourhoodSearchOptions {
  onSelectResult: (item: NeighbourhoodSearchResult) => Promise<void>
}

export function useNeighbourhoodSearch({ onSelectResult }: UseNeighbourhoodSearchOptions) {
  const [search, setSearch] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [searchResults, setSearchResults] = useState<NeighbourhoodSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)

  useEffect(() => {
    if (!showSearchResults) return
    const timer = window.setTimeout(async () => {
      try {
        setSearchLoading(true)
        const response = await api.searchNeighbourhoods(search.trim())
        if (response.status === 'available' || response.status === 'limited') setSearchResults(response.data.slice(0, 8))
        else setSearchResults([])
      } catch (error) {
        console.error('Failed to search neighbourhoods:', error)
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, showSearchResults])

  async function handleSearchResultSelect(item: NeighbourhoodSearchResult) {
    setSearch(item.name)
    setShowSearchResults(false)
    await onSelectResult(item)
  }

  async function submitSearch() {
    const query = search.trim()
    if (!query) { setShowSearchResults(true); return }
    try {
      setSearchLoading(true)
      const response = await api.searchNeighbourhoods(query)
      if (response.status !== 'available' && response.status !== 'limited') {
        setSearchResults([]); setShowSearchResults(true); return
      }
      const results = response.data.slice(0, 8)
      setSearchResults(results)
      if (results.length === 0) { setShowSearchResults(true); return }
      const normalizedQuery = query.toLowerCase()
      const exactMatch = results.find((item) => item.name.toLowerCase() === normalizedQuery)
      await handleSearchResultSelect(exactMatch ?? results[0])
    } catch (error) {
      console.error('Failed to submit neighbourhood search:', error)
      setSearchResults([])
      setShowSearchResults(true)
    } finally {
      setSearchLoading(false)
    }
  }

  return { search, setSearch, showSearchResults, setShowSearchResults, searchResults, setSearchResults, searchLoading, handleSearchResultSelect, submitSearch }
}
