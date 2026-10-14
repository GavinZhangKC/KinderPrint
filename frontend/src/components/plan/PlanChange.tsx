/* Plan a change: compare Melbourne areas that already look like a planned change
   with similar areas that look like this one now, beside the area's 2027 outlook.
   The comparison is an association across areas, never the effect of the change. */
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'

import BrandHeader from '../BrandHeader'
import {
  api,
  type ApiLimitation,
  type NeighbourhoodSearchResult,
  type PlanAreaDetail,
  type PlanLever,
  type PlanLeverId,
  type PlanOutcomeId,
  type PlanOutcomeResult,
  type PlanResult,
  type PlanSetup,
} from '../../services/api'
import '../where/WhereToLive.css'
import './PlanChange.css'

interface Props {
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
  onHealth: () => void
  /** Switch between views, shown above the page title. */
  viewSwitch?: ReactNode
  /** Render inside another page (Where to live): no site header, URL kept on that page. */
  embedded?: boolean
  /** Inside the shared page template: the page's audience switch decides the view and the hero carries the title. */
  audience?: 'parent' | 'practitioner'
  onAreaNameChange?: (name: string | null) => void
}

type Audience = 'parent' | 'practitioner'
type Plan = Partial<Record<PlanLeverId, number>>
type Area = { id: string; name: string }

const AUDIENCE_KEY = 'kinderprint-audience'
const AREA_KEY = 'vk-health-area'
const SA2 = /^\d{9}$/
// Step, smallest and largest change offered for a custom plan, in the units people use.
const STEPS: Record<PlanLeverId, { step: number; min: number; max: number; first: number }> = {
  tree_cover: { step: 1, min: 1, max: 20, first: 5 },
  urban_heat: { step: 0.5, min: -4, max: -0.5, first: -1 },
  open_space: { step: 1, min: 1, max: 15, first: 3 },
  road_traffic: { step: 10, min: -80, max: -10, first: -50 },
}
const ORDER: PlanLeverId[] = ['tree_cover', 'urban_heat', 'open_space', 'road_traffic']

