/**
 * Seasons. Parents: what this month brings, a year planner, the air near home and when coughs and
 * bugs peak. Practitioners: a prevention calendar, Victorian child notifications by month, the
 * nearest EPA monitor by month and place features that shape seasonal risk. Real data only.
 */
import { useState, type ReactNode } from 'react'
import { api, type NeighbourhoodSearchResult, type PreventionContext, type SeasonalAir, type SeasonalIllness } from '../../services/api'
import { OFFICIAL, buildCalendar, downloadFile, nextOccurrence, type CalendarEvent } from '../health/healthPlanning'
import { Dialog, Hero, MONTHS, MONTHS_SHORT, Summary, TabPanel, Tabs, has, pct, slug, useLoad } from './hubKit'
import './TodayPage.css'
import './HealthTopics.css'
import './VaccinesTool.css'
import './HubPages.css'

interface Season { id: string; title: string; months: number[]; why: string; actions: string[]; link: string; linkLabel: string }
/** Parent view: the health issue a season brings, signs to watch for and what to do (Better Health and Asthma Australia guidance). */
interface Issue { name: string; context: string; signs: string[]; todo: string[] }
const SEASONS: Season[] = [
  { id: 'heat', title: 'Extreme heat', months: [11, 0, 1, 2], why: 'Hot days are harder on young children, especially where shade is limited.', actions: ['Play outside before 11 am or after 4 pm', 'Offer water often and dress children in light clothing', 'Never leave a child in a parked car'], link: OFFICIAL.heat, linkLabel: 'Heat-health warnings' },
  { id: 'uv', title: 'Sun and UV', months: [8, 9, 10, 11, 0, 1, 2, 3], why: 'UV is high enough to damage skin from spring to autumn.', actions: ['Hat, sunscreen, covering clothing, shade and sunglasses', 'Check the daily sun protection times', 'Choose shaded play spaces'], link: OFFICIAL.sunSmart, linkLabel: 'SunSmart' },
  { id: 'asthma', title: 'Thunderstorm asthma', months: [9, 10, 11], why: 'Storms on high grass-pollen days can trigger sudden, severe asthma.', actions: ['Review the asthma action plan before October', 'Keep the reliever puffer and spacer handy', 'Check the forecast daily and stay inside during storms on high-risk days'], link: OFFICIAL.asthmaForecast, linkLabel: 'Thunderstorm asthma forecast' },
  { id: 'smoke', title: 'Bushfire smoke', months: [11, 0, 1, 2], why: 'Smoke from regional fires can reach Melbourne suburbs.', actions: ['Check air quality on smoky days', 'Keep children indoors with windows closed when air is poor', 'Keep asthma medicines up to date'], link: OFFICIAL.airWatch, linkLabel: 'EPA AirWatch' },
  { id: 'water', title: 'Water safety', months: [10, 11, 0, 1, 2], why: 'Summer brings more time at pools and beaches.', actions: ['Always watch young children in and near water', 'Check pool gates close by themselves', 'Enrol in swimming and water-safety lessons'], link: OFFICIAL.waterSafety, linkLabel: 'Royal Life Saving' },
  { id: 'flu', title: 'Flu and RSV', months: [4, 5, 6, 7, 8], why: 'Winter brings the biggest rise in children’s coughs, colds and flu.', actions: ['Flu vaccine in April or May', 'Ask about free infant RSV protection for babies', 'Keep sick children home and wash hands'], link: OFFICIAL.rsv, linkLabel: 'RSV immunisation' },
]
const ISSUES: Record<string, Issue> = {
  heat: { name: 'Dehydration and heat illness', context: 'Hot days', signs: ['Fewer wet nappies or dark yellow urine', 'Unusually sleepy, irritable or floppy', 'Hot, flushed or very pale skin, headache or vomiting'], todo: ['Move your child somewhere cool and offer water often', 'Cool the skin with a damp cloth or a lukewarm bath', 'Call 000 if your child is floppy, confused or not responding'] },
  uv: { name: 'Sunburn and eye damage', context: 'High UV', signs: ['Red, hot or tender skin a few hours after being outside', 'Blisters, fever or chills with sunburn', 'Sore, red or watery eyes after bright sun'], todo: ['Cool the skin with a cool bath or a damp cloth', 'Offer extra water and keep out of the sun until it heals', 'See a GP for blistering, or for any sunburn in a baby under 12 months'] },
  asthma: { name: 'Asthma attacks in storms', context: 'Thunderstorm asthma', signs: ['Coughing, wheezing or a tight chest', 'Fast breathing or trouble talking', 'Sucking in at the ribs or the base of the throat'], todo: ['Follow your child’s asthma action plan', 'Give the reliever puffer with a spacer, using the asthma first aid steps', 'Call 000 if breathing is very hard or the reliever is not helping'] },
  smoke: { name: 'Breathing problems from smoke', context: 'Bushfire smoke', signs: ['Coughing, a sore throat or itchy, watery eyes', 'Wheezing or shortness of breath, especially with asthma', 'Unusual tiredness on smoky days'], todo: ['Go inside, close windows and doors, and set air conditioning to recirculate', 'Follow the asthma action plan if your child has asthma', 'Call 000 if your child has trouble breathing'] },
  water: { name: 'Drowning', context: 'Pools, beaches and baths', signs: ['Drowning is quick and silent: children slip under without splashing or calling out', 'If a child is missing, check water first: pools, baths, ponds and buckets', 'Coughing or trouble breathing after being in water needs checking'], todo: ['Call 000 and start CPR if a child is not breathing', 'Learn CPR for babies and children', 'Keep children under 5 within arm’s reach in and near water'] },
  flu: { name: 'Flu, RSV and chest infections', context: 'Winter', signs: ['Fever, cough, runny nose or poor feeding', 'Fast or hard breathing, or sucking in at the ribs', 'Fewer wet nappies, very drowsy or hard to wake'], todo: ['Rest, fluids, and keep your child home until they are well', 'Call NURSE-ON-CALL on 1300 60 60 24 for advice, or see your GP', 'Call 000 for blue lips, severe trouble breathing or a floppy child'] },
}
const CHECK: Array<[string, string, string]> = [
  ['Heat-health warning', 'Victorian Department of Health', OFFICIAL.heat],
  ['Thunderstorm asthma forecast', 'Victorian Department of Health', OFFICIAL.asthmaForecast],
  ['Air quality now', 'EPA Victoria', OFFICIAL.airWatch],
  ['Sun protection times', 'SunSmart', OFFICIAL.sunSmart],
]
const ILLNESS_PLAIN: Record<string, string> = { influenza: 'Flu', salmonella: 'Salmonella (food poisoning)' }

