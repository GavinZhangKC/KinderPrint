import { useEffect, useMemo, useState } from 'react'

import {
  api,
  type ChildHealthContext,
  type DepartmentAreaIndicator,
  type HealthFacility,
  type ImmunisationContext,
  type NeighbourhoodSearchResult,
  type NutritionContext,
  type PreventionContext,
  type ProfileIndicator,
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
  type ScheduleItem,
} from './healthPlanning'
import './HealthActionPages.css'

export interface HealthActionPageProps {
  locality: NeighbourhoodSearchResult
  facilities: HealthFacility[]
  childHealth: ChildHealthContext | null
  environment: ProfileIndicator[]
}

type Loaded<T> = { data: T | null; status: string; loading: boolean }

function useEndpoint<T>(load: (signal: AbortSignal) => Promise<{ data: T; status: string }>, key: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, status: 'loading', loading: true })
  useEffect(() => {
    const controller = new AbortController()
    setState(current => ({ ...current, loading: true }))
    load(controller.signal)
      .then(response => setState({ data: response.data, status: response.status, loading: false }))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ data: null, status: 'unavailable', loading: false })
      })
    return () => controller.abort()
    // The loader closes over the locality id, which is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

const pct = (value: number | null | undefined, digits = 1) => value === null || value === undefined ? 'Not published' : `${value.toFixed(digits)}%`
const shortDate = (date: Date) => date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const monthYear = (date: Date) => date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
const mapsLink = (facility: HealthFacility) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${facility.name} ${facility.address}`)}`
const slug = (value: string) => value.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase()

function PageHeading({ locality, eyebrow, title, subtitle, state }: { locality: NeighbourhoodSearchResult; eyebrow: string; title: string; subtitle: string; state: string }) {
  return <div className="dh-board-heading"><div><span className="dh-eyebrow">{eyebrow} · {locality.name}</span><h1>{title}</h1><p>{subtitle}</p></div><span className="dh-data-state">{state}</span></div>
}

function ServiceList({ facilities, categories, empty }: { facilities: HealthFacility[]; categories: string[]; empty: string }) {
  const listed = facilities.filter(item => categories.includes(item.category))
  if (!listed.length) return <p className="ha-muted">{empty}</p>
  return <ul className="ha-services">{listed.map(item => <li key={item.facility_id}>
    <span><strong>{item.name}</strong><small>{item.service_type} · {item.address}</small></span>
    <a href={mapsLink(item)} target="_blank" rel="noreferrer">Directions ↗</a>
  </li>)}</ul>
}

/* -------------------------------- Vaccinations -------------------------------- */

const BIRTH_KEY = 'kinderprint-child-birth-month'
const VACCINE_DONE_KEY = 'kinderprint-vaccines-done'
const ABORIGINAL_KEY = 'kinderprint-child-aboriginal'

