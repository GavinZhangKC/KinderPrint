/**
 * KinderHub: the audience-aware child health dashboard.
 *
 * Structure follows a KPI → primary visual → supporting cards → detail rhythm on every page.
 * Parents see plain-language frequencies ("1 in 4") and actions; practitioners see exact
 * values, denominators, confidence intervals and a geography badge on every figure.
 * Every value comes from a validated KinderPrint endpoint; nothing is invented client-side.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  api,
  type ChildHealthContext,
  type DepartmentAreaIndicator,
  type EarlyChildhoodServices,
  type HealthFacility,
  type ImmunisationContext,
  type NeighbourhoodProfile,
  type NeighbourhoodSearchResult,
  type NutritionContext,
  type PopulationProjection,
  type PreventionContext,
} from '../../services/api'
import {
  DAILY_SERVES,
  NIP_ABORIGINAL_ADDITIONS,
  NIP_SCHEDULE,
  OFFICIAL,
  STATUS_LABEL,
  buildCalendar,
  downloadFile,
  dueDate,
  emailToSelf,
  monthsBetween,
  nextOccurrence,
  readStored,
  scheduleStatus,
  writeStored,
  type CalendarEvent,
  type ScheduleStatus,
} from '../health/healthPlanning'
import './KinderHub.css'

/* ------------------------------------------------------------------ types */

export type Audience = 'parent' | 'practitioner'
type Page = 'home' | 'health' | 'vaccines' | 'food' | 'seasons' | 'care'
export type BodyId = 'brain' | 'lungs' | 'metabolic' | 'immune' | 'perinatal'

export interface HubData {
  facilities: HealthFacility[]
  projections: PopulationProjection[]
  profile: NeighbourhoodProfile | null
  childHealth: ChildHealthContext | null
  loading: boolean
  error: string | null
}

interface KinderHubProps {
  locality: NeighbourhoodSearchResult
  data: HubData
  onSelectLocality: (value: NeighbourhoodSearchResult) => void
  onHome: () => void
  onOpenPlan: (body: BodyId, age: string) => void
}

type Loaded<T> = { data: T | null; loading: boolean }

/* ------------------------------------------------------------------ constants */

const AUDIENCE_KEY = 'kinderprint-audience'
const AGE_KEY = 'kinderprint-child-age'
const PAGE_KEY = 'kinderprint-hub-page'
const TODO_KEY = 'kinderprint-week-done'
const STEP_KEY = 'kinderprint-body-steps'
const BIRTH_KEY = 'kinderprint-child-birth-month'
const VACCINE_DONE_KEY = 'kinderprint-vaccines-done'
const ABORIGINAL_KEY = 'kinderprint-child-aboriginal'
const SERVE_KEY = 'kinderprint-serves'

