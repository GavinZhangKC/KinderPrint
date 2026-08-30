export type RiskBand = 'Low' | 'Moderate' | 'High'
export type SemanticStatus = 'Strong' | 'Moderate' | 'Concern'
export type PriorityBand = 'Low' | 'Moderate' | 'High'
export type PreferenceId = 'development' | 'heat' | 'social' | 'vegetation' | 'green-space'

export interface Neighbourhood {
  id: string
  name: string
  geographicUnit: string
  referencePeriod: string
  childDevelopmentScore: number
  developmentalVulnerability: number
  socialDisadvantage: RiskBand
  heatExposure: RiskBand
  treeCanopy: number
  greenSpaceAccess: number
  priority: PriorityBand
  keyInsight: string
  sources: string[]
}

export interface SimilarNeighbourhood {
  neighbourhoodId: string
  similarity: number
}

export interface MapArea {
  neighbourhoodId: string
  points: string
  development: number
  heat: number
  social: number
  vegetation: number
  greenSpace: number
}

export interface PreferenceOption {
  id: PreferenceId
  label: string
}
