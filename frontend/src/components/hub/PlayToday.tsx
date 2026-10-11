/**
 * Play today. Parents: when to play outside today (heat, UV, air, rain for the area), the
 * playgrounds and pools nearby, and an active-minutes goal for the child's age. Practitioners:
 * play-space access around the area, children's activity and screen habits, and heat and shade.
 * Live conditions come from Open-Meteo in the browser; places from Vicmap Features of Interest.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, type DepartmentAreaIndicator, type NeighbourhoodSearchResult, type NutritionContext, type PlayKind, type PlaySpace, type PlaySpaces } from '../../services/api'
import { OFFICIAL } from '../health/healthPlanning'
import { Hero, Summary, TabPanel, Tabs, directionsTo, has, pct, useLoad } from './hubKit'
import type { PlaceFigures } from './SeasonsTool'
import { bestWindow, hourLabel, loadPlayDay, windowText, type PlayDay, type PlayHour } from './playConditions'
import './TodayPage.css'
import './HealthTopics.css'
import './VaccinesTool.css'
import './HubPages.css'
import './PlayToday.css'

interface Props {
  parent: boolean
  locality: NeighbourhoodSearchResult
  age: string
  controls: ReactNode
  nutrition: NutritionContext | null
  env: PlaceFigures
}

const MINUTES_KEY = 'vk-play-minutes'
// Australian 24-Hour Movement Guidelines.
const GOALS: Record<string, { minutes: number; text: string; screens: string }> = {
  '0–4 years': { minutes: 180, text: 'At least 3 hours of active play spread through the day, including some energetic play from age 3. Babies: floor play and tummy time several times a day.', screens: 'No screen time under 2; no more than 1 hour a day for ages 2 to 4.' },
  '5–9 years': { minutes: 60, text: 'At least 60 minutes of moderate to vigorous activity every day, plus activities that build muscle and bone on at least 3 days a week.', screens: 'No more than 2 hours of recreational screen time a day.' },
  '10–14 years': { minutes: 60, text: 'At least 60 minutes of moderate to vigorous activity every day, plus activities that build muscle and bone on at least 3 days a week.', screens: 'No more than 2 hours of recreational screen time a day.' },
}
const KIND_PLURAL: Record<PlayKind, string> = { 'Playground': 'Playgrounds', 'Swimming pool': 'Swimming pools', 'Picnic area': 'Picnic areas', 'Day visitor area': 'Day visitor areas' }
const LEVEL_TEXT = { good: 'Good', care: 'Take care', avoid: 'Avoid' } as const

function useLiveDay(origin: PlaySpaces['origin'] | undefined) {
  const [state, setState] = useState<{ day: PlayDay | null; loading: boolean; failed: boolean }>({ day: null, loading: true, failed: false })
  useEffect(() => {
    if (!origin) { setState({ day: null, loading: false, failed: true }); return }
    const c = new AbortController()
    setState({ day: null, loading: true, failed: false })
    loadPlayDay(origin.latitude, origin.longitude, c.signal)
      .then(day => setState({ day, loading: false, failed: day.hours.length === 0 }))
      .catch(() => { if (!c.signal.aborted) setState({ day: null, loading: false, failed: true }) })
    return () => c.abort()
  }, [origin?.latitude, origin?.longitude])
  return state
}

function placeName(p: PlaySpace) {
  return p.name || `${p.kind} (unnamed)`
}

export default function PlayToday(props: Props) {
  const spaces = useLoad<PlaySpaces>(signal => api.getPlaySpaces(props.locality.id, signal), `play-${props.locality.id}`)
  const live = useLiveDay(spaces.loading ? undefined : spaces.data?.origin ?? null)
  return props.parent ? <ParentPlay {...props} spaces={spaces} live={live} /> : <PractitionerPlay {...props} spaces={spaces} live={live} />
}

type Spaces = { data: PlaySpaces | null; loading: boolean }
type Live = ReturnType<typeof useLiveDay>

/* ------------------------------------------------------------------ parents */

type ParentTab = 'plan' | 'places' | 'minutes' | 'check'