export interface PlaceFigures { vegetation: number | null; heat: number | null; openSpace: number | null }
interface Props {
  parent: boolean
  locality: NeighbourhoodSearchResult
  controls: ReactNode
  env: PlaceFigures
  asthma: number | null
  prevention: PreventionContext | null
}

const span = (s: Season) => `${MONTHS[s.months[0]]} to ${MONTHS[s.months[s.months.length - 1]]}`
type Air = { data: SeasonalAir | null; loading: boolean }
type Illness = { data: SeasonalIllness | null; loading: boolean }

export default function SeasonsTool(props: Props) {
  const air = useLoad<SeasonalAir>(signal => api.getSeasonalAir(props.locality.id, signal), `air-${props.locality.id}`)
  const illness = useLoad<SeasonalIllness>(signal => api.getSeasonalIllness(signal), 'illness')
  return props.parent ? <ParentSeasons {...props} air={air} illness={illness} /> : <PractitionerSeasons {...props} air={air} illness={illness} />
}

function evidence(id: string, { env, asthma, prevention }: Props, air: Air, illness: Illness): Array<[string, string]> {
  const smokeMonth = air.data?.months.length ? [...air.data.months].sort((a, b) => b.days_above_standard - a.days_above_standard)[0] : null
  const flu = illness.data?.diseases.find(d => d.id === 'influenza')
  const fluPeak = flu ? [...flu.months].sort((a, b) => b.children_share_pct - a.children_share_pct)[0] : null
  switch (id) {
    case 'heat': return [['Hotter than surrounding land', has(env.heat) ? `+${env.heat.toFixed(1)}°C` : '—'], ['Tree and plant cover', pct(env.vegetation)]]
    case 'uv': return [['Tree and plant cover for shade', pct(env.vegetation)], ['Public open space', pct(env.openSpace)]]
    case 'asthma': return [['Children with asthma', pct(asthma, 1)]]
    case 'smoke': return [['Worst month for smoke', smokeMonth ? `${MONTHS[smokeMonth.month - 1]}, ${smokeMonth.days_above_standard} days` : '—'], ['Bushfire-prone land', pct(prevention?.bushfire?.bushfire_prone_pct, 0)]]
    case 'water': return [['Public open space', pct(env.openSpace)]]
    case 'flu': return [['Busiest month for flu in children', fluPeak ? MONTHS[fluPeak.month - 1] : '—']]
    default: return []
  }
}

