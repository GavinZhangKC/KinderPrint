import { useEffect, useState } from 'react'
import { api, type ApiEnvelope, type NeighbourhoodProfile, type NeighbourhoodPriority, type ProfileIndicator } from '../../services/api'

export type EvidenceState =
  | { status: 'loading' | 'error' | 'empty'; message: string }
  | { status: 'ready'; profile: ApiEnvelope<NeighbourhoodProfile>; priority: ApiEnvelope<NeighbourhoodPriority> | null; priorityError: string | null }

const usable = (status: string) => status === 'available' || status === 'limited'
let cached: Extract<EvidenceState, { status: 'ready' }> | null = null
let cachedAt = 0

export function validMetric(profile: NeighbourhoodProfile, id: string, unit: string) {
  const item = profile.domains.flatMap(domain => domain.indicators).find(indicator => indicator.id === id)
  if (!item || !usable(item.status) || typeof item.value !== 'number' || !Number.isFinite(item.value) || item.unit !== unit) return null
  if (!item.source || item.source === 'TBC' || !item.reference_year || item.reference_year === 'TBC' || item.geographic_unit !== profile.neighbourhood.geographic_unit) return null
  if ((unit === 'percent' && (item.value < 0 || item.value > 100)) || (unit === 'decile' && (item.value < 1 || item.value > 10))) return null
  return item as ProfileIndicator & { value: number }
}

export function formatMetric(item: ProfileIndicator & { value: number }) {
  const value = item.value.toLocaleString('en-AU', { maximumFractionDigits: item.unit === 'decile' || item.unit === 'count' ? 0 : 1 })
  return `${value}${item.unit === 'percent' ? '%' : item.unit === 'degrees Celsius' ? ' °C' : item.unit === 'decile' ? ' / 10' : ''}`
}

export function useInsightData() {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<EvidenceState>({ status: 'loading', message: 'Loading neighbourhood evidence…' })
  useEffect(() => {
    if (cached && Date.now() - cachedAt < 300_000) { setState(cached); return }
    const controller = new AbortController()
    let live = true
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    setState({ status: 'loading', message: 'Loading neighbourhood evidence…' })
    async function load() {
      try {
        // Reuse the existing lightweight map collection; never fetch all profiles.
        const collection = await api.getNeighbourhoodIndicators(attempt > 0)
        if (controller.signal.aborted) throw new Error('Request timed out')
        if (!usable(collection.status)) {
          if (live) setState({ status: 'empty', message: 'Neighbourhood evidence is currently unavailable. You can still read all seven chapters.' })
          return
        }
        // Stable and non-ranking: first supported ID, with an available AEDC value.
        const example = collection.data.neighbourhoods.filter(area => {
          const metric = area.indicators.aedc_vulnerable_one_or_more
          return usable(metric?.status ?? '') && typeof metric?.value === 'number' && Number.isFinite(metric.value)
        }).sort((a, b) => a.id.localeCompare(b.id, 'en'))[0]
        if (!example) {
          if (live) setState({ status: 'empty', message: 'No neighbourhood has a publishable AEDC vulnerability value. No example has been substituted.' })
          return
        }
        const [profileResult, priorityResult] = await Promise.allSettled([
          api.getProfile(example.id, controller.signal), api.getPriority(example.id, controller.signal),
        ])
        if (profileResult.status === 'rejected') throw profileResult.reason
        const profile = profileResult.value
        if (!usable(profile.status) || !profile.data?.domains?.length) {
          if (live) setState({ status: 'empty', message: 'The example profile is unavailable. No values have been estimated.' })
          return
        }
        const priority = priorityResult.status === 'fulfilled' && usable(priorityResult.value.status) && priorityResult.value.data?.neighbourhood.id === profile.data.neighbourhood.id ? priorityResult.value : null
        const result: Extract<EvidenceState, { status: 'ready' }> = {
          status: 'ready', profile, priority,
          priorityError: priority ? null : 'The investigation priority is unavailable. Explore the evidence without a priority label.',
        }
        if (live) { cached = result; cachedAt = Date.now(); setState(result) }
      } catch {
        if (live) setState({ status: 'error', message: 'We could not load the evidence. Check your connection and try again. The journey remains available.' })
      } finally { window.clearTimeout(timeout) }
    }
    void load()
    // Collection is shared with the map; profile and priority requests are abortable.
    return () => { live = false; controller.abort(); window.clearTimeout(timeout) }
  }, [attempt])
  return { state, retry: () => { cached = null; setAttempt(value => value + 1) } }
}
