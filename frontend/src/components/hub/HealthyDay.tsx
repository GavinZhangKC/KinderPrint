/**
 * Healthy day: a guided simulation for parents.
 *
 * The parent describes a typical weekday. It is compared with the Australian guidelines for
 * the selected age band, and the two changes with the largest health payoff are ranked and
 * explained. "Show my day with these changes" applies them so the before and after can be seen.
 *
 * Guideline values (all verified against the published sources):
 * - 24-Hour Movement Guidelines, birth to 5: 180 min physical activity incl. 60 min energetic
 *   (3–5 yrs); sedentary screen time ≤ 1 h (none under 2); not restrained > 1 h at a time;
 *   sleep 10–13 h (3–5 yrs) or 11–14 h incl. naps (1–2 yrs).
 * - 24-Hour Movement Guidelines, 5–17: ≥ 60 min moderate-to-vigorous activity; ≤ 2 h
 *   recreational screens; 9–11 h sleep (5–13 yrs); no screens in the hour before bed.
 * - NHMRC Nutrient Reference Values, fluids: 1–3 yrs 1.0 L (~4 cups), 4–8 yrs 1.2 L (~5 cups),
 *   9–13 yrs 1.4–1.6 L (~6 cups).
 * - Australian Dietary Guidelines serves; cow's milk up to 500 ml (2 cups) a day for ages 1–5.
 * This is area- and guideline-level guidance, not an assessment of an individual child.
 */
import { useMemo, useState, type CSSProperties } from 'react'

import { OFFICIAL } from '../health/healthPlanning'
import { Card, useStored } from './shared'
import './HealthyDay.css'

export type Band = 0 | 1 | 2
export const bandOf = (age: string): Band => age.startsWith('0') ? 0 : age.startsWith('5') ? 1 : 2

interface Guide {
  sleep: [number, number]; sleepNote: string
  activity: number; activityAim: string
  screens: number; screensAim: string
  veg: number; fruit: number; plateAim: string
  water: number
  day: GuideDay
}
export interface GuideDay { bed: number; wake: number; nap: number; play: Array<[number, number]>; meals: number[]; water: number[]; screens?: Array<[number, number]> }

export const GUIDES: Record<Band, Guide> = {
  0: { sleep: [10, 13], sleepNote: '10–13 h for ages 3–5; 11–14 h including naps for ages 1–2',
    activity: 180, activityAim: '3 h, including 1 h energetic', screens: 60, screensAim: '1 h or less, none under 2',
    veg: 2.5, fruit: 1, plateAim: '2½ veg · 1 fruit', water: 4,
    day: { bed: 19.5, wake: 6.75, nap: 90, play: [[8.5, 9.5], [10.25, 11], [15.5, 16.5]], meals: [7.25, 10, 12.25, 15.25, 17.5], water: [8, 11.25, 14.75, 17.25] } },
  1: { sleep: [9, 11], sleepNote: '9–11 h uninterrupted for ages 5–13',
    activity: 60, activityAim: '60 min that leaves them puffed', screens: 120, screensAim: '2 h or less outside school work',
    veg: 4.5, fruit: 1.5, plateAim: '4½ veg · 1½ fruit', water: 5,
    day: { bed: 20.25, wake: 7, nap: 0, play: [[8.25, 8.5], [10.75, 11.25], [12.75, 13.25], [15.5, 16.5]], meals: [7.25, 10.5, 12.75, 15.25, 18], water: [7.5, 10.75, 12.75, 15.5, 18] } },
  2: { sleep: [9, 11], sleepNote: '9–11 h for ages 5–13; 8–10 h from 14',
    activity: 60, activityAim: '60 min, vigorous on 3 days a week', screens: 120, screensAim: '2 h or less outside school work',
    veg: 5, fruit: 2, plateAim: '5 veg · 2 fruit', water: 6,
    day: { bed: 21.25, wake: 7, nap: 0, play: [[8.25, 8.5], [12.75, 13.25], [16, 17]], meals: [7.25, 10.5, 13, 15.75, 18.25], water: [7.5, 10.5, 13, 15.25, 17, 19] } },
}

interface DayInput { bed: number; wake: number; nap: number; active: number; energetic: number; screens: number; restrained: number; bedScreens: boolean; veg: number; fruit: number; milk: number; water: number; sweet: boolean }

