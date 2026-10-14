/**
 * KinderHub: the audience-aware child health dashboard.
 *
 * Structure follows a KPI → primary visual → supporting cards → detail rhythm on every page.
 * Parents see plain-language frequencies ("1 in 4") and actions; practitioners see exact
 * values, denominators, confidence intervals and a geography badge on every figure.
 * Every value comes from a validated KinderPrint endpoint; nothing is invented client-side.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import {
  api,
  type ChildHealthContext,
  type EarlyChildhoodServices,
  type HealthFacility,
  type ImmunisationContext,
  type NeighbourhoodProfile,
  type NeighbourhoodSearchResult,
  type NutritionContext,
  type PopulationProjection,
  type PreventionContext,
  recordDataIssue,
} from '../../services/api'
import { readStored, writeStored } from '../health/healthPlanning'
import './KinderHub.css'
import HealthyDay from './HealthyDay'
import { TodayParent, TodayPractitioner } from './TodayPage'
import HealthTopics from './HealthTopics'
import VaccinesTool from './VaccinesTool'
import SeasonsTool from './SeasonsTool'
import CareNearby from './CareNearby'
import PlayToday from './PlayToday'
import LookingAhead from './LookingAhead'

/* ------------------------------------------------------------------ types */

export type Audience = 'parent' | 'practitioner'
type Page = 'home' | 'day' | 'health' | 'vaccines' | 'food' | 'seasons' | 'care' | 'future'
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
const AGES = ['0–4 years', '5–9 years', '10–14 years']

