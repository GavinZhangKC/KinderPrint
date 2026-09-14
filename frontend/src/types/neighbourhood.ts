export type PreferenceId = 'development' | 'heat' | 'social' | 'vegetation' | 'green-space'

export interface IndicatorProvenance {
  status: string
  source: string | null
  referenceYear: string | number | null
  geographicUnit: string | null
  dataQuality: string | null
  limitations: string[]
  notices: string[]
}

export interface Neighbourhood {
  id: string
  name: string
  geographicUnit: string
  referencePeriod: string
  childDevelopmentScore: number | null
  developmentalVulnerability: number | null
  socialDisadvantageDecile: number | null
  heatExposure: number | null
  treeCanopy: number | null
  greenSpaceAccess: number | null
  indicatorProvenance: Record<string, IndicatorProvenance>
  priority: string | null
  highlightedFactors: string[]
  sources: string[]
  dataQuality: string | null
  limitations: string[]
  notices: string[]
}

