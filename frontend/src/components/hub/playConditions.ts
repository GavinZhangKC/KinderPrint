/**
 * Today's outdoor play conditions for one place, from the Open-Meteo forecast and air-quality
 * services (free, no key, CC BY 4.0), fetched in the browser.
 *
 * Each daylight hour is rated with simple, published thresholds:
 * - Heat: feels-like 35 °C or more is too hot for active outdoor play; 30–34 °C needs shade,
 *   water and rest breaks (Victorian Department of Health heat guidance).
 * - UV: 3 or more needs sun protection; 8 or more (very high, extreme) means seek shade and
 *   avoid the middle of the day (SunSmart).
 * - Fine particles (PM2.5, 1-hour): under 25 µg/m³ good, 25–49 fair, 50 or more poor:
 *   children should avoid long or hard outdoor activity (EPA Victoria AirWatch categories).
 * - Rain: 70% chance or more counts as wet; 40–69% as possibly wet.
 * The air figure is a model forecast, not an EPA monitor reading.
 */

export type HourLevel = 'good' | 'care' | 'avoid'

export interface PlayHour {
  hour: number
  time: string
  feelsLike: number | null
  temperature: number | null
  uv: number | null
  rain: number | null
  pm25: number | null
  level: HourLevel
  reasons: string[]
}

export interface PlayDay {
  date: string
  sunrise: string | null
  sunset: string | null
  maxTemp: number | null
  maxUv: number | null
  hours: PlayHour[]
  airAvailable: boolean
}

export interface PlayWindow { start: number; end: number; level: HourLevel }

const FORECAST = 'https://api.open-meteo.com/v1/forecast'
const AIR = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const TZ = 'Australia/Melbourne'

export function rateHour(h: Omit<PlayHour, 'level' | 'reasons'>): { level: HourLevel; reasons: string[] } {
  const avoid: string[] = []
  const care: string[] = []
  if (h.feelsLike !== null) {
    if (h.feelsLike >= 35) avoid.push(`feels like ${Math.round(h.feelsLike)} °C`)
    else if (h.feelsLike >= 30) care.push(`hot (feels like ${Math.round(h.feelsLike)} °C)`)
    else if (h.feelsLike < 5) care.push(`cold (feels like ${Math.round(h.feelsLike)} °C)`)
  }
  if (h.pm25 !== null) {
    if (h.pm25 >= 50) avoid.push('poor air')
    else if (h.pm25 >= 25) care.push('fair air')
  }
  if (h.rain !== null) {
    if (h.rain >= 70) avoid.push(`${Math.round(h.rain)}% chance of rain`)
    else if (h.rain >= 40) care.push(`${Math.round(h.rain)}% chance of rain`)
  }
  if (h.uv !== null && h.uv >= 8) care.push(`UV ${Math.round(h.uv)} (${h.uv >= 11 ? 'extreme' : 'very high'})`)
  if (avoid.length) return { level: 'avoid', reasons: [...avoid, ...care] }
  if (care.length) return { level: 'care', reasons: care }
  return { level: 'good', reasons: h.uv !== null && h.uv >= 3 ? [`UV ${Math.round(h.uv)}: hat and sunscreen`] : [] }
}

/** Longest run of good hours (else of hours that are good or need care) from `fromHour`. */
export function bestWindow(hours: PlayHour[], fromHour: number): PlayWindow | null {
  const usable = hours.filter(h => h.hour >= fromHour).sort((x, y) => x.hour - y.hour)
  for (const level of ['good', 'care'] as HourLevel[]) {
    const ok = (h: PlayHour) => h.level === 'good' || (level === 'care' && h.level === 'care')
    let best: PlayWindow | null = null
    let run: PlayWindow | null = null
    for (const h of usable) {
      if (ok(h) && run && run.end === h.hour) run.end = h.hour + 1
      else if (ok(h)) run = { start: h.hour, end: h.hour + 1, level }
      else run = null
      if (run && (!best || run.end - run.start > best.end - best.start)) best = { ...run }
    }
    if (best) return best
  }
  return null
}

export function hourLabel(hour: number): string {
  const h = ((hour + 11) % 12) + 1
  return `${h} ${hour < 12 || hour === 24 ? 'am' : 'pm'}`
}

export function windowText(w: PlayWindow): string {
  return `${hourLabel(w.start)} to ${hourLabel(w.end)}`
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Fetch today's daylight hours. Throws if the forecast cannot be read; air is optional. */
export async function loadPlayDay(lat: number, lon: number, signal?: AbortSignal): Promise<PlayDay> {
  const q = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&timezone=${encodeURIComponent(TZ)}&forecast_days=1`
  const weatherUrl = `${FORECAST}?${q}&hourly=temperature_2m,apparent_temperature,uv_index,precipitation_probability&daily=sunrise,sunset,temperature_2m_max,uv_index_max`
  const [weatherRes, airRes] = await Promise.all([
    fetch(weatherUrl, { signal }),
    fetch(`${AIR}?${q}&hourly=pm2_5`, { signal }).catch(() => null),
  ])
  if (!weatherRes.ok) throw new Error(`Forecast request failed: ${weatherRes.status}`)
  const weather = await weatherRes.json()
  const air = airRes && airRes.ok ? await airRes.json().catch(() => null) : null
  return parsePlayDay(weather, air)
}

/** Turn the two service responses into rated daylight hours. Exported for tests. */
export function parsePlayDay(weather: any, air: any): PlayDay {
  const times: string[] = weather?.hourly?.time ?? []
  const pmByTime = new Map<string, number | null>()
  ;(air?.hourly?.time ?? []).forEach((t: string, i: number) => pmByTime.set(t, num(air.hourly.pm2_5?.[i])))
  const sunrise: string | null = weather?.daily?.sunrise?.[0] ?? null
  const sunset: string | null = weather?.daily?.sunset?.[0] ?? null
  const riseHour = sunrise ? Number(sunrise.slice(11, 13)) : 6
  const setHour = sunset ? Number(sunset.slice(11, 13)) : 19
  const hours: PlayHour[] = []
  times.forEach((time, i) => {
    const hour = Number(time.slice(11, 13))
    if (hour < Math.max(riseHour, 6) || hour >= Math.min(setHour + 1, 21)) return
    const base = {
      hour, time,
      temperature: num(weather.hourly.temperature_2m?.[i]),
      feelsLike: num(weather.hourly.apparent_temperature?.[i]),
      uv: num(weather.hourly.uv_index?.[i]),
      rain: num(weather.hourly.precipitation_probability?.[i]),
      pm25: pmByTime.has(time) ? pmByTime.get(time)! : null,
    }
    hours.push({ ...base, ...rateHour(base) })
  })
  return {
    date: times[0]?.slice(0, 10) ?? '',
    sunrise, sunset,
    maxTemp: num(weather?.daily?.temperature_2m_max?.[0]),
    maxUv: num(weather?.daily?.uv_index_max?.[0]),
    hours,
    airAvailable: pmByTime.size > 0,
  }
}