function readJson<T>(key: string, fallback: T, ok: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    return ok(value) ? value : fallback
  } catch { return fallback }
}
function writeJson(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

/** Change in words: "+5 points", "1 °C cooler", "50% less". */
export function changeText(lever: PlanLeverId, change: number): string {
  if (lever === 'urban_heat') return `${trim(Math.abs(change))} °C cooler`
  if (lever === 'road_traffic') return `${trim(Math.abs(change))}% less`
  return `+${trim(change)} points`
}
/** A raw level in its own units. */
export function levelText(lever: PlanLeverId, value: number): string {
  if (lever === 'urban_heat') return `${value.toFixed(1)} °C above rural land`
  if (lever === 'road_traffic') return `traffic index ${Math.round(value).toLocaleString('en-AU')}`
  return `${value.toFixed(1)}% of the area`
}
function trim(n: number) { return Number.isInteger(n) ? String(n) : n.toFixed(1) }
const LEVER_SHORT: Record<PlanLeverId, string> = {
  tree_cover: 'tree cover', urban_heat: 'street heat', open_space: 'open space', road_traffic: 'main-road traffic',
}
/** What areas "like the plan" already have, in plain words. */
function haveWords(plan: Plan, targets: Plan | undefined): string {
  return ORDER.filter(l => plan[l] !== undefined).map(l => {
    const target = targets?.[l]
    if (l === 'tree_cover' && target !== undefined) return `about ${target.toFixed(1)}% tree cover`
    if (l === 'open_space' && target !== undefined) return `about ${target.toFixed(1)}% open space`
    if (l === 'urban_heat') return `streets about ${trim(Math.abs(plan[l]!))} °C cooler`
    return `about ${trim(Math.abs(plan[l]!))}% less main-road traffic`
  }).join(' and ')
}
function planWords(plan: Plan): string {
  return ORDER.filter(l => plan[l] !== undefined).map(l => `${LEVER_SHORT[l]} ${changeText(l, plan[l]!)}`).join(' and ')
}

function initialArea(): Area | null {
  const q = new URLSearchParams(window.location.search)
  const id = q.get('area')
  if (id && SA2.test(id)) return { id, name: q.get('name') ?? '' }
  return readJson<Area | null>(AREA_KEY, null, (v): v is Area =>
    !!v && typeof v === 'object' && typeof (v as Area).id === 'string' && SA2.test((v as Area).id) && typeof (v as Area).name === 'string')
}
function initialPlan(): { preset: string; custom: Plan } {
  const q = new URLSearchParams(window.location.search)
  const custom: Plan = {}
  for (const lever of ORDER) {
    const raw = q.get(lever)
    const n = raw === null ? NaN : Number(raw)
    const s = STEPS[lever]
    if (Number.isFinite(n) && n >= s.min && n <= s.max) custom[lever] = n
  }
  if (Object.keys(custom).length) return { preset: 'custom', custom }
  return { preset: q.get('plan') ?? 'trees_5', custom: { tree_cover: 5 } }
}

export default function PlanChange(props: Props) {
  const [ownAudience, setAudienceState] = useState<Audience>(() =>
    readJson<Audience>(AUDIENCE_KEY, 'practitioner', (v): v is Audience => v === 'parent' || v === 'practitioner'))
  const setAudience = (value: Audience) => { setAudienceState(value); writeJson(AUDIENCE_KEY, value) }
  const audience = props.audience ?? ownAudience
  const parent = audience === 'parent'

  const [setup, setSetup] = useState<PlanSetup | null>(null)
  const [setupError, setSetupError] = useState(false)
  const [area, setArea] = useState<Area | null>(initialArea)
  useEffect(() => {
    props.onAreaNameChange?.(area?.name || null)
  }, [area?.name, props.onAreaNameChange])
  const [detail, setDetail] = useState<PlanAreaDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const start = useMemo(initialPlan, [])
  const [preset, setPreset] = useState(start.preset)
  const [custom, setCustom] = useState<Plan>(start.custom)
  const [result, setResult] = useState<{ data: PlanResult | null; limitations: ApiLimitation[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)
  const resultRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    const c = new AbortController()
    api.getPlanSetup(c.signal)
      .then(r => { if (r.status === 'available') setSetup(r.data); else setSetupError(true) })
      .catch(e => { if (!c.signal.aborted) { console.error(e); setSetupError(true) } })
    return () => c.abort()
  }, [])

  useEffect(() => {
    if (!area) { setDetail(null); return }
    const c = new AbortController()
    setDetail(null); setDetailError(null)
    api.getPlanArea(area.id, c.signal).then(r => {
      if (r.status === 'available') {
        setDetail(r.data)
        if (!area.name) setArea({ id: area.id, name: r.data.name })
      } else setDetailError(r.limitations[0]?.message ?? 'This area is not available.')
    }).catch(e => { if (!c.signal.aborted) { console.error(e); setDetailError('Could not load this area. Check your connection and try again.') } })
    return () => c.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area?.id])

  const plan: Plan = useMemo(() => {
    if (preset === 'custom') return custom
    return setup?.presets.find(p => p.id === preset)?.plan ?? {}
  }, [preset, custom, setup])

  // Keep the address shareable.
  useEffect(() => {
    const q = new URLSearchParams()
    if (area) { q.set('area', area.id); if (area.name) q.set('name', area.name) }
    if (preset === 'custom') for (const [l, v] of Object.entries(custom)) q.set(l, String(v))
    else q.set('plan', preset)
    q.set('view', 'plan')
    window.history.replaceState(null, '', `${props.embedded ? '/map/where-to-live' : '/simulation'}?${q.toString()}`)
  }, [area, preset, custom])

  const run = () => {
    if (!area || !Object.keys(plan).length) return
    setBusy(true); setFailed(false); setCopied(false)
    api.evaluatePlan(area.id, plan).then(r => {
      setResult({ data: r.data, limitations: r.limitations })
      requestAnimationFrame(() => resultRef.current?.focus())
    }).catch(e => { console.error(e); setFailed(true) }).finally(() => setBusy(false))
  }
  // A new area or plan clears an old answer so it is never shown against the wrong plan.
  useEffect(() => { setResult(null) }, [area?.id, preset, custom])

  const chooseArea = (next: Area) => { setArea(next); writeJson(AREA_KEY, next) }
  const header = <BrandHeader activePage="simulation" onHome={props.onHome} onInsight={props.onInsight} onMap={props.onMap} onSimulation={props.onSimulation} onHealth={props.onHealth} />

  const page = <main className="wl-main pl-main" id="main">
      {props.viewSwitch}
      {props.audience && <div className="kt-filters wl-hub-bar"><p>Compares similar Melbourne areas that already have the change. Area-level evidence: it does not predict what will happen to any child.</p></div>}
      {!props.audience && <section className="wl-intro" aria-labelledby="pl-title">
        <div>
          <h1 id="pl-title">{props.embedded ? 'What if this area changed?' : 'Plan a change'}</h1>
          <p>{parent
            ? 'Pick your area and a change, such as more trees. See how children are doing in Melbourne areas that already look like that.'
            : 'Choose an area and a planned change to place features. Compare similar Melbourne areas that already have that level, beside the area’s 2027 school-entry outlook.'}</p>
        </div>
        <div className="wl-seg pl-audience" role="radiogroup" aria-label="Who is using this page">
          <button type="button" role="radio" aria-checked={parent} onClick={() => setAudience('parent')}>Parent</button>
          <button type="button" role="radio" aria-checked={!parent} onClick={() => setAudience('practitioner')}>Practitioner</button>
        </div>
      </section>}

      {setupError ? <div className="wl-state" role="alert"><h2>Plan a change is unavailable right now</h2>
        <p>Try again in a moment.</p><button type="button" className="wl-btn primary" onClick={() => window.location.reload()}>Try again</button></div>
        : <div className="pl-layout">
          <section className="wl-filters pl-builder" aria-labelledby="pl-builder-title">
            <h2 id="pl-builder-title">Your plan</h2>
            <div className="wl-filter-body">
              <div className="wl-field">
                <label htmlFor="pl-area">1. Area</label>
                <AreaSearch value={area} onChoose={chooseArea} />
                {detailError && <p className="wl-notice pl-warn" role="alert">{detailError}</p>}
              </div>
              <fieldset className="wl-field">
                <legend>2. Change</legend>
                {setup ? <PlanChooser setup={setup} preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} detail={detail} />
                  : <p className="wl-help" role="status">Loading changes…</p>}
              </fieldset>
              <div className="pl-run">
                <button type="button" className="wl-btn primary block" disabled={!area || !detail || !Object.keys(plan).length || busy} onClick={run}>
                  {busy ? 'Comparing…' : 'Compare areas'}
                </button>
                {!area && <p className="wl-help">Choose an area first.</p>}
              </div>
            </div>
          </section>

          <section className="pl-results" aria-live="polite">
            {!area && <EmptyStart />}
            {area && detail && <Outlook detail={detail} parent={parent} />}
            {area && detail && <PlaceNow detail={detail} plan={plan} setup={setup} parent={parent} />}
            {failed && <p className="wl-notice pl-warn" role="alert">The comparison did not load. Check your connection and try again.</p>}
            {result && detail && <Result result={result} parent={parent} plan={plan} detail={detail} headingRef={resultRef}
              copied={copied} onCopy={text => {
                navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false))
              }} />}
            {area && detail && setup && <HowToRead setup={setup} parent={parent} />}
          </section>
        </div>}
      <p className="pl-foot">Area-level evidence. Vkinder does not predict what will happen to any child and does not give medical advice.</p>
    </main>
  if (props.embedded) return page
  return <div className="app-background where-page plan-page">
    {header}
    {page}
  </div>
}