export function VaccinationsPage({ locality, facilities }: HealthActionPageProps) {
  const coverage = useEndpoint<ImmunisationContext>(signal => api.getImmunisationContext(locality.id, signal), locality.id)
  const [birthMonth, setBirthMonth] = useState(() => readStored(BIRTH_KEY, ''))
  const [done, setDone] = useState<string[]>(() => readStored(VACCINE_DONE_KEY, []))
  const [aboriginal, setAboriginal] = useState(() => readStored(ABORIGINAL_KEY, false))
  useEffect(() => writeStored(BIRTH_KEY, birthMonth), [birthMonth])
  useEffect(() => writeStored(VACCINE_DONE_KEY, done), [done])
  useEffect(() => writeStored(ABORIGINAL_KEY, aboriginal), [aboriginal])

  const age = monthsBetween(birthMonth)
  const schedule = useMemo(() => [...NIP_SCHEDULE, ...(aboriginal ? NIP_ABORIGINAL_ADDITIONS : [])].sort((a, b) => a.ageMonths - b.ageMonths), [aboriginal])
  const rows = age === null ? [] : schedule.map(item => ({ item, due: dueDate(birthMonth, item.ageMonths), status: scheduleStatus(item, birthMonth, done.includes(item.id)) }))
  const catchUp = rows.filter(row => row.status === 'catch-up')
  const upcoming = rows.filter(row => row.status === 'due-soon' || row.status === 'upcoming').slice(0, 4)
  const flu = nextOccurrence(3, 1)
  const fluEligible = age !== null && age >= 6
  const toggle = (item: ScheduleItem) => setDone(current => current.includes(item.id) ? current.filter(id => id !== item.id) : [...current, item.id])

  const events: CalendarEvent[] = [
    ...catchUp.map(row => ({ id: `${row.item.id}-catch-up`, title: `Catch-up vaccines: ${row.item.when} schedule`, date: new Date(Date.now() + 7 * 86_400_000), description: `${row.item.vaccines}. Book with a GP or council immunisation service. Free under the National Immunisation Program.` })),
    ...upcoming.map(row => ({ id: row.item.id, title: `Vaccines due: ${row.item.when}`, date: row.due, description: `${row.item.vaccines}. ${row.item.where}.` })),
    ...(fluEligible ? [{ id: `flu-${flu.getFullYear()}`, title: 'Book flu vaccine', date: flu, description: 'Flu vaccine is recommended every year from 6 months and is free for children aged 6 months to under 5 years.' }] : []),
  ]
  const summary = [
    `Vaccination plan · ${locality.name}`,
    age === null ? 'Birth month not entered.' : `Child age: ${Math.floor(age / 12)} years ${age % 12} months`, '',
    ...(catchUp.length ? ['To catch up:', ...catchUp.map(row => `- ${row.item.when}: ${row.item.vaccines}`), ''] : []),
    ...(upcoming.length ? ['Coming up:', ...upcoming.map(row => `- ${row.item.when} (${monthYear(row.due)}): ${row.item.vaccines}`), ''] : []),
    'Check the official record: Immunisation History Statement in the Medicare app or myGov.',
    'Status above is entered by the family and is not an official record.',
  ].join('\n')
  const indicators = coverage.data?.indicators ?? []
  const scale = (value: number | null | undefined) => `${Math.min(100, Math.max(0, (((value ?? 80) - 80) / 20) * 100))}%`

  return <div className="dh-page dh-board-page ha-page">
    <PageHeading locality={locality} eyebrow="Vaccinations" title="Vaccinations" subtitle="Area coverage from the Australian Immunisation Register (via PHIDU), your child's National Immunisation Program schedule, reminders and nearby providers." state="Validated data" />
    <section className="ha-grid">
      <article className="dh-feature-card ha-coverage-hero">
        <span className="dh-card-kicker">FULLY IMMUNISED · {(coverage.data?.locality?.pha_name ?? 'containing Population Health Area').toUpperCase()}</span>
        {coverage.loading ? <h2>Loading</h2> : indicators.length === 0 ? <p>No published coverage is linked to this SA2.</p> : <div className="ha-coverage-bars">{indicators.map(item => <div key={item.indicator_id}>
          <b>{item.age}</b>
          <span className="ha-bar"><i style={{ width: scale(item.pha.percent) }} /><em style={{ left: scale(item.victoria?.percent) }} title="Victoria" /><u style={{ left: scale(95) }} title="95% target" /></span>
          <strong>{pct(item.pha.percent)}</strong>
          <small>Victoria {pct(item.victoria?.percent)} · {item.gap_to_target ? `${item.gap_to_target.toFixed(1)} points below the 95% target` : 'at or above the 95% target'}</small>
        </div>)}</div>}
        <small>Scale 80–100%. White marker: Victoria, pooled from {indicators[0]?.victoria?.pha_count ?? 'all'} PHAs. Line: 95% national aspirational target. {indicators[0]?.reference_period ?? ''} · PHA value, not an SA2 estimate.</small>
      </article>

      <article className="dh-board-card">
        <h3>Reminders</h3>
        {age === null ? <p className="ha-muted">Add your child's birth month to build reminders.</p> : <ul className="ha-reminders">
          {catchUp.slice(0, 3).map(row => <li key={row.item.id} className="warn"><b>Catch up</b><span>{row.item.when} vaccines</span></li>)}
          {catchUp.length > 3 && <li className="warn"><b>+{catchUp.length - 3} more</b><span>Tick vaccines already given in the schedule below</span></li>}
          {upcoming.map(row => <li key={row.item.id}><b>{shortDate(row.due)}</b><span>{row.item.when} vaccines</span></li>)}
          {fluEligible && <li><b>{shortDate(flu)}</b><span>Flu vaccine (April–May)</span></li>}
          {!catchUp.length && !upcoming.length && !fluEligible && <li><span>No vaccines are due in the next scheduled period.</span></li>}
        </ul>}
        <div className="ha-button-row">
          <button type="button" className="dh-primary-action" disabled={!events.length} onClick={() => downloadFile(`kinderprint-vaccines-${slug(locality.name)}.ics`, buildCalendar(events), 'text/calendar')}>Add reminders to calendar</button>
          <button type="button" className="ha-secondary" onClick={() => emailToSelf(`Vaccination plan · ${locality.name}`, summary)}>Email to myself</button>
        </div>
        <a className="dh-official-link" href={OFFICIAL.historyStatement} target="_blank" rel="noreferrer">Check the official record (Immunisation History Statement) ↗</a>
      </article>

      <article className="dh-board-card ha-wide">
        <header className="ha-card-head"><div><h3>Your child's schedule</h3><p>National Immunisation Program, June 2026. Saved only on this device.</p></div>
          <label className="ha-field">Birth month<input type="month" value={birthMonth} max={new Date().toISOString().slice(0, 7)} onChange={event => setBirthMonth(event.target.value)} /></label></header>
        <label className="ha-check"><input type="checkbox" checked={aboriginal} onChange={event => setAboriginal(event.target.checked)} />Aboriginal and/or Torres Strait Islander child (adds free Meningococcal B doses)</label>
        <ol className="ha-timeline">{schedule.map(item => {
          const row = rows.find(value => value.item.id === item.id)
          const status = row?.status
          return <li key={item.id} className={status ?? 'upcoming'}>
            <b>{item.when}{row && <small>{monthYear(row.due)}</small>}</b>
            <span><strong>{item.vaccines}</strong><small>{item.where}</small></span>
            <em>{status ? STATUS_LABEL[status] : 'Add birth month'}</em>
            {status && status !== 'school' ? <button type="button" onClick={() => toggle(item)}>{done.includes(item.id) ? 'Undo' : 'Mark done'}</button> : <span />}
          </li>
        })}</ol>
        <p className="ha-muted">Ticks are yours, not an official record. Missed vaccines can be caught up for free.</p>
      </article>

      <article className="dh-board-card">
        <h3>In Victoria now</h3>
        <ul className="ha-notes">
          <li><b>Infant RSV protection</b><span>Victoria's free infant RSV program runs from mid-March to 30 September 2026 for eligible babies.{age !== null && age < 24 ? ' Your child may be eligible. Ask your GP or maternal and child health nurse.' : ''}</span><a href={OFFICIAL.rsv} target="_blank" rel="noreferrer">RSV immunisation ↗</a></li>
          <li><b>Flu vaccine</b><span>Recommended every year from 6 months. Free for children aged 6 months to under 5 years.</span></li>
          <li><b>Eligibility</b><span>Victorian schedule and extra state-funded vaccines.</span><a href={OFFICIAL.victorianSchedule} target="_blank" rel="noreferrer">Victorian schedule ↗</a></li>
        </ul>
      </article>

      <article className="dh-board-card">
        <h3>Where to vaccinate in {locality.name}</h3>
        <ServiceList facilities={facilities} categories={['general_practice', 'pharmacy']} empty="No GP or pharmacy is listed inside this SA2. Council immunisation sessions and nearby GPs may still be available." />
        <p className="ha-muted">Healthdirect listing, 7 March 2025. A listing does not confirm vaccine stock, age limits or fees. Pharmacists vaccinate children only from set ages.</p>
      </article>
    </section>
  </div>
}

