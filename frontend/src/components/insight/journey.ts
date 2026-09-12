/** Narrative coordinates only: this landscape does not represent real geography. */
export const chapters = [
  { title: 'The Neighbourhood', weather: 'Morning mist', label: 'Meet the place' },
  { title: 'Heat Exposure', weather: 'Heat building', label: 'Feel the pressure' },
  { title: 'Limited Green Space', weather: 'Clouds gathering', label: 'See the cover' },
  { title: 'Developmental Vulnerability', weather: 'Heavy rain', label: 'Understand development' },
  { title: 'Patterns Emerge', weather: 'Rain holding', label: 'Connect the signals' },
  { title: 'What Could Change?', weather: 'Weather clearing', label: 'Imagine change' },
  { title: 'A Better Future', weather: 'Clear skies', label: 'Look ahead' },
] as const

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
export const smoothstep = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }
const chapterSpan = 1 / (chapters.length - 1)
/**
 * Interior lights sit slightly into each reading interval. This lets the
 * moving point meet the station as its card settles into the reading position;
 * the opening and final stations remain at the exact route endpoints.
 */
export const stationProgress = chapters.map((_, i) => {
  const interior = i > 0 && i < chapters.length - 1
  return (i + (interior ? .12 : 0)) * chapterSpan
})

/** Keep the prompt readable at the start, then fade it by the midpoint from chapter 01 to 02. */
export function scrollHintOpacity(progress: number) {
  return 1 - smoothstep((progress - chapterSpan * .16) / (chapterSpan * .34))
}

export function weatherAt(progress: number) {
  const storm = smoothstep((progress - .08) / .44) * (1 - smoothstep((progress - .7) / .3))
  return {
    storm,
    rain: smoothstep((progress - .34) / .15) * (1 - smoothstep((progress - .76) / .2)),
    sun: smoothstep((progress - .8) / .2),
    mist: .35 * (1 - smoothstep(progress / .28)) + storm * .12,
  }
}

export interface JourneyState { progress: number; chapter: number; reducedMotion: boolean }

/** Map every scroll interval continuously onto the landscape journey. */
export function journeyAtScroll(scroll: number, anchors: number[], previous: number) {
  const lastChapter = chapters.length - 1
  let chapter = Math.min(lastChapter, previous)
  while (chapter < lastChapter && scroll >= anchors[chapter + 1]) chapter++
  while (chapter > 0 && scroll < anchors[chapter] - 6) chapter--
  if (chapter === lastChapter) return { chapter, progress: 1 }
  const local = clamp((scroll - anchors[chapter]) / Math.max(1, anchors[chapter + 1] - anchors[chapter]))
  return { chapter, progress: (chapter + local) / lastChapter }
}
