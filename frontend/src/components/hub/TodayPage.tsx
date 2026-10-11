/**
 * Today: the Child Health landing page for parents and carers (warm green theme) and
 * practitioners (teal and navy theme). Only this page uses these themes; the other
 * KinderHub pages keep their existing look. Buttons, pickers and the section menu are the
 * shared KinderHub controls, so interactions match the rest of the hub.
 *
 * Parent guidance comes from published Australian guidelines (sources in the footer).
 * Practitioner figures come from validated KinderPrint endpoints; anything unavailable is
 * shown as unavailable rather than estimated.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import {
  api,
  type CompareCare,
  type ImmunisationContext,
  type NeighbourhoodSearchResult,
  type PractitionerContext,
  type SeasonalAir,
} from '../../services/api'
import { OFFICIAL } from '../health/healthPlanning'
import './TodayPage.css'

type Band = '0' | '1' | '2'
const bandOf = (age: string): Band => age.startsWith('0') ? '0' : age.startsWith('5') ? '1' : '2'
const LABEL: Record<Band, string> = { '0': '0–4 year olds', '1': '5–9 year olds', '2': '10–14 year olds' }

type Season = 'spring' | 'summer' | 'autumn' | 'winter'
const seasonOf = (month: number): Season => [8, 9, 10].includes(month) ? 'spring' : [11, 0, 1].includes(month) ? 'summer' : [2, 3, 4].includes(month) ? 'autumn' : 'winter'
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/* ------------------------------------------------------------------ shared data loading */

type Loaded<T> = { data: T | null; loading: boolean; error: boolean }
function useLoad<T>(load: (signal: AbortSignal) => Promise<{ data: T }>, key: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: true, error: false })
  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, loading: true, error: false })
    load(controller.signal)
      .then(response => setState({ data: response.data, loading: false, error: false }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setState({ data: null, loading: false, error: true }) })
    return () => controller.abort()
    // The loader closes over the locality id, which is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
const ICONS = {
  sun: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8',
  storm: 'M6 15a4 4 0 0 1 .5-8A5.5 5.5 0 0 1 17 6.5a3.8 3.8 0 0 1 1 7.5M12 13l-2 4h3l-2 4',
  heat: 'M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0zM12 9v7',
  smoke: 'M4 15h11a3 3 0 1 0-3-3M3 19h14M6 11h5a3 3 0 1 0-3-3',
  move: 'M13 4a2 2 0 1 0 0 .01M10 21l2-6 3 3v3M6 12l3-3 4 1 3 3 3-1M9 9l-2 6',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  season: 'M12 3v2M12 19v2M5 12H3M21 12h-2M7 7 5.6 5.6M18.4 18.4 17 17M7 17l-1.4 1.4M18.4 5.6 17 7M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  vaccine: 'M18 2l4 4M17 7l-9 9-3 1 1-3 9-9M3 21l3-3',
  food: 'M12 7c-3-2-8-1-8 5s4 9 6 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 6-3 6-9s-5-7-8-5zM12 7c0-2 1-4 3-4',
  clipboard: 'M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4',
}

/* ------------------------------------------------------------------ parent content */

const NOW: Record<Season, Array<{ icon: keyof typeof ICONS; title: string; text: string; link: [string, string] }>> = {
  spring: [
    { icon: 'sun', title: 'Sun protection is needed again', text: 'UV usually reaches 3 or more from mid-August to April. Hat, sunscreen and shade when it does.', link: ['Today’s sun protection times', OFFICIAL.sunSmart] },
    { icon: 'storm', title: 'Pollen and storm asthma season', text: 'October to December. With asthma or hay fever, check the forecast each morning.', link: ['Thunderstorm asthma forecast', OFFICIAL.asthmaForecast] },
  ],
  summer: [
    { icon: 'heat', title: 'Hot days and dehydration', text: 'Plan play for cooler parts of the day and offer water often. Never leave a child in a parked car.', link: ['Heat-health warnings', OFFICIAL.heat] },
    { icon: 'smoke', title: 'Bushfire smoke', text: 'On smoky days, keep children inside with windows closed and asthma medicines handy.', link: ['Air quality (EPA AirWatch)', OFFICIAL.airWatch] },
  ],
  autumn: [
    { icon: 'move', title: 'Shorter days, less play outside', text: 'Plan active time straight after school while it is light, and agree screen limits for winter.', link: ['Movement guidelines', OFFICIAL.movement] },
    { icon: 'shield', title: 'Flu vaccines in April or May', text: 'Recommended every year from 6 months; free from 6 months to under 5 years.', link: ['Immunisation schedule', OFFICIAL.nipSchedule] },
  ],
  winter: [
    { icon: 'shield', title: 'Flu, RSV and colds', text: 'Keep sick children home, wash hands, and watch for fast or hard breathing.', link: ['RSV and flu protection', OFFICIAL.rsv] },
    { icon: 'move', title: 'Keep moving indoors', text: 'Two short bursts outside beat none. Active games can replace a second show.', link: ['Movement guidelines', OFFICIAL.movement] },
  ],
}