function EmptyStart() {
  return <div className="pl-card pl-empty">
    <h2>Start with an area</h2>
    <p>Type a suburb in “Your plan”. You will see where its children are heading by 2027, then compare a planned change with Melbourne areas that already look like it.</p>
  </div>
}

export function AreaSearch({ value, onChoose }: { value: Area | null; onChoose: (a: Area) => void }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<NeighbourhoodSearchResult[]>([])
  const [active, setActive] = useState(0)
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')
  const listId = useId()
  useEffect(() => {
    if (query.trim().length < 2) { setItems([]); setState('idle'); return }
    setState('loading')
    const t = window.setTimeout(() => api.searchNeighbourhoods(query.trim())
      .then(r => { setItems(r.data.filter(i => SA2.test(i.id)).slice(0, 8)); setActive(0); setState('idle') })
      .catch(() => { setItems([]); setState('error') }), 220)
    return () => window.clearTimeout(t)
  }, [query])
  const choose = (i: NeighbourhoodSearchResult) => { onChoose({ id: i.id, name: i.name }); setQuery(''); setItems([]) }
  return <div className="wl-place">
    {value && <p className="wl-selected-place"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg><b>{value.name || 'Chosen area'}</b></p>}
    <input id="pl-area" value={query} placeholder={value ? 'Change area: type a suburb' : 'Type a suburb, e.g. Footscray'} autoComplete="off"
      role="combobox" aria-expanded={items.length > 0} aria-controls={listId} aria-autocomplete="list"
      aria-activedescendant={items[active] ? `${listId}-${items[active].id}` : undefined}
      onChange={e => setQuery(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, items.length - 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
        if (e.key === 'Enter' && items[active]) { e.preventDefault(); choose(items[active]) }
        if (e.key === 'Escape') setItems([])
      }} />
    {state === 'loading' && <p className="wl-help" role="status">Searching…</p>}
    {state === 'error' && <p className="wl-help" role="alert">Search did not work. Check your connection and try again.</p>}
    {state === 'idle' && query.trim().length >= 2 && !items.length && <p className="wl-help">No Greater Melbourne area matches “{query}”.</p>}
    {items.length > 0 && <ul className="wl-place-list" id={listId} role="listbox" aria-label="Matching areas">
      {items.map((i, n) => <li key={i.id} id={`${listId}-${i.id}`} role="option" aria-selected={n === active}
        onMouseEnter={() => setActive(n)} onMouseDown={e => { e.preventDefault(); choose(i) }}>{i.name}</li>)}
    </ul>}
  </div>
}

