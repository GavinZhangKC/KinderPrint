/**
 * Plain-language copy and display metadata for "Where to live". Kept apart from the page so the
 * wording that makes promises to parents can be reviewed in one place.
 */
import type { FamilyFitLevel } from '../../services/api'

export type AgeGroup = '0-4' | '5-9' | '10-14'
export const AGE_LABEL: Record<AgeGroup, string> = { '0-4': '0–4 years', '5-9': '5–9 years', '10-14': '10–14 years' }

/** Suggested priorities per age group. Suggestions are always "Prefer": only the family makes something Essential. */
export const AGE_SUGGESTIONS: Record<AgeGroup, string[]> = {
  '0-4': ['childcare_kinder', 'gp_access', 'shade_cooler', 'physical_outdoor'],
  '5-9': ['early_development', 'school_transport', 'physical_outdoor', 'social_emotional'],
  '10-14': ['social_emotional', 'school_transport', 'physical_outdoor', 'fewer_pollution_sources'],
}

/** Home page "What matters most for your child?" cards -> the need they open with. */
export const HOME_FOCUS: Record<string, string> = {
  learning: 'early_development',
  social: 'social_emotional',
  physical: 'physical_outdoor',
  respiratory: 'fewer_pollution_sources',
  heat: 'shade_cooler',
  parks: 'physical_outdoor',
  healthcare: 'gp_access',
  'early-childhood': 'childcare_kinder',
}

export const LEVEL_LABEL: Record<'skip' | FamilyFitLevel, string> = {
  skip: 'Not a priority',
  prefer: 'Prefer',
  essential: 'Essential',
}

export interface MeasureInfo { label: string; unit: string; year: string; lowerIsBetter?: boolean; digits?: number }
export const MEASURES: Record<string, MeasureInfo> = {
  aedc_all_five_on_track_pct: { label: 'Children on track in all five areas', unit: '%', year: 'AEDC 2024, adjusted', digits: 1 },
  aedc_language_on_track_pct: { label: 'On track: language and thinking skills', unit: '%', year: 'AEDC 2024, adjusted', digits: 1 },
  aedc_social_on_track_pct: { label: 'On track: social competence', unit: '%', year: 'AEDC 2024, adjusted', digits: 1 },
  aedc_emotional_on_track_pct: { label: 'On track: emotional maturity', unit: '%', year: 'AEDC 2024, adjusted', digits: 1 },
  aedc_physical_on_track_pct: { label: 'On track: physical health and wellbeing', unit: '%', year: 'AEDC 2024, adjusted', digits: 1 },
  open_space_pct: { label: 'Public open space', unit: '% of land', year: '2018', digits: 1 },
  urban_heat_degc: { label: 'Hotter than surrounding non-urban land', unit: '°C', year: '2018', lowerIsBetter: true, digits: 1 },
  tree_cover_pct: { label: 'Tree cover', unit: '% of land', year: '2018', digits: 1 },
  road_traffic_intensity: { label: 'Main-road traffic', unit: 'vehicle-km a day per km²', year: '2019', lowerIsBetter: true, digits: 0 },
  industrial_sites_count: { label: 'Industrial sites reporting air emissions', unit: 'sites', year: '2024–25', lowerIsBetter: true, digits: 0 },
  gp_access_5km: { label: 'GP access within reach', unit: 'practices per 10,000 people', year: '2025', digits: 2 },
  nearest_gp_km: { label: 'Nearest general practice', unit: 'km, straight line', year: '2025', lowerIsBetter: true, digits: 1 },
  childcare_places_access_5km: { label: 'Childcare places within reach', unit: 'per 100 children under 5', year: '2026', digits: 0 },
  kindergartens_per_1000_under5: { label: 'Kindergarten services', unit: 'per 1,000 children under 5', year: '2026', digits: 1 },
  primary_schools_per_1000_age5_9: { label: 'Primary school campuses', unit: 'per 1,000 children aged 5–9', year: '2025', digits: 1 },
  transport_stops_per_10000: { label: 'Public transport stops', unit: 'per 10,000 people', year: '2026', digits: 1 },
}

export function formatMeasure(id: string, value: number | null): string {
  if (value === null || value === undefined) return 'Not available'
  const info = MEASURES[id]
  const digits = info?.digits ?? 1
  const text = value >= 1000 ? Math.round(value).toLocaleString('en-AU') : value.toFixed(digits)
  return info?.unit === '%' ? `${text}%` : info?.unit === '°C' ? `+${text}°C` : text
}

export const STABILITY_TEXT = {
  stable: 'Stable shortlist position',
  fairly_stable: 'Fairly stable shortlist position',
  could_change: 'Shortlist position could change',
} as const

export const CHANGE_TEXT = (flag: string, pp: number | null): string => {
  if (flag === 'not_available' || pp === null) return 'No 2015 result to compare with.'
  const size = `${Math.abs(pp).toFixed(1)} percentage points`
  if (flag === 'up') return `Up ${size} from 2015 to 2024. The rise is larger than chance alone would explain.`
  if (flag === 'down') return `Down ${size} from 2015 to 2024. The fall is larger than chance alone would explain.`
  return `${pp >= 0 ? 'Up' : 'Down'} ${size} from 2015 to 2024, which is within what chance alone could explain.`
}

/** Visit checklist: practical checks that the data cannot do for a family. */
export const CHECKLIST: Record<string, Array<{ text: string; link?: [string, string] }>> = {
  childcare_kinder: [
    { text: 'Check vacancies, waitlists and quality ratings at nearby childcare and kinder services.', link: ['Starting Blocks', 'https://www.startingblocks.gov.au/find-child-care'] },
    { text: 'Ask the council when kindergarten enrolments open for the year you need.' },
  ],
  gp_access: [
    { text: 'Ask the nearest clinics whether they take new families and bulk bill children.' },
    { text: 'Find the nearest urgent care clinic and the after-hours option.', link: ['Find a health service', 'https://www.healthdirect.gov.au/australian-health-services'] },
  ],
  early_development: [
    { text: 'Ask the Maternal and Child Health service about playgroups and early learning programs nearby.' },
    { text: 'Visit the local library and ask about story time and early literacy sessions.' },
  ],
  social_emotional: [
    { text: 'Look for playgroups, sport clubs and library programs your child could join.' },
  ],
  physical_outdoor: [
    { text: 'Walk to the nearest playground and park with your child. Check footpaths and road crossings on the way.' },
  ],
  shade_cooler: [
    { text: 'Walk the street at 3 pm on a warm day. Is there shade on the way to the park or school?' },
  ],
  fewer_pollution_sources: [
    { text: 'Note how close the home is to main roads and industrial sites.' },
    { text: 'On a smoky or hot day, check current air quality.', link: ['EPA AirWatch', 'https://www.epa.vic.gov.au/check-air-and-water-quality'] },
  ],
  school_transport: [
    { text: 'Check which school zone each address is in.', link: ['Find my school', 'https://www.findmyschool.vic.gov.au/'] },
    { text: 'Try the trip to school or childcare at the time you would travel.' },
  ],
}
export const CHECKLIST_GENERAL = 'Visit at the times your family would be out: the school run, after work and on a weekend.'
