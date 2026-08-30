import type {
  NeighbourhoodPriority,
  NeighbourhoodProfile,
  ProfileIndicator,
} from './api'
import type { Neighbourhood, RiskBand } from '../types/neighbourhood'

function indicator(profile: NeighbourhoodProfile, id: string): ProfileIndicator | undefined {
  return profile.domains
    ?.flatMap((domain) => domain.indicators)
    .find((item) => item.id === id)
}

function numberValue(profile: NeighbourhoodProfile, id: string): number {
  const value = indicator(profile, id)?.value
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function heatBand(value: number): RiskBand {
  if (value >= 8) return 'High'
  if (value >= 6) return 'Moderate'
  return 'Low'
}

export function toNeighbourhood(
  profile: NeighbourhoodProfile,
  priority: NeighbourhoodPriority | null,
  fallbackId: string,
  fallbackName?: string,
): Neighbourhood {
  const indicators = profile.domains?.flatMap((domain) => domain.indicators) ?? []
  const referenceYears = Array.from(
    new Set(
      indicators
        .map((item) => item.reference_year)
        .filter((year): year is string | number => year !== null && year !== undefined)
        .map(String),
    ),
  ).sort()
  const sources = Array.from(
    new Set(
      indicators
        .map((item) => item.source)
        .filter((source): source is string => Boolean(source)),
    ),
  )
  const irsdDecile = numberValue(profile, 'seifa_irsd_decile')
  const priorityBand = priority?.priority_band ?? priority?.priority_level ?? priority?.level

  return {
    id: profile.neighbourhood?.id ?? fallbackId,
    name: profile.neighbourhood?.name ?? fallbackName ?? fallbackId,
    geographicUnit:
      profile.neighbourhood?.geographic_unit ?? 'SA2 (ASGS Edition 3, 2021)',
    referencePeriod: referenceYears.join('–') || 'Not available',
    childDevelopmentScore: Math.round(numberValue(profile, 'aedc_on_track_five')),
    developmentalVulnerability: Math.round(
      numberValue(profile, 'aedc_vulnerable_one_or_more'),
    ),
    socialDisadvantage:
      irsdDecile >= 8 ? 'Low' : irsdDecile >= 4 ? 'Moderate' : 'High',
    heatExposure: heatBand(numberValue(profile, 'env_urban_heat')),
    treeCanopy: Math.round(numberValue(profile, 'env_vegetation_cover')),
    greenSpaceAccess: Math.round(numberValue(profile, 'env_open_space_access')),
    priority:
      priorityBand === 'Higher'
        ? 'High'
        : priorityBand === 'Moderate'
          ? 'Moderate'
          : 'Low',
    keyInsight:
      'This profile uses the approved child-development, social and environmental indicators for the selected Greater Melbourne neighbourhood.',
    sources,
  }
}