const NAV: Array<{ id: Page; label: string; icon: ReactNode }> = [
  { id: 'home', label: 'Overview', icon: <path d="M3 11l9-7 9 7v9H5z" /> },
  { id: 'day', label: 'Healthy day check', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { id: 'health', label: 'Health', icon: <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" /> },
  { id: 'vaccines', label: 'Vaccines', icon: <path d="M18 2l4 4M17 7l-9 9-3 1 1-3 9-9M3 21l3-3" /> },
  { id: 'food', label: 'Play today', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></> },
  { id: 'seasons', label: 'Seasons', icon: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2" /></> },
  { id: 'care', label: 'Care nearby', icon: <><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" /></> },
  { id: 'future', label: 'In 2031', icon: <><path d="M3 20h18" /><path d="M6 16l4-5 3 3 5-7" /><path d="M15 7h3v3" /></> },
]


/* ------------------------------------------------------------------ helpers */


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
    let current = true
    setResults([])
    setState('loading')
    const timer = window.setTimeout(() => api.searchNeighbourhoods(query)
      .then(response => { if (!current) return; setResults(response.data.filter(item => /^\d{9}$/.test(item.id)).slice(0, 8)); setActive(0); setState('idle') })
      .catch(() => { if (!current) return; setResults([]); setState('error') }), 220)
    return () => { current = false; window.clearTimeout(timer) }
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
      <span className="kh-picker-label">{locality?.name ?? 'Choose an area'}</span>
      {locality && <span className="kh-picker-change">Change</span>}
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
        <a href="/map/where-to-live">Compare areas to live in</a>
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
    (value): value is Page => typeof value === 'string' && ['home', 'day', 'health', 'vaccines', 'food', 'seasons', 'care', 'future'].includes(value))
  const [navExpanded, setNavExpanded] = useState(true)
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

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const heading: Record<Page, [string, string]> = parent ? {
    home: [greeting, `Here’s what matters for a ${age.replace(' years', '')} year old in ${locality.name} right now.`],
    day: ['Healthy day check', 'Describe a typical weekday. See how it compares with the guidelines and the two changes that would help most.'],
    health: ['Your child’s health, area by area', 'Pick a part of the body to see what local numbers mean and what you can do.'],
    vaccines: ['Vaccines', 'Your child’s free vaccines, what’s next, and how protected your area is.'],
    food: ['Where to play today', 'The best time to play outside, places nearby and active minutes.'],
    seasons: ['Stay a season ahead', 'What’s coming, why it matters here, and what to do.'],
    care: ['Care nearby', `Health and childcare services listed in ${locality.name}.`],
    future: ['Growing up here in 2031', 'How many children will live here and whether services keep up.'],
  } : {
    home: [`${locality.name} · child health brief`, 'Population evidence for planning and service conversations. Every value shows its geography and year.'],
    day: ['Healthy day check', 'Parent planning tool.'],
    health: ['Child health conditions', 'Exact SA2 observations and separately labelled PHA context. No PHA value is assigned to an SA2.'],
    vaccines: ['Immunisation coverage', 'Australian Immunisation Register coverage via PHIDU, with a pooled Victorian reference.'],
    food: ['Active play access', 'Play spaces, activity and screen habits, and heat and shade.'],
    seasons: ['Seasonal prevention', 'Seasonal risks explained with SA2 place context. 2018 environment measures describe the area, not exposure.'],
    care: ['Care access', 'Directory presence inside the SA2. Not capacity, fees, bulk billing or waiting time.'],
    future: ['Future demand', 'Projected children and service pressure, 2021 to 2036.'],
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
  const themed = today || page === 'day' || page === 'health' || page === 'vaccines' || page === 'seasons' || page === 'care' || page === 'food' || page === 'future'
  const themeClass = themed ? (parent ? ' kt-theme-parent' : ' kt-theme-prac') : ''
  // Let the site header and page background around the hub take the same audience theme.
  useEffect(() => {
    const root = document.documentElement
    if (themed) root.dataset.ktTheme = parent ? 'parent' : 'prac'
    else delete root.dataset.ktTheme
    return () => { delete root.dataset.ktTheme }
  }, [themed, parent])

  // Load problems never appear on this page; they go to the admin Data status page (/data-status).
  const issueKey = [...new Set([...pageErrors, ...mappingLimitations])].join('|')
  useEffect(() => {
    if (issueKey) issueKey.split('|').forEach(message => recordDataIssue(`Child Health · ${page} · ${locality.name} (${locality.id})`, null, message))
  }, [issueKey, page, locality.id, locality.name])

  return <div className={`kp-hub ${parent ? 'is-parent' : 'is-practitioner'}${themeClass}`} data-page={page}>
    <div className="kh-shell">
      <nav className="kh-crumbs" aria-label="Breadcrumb"><a href={`/map?area=${encodeURIComponent(locality.id)}&name=${encodeURIComponent(locality.name)}`}>Child Health Explore</a><span aria-hidden="true">›</span><span aria-current="page">{locality.name}</span></nav>
      <header className="kh-top">
        <nav className={`kh-nav${navExpanded ? ' is-expanded' : ''}`} aria-label="Dashboard sections">
          {orderedNav.map(item => <button
            key={item.id}
            type="button"
            aria-current={page === item.id ? 'page' : undefined}
            aria-hidden={!navExpanded && page !== item.id ? true : undefined}
            tabIndex={!navExpanded && page !== item.id ? -1 : undefined}
            onClick={() => go(item.id)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg>{item.label}
          </button>)}
          <button
            className="kh-nav-expand"
            type="button"
            aria-label={navExpanded ? 'Collapse Child Health menu' : 'Expand Child Health menu'}
            title={navExpanded ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={navExpanded}
            onClick={() => setNavExpanded(value => !value)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={navExpanded ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
            </svg>
          </button>
        </nav>
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
        {page === 'food' && <PlayToday parent={parent} locality={locality} age={age} nutrition={nutrition.data} env={figures.env}
          controls={parent ? <><LocalityPicker locality={locality} onSelect={onSelectLocality} /><AgePicker value={age} onChange={setAge} /></> : <LocalityPicker locality={locality} onSelect={onSelectLocality} />} />}
        {page === 'seasons' && <SeasonsTool parent={parent} locality={locality} env={figures.env} asthma={figures.sa2('asthma')?.percent ?? null} prevention={prevention.data}
          controls={<LocalityPicker locality={locality} onSelect={onSelectLocality} />} />}
        {page === 'future' && <LookingAhead parent={parent} locality={locality} onSelectLocality={onSelectLocality}
          controls={<LocalityPicker locality={locality} onSelect={onSelectLocality} />} />}
        {page === 'care' && <CareNearby parent={parent} locality={locality} childcare={childcare.data} prevention={prevention.data}
          controls={<LocalityPicker locality={locality} onSelect={onSelectLocality} />} onOpenMap={onOpenMap} />}
      </main>
      <footer className="kh-foot">Area-level evidence. Vkinder does not diagnose a child or give medical advice. In an emergency call 000.</footer>
    </div>
  </div>
}


/* ------------------------------------------------------------------ home */


/* ------------------------------------------------------------------ health */


/* ------------------------------------------------------------------ vaccines */


/* ------------------------------------------------------------------ food */