/* -------------------------------- Nutrition -------------------------------- */

const SERVE_KEY = 'kinderprint-serves'
const SERVE_BAND_KEY = 'kinderprint-serve-band'
const LUNCH_KEY = 'kinderprint-lunchbox'
const FOOD_GROUPS = ['Vegetables', 'Fruit', 'Grains', 'Protein', 'Dairy'] as const
type FoodGroup = typeof FOOD_GROUPS[number]
const LUNCHBOX: Array<{ name: string; groups: FoodGroup[]; sometimes?: boolean }> = [
  { name: 'Wholegrain sandwich', groups: ['Grains'] }, { name: 'Carrot and cucumber sticks', groups: ['Vegetables'] },
  { name: 'Cherry tomatoes', groups: ['Vegetables'] }, { name: 'Apple or mandarin', groups: ['Fruit'] },
  { name: 'Cheese cubes', groups: ['Dairy'] }, { name: 'Plain yoghurt', groups: ['Dairy'] },
  { name: 'Boiled egg', groups: ['Protein'] }, { name: 'Hummus', groups: ['Protein'] },
  { name: 'Plain popcorn', groups: ['Grains'] }, { name: 'Water bottle', groups: [] },
  { name: 'Chips', groups: [], sometimes: true }, { name: 'Juice box', groups: [], sometimes: true }, { name: 'Muesli bar', groups: [], sometimes: true },
]
const AREA_LABELS: Record<string, string> = {
  minimum_recommended_vegetables: 'Eat enough vegetables',
  minimum_recommended_fruit: 'Eat enough fruit',
  recommended_daily_physical_activity: '60 minutes of activity every day',
  electronic_media_over_two_hours: 'More than 2 hours of screen time',
  household_food_insecurity: 'Household food insecurity',
  tobacco_smoke_exposure_at_home: 'Tobacco smoke exposure at home',
}

