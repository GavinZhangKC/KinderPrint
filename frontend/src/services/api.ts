export type ApiStatus =
  | 'available'
  | 'missing'
  | 'incompatible'
  | 'unavailable'
  | 'limited'
  | 'no_match'

export interface ApiLimitation {
  code: string
  message: string
  affected_fields?: string[]
}

export interface ApiNotice {
  code: string
  message: string
}

export interface ApiEnvelope<T> {
  status: ApiStatus
  data: T
  metadata: Record<string, unknown>
  limitations: ApiLimitation[]
  notices: ApiNotice[]
}

export interface NeighbourhoodSearchResult {
  id: string
  name: string
  geographic_unit: string
}



export interface BoundaryProperties {
  id: string
  name: string
  geographic_unit: string
  source?: string
  boundary_version?: string
  development?: number | null
  heat?: number | null
  social?: number | null
  vegetation?: number | null
  green_space?: number | null
}

export interface PolygonGeometry {
  type: 'Polygon'
  coordinates: number[][][]
}

export interface MultiPolygonGeometry {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}

export type BoundaryGeometry =
  | PolygonGeometry
  | MultiPolygonGeometry

export interface BoundaryFeature {
  type: 'Feature'
  properties: BoundaryProperties
  geometry: BoundaryGeometry
}

export interface BoundaryFeatureCollection {
  type: 'FeatureCollection'
  features: BoundaryFeature[]
}

export interface BoundaryDetail {
  neighbourhood: {
    id: string
    name: string | null
    geographic_unit: string | null
  }

  geometry: BoundaryGeometry | null
}

export interface MapIndicatorValue {
  value: number | null
  status: ApiStatus | string
}

export interface NeighbourhoodMapIndicators {
  id: string
  geographic_unit: string
  indicators: Record<string, MapIndicatorValue>
}

export interface NeighbourhoodIndicatorsCollection {
  neighbourhoods: NeighbourhoodMapIndicators[]
}


export interface ProfileIndicator {
  id: string
  name: string
  value: number | string | null
  unit: string | null
  status: ApiStatus | string
  source: string | null
  reference_year: string | number | null
  geographic_unit: string | null
}

export interface ProfileDomain {
  id: string
  name?: string
  indicators: ProfileIndicator[]
}

export interface NeighbourhoodProfile {
  neighbourhood: {
    id: string
    name: string | null
    geographic_unit: string | null
  }
  domains: ProfileDomain[]
}

export interface NeighbourhoodPriority {
  neighbourhood: {
    id: string
    name?: string | null
    geographic_unit?: string | null
  }

  priority_band: string | null
  contributing_domains: string[]

}

export interface ExplanationFactor {
  id: string
  name: string
  value: number | string | null
  status: ApiStatus | string
  source: string
  geographic_unit: string
  reference_year: string | number
}

export interface NeighbourhoodExplanation {
  neighbourhood: {
    id: string
    name: string | null
  }
  factor_domains: Array<{
    domain: string
    factors: ExplanationFactor[]
  }>
  highlighted_factor_ids: string[]
  incomplete_inputs: string[]
}


export interface NeighbourhoodMatch {
  source_neighbourhood: NeighbourhoodSearchResult
  matched_neighbourhood: NeighbourhoodSearchResult | null
  similarity_basis: string[]
  match_strength: string | null
}

export interface ComparisonField {
  id: string
  name: string
  source_value: number | string | null
  comparison_value: number | string | null
  source_status: ApiStatus | string
  comparison_status: ApiStatus | string
}


export interface NeighbourhoodComparison {
  source_neighbourhood: NeighbourhoodSearchResult
  comparison_neighbourhood: NeighbourhoodSearchResult
  side_by_side: ComparisonField[]
  similarity_basis: string[]
  match_strength: string | null
}


const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(
  path: string,
  signal?: AbortSignal,
): Promise<ApiEnvelope<T>> {
  const response = await fetch(
    `${API_BASE}${path}`,
    {
      method: 'GET',
      signal,

      headers: {
        Accept: 'application/json',
      },
    },
  )

  if (!response.ok) {
    throw new Error(
      `Request failed with status ${response.status}`,
    )
  }

  return response.json() as Promise<
    ApiEnvelope<T>
  >
}

// The map and Insight share this small collection, including in-flight requests.
let indicatorsCache: Promise<ApiEnvelope<NeighbourhoodIndicatorsCollection>> | null = null
let indicatorsCachedAt = 0
function getNeighbourhoodIndicators(refresh = false) {
  if (!refresh && indicatorsCache && Date.now() - indicatorsCachedAt < 300_000) return indicatorsCache
  indicatorsCachedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  indicatorsCache = request<NeighbourhoodIndicatorsCollection>('/api/neighbourhoods/indicators', controller.signal)
    .then(response => {
      if (response.status !== 'available' && response.status !== 'limited') indicatorsCache = null
      return response
    }).catch(error => { indicatorsCache = null; throw error })
    .finally(() => clearTimeout(timeout))
  return indicatorsCache
}

export const api = {


  searchNeighbourhoods: (
    query: string,
  ) =>
    request<NeighbourhoodSearchResult[]>(
      `/api/neighbourhoods/search?q=${encodeURIComponent(
        query,
      )}`,
    ),

  getBoundaries: (
    bbox: string,
  ) =>
    request<BoundaryFeatureCollection>(
      `/api/neighbourhoods/boundaries?bbox=${encodeURIComponent(
        bbox,
      )}`,
    ),

  getBoundary: (
    id: string,
  ) =>
    request<BoundaryDetail>(
      `/api/neighbourhoods/${encodeURIComponent(
        id,
      )}/boundary`,
    ),

  getNeighbourhoodIndicators,

  getProfile: (
    id: string,
    signal?: AbortSignal,
  ) =>
    request<NeighbourhoodProfile>(
      `/api/neighbourhoods/${encodeURIComponent(
        id,
      )}/profile`, signal,
    ),


  getPriority: (
    id: string,
    signal?: AbortSignal,
  ) =>
    request<NeighbourhoodPriority>(
      `/api/neighbourhoods/${encodeURIComponent(
        id,
      )}/priority`, signal,
    ),

  getExplanation: (
    id: string,
  ) =>
    request<NeighbourhoodExplanation>(
      `/api/neighbourhoods/${encodeURIComponent(
        id,
      )}/explanation`,
    ),

  getMatch: (
    id: string,
  ) =>
    request<NeighbourhoodMatch>(
      `/api/neighbourhoods/${encodeURIComponent(
        id,
      )}/match`,
    ),


  compare: (
    a: string,
    b: string,
  ) =>
    request<NeighbourhoodComparison>(
      `/api/compare?neighbourhood_id_a=${encodeURIComponent(
        a,
      )}&neighbourhood_id_b=${encodeURIComponent(
        b,
      )}`,
    ),
}