function ParentPlay({ locality, controls, age, env, spaces, live }: Props & { spaces: Spaces; live: Live }) {
  const [tab, setTab] = useState<ParentTab>('plan')
  const nowHour = new Date().getHours()
  const day = live.day
  const best = day ? bestWindow(day.hours, nowHour) : null
  const remaining = day ? day.hours.filter(h => h.hour >= nowHour) : []
  const goal = GOALS[age] ?? GOALS['5–9 years']
  const playground = spaces.data?.places?.find(p => p.kind === 'Playground')
  const headline = live.loading ? 'Checking today’s conditions…'
    : !day ? 'Live conditions could not load'
    : remaining.length === 0 ? 'Daylight play is over for today'
    : best?.level === 'good' ? `Best time to play outside: ${windowText(best)}`
    : best ? `Outdoor play with care: ${windowText(best)}`
    : 'Indoor play is the safer choice today'
  const inBest = best ? day!.hours.filter(h => h.hour >= best.start && h.hour < best.end) : []
  const bestUv = Math.max(0, ...inBest.map(h => h.uv ?? 0))
  const reasons = [...new Set(inBest.flatMap(h => h.reasons).filter(r => !r.startsWith('UV')))]
  if (bestUv >= 3) reasons.push(`UV up to ${Math.round(bestUv)}: hat, sunscreen and shade`)
  const avoidHours = remaining.filter(h => h.level === 'avoid')

  return <div className="kt ht vx hp pt kt-parent">
    <Hero parent title="Where to play today" text="The best time to play outside where you live, playgrounds and pools nearby, and how much active play your child needs." />
    <div className="kt-filters">{controls}<p>Conditions for {locality.name} today. Places are within 3 km.</p></div>

    <Summary id="pt-now" eyebrow={`Today · ${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}`} actions={<>
      {playground && <a className="kh-btn primary" href={directionsTo(playground.latitude, playground.longitude)} target="_blank" rel="noreferrer">Directions to {playground.park || 'the nearest playground'}</a>}
      <button type="button" className="kh-btn" onClick={() => setTab('minutes')}>Log active play</button>
    </>}>
      <p className="vx-big">{headline}</p>
      {day && <p className="vx-when">{[has(day.maxTemp) ? `Top ${Math.round(day.maxTemp)} °C` : null, has(day.maxUv) ? `UV up to ${Math.round(day.maxUv)}` : null, day.airAvailable ? airWord(remaining) : null].filter(Boolean).join(' · ')}</p>}
      {reasons.length > 0 && <p className="vx-lead">{reasons.join('; ')}.</p>}
      {avoidHours.length > 0 && <p className="vx-lead">Avoid {ranges(avoidHours)}: {[...new Set(avoidHours.flatMap(h => h.reasons))].slice(0, 2).join(', ')}.</p>}
      {!live.loading && !day && <p className="vx-lead">Check <a href={OFFICIAL.sunSmart} target="_blank" rel="noreferrer">SunSmart</a> and <a href={OFFICIAL.airWatch} target="_blank" rel="noreferrer">EPA AirWatch</a> before heading out.</p>}
    </Summary>

    <section className="kt-card kt-cream vx-panel" aria-label="Play details">
      <Tabs label="Play details" value={tab} onChange={setTab} tabs={[['plan', 'Today hour by hour'], ['places', 'Places nearby'], ['minutes', 'Active minutes'], ['check', 'Check before you go']]} />
      <TabPanel tab={tab}>
        {tab === 'plan' && (day ? <>
          <p className="kt-sub">Each daylight hour from now, rated for active outdoor play.</p>
          <HourStrip hours={remaining.length ? remaining : day.hours} />
          <ul className="pt-tips">
            <li><b>Hot hours:</b> play in the shade, offer water often, and rest. Never leave a child in a parked car.</li>
            <li><b>UV 3 or more:</b> hat, sunscreen, covering clothes and shade.</li>
            <li><b>Poor air:</b> keep play indoors and gentle; follow any asthma action plan.</li>
          </ul>
          <p className="kt-limit">Forecast for the centre of {locality.name} from Open-Meteo. Air is a model forecast, not an EPA monitor reading. {has(env.vegetation) ? `Tree and plant cover here is ${pct(env.vegetation)}, so look for shaded spots.` : ''}</p>
        </> : <p className="kt-empty">{live.loading ? 'Loading today’s forecast…' : 'Today’s forecast could not load. Places and active minutes still work.'}</p>)}
        {tab === 'places' && <Places spaces={spaces} locality={locality.name} />}
        {tab === 'minutes' && <Minutes goal={goal} age={age} />}
        {tab === 'check' && <ul className="hp-links">
          {([['Heat-health warnings', 'Victorian Department of Health', OFFICIAL.heat], ['Air quality now', 'EPA Victoria AirWatch', OFFICIAL.airWatch], ['Sun protection times', 'SunSmart', OFFICIAL.sunSmart], ['Thunderstorm asthma forecast', 'Victorian Department of Health', OFFICIAL.asthmaForecast]] as const).map(([t, s, href]) =>
            <li key={t}><a href={href} target="_blank" rel="noreferrer"><b>{t}</b><span className="kt-small">{s}</span></a></li>)}
        </ul>}
      </TabPanel>
    </section>

    <footer className="kt-foot"><p>Forecast and air quality: Open-Meteo (CC BY 4.0). Places: Vicmap Features of Interest, Victorian Government (CC BY 4.0). Activity guide: Australian 24-Hour Movement Guidelines. Thresholds follow Victorian heat guidance, SunSmart and EPA Victoria air categories. General guidance, not medical advice for your child.</p></footer>
  </div>
}

