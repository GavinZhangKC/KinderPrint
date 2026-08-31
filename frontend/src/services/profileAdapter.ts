import type {
  NeighbourhoodExplanation,
  NeighbourhoodPriority,
  NeighbourhoodProfile,
  ProfileIndicator,
} from './api'
import type { Neighbourhood } from '../types/neighbourhood'

interface ProfileContext {
  metadata: Record<string, unknown>
  limitations: string[]
  notices: string[]
}

function indicator(profile: NeighbourhoodProfile, id: string): ProfileIndicator | undefined {
  return profile.domains
    ?.flatMap((domain) => domain.indicators)
    .find((item) => item.id === id)
}

function numberValue(profile: NeighbourhoodProfile, id: string): number | null {
  const item = indicator(profile, id)
  const value = item?.value
  const available = item?.status === 'available' || item?.status === 'limited'
  return available && typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function toNeighbourhood(
  profile: NeighbourhoodProfile,
  priority: NeighbourhoodPriority | null,
  explanation: NeighbourhoodExplanation | null,
  context: ProfileContext,
  fallbackId: string,
  fallbackName?: string,
): Neighbourhood {
  const referenceYears = Array.isArray(context.metadata.reference_years)
    ? context.metadata.reference_years
      .filter((year): year is string | number => typeof year === 'string' || typeof year === 'number')
      .map(String)
    : []
  const sources = Array.isArray(context.metadata.sources)
    ? context.metadata.sources.filter((source): source is string => typeof source === 'string')
    : []
  const highlightedIds = new Set(explanation?.highlighted_factor_ids ?? [])
  const highlightedFactors = explanation?.factor_domains
    .flatMap((domain) => domain.factors)
    .filter((factor) => highlightedIds.has(factor.id))
    .map((factor) => factor.name) ?? []
  const childDevelopmentScore = numberValue(profile, 'aedc_on_track_five')
  const developmentalVulnerability = numberValue(profile, 'aedc_vulnerable_one_or_more')
  const socialDisadvantageDecile = numberValue(profile, 'seifa_irsd_decile')
  const heatExposure = numberValue(profile, 'env_urban_heat')
  const treeCanopy = numberValue(profile, 'env_vegetation_cover')
  const greenSpaceAccess = numberValue(profile, 'env_open_space_access')
  const dataQuality = typeof context.metadata.data_quality === 'string'
    ? context.metadata.data_quality
    : null
  const round = (value: number | null) => value === null ? null : Math.round(value * 10) / 10

  return {
    id: profile.neighbourhood.id || fallbackId,
    name: profile.neighbourhood.name || fallbackName || fallbackId,
    geographicUnit:
      profile.neighbourhood.geographic_unit ?? 'Not available',
    referencePeriod: referenceYears.join('–') || 'Not available',
    childDevelopmentScore: round(childDevelopmentScore),
    developmentalVulnerability: round(developmentalVulnerability),
    socialDisadvantageDecile: round(socialDisadvantageDecile),
    heatExposure: round(heatExposure),
    treeCanopy: round(treeCanopy),
    greenSpaceAccess: round(greenSpaceAccess),
    priority: priority?.priority_band ?? null,
    highlightedFactors,
    sources,
    dataQuality,
    limitations: context.limitations,
    notices: context.notices,
  }
}