function MonthBars({ values, label, now, unit, highlight, showValues }: { values: number[]; label: string; now: number; unit: string; highlight?: (v: number, i: number) => boolean; showValues?: boolean }) {
  const max = Math.max(...values, 1)
  return <div className="hp-months" role="img" aria-label={label}>
    {values.map((v, i) => <div key={i} className={[i === now ? 'is-now' : '', highlight?.(v, i) ? 'is-high' : ''].join(' ').trim() || undefined} title={`${MONTHS[i]}: ${v.toLocaleString('en-AU', { maximumFractionDigits: 1 })} ${unit}`}>
      {showValues && <em>{v > 0 ? v : ''}</em>}<span><i style={{ height: `${Math.max(3, v / max * 100)}%` }} /></span><b>{MONTHS_SHORT[i][0]}</b>
    </div>)}
  </div>
}

function Planner({ selected, onSelect, month, parent }: { selected?: string; onSelect: (s: Season) => void; month: number; parent?: boolean }) {
  return <div className="hp-cal-wrap"><table className="hp-cal">
    <thead><tr><th scope="col"><span className="kh-sr">Season</span></th>{MONTHS_SHORT.map((m, i) => <th key={m} scope="col" className={i === month ? 'is-now' : undefined} aria-label={MONTHS[i]}>{m[0]}</th>)}</tr></thead>
    <tbody>{SEASONS.map(s => <tr key={s.id} className={s.id === selected ? 'is-sel' : undefined}>
      <th scope="row"><button type="button" onClick={() => onSelect(s)}>{parent ? <span className="hp-issue"><b>{s.title}</b><small>{ISSUES[s.id].name}</small></span> : s.title}<span aria-hidden="true">›</span></button></th>
      {MONTHS.map((m, i) => <td key={m} className={[s.months.includes(i) ? 'on' : '', i === month ? 'is-now' : ''].join(' ').trim() || undefined}><span className="kh-sr">{s.months.includes(i) ? `${parent ? ISSUES[s.id].name : s.title} in ${m}` : ''}</span></td>)}
    </tr>)}</tbody>
  </table></div>
}

/* ------------------------------------------------------------------ parents */

type ParentTab = 'year' | 'air' | 'bugs' | 'check'