function PlanChooser({ setup, preset, setPreset, custom, setCustom, detail }: {
  setup: PlanSetup; preset: string; setPreset: (p: string) => void; custom: Plan; setCustom: (p: Plan) => void; detail: PlanAreaDetail | null
}) {
  const name = useId()
  const leverById = Object.fromEntries(setup.levers.map(l => [l.id, l])) as Record<PlanLeverId, PlanLever>
  const chosen = Object.keys(custom) as PlanLeverId[]
  const toggle = (lever: PlanLeverId) => {
    const next = { ...custom }
    if (lever in next) delete next[lever]
    else if (chosen.length < setup.max_levers) next[lever] = STEPS[lever].first
    setCustom(next)
  }
  const nudge = (lever: PlanLeverId, dir: 1 | -1) => {
    const s = STEPS[lever]
    const current = custom[lever] ?? s.first
    // "More change" moves away from zero in the lever's better direction.
    const sign = s.max < 0 ? -1 : 1
    const next = Math.round((current + dir * sign * s.step) * 10) / 10
    if (next < s.min || next > s.max) return
    setCustom({ ...custom, [lever]: next })
  }
  return <div className="pl-choices">
    <ul className="pl-presets">
      {setup.presets.map(p => <li key={p.id}>
        <label className={preset === p.id ? 'is-on' : undefined}>
          <input type="radio" name={name} checked={preset === p.id} onChange={() => setPreset(p.id)} />
          <span>{p.label}</span>
        </label>
      </li>)}
      <li><label className={preset === 'custom' ? 'is-on' : undefined}>
        <input type="radio" name={name} checked={preset === 'custom'} onChange={() => setPreset('custom')} />
        <span>Make my own (up to {setup.max_levers} changes)</span>
      </label></li>
    </ul>
    {preset === 'custom' && <ul className="pl-custom">
      {ORDER.map(lever => {
        const on = lever in custom
        const blocked = !on && chosen.length >= setup.max_levers
        const now = detail?.place_features[lever]?.value
        return <li key={lever} className={on ? 'is-on' : undefined}>
          <label className="pl-check">
            <input type="checkbox" checked={on} disabled={blocked} onChange={() => toggle(lever)} />
            <span>{leverById[lever]?.label ?? lever}</span>
          </label>
          {on && <div className="pl-stepper" role="group" aria-label={`How much: ${leverById[lever]?.label}`}>
            <button type="button" aria-label="Smaller change" onClick={() => nudge(lever, -1)}
              disabled={Math.abs(custom[lever]!) <= Math.abs(STEPS[lever].max < 0 ? STEPS[lever].max : STEPS[lever].min)}>−</button>
            <output aria-live="polite">{changeText(lever, custom[lever]!)}</output>
            <button type="button" aria-label="Bigger change" onClick={() => nudge(lever, 1)}
              disabled={Math.abs(custom[lever]!) >= Math.abs(STEPS[lever].max < 0 ? STEPS[lever].min : STEPS[lever].max)}>+</button>
          </div>}
          {on && now !== undefined && <p className="wl-caveat">Now {levelText(lever, now)}.</p>}
        </li>
      })}
    </ul>}
  </div>
}