const GUIDES: Record<Band, Array<{ title: string; value: string; detail: string }>> = {
  '0': [
    { title: 'Sleep', value: '10–13 hours', detail: 'Ages 3–5. Ages 1–2: 11–14 hours, naps included.' },
    { title: 'Active play', value: '3 hours', detail: 'Spread across the day. From age 3, at least 1 hour energetic.' },
    { title: 'Screen time', value: '1 hour or less', detail: 'None for children under 2.' },
    { title: 'Drinks', value: 'About 4–5 cups', detail: 'Ages 1–3: about 4 cups. Age 4: about 5 cups. Milk no more than 2 cups.' },
  ],
  '1': [
    { title: 'Sleep', value: '9–11 hours', detail: 'Uninterrupted, with a regular bedtime.' },
    { title: 'Active play', value: '60 minutes or more', detail: 'Enough to get puffed. Vigorous play on 3 days a week.' },
    { title: 'Screens for fun', value: '2 hours or less', detail: 'Not counting schoolwork. None in the hour before bed.' },
    { title: 'Drinks', value: 'About 5 cups', detail: 'Ages 5–8: about 1.2 L. Age 9: about 1.4–1.6 L. Water first.' },
  ],
  '2': [
    { title: 'Sleep', value: '9–11 hours', detail: 'Ages 10–13. From 14: 8–10 hours.' },
    { title: 'Active play', value: '60 minutes or more', detail: 'Vigorous activity and muscle building on 3 days a week.' },
    { title: 'Screens for fun', value: '2 hours or less', detail: 'Not counting schoolwork. Devices out of the bedroom at night.' },
    { title: 'Drinks', value: 'About 5–6 cups', detail: 'Ages 10–13: about 1.4–1.6 L. Age 14: about 1.6–1.9 L.' },
  ],
}

const ROUTINES: Record<Band, { bed: number; wake: number; nap: [number, number] | null; play: Array<[number, number]>; steps: Array<[string, string, string]> }> = {
  '0': { bed: 19.5, wake: 6.75, nap: [13, 14.5], play: [[8.5, 9.5], [10.25, 11], [15.5, 16.5]], steps: [
    ['7:00 am', 'Breakfast and a drink of water', 'Milk counts toward the 2-cup limit.'],
    ['8:30 am', 'Outdoor play', 'Hat and sunscreen when UV is 3 or more.'],
    ['1:00 pm', 'Nap or quiet time', 'Counts toward total sleep for ages 1–2.'],
    ['3:30 pm', 'Energetic play', 'Running, climbing, chasing.'],
    ['6:30 pm', 'Screens off, wind down', 'Bed by about 7:30 pm.'],
  ] },
  '1': { bed: 20.25, wake: 7, nap: null, play: [[8.25, 8.5], [12.75, 13.25], [15.5, 16.5]], steps: [
    ['7:30 am', 'Breakfast and a glass of water', 'Pack a water bottle for school.'],
    ['8:15 am', 'Walk or ride to school', 'It counts toward the 60 active minutes.'],
    ['12:45 pm', 'Play outside at lunch', 'With a hat while UV is high.'],
    ['3:30 pm', 'An active hour', 'Park, sport or bike.'],
    ['7:15 pm', 'Devices away', 'Bed by about 8:15 pm.'],
  ] },
  '2': { bed: 21.25, wake: 7, nap: null, play: [[8.25, 8.5], [12.75, 13.25], [16, 17]], steps: [
    ['7:15 am', 'Breakfast and a water bottle', 'Refill it at school.'],
    ['8:15 am', 'Active trip to school', 'Walk, ride or scooter if you can.'],
    ['12:45 pm', 'Move at lunch', 'With a hat while UV is high.'],
    ['4:00 pm', 'Sport or vigorous play', 'At least 3 days a week.'],
    ['8:15 pm', 'Devices out of the bedroom', 'Bed by about 9:15 pm.'],
  ] },
}