function ParentSeasons(props: Props & { air: Air; illness: Illness }) {
  const { locality, controls, air, illness } = props
  const month = new Date().getMonth()
  const [tab, setTab] = useState<ParentTab>('year')
  const [open, setOpen] = useState<Season | null>(null)
  const active = SEASONS.filter(s => s.months.includes(month))
  const coming = SEASONS.filter(s => !s.months.includes(month) && s.months.includes((month + 1) % 12))
  const events: CalendarEvent[] = SEASONS.map(item => { const start = nextOccurrence(item.months[0], 1); start.setDate(start.getDate() - 14); return { id: `season-${item.id}-${start.getFullYear()}`, title: `Get ready: ${item.title}`, date: start, description: `${item.actions.join('. ')}. ${item.link}` } })
  const worstAir = air.data?.months.length ? [...air.data.months].sort((a, b) => b.days_above_standard - a.days_above_standard)[0] : null
  const flu = illness.data?.diseases.find(d => d.id === 'influenza')
  const fluPeak = flu ? [...flu.months].sort((a, b) => b.children_share_pct - a.children_share_pct)[0] : null

  return <div className="kt ht vx hp kt-parent">
    <Hero parent title="Stay a season ahead" text="What each time of year brings where you live, and simple steps to get ready." />
    <div className="kt-filters">{controls}<p>Season months are for Melbourne. Local figures are for {locality.name}.</p></div>

    <Summary id="hp-now" eyebrow={`This month · ${MONTHS[month]}`} actions={<>
      <button type="button" className="kh-btn primary" onClick={() => downloadFile(`vkinder-seasons-${slug(locality.name)}.ics`, buildCalendar(events), 'text/calendar')}>Add season reminders</button>
      {active[0] && <button type="button" className="kh-btn" onClick={() => setOpen(active[0])}>What to do now</button>}
    </>}>
      <p className="vx-big">{active.map(s => ISSUES[s.id].name).join(' · ') || 'A quieter month'}</p>
      {coming.length > 0 && <p className="vx-when">Coming next month: {coming.map(s => ISSUES[s.id].name.toLowerCase()).join(', ')}</p>}
      <p className="vx-lead">Reminders arrive two weeks before each season starts.</p>
    </Summary>

    <section className="kt-card kt-cream vx-panel" aria-label="Season details">
      <Tabs label="Season details" value={tab} onChange={setTab} tabs={[['year', 'Year planner'], ['air', 'Air near you'], ['bugs', 'Coughs and bugs'], ['check', 'Check today']]} />
      <TabPanel tab={tab}>
        {tab === 'year' && <>
          <p className="kt-sub">Shaded months are when each one matters. Select a season for what to do.</p>
          <Planner parent month={month} onSelect={setOpen} />
        </>}
        {tab === 'air' && (air.data?.station ? <>
          <p className="hp-say">{worstAir ? <><b>{MONTHS[worstAir.month - 1]}</b> has had the most smoky or polluted days near you: <b>{worstAir.days_above_standard} days</b> over the safe level since {air.data.station.first_year}.</> : null}</p>
          <MonthBars values={MONTHS.map((_, i) => air.data!.months.find(r => r.month === i + 1)?.days_above_standard ?? 0)} now={month} unit="days over the safe level" showValues label="Days over the safe level for fine particles, by month" highlight={v => v > 0} />
          <p className="ht-care-note">Days when fine-particle pollution was over the daily safe level, {air.data.station.first_year}–{air.data.station.last_year}, at the {air.data.station.name} monitor {air.data.station.distance_km.toFixed(1)} km away.</p>
          <p className="kt-limit">Measured at the nearest monitor, not in your street. On smoky days check EPA AirWatch.</p>
        </> : <p className="kt-empty">{air.loading ? 'Loading…' : 'No air monitor is close enough to show.'}</p>)}
        {tab === 'bugs' && (flu ? <>
          <p className="hp-say">Flu in Victorian children peaks in <b>{fluPeak ? MONTHS[fluPeak.month - 1] : ''}</b>. About <b>{fluPeak ? Math.round(fluPeak.children_share_pct) : ''} in every 100</b> of the year’s cases come in that month.</p>
          <MonthBars values={flu.months.map(m => m.children_share_pct)} now={month} unit="% of the year’s flu cases in children" label="Share of the year’s flu cases in children by month" highlight={v => v >= 10} />
          <div className="ht-actions"><a className="kh-btn primary" href={OFFICIAL.rsv} target="_blank" rel="noreferrer">Flu and RSV protection</a><span className="ht-care-note">Flu vaccine is best in April or May, before the peak.</span></div>
          {illness.data?.diseases.filter(d => d.id !== 'influenza').map(d => { const peak = [...d.months].sort((a, b) => b.children_share_pct - a.children_share_pct)[0]; return <p key={d.id} className="ht-care-note">{ILLNESS_PLAIN[d.id] ?? d.label} is most common in {MONTHS[peak.month - 1]}, in the warmer months. Keep food cold and wash hands before eating.</p> })}
          <p className="kt-limit">Counts of laboratory-confirmed cases across Victoria, {flu.reference_years.replace(/-/g, '–')}. They reflect testing as well as illness.</p>
        </> : <p className="kt-empty">{illness.loading ? 'Loading…' : 'Illness patterns can’t be shown right now.'}</p>)}
        {tab === 'check' && <ul className="hp-links">{CHECK.map(([label, by, href]) => <li key={label}><a href={href} target="_blank" rel="noreferrer"><b>{label}</b><small>{by}</small></a></li>)}</ul>}
      </TabPanel>
    </section>

    <footer className="kt-foot"><p>EPA Victoria air monitoring; Victorian notifiable disease data; Victorian Department of Health, Better Health Channel, Asthma Australia, SunSmart and Royal Life Saving guidance; 2018 environment measures for {locality.name}. General guidance, not medical advice for your child.</p></footer>

    {open && <Dialog title={open.title} onClose={() => setOpen(null)}>
      <p className="vx-when">{ISSUES[open.id].context} · {span(open)}</p>
      <p>{open.why}</p>
      <dl className="vx-facts">{evidence(open.id, props, air, illness).flatMap(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}</dl>
      <p className="vx-eyebrow">Get ready</p>
      <ol className="ht-questions">{open.actions.map((a, i) => <li key={a}><span aria-hidden="true">{i + 1}</span>{a}</li>)}</ol>
      <p className="vx-eyebrow">Signs to watch for</p>
      <ul className="hp-signs">{ISSUES[open.id].signs.map(a => <li key={a}>{a}</li>)}</ul>
      <p className="vx-eyebrow">What to do</p>
      <ol className="ht-questions">{ISSUES[open.id].todo.map((a, i) => <li key={a}><span aria-hidden="true">{i + 1}</span>{a}</li>)}</ol>
      <p className="kt-limit">General guidance, not medical advice. If you are worried, call NURSE-ON-CALL on 1300 60 60 24. In an emergency call 000.</p>
      <div className="ht-actions"><a className="kh-btn primary" href={open.link} target="_blank" rel="noreferrer">{open.linkLabel}</a></div>
    </Dialog>}
  </div>
}

/* ------------------------------------------------------------------ practitioners */

type PracTab = 'calendar' | 'notifications' | 'air' | 'place'

function PractitionerSeasons(props: Props & { air: Air; illness: Illness }) {
  const { locality, controls, env, prevention, air, illness } = props
  const month = new Date().getMonth()
  const [tab, setTab] = useState<PracTab>('calendar')
  const [open, setOpen] = useState<Season | null>(null)
  const flu = illness.data?.diseases.find(d => d.id === 'influenza')
  const fluPeak = flu ? [...flu.months].sort((a, b) => b.children_average - a.children_average)[0] : null
  const winter = flu ? flu.months.filter(m => m.month >= 5 && m.month <= 9).reduce((s, m) => s + m.children_share_pct, 0) : null
  const worstAir = air.data?.months.length ? [...air.data.months].sort((a, b) => b.days_above_standard - a.days_above_standard)[0] : null
  const t = prevention?.transport

  return <div className="kt ht vx hp kt-prac">
    <Hero parent={false} title="Seasonal prevention" text="Month-by-month patterns in Victorian children’s notifications and local air quality, with the place features that shape seasonal risk." />
    <div className="kt-filters">{controls}<p>Notifications: Victoria · Air: nearest EPA monitor · Place: SA2</p></div>

    {fluPeak && <Summary id="hp-s-kf" eyebrow="Key finding">
      <p className="vx-lead"><b>{MONTHS[fluPeak.month - 1]}</b> averages <b>{Math.round(fluPeak.children_average).toLocaleString('en-AU')}</b> influenza notifications in children 0–14 ({fluPeak.children_share_pct.toFixed(1)}% of the year); May to September holds <b>{winter?.toFixed(0)}%</b>.</p>
      <details className="vx-more"><summary>More findings</summary><ul className="kt-findings kt-one">
        {worstAir && air.data?.station && <li>{MONTHS[worstAir.month - 1]} had {worstAir.days_above_standard} days above the PM2.5 standard at {air.data.station.name} ({air.data.station.first_year}–{air.data.station.last_year}); peak {worstAir.highest_daily_ug_m3} µg/m³.</li>}
        {has(env.heat) && <li>Urban heat effect +{env.heat.toFixed(1)}°C with {pct(env.vegetation)} tree and plant cover.</li>}
        {has(t?.traffic_intensity_percentile) && <li>Declared-road traffic at the {Math.round(t!.traffic_intensity_percentile!)}th percentile of {t!.sa2_compared} SA2s.</li>}
      </ul></details>
    </Summary>}

    <section className="kt-card kt-cream vx-panel" aria-label="Seasonal prevention details">
      <Tabs label="Seasonal prevention details" value={tab} onChange={setTab} tabs={[['calendar', 'Prevention calendar'], ['notifications', 'Notifications'], ['air', 'Air quality'], ['place', 'Place context']]} />
      <TabPanel tab={tab}>
        {tab === 'calendar' && <>
          <p className="kt-sub">Risk windows from Victorian guidance. Select a row for actions and local evidence.</p>
          <Planner month={month} onSelect={setOpen} />
        </>}
        {tab === 'notifications' && (illness.data ? <>
          <p className="kt-sub">Share of each year’s notifications in Victorian children 0–14 by month, {illness.data.diseases[0]?.reference_years.replace(/-/g, '–')}.</p>
          <div className="hp-multiples">{illness.data.diseases.map(d => { const peak = [...d.months].sort((a, b) => b.children_share_pct - a.children_share_pct)[0]; return <div key={d.id}>
            <p className="hp-mult-head"><b>{d.label}</b><span>Peak {MONTHS[peak.month - 1]}, {peak.children_share_pct.toFixed(1)}%</span></p>
            <MonthBars values={d.months.map(m => m.children_share_pct)} now={month} unit="% of the year" label={`${d.label}: share of the year by month`} highlight={v => v >= 100 / 12 * 1.2} />
          </div> })}</div>
          <details className="vx-more"><summary>Show monthly counts</summary>
          <div className="hp-cal-wrap"><table className="kt-table hp-table hp-notes"><thead><tr><th scope="col">Month</th>{illness.data.diseases.map(d => <th key={d.id} scope="col">{d.label}</th>)}</tr></thead>
            <tbody>{MONTHS.map((m, i) => <tr key={m} className={i === month ? 'is-now' : undefined}><th scope="row">{m}</th>{illness.data!.diseases.map(d => { const r = d.months.find(x => x.month === i + 1); return <td key={d.id}>{r ? Math.round(r.children_average).toLocaleString('en-AU') : '—'}<span>{r ? `${r.children_share_pct.toFixed(1)}%` : ''}</span></td> })}</tr>)}</tbody></table></div>
          </details>
          <p className="kt-limit">Statewide notifications; no SA2 or PHA breakdown. Counts follow testing practice as well as disease, and 2020–2021 are excluded.</p>
        </> : <p className="kt-empty">{illness.loading ? 'Loading…' : 'Notification data is unavailable.'}</p>)}
        {tab === 'air' && (air.data?.station ? <>
          <p className="kt-sub">{air.data.station.pollutant} at {air.data.station.name}, {air.data.station.distance_km.toFixed(1)} km away, {air.data.station.first_year}–{air.data.station.last_year}. Daily standard {air.data.station.standard_ug_m3} µg/m³.</p>
          <MonthBars values={MONTHS.map((_, i) => air.data!.months.find(r => r.month === i + 1)?.days_above_standard ?? 0)} now={month} unit="days above the standard" showValues label="Days above the PM2.5 standard by month" highlight={v => v > 0} />
          <p className="ht-care-note">Days above the daily standard, all years combined.</p>
          <details className="vx-more"><summary>Show monthly levels</summary>
          <div className="hp-cal-wrap"><table className="kt-table hp-table"><thead><tr><th scope="col">Month</th><th scope="col">Mean daily</th><th scope="col">Days above</th><th scope="col">Highest day</th></tr></thead>
            <tbody>{air.data.months.map(r => <tr key={r.month} className={r.month - 1 === month ? 'is-now' : undefined}><th scope="row">{MONTHS[r.month - 1]}</th><td>{r.mean_daily_ug_m3.toFixed(1)}</td><td>{r.days_above_standard}</td><td className="kt-small">{r.highest_daily_ug_m3} µg/m³, {new Date(r.highest_daily_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td></tr>)}</tbody></table></div>
          </details>
          <p className="kt-limit">Single monitor outside the SA2. Day counts are totals across all years with valid data.</p>
        </> : <p className="kt-empty">{air.loading ? 'Loading…' : 'No monitor within range.'}</p>)}
        {tab === 'place' && <>
          <table className="kt-table"><tbody>
            <tr><th scope="row"><b>Urban heat effect</b><span>Land surface above non-urban baseline, 2018</span></th><td>{has(env.heat) ? `+${env.heat.toFixed(1)}°C` : '—'}</td></tr>
            <tr><th scope="row"><b>Tree and plant cover</b><span>Share of SA2 area, 2018</span></th><td>{pct(env.vegetation)}</td></tr>
            <tr><th scope="row"><b>Public open space</b><span>Share of SA2 area, 2018</span></th><td>{pct(env.openSpace)}</td></tr>
            <tr><th scope="row"><b>Declared-road traffic</b><span>Percentile of {t?.sa2_compared ?? '—'} SA2s, 2019</span></th><td>{has(t?.traffic_intensity_percentile) ? `${Math.round(t!.traffic_intensity_percentile!)}th` : '—'}</td></tr>
            <tr><th scope="row"><b>Bushfire-prone land</b><span>Designated share of SA2</span></th><td>{pct(prevention?.bushfire?.bushfire_prone_pct, 0)}</td></tr>
          </tbody></table>
          <p className="kt-limit">These describe the area, not exposure in any home. Environment measures are from 2018 and traffic from 2019.</p>
        </>}
      </TabPanel>
    </section>

    <footer className="kt-foot"><p>Victorian notifiable disease surveillance; EPA Victoria air monitoring; 2018 environment measures; VicRoads traffic 2019; bushfire-prone area mapping. Area-level evidence only; not for individual diagnosis. {locality.name}.</p></footer>

    {open && <Dialog title={open.title} onClose={() => setOpen(null)}>
      <p className="vx-when">{span(open)}</p>
      <p>{open.why}</p>
      <dl className="vx-facts">{evidence(open.id, props, air, illness).flatMap(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}</dl>
      <p className="vx-eyebrow">Messages for families</p>
      <ol className="ht-questions">{open.actions.map((a, i) => <li key={a}><span aria-hidden="true">{i + 1}</span>{a}</li>)}</ol>
      <div className="ht-actions"><a className="kh-btn primary" href={open.link} target="_blank" rel="noreferrer">{open.linkLabel}</a></div>
    </Dialog>}
  </div>
}
