/** Narrative coordinates only: this landscape does not represent real geography. */
export const chapters = [
  { title: 'A Shared Beginning', weather: 'Morning mist', label: 'Begin' },
  { title: 'Understanding Child Development', weather: 'Clouds gathering', label: 'Understand' },
  { title: 'Challenges Along the Way', weather: 'Passing rain', label: 'Investigate' },
  { title: 'Finding Opportunities', weather: 'Clouds lifting', label: 'Discover' },
  { title: 'A Brighter Future', weather: 'A little more light', label: 'Look ahead' },
] as const

export const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value))
export const smoothstep = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }
export const stationProgress = chapters.map((_, i) => i / (chapters.length - 1))

export function weatherAt(progress: number) {
  const storm = smoothstep(progress / .45) * (1 - smoothstep((progress - .62) / .3))
  return {
    storm,
    rain: smoothstep((progress - .46) / .08) * (1 - smoothstep((progress - .65) / .2)),
    sun: smoothstep((progress - .78) / .22),
    mist: .35 * (1 - smoothstep(progress / .32)) + storm * .12,
  }
}

export interface JourneyState { progress: number; chapter: number; reducedMotion: boolean }

/** Shared scroll intervals: arrival, a short reading pause, then travel by arc length. */
export function journeyAtScroll(scroll: number, anchors: number[], previous: number) {
  let chapter = previous
  while (chapter < 4 && scroll >= anchors[chapter + 1]) chapter++
  while (chapter > 0 && scroll < anchors[chapter] - 6) chapter--
  if (chapter === 4) return { chapter, progress: 1 }
  const local = clamp((scroll - anchors[chapter]) / Math.max(1, anchors[chapter + 1] - anchors[chapter]))
  // Pausing at each station also gives navigation clicks a comfortable reading position.
  const travel = clamp((local - .18) / .82)
  return { chapter, progress: (chapter + travel) / 4 }
}