function airWord(hours: PlayHour[]) {
  const worst = Math.max(...hours.map(h => h.pm25 ?? 0), 0)
  return worst >= 50 ? 'air poor at times' : worst >= 25 ? 'air fair at times' : 'air good'
}

function ranges(hours: PlayHour[]) {
  const runs: Array<[number, number]> = []
  for (const h of hours) { const last = runs[runs.length - 1]; if (last && last[1] === h.hour) last[1] = h.hour + 1; else runs.push([h.hour, h.hour + 1]) }
  return runs.map(([a, b]) => `${hourLabel(a)} to ${hourLabel(b)}`).join(' and ')
}

function HourStrip({ hours }: { hours: PlayHour[] }) {
  return <ol className="pt-hours">
    {hours.map(h => <li key={h.hour} className={`is-${h.level}`}>
      <b>{hourLabel(h.hour)}</b>
      <span className="pt-level">{LEVEL_TEXT[h.level]}</span>
      <span className="pt-meta">{has(h.feelsLike) ? `${Math.round(h.feelsLike)}°` : '–'} · UV {has(h.uv) ? Math.round(h.uv) : '–'}{has(h.rain) && h.rain >= 40 ? ` · ${Math.round(h.rain)}% rain` : ''}</span>
    </li>)}
  </ol>
}

function Places({ spaces, locality }: { spaces: Spaces; locality: string }) {
  const [kind, setKind] = useState<PlayKind>('Playground')
  const [more, setMore] = useState(false)
  if (spaces.loading) return <p className="kt-empty">Loading places…</p>
  if (!spaces.data?.places) return <p className="kt-empty">Play places can’t be shown right now.</p>
  const kinds = (['Playground', 'Swimming pool', 'Picnic area', 'Day visitor area'] as PlayKind[]).filter(k => spaces.data!.places!.some(p => p.kind === k))
  const list = spaces.data.places.filter(p => p.kind === kind)
  const shown = list.slice(0, more ? list.length : 5)
  const count = spaces.data.access?.find(a => a.kind === kind)
  return <>
    <p className="kt-sub">{count ? `${count.within_1km} ${KIND_PLURAL[kind].toLowerCase()} within 1 km of the centre of ${locality}, ${count.within_2km} within 2 km.` : `Near ${locality}.`} Select one for directions.</p>
    {kinds.length > 1 && <div className="ht-facets vx-filters" role="group" aria-label="Show">{kinds.map(k => <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); setMore(false) }}>{KIND_PLURAL[k]}</button>)}</div>}
    {list.length === 0 ? <p className="kt-empty">No {KIND_PLURAL[kind].toLowerCase()} listed within 3 km.</p> : <ol className="vx-rows">
      {shown.map(p => <li key={p.feature_id}><a className="vx-row" href={directionsTo(p.latitude, p.longitude)} target="_blank" rel="noreferrer">
        <span className="vx-txt"><b>{placeName(p)}</b><small>{p.distance_km.toFixed(1)} km {p.direction} of the area centre</small></span>
        <span className="vx-dist">{p.distance_km.toFixed(1)} km</span><span className="vx-chev" aria-hidden="true">›</span>
      </a></li>)}
    </ol>}
    {list.length > 5 && <div className="ht-actions"><button type="button" className="kh-btn" aria-expanded={more} onClick={() => setMore(v => !v)}>{more ? 'Show fewer' : `Show ${list.length - 5} more`}</button></div>}
    <p className="kt-limit">From Vicmap Features of Interest. Shade, fencing, toilets and condition are not recorded; distances are straight-line.</p>
  </>
}