const DEFAULTS: Record<Band, DayInput> = {
  0: { bed: 20.5, wake: 6.5, nap: 60, active: 120, energetic: 30, screens: 120, restrained: 45, bedScreens: false, veg: 2.5, fruit: 1, milk: 3, water: 2, sweet: true },
  1: { bed: 21, wake: 7, nap: 0, active: 40, energetic: 0, screens: 180, restrained: 0, bedScreens: true, veg: 4.5, fruit: 1.5, milk: 0, water: 3, sweet: true },
  2: { bed: 22, wake: 7, nap: 0, active: 45, energetic: 0, screens: 240, restrained: 0, bedScreens: true, veg: 5, fruit: 2, milk: 0, water: 4, sweet: true },
}

export const clock = (hour: number) => { const h = ((hour % 24) + 24) % 24; const whole = Math.floor(h); return `${String(whole).padStart(2, '0')}:${String(Math.round((h - whole) * 60)).padStart(2, '0')}` }
export const duration = (minutes: number) => minutes >= 60 ? `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${Math.round(minutes % 60)} min` : ''}` : `${Math.round(minutes)} min`
const sleepHours = (d: Pick<DayInput, 'bed' | 'wake' | 'nap'>) => ((d.wake - d.bed + 24) % 24) + d.nap / 60

/* ------------------------------------------------------------------ dial */

const point = (hour: number, radius: number): [number, number] => { const a = hour / 24 * 2 * Math.PI - Math.PI / 2; return [200 + radius * Math.cos(a), 200 + radius * Math.sin(a)] }
function arc(from: number, to: number, radius: number) {
  const end = to < from ? to + 24 : to
  const [x1, y1] = point(from, radius), [x2, y2] = point(end, radius)
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${radius} ${radius} 0 ${end - from > 12 ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}
function hatch(from: number, to: number, inner: number, outer: number, step = 0.08) {
  const end = to < from ? to + 24 : to
  const lines: string[] = []
  for (let h = from; h < end; h += step) { const [a, b] = point(h, inner), [c, d] = point(h, outer); lines.push(`M${a.toFixed(1)} ${b.toFixed(1)}L${c.toFixed(1)} ${d.toFixed(1)}`) }
  return lines.join('')
}

/** A 24-hour clock of a child's day: sleep (navy), active play (teal), screens (grey), meals (orange), drinks (blue). */
export function DayDial({ day, centre, caption, label }: { day: GuideDay; centre: string; caption: string; label: string }) {
  const ticks = Array.from({ length: 96 }, (_, i) => { const major = i % 4 === 0; const [a, b] = point(i / 4, 184), [c, d] = point(i / 4, major ? 193 : 188); return { major, d: `M${a.toFixed(1)} ${b.toFixed(1)}L${c.toFixed(1)} ${d.toFixed(1)}` } })
  return <svg className="kd-dial" viewBox="-26 -26 452 452" role="img" aria-label={label}>
    {[184, 112, 86].map(r => <circle key={r} cx="200" cy="200" r={r} className="kd-orbit" />)}
    <path d={ticks.filter(t => !t.major).map(t => t.d).join('')} className="kd-tick" />
    <path d={ticks.filter(t => t.major).map(t => t.d).join('')} className="kd-tick major" />
    <path d={arc(6.5, 19.75, 199)} className="kd-sun" />
    <path d={hatch(day.bed, day.wake, 120, 176)} className="kd-sleep" />
    {day.nap > 0 && <path d={hatch(13, 13 + day.nap / 60, 120, 176)} className="kd-sleep" />}
    {(day.screens ?? []).map(([a, b]) => <path key={a} d={hatch(a, b, 126, 170, 0.05)} className="kd-screen" />)}
    {day.play.map(([a, b]) => Array.from({ length: 6 }, (_, j) => <path key={`${a}-${j}`} d={arc(a, b, 126 + j * 9)} className="kd-play" style={{ strokeWidth: 3.4 - j * 0.3 }} />))}
    {day.meals.map(m => { const [x, y] = point(m, 112); return <circle key={m} cx={x} cy={y} r="6" className="kd-meal" /> })}
    {day.water.map(m => { const [x, y] = point(m, 86); return <circle key={m} cx={x} cy={y} r="4.6" className="kd-water" /> })}
    {([['00', 0], ['06', 6], ['12', 12], ['18', 18]] as Array<[string, number]>).map(([t, h]) => { const [x, y] = point(h, 214); return <text key={t} x={x} y={y + 4.5} textAnchor="middle" className="kd-hour">{t}</text> })}
    <text x="200" y="206" textAnchor="middle" className="kd-centre">{centre}</text>
    <text x="200" y="230" textAnchor="middle" className="kd-caption">{caption}</text>
  </svg>
}

export function DialLegend({ screens = false }: { screens?: boolean }) {
  return <div className="kd-legend" aria-hidden="true">
    <span><i className="sleep" />Sleep</span><span><i className="play" />Active play</span>{screens && <span><i className="screen" />Screens</span>}<span><i className="meal" />Meals</span><span><i className="water" />Drinks</span>
  </div>
}

/* ------------------------------------------------------------------ guideline checks */

interface Check { key: string; label: string; value: string; aim: string; ok: boolean; gap: number; scale: [number, number, number, number, number]; why: string; fix: () => { change: string; how: string; apply: (d: DayInput) => DayInput } }

function checks(d: DayInput, band: Band): Check[] {
  const g = GUIDES[band]
  const sleep = sleepHours(d)
  const [lo, hi] = g.sleep
  const list: Check[] = []
  const earlier = Math.max(0.25, Math.ceil((lo - sleep) * 4) / 4)
  list.push({ key: 'sleep', label: 'Sleep', value: `${Math.round(sleep * 10) / 10} h`, aim: `${lo}–${hi} h`, ok: sleep >= lo - 0.01 && sleep <= hi + 0.01, gap: sleep < lo ? (lo - sleep) / lo * 1.2 : sleep > hi ? (sleep - hi) / hi : 0, scale: [6, 15, lo, hi, sleep],
    why: 'Enough sleep supports attention, mood, learning and a healthy weight.',
    fix: () => ({ change: `Bedtime ${clock(d.bed)} → ${clock(d.bed - earlier)}`, how: `Move bedtime ${duration(earlier * 60)} earlier in 15-minute steps over a week, and keep the same wake-up time.`, apply: x => ({ ...x, bed: d.bed - earlier }) }) })
  if (band === 0) list.push({ key: 'active', label: 'Active play', value: duration(d.active), aim: g.activityAim, ok: d.active >= 180 && d.energetic >= 60, gap: Math.max((180 - d.active) / 180, (60 - d.energetic) / 60, 0) * 1.9, scale: [0, 300, 180, 300, d.active],
    why: 'Builds strong bones, muscles and motor skills, and lowers the risk of unhealthy weight gain.',
    fix: () => ({ change: `${duration(d.active)} → ${duration(Math.max(180, d.active))}${d.energetic < 60 ? ', 1 h energetic' : ''}`, how: `${d.active < 180 ? `Add ${duration(180 - d.active)} of play: a park trip in the morning and another after 3:30 pm.` : 'Keep the time, but make it more energetic.'}${d.energetic < 60 ? ' Make an hour of it running, climbing or chasing.' : ''}`, apply: x => ({ ...x, active: Math.max(180, d.active), energetic: Math.max(60, d.energetic) }) }) })
  else list.push({ key: 'active', label: 'Active minutes', value: duration(d.active), aim: g.activityAim, ok: d.active >= 60, gap: Math.max(0, (60 - d.active) / 60) * 2.4, scale: [0, 150, 60, 150, d.active],
    why: 'Daily activity builds fitness, bone strength and mood, and lowers the risk of unhealthy weight gain.',
    fix: () => ({ change: `${duration(d.active)} → 60 min`, how: `Add ${duration(60 - d.active)} that gets them puffed: walk or ride to school, or sport after school.`, apply: x => ({ ...x, active: 60 }) }) })
  list.push({ key: 'screens', label: 'Screens', value: duration(d.screens), aim: g.screensAim, ok: d.screens <= g.screens, gap: Math.max(0, (d.screens - g.screens) / g.screens) * 0.8, scale: [0, 360, 0, g.screens, d.screens],
    why: band === 0 ? 'More screen time at this age is linked with later language development and poorer sleep.' : 'More than 2 hours a day is linked with poorer sleep, fitness and wellbeing.',
    fix: () => ({ change: `${duration(d.screens)} → ${duration(g.screens)}`, how: `Cut ${duration(d.screens - g.screens)}: no screens at meals or in the car, and swap one show for time outdoors.`, apply: x => ({ ...x, screens: g.screens }) }) })
  if (band === 0) list.push({ key: 'restrained', label: 'Strapped in', value: duration(d.restrained), aim: 'under 1 h at a time', ok: d.restrained <= 60, gap: Math.max(0, (d.restrained - 60) / 60) * 0.6, scale: [0, 180, 0, 60, d.restrained],
    why: 'Long stretches in a pram, high chair or car seat take the place of moving.',
    fix: () => ({ change: `${duration(d.restrained)} → 1 h at most`, how: 'Break long trips with a 10-minute run-around stop.', apply: x => ({ ...x, restrained: 60 }) }) })
  else list.push({ key: 'bedScreens', label: 'Screen-free before bed', value: d.bedScreens ? 'No' : 'Yes', aim: 'the hour before bed', ok: !d.bedScreens, gap: d.bedScreens ? 0.7 : 0, scale: [0, 1, 0, 0.15, d.bedScreens ? 1 : 0],
    why: 'Screens in the hour before bed delay sleep and shorten it.',
    fix: () => ({ change: 'Devices out of the bedroom', how: 'Charge phones and tablets outside the bedroom and switch screens off an hour before bed.', apply: x => ({ ...x, bedScreens: false }) }) })
  list.push({ key: 'plate', label: 'Veg & fruit', value: `${d.veg} · ${d.fruit}`, aim: g.plateAim, ok: d.veg >= g.veg && d.fruit >= g.fruit, gap: Math.max(0, (g.veg - d.veg) / g.veg, (g.fruit - d.fruit) / g.fruit) * 0.9, scale: [0, 6, g.veg, 6, d.veg],
    why: 'Fibre and vitamins for growth. Eating habits set now tend to last.',
    fix: () => ({ change: `${d.veg} → ${Math.max(d.veg, g.veg)} veg serves${d.fruit < g.fruit ? `, ${g.fruit} fruit` : ''}`, how: `${d.veg < g.veg ? `Add ${g.veg - d.veg} serve of vegetables: grated carrot or zucchini in sauces counts, and veg sticks for afternoon tea.` : ''}${d.fruit < g.fruit ? ' Add a piece of fruit to the lunchbox.' : ''}`.trim(), apply: x => ({ ...x, veg: Math.max(d.veg, g.veg), fruit: Math.max(d.fruit, g.fruit) }) }) })
  if (band === 0) list.push({ key: 'drinks', label: 'Drinks', value: `${d.milk} cups milk`, aim: 'milk ≤ 2 cups · no sweet drinks', ok: d.milk <= 2 && !d.sweet, gap: (Math.max(0, d.milk - 2) / 2 + (d.sweet ? 0.6 : 0)) * 1.1, scale: [0, 5, 0, 2, d.milk],
    why: 'Too much milk lowers iron and the appetite for iron-rich food. Juice and cordial cause tooth decay.',
    fix: () => ({ change: [d.milk > 2 ? `${d.milk} → 2 cups milk` : '', d.sweet ? 'juice → water' : ''].filter(Boolean).join(' · '), how: `${d.milk > 2 ? `Swap ${d.milk - 2} cup of milk for water. ` : ''}${d.sweet ? 'Offer water and whole fruit instead of juice.' : ''}`.trim(), apply: x => ({ ...x, milk: Math.min(2, d.milk), sweet: false }) }) })
  else list.push({ key: 'drinks', label: 'Drinks', value: `${d.water} cups water`, aim: `${g.water} cups · no sweet drinks`, ok: d.water >= g.water && !d.sweet, gap: Math.max(0, g.water - d.water) / g.water + (d.sweet ? 0.6 : 0), scale: [0, 8, g.water, 8, d.water],
    why: 'Sweet drinks are the biggest source of added sugar for children, linked with tooth decay and weight gain.',
    fix: () => ({ change: `${d.water} → ${Math.max(g.water, d.water)} cups${d.sweet ? ' · no soft drink' : ''}`, how: `Send a filled bottle to school and refill it at home${d.sweet ? '. Keep soft drink and cordial for parties' : ''}.`, apply: x => ({ ...x, water: Math.max(g.water, d.water), sweet: false }) }) })
  return list
}

function dayFor(d: DayInput, band: Band): GuideDay {
  const g = GUIDES[band].day
  const slots: Array<[number, number]> = band === 0 ? [[8.5, 1.6], [15.25, 1.6], [10.5, 0.8], [17, 0.5]] : [[8.25, 0.25], [15.5, 1.25], [12.75, 0.5], [17, 0.5]]
  let left = d.active / 60
  const play: Array<[number, number]> = []
  for (const [start, cap] of slots) { if (left <= 0) break; const take = Math.min(cap, left); play.push([start, start + take]); left -= take }
  const end = d.bedScreens || band === 0 ? d.bed : d.bed - 1
  const cups = band === 0 ? Math.max(1, 6 - d.milk) : d.water
  const water = Array.from({ length: Math.min(8, Math.max(0, cups)) }, (_, i) => 7.5 + i * (11.5 / Math.max(1, cups - 1)))
  return { bed: d.bed, wake: d.wake, nap: band === 0 ? d.nap : 0, play, meals: g.meals, water, screens: d.screens > 0 ? [[end - d.screens / 60, end]] : [] }
}

/* ------------------------------------------------------------------ page */

function Range({ id, label, value, min, max, step, onChange, show }: { id: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; show: string }) {
  return <div className="kd-row"><label htmlFor={id}>{label}</label><output htmlFor={id}>{show}</output>
    <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{ '--kd-fill': `${(value - min) / (max - min) * 100}%` } as CSSProperties} /></div>
}
function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return <div className="kd-row inline"><span>{label}</span><span className="kd-step"><button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => onChange(Math.max(0, value - 0.5))}>−</button><b aria-live="polite">{value}</b><button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(Math.min(8, value + 0.5))}>+</button></span></div>
}
function YesNo({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <div className="kd-row inline"><span>{label}</span><span className="kd-yn" role="group" aria-label={label}><button type="button" aria-pressed={value} onClick={() => onChange(true)}>Yes</button><button type="button" aria-pressed={!value} onClick={() => onChange(false)}>No</button></span></div>
}

const TIMES_BED = Array.from({ length: 19 }, (_, i) => 18.5 + i * 0.25)
const TIMES_WAKE = Array.from({ length: 13 }, (_, i) => 5.5 + i * 0.25)

export default function HealthyDay({ age }: { age: string }) {
  const band = bandOf(age)
  const g = GUIDES[band]
  const [saved, setSaved] = useStored<Partial<Record<Band, DayInput>>>('kinderprint-healthy-day-v1', {})
  const d = saved[band] ?? DEFAULTS[band]
  const [from, setFrom] = useState<number | null>(null)
  const set = (next: DayInput) => setSaved(current => ({ ...current, [band]: next }))
  const patch = (part: Partial<DayInput>) => { setFrom(null); set({ ...d, ...part }) }

  const list = useMemo(() => checks(d, band), [d, band])
  const met = list.filter(c => c.ok).length
  const top = list.filter(c => !c.ok).sort((a, b) => b.gap - a.gap).slice(0, 2)
  const fixes = top.map(c => ({ check: c, fix: c.fix() }))
  const after = fixes.reduce((acc, f) => f.fix.apply(acc), d)
  const metAfter = checks(after, band).filter(c => c.ok).length
  const sleep = sleepHours(d)
  const headline = from !== null ? `Up from ${from} to ${met}${met < 6 ? `. ${6 - met === 1 ? 'One' : 6 - met} more to go.` : '. That’s a guideline day.'}`
    : met === 6 ? 'All six guidelines met. Keep this routine.' : met >= 4 ? 'Two small changes would close most of the gap.' : 'A few changes would make a real difference.'

  return <div className="kd-page">
    <Card className="kd-inputs" title="Your child’s typical day" sub={`A normal weekday for a ${age.replace(' years', '')} year old. Saved on this device only.`}>
      <fieldset><legend>Sleep <b>{Math.round(sleep * 10) / 10} h</b></legend>
        <div className="kd-row inline"><label htmlFor="kd-bed">Bedtime</label><select id="kd-bed" value={d.bed} onChange={e => patch({ bed: Number(e.target.value) })}>{TIMES_BED.map(h => <option key={h} value={h}>{clock(h)}</option>)}</select></div>
        <div className="kd-row inline"><label htmlFor="kd-wake">Wakes up</label><select id="kd-wake" value={d.wake} onChange={e => patch({ wake: Number(e.target.value) })}>{TIMES_WAKE.map(h => <option key={h} value={h}>{clock(h)}</option>)}</select></div>
        {band === 0 && <Range id="kd-nap" label="Day nap" value={d.nap} min={0} max={180} step={15} onChange={v => patch({ nap: v })} show={duration(d.nap)} />}
      </fieldset>
      <fieldset><legend>Moving</legend>
        <Range id="kd-active" label={band === 0 ? 'Active play, all day' : 'Active minutes that leave them puffed'} value={d.active} min={0} max={band === 0 ? 300 : 150} step={5} onChange={v => patch({ active: v, energetic: Math.min(d.energetic, v) })} show={duration(d.active)} />
        {band === 0 && <Range id="kd-energetic" label="…of which energetic (running, climbing)" value={d.energetic} min={0} max={150} step={5} onChange={v => patch({ energetic: v })} show={duration(d.energetic)} />}
        {band === 0 && <Range id="kd-restrained" label="Longest time strapped in (pram, car seat)" value={d.restrained} min={0} max={180} step={15} onChange={v => patch({ restrained: v })} show={duration(d.restrained)} />}
      </fieldset>
      <fieldset><legend>Screens</legend>
        <Range id="kd-screens" label={band === 0 ? 'Screen time' : 'Recreational screen time'} value={d.screens} min={0} max={360} step={15} onChange={v => patch({ screens: v })} show={duration(d.screens)} />
        {band > 0 && <YesNo label="Screens in the hour before bed?" value={d.bedScreens} onChange={v => patch({ bedScreens: v })} />}
      </fieldset>
      <fieldset><legend>Food &amp; drinks</legend>
        <Stepper label="Vegetable serves" value={d.veg} onChange={v => patch({ veg: v })} />
        <Stepper label="Fruit serves" value={d.fruit} onChange={v => patch({ fruit: v })} />
        {band === 0 ? <Stepper label="Cups of milk" value={d.milk} onChange={v => patch({ milk: v })} /> : <Stepper label="Cups of water" value={d.water} onChange={v => patch({ water: v })} />}
        <YesNo label="Juice, cordial or soft drink most days?" value={d.sweet} onChange={v => patch({ sweet: v })} />
      </fieldset>
    </Card>

    <div className="kd-result">
      <Card title="How the day measures up" sub={`Compared with the Australian guidelines for ${age}.`}>
        <div className="kd-score">
          <DayDial day={dayFor(d, band)} centre={`${Math.round(sleep * 10) / 10} h`} caption="ASLEEP" label={`Your child's day on a 24-hour clock. ${met} of 6 guidelines met.`} />
          <div className="kd-verdict" aria-live="polite">
            <span className="kh-eyebrow">Guidelines met</span>
            <strong>{met}<small>of 6</small></strong>
            <h3>{headline}</h3>
            <DialLegend screens />
          </div>
        </div>
        <ul className="kd-checks">{list.map(c => <li key={c.key} className={c.ok ? 'ok' : 'no'}>
          <span className="kd-status">{c.ok ? 'On track' : 'Room to improve'}</span>
          <b>{c.label}</b>
          <em>{c.value}</em>
          <small>Aim: {c.aim}</small>
        </li>)}</ul>
      </Card>

      <section className="kd-swaps" aria-label="Suggested changes">
        {fixes.length === 0 ? <>
          <span className="kh-eyebrow">Your plan</span>
          <h3>Nothing to change right now.</h3>
          <p>Check again when the season changes: summer heat and winter illness both shift routines.</p>
          <button type="button" className="kd-ghost" onClick={() => { setFrom(null); set(DEFAULTS[band]) }}>Start again with a typical day</button>
        </> : <>
          <span className="kh-eyebrow">{fixes.length > 1 ? 'The two changes with the biggest payoff' : 'The change with the biggest payoff'}</span>
          <h3>{fixes.length > 1 ? 'Do these this week' : 'Do this next'} and you reach {metAfter} of 6.</h3>
          <ol>{fixes.map(({ check, fix }) => <li key={check.key}>
            <b>{check.label}: {fix.change}</b>
            <p>{fix.how}</p>
            <p className="why">Why it matters: {check.why}</p>
          </li>)}</ol>
          <div className="kd-actions">
            <button type="button" className="kd-primary" onClick={() => { const before = met; set(after); setFrom(before) }}>Show my day with these changes</button>
            <button type="button" className="kd-ghost" onClick={() => { setFrom(null); set(DEFAULTS[band]) }}>Reset</button>
          </div>
        </>}
      </section>
      <p className="kh-src">Aims from the Australian 24-Hour Movement Guidelines ({band === 0 ? 'birth to 5' : '5–17 years'}), NHMRC Nutrient Reference Values and the Australian Dietary Guidelines. {g.sleepNote}. Guidance, not a diagnosis. <a href={OFFICIAL.movement} target="_blank" rel="noreferrer">Movement guidelines ↗</a></p>
    </div>
  </div>
}
