import type {
  ApiLimitation,
  ApiNotice,
  EarlyChildhoodContext,
  NeighbourhoodExplanation,
  NeighbourhoodPriority,
  NeighbourhoodProfile,
  ProfileIndicator,
} from './api'
import type { Neighbourhood } from '../types/neighbourhood'

interface ProfileContext {
  metadata: Record<string, unknown>
  profileLimitations: ApiLimitation[]
  profileNotices: ApiNotice[]
  limitations: string[]
  notices: string[]
}

const INDICATOR_STATUS_LABELS: Record<string, string> = {
  available: 'Available',
  limited: 'Limited data',
  missing: 'Data missing',
  unavailable: 'Unavailable',
  suppressed: 'Suppressed',
}

export function indicatorStatusLabel(status: string) {
  return INDICATOR_STATUS_LABELS[status] ?? status
}

function indicator(profile: NeighbourhoodProfile, id: string): ProfileIndicator | undefined {
  return profile.domains
    ?.flatMap((domain) => domain.indicators)
    .find((item) => item.id === id)
}

function numberValue(profile: NeighbourhoodProfile, id: string): number | null {
  const item = indicator(profile, id)
  const value = item?.value
  const available = item?.status === 'available'
  return available && typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function toNeighbourhood(
  profile: NeighbourhoodProfile,
  priority: NeighbourhoodPriority | null,
  explanation: NeighbourhoodExplanation | null,
  earlyChildhood: EarlyChildhoodContext | null,
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
  const profileNotices = context.profileNotices
    .map((notice) => notice.message)
    .filter((message) => message && message !== 'TBC')
  const indicatorProvenance = Object.fromEntries(
    profile.domains.flatMap((domain) => domain.indicators).map((item) => [
      item.id,
      {
        status: item.status,
        source: item.source,
        referenceYear: item.reference_year,
        geographicUnit: item.geographic_unit,
        dataQuality,
        limitations: context.profileLimitations
          .filter((limitation) => limitation.affected_fields?.includes(item.id))
          .map((limitation) => limitation.message),
        notices: profileNotices,
      },
    ]),
  )
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
    activeEducationCareServices: earlyChildhood?.active_education_care_services ?? null,
    totalApprovedPlaces: earlyChildhood?.total_approved_places ?? null,
    kindergartenServices: earlyChildhood?.kindergarten_services ?? null,
    longDayCareServices: earlyChildhood?.long_day_care_services ?? null,
    serviceRatingCoverage: round(earlyChildhood?.rating_coverage_pct ?? null),
    indicatorProvenance,
    priority: priority?.priority_band ?? null,
    highlightedFactors,
    sources,
    dataQuality,
    limitations: context.limitations,
    notices: context.notices,
  }
}