function RoutineClock({ band }: { band: Band }) {
  const r = ROUTINES[band]
  const P = (h: number, rad: number): [number, number] => { const a = h / 24 * 2 * Math.PI - Math.PI / 2; return [200 + rad * Math.cos(a), 200 + rad * Math.sin(a)] }
  const f = (n: number) => n.toFixed(1)
  const arc = (from: number, to: number) => { const end = to < from ? to + 24 : to; const [x1, y1] = P(from, 140), [x2, y2] = P(end, 140); return `M${f(x1)} ${f(y1)}A140 140 0 ${end - from > 12 ? 1 : 0} 1 ${f(x2)} ${f(y2)}` }
  const hours = ((r.wake - r.bed + 24) % 24) + (r.nap ? r.nap[1] - r.nap[0] : 0)
  const text = `${(Math.round(hours * 4) / 4).toString().replace('.25', '¼').replace('.5', '½').replace('.75', '¾')} h`
  return <figure className="kt-clock">
    <svg viewBox="-40 -40 480 480" role="img" aria-label={`Example routine on a 24-hour clock: about ${text.replace(' h', ' hours')} of sleep, with active play in the morning, middle of the day and afternoon.`}>
      <circle cx="200" cy="200" r="140" className="kt-clock-track" />
      <path d={arc(r.bed, r.wake) + (r.nap ? arc(r.nap[0], r.nap[1]) : '')} className="kt-clock-sleep" />
      <path d={r.play.map(([a, b]) => arc(a, b)).join('')} className="kt-clock-play" />
      <text x="200" y="-14" textAnchor="middle" className="kt-clock-label">midnight</text>
      <text x="200" y="438" textAnchor="middle" className="kt-clock-label">noon</text>
      <text x="200" y="210" textAnchor="middle" className="kt-clock-value">{text}</text>
      <text x="200" y="244" textAnchor="middle" className="kt-clock-label">of sleep</text>
    </svg>
    <figcaption><span><i className="sleep" />Sleep</span><span><i className="play" />Active play</span></figcaption>
  </figure>
}

interface ParentProps {
  locality: NeighbourhoodSearchResult
  age: string
  controls: ReactNode
  onCheckDay: () => void
  onGo: (page: 'seasons' | 'vaccines' | 'food' | 'care') => void
  onPrepareVisit: () => void
  onOpenMap?: () => void
}

