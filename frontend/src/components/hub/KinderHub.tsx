/**
 * KinderHub: the audience-aware child health dashboard.
 *
 * Structure follows a KPI → primary visual → supporting cards → detail rhythm on every page.
 * Parents see plain-language frequencies ("1 in 4") and actions; practitioners see exact
 * values, denominators, confidence intervals and a geography badge on every figure.
 * Every value comes from a validated KinderPrint endpoint; nothing is invented client-side.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

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
  OFFICIAL,
  buildCalendar,
  downloadFile,
  emailToSelf,
  nextOccurrence,
  readStored,
  writeStored,
  type CalendarEvent,
} from '../health/healthPlanning'
import './KinderHub.css'
import HealthyDay from './HealthyDay'
import { TodayParent, TodayPractitioner } from './TodayPage'
import HealthTopics from './HealthTopics'
import VaccinesTool from './VaccinesTool'

/* ------------------------------------------------------------------ types */

export type Audience = 'parent' | 'practitioner'
type Page = 'home' | 'day' | 'health' | 'vaccines' | 'food' | 'seasons' | 'care'
export type BodyId = 'brain' | 'lungs' | 'metabolic' | 'immune' | 'perinatal'

export interface HubData {
  facilities: HealthFacility[]
  projections: PopulationProjection[]
  profile: NeighbourhoodProfile | null
  childHealth: ChildHealthContext | null
  loading: boolean
  errors: Partial<Record<'facilities' | 'projections' | 'profile' | 'environmentalDifference' | 'childHealth', string>>
}

interface KinderHubProps {
  locality: NeighbourhoodSearchResult
  data: HubData
  onSelectLocality: (value: NeighbourhoodSearchResult) => void
  onOpenPlan: (body: BodyId, age: string) => void
  /** Opens the Melbourne map. */
  onOpenMap?: () => void
}

type Loaded<T> = { data: T | null; loading: boolean; error: string | null }

/* ------------------------------------------------------------------ constants */

const AUDIENCE_KEY = 'kinderprint-audience'
const AGE_KEY = 'kinderprint-child-age'
const PAGE_KEY = 'kinderprint-hub-page'
const BIRTH_KEY = 'kinderprint-child-birth-month'
const SERVE_KEY = 'kinderprint-serves'

