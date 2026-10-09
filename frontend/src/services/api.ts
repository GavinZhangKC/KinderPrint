export type ApiStatus =
  | 'available'
  | 'missing'
  | 'incompatible'
  | 'unavailable'
  | 'limited'
  | 'suppressed'
  | 'no_match'
  | 'no_pattern'

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

export interface EarlyChildhoodServices {
  neighbourhood_id: string
  neighbourhood_name: string
  active_education_care_services: number | null
  exact_match_services: number | null
  high_confidence_match_services: number | null
  services_with_approved_places: number | null
  total_approved_places: number | null
  long_day_care_services: number | null
  kindergarten_services: number | null
  services_with_current_rating: number | null
  rating_coverage_pct: number | null
  status: string
}

export interface PopulationProjection {
  sa2_code: string
  sa2_name: string
  projection_year: number
  sex: string
  population_age_0_4_projected: number | null
  population_age_5_9_projected: number | null
  population_age_10_14_projected: number | null
  population_age_0_9_projected: number | null
  population_age_0_14_projected: number | null
  population_all_ages_projected: number | null
  status: string
}

export interface PopulationProjectionResponse {
  projections: PopulationProjection[]
}

export interface VcamsAreaIndicator {
  reference_year: number
  area_name: string
  geography: string
  indicator_id: string
  indicator_label: string
  age_group: string
  percent: number | null
  rse_percent: number | null
  quality_flag: string
  geography_warning: string
}

export interface VcamsLgaIndicator {
  reference_period: string
  lga_code: string
  lga_name: string
  geography: string
  indicator_id: string
  numerator: number | null
  denominator: number | null
  percent: number | null
  publication_status: string
  geography_warning: string
}

export interface HealthFacility {
  facility_id: string
  name: string
  category: string
  service_type: string
  address: string
  longitude: number | null
  latitude: number | null
  source_date: string
}

export interface ChildHealthSa2Indicator {
  sa2_code_2021: string
  sa2_name_2021: string
  reference_year: number
  age_group: string
  indicator: string
  count: number | null
  population_denominator: number | null
  percent: number | null
  geography: string
  quality_flag: string
  source_id: string
}

export interface ChildHealthPhaIndicator {
  pha_code_2021: string
  pha_name_2021: string
  indicator_id: string
  reference_period: string
  methodology_class: string
  count_or_numerator: number | null
  denominator: number | null
  rate_or_percent: number | null
  lower_95_ci: number | null
  upper_95_ci: number | null
  standardised_ratio?: number | null
  publication_status: string
  source_id: string
  geography_warning: string
}

export interface ChildHealthContext {
  locality: { sa2_code: string; sa2_name: string; pha_code: string | null; pha_name: string | null } | null
  sa2_indicators: ChildHealthSa2Indicator[]
  pha_context: ChildHealthPhaIndicator[]
}

export interface ImmunisationIndicator {
  indicator_id: 'immunised_age_1' | 'immunised_age_2' | 'immunised_age_5'
  age: string
  reference_period: string
  pha: { percent: number | null; numerator: number | null; denominator: number | null; publication_status: string }
  victoria: { numerator: number; denominator: number; percent: number; pha_count: number } | null
  pha_percentile_in_victoria: number | null
  national_aspirational_target: number
  gap_to_target: number | null
}

export interface ImmunisationContext {
  locality: { sa2_code: string; sa2_name: string; pha_code: string; pha_name: string } | null
  indicators: ImmunisationIndicator[]
}

export interface DepartmentAreaIndicator {
  indicator_id: string
  indicator_label: string
  age_group: string
  reference_year: number
  area: { percent: number | null; rse_percent: number | null; quality_flag: string }
  department_areas: { count: number; lowest: number; median: number; highest: number } | null
  area_rank_highest_first: number | null
}

export interface WeightIndicator {
  indicator_id: 'child_overweight_not_obese' | 'child_obese'
  reference_period: string
  methodology_class: string
  pha: { percent: number | null; lower_95_ci: number | null; upper_95_ci: number | null; count: number | null }
  victoria: { percent: number; pha_count: number } | null
}

export interface NutritionContext {
  locality: { sa2_code: string; sa2_name: string; lga_name: string | null; department_area: string | null; pha_name: string | null } | null
  vcams: DepartmentAreaIndicator[]
  weight: WeightIndicator[]
}