export function TodayParent({ locality, age, controls, onCheckDay, onGo, onPrepareVisit, onOpenMap }: ParentProps) {
  const band = bandOf(age)
  const month = new Date().getMonth()
  const season = seasonOf(month)
  const [routineOpen, setRoutineOpen] = useState(false)
  const care = useLoad<CompareCare>(signal => api.getCompareCare(locality.id, signal), `ucc-${locality.id}`)
  const ucc = care.data?.urgent_care_clinics.slice().sort((a, b) => a.distance_km - b.distance_km)[0]
  const label = LABEL[band]
  const topics: Array<{ icon: keyof typeof ICONS; title: string; text: string; action: () => void }> = [
    { icon: 'season', title: 'Seasons and health', text: 'Storm asthma, heat and smoke: signs and plans.', action: () => onGo('seasons') },
    { icon: 'vaccine', title: 'Vaccines', text: 'What is due for your child, with reminders.', action: () => onGo('vaccines') },
    { icon: 'food', title: 'Food and drinks', text: 'Daily serves and a simple tracker.', action: () => onGo('food') },
    { icon: 'clipboard', title: 'Prepare for a GP visit', text: 'Note what you have noticed about growth, sleep or development.', action: onPrepareVisit },
  ]
  return <div className="kt kt-parent">
    <section className="kt-hero" aria-label="Introduction">
      <img src="/health-assets/today-parent.webp" alt="A mother lifting her smiling baby in a sunny park" className="kt-hero-img" />
      <div className="kt-hero-text">
        <h1>Your child’s health, day by day</h1>
        <p>Find age-based guidance, seasonal health information, and care near you.</p>
      </div>
    </section>
    <div className="kt-filters">
      {controls}
      <p>Everything below follows the age you choose.</p>
      {onOpenMap && <button type="button" className="kh-btn kt-link-btn" onClick={onOpenMap}>View {locality.name} on the map</button>}
      <a className="kh-btn kt-link-btn" href={`/where-to-live?anchor=${encodeURIComponent(locality.id)}`}>Thinking of moving? Compare areas</a>
    </div>

    <div className="kt-row">
      <section className="kt-card kt-tint kt-wide" aria-labelledby="kt-now">
        <h2 id="kt-now">What matters now</h2>
        <p className="kt-sub">Seasonal guidance for {MONTH_FULL[month]} in Melbourne, not today’s weather.</p>
        <div className="kt-now-grid">{NOW[season].map(item => <div key={item.title} className="kt-now-item">
          <span className="kt-ic"><Icon d={ICONS[item.icon]} /></span>
          <div><h3>{item.title}</h3><p>{item.text}</p><a href={item.link[1]} target="_blank" rel="noreferrer">{item.link[0]}</a></div>
        </div>)}</div>
      </section>
      <section className="kt-card kt-cream kt-narrow kt-next" aria-labelledby="kt-next">
        <h2 id="kt-next">Your next step</h2>
        <p>Check your child’s typical day. A few quick questions show which guidelines they meet and the two changes that would help most.</p>
        <button type="button" className="kh-btn primary kt-cta" onClick={onCheckDay}>Start the day check</button>
        <small>About 2 minutes. Answers stay on this device.</small>
      </section>
    </div>

    <div className="kt-row kt-row-top">
      <div className="kt-wide kt-col">
        <section aria-labelledby="kt-guides">
          <h2 id="kt-guides">Daily guidelines for {label}</h2>
          <p className="kt-sub">From Australian guidelines. Every child is different; use these as a guide.</p>
          <div className="kt-card kt-tint kt-guides">{GUIDES[band].map(item => <div key={item.title}>
            <h3>{item.title}</h3><strong>{item.value}</strong><p>{item.detail}</p>
          </div>)}</div>
        </section>
        <section className="kt-card kt-cream kt-routine" aria-labelledby="kt-routine">
          <button type="button" className="kt-routine-head" aria-expanded={routineOpen} aria-controls="kt-routine-body" onClick={() => setRoutineOpen(open => !open)}>
            <span><span id="kt-routine" className="kt-h2">Example daily routine</span><span className="kt-sub">One way to fit the guidelines in. Adapt the times to your family.</span></span>
            <span className="kh-btn kt-toggle">{routineOpen ? 'Hide routine' : 'Show routine'}</span>
          </button>
          <AnimatePresence initial={false}>{routineOpen && <motion.div id="kt-routine-body" className="kt-routine-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .22, ease: 'easeOut' }}>
            <div className="kt-routine-inner">
              <ol>{ROUTINES[band].steps.map(([time, title, text]) => <li key={time}><time>{time}</time><span><b>{title}</b>{text}</span></li>)}</ol>
              <RoutineClock band={band} />
            </div>
          </motion.div>}</AnimatePresence>
        </section>
      </div>

      <aside className="kt-narrow kt-col">
        <section className="kt-card kt-cream kt-help" aria-labelledby="kt-help">
          <h2 id="kt-help">Get help now</h2>
          <div className="kt-help-row is-urgent"><p><b>Emergency: call <a href="tel:000">000</a></b></p><p>Struggling to breathe, blue lips, a seizure, or very hard to wake.</p></div>
          <div className="kt-help-row"><p><b>Not sure what to do: <a href="tel:1300606024">1300 60 60 24</a></b></p><p>NURSE-ON-CALL, a registered nurse, 24 hours a day.</p></div>
          <div className="kt-help-row"><p><b>Urgent, not life-threatening</b></p>
            <p>{ucc ? <>{ucc.name}, {ucc.distance_km.toFixed(1)} km. <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ucc.name} ${ucc.address}`)}`} target="_blank" rel="noreferrer">Directions</a></> : care.loading ? 'Finding the nearest urgent care clinic…' : <>Medicare Urgent Care Clinics treat urgent problems that are not life-threatening. <button type="button" className="kt-inline-link" onClick={() => onGo('care')}>Find care nearby</button></>}</p></div>
        </section>
        <section aria-labelledby="kt-more">
          <h2 id="kt-more">More for {label}</h2>
          <ul className="kt-topics">{topics.map(topic => <li key={topic.title}><button type="button" onClick={topic.action}>
            <span className="kt-ic"><Icon d={ICONS[topic.icon]} /></span>
            <span><b>{topic.title}</b><small>{topic.text}</small></span>
          </button></li>)}</ul>
        </section>
      </aside>
    </div>

    <footer className="kt-foot">
      <p>Sources: Australian 24-Hour Movement Guidelines; NHMRC Nutrient Reference Values; Cancer Council Victoria; Victorian Department of Health. Guidance checked October 2026. General guidance for age groups, not a diagnosis for your child.</p>
    </footer>
  </div>
}