const AGES = ['0–4 years', '5–9 years', '10–14 years']
const SERVE_BAND: Record<string, string> = { '0–4 years': '2–3 years', '5–9 years': '4–8 years', '10–14 years': '9–11 years' }
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const NAV: Array<{ id: Page; label: string; icon: ReactNode }> = [
  { id: 'home', label: 'Overview', icon: <path d="M3 11l9-7 9 7v9H5z" /> },
  { id: 'day', label: 'Healthy day check', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { id: 'health', label: 'Health', icon: <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" /> },
  { id: 'vaccines', label: 'Vaccines', icon: <path d="M18 2l4 4M17 7l-9 9-3 1 1-3 9-9M3 21l3-3" /> },
  { id: 'food', label: 'Food & play', icon: <path d="M12 7c-3-2-8-1-8 5s4 9 6 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 6-3 6-9s-5-7-8-5zM12 7c0-2 1-4 3-4" /> },
  { id: 'seasons', label: 'Seasons', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" /></> },
  { id: 'care', label: 'Care nearby', icon: <><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" /></> },
]



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

const VCAMS_STANDARD_DIRECTION: Partial<Record<string, 'higher' | 'lower'>> = {
  minimum_recommended_vegetables: 'higher',
  minimum_recommended_fruit: 'higher',
  recommended_daily_physical_activity: 'higher',
  electronic_media_over_two_hours: 'lower',
  household_food_insecurity: 'lower',
  tobacco_smoke_exposure_at_home: 'lower',
}

/* ------------------------------------------------------------------ helpers */

const pct = (value: number | null | undefined, digits = 1) => value === null || value === undefined ? '—' : `${value.toFixed(digits)}%`
const inHundred = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${Math.round(value)} in 100`
const count = (value: number | null | undefined) => value === null || value === undefined ? '—' : Math.round(value).toLocaleString('en-AU')
const slug = (value: string) => value.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase()
const mapsLink = (facility: HealthFacility) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${facility.name} ${facility.address}`)}`

function useEndpoint<T>(load: (signal: AbortSignal) => Promise<{ data: T }>, key: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: true, error: null })
  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, loading: true, error: null })
    load(controller.signal)
      .then(response => setState({ data: response.data, loading: false, error: null }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setState({ data: null, loading: false, error: 'This data section could not be loaded.' }) })
    return () => controller.abort()
    // The loader closes over the locality id, which is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

function useStored<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): [T, (value: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, validate))
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


function RangeMarker({ item }: { item: DepartmentAreaIndicator }) {
  if (item.area.percent === null) return null
  const value = Math.max(0, Math.min(100, item.area.percent))
  const direction = VCAMS_STANDARD_DIRECTION[item.indicator_id]
  const rawStandard = item.department_areas?.median
  const standard = rawStandard === undefined ? null : Math.max(0, Math.min(100, rawStandard))
  const hasStandard = Boolean(direction && standard !== null)
  const meetsStandard = !hasStandard || (direction === 'higher' ? value >= standard! : value <= standard!)
  const description = hasStandard ? `${value.toFixed(1)}% in this region · standard ${standard!.toFixed(1)}% · ${meetsStandard ? 'meets standard' : 'does not meet standard'}` : `${value.toFixed(1)}% in this region`
  return <span className={`kh-range ${meetsStandard ? 'is-met' : 'is-below'}${hasStandard ? ' has-standard' : ''}`} role="img" aria-label={description} title={description}>
    <i><b style={{ width: `${value}%` }} /></i>
    {hasStandard && <em style={{ left: `${standard}%` }} />}
  </span>
}

/** Area chooser: shows the chosen area, opens a search, and offers the map as another way to choose. */
export function LocalityPicker({ locality, onSelect, autoOpen = false }: { locality: NeighbourhoodSearchResult | null; onSelect: (value: NeighbourhoodSearchResult) => void; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NeighbourhoodSearchResult[]>([])
  const [active, setActive] = useState(0)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); setState('idle'); return }
    setState('loading')
    const timer = window.setTimeout(() => api.searchNeighbourhoods(query)
      .then(response => { setResults(response.data.filter(item => /^\d{9}$/.test(item.id)).slice(0, 8)); setActive(0); setState('idle') })
      .catch(() => { setResults([]); setState('error') }), 220)
    return () => window.clearTimeout(timer)
  }, [query])
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const choose = (item: NeighbourhoodSearchResult) => { onSelect(item); setQuery(''); setResults([]); setOpen(false) }
  const mapHref = locality ? `/map?area=${encodeURIComponent(locality.id)}&name=${encodeURIComponent(locality.name)}` : '/map'
  return <div className={`kh-picker${open ? ' is-open' : ''}`} ref={rootRef}>
    <button type="button" className="kh-chip kh-picker-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" /></svg>
      <span className="kh-picker-label">{locality ? <><span className="kh-sr">Area: </span>{locality.name}</> : 'Choose an area'}</span>
      <span className="kh-picker-change">{locality ? 'Change' : ''}</span>
      <i aria-hidden="true" className={open ? 'is-open' : undefined} />
    </button>
    {open && <div className="kh-picker-panel" role="dialog" aria-label="Choose an area">
      <label className="kh-picker-search">
        <span className="kh-sr">Search for a suburb</span>
        <input ref={inputRef} value={query} placeholder="Type a suburb, e.g. Box Hill" role="combobox" aria-expanded={results.length > 0} aria-controls="kh-picker-list" aria-autocomplete="list"
          aria-activedescendant={results[active] ? `kh-picker-${results[active].id}` : undefined}
          onChange={event => setQuery(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
            if (event.key === 'ArrowUp') { event.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
            if (event.key === 'Enter' && results[active]) { event.preventDefault(); choose(results[active]) }
            if (event.key === 'Escape') setOpen(false)
          }} />
      </label>
      {state === 'loading' && <p className="kh-picker-note" role="status">Searching…</p>}
      {state === 'error' && <p className="kh-picker-note" role="alert">Search did not work. Check your connection and try again.</p>}
      {state === 'idle' && query.trim().length >= 2 && results.length === 0 && <p className="kh-picker-note">No Greater Melbourne area matches “{query}”.</p>}
      {results.length > 0 && <ul id="kh-picker-list" role="listbox">{results.map((result, index) => <li key={result.id} id={`kh-picker-${result.id}`} role="option" aria-selected={index === active}>
        <button type="button" tabIndex={-1} onMouseEnter={() => setActive(index)} onClick={() => choose(result)}><b>{result.name}</b></button>
      </li>)}</ul>}
      <div className="kh-picker-ways">
        <a href={mapHref}>Choose on the map</a>
        <a href={locality ? `/where-to-live?anchor=${encodeURIComponent(locality.id)}` : '/where-to-live'}>Compare areas to live in</a>
      </div>
    </div>}
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

function AgePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return <div className="kh-age-picker" ref={rootRef}>
    <button className="kh-chip kh-age-trigger" type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span>Child age</span><strong>{value}</strong><i className={open ? 'is-open' : undefined} aria-hidden="true" />
    </button>
    <AnimatePresence>{open && <motion.div className="kh-age-list" role="listbox" aria-label="Child age" initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .98 }} transition={{ duration: .18, ease: 'easeOut' }}>
      {AGES.map(option => <button key={option} type="button" role="option" aria-selected={value === option} onClick={() => { onChange(option); setOpen(false) }}><span>{option}</span><b aria-hidden="true">✓</b></button>)}
    </motion.div>}</AnimatePresence>
  </div>
}

function MonthPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const now = new Date()
  const selectedYear = value ? Number(value.slice(0, 4)) : now.getFullYear()
  const selectedMonth = value ? Number(value.slice(5, 7)) - 1 : -1
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(selectedYear)
  const rootRef = useRef<HTMLDivElement>(null)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const displayValue = value ? `${months[selectedMonth]} ${selectedYear}` : 'Select month'

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const chooseMonth = (month: number) => {
    onChange(`${viewYear}-${String(month + 1).padStart(2, '0')}`)
    setOpen(false)
  }

  return <div className="kh-month-picker" ref={rootRef}>
    <button className="kh-chip kh-month-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setViewYear(selectedYear); setOpen(current => !current) }}>
      <span>Born</span><strong>{displayValue}</strong><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="3" /><path d="M8 3v5M16 3v5M4 10h16" /></svg>
    </button>
    <AnimatePresence>{open && <motion.div className="kh-month-popover" role="dialog" aria-label="Choose birth month" initial={{ opacity: 0, y: -8, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: .98 }} transition={{ duration: .18, ease: 'easeOut' }}>
      <header><button type="button" aria-label="Previous year" onClick={() => setViewYear(year => year - 1)}>‹</button><strong>{viewYear}</strong><button type="button" aria-label="Next year" disabled={viewYear >= now.getFullYear()} onClick={() => setViewYear(year => year + 1)}>›</button></header>
      <div className="kh-month-grid">{months.map((month, index) => { const future = viewYear > now.getFullYear() || (viewYear === now.getFullYear() && index > now.getMonth()); const selected = viewYear === selectedYear && index === selectedMonth; return <button key={month} type="button" aria-pressed={selected} disabled={future} onClick={() => chooseMonth(index)}>{month}</button> })}</div>
      <footer><button type="button" disabled={!value} onClick={() => { onChange(''); setOpen(false) }}>Clear</button><button type="button" onClick={() => { onChange(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`); setOpen(false) }}>This month</button></footer>
    </motion.div>}</AnimatePresence>
  </div>
}