export interface PreventionContext {
  locality: { sa2_code: string; sa2_name: string | null; department_area: string | null } | null
  bushfire: { bushfire_prone_pct: number | null; area_sqkm: number | null } | null
  transport: {
    public_transport_stop_count: number | null
    declared_road_length_km: number | null
    declared_road_traffic_intensity: number | null
    traffic_intensity_percentile: number | null
    sa2_compared: number
  } | null
  vcams: DepartmentAreaIndicator[]
}

export interface SeasonalAirMonth {
  month: number
  valid_days: number
  mean_daily_ug_m3: number
  days_above_standard: number
  highest_daily_ug_m3: number
  highest_daily_date: string
}

export interface SeasonalAir {
  station: {
    name: string
    distance_km: number
    pollutant: string
    standard_ug_m3: number
    first_year: number
    last_year: number
  } | null
  months: SeasonalAirMonth[]
}

export type VaccinationPlaceKind = 'general_practice' | 'pharmacy' | 'maternal_child_health'

export interface VaccinationPlace {
  kind: VaccinationPlaceKind
  rank: number
  name: string
  address: string
  suburb: string
  longitude: number
  latitude: number
  distance_km: number
  source_date: string
}

export interface VaccinationPlaces {
  origin: { longitude: number; latitude: number } | null
  places: VaccinationPlace[]
  council: { lga_name: string; council_name: string; immunisation_url: string; phone: string; retrieved: string } | null
}

export interface NearbyService {
  service_type: string
  category: string
  name: string
  address: string
  longitude: number
  latitude: number
  distance_km: number
  count_within_5km: number
  source_date: string
}

export interface CompareHospital {
  id: string
  name: string
  sector: 'public' | 'private'
  distance_km: number
  latitude: number
  longitude: number
  specialised_units: string[]
  has_paediatric_service: boolean
  has_neonatal_intensive_care: boolean
  has_obstetric_service: boolean
  emergency_department: {
    on_time_pct: { resuscitation: number | null; emergency: number | null; urgent: number | null; semi_urgent: number | null; non_urgent: number | null }
    departed_within_4h_pct: number | null
    median_minutes: number | null
    ninetieth_percentile_minutes: number | null
    period: string
  } | null
  elective_surgery_median_days: { urgent: number | null; semi_urgent: number | null; non_urgent: number | null; period: string } | null
}

export interface CompareClinic {
  id: string
  name: string
  address: string
  phone: string
  listing_url: string
  cost: string
  distance_km: number
  latitude: number
  longitude: number
}

export interface AreaCostService {
  service: string
  demographic: string
  patients: number | null
  services_per_100: number | null
  percent_people: number | null
  patient_contribution_per_service: number | null
  benefit_share_of_fees_pct: number | null
  national_patient_contribution_per_service: number | null
  national_services_per_100: number | null
}

export interface PractitionerDevelopment {
  community_id: string
  community_name: string
  children_assessed: number | null
  observed_vulnerable_pct: number | null
  expected_vulnerable_pct: number | null
  expected_range_pct: [number | null, number | null]
  priority_band: 'Higher' | 'Moderate' | 'Lower'
  band_stability: number | null
  expectation_drivers: string[]
  model_version: string
}

export interface SpatialAccess {
  access_5km: number | null
  percentile: number | null
  nearest_km: number | null
  unit: string
}

export interface PractitionerContext {
  sa2_code: string
  sa2_name?: string
  development: PractitionerDevelopment | null
  access: { general_practice: SpatialAccess; early_childhood_education_and_care: SpatialAccess } | null
}

export interface CompareCare {
  hospitals: CompareHospital[]
  urgent_care_clinics: CompareClinic[]
  area_cost: { sa3_code: string; sa3_name: string; reference_period: string; services: AreaCostService[] } | null
}

export interface SeasonalIllness {
  diseases: Array<{
    id: string
    label: string
    reference_years: string
    months: Array<{ month: number; children_average: number; children_share_pct: number; all_ages_average: number; all_ages_share_pct: number }>
  }>
}

export interface NutrientTarget {
  nutrient_id: string
  nutrient: string
  unit: string
  basis: string
  age_1_3: number
  age_4_8: number
  age_9_13_boys: number
  age_9_13_girls: number
  why_it_matters: string
  source_url: string
}

export interface NutrientFood {
  nutrient_id: string
  nutrient: string
  unit: string
  rank: number
  food_key: string
  food_name: string
  food_group: string
  amount_per_100g: number
}

export interface FoodOutlet {
  osm_id: string
  name: string
  outlet_type: string
  organic: boolean
  address: string
  opening_hours: string
  latitude: number
  longitude: number
  distance_km: number
}

