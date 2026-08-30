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


export interface ProfileIndicator {
  id?: string
  name?: string
  label?: string

  value?: number | string | null
  unit?: string | null

  status?: ApiStatus | string

  reference_value?: number | string | null
  reference_label?: string | null

  source?: string | null
  reference_year?: string | number | null

  [key: string]: unknown
}

export interface ProfileDomain {
  id: string
  name?: string
  indicators: ProfileIndicator[]
}

export interface NeighbourhoodProfile {
  neighbourhood?: {
    id: string
    name: string | null
    geographic_unit: string | null
  }

  child_development?: Record<
    string,
    ProfileIndicator | unknown
  >

  social?: Record<
    string,
    ProfileIndicator | unknown
  >

  environment?: Record<
    string,
    ProfileIndicator | unknown
  >

  domains?: ProfileDomain[]

  [key: string]: unknown
}


export interface NeighbourhoodPriority {
  neighbourhood?: {
    id: string
    name?: string | null
    geographic_unit?: string | null
  }

  priority_level?: string | null
  priority_band?: string | null
  level?: string | null

  label?: string | null

  [key: string]: unknown
}

export interface ExplanationFactor {
  id?: string
  name?: string
  label?: string

  prominence?: string | number | null
  value?: number | string | null

  [key: string]: unknown
}

export interface NeighbourhoodExplanation {
  neighbourhood?: {
    id: string
    name?: string | null
  }

  factors?: ExplanationFactor[]
  contributing_factors?: ExplanationFactor[]
  highlighted_factors?: ExplanationFactor[]

  [key: string]: unknown
}


export interface MatchNeighbourhood {
  id: string
  name?: string
  geographic_unit?: string

  similarity?: number | null
  similarity_score?: number | null

  [key: string]: unknown
}

export interface NeighbourhoodMatch {
  neighbourhood?: {
    id: string
    name?: string | null
  }

  matches?: MatchNeighbourhood[]

  match?: MatchNeighbourhood | null

  [key: string]: unknown
}


export interface NeighbourhoodComparison {
  neighbourhood_a?: Record<string, unknown>
  neighbourhood_b?: Record<string, unknown>

  comparison?: Record<string, unknown>

  [key: string]: unknown
}


const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? ''

async function request<T>(
  path: string,
): Promise<ApiEnvelope<T>> {
  const response = await fetch(
    `${API_BASE}${path}`,
    {
      method: 'GET',

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

  getProfile: (
    id: string,
  ) =>
    request<NeighbourhoodProfile>(
      `/api/neighbourhoods/${encodeURIComponent(
        id,
      )}/profile`,
    ),


  getPriority: (
    id: string,
  ) =>
    request<NeighbourhoodPriority>(
      `/api/neighbourhoods/${encodeURIComponent(
        id,
      )}/priority`,
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