export default function KinderHub({ locality, data, onSelectLocality, onOpenPlan, onOpenMap }: KinderHubProps) {
  const [audience, setAudience] = useStored<Audience>(AUDIENCE_KEY, 'parent',
    (value): value is Audience => value === 'parent' || value === 'practitioner')
  const [storedPage, setPage] = useStored<Page>(PAGE_KEY, 'home',
    (value): value is Page => typeof value === 'string' && ['home', 'day', 'health', 'vaccines', 'food', 'seasons', 'care'].includes(value))
  const [navExpanded, setNavExpanded] = useState(false)
  const [birthMonth, setBirthMonth] = useStored(BIRTH_KEY, '')
  const [age, setAge] = useState(() => { try { return window.localStorage.getItem(AGE_KEY) ?? '5–9 years' } catch { return '5–9 years' } })
  const [body, setBody] = useState<BodyId>('brain')
  useEffect(() => { try { window.localStorage.setItem(AGE_KEY, age) } catch { /* storage unavailable */ } }, [age])

  const figures = useHubFigures(data)
  const immunisation = useEndpoint<ImmunisationContext>(signal => api.getImmunisationContext(locality.id, signal), locality.id)
  const nutrition = useEndpoint<NutritionContext>(signal => api.getNutritionContext(locality.id, signal), locality.id)
  const prevention = useEndpoint<PreventionContext>(signal => api.getPreventionContext(locality.id, signal), locality.id)
  const childcare = useEndpoint<EarlyChildhoodServices | null>(signal => api.getEarlyChildhoodServices(locality.id, signal), locality.id)

  const parent = audience === 'parent'
  // The Healthy day check is a parent tool; practitioners land on the overview instead.
  const page: Page = storedPage === 'day' && !parent ? 'home' : storedPage
  const go = (next: Page) => { setPage(next); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const context: PageContext = { locality, data, figures, immunisation, nutrition, prevention, childcare, parent, age, body, setBody, go, onOpenPlan }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const heading: Record<Page, [string, string]> = parent ? {
    home: [greeting, `Here’s what matters for a ${age.replace(' years', '')} year old in ${locality.name} right now.`],
    day: ['Healthy day check', 'Describe a typical weekday. See how it compares with the guidelines and the two changes that would help most.'],
    health: ['Your child’s health, area by area', 'Pick a part of the body to see what local numbers mean and what you can do.'],
    vaccines: ['Vaccines', 'Your child’s free vaccines, what’s next, and how protected your area is.'],
    food: ['Food and play', 'Track today’s serves and see how kids in your region eat and play.'],
    seasons: ['Stay a season ahead', 'What’s coming, why it matters here, and what to do.'],
    care: ['Care nearby', `Health and childcare services listed in ${locality.name}.`],
  } : {
    home: [`${locality.name} · child health brief`, 'Population evidence for planning and service conversations. Every value shows its geography and year.'],
    day: ['Healthy day check', 'Parent planning tool.'],
    health: ['Child health conditions', 'Exact SA2 observations and separately labelled PHA context. No PHA value is assigned to an SA2.'],
    vaccines: ['Immunisation coverage', 'Australian Immunisation Register coverage via PHIDU, with a pooled Victorian reference.'],
    food: ['Nutrition and activity', 'VCAMS Department-area estimates compared across 17 areas, plus PHA weight estimates.'],
    seasons: ['Seasonal prevention', 'Seasonal risks explained with SA2 place context. 2018 environment measures describe the area, not exposure.'],
    care: ['Care access', 'Directory presence inside the SA2. Not capacity, fees, bulk billing or waiting time.'],
  }
  const pageErrors = [
    ...(page === 'home' ? [data.errors.profile, data.errors.projections, data.errors.facilities, data.errors.childHealth] : []),
    ...(page === 'health' ? [data.errors.profile, data.errors.childHealth] : []),
    ...(page === 'vaccines' ? [immunisation.error, data.errors.facilities] : []),
    ...(page === 'food' ? [nutrition.error] : []),
    ...(page === 'seasons' ? [data.errors.profile, prevention.error] : []),
    ...(page === 'care' ? [data.errors.facilities, childcare.error, prevention.error] : []),
  ].filter((message): message is string => Boolean(message))
  const mappingLimitations = [
    ...(!data.loading && data.childHealth && data.childHealth.locality === null && (page === 'home' || page === 'health')
      ? ['Regional child-health context is unavailable for this locality; no replacement values were created.'] : []),
    ...(!immunisation.loading && immunisation.data?.locality === null && page === 'vaccines'
      ? ['Immunisation context is unavailable because this locality has no supported Population Health Area mapping.'] : []),
    ...(!nutrition.loading && nutrition.data?.locality === null && page === 'food'
      ? ['Nutrition context is unavailable because this locality has no supported regional mapping.'] : []),
  ]
  const visibleNav = NAV.filter(item => parent || item.id !== 'day')
  const orderedNav = [...visibleNav.filter(item => item.id === page), ...visibleNav.filter(item => item.id !== page)]
  const today = page === 'home'
  const themed = today || page === 'day' || page === 'health' || page === 'vaccines'
  const themeClass = themed ? (parent ? ' kt-theme-parent' : ' kt-theme-prac') : ''
  // Let the site header and page background around the hub take the same audience theme.
  useEffect(() => {
    const root = document.documentElement
    if (themed) root.dataset.ktTheme = parent ? 'parent' : 'prac'
    else delete root.dataset.ktTheme
    return () => { delete root.dataset.ktTheme }
  }, [themed, parent])

  return <div className={`kp-hub ${parent ? 'is-parent' : 'is-practitioner'}${themeClass}`} data-page={page}>
    <div className="kh-shell">
      <header className="kh-top">
        <nav className={`kh-nav${navExpanded ? ' is-expanded' : ''}`} aria-label="Dashboard sections" onMouseEnter={() => setNavExpanded(true)} onMouseLeave={() => setNavExpanded(false)} onFocus={() => setNavExpanded(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setNavExpanded(false) }}>{orderedNav.map(item => <button key={item.id} type="button" aria-current={page === item.id ? 'page' : undefined} onClick={event => { go(item.id); setNavExpanded(false); event.currentTarget.blur() }}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg>{item.label}
        </button>)}<button className="kh-nav-expand" type="button" aria-label={navExpanded ? 'Collapse Child Health menu' : 'Expand Child Health menu'} aria-expanded={navExpanded} onClick={event => { setNavExpanded(value => !value); event.currentTarget.blur() }}>›</button></nav>
        <div className="kh-seg" role="group" aria-label="Who is using KinderPrint">
          <button type="button" aria-pressed={parent} onClick={() => setAudience('parent')}>Parent</button>
          <button type="button" aria-pressed={!parent} onClick={() => setAudience('practitioner')}>Practitioner</button>
        </div>
      </header>

      {!themed && <section className="kh-hello" key={`${page}-${audience}`}>
        <div><h1>{heading[page][0]}</h1><p>{heading[page][1]}</p></div>
        <div className="kh-chips">
          <LocalityPicker locality={locality} onSelect={onSelectLocality} />
          {parent
            ? <AgePicker value={age} onChange={setAge} />
            : <span className="kh-chip">SA2 {locality.id}</span>}
        </div>
      </section>}

      {[...new Set([...pageErrors, ...mappingLimitations])].map(message => <p key={message} className="kh-error" role="alert">{message}</p>)}
      <main className="kh-main" key={`${page}-${audience}-${locality.id}`}>
        {page === 'home' && (parent
          ? <TodayParent locality={locality} age={age} controls={<><LocalityPicker locality={locality} onSelect={onSelectLocality} /><AgePicker value={age} onChange={setAge} /></>} onCheckDay={() => go('day')} onGo={go} onPrepareVisit={() => onOpenPlan('brain', age)} onOpenMap={onOpenMap} />
          : <TodayPractitioner locality={locality} controls={<LocalityPicker locality={locality} onSelect={onSelectLocality} />} immunisation={immunisation.data} asthma={figures.sa2('asthma')} asthmaRatio={figures.pha('child_asthma')?.standardised_ratio ?? null} services={data.facilities.length} childcareServices={childcare.data?.active_education_care_services} onOpenMap={onOpenMap} onGo={go} />)}
        {page === 'day' && <HealthyDay age={age} ageControl={<AgePicker value={age} onChange={setAge} />} />}
        {page === 'health' && <HealthTopics parent={parent} locality={locality} age={age} figures={figures} immunisation={immunisation.data} nutrition={nutrition.data} prevention={prevention.data} topic={body} setTopic={setBody}
          controls={parent ? <><LocalityPicker locality={locality} onSelect={onSelectLocality} /><AgePicker value={age} onChange={setAge} /></> : <LocalityPicker locality={locality} onSelect={onSelectLocality} />}
          onPrepareVisit={() => onOpenPlan('brain', age)} onOpenMap={onOpenMap} onOpenCare={() => go('care')} />}
        {page === 'vaccines' && <VaccinesTool parent={parent} locality={locality} birthMonth={birthMonth} immunisation={immunisation.data} phaName={figures.phaName}
          controls={parent ? <><LocalityPicker locality={locality} onSelect={onSelectLocality} /><MonthPicker value={birthMonth} onChange={setBirthMonth} /></> : <LocalityPicker locality={locality} onSelect={onSelectLocality} />}
          onOpenMap={onOpenMap} onOpenCare={() => go('care')} />}
        {page === 'food' && <FoodPage {...context} />}
        {page === 'seasons' && <SeasonsPage {...context} />}
        {page === 'care' && <CarePage {...context} />}
      </main>
      <footer className="kh-foot">Area-level evidence. Vkinder does not diagnose a child or give medical advice. In an emergency call 000.</footer>
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


/* ------------------------------------------------------------------ health */


/* ------------------------------------------------------------------ vaccines */


/* ------------------------------------------------------------------ food */

function FoodPage({ parent, nutrition, age, locality }: PageContext) {
  const band = SERVE_BAND[age] ?? '4–8 years'
  const today = new Date().toISOString().slice(0, 10)
  const [serves, setServes] = useState<Record<string, number>>(() => {
    const stored = readStored<{ date: string; counts: Record<string, number> }>(SERVE_KEY, { date: today, counts: {} },
      (value): value is { date: string; counts: Record<string, number> } => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return false
        const row = value as Record<string, unknown>
        return typeof row.date === 'string' && !!row.counts && typeof row.counts === 'object' && !Array.isArray(row.counts)
          && Object.values(row.counts).every(count => typeof count === 'number' && Number.isFinite(count) && count >= 0)
      })
    return stored.date === today ? stored.counts : {}
  })
  useEffect(() => writeStored(SERVE_KEY, { date: today, counts: serves }), [serves, today])
  const guide = DAILY_SERVES[band]
  const reached = guide.filter(row => (serves[row.group] ?? 0) >= row.serves).length
  const area = nutrition.data?.locality?.department_area
  const habits = nutrition.data?.vcams ?? []
  const summary = [`Food plan · ${band}`, ...guide.map(row => `${row.group}: ${serves[row.group] ?? 0} of ${row.serves} serves`)].join('\n')
  return <div className="kh-split">
    {parent && <Card title="Today’s serves" sub={`Australian Dietary Guidelines · ages ${band}`} aside={<span className={reached >= 4 ? 'kh-tag good' : 'kh-tag'}>{reached} of {guide.length} groups</span>}>
      {guide.map(row => { const current = Math.min(serves[row.group] ?? 0, row.serves); const steps = Math.round(row.serves * 2); const progress = row.serves > 0 ? (current / row.serves) * 100 : 0; return <div key={row.group} className="kh-serve">
        <span><b>{row.group}</b><small>1 serve = {row.example}</small></span>
        <label className="kh-serve-slider" style={{ '--serve-progress': `${progress}%` } as CSSProperties}><span className="kh-sr">{row.group} serves</span><input type="range" min="0" max={row.serves} step="0.5" value={current} onChange={event => setServes(value => ({ ...value, [row.group]: Number(event.target.value) }))} /><span className="kh-serve-ticks" aria-hidden="true">{Array.from({ length: steps + 1 }, (_, index) => <i key={index} className={index % 2 === 0 ? 'major' : undefined} />)}</span></label>
        <em>{current} / {row.serves}</em>
      </div> })}
      <div className="kh-row"><button type="button" className="kh-btn" onClick={() => setServes({})}>Reset today</button><button type="button" className="kh-btn" onClick={() => emailToSelf(`Food plan · ${locality.name}`, summary)}>Email to myself</button></div>
      <a className="kh-link" href={OFFICIAL.serves} target="_blank" rel="noreferrer">Eat for Health ↗</a>
    </Card>}
    <Card title={parent ? `Kids in the ${area ?? ''} region` : `Healthy habits · ${area ?? 'Department area'}`} sub={parent ? 'The mark shows the standard. Green meets it; orange-red does not.' : 'VCAMS survey · mark shows the standard; colour indicates whether it is met'} aside={<Geo>Dept area</Geo>}>
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