/* ------------------------------------------------------------------ practitioner */

const FOCUS: Record<Season, { months: string; title: string; questions: string[] }> = {
  spring: { months: 'October to December', title: 'Thunderstorm asthma', questions: ['Are asthma action plans being reviewed before November?', 'Do childcare services and schools hold relievers and spacers?', 'How are families told about high-risk forecast days?'] },
  summer: { months: 'December to February', title: 'Heat and bushfire smoke', questions: ['Do families know where cool public spaces are on extreme heat days?', 'Are services ready to keep children indoors on smoky days?', 'How are heat-health warnings passed on to families?'] },
  autumn: { months: 'March to May', title: 'Flu vaccination before winter', questions: ['How many eligible children have had this year’s flu vaccine?', 'Are reminders reaching families of children under 5?', 'Can activity programs move indoors as days shorten?'] },
  winter: { months: 'June to August', title: 'Flu, RSV and winter illness', questions: ['Are families clear on when breathing problems need urgent care?', 'Is infant RSV protection reaching eligible babies?', 'How is indoor activity being supported through winter?'] },
}

const pct = (value: number | null | undefined, digits = 1) => value === null || value === undefined ? '—' : `${value.toFixed(digits)}%`
const num = (value: number | null | undefined) => value === null || value === undefined ? '—' : Math.round(value).toLocaleString('en-AU')
const ordinal = (n: number) => { const r = Math.round(n); const s = r % 100 >= 11 && r % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][r % 10]; return `${r}${s}` }
/* One labelled 0–60% scale for every area, so cards compare and nothing is clipped: the highest
   observed share in Greater Melbourne is 50.8% and the highest expected upper limit 49.8%. */
const DEV_AXIS_MAX = 60
const DEV_AXIS_TICKS = [0, 20, 40, 60]
const scale = (value: number, min: number, max: number) => `${Math.max(0, Math.min(100, (value - min) / (max - min) * 100))}%`

type ContextTab = 'access' | 'air' | 'focus' | 'areas'
const CONTEXT_TABS: Array<[ContextTab, string]> = [['access', 'Access to care'], ['air', 'Air quality'], ['focus', 'Prevention focus'], ['areas', 'About these areas']]

interface PractitionerProps {
  locality: NeighbourhoodSearchResult
  controls: ReactNode
  immunisation: ImmunisationContext | null
  asthma: { percent: number | null; count: number | null; population_denominator: number | null } | null
  asthmaRatio: number | null
  aedcYear?: string
  services: number
  childcareServices: number | null | undefined
  onOpenMap?: () => void
  onGo: (page: 'seasons' | 'care') => void
}

