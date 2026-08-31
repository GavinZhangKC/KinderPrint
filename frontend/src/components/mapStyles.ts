import type { BoundaryFeatureCollection } from '../services/api'
import type { PreferenceId } from '../types/neighbourhood'

export const SOURCE_ID = 'kinderprint-neighbourhoods'
export const FILL_LAYER_ID = 'kinderprint-neighbourhood-fill'
export const HOVER_SHADOW_LAYER_ID = 'kinderprint-neighbourhood-hover-shadow'
export const HOVER_FILL_LAYER_ID = 'kinderprint-neighbourhood-hover-fill'
export const OUTLINE_LAYER_ID = 'kinderprint-neighbourhood-outline'
export const HOVER_BORDER_LAYER_ID = 'kinderprint-neighbourhood-hover-border'
export const SELECTED_LAYER_ID = 'kinderprint-neighbourhood-selected'
export const COMPARISON_LAYER_ID = 'kinderprint-neighbourhood-comparison'

export const EMPTY_COLLECTION: BoundaryFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
}

const CHOROPLETH_STYLE: Record<
  PreferenceId,
  { property: string; stops: [number, number, number] }
> = {
  development: { property: 'development', stops: [45, 65, 80] },
  heat: { property: 'heat', stops: [5, 7, 9] },
  social: { property: 'social', stops: [2, 5, 8] },
  vegetation: { property: 'vegetation', stops: [10, 20, 35] },
  'green-space': { property: 'green_space', stops: [10, 20, 35] },
}

export function choroplethFill(preference: PreferenceId | null) {
  if (!preference) return '#FFFFFF'

  const { property, stops } = CHOROPLETH_STYLE[preference]
  const positive =
    preference === 'development' ||
    preference === 'vegetation' ||
    preference === 'green-space'
  const low = positive ? '#F5B6A8' : '#9ADBB8'
  const high = positive ? '#9ADBB8' : '#F5B6A8'

  return [
    'interpolate',
    ['linear'],
    ['coalesce', ['get', property], -999],
    -999,
    'rgba(255,255,255,0.08)',
    stops[0],
    low,
    stops[1],
    '#F6E7A8',
    stops[2],
    high,
  ] as any
}

export function selectionFilter(id: string | null | undefined) {
  return [
    '==',
    ['get', 'id'],
    id ?? '__no_neighbourhood_selected__',
  ] as any
}