export interface NutritionReport {
  targets: NutrientTarget[]
  foods: NutrientFood[]
  outlets: FoodOutlet[] | null
  access: Array<{ outlet_type: string; within_1km: number; within_2km: number; nearest_km: number | null }> | null
}

export interface ContextMetric {
  value: number | null
  status: ApiStatus | string
}

export interface ContextMetricDefinition {
  name: string
  unit: string
  definition: string
}

export interface NeighbourhoodContext {
  neighbourhood: NeighbourhoodSearchResult
  metrics: Record<string, ContextMetric>
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
  incomplete_inputs: Array<{
    indicator: string
    reason: string
  }>
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

export interface MultiComparisonValue {
  neighbourhood_id: string
  value: number | string | null
  status: ApiStatus | string
}

export interface MultiComparisonField {
  id: string
  name: string
  unit: string | null
  source: string | null
  reference_year: string | number | null
  geographic_unit: string | null
  values: MultiComparisonValue[]
}

export interface MultiNeighbourhoodComparison {
  neighbourhoods: NeighbourhoodSearchResult[]
  side_by_side: MultiComparisonField[]
  similarity_basis: string[]
  match_strength: string | null
}

export interface ApprovedComparisonValue {
  value: number | string | null
  status: ApiStatus | string
}

export interface ApprovedComparisonIndicator {
  id: string
  name: string
  unit: string | null
  neighbourhood_a: ApprovedComparisonValue
  neighbourhood_b: ApprovedComparisonValue
  approved_difference: ApprovedComparisonValue
  source: string | null
  reference_year: string | number | null
  geographic_unit?: string | null
}

export interface OutcomeComparison {
  neighbourhood_a: NeighbourhoodSearchResult
  neighbourhood_b: NeighbourhoodSearchResult
  outcome_indicators: ApprovedComparisonIndicator[]
}

export interface EnvironmentalDifference {
  neighbourhood_a: NeighbourhoodSearchResult
  neighbourhood_b: NeighbourhoodSearchResult
  environmental_indicators: ApprovedComparisonIndicator[]
  approved_standout_indicator_ids: string[]
}

export interface PatternInsightItem {
  id: string
  title: string
  description: string
  status: ApiStatus | string
  confidence: ApprovedComparisonValue
  quality: ApprovedComparisonValue
  stability: ApprovedComparisonValue
  supporting_outcome_indicator_ids: string[]
  supporting_environmental_indicator_ids: string[]
}

export interface PatternInsight {
  neighbourhood_a: NeighbourhoodSearchResult
  neighbourhood_b: NeighbourhoodSearchResult
  patterns: PatternInsightItem[]
  supporting_outcome_indicators: ApprovedComparisonIndicator[]
  supporting_environmental_indicators: ApprovedComparisonIndicator[]
}

export interface SuitableLocality {
  id: string
  name: string
  geographic_unit: string
  score: number | null
  status: ApiStatus | string
  criteria: string[]
  measures: Record<string, number | null>
  criterion_scores: Record<string, number | null>
  limitations: ApiLimitation[]
}

export interface SuitableLocalitiesResponse {
  localities: SuitableLocality[]
  criteria: string[]
  limit: number
  withheld_count: number
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

/** Like request(), but a 4xx that carries an envelope (e.g. an unknown area) is returned, not thrown,
 *  so the page can show the server's plain-language reason. */
async function requestEnvelope<T>(path: string, signal?: AbortSignal): Promise<ApiEnvelope<T>> {
  const response = await fetch(`${API_BASE}${path}`, { method: 'GET', signal, headers: { Accept: 'application/json' } })
  if (response.ok) return response.json() as Promise<ApiEnvelope<T>>
  if (response.status >= 400 && response.status < 500) {
    const body = await response.json().catch(() => null) as ApiEnvelope<T> | null
    if (body && typeof body === 'object' && 'status' in body && Array.isArray(body.limitations)) return body
  }
  throw new Error(`Request failed with status ${response.status}`)
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


export type FamilyFitLevel = 'prefer' | 'essential'
export interface FamilyFitNeed {
  id: string
  label: string
  measures: Array<{ id: string; direction: 1 | -1 }>
  explains: string
  does_not_confirm: string
}
export interface FamilyFitPlace { id: string; name: string; sa3: string }
export interface FamilyFitValidation {
  old_engine_largest_two_measures_share: number
  new_engine_measure_share_range: [number, number]
  adjustment_error_reduction_range: [number, number]
  adjustment_small_area_error_reduction_range: [number, number]
  gp_border_credit: [number, number]
  forecast_model: string
  forecast_skill_vs_persistence: number
  forecast_holdout_mae_pp: number
  forecast_holdout_spearman: number
  forecast_holdout_coverage_80: number
  areas_scored_on_every_need: number
  areas: number
}
export interface FamilyFitSetup {
  needs: FamilyFitNeed[]
  places: FamilyFitPlace[]
  essential_percentile: number
  weights: Record<FamilyFitLevel, number>
  model_version: string
  built_utc: string
  radii_km: number[]
  validation: FamilyFitValidation
}
export interface FamilyFitOutlook { pct: number; lower80: number; upper80: number }
export interface FamilyFitResult {
  rank: number
  id: string
  name: string
  sa3: string
  latitude: number
  longitude: number
  distance_km: number
  match: number
  reasons: Array<{ need: string; label: string; percentile: number; phrase: string }>
  limitation:
    | { type: 'weaker_priority'; need: string; label: string; percentile: number; phrase: string }
    | { type: 'does_not_confirm'; need: string; label: string; text: string }
  stability: { share: number; label: 'stable' | 'fairly_stable' | 'could_change' } | null
  school_entry_change: { pp: number | null; flag: 'up' | 'down' | 'no_clear_change' | 'not_available' }
  outlook_2027: FamilyFitOutlook | null
}
export type FamilyFitMapStatus = 'top' | 'match' | 'filtered_out' | 'no_data' | 'outside'
export interface FamilyFitSearch {
  anchor: { id: string; name: string; latitude: number; longitude: number }
  radius_km: number
  priorities: Record<string, FamilyFitLevel>
  counts: { within_distance: number; matching: number; below_essential: number; data_unavailable: number }
  results: FamilyFitResult[]
  more_available: number
  map: Array<{ id: string; status: FamilyFitMapStatus }>
  suggestions: Array<{ type: 'make_preferred'; need: string; label: string; results: number } | { type: 'widen_distance'; radius_km: number; results: number }>
  confidence: { draws: number; measures_varied: string[] }
}
export interface FamilyFitAreaDetail {
  id: string
  name: string
  sa3: string
  sa4: string
  latitude: number
  longitude: number
  needs: Array<Omit<FamilyFitNeed, 'measures'> & { percentile: number | null; phrase: string | null; measures: Array<{ id: string; direction: 1 | -1; value: number | null; percentile: number | null }> }>
  children_assessed_2024: number | null
  school_entry_change: { pp: number | null; flag: 'up' | 'down' | 'no_clear_change' | 'not_available'; years: string; measure: string }
  outlook_2027: FamilyFitOutlook | null
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

  getEarlyChildhoodServices: (
    id: string,
    signal?: AbortSignal,
  ) =>
    request<EarlyChildhoodServices | null>(
      `/api/neighbourhoods/${encodeURIComponent(
        id,
      )}/early-childhood-services`, signal,
    ),

  getPopulationProjections: (
    sa2Code: string,
    signal?: AbortSignal,
  ) =>
    request<PopulationProjectionResponse>(
      `/api/population-projections?sa2_code=${encodeURIComponent(sa2Code)}`,
      signal,
    ),

  getVcamsAreaContext: (areaName: string, year = 2021, signal?: AbortSignal) =>
    request<{ indicators: VcamsAreaIndicator[] }>(
      `/api/digital-health/vcams-area?area_name=${encodeURIComponent(areaName)}&year=${year}`, signal,
    ),

  getVcamsLgaContext: (lgaNames: string, signal?: AbortSignal) =>
    request<{ indicators: VcamsLgaIndicator[] }>(
      `/api/digital-health/vcams-lga?lga_name=${encodeURIComponent(lgaNames)}`, signal,
    ),

  getHealthFacilities: (sa2Code: string, signal?: AbortSignal) =>
    request<{ facilities: HealthFacility[] }>(
      `/api/digital-health/facilities?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getTrafficContext: (
    id: string,
    signal?: AbortSignal,
  ) =>
    request<NeighbourhoodContext | null>(
      `/api/neighbourhoods/${encodeURIComponent(id)}/traffic-context`,
      signal,
    ),

  getChildHealthContext: (sa2Code: string, signal?: AbortSignal) =>
    request<ChildHealthContext>(
      `/api/digital-health/child-health-context?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getImmunisationContext: (sa2Code: string, signal?: AbortSignal) =>
    request<ImmunisationContext>(
      `/api/digital-health/immunisation?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getNutritionContext: (sa2Code: string, signal?: AbortSignal) =>
    request<NutritionContext>(
      `/api/digital-health/nutrition?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getPreventionContext: (sa2Code: string, signal?: AbortSignal) =>
    request<PreventionContext>(
      `/api/digital-health/prevention-context?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getPractitionerContext: (sa2Code: string, signal?: AbortSignal) =>
    request<PractitionerContext>(
      `/api/digital-health/practitioner-context?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getCompareCare: (sa2Code: string, signal?: AbortSignal) =>
    request<CompareCare>(
      `/api/digital-health/compare-care?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getSeasonalIllness: (signal?: AbortSignal) =>
    request<SeasonalIllness>('/api/digital-health/seasonal-illness', signal),

  getNutritionReport: (sa2Code: string, signal?: AbortSignal) =>
    request<NutritionReport>(
      `/api/digital-health/nutrition-report?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getSeasonalAir: (sa2Code: string, signal?: AbortSignal) =>
    request<SeasonalAir>(
      `/api/digital-health/seasonal-air?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getFamilyFitSetup: (signal?: AbortSignal) => request<FamilyFitSetup>('/api/family-fit/setup', signal),
  getFamilyFitShapes: (signal?: AbortSignal) =>
    request<{ areas: Record<string, Array<Array<[number, number]>>> }>('/api/family-fit/shapes', signal),
  searchFamilyFit: (anchor: string, radiusKm: number, priorities: Record<string, FamilyFitLevel>, limit = 30, signal?: AbortSignal) =>
    requestEnvelope<FamilyFitSearch>(
      `/api/family-fit/search?anchor=${encodeURIComponent(anchor)}&radius_km=${radiusKm}&limit=${limit}&priorities=${encodeURIComponent(Object.entries(priorities).map(([k, v]) => `${k}:${v}`).join(','))}`,
      signal,
    ),
  getFamilyFitArea: (id: string, signal?: AbortSignal) =>
    requestEnvelope<FamilyFitAreaDetail>(`/api/family-fit/areas/${encodeURIComponent(id)}`, signal),

  getVaccinationPlaces: (sa2Code: string, signal?: AbortSignal) =>
    request<VaccinationPlaces>(
      `/api/digital-health/vaccination-places?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getNearbyServices: (sa2Code: string, signal?: AbortSignal) =>
    request<{ services: NearbyService[] }>(
      `/api/digital-health/nearby-services?sa2_code=${encodeURIComponent(sa2Code)}`, signal,
    ),

  getIndustrialContext: (
    id: string,
    signal?: AbortSignal,
  ) =>
    request<NeighbourhoodContext | null>(
      `/api/neighbourhoods/${encodeURIComponent(id)}/industrial-emissions-context`,
      signal,
    ),

  getIndustrialEmissionsContext: (
    id: string,
    signal?: AbortSignal,
  ) =>
    request<NeighbourhoodContext | null>(
      `/api/neighbourhoods/${encodeURIComponent(id)}/industrial-emissions-context`,
      signal,
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
    neighbourhoodIds: string[],
  ) => {
    const query = new URLSearchParams()
    neighbourhoodIds.forEach((id) => query.append('neighbourhood_ids', id))
    return request<MultiNeighbourhoodComparison>(`/api/compare?${query.toString()}`)
  },
  getOutcomeComparison: (
    a: string,
    b: string,
  ) =>
    request<OutcomeComparison>(
      `/api/outcome-comparison?neighbourhood_id_a=${encodeURIComponent(
        a,
      )}&neighbourhood_id_b=${encodeURIComponent(
        b,
      )}`,
    ),
  getEnvironmentalDifference: (
    a: string,
    b: string,
  ) =>
    request<EnvironmentalDifference>(
      `/api/environmental-difference?neighbourhood_id_a=${encodeURIComponent(
        a,
      )}&neighbourhood_id_b=${encodeURIComponent(
        b,
      )}`,
    ),
  getPatternInsight: (
    a: string,
    b: string,
  ) =>
    request<PatternInsight>(
      `/api/pattern-insight?neighbourhood_id_a=${encodeURIComponent(
        a,
      )}&neighbourhood_id_b=${encodeURIComponent(
        b,
      )}`,
    ),
  getSuitableLocalities: (
    criteria: string[],
    limit = 5,
  ) =>
    request<SuitableLocalitiesResponse>(
      `/api/localities/suitable?criteria=${encodeURIComponent(criteria.join(','))}&limit=${limit}`,
    ),
}
