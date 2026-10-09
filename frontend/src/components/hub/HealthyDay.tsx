/**
 * Healthy day check (parents): describe a typical weekday, see how it compares with the
 * Australian guidelines for the child's age, and try the two changes with the biggest payoff.
 *
 * Guideline values:
 * - 24-Hour Movement Guidelines, birth to 5: 3 h activity; screens 1 h or less (none under 2);
 *   sleep 10–13 h for ages 3–5 (11–14 h including naps for ages 1–2).
 * - 24-Hour Movement Guidelines, 5–17: 60 min moderate-to-vigorous activity; recreational
 *   screens 2 h or less; sleep 9–11 h for ages 5–13 (8–10 h from 14).
 * - NHMRC Nutrient Reference Values (fluids) and Australian Dietary Guidelines (vegetables).
 * Guidance for age groups, not an assessment of an individual child. Answers stay on the device.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import './TodayPage.css'
import './HealthyDay.css'

type Band = '0' | '1' | '2'
const bandOf = (age: string): Band => age.startsWith('0') ? '0' : age.startsWith('5') ? '1' : '2'
const LABEL: Record<Band, string> = { '0': '0–4 year olds', '1': '5–9 year olds', '2': '10–14 year olds' }
const STORE_KEY = 'kinderprint-healthy-day-v2'

interface DayInput { bed: number; wake: number; active: number; screens: number; veg: number; water: number; sweet: boolean }
const DEFAULTS: Record<Band, DayInput> = {
  '0': { bed: 20.5, wake: 6.5, active: 120, screens: 120, veg: 2.5, water: 3, sweet: true },
  '1': { bed: 21, wake: 7, active: 40, screens: 180, veg: 4.5, water: 3, sweet: true },
  '2': { bed: 22, wake: 7, active: 45, screens: 240, veg: 5, water: 4, sweet: true },
}
const GUIDE: Record<Band, { sleep: [number, number]; active: number; activeAim: string; screens: number; screensAim: string; veg: number; water: number; note: string }> = {
  '0': { sleep: [10, 13], active: 180, activeAim: '3 hours', screens: 60, screensAim: '1 hour or less', veg: 2.5, water: 4, note: 'Sleep aims are for ages 3–5; ages 1–2 need 11–14 hours including naps, and no screens under 2' },
  '1': { sleep: [9, 11], active: 60, activeAim: '60 minutes', screens: 120, screensAim: '2 hours or less', veg: 4.5, water: 5, note: 'Sleep aims are 9–11 hours for ages 5–13' },
  '2': { sleep: [9, 11], active: 60, activeAim: '60 minutes', screens: 120, screensAim: '2 hours or less', veg: 5, water: 6, note: 'Sleep aims are 9–11 hours for ages 5–13 and 8–10 hours from 14' },
}

const clock = (h: number) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); const h12 = hh % 12 === 0 ? 12 : hh % 12; return `${h12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'pm' : 'am'}` }
const dur = (m: number) => m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`
const BED_TIMES = Array.from({ length: 19 }, (_, i) => 18.5 + i * 0.25)
const WAKE_TIMES = Array.from({ length: 13 }, (_, i) => 5.5 + i * 0.25)

interface Check { key: string; label: string; value: string; aim: string; ok: boolean; gap: number; fix: () => { change: string; how: string; why: string; apply: (d: DayInput) => DayInput } }

function checks(s: DayInput, band: Band): Check[] {
  const g = GUIDE[band]
  const sleep = (s.wake - s.bed + 24) % 24
  return [
    { key: 'sleep', label: 'Sleep', value: `${Math.round(sleep * 4) / 4} h`, aim: `${g.sleep[0]}–${g.sleep[1]} h`, ok: sleep >= g.sleep[0] && sleep <= g.sleep[1], gap: sleep < g.sleep[0] ? (g.sleep[0] - sleep) / g.sleep[0] * 1.2 : 0,
      fix: () => { const e = Math.max(0.25, Math.ceil((g.sleep[0] - sleep) * 4) / 4); return { change: `Bedtime ${clock(s.bed)} → ${clock(s.bed - e)}`, how: `Move bedtime ${dur(e * 60)} earlier in 15-minute steps over a week, and keep the same wake-up time.`, why: 'Enough sleep supports attention, mood, learning and a healthy weight.', apply: x => ({ ...x, bed: s.bed - e }) } } },
    { key: 'active', label: 'Active play', value: dur(s.active), aim: g.activeAim, ok: s.active >= g.active, gap: Math.max(0, (g.active - s.active) / g.active) * 2,
      fix: () => ({ change: `Active play ${dur(s.active)} → ${dur(g.active)}`, how: band === '0' ? 'Add a park trip in the morning and another after 3:30 pm, with running, climbing and chasing.' : 'Add time that gets them puffed: walk or ride to school, or sport after school.', why: 'Builds bones, muscles and fitness, and lowers the risk of unhealthy weight gain.', apply: x => ({ ...x, active: g.active }) }) },
    { key: 'screens', label: 'Screens', value: dur(s.screens), aim: g.screensAim, ok: s.screens <= g.screens, gap: Math.max(0, (s.screens - g.screens) / g.screens) * 0.8,
      fix: () => ({ change: `Screens ${dur(s.screens)} → ${dur(g.screens)}`, how: 'No screens at meals or in the car, and swap one show for time outdoors.', why: band === '0' ? 'More screen time at this age is linked with later language development and poorer sleep.' : 'More than 2 hours a day is linked with poorer sleep, fitness and wellbeing.', apply: x => ({ ...x, screens: g.screens }) }) },
    { key: 'veg', label: 'Vegetables', value: `${s.veg} serves`, aim: `${g.veg} serves`, ok: s.veg >= g.veg, gap: Math.max(0, (g.veg - s.veg) / g.veg) * 0.9,
      fix: () => ({ change: `Vegetables ${s.veg} → ${g.veg} serves`, how: 'Grated carrot or zucchini in sauces counts, and veg sticks for afternoon tea.', why: 'Fibre and vitamins for growth. Eating habits set now tend to last.', apply: x => ({ ...x, veg: g.veg }) }) },
    { key: 'water', label: 'Water', value: `${s.water} cups`, aim: `about ${g.water} cups`, ok: s.water >= g.water, gap: Math.max(0, (g.water - s.water) / g.water),
      fix: () => ({ change: `Water ${s.water} → ${g.water} cups`, how: 'Keep a filled bottle in reach and offer water with every meal and snack.', why: 'Children need regular fluids, more on hot days and after play.', apply: x => ({ ...x, water: g.water }) }) },
    { key: 'sweet', label: 'Sweet drinks', value: s.sweet ? 'Most days' : 'Rarely', aim: 'water instead', ok: !s.sweet, gap: s.sweet ? 0.6 : 0,
      fix: () => ({ change: 'Juice and soft drink → water', how: 'Offer water and whole fruit instead; keep sweet drinks for parties.', why: 'Sweet drinks are the biggest source of added sugar for children and cause tooth decay.', apply: x => ({ ...x, sweet: false }) }) },
  ]
}

function isDayInput(value: unknown, band: Band): value is DayInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  const bounds = { bed: 24, wake: 24, active: band === '0' ? 300 : 150, screens: 360, veg: 8, water: 10 }
  return typeof row.sweet === 'boolean' && Object.entries(bounds).every(([key, maximum]) => {
    const number = row[key]
    return typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= maximum
  })
}

function readStore(): Partial<Record<Band, DayInput>> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const saved = value as Record<string, unknown>
    const valid: Partial<Record<Band, DayInput>> = {}
    for (const band of ['0', '1', '2'] as const) {
      if (isDayInput(saved[band], band)) valid[band] = saved[band]
    }
    return valid
  } catch {
    return {}
  }
}

function Stepper({ label, value, onChange, step, max }: { label: string; value: number; onChange: (value: number) => void; step: number; max: number }) {
  return <div className="hd-field hd-inline"><span>{label}</span><span className="hd-step">
    <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} onClick={() => onChange(Math.max(0, value - step))}>−</button>
    <b aria-live="polite">{value}</b>
    <button type="button" aria-label={`More ${label.toLowerCase()}`} onClick={() => onChange(Math.min(max, value + step))}>+</button>
  </span></div>
}

export default function HealthyDay({ age, ageControl }: { age: string; ageControl: ReactNode }) {
  const band = bandOf(age)
  const g = GUIDE[band]
  const [saved, setSaved] = useState(readStore)
  const [before, setBefore] = useState<number | null>(null)
  useEffect(() => { try { window.localStorage.setItem(STORE_KEY, JSON.stringify(saved)) } catch { /* storage unavailable */ } }, [saved])
  useEffect(() => setBefore(null), [band])
  const s = saved[band] ?? DEFAULTS[band]
  const set = (next: DayInput, keepBefore = false) => { setSaved(current => ({ ...current, [band]: next })); if (!keepBefore) setBefore(null) }
  const patch = (part: Partial<DayInput>) => set({ ...s, ...part })

  const list = useMemo(() => checks(s, band), [s, band])
  const met = list.filter(c => c.ok).length
  const top = list.filter(c => !c.ok).sort((a, b) => b.gap - a.gap).slice(0, 2).map(c => ({ c, f: c.fix() }))
  const after = top.reduce((acc, t) => t.f.apply(acc), s)

  return <div className="kt kt-parent hd">
    <section className="kt-card kt-tint hd-intro" aria-label="About this check">
      <div className="hd-intro-text">
        <h1>Healthy day check</h1>
        <p>Describe a normal weekday. We compare it with the Australian guidelines for your child’s age and show the two changes that would help most.</p>
      </div>
      <div className="hd-age">{ageControl}</div>
      <ol className="hd-steps" aria-label="Steps">
        <li><span>1</span>Describe the day</li>
        <li><span>2</span>See how it compares</li>
        <li><span>3</span>Try the two changes</li>
      </ol>
    </section>

    <div className="kt-row kt-row-top">
      <section className="kt-card kt-cream hd-form" aria-labelledby="hd-day">
        <h2 id="hd-day">Your child’s typical day</h2>
        <p className="kt-sub">Answers stay on this device.</p>
        <h3>Sleep</h3>
        <div className="hd-two">
          <label className="hd-field">Bedtime<select value={s.bed} onChange={e => patch({ bed: Number(e.target.value) })}>{BED_TIMES.map(h => <option key={h} value={h}>{clock(h)}</option>)}</select></label>
          <label className="hd-field">Wakes up<select value={s.wake} onChange={e => patch({ wake: Number(e.target.value) })}>{WAKE_TIMES.map(h => <option key={h} value={h}>{clock(h)}</option>)}</select></label>
        </div>
        <h3>Moving and screens</h3>
        <label className="hd-field hd-range">
          <span>{band === '0' ? 'Active play, all day' : 'Active minutes that leave them puffed'}</span><output>{dur(s.active)}</output>
          <input type="range" min={0} max={band === '0' ? 300 : 150} step={5} value={s.active} onChange={e => patch({ active: Number(e.target.value) })} />
        </label>
        <label className="hd-field hd-range">
          <span>Screen time for fun</span><output>{dur(s.screens)}</output>
          <input type="range" min={0} max={360} step={15} value={s.screens} onChange={e => patch({ screens: Number(e.target.value) })} />
        </label>
        <h3>Food and drinks</h3>
        <Stepper label="Vegetable serves" value={s.veg} step={0.5} max={8} onChange={veg => patch({ veg })} />
        <Stepper label="Cups of water" value={s.water} step={1} max={10} onChange={water => patch({ water })} />
        <div className="hd-field hd-inline"><span>Juice or soft drink most days?</span>
          <span className="hd-yn" role="group" aria-label="Juice or soft drink most days">
            <button type="button" aria-pressed={s.sweet} onClick={() => patch({ sweet: true })}>Yes</button>
            <button type="button" aria-pressed={!s.sweet} onClick={() => patch({ sweet: false })}>No</button>
          </span>
        </div>
      </section>

      <div className="hd-results kt-col">
        <section className="kt-card kt-tint" aria-labelledby="hd-res" aria-live="polite">
          <div className="hd-res-head"><h2 id="hd-res">How the day compares</h2><span className="kt-sub">Guidelines for {LABEL[band]}</span></div>
          <p className="hd-score"><strong>{met}</strong><span>of 6 guidelines met</span>{before !== null && <em>Up from {before}</em>}</p>
          <div className="hd-checks">{list.map(c => <div key={c.key} className={c.ok ? 'is-ok' : 'is-no'}>
            <span className="hd-status"><i />{c.ok ? 'On track' : 'Room to improve'}</span>
            <b>{c.label}</b><strong>{c.value}</strong><small>Aim: {c.aim}</small>
          </div>)}</div>
        </section>

        <section className="kt-card kt-cream hd-fixes" aria-labelledby="hd-fix">
          <AnimatePresence mode="wait" initial={false}>
            {top.length > 0 ? <motion.div key="fixes" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
              <h2 id="hd-fix">{top.length > 1 ? 'Your two changes with the biggest payoff' : 'Your next change'}</h2>
              <ol>{top.map(({ c, f }, index) => <li key={c.key}>
                <span className="hd-num">{index + 1}</span>
                <div><b>{f.change}</b><span>{f.how}</span><em>Why it matters: {f.why}</em></div>
              </li>)}</ol>
              <div className="hd-actions">
                <button type="button" className="kh-btn primary" onClick={() => { setBefore(met); set(after, true) }}>Show my day with these changes</button>
                <button type="button" className="kh-btn" onClick={() => set(DEFAULTS[band])}>Start again</button>
              </div>
            </motion.div> : <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}>
              <h2 id="hd-fix">All six guidelines met</h2>
              <p className="kt-sub">Keep this routine going. Check again when the season changes: summer heat and winter illness both shift routines.</p>
              <div className="hd-actions"><button type="button" className="kh-btn" onClick={() => set(DEFAULTS[band])}>Start again with a typical day</button></div>
            </motion.div>}
          </AnimatePresence>
        </section>
      </div>
    </div>

    <footer className="kt-foot"><p>Aims from the Australian 24-Hour Movement Guidelines, NHMRC Nutrient Reference Values and the Australian Dietary Guidelines. {g.note}. General guidance for age groups, not a diagnosis for your child.</p></footer>
  </div>
}