export function TodayPractitioner({ locality, controls, immunisation, asthma, asthmaRatio, services, childcareServices, onOpenMap, onGo }: PractitionerProps) {
  const context = useLoad<PractitionerContext>(signal => api.getPractitionerContext(locality.id, signal), `pc-${locality.id}`)
  const air = useLoad<SeasonalAir>(signal => api.getSeasonalAir(locality.id, signal), `air-${locality.id}`)
  const care = useLoad<CompareCare>(signal => api.getCompareCare(locality.id, signal), `ucc-${locality.id}`)
  const dev = context.data?.development ?? null
  const access = context.data?.access ?? null
  const twoYear = immunisation?.indicators.find(item => item.indicator_id === 'immunised_age_2')
  // Axis from 80% (or lower, in tens, when a value is below 80%) to 100%, so no value is cut off.
  const immLow = Math.min(80, Math.floor(Math.min(twoYear?.pha.percent ?? 80, twoYear?.victoria?.percent ?? 80) / 10) * 10)
  const oneYear = immunisation?.indicators.find(item => item.indicator_id === 'immunised_age_1')
  const fiveYear = immunisation?.indicators.find(item => item.indicator_id === 'immunised_age_5')
  const phaName = immunisation?.locality?.pha_name ?? null
  const ucc = care.data?.urgent_care_clinics.slice().sort((a, b) => a.distance_km - b.distance_km)[0]
  const month = new Date().getMonth()
  const focus = FOCUS[seasonOf(month)]
  const order = [9, 10, 11, 0].map(m => m + 1)
  const airRows = air.data ? order.map(m => air.data!.months.find(row => row.month === m)).filter((row): row is NonNullable<typeof row> => Boolean(row)) : []
  const worst = air.data && air.data.months.length ? [...air.data.months].sort((a, b) => b.highest_daily_ug_m3 - a.highest_daily_ug_m3)[0] : null

  const [ctxTab, setCtxTab] = useState<ContextTab>('access')
  const [lo, hi] = dev?.expected_range_pct ?? [null, null]
  const devStatus = dev?.observed_vulnerable_pct == null || lo == null || hi == null ? null : dev.observed_vulnerable_pct > hi ? 'higher' : dev.observed_vulnerable_pct < lo ? 'lower' : 'within'
  const findings: ReactNode[] = []
  if (devStatus) findings.push(<>Developmental vulnerability at school entry is <b>{devStatus === 'within' ? 'within the expected range' : `${devStatus} than expected`}</b> for an area like {locality.name}.</>)
  if (twoYear?.pha.percent != null && twoYear.victoria?.percent != null) findings.push(<>Immunisation at 24 months is <b>{twoYear.pha.percent >= twoYear.victoria.percent ? 'above' : 'below'} the Victorian rate</b>{twoYear.pha.percent < 95 ? (twoYear.pha.percent >= twoYear.victoria.percent ? ' but below the 95% national target' : ' and below the 95% national target') : ' and meets the 95% national target'}.</>)
  if (access?.general_practice.percentile != null && access.early_childhood_education_and_care.percentile != null) {
    const both = access.general_practice.percentile >= 50 && access.early_childhood_education_and_care.percentile >= 50
    findings.push(<>Access to GPs and childcare places is <b>{both ? 'better than in most Victorian areas' : 'below the Victorian middle on at least one measure'}</b>.</>)
  }
  if (asthma?.percent != null) findings.push(<>{focus.months} focus: {focus.title.toLowerCase()}. {pct(asthma.percent, 2)} of local children have asthma.</>)

  return <div className="kt kt-prac">
    <section className="kt-hero" aria-label="Introduction">
      <img src="/health-assets/today-practitioner.jpg" alt="A healthcare professional in protective gear gently holding an infant" className="kt-hero-img" />
      <div className="kt-hero-text">
        <h1>Local child health overview</h1>
        <p>Explore local health indicators to support prevention and service planning. Figures describe areas and populations, never an individual child.</p>
        <div className="kt-hero-actions">
          <button type="button" className="kh-btn primary" onClick={() => window.print()}>Print brief</button>
          {onOpenMap && <button type="button" className="kh-btn kt-ghost" onClick={onOpenMap}>Open map</button>}
        </div>
      </div>
    </section>
    <div className="kt-filters">
      {controls}
      {phaName && <p>Population Health Area: {phaName}</p>}
    </div>

    {findings.length > 0 && <section className="kt-card kt-tint" aria-labelledby="kt-find">
      <h2 id="kt-find">Key findings</h2>
      <ul className="kt-findings">{findings.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </section>}

    <section aria-labelledby="kt-ind">
      <h2 id="kt-ind">Indicators</h2>
      <div className="kt-card kt-indicators">
        <article>
          <h3>Developmentally vulnerable on one or more domains</h3>
          {context.loading ? <p className="kt-empty">Loading…</p> : dev?.observed_vulnerable_pct == null ? <p className="kt-empty">Not available for this locality. Nothing has been estimated in its place.</p> : <>
            <div className="kt-value-row"><strong>{pct(dev.observed_vulnerable_pct)}</strong>{devStatus && devStatus !== 'within' && <span className="kt-badge"><Icon d={devStatus === 'higher' ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'} />{devStatus === 'higher' ? 'Higher' : 'Lower'} than expected</span>}</div>
            {lo != null && hi != null && dev.expected_vulnerable_pct != null && <div className="kt-range" role="img" aria-label={`Observed ${pct(dev.observed_vulnerable_pct)}. Expected ${pct(dev.expected_vulnerable_pct)}, likely range ${pct(lo)} to ${pct(hi)}.`}>
              <div className="kt-track"><i className="band" style={{ left: scale(lo, 0, DEV_AXIS_MAX), width: `calc(${scale(hi, 0, DEV_AXIS_MAX)} - ${scale(lo, 0, DEV_AXIS_MAX)})` }} /><i className="exp" style={{ left: scale(dev.expected_vulnerable_pct, 0, DEV_AXIS_MAX) }} /><i className={`obs${dev.observed_vulnerable_pct > DEV_AXIS_MAX ? ' is-over' : ''}`} style={{ left: scale(dev.observed_vulnerable_pct, 0, DEV_AXIS_MAX) }} /></div>
              <div className="kt-axis" aria-hidden="true">{DEV_AXIS_TICKS.map(t => <span key={t} style={{ left: scale(t, 0, DEV_AXIS_MAX) }}>{t}%</span>)}</div>
              <span>Expected {pct(dev.expected_vulnerable_pct)} (likely range {pct(lo)}–{pct(hi)}), based on the area’s characteristics.</span>
            </div>}
            <p className="kt-limit">A teacher-completed snapshot of children starting school, not an assessment of any individual child.</p>
            <p className="kt-meta">AEDC 2024. {locality.name} SA2. {num(dev.children_assessed)} children in their first year of school.</p>
          </>}
        </article>
        <article>
          <h3>Fully immunised at 24 months</h3>
          {twoYear?.pha.percent == null ? <p className="kt-empty">Not available for this locality.</p> : <>
            <div className="kt-value-row"><strong>{pct(twoYear.pha.percent)}</strong></div>
            <div className="kt-range" role="img" aria-label={`${pct(twoYear.pha.percent)} locally, compared with Victoria ${pct(twoYear.victoria?.percent)} and the 95 percent national target.`}>
              <div className="kt-track"><i className="fill" style={{ width: scale(twoYear.pha.percent, immLow, 100) }} />{twoYear.victoria?.percent != null && <i className="ref" style={{ left: scale(twoYear.victoria.percent, immLow, 100) }} />}<i className="target" style={{ left: scale(95, immLow, 100) }} /></div>
              <div className="kt-axis" aria-hidden="true"><span style={{ left: '0%' }}>{immLow}%</span><span style={{ left: scale(95, immLow, 100) }}>95% target</span><span style={{ left: '100%' }}>100%</span></div>
              <span>Victoria {pct(twoYear.victoria?.percent)}. National target 95%. Higher is better. {num(twoYear.pha.numerator)} of {num(twoYear.pha.denominator)} children.{oneYear?.pha.percent != null && fiveYear?.pha.percent != null ? ` At 12 months: ${pct(oneYear.pha.percent)}; at 5 years: ${pct(fiveYear.pha.percent)}.` : ''}</span>
            </div>
            <p className="kt-limit">Late recording on the register can understate coverage.</p>
            <p className="kt-meta">Australian Immunisation Register via PHIDU, {twoYear.reference_period}. {phaName ?? 'Containing'} PHA.</p>
          </>}
        </article>
        <article>
          <h3>Children aged 0–14 with asthma</h3>
          {asthma?.percent == null ? <p className="kt-empty">Not available for this locality.</p> : <>
            <div className="kt-value-row"><strong>{pct(asthma.percent, 2)}</strong></div>
            <span className="kt-note">{num(asthma.count)} of {num(asthma.population_denominator)} children.{asthmaRatio != null ? ` In the wider PHA, the age-standardised rate is about ${Math.abs(Math.round(100 - asthmaRatio))}% ${asthmaRatio < 100 ? 'below' : 'above'} Australia’s (ratio ${Math.round(asthmaRatio)}).` : ''}</span>
            <p className="kt-limit">Reported by households in the Census; does not show how severe or well controlled asthma is.</p>
            <p className="kt-meta">ABS Census 2021, {locality.name} SA2{asthmaRatio != null ? '. PHIDU 2021, PHA' : ''}.</p>
          </>}
        </article>
      </div>
    </section>

    <section className="kt-card kt-cream kt-context" aria-labelledby="kt-more">
      <h2 id="kt-more">More context</h2>
      <div className="kt-tabs" role="tablist" aria-label="More context">{CONTEXT_TABS.map(([id, label]) => <button key={id} type="button" role="tab" id={`kt-tab-${id}`} aria-selected={ctxTab === id} aria-controls="kt-ctx-panel" onClick={() => setCtxTab(id)}>{label}</button>)}</div>
      <div id="kt-ctx-panel" role="tabpanel" aria-labelledby={`kt-tab-${ctxTab}`} className="kt-ctx-panel">
        {ctxTab === 'access' && <>
        <table className="kt-table"><tbody>
          {access?.general_practice.percentile != null && <tr><th scope="row"><b>GP access</b><span>Better than {access.general_practice.percentile.toFixed(1)}% of Victorian SA2s. {access.general_practice.access_5km?.toFixed(1) ?? '—'} practices per 10,000 residents within 5 km, distance-weighted.</span></th><td>{ordinal(access.general_practice.percentile)}</td></tr>}
          {access?.early_childhood_education_and_care.percentile != null && <tr><th scope="row"><b>Childcare access</b><span>Better than {access.early_childhood_education_and_care.percentile.toFixed(1)}% of Victorian SA2s. {num(access.early_childhood_education_and_care.access_5km)} approved places per 100 children aged 0–4 within 5 km.</span></th><td>{ordinal(access.early_childhood_education_and_care.percentile)}</td></tr>}
          <tr><th scope="row"><b>Nearest urgent care clinic</b><span>{ucc ? ucc.name : care.loading ? 'Loading…' : 'Not available'}</span></th><td>{ucc ? `${ucc.distance_km.toFixed(1)} km` : '—'}</td></tr>
          <tr><th scope="row"><b>Services listed in the SA2</b></th><td className="kt-small">{services} health services · {num(childcareServices)} childcare services</td></tr>
        </tbody></table>
        <p className="kt-meta">Two-step floating catchment (E2SFCA). Healthdirect, March 2025. ACECQA.</p>
        </>}
        {ctxTab === 'air' && <>
        <h3>Monthly average PM2.5, October to January</h3>
        {air.data?.station ? <>
          <p className="kt-sub">{air.data.station.name} monitor, {air.data.station.distance_km.toFixed(1)} km away, {air.data.station.first_year}–{air.data.station.last_year}.</p>
          <p className="kt-limit">Readings at the nearest monitor, not exposure inside {locality.name}.</p>
          <table className="kt-table kt-air"><thead><tr><th scope="col">Month</th><th scope="col">Average daily level</th><th scope="col">Days above standard</th></tr></thead><tbody>
            {airRows.map(row => <tr key={row.month}><th scope="row">{MONTH_FULL[row.month - 1]}</th><td><span className="kt-airbar"><i style={{ width: `${Math.round(row.mean_daily_ug_m3 / 12 * 140)}px` }} />{row.mean_daily_ug_m3.toFixed(1)} µg/m³</span></td><td>{row.days_above_standard}</td></tr>)}
          </tbody></table>
          <p className="kt-meta">Daily standard {air.data.station.standard_ug_m3} µg/m³. Day counts are totals across all years.{worst ? ` Highest: ${worst.highest_daily_ug_m3} µg/m³ on ${new Date(worst.highest_daily_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}.` : ''} EPA Victoria.</p>
        </> : <p className="kt-empty">{air.loading ? 'Loading…' : 'No air monitor data is available for this locality.'}</p>}
        </>}
        {ctxTab === 'focus' && <>
        <span className="kt-pill">{focus.months}</span>
        <h3>Prevention focus: {focus.title.toLowerCase()}</h3>
        <ul className="kt-findings kt-one">{focus.questions.map(question => <li key={question}>{question}</li>)}</ul>
        <button type="button" className="kt-inline-link" onClick={() => onGo('seasons')}>Open seasonal prevention</button>
        </>}
        {ctxTab === 'areas' && <>
        <p><b>SA2</b> (Statistical Area Level 2) is the {locality.name} suburb area defined by the ABS.</p>
        <p><b>PHA</b> (Population Health Area){phaName ? ` ${phaName}` : ''} can combine neighbouring suburbs, so its figures may describe a larger population. PHA values are never assigned to the SA2.</p>
        </>}
      </div>
    </section>
  </div>
}
