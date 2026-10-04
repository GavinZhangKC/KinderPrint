export type VerificationCategory =
  | 'Healthcare'
  | 'Green space'
  | 'Education'
  | 'Childcare'

export type CoverageStatus = 'within' | 'within-near-edge' | 'outside'

export interface VerifiedParkvilleLocation {
  id: string
  name: string
  category: VerificationCategory
  longitude: number
  latitude: number
  verification: 'verified' | 'approximate'
  coverage: CoverageStatus
  source: string
  sourceUrl: string
}

export const parkvilleCoverage = {
  longitude: 144.9574,
  latitude: -37.7953,
  radiusMetres: 780,
  source: 'Spatial filter used for the local Parkville building and road GeoJSON exports',
} as const

const landmarksSource = 'City of Melbourne — Landmarks and places of interest'
const landmarksSourceUrl = 'https://data.melbourne.vic.gov.au/explore/dataset/landmarks-and-places-of-interest-including-schools-theatres-health-services-spor/'
const childcareSource = 'City of Melbourne — Childcare centres'
const childcareSourceUrl = 'https://data.melbourne.vic.gov.au/explore/dataset/childcare-centres/'

export const verifiedParkvilleLocations: VerifiedParkvilleLocation[] = [
  {
    id: 'royal-childrens-hospital',
    name: "Royal Children's Hospital",
    category: 'Healthcare',
    longitude: 144.950048264678,
    latitude: -37.7942060847278,
    verification: 'verified',
    coverage: 'within',
    source: landmarksSource,
    sourceUrl: landmarksSourceUrl,
  },
  {
    id: 'royal-womens-hospital',
    name: "Royal Women's Hospital",
    category: 'Healthcare',
    longitude: 144.954897253856,
    latitude: -37.7988892460088,
    verification: 'verified',
    coverage: 'within',
    source: landmarksSource,
    sourceUrl: landmarksSourceUrl,
  },
  {
    id: 'royal-melbourne-hospital',
    name: 'Royal Melbourne Hospital',
    category: 'Healthcare',
    longitude: 144.956389746765,
    latitude: -37.7993071664096,
    verification: 'verified',
    coverage: 'within',
    source: landmarksSource,
    sourceUrl: landmarksSourceUrl,
  },
  {
    id: 'royal-park',
    name: 'Royal Park',
    category: 'Green space',
    longitude: 144.953834240647,
    latitude: -37.7906174256581,
    verification: 'verified',
    coverage: 'within',
    source: landmarksSource,
    sourceUrl: landmarksSourceUrl,
  },
  {
    id: 'university-high-school',
    name: 'University High School',
    category: 'Education',
    longitude: 144.956034449946,
    latitude: -37.7973136216903,
    verification: 'verified',
    coverage: 'within',
    source: landmarksSource,
    sourceUrl: landmarksSourceUrl,
  },
  {
    id: 'university-of-melbourne',
    name: 'University of Melbourne',
    category: 'Education',
    longitude: 144.96099520158,
    latitude: -37.7982892284927,
    verification: 'verified',
    coverage: 'within',
    source: landmarksSource,
    sourceUrl: landmarksSourceUrl,
  },
  {
    id: 'wimble-street-childcare',
    name: 'Wimble Street Child Care Co-Operative',
    category: 'Childcare',
    longitude: 144.9559548692,
    latitude: -37.794991054,
    verification: 'verified',
    coverage: 'within',
    source: childcareSource,
    sourceUrl: childcareSourceUrl,
  },
  {
    id: 'university-of-melbourne-childcare',
    name: 'University of Melbourne Child Care',
    category: 'Childcare',
    longitude: 144.9648702503,
    latitude: -37.7962508608,
    verification: 'verified',
    coverage: 'within',
    source: childcareSource,
    sourceUrl: childcareSourceUrl,
  },
  {
    id: 'melbourne-university-family-club',
    name: 'Melbourne University Family Club Co-Operative',
    category: 'Childcare',
    longitude: 144.9660561658,
    latitude: -37.7961021529,
    verification: 'verified',
    coverage: 'within-near-edge',
    source: childcareSource,
    sourceUrl: childcareSourceUrl,
  },
]