function AreaRange({ item }: { item: DepartmentAreaIndicator }) {
  const range = item.department_areas
  const value = item.area.percent
  if (!range || value === null) return <span className="ha-muted">Not published</span>
  const span = Math.max(range.highest - range.lowest, 0.01)
  const place = (v: number) => `${((v - range.lowest) / span) * 100}%`
  return <span className="ha-range" title={`Lowest ${range.lowest}% · middle ${range.median}% · highest ${range.highest}%`}><i /><em style={{ left: place(range.median) }} /><b style={{ left: place(value) }} /></span>
}

function DepartmentAreaTable({ items, area }: { items: DepartmentAreaIndicator[]; area: string | null | undefined }) {
  return <div className="ha-area-table">
    {items.map(item => <div key={item.indicator_id}>
      <span><b>{AREA_LABELS[item.indicator_id] ?? item.indicator_label}</b><small>{item.age_group} · {item.reference_year} · {item.indicator_label}</small></span>
      <strong>{pct(item.area.percent)}</strong>
      <AreaRange item={item} />
      <small>{item.department_areas ? `Range across ${item.department_areas.count} areas: ${item.department_areas.lowest}–${item.department_areas.highest}%` : ''}</small>
      {item.area.quality_flag !== 'available' && <i className="ha-caution">{item.area.quality_flag.replace(/_/g, ' ')} · RSE {item.area.rse_percent?.toFixed(0)}%</i>}
    </div>)}
    <p className="ha-muted">{area ?? 'Department area'} estimates from the Victorian Child Health and Wellbeing Survey (VCAMS). Blue marker: this area. Grey marker: middle of the 17 Department areas. Not SA2 estimates.</p>
  </div>
}

