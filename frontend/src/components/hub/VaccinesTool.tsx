/**
 * Vaccines page with progressive disclosure: a short summary first, details in tabs, and the
 * full facts for any row in a dialog. Parents: schedule, nearby places (including neighbouring
 * suburbs and the local council's sessions), childcare and kinder readiness, area protection.
 * Practitioners: coverage by checkpoint, what each checkpoint measures, planning questions and
 * access to care. Coverage and places come from validated endpoints; answers stay on the device.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  api,
  type ImmunisationContext,
  type ImmunisationIndicator,
  type NeighbourhoodSearchResult,
  type PractitionerContext,
  type VaccinationPlace,
  type VaccinationPlaceKind,
  type VaccinationPlaces,
} from '../../services/api'
import {
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
  type ScheduleStatus,
} from '../health/healthPlanning'
import './TodayPage.css'
import './HealthTopics.css'
import './VaccinesTool.css'

const DONE_KEY = 'kinderprint-vaccines-done'
const START_KEY = 'kinderprint-care-start-date'
const NO_JAB_NO_PLAY = 'https://www.betterhealth.vic.gov.au/campaigns/no-jab-no-play'

const KIND: Record<VaccinationPlaceKind, { label: string; plural: string; color: string }> = {
  general_practice: { label: 'General practice', plural: 'GPs', color: '#355C38' },
  pharmacy: { label: 'Pharmacy', plural: 'Pharmacies', color: '#8A5300' },
  maternal_child_health: { label: 'Maternal and Child Health', plural: 'Child health centres', color: '#2E6E8E' },
}
type Filter = 'all' | 'council' | VaccinationPlaceKind
const TAG: Record<ScheduleStatus, string> = { done: 'is-done', 'catch-up': 'is-catch', 'due-soon': 'is-soon', upcoming: '', school: '' }
const QUESTIONS = ['How are children overdue at 18 months followed up before the 24-month checkpoint?', 'Do council immunisation sessions run at times working families can attend?', 'Is catch-up promoted at kindergarten enrolment and the 3½-year MCH visit?']
const MEASURES: Record<string, string> = { '12 months': 'Doses due by 6 months', '24 months': 'Doses due at 12 and 18 months', '60 months': 'Doses due at 4 years' }

const has = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value)
const monthYear = (date: Date) => date.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
const dayMonthYear = (date: Date) => date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const slug = (value: string) => value.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase()
const directions = (place: VaccinationPlace) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place.address)}`
const ordinal = (n: number) => { const r = Math.round(n); const s = r % 100 >= 11 && r % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][r % 10] ?? 'th'; return `${r}${s}` }
const shortOf = (num: number, den: number) => Math.max(0, Math.ceil(0.95 * den - 1e-9) - num)
const placeKey = (p: VaccinationPlace) => `${p.kind}-${p.rank}`

function useStoredState<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): [T, (value: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback, validate))
  useEffect(() => writeStored(key, value), [key, value])
  return [value, setValue]
}

function useLoad<T>(load: (signal: AbortSignal) => Promise<{ data: T }>, key: string) {
  const [state, setState] = useState<{ data: T | null; loading: boolean }>({ data: null, loading: true })
  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, loading: true })
    load(controller.signal).then(result => setState({ data: result.data, loading: false })).catch(() => { if (!controller.signal.aborted) setState({ data: null, loading: false }) })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

/** Accessible modal built on the native <dialog>: focus moves in, Escape and the backdrop close it. */
function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const el = ref.current; if (el && !el.open) el.showModal(); return () => el?.close() }, [])
  return <dialog ref={ref} className="vx-dialog" aria-labelledby="vx-dialog-title" onClose={onClose} onClick={event => { if (event.target === ref.current) onClose() }}>
    <div className="vx-dialog-body">
      <div className="vx-dialog-head"><h2 id="vx-dialog-title">{title}</h2><button type="button" className="vx-close" aria-label="Close" onClick={onClose}>×</button></div>
      {children}
    </div>
  </dialog>
}

