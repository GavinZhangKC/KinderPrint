import type { Map } from 'mapbox-gl'
import type { Theme } from '../theme/ThemeProvider'

type PaintProperty = Parameters<Map['setPaintProperty']>[1]
type PaintValue = Parameters<Map['setPaintProperty']>[2]

/** Recolour the existing basemap, without replacing its sources, layers or camera. */
export function createBasemapTheme(map: Pick<Map, 'getStyle' | 'setPaintProperty' | 'setConfigProperty'>, overlaySource: string) {
  let originalColours: Array<{ id: string; property: PaintProperty; value: PaintValue }> | null = null

  return (theme: Theme) => {
    const style = map.getStyle()
    if (style.imports?.some(entry => entry.id === 'basemap')) {
      map.setConfigProperty('basemap', 'lightPreset', theme === 'dark' ? 'night' : 'day')
      return
    }

    // Save expressions as well as literal colours so light mode restores the original style.
    originalColours ??= (style.layers ?? []).flatMap(layer => {
      if ('source' in layer && layer.source === overlaySource) return []
      return Object.entries(layer.paint ?? {})
        .filter(([property]) => property.endsWith('-color'))
        .map(([property, value]) => ({ id: layer.id, property: property as PaintProperty, value: value as PaintValue }))
    })

    for (const { id, property, value } of originalColours) {
      let colour = '#28384b'
      if (property === 'background-color') colour = '#101b2b'
      else if (property === 'text-halo-color') colour = '#101b2b'
      else if (property === 'text-color') colour = /water/.test(id) ? '#8db4cb' : '#c3cfdf'
      else if (/water/.test(id)) colour = '#172f43'
      else if (/park|landuse|pitch/.test(id)) colour = '#1c3332'
      else if (/road|bridge|tunnel|aeroway/.test(id)) colour = '#35465b'
      else if (/boundary/.test(id)) colour = '#63758b'
      map.setPaintProperty(id, property, theme === 'dark' ? colour : value)
    }
  }
}