export function NutritionPage({ locality }: HealthActionPageProps) {
  const context = useEndpoint<NutritionContext>(signal => api.getNutritionContext(locality.id, signal), locality.id)
  const today = new Date().toISOString().slice(0, 10)
  const [band, setBand] = useState(() => readStored(SERVE_BAND_KEY, '4–8 years'))
  const [serves, setServes] = useState<Record<string, number>>(() => {
    const stored = readStored<{ date: string; counts: Record<string, number> }>(SERVE_KEY, { date: today, counts: {} })
    return stored.date === today ? stored.counts : {}
  })
  const [lunch, setLunch] = useState<string[]>(() => readStored(LUNCH_KEY, []))
  useEffect(() => writeStored(SERVE_BAND_KEY, band), [band])
  useEffect(() => writeStored(SERVE_KEY, { date: today, counts: serves }), [serves, today])
  useEffect(() => writeStored(LUNCH_KEY, lunch), [lunch])

  const guide = DAILY_SERVES[band] ?? DAILY_SERVES['4–8 years']
  const reached = guide.filter(row => (serves[row.group] ?? 0) >= row.serves).length
  const covered = new Set(lunch.flatMap(name => LUNCHBOX.find(item => item.name === name)?.groups ?? []))
  const missing = FOOD_GROUPS.filter(group => !covered.has(group))
  const sometimes = lunch.filter(name => LUNCHBOX.find(item => item.name === name)?.sometimes)
  const setCount = (group: string, count: number) => setServes(current => ({ ...current, [group]: current[group] === count ? count - 1 : count }))
  const vegetables = context.data?.vcams.find(item => item.indicator_id === 'minimum_recommended_vegetables')
  const summary = [
    `Food plan · ${band}`, `Today: ${reached} of ${guide.length} food groups reached`,
    ...guide.map(row => `- ${row.group}: ${serves[row.group] ?? 0} of ${row.serves} serves (1 serve = ${row.example})`), '',
    `Lunchbox: ${lunch.join(', ') || 'not built'}`, missing.length ? `Missing: ${missing.join(', ')}` : 'All five food groups covered', '',
    'Serves from the Australian Dietary Guidelines (eatforhealth.gov.au).',
  ].join('\n')

  return <div className="dh-page dh-board-page ha-page">
    <PageHeading locality={locality} eyebrow="Nutrition" title="Everyday food and activity" subtitle="Daily serves from the Australian Dietary Guidelines, a lunchbox builder, and published survey and weight context for the area around this locality." state="Validated data" />
    <section className="ha-grid">
      <article className="dh-board-card">
        <header className="ha-card-head"><div><h3>Today's serves</h3><p>Tap a circle for each serve. Saved on this device and reset each day.</p></div>
          <label className="ha-field">Age<select value={band} onChange={event => setBand(event.target.value)}>{Object.keys(DAILY_SERVES).map(key => <option key={key}>{key}</option>)}</select></label></header>
        {guide.map(row => {
          const count = serves[row.group] ?? 0
          const total = Math.ceil(row.serves)
          return <div key={row.group} className="ha-serve-row">
            <span><b>{row.group}</b><small>1 serve = {row.example}</small></span>
            <span className="ha-dots">{Array.from({ length: total }, (_, index) => <button key={index} type="button" aria-label={`${row.group} serve ${index + 1}`} aria-pressed={index < count} className={index === total - 1 && row.serves % 1 ? 'half' : undefined} onClick={() => setCount(row.group, index + 1)} />)}</span>
            <em>{count} / {row.serves}</em>
          </div>
        })}
        <div className="ha-button-row"><strong>{reached} of {guide.length} food groups reached today</strong>
          <button type="button" className="ha-secondary" onClick={() => setServes({})}>Reset today</button>
          <button type="button" className="ha-secondary" onClick={() => emailToSelf(`Food plan · ${locality.name}`, summary)}>Email to myself</button></div>
        <a className="dh-official-link" href={OFFICIAL.serves} target="_blank" rel="noreferrer">Eat for Health: recommended serves ↗</a>
      </article>

      <article className="dh-board-card">
        <h3>Lunchbox builder</h3>
        <p className="ha-muted">Tap what's packed today. Dashed items are "sometimes" foods.</p>
        <div className="ha-foods">{LUNCHBOX.map(item => <button key={item.name} type="button" className={item.sometimes ? 'sometimes' : undefined} aria-pressed={lunch.includes(item.name)} onClick={() => setLunch(current => current.includes(item.name) ? current.filter(name => name !== item.name) : [...current, item.name])}>{item.name}</button>)}</div>
        <div className="ha-groups">{FOOD_GROUPS.map(group => <span key={group} className={covered.has(group) ? 'on' : undefined}>{covered.has(group) ? '✓ ' : ''}{group}</span>)}</div>
        <p><b>{covered.size} of 5</b> food groups covered.{missing.length ? ` Add: ${missing.join(', ')}.` : ''}</p>
        {sometimes.length > 0 && <p className="ha-tip">Swap {sometimes.join(', ')} for water, fruit or plain popcorn.</p>}
        {vegetables?.area.percent != null && <p className="ha-tip info">In the {context.data?.locality?.department_area} area, {pct(vegetables.area.percent)} of children aged 4–12 ate enough vegetables ({vegetables.reference_year}). One extra serve at dinner helps.</p>}
      </article>

      <article className="dh-board-card ha-wide">
        <header className="ha-card-head"><div><h3>Healthy habits in the {context.data?.locality?.department_area ?? 'Department'} area</h3>
          <p>{context.data?.locality?.department_area ? `${locality.name} is in ${context.data.locality.lga_name} LGA, part of the ${context.data.locality.department_area} Department area.` : 'Department area survey context'}</p></div><span className="ha-chip">Department area · VCAMS</span></header>
        {context.loading ? <p className="ha-muted">Loading survey context.</p> : context.data?.vcams.length ? <DepartmentAreaTable items={context.data.vcams} area={context.data.locality?.department_area} /> : <p className="ha-muted">No VCAMS survey context is linked to this SA2.</p>}
      </article>

      <article className="dh-board-card">
        <header className="ha-card-head"><div><h3>Healthy weight context</h3><p>{context.data?.locality?.pha_name ?? 'Containing PHA'} · modelled estimates</p></div><span className="ha-chip">PHA · PHIDU</span></header>
        {context.data?.weight.map(item => <div key={item.indicator_id} className="ha-weight">
          <b>{item.indicator_id === 'child_obese' ? 'Children living with obesity' : 'Above healthy weight, excluding obesity'}</b>
          <strong>{pct(item.pha.percent)}</strong>
          <small>95% CI {item.pha.lower_95_ci?.toFixed(1)}–{item.pha.upper_95_ci?.toFixed(1)}% · Victoria {pct(item.victoria?.percent)} · {item.reference_period}</small>
        </div>)}
        <p className="ha-muted">Modelled area estimates, not measurements of any child. Growth questions are best discussed with a GP or maternal and child health nurse.</p>
      </article>
    </section>
  </div>
}

/* -------------------------------- Prevention -------------------------------- */

const PREVENTION_KEY = 'kinderprint-prevention-actions'
const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