function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: Array<[T, string]>; value: T; onChange: (value: T) => void }) {
  return <div className="ht-facets vx-tabs" role="tablist" aria-label={label}>{tabs.map(([id, text]) => <button key={id} type="button" role="tab" id={`vx-tab-${id}`} aria-selected={value === id} aria-controls="vx-panel" onClick={() => onChange(id)}>{text}</button>)}</div>
}

interface Props {
  parent: boolean
  locality: NeighbourhoodSearchResult
  controls: ReactNode
  birthMonth: string
  immunisation: ImmunisationContext | null
  phaName: string
  onOpenMap?: () => void
  onOpenCare: () => void
}
type Places = { data: VaccinationPlaces | null; loading: boolean }

export default function VaccinesTool(props: Props) {
  const places = useLoad<VaccinationPlaces>(signal => api.getVaccinationPlaces(props.locality.id, signal), `vp-${props.locality.id}`)
  return props.parent ? <ParentVaccines {...props} places={places} /> : <PractitionerVaccines {...props} places={places} />
}

function Hero({ parent, title, text }: { parent: boolean; title: string; text: string }) {
  return <section className="kt-hero ht-hero" aria-label="Introduction">
    <img src={parent ? '/health-assets/today-parent.webp' : '/health-assets/today-practitioner.jpg'} alt={parent ? 'A mother lifting her smiling baby in a sunny park' : 'A healthcare professional in protective gear gently holding an infant'} className="kt-hero-img" />
    <div className="kt-hero-text"><h1>{title}</h1><p>{text}</p></div>
  </section>
}

/* ------------------------------------------------------------------ parents */

type ParentTab = 'schedule' | 'where' | 'kinder' | 'area'