function Outlook({ detail, parent }: { detail: PlanAreaDetail; parent: boolean }) {
  const o = detail.outlook_2027
  const now = detail.outcomes_2024.all_five
  return <article className="pl-card" aria-labelledby="pl-outlook">
    <p className="pl-eyebrow">Where {detail.name} is heading</p>
    <h2 id="pl-outlook">{o ? <>About <span className="pl-big">{Math.round(o.all_five_pct)} in 100</span> children estimated on track at school entry in 2027</> : 'No 2027 outlook for this area'}</h2>
    {o && <>
      <RangeBar low={o.lower_80} high={o.upper_80} point={o.all_five_pct} now={now} />
      <p className="pl-sub">{parent
        ? <>Exploratory range: {Math.round(o.lower_80)} to {Math.round(o.upper_80)} in 100. Nominal 80%; coverage not established. In 2024 it was {now !== null ? Math.round(now) : '–'} in 100.</>
        : <>Nominal 80% range (coverage not established) {o.lower_80.toFixed(1)}–{o.upper_80.toFixed(1)}%. 2024: {now !== null ? `${now.toFixed(1)}%` : 'not available'} (small-number adjusted, {detail.children_assessed_2024 ?? '–'} children assessed). Forecast F3; on track in all five AEDC domains.</>}</p>
    </>}
  </article>
}

function RangeBar({ low, high, point, now }: { low: number; high: number; point: number; now: number | null }) {
  const lo = 20, hi = 90
  const x = (v: number) => `${((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100}%`
  return <div className="pl-range" aria-hidden="true">
    <span className="pl-range-band" style={{ left: x(low), width: `calc(${x(high)} - ${x(low)})` }} />
    {now !== null && <span className="pl-range-now" style={{ left: x(now) }} title="2024" />}
    <span className="pl-range-dot" style={{ left: x(point) }} />
    <span className="pl-range-tick" style={{ left: 0 }}>{lo}%</span>
    <span className="pl-range-tick" style={{ left: '100%' }}>{hi}%</span>
  </div>
}

function PlaceNow({ detail, plan, setup, parent }: { detail: PlanAreaDetail; plan: Plan; setup: PlanSetup | null; parent: boolean }) {
  const [open, setOpen] = useState(false)
  const labels = Object.fromEntries((setup?.levers ?? []).map(l => [l.id, l.label])) as Record<PlanLeverId, string>
  const planned = ORDER.filter(l => plan[l] !== undefined)
  const rows = open ? ORDER : planned
  return <article className="pl-card" aria-labelledby="pl-place">
    <h2 id="pl-place" className="pl-h3">{detail.name} today{planned.length ? ' and with your plan' : ''}</h2>
    <table className="pl-table">
      <thead><tr><th scope="col">Place feature</th><th scope="col">Now</th>{!parent && <th scope="col">Melbourne percentile</th>}<th scope="col">With the plan</th></tr></thead>
      <tbody>{rows.map(lever => {
        const f = detail.place_features[lever]
        const change = plan[lever]
        const target = f && change !== undefined ? (lever === 'road_traffic' ? f.value * (1 + change / 100) : f.value + change) : null
        return <tr key={lever}>
          <th scope="row">{labels[lever] ?? lever}</th>
          <td>{f ? levelText(lever, f.value) : 'Not available'}</td>
          {!parent && <td>{f ? `${Math.round(f.melbourne_percentile)}th` : '–'}</td>}
          <td>{target !== null ? <b>{levelText(lever, target)}</b> : <span className="pl-muted">No change</span>}</td>
        </tr>
      })}</tbody>
    </table>
    <button type="button" className="wl-link pl-more" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Show only planned features' : 'Show all place features'}</button>
    <p className="wl-caveat">Tree cover and heat from 2018, open space 2018, traffic 2019. Heat is how much warmer the land surface is than rural land nearby.</p>
  </article>
}

