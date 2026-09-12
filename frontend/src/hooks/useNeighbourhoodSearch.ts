import { useEffect, useRef, useState } from 'react'

import { api } from '../services/api'

import type { NeighbourhoodSearchResult } from '../services/api'

interface UseNeighbourhoodSearchOptions {
  onSelectResult: (item: NeighbourhoodSearchResult) => Promise<void>
}

export function useNeighbourhoodSearch({ onSelectResult }: UseNeighbourhoodSearchOptions) {
  const [search, setSearchValue] = useState('')
  const [showSearchResults, setShowSearchResultsValue] = useState(false)
  const [searchResults, setSearchResults] = useState<NeighbourhoodSearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const searchRequestNumberRef = useRef(0)

  function setSearch(value: string) {
    searchRequestNumberRef.current += 1
    setSearchValue(value)
    setSearchError(null)
  }

  function setShowSearchResults(show: boolean) {
    if (!show) {
      searchRequestNumberRef.current += 1
      setSearchLoading(false)
    }
    setShowSearchResultsValue(show)
  }

  useEffect(() => {
    const requestNumber = ++searchRequestNumberRef.current
    if (!showSearchResults) return
    const timer = window.setTimeout(async () => {
      if (requestNumber !== searchRequestNumberRef.current) return
      try {
        setSearchLoading(true)
        setSearchError(null)
        const response = await api.searchNeighbourhoods(search.trim())
        if (requestNumber !== searchRequestNumberRef.current) return
        if (response.status === 'available' || response.status === 'limited') setSearchResults(response.data.slice(0, 8))
        else setSearchResults([])
      } catch (error) {
        if (requestNumber !== searchRequestNumberRef.current) return
        console.error('Failed to search neighbourhoods:', error)
        setSearchResults([])
        setSearchError('Could not search neighbourhoods. Please try again.')
      } finally {
        if (requestNumber === searchRequestNumberRef.current) setSearchLoading(false)
      }
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, showSearchResults])

  async function handleSearchResultSelect(item: NeighbourhoodSearchResult) {
    searchRequestNumberRef.current += 1
    setSearchValue(item.name)
    setShowSearchResultsValue(false)
    setSearchLoading(false)
    setSearchError(null)
    await onSelectResult(item)
  }

  async function submitSearch() {
    const query = search.trim()
    if (!query) { setShowSearchResults(true); return }
    const requestNumber = ++searchRequestNumberRef.current
    try {
      setSearchLoading(true)
      setSearchError(null)
      const response = await api.searchNeighbourhoods(query)
      if (requestNumber !== searchRequestNumberRef.current) return
      if (response.status !== 'available' && response.status !== 'limited') {
        setSearchResults([]); setShowSearchResultsValue(true); return
      }
      const results = response.data.slice(0, 8)
      setSearchResults(results)
      if (results.length === 0) { setShowSearchResultsValue(true); return }
      const normalizedQuery = query.toLowerCase()
      const exactMatch = results.find((item) => item.name.toLowerCase() === normalizedQuery)
      await handleSearchResultSelect(exactMatch ?? results[0])
    } catch (error) {
      if (requestNumber !== searchRequestNumberRef.current) return
      console.error('Failed to submit neighbourhood search:', error)
      setSearchResults([])
      setShowSearchResultsValue(true)
      setSearchError('Could not search neighbourhoods. Please try again.')
    } finally {
      if (requestNumber === searchRequestNumberRef.current) setSearchLoading(false)
    }
  }

  return { search, setSearch, showSearchResults, setShowSearchResults, searchResults, setSearchResults, searchLoading, searchError, handleSearchResultSelect, submitSearch }
}