interface Season { id: string; title: string; months: number[]; prepareFrom: number; actions: string[]; link: string; linkLabel: string }
const SEASONS: Season[] = [
  { id: 'heat', title: 'Extreme heat', months: [11, 0, 1, 2], prepareFrom: 11, actions: ['Plan outdoor play before 11 am or after 4 pm', 'Offer water often. Dress children in light, loose clothing', 'Never leave a child in a parked car', 'Check the heat-health warning for the Central district'], link: OFFICIAL.heat, linkLabel: 'Heat-health warnings' },
  { id: 'uv', title: 'Sun and UV', months: [8, 9, 10, 11, 0, 1, 2, 3], prepareFrom: 8, actions: ['Use sun protection when the UV index is 3 or above', 'Hat, sunscreen, covering clothing, shade and sunglasses', 'Choose shaded play spaces'], link: OFFICIAL.sunSmart, linkLabel: 'SunSmart' },
  { id: 'asthma', title: 'Thunderstorm asthma', months: [9, 10, 11], prepareFrom: 9, actions: ['Get the asthma action plan reviewed before October', 'Keep the reliever and spacer on hand', 'Check the forecast daily and stay indoors during storms on high-risk days'], link: OFFICIAL.asthmaForecast, linkLabel: 'Thunderstorm asthma forecast' },
  { id: 'smoke', title: 'Bushfire smoke', months: [11, 0, 1, 2], prepareFrom: 11, actions: ['Check air quality on smoky days', 'Keep children indoors with windows closed when air quality is poor', 'Keep asthma medicines up to date'], link: OFFICIAL.airWatch, linkLabel: 'EPA AirWatch' },
  { id: 'water', title: 'Water safety', months: [10, 11, 0, 1, 2], prepareFrom: 10, actions: ['Always watch young children in and near water', 'Check pool fences and self-closing gates', 'Enrol in swimming and water-safety lessons'], link: OFFICIAL.waterSafety, linkLabel: 'Royal Life Saving' },
  { id: 'flu', title: 'Flu and RSV', months: [5, 6, 7, 8], prepareFrom: 3, actions: ['Get the flu vaccine in April or May', 'Ask about infant RSV protection for babies', 'Keep sick children home and wash hands'], link: OFFICIAL.rsv, linkLabel: 'RSV immunisation' },
]

const BODY_ACTIONS: Record<string, { title: string; link: string; actions: Array<{ text: string; why: string }> }> = {
  lungs: { title: 'Lungs & asthma', link: OFFICIAL.asthmaPlan, actions: [
    { text: 'Written asthma action plan reviewed this year', why: 'The National Asthma Council recommends a written plan for everyone with asthma.' },
    { text: 'Spacer and inhaler technique checked by a pharmacist', why: 'Most people use their inhaler incorrectly.' },
    { text: 'Smoke-free home and car', why: 'Protects developing lungs.' },
    { text: 'Thunderstorm asthma forecast followed from October to December', why: 'Grass-pollen season in Victoria.' }] },
  immune: { title: 'Allergy & immune', link: OFFICIAL.nipSchedule, actions: [
    { text: 'National Immunisation Program vaccines up to date', why: 'See the Vaccinations page for your child’s schedule.' },
    { text: 'Flu vaccine booked for April or May', why: 'Free for children aged 6 months to under 5.' },
    { text: 'Allergy action plan shared with school or childcare (if diagnosed)', why: 'Only for allergies confirmed by a clinician.' }] },
  metabolic: { title: 'Metabolic health', link: OFFICIAL.movement, actions: [
    { text: '60 minutes of active play every day', why: 'Australian 24-hour movement guidelines, 5–17 years.' },
    { text: 'No more than 2 hours of recreational screen time a day', why: 'Australian 24-hour movement guidelines, 5–17 years.' },
    { text: 'Water as the everyday drink', why: 'Instead of juice or soft drink.' },
    { text: 'Vegetables at two meals a day', why: 'See the Nutrition page for daily serves.' }] },
  brain: { title: 'Brain & development', link: OFFICIAL.movement, actions: [
    { text: '9–11 hours of sleep a night (5–13 years)', why: 'Australian 24-hour movement guidelines.' },
    { text: 'Reading together every day', why: 'Supports language and literacy.' },
    { text: 'Maternal and child health and school health checks kept up to date', why: 'Key Ages and Stages visits run from birth to 3½ years.' }] },
  perinatal: { title: 'Perinatal', link: OFFICIAL.safeSleep, actions: [
    { text: 'Whooping cough vaccine during pregnancy', why: 'Protects the newborn.' },
    { text: 'RSV vaccine in pregnancy, or infant RSV protection after birth', why: 'National and Victorian programs.' },
    { text: 'Smoke-free pregnancy and home', why: 'Protects the baby before and after birth.' },
    { text: 'Safe sleep on the back, in their own cot', why: 'Red Nose safe-sleeping guidance.' }] },
}