function ParentVaccines({ locality, controls, birthMonth, immunisation, onOpenMap, places }: Props & { places: Places }) {
  const [done, setDone] = useStoredState<string[]>(DONE_KEY, [],
    (value): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string'))
  const [start, setStart] = useStoredState(START_KEY, '')
  const [tab, setTab] = useState<ParentTab>('schedule')
  const [fullSchedule, setFullSchedule] = useState(false)
  const [visit, setVisit] = useState<ScheduleItem | null>(null)
  const [bring, setBring] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const age = monthsBetween(birthMonth)
  const under5 = age !== null && age < 60
  const rows = NIP_SCHEDULE.map(item => ({ item, due: age === null ? null : dueDate(birthMonth, item.ageMonths), status: age === null ? null : scheduleStatus(item, birthMonth, done.includes(item.id)) }))
  const next = rows.find(row => row.status === 'catch-up' || row.status === 'due-soon' || row.status === 'upcoming')
  const catchUp = rows.filter(row => row.status === 'catch-up')
  const upcoming = rows.filter(row => row.status === 'due-soon' || row.status === 'upcoming')
  const doneCount = rows.filter(row => row.status === 'done').length
  const flu = nextOccurrence(3, 1)
  const events: CalendarEvent[] = [
    ...catchUp.map(row => ({ id: `${row.item.id}-catch-up`, title: `Catch-up vaccines: ${row.item.when}`, date: new Date(Date.now() + 7 * 86_400_000), description: `${row.item.vaccines}. Free at your GP or council.` })),
    ...upcoming.slice(0, 3).filter(row => row.due).map(row => ({ id: row.item.id, title: `Vaccines due: ${row.item.when}`, date: row.due as Date, description: `${row.item.vaccines}. ${row.item.where}.` })),
    ...(age !== null && age >= 6 && under5 ? [{ id: `flu-${flu.getFullYear()}`, title: 'Book flu vaccine', date: flu, description: 'Recommended every year from 6 months; free from 6 months to under 5 years.' }] : []),
  ]
  const summary = [`Vaccination plan · ${locality.name}`, ...catchUp.map(row => `Catch up: ${row.item.when} — ${row.item.vaccines}`), ...upcoming.slice(0, 3).map(row => `${row.due ? monthYear(row.due) : ''}: ${row.item.when} — ${row.item.vaccines}`), '', 'Check the official record: Immunisation History Statement (Medicare app or myGov).'].join('\n')
  const toggle = (id: string) => setDone(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  const shownRows = fullSchedule ? rows : rows.filter(row => row.status === 'catch-up' || row.status === 'due-soon' || row.status === 'upcoming').slice(0, 3)
  const visitRow = visit ? rows.find(row => row.item.id === visit.id) : undefined
  const council = places.data?.council ?? null
  const go = (value: ParentTab) => { setTab(value); panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const nextCalendar = () => next?.due && downloadFile(`vkinder-${next.item.id}.ics`, buildCalendar([{ id: next.item.id, title: `Vaccines due: ${next.item.when}`, date: next.status === 'catch-up' ? new Date(Date.now() + 7 * 86_400_000) : next.due, description: `${next.item.vaccines}. ${next.item.where}.` }]), 'text/calendar')

  return <div className="kt ht vx kt-parent">
    <Hero parent title="Vaccines, on time and free" text="See what is due for your child, set reminders, and find places nearby to get vaccinated." />
    <div className="kt-filters">{controls}<p>Saved only on this device. Used to work out due dates.</p>
      {onOpenMap && <button type="button" className="kh-btn kt-link-btn" onClick={onOpenMap}>View on map</button>}</div>

    <section className="kt-card kt-tint vx-summary" aria-labelledby="vx-next">
      <div>
        <h2 id="vx-next" className="vx-eyebrow">Next up</h2>
        {next ? <><p className="vx-big">{next.item.when} vaccines</p>
          <p className="vx-when">{next.status === 'catch-up' ? `Overdue since ${next.due ? monthYear(next.due) : ''}. Catch-up is free.` : `Due ${next.due ? monthYear(next.due) : ''}`}</p></>
          : <p className="vx-big">{age === null ? 'Add your child’s birth month' : 'All caught up'}</p>}
      </div>
      {next && <div className="vx-summary-act">
        <button type="button" className="kh-btn primary" onClick={nextCalendar}>Add to calendar</button>
        <button type="button" className="kh-btn" onClick={() => go('where')}>Where to go</button>
        <button type="button" className="kh-btn kt-link-btn" onClick={() => setBring(true)}>What to bring</button>
      </div>}
    </section>

    <section className="kt-card kt-cream vx-panel" ref={panelRef} aria-label="Vaccine details">
      <Tabs label="Vaccine details" value={tab} onChange={setTab} tabs={[['schedule', 'Schedule'], ['where', 'Where to go'], ['kinder', 'Childcare and kinder'], ['area', 'Our area']]} />
      <div id="vx-panel" role="tabpanel" aria-labelledby={`vx-tab-${tab}`} className="vx-tabpanel">
        {tab === 'schedule' && <>
          <p className="kt-sub">{age === null ? 'Add your child’s birth month above to see due dates.' : `${doneCount} of ${rows.length} visits marked done. Select a visit for the vaccines and where to go.`}</p>
          <ol className="vx-rows">{shownRows.map(row => <li key={row.item.id}>
            <button type="button" className="vx-row" onClick={() => setVisit(row.item)}>
              <span className="vx-txt"><b>{row.item.when}</b><small>{row.due ? monthYear(row.due) : ''}</small></span>
              <span className={`vx-tag ${row.status ? TAG[row.status] : ''}`}>{row.status ? STATUS_LABEL[row.status] : 'Add birth month'}</span>
              <span className="vx-chev" aria-hidden="true">›</span>
            </button>
          </li>)}</ol>
          {!fullSchedule && age !== null && !shownRows.length && <p className="kt-empty">Nothing is due before the school program.</p>}
          <div className="ht-actions">
            <button type="button" className="kh-btn" aria-expanded={fullSchedule} onClick={() => setFullSchedule(value => !value)}>{fullSchedule ? 'Show upcoming only' : `Show full schedule (${rows.length})`}</button>
            <button type="button" className="kh-btn primary" disabled={!events.length} onClick={() => downloadFile(`vkinder-vaccines-${slug(locality.name)}.ics`, buildCalendar(events), 'text/calendar')}>Add reminders to calendar</button>
            <button type="button" className="kh-btn kt-link-btn" onClick={() => emailToSelf(`Vaccination plan · ${locality.name}`, summary)}>Email to myself</button>
          </div>
        </>}
        {tab === 'where' && <Finder places={places} under5={under5} locality={locality.name} />}
        {tab === 'kinder' && <Kinder start={start} setStart={setStart} rows={rows} age={age} />}
        {tab === 'area' && <AreaCover immunisation={immunisation} />}
      </div>
    </section>

    <footer className="kt-foot"><p>National Immunisation Program schedule (June 2026); Australian Immunisation Register via PHIDU; National Health Services Directory (March 2025); council list from the Melbourne Vaccine Education Centre. General guidance, not medical advice for your child.</p></footer>

    {visit && visitRow && <Dialog title={`${visit.when} vaccines`} onClose={() => setVisit(null)}>
      <p className="vx-when">{visitRow.status ? STATUS_LABEL[visitRow.status] : ''}{visitRow.due ? ` · ${monthYear(visitRow.due)}` : ''}</p>
      <dl className="vx-facts">
        <dt>Vaccines</dt><dd>{visit.vaccines}</dd>
        <dt>Where</dt><dd>{visit.where}{council && !visit.where.startsWith('School') && visit.where !== 'Hospital' ? ` (${council.council_name})` : ''}</dd>
      </dl>
      <div className="ht-actions">
        {visitRow.status && visitRow.status !== 'school' && <button type="button" className="kh-btn primary" onClick={() => toggle(visit.id)}>{done.includes(visit.id) ? 'Mark as not done' : 'Mark done'}</button>}
        <a href={OFFICIAL.historyStatement} target="_blank" rel="noreferrer">Check the official record</a>
      </div>
    </Dialog>}
    {bring && <Dialog title="Before the visit" onClose={() => setBring(false)}>
      <dl className="vx-facts">
        <dt>Bring</dt><dd>Your Medicare card and your child’s health record.</dd>
        <dt>Free at</dt><dd>Your GP{council ? ` or a ${council.council_name} immunisation session` : ' or a council immunisation session'}.</dd>
        <dt>In Victoria now</dt><dd>Free flu vaccine from 6 months to under 5. Free infant RSV protection for eligible babies, mid-March to 30 September. <a href={OFFICIAL.rsv} target="_blank" rel="noreferrer">RSV immunisation</a></dd>
      </dl>
    </Dialog>}
  </div>
}

function Finder({ places, under5, locality }: { places: Places; under5: boolean; locality: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<VaccinationPlace | 'council' | null>(null)
  if (places.loading) return <p className="kt-empty">Loading nearby places…</p>
  if (!places.data) return <p className="kt-empty">Nearby places can’t be shown right now.</p>
  const council = places.data.council
  const visible = places.data.places.filter(p => filter === p.kind || (filter === 'all' && !(under5 && p.kind === 'pharmacy')))
  const shown = filter === 'council' ? [] : visible.slice(0, more ? visible.length : 4)
  const number = new Map(shown.map((p, i) => [placeKey(p), i + 1]))
  const filters: Array<[Filter, string]> = [['all', 'All'], ['general_practice', 'GPs'], ...(council ? [['council', 'Council sessions'] as [Filter, string]] : []), ['pharmacy', 'Pharmacies'], ['maternal_child_health', 'Child health centres']]
  const note = (kind: VaccinationPlaceKind): [string, boolean] => kind === 'general_practice' ? ['Childhood schedule vaccines, catch-up and flu.', false]
    : kind === 'pharmacy' ? (under5 ? ['Not for your child’s age: Victorian pharmacists give flu vaccine from age 5.', true] : ['Flu vaccine from age 5.', false])
    : ['Development checks and advice. Vaccines are given at council sessions.', false]
  return <>
    <p className="kt-sub">{under5 ? 'Free childhood vaccines at GPs and council sessions near ' : 'Free childhood vaccines near '}{locality}. Select a place for details and directions.</p>
    <div className="ht-facets vx-filters" role="group" aria-label="Show">{filters.map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setMore(false) }}>{label}</button>)}</div>
    <div className="vx-near">
      <ProximityMap places={places.data} visible={shown} number={number} onSelect={setOpen} />
      <div>
        {council && (filter === 'all' || filter === 'council') && <button type="button" className="vx-row vx-council-row" onClick={() => setOpen('council')}>
          <span className="vx-txt"><b>{council.council_name} sessions</b><small>Free, booked online or by phone</small></span><span className="vx-chev" aria-hidden="true">›</span>
        </button>}
        <ol className="vx-rows">{shown.map(place => <li key={placeKey(place)}>
          <button type="button" className="vx-row" onClick={() => setOpen(place)}>
            <span className="vx-num" style={{ background: KIND[place.kind].color }} aria-hidden="true">{number.get(placeKey(place))}</span>
            <span className="vx-txt"><b>{place.name}</b><small>{KIND[place.kind].label} · {place.suburb}</small></span>
            <span className="vx-dist">{place.distance_km.toFixed(1)} km</span>
          </button>
        </li>)}</ol>
        {filter !== 'council' && visible.length > shown.length && <button type="button" className="kh-btn" onClick={() => setMore(true)}>Show {visible.length - shown.length} more</button>}
        {filter !== 'council' && !visible.length && <p className="kt-empty">No listed {filter === 'all' ? 'places' : KIND[filter as VaccinationPlaceKind].plural.toLowerCase()} within 10 km.</p>}
        <p className="kt-limit">Call ahead: listed places may not have appointments available. Distances are straight-line.</p>
      </div>
    </div>
    {open === 'council' && council && <Dialog title={`${council.council_name} immunisation sessions`} onClose={() => setOpen(null)}>
      <p>Free childhood schedule vaccines at council sessions. Session days and venues are on the council’s page.</p>
      <div className="ht-actions"><a className="kh-btn primary" href={council.immunisation_url} target="_blank" rel="noreferrer">Book or see sessions</a><a href={`tel:${council.phone.replace(/[^\d+]/g, '')}`}>Call {council.phone}</a></div>
      <p className="ht-care-note">Council link from the Melbourne Vaccine Education Centre list, checked {council.retrieved}.</p>
    </Dialog>}
    {open && open !== 'council' && <Dialog title={open.name} onClose={() => setOpen(null)}>
      <p className="vx-when">{KIND[open.kind].label} · {open.distance_km.toFixed(1)} km</p>
      <dl className="vx-facts"><dt>Address</dt><dd>{open.address}</dd><dt>For your child</dt><dd className={note(open.kind)[1] ? 'is-warn' : undefined}>{note(open.kind)[0]}</dd></dl>
      <div className="ht-actions"><a className="kh-btn primary" href={directions(open)} target="_blank" rel="noreferrer">Directions</a></div>
      <p className="kt-limit">Call ahead to check appointments.</p>
      <p className="ht-care-note">National Health Services Directory, March 2025.</p>
    </Dialog>}
  </>
}

function Kinder({ start, setStart, rows, age }: { start: string; setStart: (value: string) => void; rows: Array<{ item: ScheduleItem; due: Date | null; status: ScheduleStatus | null }>; age: number | null }) {
  const startDate = start ? new Date(`${start}T00:00:00`) : null
  const from = startDate ? new Date(startDate.getFullYear(), startDate.getMonth() - 2, startDate.getDate()) : null
  const catchUp = rows.filter(row => row.status === 'catch-up')
  const before = startDate ? rows.filter(row => (row.status === 'due-soon' || row.status === 'upcoming') && row.due && row.due < startDate) : []
  const ready = age === null ? { label: 'Add your child’s birth month above', tone: '' }
    : catchUp.length ? { label: `Catch-up needed first: ${catchUp.map(row => row.item.when).join(', ')}`, tone: 'is-warn' }
    : !startDate ? { label: 'Up to date so far', tone: 'is-ok' }
    : before.length ? { label: `${before.map(row => row.item.when).join(', ')} visit due before the start`, tone: 'is-warn' }
    : { label: 'Up to date for enrolment', tone: 'is-ok' }
  return <>
    <p className="kt-sub">Victorian childcare and kindergarten services need a current Immunisation History Statement to confirm enrolment (No Jab No Play).</p>
    <div className="vx-start">
      <label>Start date<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
      <span className={`vx-ready ${ready.tone}`} role="status">{ready.label}</span>
    </div>
    {from && startDate && <p className="vx-window">Get the statement between <b>{dayMonthYear(from)}</b> and <b>{dayMonthYear(startDate)}</b>.</p>}
    <details className="vx-more">
      <summary>What to do</summary>
      <ol className="ht-questions">
        <li><span aria-hidden="true">1</span><span><b>Download the statement</b><small>In the Medicare app or through myGov. It must be dated within the two months before your child starts.</small></span></li>
        <li><span aria-hidden="true">2</span><span><b>Give it to the service before the first day</b><small>It is the only immunisation record services can accept.</small></span></li>
        <li><span aria-hidden="true">3</span><span><b>Send a new one after each later vaccine</b><small>Services ask for an updated statement whenever a vaccine was due.</small></span></li>
      </ol>
      <a href={NO_JAB_NO_PLAY} target="_blank" rel="noreferrer">No Jab No Play: information for parents</a>
    </details>
  </>
}

function AreaCover({ immunisation }: { immunisation: ImmunisationContext | null }) {
  const cover = immunisation?.indicators.filter(item => has(item.pha.percent)) ?? []
  if (!cover.length) return <p className="kt-empty">Coverage for this area isn’t published.</p>
  return <>
    <p className="kt-sub">Children fully vaccinated nearby, {cover[0].reference_period}. The national goal is 95 in 100.</p>
    <div className="vx-area">{cover.map(item => <div key={item.indicator_id} className="vx-cover">
      <p><b>At {item.age}</b><strong>{Math.round(item.pha.percent as number)} in 100</strong></p>
      <div className="vx-bar" aria-hidden="true"><span style={{ width: `${item.pha.percent}%` }} /><i style={{ left: '95%' }} /></div>
      <small>{(item.pha.percent as number) >= item.national_aspirational_target ? 'Meets the national goal' : 'Below the national goal'}</small>
    </div>)}</div>
  </>
}

export function ProximityMap({ places, visible, number, onSelect }: { places: VaccinationPlaces; visible: VaccinationPlace[]; number: Map<string, number>; onSelect: (place: VaccinationPlace) => void }) {
  const origin = places.origin
  if (!origin) return <div />
  const kx = 111.32 * Math.cos(origin.latitude * Math.PI / 180), ky = 110.57
  const radius = Math.max(2, Math.ceil(Math.max(0, ...visible.map(p => p.distance_km))))
  const scale = 2.15 / radius
  const rings = radius <= 3 ? Array.from({ length: radius }, (_, i) => i + 1) : [Math.round(radius / 2), radius]
  const pos = (p: VaccinationPlace) => [(p.longitude - origin.longitude) * kx * scale, -(p.latitude - origin.latitude) * ky * scale]
  return <figure className="vx-map">
    <svg viewBox="-2.4 -2.4 4.8 4.8" role="img" aria-label={`Map of ${visible.length} places within ${radius} km of the centre of the area`}>
      {[...rings].reverse().map(r => <g key={r}><circle r={r * scale} className={r === radius ? 'vx-ring-out' : 'vx-ring'} /><text x="0" y={-r * scale - .05} textAnchor="middle">{r} km</text></g>)}
      {[...visible].reverse().map(p => { const [x, y] = pos(p); return <g key={placeKey(p)} transform={`translate(${x.toFixed(3)} ${y.toFixed(3)})`} className="vx-pin" onClick={() => onSelect(p)}>
        <title>{p.name}</title><circle r=".19" fill={KIND[p.kind].color} className="vx-dot" /><text y=".06" textAnchor="middle" className="vx-dot-n">{number.get(placeKey(p))}</text>
      </g> })}
      <circle r=".07" className="vx-home" /><circle r=".13" className="vx-home-ring" />
    </svg>
    <figcaption><span><i className="vx-key-home" />Centre of the area</span>{(Object.keys(KIND) as VaccinationPlaceKind[]).filter(k => visible.some(p => p.kind === k)).map(k => <span key={k}><i style={{ background: KIND[k].color }} />{KIND[k].label}</span>)}</figcaption>
  </figure>
}

/* ------------------------------------------------------------------ practitioners */

type PracTab = 'coverage' | 'measures' | 'planning' | 'access'

function PractitionerVaccines({ locality, controls, immunisation, phaName, onOpenCare, places }: Props & { places: Places }) {
  const context = useLoad<PractitionerContext>(signal => api.getPractitionerContext(locality.id, signal), `ctx-${locality.id}`)
  const [tab, setTab] = useState<PracTab>('coverage')
  const [copied, setCopied] = useState(false)
  const [detail, setDetail] = useState<ImmunisationIndicator | null>(null)
  const cover = useMemo(() => immunisation?.indicators.filter(item => has(item.pha.percent) && has(item.pha.numerator) && has(item.pha.denominator)) ?? [], [immunisation])
  const lowest = [...cover].sort((a, b) => (a.pha.percent as number) - (b.pha.percent as number))[0]
  const meeting = cover.filter(item => (item.pha.percent as number) >= item.national_aspirational_target)
  const gp = context.data?.access?.general_practice
  const care = (Object.keys(KIND) as VaccinationPlaceKind[]).map(kind => places.data?.places.find(p => p.kind === kind)).filter((p): p is VaccinationPlace => !!p)
  const pha = immunisation?.locality?.pha_name ?? phaName
  const copy = () => void navigator.clipboard?.writeText(cover.map(item => [`Fully immunised, ${item.age}`, `${(item.pha.percent as number).toFixed(2)}%`, `${item.pha.numerator}/${item.pha.denominator}`, item.victoria ? `Vic ${item.victoria.percent.toFixed(1)}%` : '', 'PHA', `AIR ${item.reference_period}`].join('\t')).join('\n')).then(() => setCopied(true)).catch(() => setCopied(false))
  const lowestShort = lowest ? shortOf(lowest.pha.numerator as number, lowest.pha.denominator as number) : 0

  return <div className="kt ht vx kt-prac">
    <Hero parent={false} title="Immunisation" text="Coverage at 12, 24 and 60 months against Victoria and the 95% national target, and where children fall behind." />
    <div className="kt-filters">{controls}<p>Population Health Area: {pha}</p></div>

    {lowest && <section className="kt-card kt-tint vx-summary" aria-labelledby="vx-kf">
      <div>
        <h2 id="vx-kf" className="vx-eyebrow">Key finding</h2>
        <p className="vx-lead">{lowest.age} is the lowest checkpoint at <b>{(lowest.pha.percent as number).toFixed(2)}%</b>{(lowest.pha.percent as number) < lowest.national_aspirational_target ? <>, <b>{lowestShort} children</b> short of 95%</> : ''}.</p>
        <details className="vx-more"><summary>More findings</summary><ul className="kt-findings kt-one">
          {lowest.victoria && <li>{lowest.age} coverage is {(lowest.pha.percent as number) >= lowest.victoria.percent ? 'above' : 'below'} Victoria ({lowest.victoria.percent.toFixed(1)}%).</li>}
          {meeting.length > 0 && <li>{meeting.map(item => item.age).join(' and ')} {meeting.length > 1 ? 'meet' : 'meets'} the 95% target.</li>}
        </ul></details>
      </div>
    </section>}

    <section className="kt-card kt-cream vx-panel" aria-label="Immunisation details">
      <Tabs label="Immunisation details" value={tab} onChange={setTab} tabs={[['coverage', 'Coverage'], ['measures', 'Checkpoints'], ['planning', 'Planning questions'], ['access', 'Access to care']]} />
      <div id="vx-panel" role="tabpanel" aria-labelledby={`vx-tab-${tab}`} className="vx-tabpanel">
        {tab === 'coverage' && (cover.length ? <>
          <p className="kt-sub">Fully immunised, {pha} PHA, AIR {cover[0].reference_period}. Select a checkpoint for counts and comparison.</p>
          <ol className="vx-rows">{cover.map(item => <li key={item.indicator_id}>
            <button type="button" className="vx-row vx-cov" onClick={() => setDetail(item)}>
              <span className="vx-txt"><b>{item.age}</b><small>{(item.pha.percent as number) >= item.national_aspirational_target ? 'Meets 95% target' : 'Below 95% target'}</small></span>
              <span className="vx-cov-bar"><strong>{(item.pha.percent as number).toFixed(2)}%</strong><span className="vx-bar" aria-hidden="true"><span style={{ width: `${item.pha.percent}%` }} />{item.victoria && <b style={{ left: `${item.victoria.percent}%` }} />}<i style={{ left: `${item.national_aspirational_target}%` }} /></span></span>
              <span className="vx-chev" aria-hidden="true">›</span>
            </button>
          </li>)}</ol>
          <p className="ht-care-note">Dark tick: Victoria. Amber tick: 95% national target.</p>
          <p className="kt-limit">Late recording on the Australian Immunisation Register can understate coverage.</p>
          <div className="ht-actions"><button type="button" className="kh-btn" onClick={copy}>{copied ? 'Copied' : 'Copy table'}</button></div>
        </> : <p className="kt-empty">Coverage for this area isn’t published.</p>)}
        {tab === 'measures' && <>
          <p className="kt-sub">A child counts as fully immunised when the doses due before the checkpoint are recorded on the Australian Immunisation Register.</p>
          <div className="ht-stages">{cover.map(item => <div key={item.indicator_id}><span className="ht-range">{item.age}</span><h3>{MEASURES[item.age] ?? 'Doses due before this age'}</h3></div>)}</div>
        </>}
        {tab === 'planning' && <ol className="ht-questions">{QUESTIONS.map((text, index) => <li key={text}><span aria-hidden="true">{index + 1}</span>{text}</li>)}</ol>}
        {tab === 'access' && <>
          {care.length ? <ul className="ht-care">{care.map(place => <li key={place.kind}><span><b>{place.name}</b><span>{KIND[place.kind].label} · {place.suburb}</span></span><b>{place.distance_km.toFixed(1)} km</b></li>)}</ul>
            : <p className="kt-empty">{places.loading ? 'Loading nearby services…' : 'No listed services nearby.'}</p>}
          {places.data?.council && <p className="ht-care-note">Council sessions: <a href={places.data.council.immunisation_url} target="_blank" rel="noreferrer">{places.data.council.council_name}</a>, {places.data.council.phone}.</p>}
          <p className="kt-limit">Listed presence does not mean availability, capacity or quality.</p>
          {gp && has(gp.percentile) && <p className="ht-care-note">GP access is at the {ordinal(gp.percentile)} percentile of Victorian SA2s.</p>}
          <button type="button" className="kh-btn kt-link-btn" onClick={onOpenCare}>Open care access</button>
        </>}
      </div>
    </section>

    <footer className="kt-foot"><p>Australian Immunisation Register via PHIDU; National Immunisation Program schedule (June 2026); National Health Services Directory (March 2025); council list from the Melbourne Vaccine Education Centre. Area-level evidence only; not for individual diagnosis.</p></footer>

    {detail && <Dialog title={`Fully immunised, ${detail.age}`} onClose={() => setDetail(null)}>
      <p className="ht-value"><strong>{(detail.pha.percent as number).toFixed(2)}%</strong><span className="ht-geo">PHA</span></p>
      <dl className="vx-facts">
        <dt>Children</dt><dd>{detail.pha.numerator} of {detail.pha.denominator}</dd>
        {detail.victoria && <><dt>Victoria</dt><dd>{detail.victoria.percent.toFixed(1)}%</dd></>}
        <dt>95% target</dt><dd>{shortOf(detail.pha.numerator as number, detail.pha.denominator as number) ? `${shortOf(detail.pha.numerator as number, detail.pha.denominator as number)} more children needed` : 'Met'}</dd>
        {has(detail.pha_percentile_in_victoria) && <><dt>Rank</dt><dd>{ordinal(detail.pha_percentile_in_victoria)} percentile of {detail.victoria?.pha_count ?? ''} Victorian PHAs</dd></>}
        <dt>Measures</dt><dd>{MEASURES[detail.age] ?? 'Doses due before this age'}</dd>
        <dt>Source</dt><dd>Australian Immunisation Register via PHIDU, {detail.reference_period}</dd>
      </dl>
      <p className="kt-limit">Late recording can understate coverage.</p>
    </Dialog>}
  </div>
}