const AGES = ['0–4 years', '5–9 years', '10–14 years']
const SERVE_BAND: Record<string, string> = { '0–4 years': '2–3 years', '5–9 years': '4–8 years', '10–14 years': '9–11 years' }
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const NAV: Array<{ id: Page; label: string; icon: ReactNode }> = [
  { id: 'home', label: 'Home', icon: <path d="M3 11l9-7 9 7v9H5z" /> },
  { id: 'health', label: 'Health', icon: <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" /> },
  { id: 'vaccines', label: 'Vaccines', icon: <path d="M18 2l4 4M17 7l-9 9-3 1 1-3 9-9M3 21l3-3" /> },
  { id: 'food', label: 'Food & play', icon: <path d="M12 7c-3-2-8-1-8 5s4 9 6 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 6-3 6-9s-5-7-8-5zM12 7c0-2 1-4 3-4" /> },
  { id: 'seasons', label: 'Seasons', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" /></> },
  { id: 'care', label: 'Care nearby', icon: <><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" /></> },
]

const BODIES: Array<{ id: BodyId; label: string; image: string }> = [
  { id: 'brain', label: 'Brain & development', image: '/health-assets/brain-development.png' },
  { id: 'lungs', label: 'Lungs & asthma', image: '/health-assets/lungs-asthma.png' },
  { id: 'metabolic', label: 'Growth & weight', image: '/health-assets/metabolic-health.png' },
  { id: 'immune', label: 'Immunity', image: '/health-assets/allergy-immune.png' },
  { id: 'perinatal', label: 'Pregnancy & baby', image: '/health-assets/perinatal-health.png' },
]

const BODY_STEPS: Record<BodyId, Array<{ text: string; why: string; link: string }>> = {
  brain: [
    { text: 'Read together every day', why: 'Builds language and early literacy.', link: OFFICIAL.movement },
    { text: 'Keep a regular sleep routine', why: '10–13 hours for 3–5 year olds, 9–11 hours for 5–13 year olds.', link: OFFICIAL.movement },
    { text: 'Talk to the teacher or GP early if something worries you', why: 'Use the preparation plan to organise what you have noticed.', link: OFFICIAL.movement },
  ],
  lungs: [
    { text: 'Written asthma action plan reviewed this year', why: 'The National Asthma Council recommends a written plan for everyone with asthma.', link: OFFICIAL.asthmaPlan },
    { text: 'Puffer and spacer technique checked by a pharmacist', why: 'Most people use their inhaler incorrectly.', link: OFFICIAL.asthmaPlan },
    { text: 'Smoke-free home and car', why: 'Protects developing lungs.', link: OFFICIAL.asthmaPlan },
  ],
  metabolic: [
    { text: '60 minutes of active play every day', why: 'Australian 24-hour movement guidelines, 5–17 years.', link: OFFICIAL.movement },
    { text: 'Water as the everyday drink', why: 'Instead of juice or soft drink.', link: OFFICIAL.serves },
    { text: 'No more than 2 hours of screen time for fun', why: 'Australian 24-hour movement guidelines, 5–17 years.', link: OFFICIAL.movement },
  ],
  immune: [
    { text: 'Vaccines kept on schedule', why: 'Every National Immunisation Program vaccine is free.', link: OFFICIAL.nipSchedule },
    { text: 'Flu vaccine every April or May', why: 'Free for children aged 6 months to under 5.', link: OFFICIAL.nipSchedule },
    { text: 'Missed vaccines caught up', why: 'Catch-up vaccines are free at your GP or council.', link: OFFICIAL.victorianSchedule },
  ],
  perinatal: [
    { text: 'Whooping cough vaccine during pregnancy', why: 'Protects the newborn in the first months.', link: OFFICIAL.nipSchedule },
    { text: 'RSV protection in pregnancy or after birth', why: 'National and Victorian programs.', link: OFFICIAL.rsv },
    { text: 'Safe sleep: on the back, in their own cot', why: 'Red Nose safe-sleeping guidance.', link: OFFICIAL.safeSleep },
  ],
}

interface Season { id: string; title: string; months: number[]; why: string; actions: string[]; link: string; linkLabel: string }
const SEASONS: Season[] = [
  { id: 'heat', title: 'Extreme heat', months: [11, 0, 1, 2], why: 'Hot days are harder on young children, especially where shade is limited.', actions: ['Play outside before 11 am or after 4 pm', 'Offer water often and dress children in light clothing', 'Never leave a child in a parked car'], link: OFFICIAL.heat, linkLabel: 'Heat-health warnings' },
  { id: 'uv', title: 'Sun and UV', months: [8, 9, 10, 11, 0, 1, 2, 3], why: 'UV is high enough to damage skin from spring to autumn.', actions: ['Hat, sunscreen, covering clothing, shade and sunglasses', 'Check the daily sun protection times', 'Choose shaded play spaces'], link: OFFICIAL.sunSmart, linkLabel: 'SunSmart' },
  { id: 'asthma', title: 'Thunderstorm asthma', months: [9, 10, 11], why: 'Storms on high grass-pollen days can trigger sudden, severe asthma.', actions: ['Review the asthma action plan before October', 'Keep the reliever puffer and spacer handy', 'Check the forecast daily and stay inside during storms on high-risk days'], link: OFFICIAL.asthmaForecast, linkLabel: 'Thunderstorm asthma forecast' },
  { id: 'smoke', title: 'Bushfire smoke', months: [11, 0, 1, 2], why: 'Smoke from regional fires can reach Melbourne suburbs.', actions: ['Check air quality on smoky days', 'Keep children indoors with windows closed when air is poor', 'Keep asthma medicines up to date'], link: OFFICIAL.airWatch, linkLabel: 'EPA AirWatch' },
  { id: 'water', title: 'Water safety', months: [10, 11, 0, 1, 2], why: 'Summer brings more time at pools and beaches.', actions: ['Always watch young children in and near water', 'Check pool gates close by themselves', 'Enrol in swimming and water-safety lessons'], link: OFFICIAL.waterSafety, linkLabel: 'Royal Life Saving' },
  { id: 'flu', title: 'Flu and RSV', months: [5, 6, 7, 8], why: 'Winter brings the biggest rise in children’s coughs, colds and flu.', actions: ['Flu vaccine in April or May', 'Ask about free infant RSV protection for babies', 'Keep sick children home and wash hands'], link: OFFICIAL.rsv, linkLabel: 'RSV immunisation' },
]

const VCAMS_PLAIN: Record<string, string> = {
  minimum_recommended_vegetables: 'eat enough vegetables',
  minimum_recommended_fruit: 'eat enough fruit',
  recommended_daily_physical_activity: 'are active for 60 minutes a day',
  electronic_media_over_two_hours: 'spend more than 2 hours on screens',
  household_food_insecurity: 'live in a household that ran short of food',
  tobacco_smoke_exposure_at_home: 'are exposed to tobacco smoke at home',
}
const VCAMS_LABEL: Record<string, string> = {
  minimum_recommended_vegetables: 'Eat enough vegetables',
  minimum_recommended_fruit: 'Eat enough fruit',
  recommended_daily_physical_activity: 'Active 60 minutes a day',
  electronic_media_over_two_hours: 'More than 2 hours screen time',
  household_food_insecurity: 'Household food insecurity',
  tobacco_smoke_exposure_at_home: 'Tobacco smoke at home',
}

/* ------------------------------------------------------------------ helpers */

const pct = (value: number | null | undefined, digits = 1) => value === null || value === undefined ? '—' : `${value.toFixed(digits)}%`
const inHundred = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${Math.round(value)} in 100`
const oneIn = (value: number | null | undefined) => value === null || value === undefined || value <= 0 ? '—' : `1 in ${Math.max(2, Math.round(100 / value))}`
const count = (value: number | null | undefined) => value === null || value === undefined ? '—' : Math.round(value).toLocaleString('en-AU')
const monthYear = (date: Date) => date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
const shortDate = (date: Date) => date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
const slug = (value: string) => value.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase()
const mapsLink = (facility: HealthFacility) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${facility.name} ${facility.address}`)}`

function useEndpoint<T>(load: (signal: AbortSignal) => Promise<{ data: T }>, key: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, loading: true })
    load(controller.signal)
      .then(response => setState({ data: response.data, loading: false }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setState({ data: null, loading: false }) })
    return () => controller.abort()
    // The loader closes over the locality id, which is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

function useStored<T>(key: string, fallback: T): [T, (value: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))
  useEffect(() => writeStored(key, value), [key, value])
  return [value, setValue]
}

/* ------------------------------------------------------------------ shared UI */

function Geo({ children }: { children: ReactNode }) {
  return <span className="kh-tag kh-geo">{children}</span>
}

function Card({ title, sub, aside, children, className = '' }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`kh-card ${className}`}>
    <header className="kh-card-h"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{aside}</header>
    {children}
  </section>
}

function Ring({ value, label, caption, good }: { value: number | null; label: string; caption: string; good?: boolean }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - Math.min(value ?? 0, 100) / 100)
  return <figure className="kh-ring">
    <svg viewBox="0 0 108 108" role="img" aria-label={`${label}: ${pct(value)}`}>
      <circle cx="54" cy="54" r={radius} className="kh-ring-track" />
      <circle cx="54" cy="54" r={radius} className={good ? 'kh-ring-value good' : 'kh-ring-value'} strokeDasharray={circumference.toFixed(1)} strokeDashoffset={offset.toFixed(1)} transform="rotate(-90 54 54)" />
      <text x="54" y="60" textAnchor="middle">{pct(value)}</text>
    </svg>
    <figcaption><b>{label}</b><span>{caption}</span></figcaption>
  </figure>
}

function People({ value }: { value: number | null | undefined }) {
  const lit = Math.round((value ?? 0) / 5)
  return <div className="kh-people" aria-hidden="true">{Array.from({ length: 20 }, (_, index) => <i key={index} className={index < lit ? 'on' : undefined} />)}</div>
}

function RangeMarker({ item }: { item: DepartmentAreaIndicator }) {
  const range = item.department_areas
  if (!range || item.area.percent === null) return null
  const span = Math.max(range.highest - range.lowest, 0.01)
  const place = (value: number) => `${((value - range.lowest) / span) * 100}%`
  return <span className="kh-range" title={`Lowest ${range.lowest}% · middle ${range.median}% · highest ${range.highest}%`}>
    <i /><em style={{ left: place(range.median) }} /><b style={{ left: place(item.area.percent) }} />
  </span>
}

function LocalityPicker({ locality, onSelect }: { locality: NeighbourhoodSearchResult; onSelect: (value: NeighbourhoodSearchResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NeighbourhoodSearchResult[]>([])
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = window.setTimeout(() => api.searchNeighbourhoods(query)
      .then(response => setResults(response.data.filter(item => /^\d{9}$/.test(item.id)).slice(0, 8)))
      .catch(() => setResults([])), 220)
    return () => window.clearTimeout(timer)
  }, [query])
  return <div className="kh-picker">
    <label className="kh-chip">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" /></svg>
      <span className="kh-sr">Change locality</span>
      <input value={query} placeholder={locality.name} onChange={event => setQuery(event.target.value)} aria-label="Search for a suburb" />
    </label>
    {results.length > 0 && <ul role="listbox">{results.map(result => <li key={result.id}><button type="button" onClick={() => { onSelect(result); setQuery(''); setResults([]) }}><b>{result.name}</b><small>SA2 {result.id}</small></button></li>)}</ul>}
  </div>
}

/* ------------------------------------------------------------------ derived data */

function useHubFigures(data: HubData) {
  return useMemo(() => {
    const domain = (id: string) => data.profile?.domains.find(item => item.id === id)?.indicators ?? []
    const value = (domainId: string, id: string) => {
      const found = domain(domainId).find(item => item.id === id)?.value
      return found === null || found === undefined ? null : Number(found)
    }
    const sa2 = (id: string) => data.childHealth?.sa2_indicators.find(item => item.indicator === id) ?? null
    const pha = (id: string) => data.childHealth?.pha_context.find(item => item.indicator_id === id) ?? null
    const projections = [...data.projections].filter(row => row.sex === 'persons').sort((a, b) => a.projection_year - b.projection_year)
    return {
      aedc: {
        vulnerableOne: value('child-development', 'aedc_vulnerable_one_or_more'),
        vulnerableTwo: value('child-development', 'aedc_vulnerable_two_or_more'),
        onTrackAll: value('child-development', 'aedc_on_track_five'),
        assessed: value('child-development', 'aedc_children_assessed'),
        domains: [
          ['Physical', value('child-development', 'aedc_physical_on_track')],
          ['Social', value('child-development', 'aedc_social_on_track')],
          ['Emotional', value('child-development', 'aedc_emotional_on_track')],
          ['Language', value('child-development', 'aedc_language_on_track')],
          ['Communication', value('child-development', 'aedc_communication_on_track')],
        ] as Array<[string, number | null]>,
      },
      social: { seifaDecile: value('social', 'seifa_irsd_decile'), population: value('social', 'census_population') },
      env: { vegetation: value('environment', 'env_vegetation_cover'), heat: value('environment', 'env_urban_heat'), openSpace: value('environment', 'env_open_space_access') },
      sa2, pha, projections, phaName: data.childHealth?.locality?.pha_name ?? 'containing Population Health Area',
    }
  }, [data])
}

/* ------------------------------------------------------------------ root */

export default function KinderHub({ locality, data, onSelectLocality, onHome, onOpenPlan }: KinderHubProps) {
  const [audience, setAudience] = useStored<Audience>(AUDIENCE_KEY, 'parent')
  const [page, setPage] = useStored<Page>(PAGE_KEY, 'home')
  const [age, setAge] = useState(() => { try { return window.localStorage.getItem(AGE_KEY) ?? '5–9 years' } catch { return '5–9 years' } })
  const [body, setBody] = useState<BodyId>('brain')
  useEffect(() => { try { window.localStorage.setItem(AGE_KEY, age) } catch { /* storage unavailable */ } }, [age])

  const figures = useHubFigures(data)
  const immunisation = useEndpoint<ImmunisationContext>(signal => api.getImmunisationContext(locality.id, signal), locality.id)
  const nutrition = useEndpoint<NutritionContext>(signal => api.getNutritionContext(locality.id, signal), locality.id)
  const prevention = useEndpoint<PreventionContext>(signal => api.getPreventionContext(locality.id, signal), locality.id)
  const childcare = useEndpoint<EarlyChildhoodServices | null>(signal => api.getEarlyChildhoodServices(locality.id, signal), locality.id)

  const parent = audience === 'parent'
  const go = (next: Page) => { setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const context: PageContext = { locality, data, figures, immunisation, nutrition, prevention, childcare, parent, age, body, setBody, go, onOpenPlan }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const heading: Record<Page, [string, string]> = parent ? {
    home: [greeting, `Here’s what matters for a ${age.replace(' years', '')} year old in ${locality.name} right now.`],
    health: ['Your child’s health, area by area', 'Pick a part of the body to see what local numbers mean and what you can do.'],
    vaccines: ['Vaccines', 'Your child’s free vaccines, what’s next, and how protected your area is.'],
    food: ['Food and play', 'Track today’s serves and see how kids in your region eat and play.'],
    seasons: ['Stay a season ahead', 'What’s coming, why it matters here, and what to do.'],
    care: ['Care nearby', `Health and childcare services listed in ${locality.name}.`],
  } : {
    home: [`${locality.name} · child health brief`, 'Population evidence for planning and service conversations. Every value shows its geography and year.'],
    health: ['Child health conditions', 'Exact SA2 observations and separately labelled PHA context. No PHA value is assigned to an SA2.'],
    vaccines: ['Immunisation coverage', 'Australian Immunisation Register coverage via PHIDU, with a pooled Victorian reference.'],
    food: ['Nutrition and activity', 'VCAMS Department-area estimates compared across 17 areas, plus PHA weight estimates.'],
    seasons: ['Seasonal prevention', 'Seasonal risks explained with SA2 place context. 2018 environment measures describe the area, not exposure.'],
    care: ['Care access', 'Directory presence inside the SA2. Not capacity, fees, bulk billing or waiting time.'],
  }

  return <div className={`kp-hub ${parent ? 'is-parent' : 'is-practitioner'}`}>
    <div className="kh-shell">
      <header className="kh-top">
        <button type="button" className="kh-logo" onClick={onHome} aria-label="KinderPrint home">
          <svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" /><path d="M11 9v14M11 16l8-7M13.5 14l6.5 9" /></svg>
          <span>KinderPrint</span>
        </button>
        <nav className="kh-nav" aria-label="Dashboard sections">{NAV.map(item => <button key={item.id} type="button" aria-current={page === item.id ? 'page' : undefined} onClick={() => go(item.id)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg>{item.label}
        </button>)}</nav>
        <div className="kh-seg" role="group" aria-label="Who is using KinderPrint">
          <button type="button" aria-pressed={parent} onClick={() => setAudience('parent')}>Parent</button>
          <button type="button" aria-pressed={!parent} onClick={() => setAudience('practitioner')}>Practitioner</button>
        </div>
      </header>

      <section className="kh-hello" key={`${page}-${audience}`}>
        <div><h1>{heading[page][0]}</h1><p>{heading[page][1]}</p></div>
        <div className="kh-chips">
          <LocalityPicker locality={locality} onSelect={onSelectLocality} />
          {parent
            ? <label className="kh-chip">Child age<select value={age} onChange={event => setAge(event.target.value)}>{AGES.map(item => <option key={item}>{item}</option>)}</select></label>
            : <span className="kh-chip">SA2 {locality.id}</span>}
        </div>
      </section>

      {data.error && <p className="kh-error" role="alert">{data.error}</p>}
      <main className="kh-main" key={`${page}-${audience}-${locality.id}`}>
        {page === 'home' && <HomePage {...context} />}
        {page === 'health' && <HealthPage {...context} />}
        {page === 'vaccines' && <VaccinesPage {...context} />}
        {page === 'food' && <FoodPage {...context} />}
        {page === 'seasons' && <SeasonsPage {...context} />}
        {page === 'care' && <CarePage {...context} />}
      </main>
      <footer className="kh-foot">Area-level evidence. KinderPrint does not diagnose a child or give medical advice. In an emergency call 000.</footer>
    </div>
  </div>
}

interface PageContext {
  locality: NeighbourhoodSearchResult
  data: HubData
  figures: ReturnType<typeof useHubFigures>
  immunisation: Loaded<ImmunisationContext>
  nutrition: Loaded<NutritionContext>
  prevention: Loaded<PreventionContext>
  childcare: Loaded<EarlyChildhoodServices | null>
  parent: boolean
  age: string
  body: BodyId
  setBody: (value: BodyId) => void
  go: (page: Page) => void
  onOpenPlan: (body: BodyId, age: string) => void
}

/* ------------------------------------------------------------------ home */

function vaccineRows(birthMonth: string, done: string[], aboriginal: boolean) {
  const schedule = [...NIP_SCHEDULE, ...(aboriginal ? NIP_ABORIGINAL_ADDITIONS : [])].sort((a, b) => a.ageMonths - b.ageMonths)
  if (monthsBetween(birthMonth) === null) return schedule.map(item => ({ item, due: null as Date | null, status: null as ScheduleStatus | null }))
  return schedule.map(item => ({ item, due: dueDate(birthMonth, item.ageMonths), status: scheduleStatus(item, birthMonth, done.includes(item.id)) }))
}

function HomePage(props: PageContext) {
  return props.parent ? <ParentHome {...props} /> : <PractitionerHome {...props} />
}

function ParentHome({ locality, figures, immunisation, nutrition, data, childcare, go, onOpenPlan, age, setBody }: PageContext) {
  const [doneWeek, setDoneWeek] = useStored<string[]>(TODO_KEY, [])
  const birthMonth = readStored(BIRTH_KEY, '')
  const rows = vaccineRows(birthMonth, readStored<string[]>(VACCINE_DONE_KEY, []), readStored(ABORIGINAL_KEY, false))
  const month = new Date().getMonth()
  const now = SEASONS.find(item => item.months.includes(month)) ?? SEASONS[0]
  const nextSeason = SEASONS.filter(item => !item.months.includes(month)).map(item => ({ item, start: nextOccurrence(item.months[0], 1) })).sort((a, b) => a.start.getTime() - b.start.getTime())[0]
  const nextVaccine = rows.find(row => row.status === 'catch-up' || row.status === 'due-soon')
  const toddler = figures.sa2('asthma')
  const vegetables = nutrition.data?.vcams.find(item => item.indicator_id === 'minimum_recommended_vegetables')
  const twoYear = immunisation.data?.indicators.find(item => item.indicator_id === 'immunised_age_2')
  const services = data.facilities.length
  const tasks = [
    { id: `season-${nextSeason.item.id}`, tone: 'watch', icon: <path d="M12 3v18M5 8c3 0 4 2 7 2s4-2 7-2" />, when: `Starts ${shortDate(nextSeason.start)}`, title: nextSeason.item.title, text: nextSeason.item.actions[0], page: 'seasons' as Page },
    nextVaccine
      ? { id: `vaccine-${nextVaccine.item.id}`, tone: 'blue', icon: <path d="M18 2l4 4M17 7l-9 9-3 1 1-3 9-9M3 21l3-3" />, when: nextVaccine.status === 'catch-up' ? 'Catch up' : `Due ${nextVaccine.due ? monthYear(nextVaccine.due) : ''}`, title: `${nextVaccine.item.when} vaccines`, text: 'Free at your GP or council immunisation session.', page: 'vaccines' as Page }
      : { id: 'vaccine-setup', tone: 'blue', icon: <path d="M18 2l4 4M17 7l-9 9-3 1 1-3 9-9M3 21l3-3" />, when: birthMonth ? 'All up to date' : '2 minutes', title: birthMonth ? 'Vaccines on track' : 'Set up vaccine reminders', text: birthMonth ? 'Nothing is due in the next two months.' : 'Add your child’s birth month to see what is due.', page: 'vaccines' as Page },
    { id: `now-${now.id}`, tone: 'good', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>, when: 'This month', title: now.title, text: now.actions[0], page: 'seasons' as Page },
  ]
  const toggle = (id: string) => setDoneWeek(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  return <div className="kh-stack">
    <Card title="This week" sub="Three things worth doing. Tick them off when done." aside={<span className="kh-tag">{tasks.filter(task => doneWeek.includes(task.id)).length} of 3 done</span>}>
      <div className="kh-week">{tasks.map(task => <article key={task.id} className={`kh-todo tone-${task.tone} ${doneWeek.includes(task.id) ? 'is-done' : ''}`}>
        <span className="kh-todo-ic"><svg viewBox="0 0 24 24" aria-hidden="true">{task.icon}</svg></span>
        <span className="kh-when">{task.when}</span>
        <h3>{task.title}</h3>
        <p>{task.text}</p>
        <div className="kh-row"><button type="button" className="kh-btn" onClick={() => go(task.page)}>Show me how</button>
          <button type="button" className={doneWeek.includes(task.id) ? 'kh-btn' : 'kh-btn dark'} onClick={() => toggle(task.id)}>{doneWeek.includes(task.id) ? 'Undo' : 'Done'}</button></div>
      </article>)}</div>
    </Card>

    <Card title={`${locality.name} at a glance`} sub="What the local numbers mean for families. Tap a card to learn more.">
      <div className="kh-tiles">
        <button type="button" className="kh-tile" onClick={() => { setBody('brain'); go('health') }}>
          <img src="/health-assets/brain-development.png" alt="" />
          <span className="kh-tag watch">Development</span>
          <strong>{oneIn(figures.aedc.vulnerableOne)}</strong>
          <People value={figures.aedc.vulnerableOne} />
          <p>children starting school here need extra support in at least one area of development.</p>
          <span className="kh-go">See what helps →</span>
        </button>
        <button type="button" className="kh-tile" onClick={() => go('vaccines')}>
          <img src="/health-assets/allergy-immune.png" alt="" />
          <span className="kh-tag good">Vaccines</span>
          <strong>{inHundred(twoYear?.pha.percent)}</strong>
          <p>2-year-olds nearby are fully vaccinated{twoYear?.victoria ? `, compared with ${inHundred(twoYear.victoria.percent)} across Victoria` : ''}.</p>
          <span className="kh-go">Check your child’s schedule →</span>
        </button>
        <button type="button" className="kh-tile" onClick={() => go('food')}>
          <img src="/health-assets/metabolic-health.png" alt="" />
          <span className="kh-tag watch">Food</span>
          <strong>{inHundred(vegetables?.area.percent)}</strong>
          <p>children in the {nutrition.data?.locality?.department_area ?? 'surrounding'} region eat enough vegetables. Most Victorian children fall short too.</p>
          <span className="kh-go">Track today’s serves →</span>
        </button>
        <button type="button" className="kh-tile" onClick={() => { setBody('lungs'); go('health') }}>
          <img src="/health-assets/lungs-asthma.png" alt="" />
          <span className="kh-tag geo">Asthma</span>
          <strong>{inHundred(toddler?.percent)}</strong>
          <p>children aged 0–14 here have asthma. Thunderstorm asthma season runs October to December.</p>
          <span className="kh-go">Prepare for spring →</span>
        </button>
      </div>
    </Card>

    <div className="kh-split">
      <Card title={`Right now: ${now.title}`} sub={now.why} aside={<span className="kh-tag watch">{MONTH_NAMES[new Date().getMonth()]}</span>}>
        <ul className="kh-steps plain">{now.actions.map(action => <li key={action}><span>{action}</span></li>)}</ul>
        <a className="kh-link" href={now.link} target="_blank" rel="noreferrer">{now.linkLabel} ↗</a>
      </Card>
      <Card title="Worried about something?" sub="Build a one-page summary to take to your GP or teacher.">
        <p className="kh-note">Answer short questions about hearing, speech, focus, feelings, play, sleep and school. There are no scores and no diagnosis.</p>
        <div className="kh-row"><button type="button" className="kh-btn primary" onClick={() => onOpenPlan('brain', age)}>Start the questions</button>
          <button type="button" className="kh-btn" onClick={() => go('care')}>Find care nearby</button></div>
        <p className="kh-src">{services} health services and {childcare.data?.active_education_care_services ?? '—'} childcare services are listed in {locality.name}.</p>
      </Card>
    </div>
  </div>
}

function ProjectionChart({ rows }: { rows: PopulationProjection[] }) {
  if (rows.length < 2) return <p className="kh-empty">No projection is published for this locality.</p>
  const width = 560, height = 210, pad = 36
  const series: Array<[keyof PopulationProjection, string, string]> = [
    ['population_age_0_4_projected', '0–4', 'var(--kh-blue)'],
    ['population_age_5_9_projected', '5–9', 'var(--kh-amber)'],
    ['population_age_10_14_projected', '10–14', 'var(--kh-green)'],
  ]
  const values = rows.flatMap(row => series.map(([key]) => Number(row[key] ?? 0)))
  const max = Math.ceil(Math.max(...values, 1) / 100) * 100
  const x = (index: number) => pad + index * (width - pad * 2) / (rows.length - 1)
  const y = (value: number) => height - 28 - (value / max) * (height - 56)
  const ticks = [0, max / 2, max]
  return <div className="kh-scroll"><svg className="kh-chart" viewBox={`0 0 ${width + 30} ${height}`} role="img" aria-label="Projected children by age group">
    {ticks.map(tick => <g key={tick}><line x1={pad} x2={width - pad} y1={y(tick)} y2={y(tick)} className="kh-grid" /><text x={pad - 8} y={y(tick) + 4} textAnchor="end">{Math.round(tick)}</text></g>)}
    {rows.map((row, index) => <text key={row.projection_year} x={x(index)} y={height - 6} textAnchor="middle">{row.projection_year}</text>)}
    {series.map(([key, label, color]) => {
      const points = rows.map((row, index) => `${x(index)},${y(Number(row[key] ?? 0))}`).join(' ')
      const last = rows[rows.length - 1]
      return <g key={label}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {rows.map((row, index) => <circle key={row.projection_year} cx={x(index)} cy={y(Number(row[key] ?? 0))} r={index === rows.length - 1 ? 5 : 3.5} fill={color}><title>{`${label} years, ${row.projection_year}: ${count(Number(row[key]))}`}</title></circle>)}
        <text x={x(rows.length - 1) + 9} y={y(Number(last[key] ?? 0)) + 4} fill={color} className="kh-direct">{label}</text>
      </g>
    })}
  </svg></div>
}

function PractitionerHome({ figures, immunisation, data, childcare, prevention, locality }: PageContext) {
  const asthma = figures.sa2('asthma')
  const twoYear = immunisation.data?.indicators.find(item => item.indicator_id === 'immunised_age_2')
  const rows = figures.projections
  const first = rows[0], last = rows[rows.length - 1]
  const infantChange = first && last && first.population_age_0_4_projected ? ((Number(last.population_age_0_4_projected) / Number(first.population_age_0_4_projected)) - 1) * 100 : null
  const categories = (name: string) => data.facilities.filter(item => name === 'mch' ? item.service_type.includes('Maternal') : item.category === name && !item.service_type.includes('Maternal')).length
  const kpis = [
    { label: 'Developmentally vulnerable, ≥1 domain', value: pct(figures.aedc.vulnerableOne), note: `${count(figures.aedc.assessed)} children assessed · AEDC 2024`, geo: 'SA2' },
    { label: 'On track in all five domains', value: pct(figures.aedc.onTrackAll), note: `DV2 ${pct(figures.aedc.vulnerableTwo)} · AEDC 2024`, geo: 'SA2' },
    { label: 'Fully immunised at 24 months', value: pct(twoYear?.pha.percent), note: `Victoria ${pct(twoYear?.victoria?.percent)} · ${twoYear?.reference_period ?? ''}`, geo: 'PHA' },
    { label: 'Children reporting asthma', value: pct(asthma?.percent, 2), note: `${count(asthma?.count)} of ${count(asthma?.population_denominator)} · Census 2021`, geo: 'SA2' },
  ]
  return <div className="kh-stack">
    <div className="kh-kpis">{kpis.map(kpi => <article key={kpi.label} className="kh-kpi"><span>{kpi.label}</span><strong>{kpi.value}</strong><small>{kpi.note}</small><Geo>{kpi.geo}</Geo></article>)}</div>
    <div className="kh-split wide-left">
      <Card title="Language is the strongest domain" sub={`Share of children on track by AEDC domain, 2024. Small cohort (n = ${count(figures.aedc.assessed)}), so intervals are wide.`} aside={<Geo>SA2 · AEDC 2024</Geo>}>
        <div className="kh-bars">{figures.aedc.domains.map(([label, value]) => <div key={label} className="kh-bar"><span>{label}</span><span className="kh-track"><i style={{ width: `${value ?? 0}%` }} /></span><b>{pct(value)}</b></div>)}</div>
        <p className="kh-src">SEIFA IRSD decile {figures.social.seifaDecile ?? '—'} · population {count(figures.social.population)} (Census 2021).</p>
      </Card>
      <Card title="Immunisation coverage" sub={`${immunisation.data?.locality?.pha_name ?? figures.phaName} vs pooled Victoria`} aside={<Geo>PHA</Geo>}>
        <div className="kh-rings">{(immunisation.data?.indicators ?? []).map(item => <Ring key={item.indicator_id} value={item.pha.percent} good={(item.pha.percent ?? 0) >= 95} label={item.age} caption={`Vic ${pct(item.victoria?.percent)} · ${count(item.pha.numerator)}/${count(item.pha.denominator)}`} />)}</div>
        <p className="kh-src">95% national aspirational target. Victoria pools published numerators and denominators across {immunisation.data?.indicators[0]?.victoria?.pha_count ?? 'all'} PHAs.</p>
      </Card>
    </div>
    <div className="kh-split wide-left">
      <Card title={infantChange !== null ? `Children aged 0–4 projected to ${infantChange >= 0 ? 'rise' : 'fall'} ${Math.abs(Math.round(infantChange))}% by ${last?.projection_year}` : 'Projected children'} sub="Victoria in Future 2023. Modelled scenario, not a forecast of need." aside={<Geo>SA2 · VIF 2023</Geo>}>
        <ProjectionChart rows={rows} />
      </Card>
      <Card title="Service presence" sub={`Listed inside ${locality.name}. Presence is not capacity.`} aside={<Geo>SA2</Geo>}>
        <table className="kh-table"><tbody>
          <tr><td>General practices</td><td>{categories('general_practice')}</td></tr>
          <tr><td>Maternal and child health</td><td>{categories('mch')}</td></tr>
          <tr><td>Pharmacies</td><td>{categories('pharmacy')}</td></tr>
          <tr><td>Hospitals</td><td>{categories('hospital')}</td></tr>
          <tr><td>Childcare services (approved places)</td><td>{count(childcare.data?.active_education_care_services)} ({count(childcare.data?.total_approved_places)})</td></tr>
          <tr><td>Public transport stops</td><td>{count(prevention.data?.transport?.public_transport_stop_count)}</td></tr>
        </tbody></table>
        <p className="kh-src">Healthdirect March 2025 · ACECQA matched to G-NAF 2026 · DTP stops 2026.</p>
      </Card>
    </div>
  </div>
}

/* ------------------------------------------------------------------ health */

function HealthPage({ parent, body, setBody, figures, immunisation, nutrition, prevention, onOpenPlan, age, locality }: PageContext) {
  const [done, setDone] = useStored<string[]>(STEP_KEY, [])
  const selected = BODIES.find(item => item.id === body) ?? BODIES[0]
  const sa2 = figures.sa2
  const pha = figures.pha
  const immune = immunisation.data?.indicators ?? []
  const weight = (id: string) => nutrition.data?.weight.find(item => item.indicator_id === id)
  const activity = nutrition.data?.vcams.find(item => item.indicator_id === 'recommended_daily_physical_activity')
  const tobacco = prevention.data?.vcams.find(item => item.indicator_id === 'tobacco_smoke_exposure_at_home')
  const facts: Record<BodyId, Array<[string, string]>> = {
    brain: [[pct(figures.aedc.onTrackAll, 0), 'of children starting school are on track in all five areas of development.'], [oneIn(figures.aedc.vulnerableOne), 'need extra support in at least one area.'], [pct(sa2('mental_health_condition')?.percent), 'of children aged 0–14 have a reported mental-health condition.']],
    lungs: [[count(sa2('asthma')?.count), `children aged 0–14 here have asthma (${inHundred(sa2('asthma')?.percent)}).`], ['Oct–Dec', 'is thunderstorm asthma season in Victoria.'], [pct(tobacco?.area.percent, 0), `of children in the ${prevention.data?.locality?.department_area ?? 'surrounding'} region are exposed to tobacco smoke at home.`]],
    metabolic: [[pct(weight('child_obese')?.pha.percent), `of children nearby live with obesity (Victoria ${pct(weight('child_obese')?.victoria?.percent)}).`], [pct(weight('child_overweight_not_obese')?.pha.percent, 0), 'are above a healthy weight, not counting obesity.'], [inHundred(activity?.area.percent), 'children in the region are active for 60 minutes a day.']],
    immune: immune.map(item => [inHundred(item.pha.percent), `children nearby are fully vaccinated at ${item.age}.`] as [string, string]),
    perinatal: [[pct(pha('low_birthweight')?.rate_or_percent), 'of babies nearby are born with low birthweight.'], [pct(pha('smoking_during_pregnancy')?.rate_or_percent), 'of mothers smoked during pregnancy.'], [pha('infant_mortality')?.rate_or_percent?.toFixed(1) ?? '—', 'infant deaths per 1,000 births.']],
  }
  const row = (label: string, value: string, geo: string) => ({ label, value, geo })
  const measures: Record<BodyId, Array<{ label: string; value: string; geo: string }>> = {
    brain: [row('Vulnerable on ≥1 domain', pct(figures.aedc.vulnerableOne), 'SA2 · AEDC 2024'), row('Vulnerable on ≥2 domains', pct(figures.aedc.vulnerableTwo), 'SA2 · AEDC 2024'), ...figures.aedc.domains.map(([label, value]) => row(`${label} on track`, pct(value), 'SA2 · AEDC 2024')), row('Mental-health condition', `${pct(sa2('mental_health_condition')?.percent, 2)} (${count(sa2('mental_health_condition')?.count)}/${count(sa2('mental_health_condition')?.population_denominator)})`, 'SA2 · Census 2021'), row('Mental-health condition', pct(pha('child_mental_health_condition')?.rate_or_percent, 2), `PHA · ${pha('child_mental_health_condition')?.reference_period ?? ''}`)],
    lungs: [row('Asthma', `${pct(sa2('asthma')?.percent, 2)} (${count(sa2('asthma')?.count)}/${count(sa2('asthma')?.population_denominator)})`, 'SA2 · Census 2021'), row('Asthma', pct(pha('child_asthma')?.rate_or_percent, 2), `PHA · ${pha('child_asthma')?.reference_period ?? ''}`), row('Declared-road traffic percentile', prevention.data?.transport?.traffic_intensity_percentile != null ? `${Math.round(prevention.data.transport.traffic_intensity_percentile)}th of ${prevention.data.transport.sa2_compared}` : '—', 'SA2 · AADT 2019'), row('Tobacco smoke at home', pct(tobacco?.area.percent), `Dept area · VCAMS ${tobacco?.reference_year ?? ''}`)],
    metabolic: ['child_obese', 'child_overweight_not_obese'].map(id => { const item = weight(id); return row(id === 'child_obese' ? 'Obesity' : 'Overweight, excluding obesity', `${pct(item?.pha.percent, 2)} (95% CI ${item?.pha.lower_95_ci?.toFixed(1) ?? '—'}–${item?.pha.upper_95_ci?.toFixed(1) ?? '—'}) · Vic ${pct(item?.victoria?.percent)}`, `PHA · modelled ${item?.reference_period ?? ''}`) }).concat([row('Active 60 minutes daily', pct(activity?.area.percent), `Dept area · VCAMS ${activity?.reference_year ?? ''}`)]),
    immune: immune.map(item => row(`Fully immunised, ${item.age}`, `${pct(item.pha.percent, 2)} (${count(item.pha.numerator)}/${count(item.pha.denominator)}) · Vic ${pct(item.victoria?.percent)}`, `PHA · ${item.reference_period}`)),
    perinatal: [row('Low birthweight', pct(pha('low_birthweight')?.rate_or_percent, 2), `PHA · ${pha('low_birthweight')?.reference_period ?? ''}`), row('Smoking during pregnancy', pct(pha('smoking_during_pregnancy')?.rate_or_percent, 2), `PHA · ${pha('smoking_during_pregnancy')?.reference_period ?? ''}`), row('Infant mortality', `${pha('infant_mortality')?.rate_or_percent?.toFixed(2) ?? '—'} per 1,000`, `PHA · ${pha('infant_mortality')?.reference_period ?? ''}`)],
  }
  const toggle = (key: string) => setDone(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])
  return <div className="kh-stack">
    <div className="kh-bodies" role="tablist" aria-label="Body system">{BODIES.map(item => <button key={item.id} type="button" role="tab" aria-selected={item.id === body} onClick={() => setBody(item.id)}>
      <img src={item.image} alt="" /><span>{item.label}</span>
    </button>)}</div>
    {parent ? <div className="kh-body-view">
      <figure className="kh-hero-figure"><img src={selected.image} alt={`Illustration of ${selected.label.toLowerCase()}`} /><figcaption>{selected.label}</figcaption></figure>
      <div className="kh-stack">
        <Card title={`${selected.label} in ${locality.name}`} sub="These describe the area, not your child.">
          <div className="kh-facts">{facts[body].map(([number, text]) => <article key={text}><strong>{number}</strong><p>{text}</p></article>)}</div>
        </Card>
        <Card title="What you can do" sub="Tick as you go. Saved on this device." aside={body === 'brain' ? <button type="button" className="kh-btn primary" onClick={() => onOpenPlan(body, age)}>Prepare for a GP visit</button> : undefined}>
          <ul className="kh-steps">{BODY_STEPS[body].map((step, index) => { const key = `${body}-${index}`; return <li key={key} className={done.includes(key) ? 'is-done' : undefined}><label><input type="checkbox" checked={done.includes(key)} onChange={() => toggle(key)} /><span><b>{step.text}</b><small>{step.why}</small></span></label></li> })}</ul>
          <a className="kh-link" href={BODY_STEPS[body][0].link} target="_blank" rel="noreferrer">Official guidance ↗</a>
        </Card>
      </div>
    </div> : <Card title={selected.label} sub="Measure, value and geography. PHA values describe the containing Population Health Area." aside={<button type="button" className="kh-btn" onClick={() => { void navigator.clipboard?.writeText(measures[body].map(item => `${item.label}\t${item.value}\t${item.geo}`).join('\n')) }}>Copy table</button>}>
      <div className="kh-scroll"><table className="kh-table full"><thead><tr><th>Measure</th><th>Value</th><th>Geography · source</th></tr></thead><tbody>
        {measures[body].map(item => <tr key={`${item.label}-${item.geo}`}><td>{item.label}</td><td><b>{item.value}</b></td><td><span className={item.geo.startsWith('SA2') ? 'kh-tag geo' : 'kh-tag'}>{item.geo}</span></td></tr>)}
      </tbody></table></div>
    </Card>}
  </div>
}

/* ------------------------------------------------------------------ vaccines */

function VaccinesPage({ parent, immunisation, data, locality, figures }: PageContext) {
  const [birthMonth, setBirthMonth] = useStored(BIRTH_KEY, '')
  const [done, setDone] = useStored<string[]>(VACCINE_DONE_KEY, [])
  const [aboriginal, setAboriginal] = useStored(ABORIGINAL_KEY, false)
  const rows = vaccineRows(birthMonth, done, aboriginal)
  const age = monthsBetween(birthMonth)
  const flu = nextOccurrence(3, 1)
  const catchUp = rows.filter(row => row.status === 'catch-up')
  const upcoming = rows.filter(row => row.status === 'due-soon' || row.status === 'upcoming').slice(0, 3)
  const events: CalendarEvent[] = [
    ...catchUp.map(row => ({ id: `${row.item.id}-catch-up`, title: `Catch-up vaccines: ${row.item.when}`, date: new Date(Date.now() + 7 * 86_400_000), description: `${row.item.vaccines}. Free at your GP or council.` })),
    ...upcoming.filter(row => row.due).map(row => ({ id: row.item.id, title: `Vaccines due: ${row.item.when}`, date: row.due as Date, description: `${row.item.vaccines}. ${row.item.where}.` })),
    ...(age !== null && age >= 6 ? [{ id: `flu-${flu.getFullYear()}`, title: 'Book flu vaccine', date: flu, description: 'Recommended every year from 6 months; free from 6 months to under 5 years.' }] : []),
  ]
  const summary = [`Vaccination plan · ${locality.name}`, ...catchUp.map(row => `Catch up: ${row.item.when} — ${row.item.vaccines}`), ...upcoming.map(row => `${row.due ? monthYear(row.due) : ''}: ${row.item.when} — ${row.item.vaccines}`), '', 'Check the official record: Immunisation History Statement (Medicare app or myGov).'].join('\n')
  const tone: Record<ScheduleStatus, string> = { done: 'good', 'catch-up': 'watch', 'due-soon': 'geo', upcoming: '', school: '' }
  const providers = data.facilities.filter(item => item.category === 'general_practice' || item.category === 'pharmacy')
  return <div className="kh-split wide-right">
    <div className="kh-stack">
      <Card title={parent ? 'How protected is our area?' : 'Coverage vs Victoria'} sub={`${immunisation.data?.locality?.pha_name ?? figures.phaName}, ${immunisation.data?.indicators[0]?.reference_period ?? ''}`} aside={<Geo>PHA</Geo>}>
        {immunisation.loading ? <p className="kh-empty">Loading coverage.</p> : <div className="kh-rings">{(immunisation.data?.indicators ?? []).map(item => <Ring key={item.indicator_id} value={item.pha.percent} good={(item.pha.percent ?? 0) >= 95} label={item.age} caption={parent ? ((item.pha.percent ?? 0) >= (item.victoria?.percent ?? 0) ? 'Above Victoria' : 'Below Victoria') : `Vic ${pct(item.victoria?.percent)} · ${count(item.pha.numerator)}/${count(item.pha.denominator)}`} />)}</div>}
        <p className="kh-src">{parent ? 'The national goal is 95 in 100. Green rings meet it.' : '95% national aspirational target. Victoria is pooled from published numerators and denominators.'}</p>
      </Card>
      <Card title="In Victoria now">
        <ul className="kh-notes">
          <li><b>Infant RSV protection</b><span>Free from mid-March to 30 September 2026 for eligible babies.{age !== null && age < 24 ? ' Your child may be eligible.' : ''}</span><a href={OFFICIAL.rsv} target="_blank" rel="noreferrer">RSV immunisation ↗</a></li>
          <li><b>Flu vaccine</b><span>Every year from 6 months. Free from 6 months to under 5 years.</span></li>
          <li><b>Where to go</b><span>{providers.length ? providers.map(item => item.name).join(', ') : 'No GP or pharmacy is listed inside this SA2.'}</span></li>
        </ul>
      </Card>
    </div>
    <Card title={parent ? 'Your child’s schedule' : 'Family schedule tool'} sub="National Immunisation Program, June 2026. Saved only on this device." aside={<label className="kh-chip">Born<input type="month" value={birthMonth} max={new Date().toISOString().slice(0, 7)} onChange={event => setBirthMonth(event.target.value)} /></label>}>
      <label className="kh-check"><input type="checkbox" checked={aboriginal} onChange={event => setAboriginal(event.target.checked)} />Aboriginal and/or Torres Strait Islander child (adds free Meningococcal B)</label>
      <ol className="kh-timeline">{rows.map(row => <li key={row.item.id} className={row.status ?? 'none'}>
        <span className="kh-when-col"><b>{row.item.when}</b><small>{row.due ? monthYear(row.due) : ''}</small></span>
        <i className="kh-dot" aria-hidden="true" />
        <span className="kh-what"><b>{row.item.vaccines}</b><small>{row.item.where}</small></span>
        <span className="kh-act">{row.status ? <span className={`kh-tag ${tone[row.status]}`}>{STATUS_LABEL[row.status]}</span> : <span className="kh-tag">Add birth month</span>}
          {row.status && row.status !== 'school' && <button type="button" className="kh-btn small" onClick={() => setDone(current => current.includes(row.item.id) ? current.filter(id => id !== row.item.id) : [...current, row.item.id])}>{done.includes(row.item.id) ? 'Undo' : 'Mark done'}</button>}</span>
      </li>)}</ol>
      <div className="kh-row">
        <button type="button" className="kh-btn primary" disabled={!events.length} onClick={() => downloadFile(`kinderprint-vaccines-${slug(locality.name)}.ics`, buildCalendar(events), 'text/calendar')}>Add reminders to calendar</button>
        <button type="button" className="kh-btn" onClick={() => emailToSelf(`Vaccination plan · ${locality.name}`, summary)}>Email to myself</button>
      </div>
      <p className="kh-src">Your ticks are not an official record. <a href={OFFICIAL.historyStatement} target="_blank" rel="noreferrer">Check the Immunisation History Statement ↗</a></p>
    </Card>
  </div>
}

/* ------------------------------------------------------------------ food */

function FoodPage({ parent, nutrition, age, locality }: PageContext) {
  const band = SERVE_BAND[age] ?? '4–8 years'
  const today = new Date().toISOString().slice(0, 10)
  const [serves, setServes] = useState<Record<string, number>>(() => { const stored = readStored<{ date: string; counts: Record<string, number> }>(SERVE_KEY, { date: today, counts: {} }); return stored.date === today ? stored.counts : {} })
  useEffect(() => writeStored(SERVE_KEY, { date: today, counts: serves }), [serves, today])
  const guide = DAILY_SERVES[band]
  const reached = guide.filter(row => (serves[row.group] ?? 0) >= row.serves).length
  const area = nutrition.data?.locality?.department_area
  const habits = nutrition.data?.vcams ?? []
  const summary = [`Food plan · ${band}`, ...guide.map(row => `${row.group}: ${serves[row.group] ?? 0} of ${row.serves} serves`)].join('\n')
  return <div className="kh-split">
    {parent && <Card title="Today’s serves" sub={`Australian Dietary Guidelines · ages ${band}`} aside={<span className={reached >= 4 ? 'kh-tag good' : 'kh-tag'}>{reached} of {guide.length} groups</span>}>
      {guide.map(row => { const current = serves[row.group] ?? 0; const total = Math.ceil(row.serves); return <div key={row.group} className="kh-serve">
        <span><b>{row.group}</b><small>1 serve = {row.example}</small></span>
        <span className="kh-dots">{Array.from({ length: total }, (_, index) => <button key={index} type="button" aria-label={`${row.group}, serve ${index + 1}`} aria-pressed={index < current} className={index === total - 1 && row.serves % 1 ? 'half' : undefined} onClick={() => setServes(value => ({ ...value, [row.group]: value[row.group] === index + 1 ? index : index + 1 }))} />)}</span>
        <em>{current} / {row.serves}</em>
      </div> })}
      <div className="kh-row"><button type="button" className="kh-btn" onClick={() => setServes({})}>Reset today</button><button type="button" className="kh-btn" onClick={() => emailToSelf(`Food plan · ${locality.name}`, summary)}>Email to myself</button></div>
      <a className="kh-link" href={OFFICIAL.serves} target="_blank" rel="noreferrer">Eat for Health ↗</a>
    </Card>}
    <Card title={parent ? `Kids in the ${area ?? ''} region` : `Healthy habits · ${area ?? 'Department area'}`} sub={parent ? 'Blue dot: this region. Grey line: the middle of Victoria’s 17 regions.' : 'VCAMS survey · marker against the median of 17 Department areas'} aside={<Geo>Dept area</Geo>}>
      {nutrition.loading ? <p className="kh-empty">Loading survey context.</p> : <div className="kh-habits">{habits.map(item => <div key={item.indicator_id}>
        <span className="kh-habit-label">{parent ? <><b>{inHundred(item.area.percent)}</b> children {VCAMS_PLAIN[item.indicator_id] ?? item.indicator_label}</> : <b>{VCAMS_LABEL[item.indicator_id] ?? item.indicator_label}</b>}
          <small>{item.age_group} · {item.reference_year}{item.area.quality_flag !== 'available' ? ` · ${item.area.quality_flag.replace(/_/g, ' ')} (RSE ${item.area.rse_percent?.toFixed(0)}%)` : ''}</small></span>
        {!parent && <strong>{pct(item.area.percent)}</strong>}
        <RangeMarker item={item} />
      </div>)}</div>}
    </Card>
    {!parent && <Card title="Healthy weight" sub={`${nutrition.data?.locality?.pha_name ?? 'Containing PHA'} · modelled estimates`} aside={<Geo>PHA</Geo>}>
      <div className="kh-kpis two">{(nutrition.data?.weight ?? []).map(item => <article key={item.indicator_id} className="kh-kpi"><span>{item.indicator_id === 'child_obese' ? 'Obesity' : 'Overweight, excluding obesity'}</span><strong>{pct(item.pha.percent)}</strong><small>95% CI {item.pha.lower_95_ci?.toFixed(1)}–{item.pha.upper_95_ci?.toFixed(1)} · Vic {pct(item.victoria?.percent)} · {item.reference_period}</small></article>)}</div>
    </Card>}
  </div>
}

/* ------------------------------------------------------------------ seasons */

function SeasonsPage({ parent, figures, prevention, locality }: PageContext) {
  const month = new Date().getMonth()
  const [selected, setSelected] = useState(() => (SEASONS.find(item => item.months.includes(month)) ?? SEASONS[0]).id)
  const season = SEASONS.find(item => item.id === selected) ?? SEASONS[0]
  const asthma = figures.sa2('asthma')
  const evidence: Record<string, Array<[string, string]>> = {
    heat: [['Urban heat effect', figures.env.heat === null ? '—' : `+${figures.env.heat.toFixed(1)}°C`], ['Tree and plant cover', pct(figures.env.vegetation)]],
    uv: [['Tree and plant cover (shade)', pct(figures.env.vegetation)], ['Public open space', pct(figures.env.openSpace)]],
    asthma: [['Children with asthma', pct(asthma?.percent, 2)]],
    smoke: [['Bushfire-prone land', pct(prevention.data?.bushfire?.bushfire_prone_pct)]],
    water: [['Public open space', pct(figures.env.openSpace)]],
    flu: [['Children with asthma', pct(asthma?.percent, 2)]],
  }
  const events: CalendarEvent[] = SEASONS.map(item => { const start = nextOccurrence(item.months[0], 1); start.setDate(start.getDate() - 14); return { id: `season-${item.id}-${start.getFullYear()}`, title: `Prepare: ${item.title}`, date: start, description: `${item.actions.join('. ')}. ${item.link}` } })
  return <div className="kh-stack">
    <Card title={parent ? 'Your year at a glance' : 'Prevention calendar'} sub="Select a season. The outlined column is this month." aside={<button type="button" className="kh-btn primary" onClick={() => downloadFile(`kinderprint-seasons-${slug(locality.name)}.ics`, buildCalendar(events), 'text/calendar')}>Add season reminders</button>}>
      <div className="kh-scroll"><div className="kh-cal">
        <span />{MONTH_LETTERS.map((letter, index) => <span key={index} className={index === month ? 'kh-cal-h now' : 'kh-cal-h'}>{letter}</span>)}
        {SEASONS.map(item => <div key={item.id} className="kh-cal-row">
          <button type="button" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>{item.title}</button>
          {MONTH_LETTERS.map((_, index) => <i key={index} className={[item.months.includes(index) ? 'on' : '', index === month ? 'now' : ''].join(' ').trim() || undefined} title={`${item.title} · ${MONTH_NAMES[index]}`} />)}
        </div>)}
      </div></div>
      <div className="kh-season">
        <h3>{season.title} · {MONTH_NAMES[season.months[0]]} – {MONTH_NAMES[season.months[season.months.length - 1]]}</h3>
        <p>{season.why}</p>
        <div className="kh-evidence">{evidence[season.id].map(([label, value]) => <span key={label}>{label} in {locality.name}: <b>{value}</b></span>)}</div>
        <ul>{season.actions.map(action => <li key={action}>{action}</li>)}</ul>
        <a className="kh-link" href={season.link} target="_blank" rel="noreferrer">{season.linkLabel} ↗</a>
      </div>
    </Card>
    <div className="kh-split">
      <Card title="Check today" sub="Official live services for the Central forecast district.">
        <div className="kh-live">{[['Heat-health warning', OFFICIAL.heat], ['Thunderstorm asthma forecast', OFFICIAL.asthmaForecast], ['Air quality', OFFICIAL.airWatch], ['UV and sun protection times', OFFICIAL.sunSmart]].map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer"><b>{label}</b><span>Open ↗</span></a>)}</div>
      </Card>
      <Card title={parent ? 'About where you live' : 'Place context'} sub={parent ? 'Local features that change how each season feels.' : '2018 environment measures and 2019 traffic describe the SA2, not a home.'} aside={<Geo>SA2</Geo>}>
        <ul className="kh-notes">
          <li><b>Shade and heat</b><span>{pct(figures.env.vegetation)} tree and plant cover; urban heat effect {figures.env.heat === null ? '—' : `+${figures.env.heat.toFixed(1)}°C`}.</span></li>
          <li><b>Parks</b><span>{pct(figures.env.openSpace)} of the area is public open space.</span></li>
          <li><b>Roads</b><span>{prevention.data?.transport?.traffic_intensity_percentile != null ? `Busier than ${Math.round(prevention.data.transport.traffic_intensity_percentile)}% of ${prevention.data.transport.sa2_compared} Melbourne areas.` : '—'}</span></li>
          <li><b>Bushfire</b><span>{pct(prevention.data?.bushfire?.bushfire_prone_pct)} of the area is designated bushfire-prone.</span></li>
        </ul>
      </Card>
    </div>
  </div>
}

/* ------------------------------------------------------------------ care */

function CarePage({ parent, data, childcare, prevention, locality }: PageContext) {
  const label = (facility: HealthFacility) => facility.service_type.includes('Maternal') ? 'Maternal and child health' : facility.category === 'pharmacy' ? 'Pharmacy' : facility.category === 'hospital' ? 'Hospital' : 'General practice'
  const icon = (facility: HealthFacility) => facility.service_type.includes('Maternal') ? <><circle cx="12" cy="8" r="3" /><path d="M6 20c0-4 3-6 6-6s6 2 6 6" /></> : facility.category === 'pharmacy' ? <><rect x="5" y="4" width="14" height="16" rx="3" /><path d="M12 9v6M9 12h6" /></> : <path d="M12 5v14M5 12h14" />
  return <div className="kh-split wide-left">
    <Card title={`${data.facilities.length} listed services`} sub={parent ? 'Call ahead to check fees, bulk billing and appointments.' : 'Healthdirect facilities extract, 7 March 2025. Presence is not capacity.'} aside={<Geo>SA2</Geo>}>
      {data.loading ? <p className="kh-empty">Loading services.</p> : data.facilities.length === 0 ? <p className="kh-empty">No service is listed inside {locality.name}. Services in nearby suburbs may still be close.</p> : <ul className="kh-services">{data.facilities.map(facility => <li key={facility.facility_id}>
        <span className="kh-svc-ic"><svg viewBox="0 0 24 24" aria-hidden="true">{icon(facility)}</svg></span>
        <span><b>{facility.name}</b><small>{label(facility)} · {facility.address.replace(/ Australia$/, '')}</small></span>
        <a className="kh-btn small" href={mapsLink(facility)} target="_blank" rel="noreferrer">Directions</a>
      </li>)}</ul>}
    </Card>
    <Card title="Childcare and getting there" sub="ACECQA National Registers matched to G-NAF 2026" aside={<Geo>SA2</Geo>}>
      <div className="kh-kpis one">
        <article className="kh-kpi"><span>Childcare services</span><strong>{count(childcare.data?.active_education_care_services)}</strong><small>{count(childcare.data?.long_day_care_services)} long day care · {count(childcare.data?.services_with_current_rating)} with a current quality rating</small></article>
        <article className="kh-kpi"><span>Approved places</span><strong>{count(childcare.data?.total_approved_places)}</strong><small>Approved places are not current vacancies</small></article>
        <article className="kh-kpi"><span>Public transport stops</span><strong>{count(prevention.data?.transport?.public_transport_stop_count)}</strong><small>Inside the SA2 · DTP 2026</small></article>
      </div>
    </Card>
  </div>
}