const OUTCOME_SHORT: Record<PlanOutcomeId, string> = {
  all_five: 'On track in all five areas of development',
  physical: 'On track in physical health',
}

function Result({ result, parent, plan, detail, headingRef, copied, onCopy }: {
  result: { data: PlanResult | null; limitations: ApiLimitation[] }; parent: boolean; plan: Plan; detail: PlanAreaDetail
  headingRef: React.RefObject<HTMLHeadingElement | null>; copied: boolean; onCopy: (text: string) => void
}) {
  const data = result.data
  const caution = result.limitations.find(l => l.code === 'plan_groups_differ')
  if (!data || data.status !== 'ok' || !data.outcomes) {
    const message = result.limitations[0]?.message ?? 'No comparison is available for this plan.'
    const tip = data?.status === 'beyond_observed' ? 'Try a smaller change.'
      : data?.status === 'too_few_similar' ? 'Try a single change, or a different size of change.' : null
    return <article className="pl-card pl-none" aria-labelledby="pl-result">
      <h2 id="pl-result" tabIndex={-1} ref={headingRef}>No fair comparison for this plan</h2>
      <p>{message}{tip ? ` ${tip}` : ''}</p>
    </article>
  }
  const main = data.outcomes.all_five
  const words = planWords(plan)
  const have = haveWords(plan, data.targets)
  const verdict = (o: PlanOutcomeResult) => o.direction === 'higher' ? 'Higher' : o.direction === 'lower' ? 'Lower' : 'No clear difference'
  const sentence = main.direction === 'unclear'
    ? `Areas like ${detail.name} that already have ${have} show no clear difference in children on track at school entry.`
    : `In areas like ${detail.name} that already have ${have}, about ${Math.round(main.like_plan_pct)} in 100 children were on track at school entry, compared with ${Math.round(main.like_now_pct)} in 100 in similar areas as ${detail.name} is now.`
  const summary = [
    `Plan a change: ${detail.name}, ${words}.`,
    sentence,
    `All five domains: ${main.difference_pp > 0 ? '+' : ''}${main.difference_pp} points (80% range ${main.interval_80_pp[0]} to ${main.interval_80_pp[1]}); based on ${data.like_plan?.length ?? 0} matched pairs of areas.`,
    detail.outlook_2027 ? `2027 outlook for ${detail.name}: ${detail.outlook_2027.all_five_pct}% (nominal 80% range, coverage not established: ${detail.outlook_2027.lower_80}–${detail.outlook_2027.upper_80}%).` : '',
    'This compares areas; it is not the effect of making the change. Area-level only. Source: Vkinder (AEDC 2024; place features 2018–2019).',
  ].filter(Boolean).join('\n')

  return <article className="pl-card pl-result" aria-labelledby="pl-result">
    <p className="pl-eyebrow">Areas that already look like your plan</p>
    <h2 id="pl-result" tabIndex={-1} ref={headingRef}>{verdict(main)}{main.direction !== 'unclear' && <> by about {Math.abs(Math.round(main.difference_pp))} in 100 children</>}</h2>
    <p className="pl-lead">{sentence}</p>
    {caution && <p className="wl-notice pl-warn">{caution.message}</p>}
    {!parent && <>
      <div className="pl-chart" role="img" aria-label={`Difference with 80% range. ${(['all_five', 'physical'] as PlanOutcomeId[]).map(id => `${OUTCOME_SHORT[id]}: ${data.outcomes![id].difference_pp} points, range ${data.outcomes![id].interval_80_pp[0]} to ${data.outcomes![id].interval_80_pp[1]}`).join('. ')}.`}>
        {(['all_five', 'physical'] as PlanOutcomeId[]).map(id => <DiffRow key={id} label={OUTCOME_SHORT[id]} o={data.outcomes![id]} />)}
        <div className="pl-axis" aria-hidden="true"><span /><span className="pl-axis-scale"><span>−12</span><span>0</span><span>+12 points</span></span><span /></div>
      </div>
      <table className="pl-table pl-compact">
        <thead><tr><th scope="col">AEDC 2024</th><th scope="col">Like the plan</th><th scope="col">Like now</th><th scope="col">Difference (80% range)</th></tr></thead>
        <tbody>{(['all_five', 'physical'] as PlanOutcomeId[]).map(id => { const o = data.outcomes![id]; return <tr key={id}>
          <th scope="row">{OUTCOME_SHORT[id]}</th><td>{o.like_plan_pct.toFixed(1)}%</td><td>{o.like_now_pct.toFixed(1)}%</td>
          <td><b>{o.difference_pp > 0 ? '+' : ''}{o.difference_pp.toFixed(1)}</b> ({o.interval_80_pp[0].toFixed(1)} to {o.interval_80_pp[1].toFixed(1)}) · {verdict(o)}</td></tr> })}</tbody>
      </table>
    </>}
    <details className="pl-areas">
      <summary>Which areas were compared ({data.like_plan?.length ?? 0} pairs)</summary>
      <p className="wl-help">Each area like the plan is paired with an area like {detail.name} now that is similar in disadvantage and number of children.</p>
      <div className="pl-two">
        <AreaList title="Already like the plan" items={data.like_plan ?? []} />
        <AreaList title={`Like ${detail.name} now`} items={data.like_now ?? []} />
      </div>
    </details>
    <div className="pl-actions">
      <button type="button" className="wl-btn" onClick={() => onCopy(summary)}>{copied ? 'Copied' : 'Copy plan summary'}</button>
      <a className="wl-btn" href={`/child-health?area=${encodeURIComponent(detail.id.split('_')[0])}&name=${encodeURIComponent(detail.name)}`}>Open child health board</a>
      <span className="pl-sr" role="status">{copied ? 'Plan summary copied' : ''}</span>
    </div>
  </article>
}

