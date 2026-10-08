/**
 * Vaccines page. Parents: the child's National Immunisation Program schedule, a planner for the
 * next visit, a finder for nearby places (including neighbouring suburbs and the local council's
 * immunisation sessions) and a No Jab No Play enrolment check. Practitioners: coverage by
 * checkpoint against Victoria and the 95% target, what each checkpoint measures, planning
 * questions and access to care. Coverage and places come from validated endpoints; schedule
 * logic is the shared healthPlanning module. Answers stay on the device.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  api,
  type ImmunisationContext,
  type NeighbourhoodSearchResult,
  type PractitionerContext,
  type VaccinationPlace,
  type VaccinationPlaceKind,
  type VaccinationPlaces,
} from '../../services/api'
import {
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
import './TodayPage.css'
import './HealthTopics.css'
import './VaccinesTool.css'

const DONE_KEY = 'kinderprint-vaccines-done'
const ABORIGINAL_KEY = 'kinderprint-child-aboriginal'
const START_KEY = 'kinderprint-care-start-date'
const NO_JAB_NO_PLAY = 'https://www.betterhealth.vic.gov.au/campaigns/no-jab-no-play'

const KIND: Record<VaccinationPlaceKind, { label: string; plural: string; color: string }> = {
  general_practice: { label: 'General practice', plural: 'GPs', color: '#355C38' },
  pharmacy: { label: 'Pharmacy', plural: 'Pharmacies', color: '#8A5300' },
  maternal_child_health: { label: 'Maternal and Child Health', plural: 'Child health centres', color: '#2E6E8E' },
  aboriginal_health: { label: 'Aboriginal health service', plural: 'Aboriginal health services', color: '#6B3E75' },
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

function useStoredState<T>(key: string, fallback: T): [T, (value: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))
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

function ParentVaccines({ locality, controls, birthMonth, immunisation, onOpenMap, places }: Props & { places: { data: VaccinationPlaces | null; loading: boolean } }) {
  const [done, setDone] = useStoredState<string[]>(DONE_KEY, [])
  const [aboriginal, setAboriginal] = useStoredState(ABORIGINAL_KEY, false)
  const [start, setStart] = useStoredState(START_KEY, '')
  const [filter, setFilter] = useState<Filter>('all')
  const [more, setMore] = useState(false)
  const age = monthsBetween(birthMonth)
  const under5 = age !== null && age < 60
  const schedule = useMemo(() => [...NIP_SCHEDULE, ...(aboriginal ? NIP_ABORIGINAL_ADDITIONS : [])].sort((a, b) => a.ageMonths - b.ageMonths), [aboriginal])
  const rows = schedule.map(item => ({ item, due: age === null ? null : dueDate(birthMonth, item.ageMonths), status: age === null ? null : scheduleStatus(item, birthMonth, done.includes(item.id)) }))
  const next = rows.find(row => row.status === 'catch-up' || row.status === 'due-soon' || row.status === 'upcoming')
  const catchUp = rows.filter(row => row.status === 'catch-up')
  const upcoming = rows.filter(row => row.status === 'due-soon' || row.status === 'upcoming').slice(0, 3)
  const flu = nextOccurrence(3, 1)
  const events: CalendarEvent[] = [
    ...catchUp.map(row => ({ id: `${row.item.id}-catch-up`, title: `Catch-up vaccines: ${row.item.when}`, date: new Date(Date.now() + 7 * 86_400_000), description: `${row.item.vaccines}. Free at your GP or council.` })),
    ...upcoming.filter(row => row.due).map(row => ({ id: row.item.id, title: `Vaccines due: ${row.item.when}`, date: row.due as Date, description: `${row.item.vaccines}. ${row.item.where}.` })),
    ...(age !== null && age >= 6 && under5 ? [{ id: `flu-${flu.getFullYear()}`, title: 'Book flu vaccine', date: flu, description: 'Recommended every year from 6 months; free from 6 months to under 5 years.' }] : []),
  ]
  const summary = [`Vaccination plan · ${locality.name}`, ...catchUp.map(row => `Catch up: ${row.item.when} — ${row.item.vaccines}`), ...upcoming.map(row => `${row.due ? monthYear(row.due) : ''}: ${row.item.when} — ${row.item.vaccines}`), '', 'Check the official record: Immunisation History Statement (Medicare app or myGov).'].join('\n')
  const toggle = (id: string) => setDone(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])

  // Finder
  const council = places.data?.council ?? null
  const all = places.data?.places ?? []
  const visible = all.filter(p => filter === p.kind || (filter === 'all' && !(under5 && p.kind === 'pharmacy')))
  const shown = filter === 'council' ? [] : visible.slice(0, more ? visible.length : 6)
  const number = new Map(shown.map((p, i) => [`${p.kind}-${p.rank}`, i + 1]))
  const filters: Array<[Filter, string]> = [['all', 'All'], ['general_practice', 'GPs'], ...(council ? [['council', 'Council sessions'] as [Filter, string]] : []), ['pharmacy', 'Pharmacies'], ['maternal_child_health', 'Child health centres'], ...(all.some(p => p.kind === 'aboriginal_health') ? [['aboriginal_health', 'Aboriginal health'] as [Filter, string]] : [])]
  const note = (kind: VaccinationPlaceKind): [string, boolean] => kind === 'general_practice' ? ['Childhood schedule vaccines, catch-up and flu', false]
    : kind === 'pharmacy' ? (under5 ? ['Not for your child’s age: Victorian pharmacists give flu vaccine from age 5', true] : ['Flu vaccine from age 5', false])
    : kind === 'maternal_child_health' ? ['Development checks and advice; vaccines are given at council sessions', false]
    : ['Health care for Aboriginal and Torres Strait Islander families, including vaccines', false]

  // Kinder readiness
  const startDate = start ? new Date(`${start}T00:00:00`) : null
  const from = startDate ? new Date(startDate.getFullYear(), startDate.getMonth() - 2, startDate.getDate()) : null
  const before = startDate ? rows.filter(row => (row.status === 'due-soon' || row.status === 'upcoming') && row.due && row.due < startDate) : []
  const ready = age === null ? { label: 'Add your child’s birth month above', tone: '' }
    : catchUp.length ? { label: `Catch-up needed first: ${catchUp.map(row => row.item.when).join(', ')}`, tone: 'is-warn' }
    : !startDate ? { label: 'Up to date so far', tone: 'is-ok' }
    : before.length ? { label: `${before.map(row => row.item.when).join(', ')} visit due before the start`, tone: 'is-warn' }
    : { label: 'Up to date for enrolment', tone: 'is-ok' }

  const cover = immunisation?.indicators.filter(item => has(item.pha.percent)) ?? []

  return <div className="kt ht vx kt-parent">
    <Hero parent title="Vaccines, on time and free" text="See what is due for your child, set reminders, and find places nearby to get vaccinated." />
    <div className="kt-filters">{controls}<p>Saved only on this device. Used to work out due dates.</p>
      {onOpenMap && <button type="button" className="kh-btn kt-link-btn" onClick={onOpenMap}>View on map</button>}</div>

    <div className="kt-row kt-row-top">
      <section className="kt-card kt-cream kt-wide" aria-labelledby="vx-sch">
        <div className="vx-head"><h2 id="vx-sch">Your child’s schedule</h2><span className="kt-sub">National Immunisation Program, June 2026</span></div>
        <label className="vx-check"><input type="checkbox" checked={aboriginal} onChange={event => setAboriginal(event.target.checked)} />Aboriginal and/or Torres Strait Islander child (adds free Meningococcal B)</label>
        <ol className="vx-schedule">{rows.map(row => <li key={row.item.id} className={row.status === 'done' ? 'is-past' : undefined}>
          <span><b>{row.item.when}</b><small>{row.due ? monthYear(row.due) : ''}</small></span>
          <span><b>{row.item.vaccines}</b><small>{row.item.where}</small></span>
          <span className="vx-act">
            <span className={`vx-tag ${row.status ? TAG[row.status] : ''}`}>{row.status ? STATUS_LABEL[row.status] : 'Add birth month'}</span>
            {row.status && row.status !== 'school' && <button type="button" className="kh-btn small" onClick={() => toggle(row.item.id)}>{done.includes(row.item.id) ? 'Undo' : 'Mark done'}</button>}
          </span>
        </li>)}</ol>
        <div className="ht-actions">
          <button type="button" className="kh-btn primary" disabled={!events.length} onClick={() => downloadFile(`vkinder-vaccines-${slug(locality.name)}.ics`, buildCalendar(events), 'text/calendar')}>Add reminders to calendar</button>
          <button type="button" className="kh-btn" onClick={() => emailToSelf(`Vaccination plan · ${locality.name}`, summary)}>Email to myself</button>
        </div>
        <p className="ht-care-note">Your ticks are not an official record. <a href={OFFICIAL.historyStatement} target="_blank" rel="noreferrer">Check the Immunisation History Statement</a></p>
      </section>

      <section className="kt-card kt-tint kt-narrow vx-next" aria-labelledby="vx-next">
        <h2 id="vx-next">Plan the next visit</h2>
        {next ? <>
          <p className="vx-big">{next.item.when} vaccines</p>
          <p className="vx-when">{next.status === 'catch-up' ? 'Overdue since' : 'Due'} {next.due ? monthYear(next.due) : ''}</p>
          <p className="kt-sub">{next.item.vaccines}.</p>
          {next.due && <button type="button" className="kh-btn primary" onClick={() => downloadFile(`vkinder-${next.item.id}.ics`, buildCalendar([{ id: next.item.id, title: `Vaccines due: ${next.item.when}`, date: next.status === 'catch-up' ? new Date(Date.now() + 7 * 86_400_000) : next.due as Date, description: `${next.item.vaccines}. ${next.item.where}.` }]), 'text/calendar')}>Add to calendar</button>}
        </> : <p className="kt-sub">{age === null ? 'Add your child’s birth month above to see what is due.' : 'Nothing is due before the school program.'}</p>}
        <dl className="vx-facts">
          <dt>Bring</dt><dd>Your Medicare card and your child’s health record.</dd>
          <dt>Free at</dt><dd>{next?.item.where.startsWith('School') ? 'The school immunisation program' : `Your GP${council ? ` or a ${council.council_name} immunisation session` : ' or a council immunisation session'}`}</dd>
          <dt>In Victoria now</dt><dd>Free flu vaccine from 6 months to under 5. Free infant RSV protection for eligible babies, mid-March to 30 September. <a href={OFFICIAL.rsv} target="_blank" rel="noreferrer">RSV immunisation</a></dd>
        </dl>
      </section>
    </div>

    <section className="kt-card kt-cream" aria-labelledby="vx-near">
      <div className="vx-near-head">
        <div><h2 id="vx-near">Where to get the next vaccines</h2>
          <p className="kt-sub">{under5 ? 'For a child under 5, childhood schedule vaccines are free at GPs and council immunisation sessions. Pharmacies are under their own filter: they give flu vaccine from age 5.' : 'Childhood schedule vaccines are free at GPs and council sessions; pharmacies give flu vaccine from age 5.'}</p></div>
        <div className="ht-facets vx-filters" role="group" aria-label="Show">{filters.map(([id, label]) => <button key={id} type="button" aria-selected={filter === id} onClick={() => { setFilter(id); setMore(false) }}>{label}</button>)}</div>
      </div>
      {places.loading ? <p className="kt-empty">Loading nearby places…</p> : !places.data ? <p className="kt-empty">Nearby places can’t be shown right now.</p> : <div className="vx-near">
        <ProximityMap places={places.data} visible={shown} number={number} />
        <div>
          {council && (filter === 'all' || filter === 'council') && <div className="vx-council">
            <b>{council.council_name} immunisation sessions</b>
            <p>Free childhood schedule vaccines at council sessions, usually booked online or by phone. Session days and venues are on the council’s page.</p>
            <p className="vx-council-act"><a href={council.immunisation_url} target="_blank" rel="noreferrer">Book or see sessions</a><a href={`tel:${council.phone.replace(/[^\d+]/g, '')}`}>Call {council.phone}</a></p>
          </div>}
          <ol className="vx-places">{shown.map(place => { const [text, warn] = note(place.kind); return <li key={`${place.kind}-${place.rank}`}>
            <span className="vx-num" style={{ background: KIND[place.kind].color }} aria-hidden="true">{number.get(`${place.kind}-${place.rank}`)}</span>
            <span><b>{place.name}</b><span>{KIND[place.kind].label} · {place.suburb}</span><small className={warn ? 'is-warn' : undefined}>{text}</small></span>
            <span className="vx-dist"><b>{place.distance_km.toFixed(1)} km</b><a href={directions(place)} target="_blank" rel="noreferrer">Directions</a></span>
          </li> })}</ol>
          {filter !== 'council' && visible.length > shown.length && <button type="button" className="kh-btn" onClick={() => setMore(true)}>Show all {visible.length}</button>}
          {filter !== 'council' && !visible.length && <p className="kt-empty">No listed {filter === 'all' ? 'places' : KIND[filter as VaccinationPlaceKind].plural.toLowerCase()} within 10 km.</p>}
          <p className="ht-care-note">National Health Services Directory, March 2025. Straight-line distances from the centre of {locality.name}. Call ahead: listed services may not have appointments available.{council ? ` Council link from the Melbourne Vaccine Education Centre list.` : ''}</p>
        </div>
      </div>}
    </section>

    <div className="kt-row kt-row-top">
      <section className="kt-card kt-cream kt-wide" aria-labelledby="vx-kin">
        <h2 id="vx-kin">Ready for childcare or kinder?</h2>
        <p className="kt-sub">Under No Jab No Play, Victorian childcare and kindergarten services need a current Immunisation History Statement to confirm enrolment.</p>
        <div className="vx-start">
          <label>Start date<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label>
          <span className={`vx-ready ${ready.tone}`} role="status">{ready.label}</span>
        </div>
        <ol className="ht-questions">
          <li><span aria-hidden="true">1</span><span><b>{from && startDate ? `Get the statement between ${dayMonthYear(from)} and ${dayMonthYear(startDate)}` : 'Get the statement in the two months before the start'}</b><small>It must be dated within the two months before your child starts. Download it in the Medicare app or through myGov.</small></span></li>
          <li><span aria-hidden="true">2</span><span><b>Give it to the service before the first day</b><small>It is the only immunisation record services can accept to confirm enrolment.</small></span></li>
          <li><span aria-hidden="true">3</span><span><b>Send a new one after each later vaccine</b><small>Services ask for an updated statement whenever a vaccine was due.</small></span></li>
        </ol>
        <div className="ht-actions"><a href={NO_JAB_NO_PLAY} target="_blank" rel="noreferrer">No Jab No Play: information for parents</a></div>
      </section>

      <section className="kt-card kt-tint kt-narrow" aria-labelledby="vx-prot">
        <h2 id="vx-prot">How protected is our area?</h2>
        <p className="kt-sub">Children fully vaccinated nearby{cover[0] ? `, ${cover[0].reference_period}` : ''}. The national goal is 95 in 100.</p>
        {cover.length ? cover.map(item => <div key={item.indicator_id} className="vx-cover">
          <p><b>At {item.age}</b><strong>{Math.round(item.pha.percent as number)} in 100</strong></p>
          <div className="vx-bar" aria-hidden="true"><span style={{ width: `${item.pha.percent}%` }} /><i style={{ left: '95%' }} /></div>
          <small>{item.victoria ? `${(item.pha.percent as number) >= item.victoria.percent ? 'Above' : 'Below'} Victoria (${Math.round(item.victoria.percent)} in 100). ` : ''}{(item.pha.percent as number) >= item.national_aspirational_target ? 'Meets the national goal.' : 'Below the national goal.'}</small>
        </div>) : <p className="kt-empty">Coverage for this area isn’t published.</p>}
      </section>
    </div>

    <footer className="kt-foot"><p>National Immunisation Program schedule (June 2026); Australian Immunisation Register via PHIDU; Victorian Department of Health; National Health Services Directory (March 2025); Melbourne Vaccine Education Centre council list. General guidance, not medical advice for your child.</p></footer>
  </div>
}

function ProximityMap({ places, visible, number }: { places: VaccinationPlaces; visible: VaccinationPlace[]; number: Map<string, number> }) {
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
      {[...visible].reverse().map(p => { const [x, y] = pos(p); return <g key={`${p.kind}-${p.rank}`} transform={`translate(${x.toFixed(3)} ${y.toFixed(3)})`}>
        <circle r=".14" fill={KIND[p.kind].color} className="vx-dot" /><text y=".045" textAnchor="middle" className="vx-dot-n">{number.get(`${p.kind}-${p.rank}`)}</text>
      </g> })}
      <circle r=".07" className="vx-home" /><circle r=".13" className="vx-home-ring" />
    </svg>
    <figcaption><span><i className="vx-key-home" />Centre of the area</span>{(['general_practice', 'pharmacy', 'maternal_child_health', 'aboriginal_health'] as VaccinationPlaceKind[]).filter(k => visible.some(p => p.kind === k)).map(k => <span key={k}><i style={{ background: KIND[k].color }} />{KIND[k].label}</span>)}</figcaption>
  </figure>
}

/* ------------------------------------------------------------------ practitioners */