export function PreventionPage({ locality, childHealth, environment }: HealthActionPageProps) {
  const context = useEndpoint<PreventionContext>(signal => api.getPreventionContext(locality.id, signal), locality.id)
  const month = new Date().getMonth()
  const [selected, setSelected] = useState(() => SEASONS.find(season => season.months.includes(month))?.id ?? 'heat')
  const [body, setBody] = useState('lungs')
  const [done, setDone] = useState<string[]>(() => readStored(PREVENTION_KEY, []))
  useEffect(() => writeStored(PREVENTION_KEY, done), [done])

  const metric = (id: string) => environment.find(item => item.id === id)
  const value = (item: ProfileIndicator | undefined, unit: string) => item?.value == null ? 'Not available' : `${Number(item.value).toFixed(1)}${unit}`
  const vegetation = value(metric('env_vegetation_cover'), '%')
  const heat = value(metric('env_urban_heat'), '°C')
  const openSpace = value(metric('env_open_space_access'), '%')
  const asthma = childHealth?.sa2_indicators.find(item => item.indicator === 'asthma')
  const asthmaText = asthma ? pct(asthma.percent) : 'Not published'
  const bushfire = context.data?.bushfire
  const transport = context.data?.transport
  const smoke = context.data?.vcams.find(item => item.indicator_id === 'tobacco_smoke_exposure_at_home')
  const localEvidence: Record<string, Array<[string, string]>> = {
    heat: [['Urban heat island effect', heat], ['Vegetation cover', vegetation], ['Public open space', openSpace]],
    uv: [['Vegetation cover (shade)', vegetation], ['Public open space', openSpace]],
    asthma: [['Children aged 0–14 reporting asthma (SA2, Census 2021)', asthmaText]],
    smoke: [['Designated bushfire prone', bushfire ? pct(bushfire.bushfire_prone_pct) : 'Loading'], ['Children reporting asthma (SA2)', asthmaText]],
    water: [['Public open space', openSpace]],
    flu: [['Children reporting asthma (SA2)', asthmaText]],
  }
  const season = SEASONS.find(item => item.id === selected) ?? SEASONS[0]
  const seasonMonths = (item: Season) => `${MONTH_NAMES[item.months[0]]} – ${MONTH_NAMES[item.months[item.months.length - 1]]}`
  const bodyPlan = BODY_ACTIONS[body]
  const allActions = Object.entries(BODY_ACTIONS).flatMap(([key, plan]) => plan.actions.map((action, index) => ({ key: `${key}-${index}`, text: action.text })))
  const completed = allActions.filter(action => done.includes(action.key)).length
  const bodyDone = bodyPlan.actions.filter((_, index) => done.includes(`${body}-${index}`)).length
  const toggle = (key: string) => setDone(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])
  const seasonEvents: CalendarEvent[] = SEASONS.map(item => {
    const start = nextOccurrence(item.prepareFrom, 1)
    start.setDate(start.getDate() - 14)
    return { id: `season-${item.id}-${start.getFullYear()}`, title: `Prepare: ${item.title}`, date: start, description: `${item.actions.join('. ')}. Official source: ${item.link}` }
  })
  const planText = [
    `Prevention plan · ${locality.name}`, `${completed} of ${allActions.length} actions done`, '',
    ...Object.entries(BODY_ACTIONS).flatMap(([key, plan]) => [plan.title, ...plan.actions.map((action, index) => `${done.includes(`${key}-${index}`) ? '[x]' : '[ ]'} ${action.text}`), '']),
    'Seasons to prepare for:', ...SEASONS.map(item => `- ${item.title}: ${seasonMonths(item)}`),
  ].join('\n')

  return <div className="dh-page dh-board-page ha-page">
    <PageHeading locality={locality} eyebrow="Prevention" title="Stay a season ahead" subtitle={`What to prepare for in ${locality.name}, why it matters here, and everyday actions for each part of a child's health.`} state={`${completed} of ${allActions.length} actions done`} />
    <section className="ha-grid">
      <article className="dh-board-card ha-wide">
        <header className="ha-card-head"><div><h3>Check today</h3><p>Official live services for the Central forecast district. KinderPrint links to them rather than copying readings.</p></div></header>
        <div className="ha-live">
          <a href={OFFICIAL.heat} target="_blank" rel="noreferrer"><b>Heat-health warning</b><span>Central district status ↗</span></a>
          <a href={OFFICIAL.asthmaForecast} target="_blank" rel="noreferrer"><b>Thunderstorm asthma</b><span>{month >= 9 ? 'Forecast in season ↗' : 'Season starts 1 October ↗'}</span></a>
          <a href={OFFICIAL.airWatch} target="_blank" rel="noreferrer"><b>Air quality</b><span>EPA AirWatch, updated hourly ↗</span></a>
          <a href={OFFICIAL.sunSmart} target="_blank" rel="noreferrer"><b>UV and sun protection times</b><span>SunSmart ↗</span></a>
        </div>
      </article>

      <article className="dh-board-card ha-wide">
        <header className="ha-card-head"><div><h3>Prevention calendar</h3><p>Select a row to see why it matters in {locality.name} and what to do.</p></div>
          <button type="button" className="dh-primary-action" onClick={() => downloadFile('kinderprint-seasonal-reminders.ics', buildCalendar(seasonEvents), 'text/calendar')}>Add season reminders to calendar</button></header>
        <div className="ha-calendar-wrap"><div className="ha-calendar">
          <span />{MONTH_LETTERS.map((label, index) => <span key={index} className={index === month ? 'head now' : 'head'}>{label}</span>)}
          {SEASONS.map(item => <div key={item.id} className="ha-cal-row">
            <button type="button" aria-pressed={item.id === selected} onClick={() => setSelected(item.id)}>{item.title}</button>
            {MONTH_LETTERS.map((_, index) => <i key={index} className={[item.months.includes(index) ? 'on' : '', index === month ? 'now' : ''].join(' ').trim() || undefined} title={`${item.title} · ${MONTH_NAMES[index]}`} />)}
          </div>)}
        </div></div>
        <div className="ha-season">
          <h4>{season.title} · {seasonMonths(season)}</h4>
          <div className="ha-evidence">{localEvidence[season.id].map(([label, text]) => <span key={label}>{label}: <b>{text}</b></span>)}</div>
          <ul>{season.actions.map(action => <li key={action}>{action}</li>)}</ul>
          <a className="dh-official-link" href={season.link} target="_blank" rel="noreferrer">{season.linkLabel} ↗</a>
        </div>
        <p className="ha-muted">Environment values are SA2 context from 2018 (Urban Heat Islands and Urban Vegetation; VPA Open Space). They describe the area, not a home or a child's exposure. Reminders arrive two weeks before each season.</p>
      </article>

      <article className="dh-board-card">
        <h3>Place context</h3>
        <ul className="ha-notes">
          <li><b>Designated bushfire prone</b><span>{bushfire ? `${pct(bushfire.bushfire_prone_pct)} of the SA2 (June 2026 layer).` : 'Not available.'} Smoke can still travel from regional fires.</span></li>
          <li><b>Public transport stops</b><span>{transport?.public_transport_stop_count != null ? `${transport.public_transport_stop_count} stops inside the SA2. ` : 'Not available. '}Useful for reaching care without a car.</span></li>
          <li><b>Declared-road traffic</b><span>{transport?.traffic_intensity_percentile != null ? `Busier than ${Math.round(transport.traffic_intensity_percentile)}% of ${transport.sa2_compared} Melbourne SA2s (AADT 2019). Choose quieter walking routes.` : 'Not available.'}</span></li>
          <li><b>Tobacco smoke exposure at home</b><span>{smoke ? `${pct(smoke.area.percent)} of children under 13 in the ${context.data?.locality?.department_area} area (${smoke.reference_year}, VCAMS).` : 'Not available.'}</span></li>
        </ul>
      </article>

      <article className="dh-board-card">
        <header className="ha-card-head"><div><h3>Prevention by body system</h3><p>Everyday actions from official guidance. Saved on this device.</p></div></header>
        <div className="ha-body-tabs" role="tablist" aria-label="Body system">{Object.entries(BODY_ACTIONS).map(([key, plan]) => {
          const count = plan.actions.filter((_, index) => done.includes(`${key}-${index}`)).length
          return <button key={key} type="button" role="tab" aria-selected={key === body} onClick={() => setBody(key)}>{plan.title}<small>{count} of {plan.actions.length} done</small></button>
        })}</div>
        <div className="ha-progress" aria-hidden="true"><i style={{ width: `${(bodyDone / bodyPlan.actions.length) * 100}%` }} /></div>
        <ul className="ha-action-list">{bodyPlan.actions.map((action, index) => {
          const key = `${body}-${index}`
          return <li key={key} className={done.includes(key) ? 'done' : undefined}><label><input type="checkbox" checked={done.includes(key)} onChange={() => toggle(key)} /><span><b>{action.text}</b><small>{action.why}</small></span></label></li>
        })}</ul>
        <div className="ha-button-row">
          <button type="button" className="ha-secondary" onClick={() => downloadFile(`kinderprint-prevention-plan-${slug(locality.name)}.txt`, planText, 'text/plain')}>Download my plan</button>
          <button type="button" className="ha-secondary" onClick={() => emailToSelf(`Prevention plan · ${locality.name}`, planText)}>Email to myself</button>
          <a className="dh-official-link" href={bodyPlan.link} target="_blank" rel="noreferrer">Official guidance ↗</a>
        </div>
      </article>
    </section>
  </div>
}