function DiffRow({ label, o }: { label: string; o: PlanOutcomeResult }) {
  const span = 12
  const x = (v: number) => `${((Math.max(-span, Math.min(span, v)) + span) / (2 * span)) * 100}%`
  return <div className="pl-diff">
    <span className="pl-diff-label">{label}</span>
    <span className="pl-diff-track">
      <span className="pl-diff-zero" />
      <span className={`pl-diff-band is-${o.direction}`} style={{ left: x(o.interval_80_pp[0]), width: `calc(${x(o.interval_80_pp[1])} - ${x(o.interval_80_pp[0])})` }} />
      <span className={`pl-diff-dot is-${o.direction}`} style={{ left: x(o.difference_pp) }} />
    </span>
    <span className="pl-diff-value">{o.difference_pp > 0 ? '+' : ''}{o.difference_pp.toFixed(1)}</span>
  </div>
}

function AreaList({ title, items }: { title: string; items: Area[] }) {
  return <div><h3 className="pl-h4">{title}</h3><ol className="pl-list">{items.map(a =>
    <li key={a.id}><a href={`/child-health?area=${encodeURIComponent(a.id.split('_')[0])}&name=${encodeURIComponent(a.name)}`}>{a.name}</a></li>)}</ol></div>
}

function HowToRead({ setup, parent }: { setup: PlanSetup; parent: boolean }) {
  return <details className="pl-card pl-how">
    <summary><h2 className="pl-h3">How to read this</h2></summary>
    <Body parent={parent} setup={setup} />
  </details>
}

function Body({ parent, setup }: { parent: boolean; setup: PlanSetup }): ReactNode {
  return <div className="pl-how-body">
    <p>{setup.caveat}</p>
    {parent ? <ul>
      <li>We look for Melbourne areas that already have the level you planned, and similar areas that look like yours today.</li>
      <li>We pair areas that are alike in how advantaged they are and how many children were assessed, then compare how children were doing in 2024.</li>
      <li>“No clear difference” is a common, honest answer. It does not mean the change has no value.</li>
    </ul> : <ul>
      <li>Matched pairs (up to 12, at least 5) on IRSD and children assessed, within 10 percentile points; planned features within ±10 percentile points of the target or today’s level.</li>
      <li>80% intervals from a bootstrap over pairs, widened so that shuffled data looks “clear” no more often than chance (20%).</li>
      <li>Validation: 71% of area–plan searches have a result; 91% are balanced. Tree cover shows more signal than chance; heat and traffic are close to chance.</li>
      <li>The 2027 outlook is forecast F3 and is not changed by the plan.</li>
      <li>Sources: {Object.values(setup.sources).join('; ')}.</li>
    </ul>}
  </div>
}