function Minutes({ goal, age }: { goal: { minutes: number; text: string; screens: string }; age: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const [minutes, setMinutes] = useState(() => {
    try { const s = JSON.parse(window.localStorage.getItem(MINUTES_KEY) ?? 'null'); return s && s.date === today && Number.isFinite(s.minutes) ? Math.max(0, Math.min(600, s.minutes)) : 0 } catch { return 0 }
  })
  useEffect(() => { try { window.localStorage.setItem(MINUTES_KEY, JSON.stringify({ date: today, minutes })) } catch { /* storage unavailable */ } }, [minutes, today])
  const share = Math.min(100, minutes / goal.minutes * 100)
  const left = Math.max(0, goal.minutes - minutes)
  return <>
    <p className="kt-sub">Active play today, {age}. Saved only on this device and reset each day.</p>
    <div className="pt-goal">
      <div className="pt-goal-num"><strong>{minutes}</strong><span>of {goal.minutes} minutes</span></div>
      <span className="hp-bar pt-goal-bar" role="img" aria-label={`${minutes} of ${goal.minutes} minutes`}><span style={{ width: `${share}%` }} /></span>
      <p className="pt-goal-left" role="status">{left === 0 ? 'Goal reached for today.' : `${left} minutes to go.`}</p>
      <div className="ht-actions">
        <button type="button" className="kh-btn primary" onClick={() => setMinutes(m => Math.min(600, m + 15))}>+15 minutes</button>
        <button type="button" className="kh-btn" onClick={() => setMinutes(m => Math.min(600, m + 30))}>+30 minutes</button>
        <button type="button" className="kh-btn" disabled={minutes === 0} onClick={() => setMinutes(m => Math.max(0, m - 15))}>−15</button>
        <button type="button" className="kh-btn" disabled={minutes === 0} onClick={() => setMinutes(0)}>Reset</button>
      </div>
    </div>
    <ul className="pt-tips"><li><b>Goal:</b> {goal.text}</li><li><b>Screens:</b> {goal.screens}</li></ul>
    <a className="kh-link" href={OFFICIAL.movement} target="_blank" rel="noreferrer">Australian 24-Hour Movement Guidelines ↗</a>
  </>
}

/* ------------------------------------------------------------------ practitioners */

type PracTab = 'access' | 'habits' | 'heat' | 'questions'
const HABIT_IDS = ['recommended_daily_physical_activity', 'electronic_media_over_two_hours']
const HABIT_LABEL: Record<string, string> = { recommended_daily_physical_activity: 'Active 60 minutes a day', electronic_media_over_two_hours: 'More than 2 hours screen time' }

function PractitionerPlay({ locality, controls, nutrition, env, spaces, live }: Props & { spaces: Spaces; live: Live }) {
  const [tab, setTab] = useState<PracTab>('access')
  const access = spaces.data?.access ?? []
  const playground = access.find(a => a.kind === 'Playground')
  const pool = access.find(a => a.kind === 'Swimming pool')
  const habits = useMemo(() => (nutrition?.vcams ?? []).filter(v => HABIT_IDS.includes(v.indicator_id)), [nutrition])
  const active = habits.find(h => h.indicator_id === 'recommended_daily_physical_activity')
  const day = live.day
  const avoid = day ? day.hours.filter(h => h.level === 'avoid').length : 0

  return <div className="kt ht vx hp pt kt-prac">
    <Hero parent={false} title="Active play access" text="Play spaces around the area, children's activity and screen habits, and the heat and shade that shape outdoor play." />
    <div className="kt-filters">{controls}<p>Places: SA2 label point, straight-line · Habits: {nutrition?.locality?.department_area ?? 'Department area'} (VCAMS)</p></div>

    {playground && <Summary id="pt-kf" eyebrow="Key finding">
      <p className="vx-lead"><b>{playground.within_1km}</b> playgrounds within 1 km of the {locality.name} centre ({playground.within_2km} within 2 km); nearest public pool {has(pool?.nearest_km) ? `${pool!.nearest_km.toFixed(1)} km` : 'not listed'}.</p>
      <details className="vx-more"><summary>More findings</summary><ul className="kt-findings kt-one">
        {active && has(active.area.percent) && <li>{active.area.percent.toFixed(1)}% of children aged {active.age_group} meet the 60-minute activity guideline ({active.reference_year}); median of {active.department_areas?.count ?? 17} areas {pct(active.department_areas?.median)}.</li>}
        {has(env.vegetation) && <li>Tree and plant cover {pct(env.vegetation)}; land surface {has(env.heat) ? `${env.heat.toFixed(1)} °C` : '—'} hotter than surrounding non-urban land (2018).</li>}
        {day && <li>Today: {avoid} of {day.hours.length} daylight hours rated unsuitable for active outdoor play (heat, air or rain).</li>}
      </ul></details>
    </Summary>}

    <section className="kt-card kt-cream vx-panel" aria-label="Active play details">
      <Tabs label="Active play details" value={tab} onChange={setTab} tabs={[['access', 'Play spaces'], ['habits', 'Activity and screens'], ['heat', 'Heat and shade'], ['questions', 'Planning questions']]} />
      <TabPanel tab={tab}>
        {tab === 'access' && (access.length ? <>
          <p className="kt-sub">Listed places counted from the SA2 label point.</p>
          <div className="hp-cal-wrap"><table className="kt-table hp-table"><thead><tr><th scope="col">Place</th><th scope="col">Within 1 km</th><th scope="col">Within 2 km</th><th scope="col">Nearest</th></tr></thead>
            <tbody>{access.map(a => <tr key={a.kind}><th scope="row">{KIND_PLURAL[a.kind]}</th><td>{a.within_1km}</td><td>{a.within_2km}</td><td>{has(a.nearest_km) ? `${a.nearest_km.toFixed(1)} km` : '—'}</td></tr>)}</tbody></table></div>
          <p className="kt-limit">Vicmap Features of Interest. Presence only: not size, shade, accessibility, fencing or condition.</p>
        </> : <p className="kt-empty">{spaces.loading ? 'Loading…' : 'Unavailable.'}</p>)}
        {tab === 'habits' && (habits.length ? <>
          <p className="kt-sub">VCAMS 2021, {nutrition?.locality?.department_area}. Tick: median of the department areas.</p>
          <ol className="vx-rows">{habits.map(h => <HabitRow key={h.indicator_id} item={h} />)}</ol>
          <p className="kt-limit">Regional survey estimates; they cannot be broken down to this suburb.</p>
        </> : <p className="kt-empty">Activity estimates aren’t available for this area.</p>)}
        {tab === 'heat' && <>
          <div className="hp-facts">
            <div><strong>{pct(env.vegetation)}</strong><span>tree and plant cover</span><small>Share of the SA2, 2018</small></div>
            <div><strong>{has(env.heat) ? `+${env.heat.toFixed(1)} °C` : '—'}</strong><span>urban heat</span><small>Land surface above non-urban land, 2018</small></div>
            <div><strong>{pct(env.openSpace)}</strong><span>public open space</span><small>Share of the SA2, 2018</small></div>
          </div>
          {day && <><p className="kt-sub">Today, hour by hour (Open-Meteo forecast for the area centre).</p><HourStrip hours={day.hours} /></>}
          <p className="kt-limit">Area measures describe the place, not exposure at any home or playground.</p>
        </>}
        {tab === 'questions' && <ol className="kt-findings">
          <li>Which playgrounds within 1 km have natural or built shade for summer afternoons?</li>
          <li>Are activity and screen-time messages given together at maternal and child health visits and school entry?</li>
          <li>On heat and poor-air days, which indoor spaces can families use for active play?</li>
        </ol>}
      </TabPanel>
    </section>

    <footer className="kt-foot"><p>Vicmap Features of Interest (Victorian Government); Victorian Child and Adolescent Monitoring System 2021; Cooling and Greening Melbourne 2018; Open-Meteo forecast. Area-level evidence only; not for individual assessment.</p></footer>
  </div>
}

function HabitRow({ item }: { item: DepartmentAreaIndicator }) {
  const median = item.department_areas?.median ?? null
  return <li className="hp-habit">
    <span className="vx-txt"><b>{HABIT_LABEL[item.indicator_id] ?? item.indicator_label}</b><small>{item.age_group} · {item.reference_year}{item.area_rank_highest_first ? ` · ${item.area_rank_highest_first} of ${item.department_areas?.count ?? 17}` : ''}</small></span>
    <strong className="pt-habit-val">{pct(item.area.percent)}</strong>
    <span className="hp-bar" role="img" aria-label={`${pct(item.area.percent)}; median ${pct(median)}`}><span style={{ width: `${Math.min(100, item.area.percent ?? 0)}%` }} />{has(median) && <i style={{ left: `${median}%` }} />}</span>
  </li>
}