function PractitionerVaccines({ locality, controls, immunisation, phaName, onOpenCare, places }: Props & { places: { data: VaccinationPlaces | null; loading: boolean } }) {
  const context = useLoad<PractitionerContext>(signal => api.getPractitionerContext(locality.id, signal), `ctx-${locality.id}`)
  const [copied, setCopied] = useState(false)
  const cover = immunisation?.indicators.filter(item => has(item.pha.percent) && has(item.pha.numerator) && has(item.pha.denominator)) ?? []
  const lowest = [...cover].sort((a, b) => (a.pha.percent as number) - (b.pha.percent as number))[0]
  const meeting = cover.filter(item => (item.pha.percent as number) >= item.national_aspirational_target)
  const gp = context.data?.access?.general_practice
  const care = (['general_practice', 'maternal_child_health', 'pharmacy'] as VaccinationPlaceKind[]).map(kind => places.data?.places.find(p => p.kind === kind)).filter((p): p is VaccinationPlace => !!p)
  const copy = () => void navigator.clipboard?.writeText(cover.map(item => [`Fully immunised, ${item.age}`, `${(item.pha.percent as number).toFixed(2)}%`, `${item.pha.numerator}/${item.pha.denominator}`, item.victoria ? `Vic ${item.victoria.percent.toFixed(1)}%` : '', 'PHA', `AIR ${item.reference_period}`].join('\t')).join('\n')).then(() => setCopied(true)).catch(() => setCopied(false))
  return <div className="kt ht vx kt-prac">
    <Hero parent={false} title="Immunisation" text="Coverage at 12, 24 and 60 months against Victoria and the 95% national target, and where children fall behind." />
    <div className="kt-filters">{controls}<p>Population Health Area: {immunisation?.locality?.pha_name ?? phaName}</p></div>

    <div className="kt-row kt-row-top">
      <section className="kt-card kt-cream kt-wide" aria-labelledby="vx-cov">
        <div className="vx-head"><h2 id="vx-cov">Coverage by checkpoint</h2><button type="button" className="kh-btn" onClick={copy} disabled={!cover.length}>{copied ? 'Copied' : 'Copy table'}</button></div>
        <p className="kt-sub">Fully immunised, {immunisation?.locality?.pha_name ?? phaName} PHA{cover[0] ? `, AIR ${cover[0].reference_period}` : ''}. Dark tick: Victoria. Amber tick: 95% national target.</p>
        {cover.length ? cover.map(item => { const pct = item.pha.percent as number, short = shortOf(item.pha.numerator as number, item.pha.denominator as number); return <div key={item.indicator_id} className="vx-cov-row">
          <div><p className="ht-measure">Fully immunised, {item.age}</p><p className="ht-value"><strong>{pct.toFixed(2)}%</strong><span className="ht-geo">PHA</span></p>
            <small>{item.pha.numerator} of {item.pha.denominator} children{has(item.pha_percentile_in_victoria) ? ` · ${ordinal(item.pha_percentile_in_victoria)} percentile of ${item.victoria?.pha_count ?? ''} Victorian PHAs` : ''}</small></div>
          <div><div className="vx-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} />{item.victoria && <b style={{ left: `${item.victoria.percent}%` }} />}<i style={{ left: `${item.national_aspirational_target}%` }} /></div>
            <p>{item.victoria ? `Victoria ${item.victoria.percent.toFixed(1)}% · ` : ''}{short ? `${short} more children to reach ${item.national_aspirational_target}%` : `meets the ${item.national_aspirational_target}% target`}</p></div>
        </div> }) : <p className="kt-empty">Coverage for this area isn’t published.</p>}
        <p className="ht-care-note">Australian Immunisation Register via PHIDU. Late recording can understate coverage. Victoria is pooled from published numerators and denominators.</p>
      </section>
      <section className="kt-card kt-tint kt-narrow" aria-labelledby="vx-kf">
        <h2 id="vx-kf">Key findings</h2>
        {lowest ? <ul className="kt-findings kt-one">
          <li>{lowest.age} is the <b>lowest checkpoint</b> at {(lowest.pha.percent as number).toFixed(2)}%{lowest.victoria ? `: ${(lowest.pha.percent as number) >= lowest.victoria.percent ? 'above' : 'below'} Victoria (${lowest.victoria.percent.toFixed(1)}%)` : ''}{(lowest.pha.percent as number) < lowest.national_aspirational_target ? <> but <b>below the 95% target</b></> : ''}.</li>
          {shortOf(lowest.pha.numerator as number, lowest.pha.denominator as number) > 0 && <li>Reaching 95% at {lowest.age} would take <b>{shortOf(lowest.pha.numerator as number, lowest.pha.denominator as number)} more children</b> fully immunised in this cohort of {lowest.pha.denominator}.</li>}
          {meeting.length > 0 && <li>{meeting.map(item => item.age).join(' and ')} {meeting.length > 1 ? 'already meet' : 'already meets'} the <b>95% target</b>.</li>}
        </ul> : <p className="kt-empty">No published coverage for this area.</p>}
      </section>
    </div>

    <section aria-labelledby="vx-measures">
      <h2 id="vx-measures">What each checkpoint measures</h2>
      <p className="kt-sub">The Australian Immunisation Register counts a child as fully immunised when the doses due before the checkpoint are recorded.</p>
      <div className="kt-card kt-tint ht-stages">{cover.map(item => { const short = shortOf(item.pha.numerator as number, item.pha.denominator as number); return <div key={item.indicator_id}>
        <span className="ht-range">{item.age}</span><h3>{MEASURES[item.age] ?? 'Doses due before this age'}</h3>
        <p>{(item.pha.percent as number).toFixed(2)}% in {item.reference_period}{short ? `; ${short} children short of 95%.` : '; meets the 95% target.'}</p>
      </div> })}</div>
    </section>

    <div className="kt-row kt-row-top">
      <section className="kt-card kt-cream kt-wide" aria-labelledby="vx-q">
        <h2 id="vx-q">Questions for local services</h2>
        <p className="kt-sub">Prompts for prevention and service planning on immunisation.</p>
        <ol className="ht-questions">{QUESTIONS.map((text, index) => <li key={text}><span aria-hidden="true">{index + 1}</span>{text}</li>)}</ol>
      </section>
      <section className="kt-card kt-cream kt-narrow" aria-labelledby="vx-care">
        <h2 id="vx-care">Access to care</h2>
        {care.length ? <ul className="ht-care">{care.map(place => <li key={place.kind}><span><b>{place.name}</b><span>{KIND[place.kind].label} · {place.suburb}</span></span><b>{place.distance_km.toFixed(1)} km</b></li>)}</ul>
          : <p className="kt-empty">{places.loading ? 'Loading nearby services…' : 'No listed services nearby.'}</p>}
        {places.data?.council && <p className="ht-care-note">Council sessions: <a href={places.data.council.immunisation_url} target="_blank" rel="noreferrer">{places.data.council.council_name}</a>, {places.data.council.phone}.</p>}
        <p className="ht-care-note">Listed presence does not mean availability, capacity or quality.{gp && has(gp.percentile) ? ` GP access is at the ${ordinal(gp.percentile)} percentile of Victorian SA2s.` : ''} National Health Services Directory, March 2025.</p>
        <button type="button" className="kh-btn kt-link-btn" onClick={onOpenCare}>Open care access</button>
      </section>
    </div>

    <footer className="kt-foot"><p>Australian Immunisation Register via PHIDU; National Immunisation Program schedule (June 2026); National Health Services Directory (March 2025); Melbourne Vaccine Education Centre council list. Area-level evidence only; not for individual diagnosis.</p></footer>
  </div>
}
