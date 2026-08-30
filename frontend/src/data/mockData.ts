import type {
  MapArea,
  Neighbourhood,
  PreferenceOption,
  SimilarNeighbourhood,
} from '../types/neighbourhood'

export const neighbourhoods: Neighbourhood[] = [
  {
    id: 'A',
    name: 'Neighbourhood A',
    geographicUnit: 'SA2',
    referencePeriod: '2021–2024',
    childDevelopmentScore: 75,
    developmentalVulnerability: 21,
    socialDisadvantage: 'High',
    heatExposure: 'High',
    treeCanopy: 32,
    greenSpaceAccess: 58,
    priority: 'Moderate',
    keyInsight:
      'Strong child-development outcomes coexist with high heat exposure and higher relative disadvantage. These conditions occur together and may warrant further investigation.',
    sources: ['AEDC', 'ABS', 'Victorian environmental datasets'],
  },
  {
    id: 'B',
    name: 'Neighbourhood B',
    geographicUnit: 'SA2',
    referencePeriod: '2021–2024',
    childDevelopmentScore: 67,
    developmentalVulnerability: 30,
    socialDisadvantage: 'Moderate',
    heatExposure: 'Moderate',
    treeCanopy: 51,
    greenSpaceAccess: 78,
    priority: 'Moderate',
    keyInsight:
      'Neighbourhood B shows higher developmental vulnerability but stronger vegetation and green-space conditions than Neighbourhood A.',
    sources: ['AEDC', 'ABS', 'Victorian environmental datasets'],
  },
  {
    id: 'C',
    name: 'Neighbourhood C',
    geographicUnit: 'SA2',
    referencePeriod: '2021–2024',
    childDevelopmentScore: 71,
    developmentalVulnerability: 25,
    socialDisadvantage: 'Moderate',
    heatExposure: 'Low',
    treeCanopy: 44,
    greenSpaceAccess: 66,
    priority: 'Low',
    keyInsight:
      'Developmental outcomes are relatively strong and environmental exposure is lower than the selected reference area.',
    sources: ['AEDC', 'ABS', 'Victorian environmental datasets'],
  },
  {
    id: 'D',
    name: 'Neighbourhood D',
    geographicUnit: 'SA2',
    referencePeriod: '2021–2024',
    childDevelopmentScore: 63,
    developmentalVulnerability: 28,
    socialDisadvantage: 'High',
    heatExposure: 'High',
    treeCanopy: 39,
    greenSpaceAccess: 52,
    priority: 'High',
    keyInsight:
      'Higher disadvantage and heat exposure occur alongside lower vegetation coverage in this area.',
    sources: ['AEDC', 'ABS', 'Victorian environmental datasets'],
  },
  {
    id: 'E',
    name: 'Neighbourhood E',
    geographicUnit: 'SA2',
    referencePeriod: '2021–2024',
    childDevelopmentScore: 82,
    developmentalVulnerability: 15,
    socialDisadvantage: 'Low',
    heatExposure: 'Moderate',
    treeCanopy: 59,
    greenSpaceAccess: 85,
    priority: 'Low',
    keyInsight:
      'Most indicators are favourable relative to the prototype reference levels.',
    sources: ['AEDC', 'ABS', 'Victorian environmental datasets'],
  },
  {
    id: 'F',
    name: 'Neighbourhood F',
    geographicUnit: 'SA2',
    referencePeriod: '2021–2024',
    childDevelopmentScore: 58,
    developmentalVulnerability: 34,
    socialDisadvantage: 'High',
    heatExposure: 'Moderate',
    treeCanopy: 27,
    greenSpaceAccess: 41,
    priority: 'High',
    keyInsight:
      'Developmental vulnerability and lower vegetation coverage are both prominent investigation leads.',
    sources: ['AEDC', 'ABS', 'Victorian environmental datasets'],
  },
]

export const similarNeighbourhoods: Record<string, SimilarNeighbourhood[]> = {
  A: [
    { neighbourhoodId: 'B', similarity: 89 },
    { neighbourhoodId: 'C', similarity: 85 },
    { neighbourhoodId: 'D', similarity: 81 },
    { neighbourhoodId: 'F', similarity: 76 },
  ],
  B: [
    { neighbourhoodId: 'A', similarity: 89 },
    { neighbourhoodId: 'C', similarity: 84 },
    { neighbourhoodId: 'D', similarity: 80 },
  ],
  C: [
    { neighbourhoodId: 'A', similarity: 85 },
    { neighbourhoodId: 'B', similarity: 84 },
  ],
  D: [
    { neighbourhoodId: 'A', similarity: 81 },
    { neighbourhoodId: 'B', similarity: 80 },
  ],
  E: [],
  F: [],
}

export const preferenceOptions: PreferenceOption[] = [
  { id: 'development', label: 'Development' },
  { id: 'heat', label: 'Heat' },
  { id: 'social', label: 'Social Disadvantage' },
  { id: 'vegetation', label: 'Vegetation' },
  { id: 'green-space', label: 'Green Space' },
]

export const mapAreas: MapArea[] = [
  { neighbourhoodId: 'A', points: '110,128 265,84 344,151 305,270 149,285 78,214', development: 3, heat: 3, social: 3, vegetation: 2, greenSpace: 2 },
  { neighbourhoodId: 'B', points: '352,91 505,58 584,132 555,260 385,258 331,164', development: 2, heat: 2, social: 2, vegetation: 3, greenSpace: 3 },
  { neighbourhoodId: 'C', points: '606,85 770,95 842,182 775,283 610,260 567,150', development: 3, heat: 1, social: 2, vegetation: 2, greenSpace: 2 },
  { neighbourhoodId: 'D', points: '112,320 272,296 354,365 315,503 143,520 68,427', development: 2, heat: 3, social: 3, vegetation: 2, greenSpace: 2 },
  { neighbourhoodId: 'E', points: '383,306 558,292 620,384 568,510 390,505 329,394', development: 3, heat: 2, social: 1, vegetation: 3, greenSpace: 3 },
  { neighbourhoodId: 'F', points: '642,315 802,306 890,395 824,524 655,506 590,407', development: 1, heat: 2, social: 3, vegetation: 1, greenSpace: 1 },
]

export function getNeighbourhood(id: string | null | undefined): Neighbourhood | null {
  if (!id) return null
  return neighbourhoods.find((item) => item.id === id) ?? null
}
