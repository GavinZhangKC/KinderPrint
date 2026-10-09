/**
 * "Where to live": compare Greater Melbourne areas by what matters for a child's health and
 * development, near a place the family chooses. Data and ranking come from /api/family-fit; this
 * page never invents a figure. The match score is a comparative index, not a probability, and the
 * page says so wherever a number could be read as a promise.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import BrandHeader from '../BrandHeader'
import {
  api,
  type FamilyFitAreaDetail,
  type FamilyFitLevel,
  type FamilyFitResult,
  type FamilyFitSearch,
  type FamilyFitSetup,
} from '../../services/api'
import {
  AGE_LABEL, AGE_SUGGESTIONS, CHANGE_TEXT, CHECKLIST, CHECKLIST_GENERAL, HOME_FOCUS, LEVEL_LABEL, MEASURES,
  STABILITY_TEXT, formatMeasure, type AgeGroup,
} from './whereData'
import WhereMap from './WhereMap'
import './WhereToLive.css'

type Level = 'skip' | FamilyFitLevel
interface Criteria { age: AgeGroup; anchor: string | null; radius: number; priorities: Record<string, FamilyFitLevel> }
interface Saved { id: string; name: string }
type View = 'list' | 'map' | 'both'

const SEARCH_KEY = 'vk-where-search'
const SAVED_KEY = 'vk-where-saved'
const CHECK_KEY = 'vk-where-checklist'
const MAX_SAVED = 3
const PAGE_SIZE = 5
const EXAMPLES = ['207031163', '213031348', '212041564']   // Box Hill, Footscray, Dandenong - South

function read<T>(key: string, fallback: T): T {
  try { const v = window.localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
}
function write(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable: page still works */ }
}
const sameCriteria = (a: Criteria, b: Criteria) => JSON.stringify(a) === JSON.stringify(b)
const suggested = (age: AgeGroup): Record<string, FamilyFitLevel> => Object.fromEntries(AGE_SUGGESTIONS[age].map(n => [n, 'prefer']))

interface Props {
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
  onHealth: () => void
}

export default function WhereToLive(props: Props) {
  const [setup, setSetup] = useState<FamilyFitSetup | null>(null)
  const [setupError, setSetupError] = useState(false)
  const [shapes, setShapes] = useState<Record<string, Array<Array<[number, number]>>> | null>(null)
  const query = useMemo(() => new URLSearchParams(window.location.search), [])
  // ?focus= comes from the home page cards; ?anchor= from Child Health ("Thinking of moving?").
  const focus = HOME_FOCUS[query.get('focus') ?? ''] ?? null
  const linkedAnchor = /^\d{9}$/.test(query.get('anchor') ?? '') ? query.get('anchor') : null
  const stored = useMemo(() => read<Criteria | null>(SEARCH_KEY, null), [])
  const [draft, setDraft] = useState<Criteria>(() => {
    const base: Criteria = stored ?? { age: '0-4', anchor: null, radius: 10, priorities: suggested('0-4') }
    const priorities = focus && !base.priorities[focus] ? { ...base.priorities, [focus]: 'prefer' as const } : base.priorities
    return { ...base, anchor: linkedAnchor ?? base.anchor, priorities }
  })
  const [applied, setApplied] = useState<Criteria | null>(stored?.anchor ? stored : null)
  const [edited, setEdited] = useState(Boolean(stored))
  const [result, setResult] = useState<FamilyFitSearch | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [view, setView] = useState<View>('list')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'compare' | 'checklist' | 'how' | null>(null)
  const [saved, setSaved] = useState<Saved[]>(() => read<Saved[]>(SAVED_KEY, []).slice(0, MAX_SAVED))
  const [toast, setToast] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(!stored?.anchor || Boolean(focus || linkedAnchor))
  const [focusNotice, setFocusNotice] = useState(Boolean(focus))
  const [restored, setRestored] = useState(Boolean(stored?.anchor))
  const toastTimer = useRef<number | undefined>(undefined)
  const resultsRef = useRef<HTMLDivElement>(null)

  const say = useCallback((text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }, [])

  const loadSetup = useCallback(() => {
    setSetupError(false)
    const controller = new AbortController()
    api.getFamilyFitSetup(controller.signal)
      .then(r => { if (r.status === 'available') setSetup(r.data); else setSetupError(true) })
      .catch(() => { if (!controller.signal.aborted) setSetupError(true) })
    api.getFamilyFitShapes(controller.signal).then(r => r.status === 'available' && setShapes(r.data.areas)).catch(() => undefined)
    return () => controller.abort()
  }, [])
  useEffect(loadSetup, [loadSetup])

  const runSearch = useCallback((criteria: Criteria) => {
    if (!criteria.anchor) return
    setLoading(true); setError(null); setErrorCode(null)
    const controller = new AbortController()
    api.searchFamilyFit(criteria.anchor, criteria.radius, criteria.priorities, 30, controller.signal)
      .then(r => {
        if (r.status === 'unavailable') { setResult(null); setErrorCode(r.limitations[0]?.code ?? null); setError(r.limitations[0]?.message ?? 'Results are unavailable right now.') }
        else { setResult(r.data); setShown(PAGE_SIZE) }
      })
      .catch(() => { if (!controller.signal.aborted) setError('We could not load results. Check your connection and try again.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => { if (applied) return runSearch(applied) }, [applied, runSearch])
  useEffect(() => write(SAVED_KEY, saved), [saved])

  const apply = () => {
    if (!draft.anchor) return
    setApplied(draft); write(SEARCH_KEY, draft); setSelected(null); setRestored(false)
    if (window.matchMedia('(max-width: 960px)').matches) { setFiltersOpen(false); resultsRef.current?.scrollIntoView({ behavior: 'smooth' }) }
  }
  const pending = !applied || !sameCriteria(applied, draft)

  const setLevel = (need: string, level: Level) => {
    setEdited(true)
    setDraft(d => {
      const next = { ...d.priorities }
      if (level === 'skip') delete next[need]; else next[need] = level
      return { ...d, priorities: next }
    })
  }
  const setAge = (age: AgeGroup) => setDraft(d => ({ ...d, age, priorities: edited ? d.priorities : suggested(age) }))
  const resetToSuggestions = () => { setEdited(false); setDraft(d => ({ ...d, priorities: suggested(d.age) })) }

  const toggleSave = (item: Saved) => {
    setSaved(list => {
      if (list.some(s => s.id === item.id)) { say(`Removed ${item.name} from saved areas`); return list.filter(s => s.id !== item.id) }
      if (list.length >= MAX_SAVED) { say(`You can save up to ${MAX_SAVED} areas. Remove one to add ${item.name}.`); return list }
      say(`Saved ${item.name}`)
      return [...list, item]
    })
  }

  const startOver = () => {
    const fresh: Criteria = { age: '0-4', anchor: null, radius: 10, priorities: suggested('0-4') }
    setDraft(fresh); setApplied(null); setResult(null); setEdited(false); setRestored(false); setFiltersOpen(true)
    try { window.localStorage.removeItem(SEARCH_KEY) } catch { /* storage unavailable */ }
  }

  const applySuggestion = (s: FamilyFitSearch['suggestions'][number]) => {
    const next = s.type === 'make_preferred'
      ? { ...draft, priorities: { ...draft.priorities, [s.need]: 'prefer' as FamilyFitLevel } }
      : { ...draft, radius: s.radius_km }
    setDraft(next); setApplied(next); write(SEARCH_KEY, next); setRestored(false)
  }

  const needLabel = (id: string) => setup?.needs.find(n => n.id === id)?.label ?? id
  const anchorName = setup?.places.find(p => p.id === draft.anchor)?.name
  const matchingIds = useMemo(() => new Set(result?.map.filter(m => m.status === 'top' || m.status === 'match').map(m => m.id) ?? []), [result])

  const header = <BrandHeader activePage="where" onHome={props.onHome} onInsight={props.onInsight} onMap={props.onMap} onSimulation={props.onSimulation} onHealth={props.onHealth} />

  if (setupError) {
    return <div className="app-background where-page">{header}
      <main className="wl-main"><div className="wl-state" role="alert"><h1>Where to live is unavailable right now</h1>
        <p>We could not load the area data. Please try again.</p>
        <button type="button" className="wl-btn primary" onClick={loadSetup}>Try again</button></div></main></div>
  }

  return <div className="app-background where-page">
    {header}
    <main className="wl-main" id="main">
      <section className="wl-intro" aria-labelledby="wl-title">
        <div>
          <h1 id="wl-title">Find an area that fits your family</h1>
          <p>Compare Greater Melbourne areas by nearby services, outdoor spaces and your family’s priorities.</p>
        </div>
        <button type="button" className="wl-link" onClick={() => setDialog('how')}>How the match score works</button>
      </section>

      <div className="wl-layout">
        <aside className="wl-filters" aria-labelledby="wl-search-title">
          <div className="wl-filters-head">
            <h2 id="wl-search-title">Your search</h2>
            <button type="button" className="wl-btn small wl-filters-toggle" aria-expanded={filtersOpen} aria-controls="wl-filter-body" onClick={() => setFiltersOpen(o => !o)}>
              {filtersOpen ? 'Hide search' : 'Edit search'}
            </button>
          </div>
          {!filtersOpen && applied && <p className="wl-summary">{AGE_LABEL[applied.age]} · within {applied.radius} km of {setup?.places.find(p => p.id === applied.anchor)?.name} · {Object.keys(applied.priorities).length} priorities</p>}
          <div id="wl-filter-body" className={`wl-filter-body ${filtersOpen ? 'is-open' : ''}`}>
            {!setup ? <div className="wl-skeleton" aria-hidden="true"><i /><i /><i /><i /></div> : <>
              <fieldset className="wl-field">
                <legend>Choose an age group to tailor suggestions</legend>
                <div className="wl-seg" role="radiogroup" aria-label="Age group">
                  {(Object.keys(AGE_LABEL) as AgeGroup[]).map(a => <button key={a} type="button" role="radio" aria-checked={draft.age === a} onClick={() => setAge(a)}>{AGE_LABEL[a]}</button>)}
                </div>
                {edited && <p className="wl-help">Your own priority choices are kept. <button type="button" className="wl-link" onClick={resetToSuggestions}>Reset to suggestions for {AGE_LABEL[draft.age]}</button></p>}
              </fieldset>

              <PlacePicker places={setup.places} value={draft.anchor} onChange={id => setDraft(d => ({ ...d, anchor: id }))} />
              {!draft.anchor && <p className="wl-help">Examples: {EXAMPLES.map((id, i) => { const p = setup.places.find(x => x.id === id); return p && <span key={id}>{i > 0 && ', '}<button type="button" className="wl-link" onClick={() => setDraft(d => ({ ...d, anchor: id }))}>{p.name}</button></span> })}</p>}

              <fieldset className="wl-field">
                <legend>Maximum straight-line distance</legend>
                <div className="wl-seg" role="radiogroup" aria-label="Maximum straight-line distance">
                  {setup.radii_km.map(r => <button key={r} type="button" role="radio" aria-checked={draft.radius === r} onClick={() => setDraft(d => ({ ...d, radius: r }))}>{r} km</button>)}
                </div>
              </fieldset>

              <Priorities setup={setup} draft={draft} focus={focusNotice ? focus : null} onDismissFocus={() => setFocusNotice(false)} onLevel={setLevel} />

              <div className="wl-apply">
                {pending && applied && <p className="wl-help" role="status">You have changes that are not shown yet.</p>}
                <button type="button" className="wl-btn primary block" onClick={apply} disabled={!draft.anchor || (!pending && Boolean(applied))}>
                  {!applied ? 'Show matching areas' : 'Update results'}
                </button>
                {!draft.anchor && <p className="wl-help">Choose a suburb to search near first.</p>}
              </div>
            </>}
          </div>
        </aside>

        <section className="wl-results" ref={resultsRef} aria-labelledby="wl-results-title" aria-busy={loading}>
          <div className="wl-results-head">
            <div>
              <h2 id="wl-results-title">{result ? `${result.counts.matching} ${result.counts.matching === 1 ? 'area matches' : 'areas match'}` : 'Matching areas'}</h2>
              {result && <p className="wl-sub">Within {result.radius_km} km of {result.anchor.name}. {result.counts.below_essential > 0 && `${result.counts.below_essential} did not meet an Essential priority. `}{result.counts.data_unavailable > 0 && `${result.counts.data_unavailable} lack data for a chosen priority.`}</p>}
              {result && result.results.length > 0 && saved.length === 0 && <p className="wl-help">Save up to {MAX_SAVED} areas to compare them side by side and build a visit checklist.</p>}
            </div>
            {result && result.results.length > 0 && <div className="wl-seg wl-view" role="radiogroup" aria-label="Show results as">
              {(['list', 'map', 'both'] as View[]).map(v => <button key={v} type="button" role="radio" aria-checked={view === v} className={v === 'both' ? 'wl-wide-only' : undefined} onClick={() => setView(v)}>{v === 'list' ? 'List' : v === 'map' ? 'Map' : 'List and map'}</button>)}
            </div>}
          </div>

          {restored && applied && <p className="wl-notice" role="status">We restored your last search on this device. <button type="button" className="wl-link" onClick={startOver}>Start a new search</button></p>}
          {!applied ? <div className="wl-state"><h3>Start with a suburb</h3><p>Choose where you would like to live near, such as work, family or a school. Then choose what matters most and select “Show matching areas”.</p></div>
            : loading && !result ? <div className="wl-skeleton list" aria-label="Loading results"><i /><i /><i /></div>
            : error ? <div className="wl-state" role="alert"><h3>{errorCode === 'unknown_area' ? 'That suburb is not available' : 'Results did not load'}</h3><p>{error}</p>{errorCode === 'unknown_area'
              ? <button type="button" className="wl-btn primary" onClick={startOver}>Start a new search</button>
              : <button type="button" className="wl-btn primary" onClick={() => runSearch(applied)}>Try again</button>}</div>
            : result && Object.keys(result.priorities).length === 0 ? <div className="wl-state"><h3>Choose at least one priority</h3><p>Set one or more priorities to Prefer or Essential, then update results.</p></div>
            : result && result.results.length === 0 ? <NoMatches result={result} needLabel={needLabel} onApply={applySuggestion} />
            : result && <div className={`wl-views view-${view}`}>
              {view !== 'map' && <div className="wl-list-wrap">
                <ol className="wl-list" aria-label="Matching areas, best match first">
                  {result.results.slice(0, shown).map(r => <ResultCard key={r.id} r={r} anchor={result.anchor.name} saved={saved.some(s => s.id === r.id)} selected={selected === r.id}
                    onSave={() => toggleSave({ id: r.id, name: r.name })} onDetails={() => setDetail(r.id)} onHow={() => setDialog('how')}
                    onShowMap={() => { setSelected(r.id); if (view === 'list') setView('map') }} />)}
                </ol>
                {result.results.length > shown ? <button type="button" className="wl-btn" onClick={() => setShown(s => s + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, result.results.length - shown)} more areas</button>
                  : result.more_available > 0 && <p className="wl-help">Showing the top {result.results.length}. Narrow your search to see others.</p>}
              </div>}
              {view !== 'list' && <WhereMap compact={view === 'both'} shapes={shapes} result={result} selected={selected} onSelect={id => setSelected(id)} onOpen={id => setDetail(id)} />}
            </div>}
          {loading && result && <p className="wl-help" role="status">Updating results…</p>}
          <p className="wl-note">Area-level comparison. It does not describe any home, school, service or child, and it does not confirm childcare vacancies or GP appointments.</p>
        </section>
      </div>

      {saved.length > 0 && <div className="wl-tray" role="region" aria-label="Saved areas">
        <div className="wl-tray-list"><b>Saved ({saved.length} of {MAX_SAVED})</b>
          {saved.map(s => <span key={s.id} className="wl-chip">{s.name}{result && !matchingIds.has(s.id) && <em> · no longer matches your search</em>}
            <button type="button" aria-label={`Remove ${s.name}`} onClick={() => toggleSave(s)}>×</button></span>)}
        </div>
        <div className="wl-tray-actions">
          <button type="button" className="wl-btn" onClick={() => setDialog('checklist')}>Visit checklist</button>
          <button type="button" className="wl-btn primary" disabled={saved.length < 2} onClick={() => setDialog('compare')}>Compare saved areas</button>
          {saved.length < 2 && <span className="wl-help">Save one more area to compare.</span>}
        </div>
      </div>}
      <div className="wl-toast" role="status" aria-live="polite">{toast}</div>
    </main>

    {detail && setup && <DetailPanel id={detail} setup={setup} priorities={applied?.priorities ?? {}} result={result} anchorName={result?.anchor.name}
      saved={saved.some(s => s.id === detail)} onSave={toggleSave} onClose={() => setDetail(null)} onHow={() => setDialog('how')} />}
    {dialog === 'compare' && setup && <CompareDialog ids={saved.map(s => s.id)} setup={setup} priorities={applied?.priorities ?? {}} matching={result ? matchingIds : null} onClose={() => setDialog(null)} />}
    {dialog === 'checklist' && <ChecklistDialog saved={saved} priorities={applied?.priorities ?? draft.priorities} needLabel={needLabel} say={say} onClose={() => setDialog(null)} />}
    {dialog === 'how' && setup && <HowDialog setup={setup} onClose={() => setDialog(null)} />}
  </div>
}

/* ------------------------------------------------------------------ filters */

function PlacePicker({ places, value, onChange }: { places: FamilyFitSetup['places']; value: string | null; onChange: (id: string) => void }) {
  const current = places.find(p => p.id === value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return places.filter(p => p.name.toLowerCase().includes(q) || p.sa3.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q))).slice(0, 8)
  }, [places, query])
  const choose = (id: string) => { onChange(id); setQuery(''); setOpen(false) }
  return <div className="wl-field wl-place">
    <label htmlFor="wl-place-input">Live near</label>
    {current && <p className="wl-selected-place"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></svg><b>{current.name}</b><span>{current.sa3}</span></p>}
    <input id="wl-place-input" type="search" role="combobox" aria-expanded={open && matches.length > 0} aria-controls="wl-place-list" aria-autocomplete="list"
      aria-activedescendant={open && matches[active] ? `wl-place-${matches[active].id}` : undefined}
      placeholder={current ? 'Search for a different suburb' : 'Search for a suburb, for example Box Hill'} value={query}
      onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0) }}
      onKeyDown={e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, matches.length - 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
        if (e.key === 'Enter' && matches[active]) { e.preventDefault(); choose(matches[active].id) }
        if (e.key === 'Escape') setOpen(false)
      }} onBlur={() => window.setTimeout(() => setOpen(false), 150)} />
    {open && query.trim().length >= 2 && <ul id="wl-place-list" role="listbox" className="wl-place-list">
      {matches.length ? matches.map((p, i) => <li key={p.id} id={`wl-place-${p.id}`} role="option" aria-selected={i === active} onMouseDown={e => { e.preventDefault(); choose(p.id) }}><b>{p.name}</b><span>{p.sa3}</span></li>)
        : <li className="wl-empty-option" aria-disabled="true">No Greater Melbourne area matches “{query}”.</li>}
    </ul>}
  </div>
}

function Priorities({ setup, draft, focus, onDismissFocus, onLevel }: { setup: FamilyFitSetup; draft: Criteria; focus: string | null; onDismissFocus: () => void; onLevel: (need: string, level: Level) => void }) {
  const [all, setAll] = useState(false)
  const suggestions = AGE_SUGGESTIONS[draft.age]
  const chosen = Object.keys(draft.priorities)
  const first = [...new Set([...suggestions, ...chosen])]
  const rest = setup.needs.map(n => n.id).filter(id => !first.includes(id))
  const visible = all ? [...first, ...rest] : first
  return <fieldset className="wl-field">
    <legend>What matters most</legend>
    {focus && <p className="wl-notice">We’ve selected <b>{setup.needs.find(n => n.id === focus)?.label}</b> as a priority. You can change this below. <button type="button" className="wl-link" onClick={onDismissFocus}>Dismiss</button></p>}
    <p className="wl-help"><b>Essential</b> shows only areas at or above the Greater Melbourne median for that priority. It compares areas; it does not confirm places, vacancies or appointments.</p>
    <ul className="wl-needs">
      {visible.map(id => {
        const need = setup.needs.find(n => n.id === id)!
        const level: Level = (draft.priorities[id] as FamilyFitLevel | undefined) ?? 'skip'
        return <li key={id} className={level !== 'skip' ? 'is-on' : undefined}>
          <div className="wl-need-text"><b id={`wl-need-${id}`}>{need.label}</b>{suggestions.includes(id) && <span className="wl-tag">Suggested</span>}</div>
          <div className="wl-seg wl-levels" role="radiogroup" aria-labelledby={`wl-need-${id}`}>
            {(['skip', 'prefer', 'essential'] as Level[]).map(l => <button key={l} type="button" role="radio" aria-checked={level === l} data-level={l} onClick={() => onLevel(id, l)}>{LEVEL_LABEL[l]}</button>)}
          </div>
        </li>
      })}
    </ul>
    {rest.length > 0 && <button type="button" className="wl-link" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Show fewer priorities' : `Edit all priorities (${rest.length} more)`}</button>}
  </fieldset>
}

/* ------------------------------------------------------------------ results */

function ResultCard({ r, anchor, saved, selected, onSave, onDetails, onHow, onShowMap }: { r: FamilyFitResult; anchor: string; saved: boolean; selected: boolean; onSave: () => void; onDetails: () => void; onHow: () => void; onShowMap: () => void }) {
  const [why, setWhy] = useState(false)
  return <li className={`wl-card ${selected ? 'is-selected' : ''}`}>
    <div className="wl-card-top">
      <span className="wl-rank" aria-label={`Rank ${r.rank}`}>{r.rank}</span>
      <div className="wl-card-title"><h3>{r.name}</h3><p>{r.distance_km < 0.5 ? `${anchor} itself` : `${r.distance_km.toFixed(1)} km from ${anchor}`}</p></div>
      <button type="button" className={`wl-btn small wl-save ${saved ? 'is-saved' : ''}`} aria-pressed={saved} onClick={onSave}>{saved ? 'Saved' : 'Save'}</button>
    </div>
    <p className="wl-score">Match score <b>{Math.round(r.match)}</b>/100 <button type="button" className="wl-link" onClick={onHow}>What is this?</button></p>
    <ul className="wl-reasons">
      {r.reasons.map(x => <li key={x.need}><span className="wl-dot good" aria-hidden="true" /><span><b>{x.label}</b>: {x.phrase}</span></li>)}
      <li className="wl-limit"><span className="wl-dot warn" aria-hidden="true" /><span>{r.limitation.type === 'weaker_priority'
        ? <><b>{r.limitation.label}</b>: {r.limitation.phrase}</>
        : r.limitation.text}</span></li>
    </ul>
    {r.stability && <div className="wl-stability">
      <span className={`wl-badge ${r.stability.label}`}>{STABILITY_TEXT[r.stability.label]}</span>
      <button type="button" className="wl-link" aria-expanded={why} onClick={() => setWhy(w => !w)}>Why?</button>
      {why && <p className="wl-help">We re-ran this search 200 times, allowing for the small numbers of children counted at school entry in each area. {r.name} stayed in your top 10 in {Math.round(r.stability.share * 100)} of 100 runs. This covers school-entry results only, not service or environment data.</p>}
    </div>}
    <div className="wl-card-actions">
      <button type="button" className="wl-btn" onClick={onDetails}>View area details</button>
      <button type="button" className="wl-link" onClick={onShowMap}>Show on map</button>
    </div>
  </li>
}

function NoMatches({ result, needLabel, onApply }: { result: FamilyFitSearch; needLabel: (id: string) => string; onApply: (s: FamilyFitSearch['suggestions'][number]) => void }) {
  const essentials = Object.entries(result.priorities).filter(([, v]) => v === 'essential').map(([k]) => needLabel(k))
  return <div className="wl-state">
    <h3>No area meets every Essential priority within {result.radius_km} km</h3>
    <p>{result.counts.within_distance} areas are within the distance. {result.counts.below_essential > 0 && `${result.counts.below_essential} fall below the Melbourne median on ${essentials.join(' or ')}. `}{result.counts.data_unavailable > 0 && `${result.counts.data_unavailable} lack data for a chosen priority.`} We never relax an Essential priority without asking.</p>
    {result.suggestions.length > 0 && <ul className="wl-suggestions">{result.suggestions.map((s, i) => <li key={i}>
      <button type="button" className="wl-btn" onClick={() => onApply(s)}>{s.type === 'make_preferred' ? `Make ${s.label} “Prefer” instead of “Essential”` : `Search within ${s.radius_km} km`}</button>
      <span className="wl-help">{s.results} {s.results === 1 ? 'area' : 'areas'} would match</span></li>)}</ul>}
  </div>
}

/* ------------------------------------------------------------------ dialogs */

function Modal({ title, wide, side, onClose, children }: { title: string; wide?: boolean; side?: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  // Opened once on mount; unmounting removes it. (Closing in a cleanup would fire onClose under StrictMode.)
  useEffect(() => { const el = ref.current; if (el && !el.open) el.showModal() }, [])
  return <dialog ref={ref} className={`wl-dialog ${wide ? 'wide' : ''} ${side ? 'side' : ''}`} aria-labelledby="wl-dialog-title" onClose={onClose}
    onClick={e => { if (e.target === ref.current) onClose() }}>
    <div className="wl-dialog-head"><h2 id="wl-dialog-title">{title}</h2><button type="button" className="wl-close" aria-label="Close" onClick={onClose}>×</button></div>
    <div className="wl-dialog-body">{children}</div>
  </dialog>
}

function useArea(id: string) {
  const [state, setState] = useState<{ data: FamilyFitAreaDetail | null; error: boolean }>({ data: null, error: false })
  useEffect(() => {
    const c = new AbortController()
    setState({ data: null, error: false })
    api.getFamilyFitArea(id, c.signal).then(r => setState({ data: r.status === 'available' ? r.data : null, error: r.status !== 'available' }))
      .catch(() => { if (!c.signal.aborted) setState({ data: null, error: true }) })
    return () => c.abort()
  }, [id])
  return state
}

function Bar({ value }: { value: number | null }) {
  return <span className="wl-bar" aria-hidden="true">{value !== null && <span style={{ width: `${value}%` }} />}<i /></span>
}

function DetailPanel({ id, setup, priorities, result, anchorName, saved, onSave, onClose, onHow }: { id: string; setup: FamilyFitSetup; priorities: Record<string, FamilyFitLevel>; result: FamilyFitSearch | null; anchorName?: string; saved: boolean; onSave: (s: Saved) => void; onClose: () => void; onHow: () => void }) {
  const { data, error } = useArea(id)
  const [all, setAll] = useState(false)
  const r = result?.results.find(x => x.id === id)
  const chosen = data ? data.needs.filter(n => priorities[n.id]) : []
  const others = data ? data.needs.filter(n => !priorities[n.id]) : []
  const need = (n: FamilyFitAreaDetail['needs'][number]) => <li key={n.id} className="wl-need-detail">
    <div className="wl-need-row"><b>{n.label}{priorities[n.id] && <span className="wl-tag">{LEVEL_LABEL[priorities[n.id]]}</span>}</b>
      <span>{n.percentile === null ? 'Not enough data' : n.phrase}</span></div>
    <Bar value={n.percentile} />
    <p className="wl-help">{n.percentile !== null && `Better than ${Math.round(n.percentile)}% of Greater Melbourne areas. `}{n.explains}</p>
    <dl className="wl-measures">{n.measures.map(m => <div key={m.id}><dt>{MEASURES[m.id]?.label ?? m.id}{MEASURES[m.id]?.lowerIsBetter && ' (lower is better)'}</dt>
      <dd>{formatMeasure(m.id, m.value)} <span>{MEASURES[m.id]?.unit !== '%' && MEASURES[m.id]?.unit !== '°C' ? `${MEASURES[m.id]?.unit}, ` : ''}{MEASURES[m.id]?.year}</span></dd></div>)}</dl>
    <p className="wl-caveat">{n.does_not_confirm}</p>
  </li>
  return <Modal title={data?.name ?? 'Area details'} side onClose={onClose}>
    {error ? <p role="alert">Details for this area could not be loaded. Close this panel and try again.</p> : !data ? <div className="wl-skeleton list"><i /><i /></div> : <>
      <p className="wl-sub">{data.sa3}{r && anchorName && ` · ${r.distance_km.toFixed(1)} km from ${anchorName}`}</p>
      {r && <p className="wl-score">Match score <b>{Math.round(r.match)}</b>/100 for your priorities <button type="button" className="wl-link" onClick={onHow}>What is this?</button></p>}
      <div className="wl-row"><button type="button" className={`wl-btn ${saved ? 'is-saved' : 'primary'}`} aria-pressed={saved} onClick={() => onSave({ id: data.id, name: data.name })}>{saved ? 'Saved' : 'Save this area'}</button>
        <a className="wl-btn" href={`/map?area=${encodeURIComponent(data.id)}`}>Open on the main map</a></div>
      {chosen.length > 0 && <><h3>Your priorities</h3><ul className="wl-need-list">{chosen.map(need)}</ul></>}
      <h3>Children starting school here</h3>
      <div className="wl-facts">
        <div><span>Change since 2015 (children on track in all five areas)</span><b>{data.school_entry_change.pp === null ? 'Not available' : `${data.school_entry_change.pp > 0 ? '+' : ''}${data.school_entry_change.pp.toFixed(1)} points`}</b><p>{CHANGE_TEXT(data.school_entry_change.flag, data.school_entry_change.pp)}</p></div>
        <div><span>Outlook for the 2027 census</span><b>{data.outlook_2027 ? `About ${Math.round(data.outlook_2027.pct)}% on track` : 'Not available'}</b>
          <p>{data.outlook_2027 && `Likely range ${Math.round(data.outlook_2027.lower80)}–${Math.round(data.outlook_2027.upper80)}% (80% range). `}A model forecast for the area as a whole, from past school-entry results. It says nothing about any one child.</p></div>
      </div>
      {data.children_assessed_2024 !== null && <p className="wl-help">{data.children_assessed_2024} children were assessed here in 2024. Fewer children means more uncertainty, which the adjusted figures allow for.</p>}
      {others.length > 0 && <><button type="button" className="wl-link" aria-expanded={all} onClick={() => setAll(a => !a)}>{all ? 'Hide other measures' : `Show all measures (${others.length} more priorities)`}</button>
        {all && <ul className="wl-need-list">{others.map(need)}</ul>}</>}
      <p className="wl-caveat">Sources: AEDC 2015 and 2024; Cooling and Greening Melbourne 2018; DTP 2019 and 2026; NPI 2024–25; National Health Services Directory 2025; ACECQA 2026; Victorian school locations 2025. Model {setup.model_version}.</p>
    </>}
  </Modal>
}

function CompareDialog({ ids, setup, priorities, matching, onClose }: { ids: string[]; setup: FamilyFitSetup; priorities: Record<string, FamilyFitLevel>; matching: Set<string> | null; onClose: () => void }) {
  const [areas, setAreas] = useState<FamilyFitAreaDetail[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [diffOnly, setDiffOnly] = useState(false)
  const [missing, setMissing] = useState(0)
  useEffect(() => {
    const c = new AbortController()
    Promise.all(ids.map(id => api.getFamilyFitArea(id, c.signal))).then(rs => {
      const ok = rs.filter(r => r.status === 'available' && r.data).map(r => r.data as FamilyFitAreaDetail)
      setMissing(rs.length - ok.length); setAreas(ok)
    })
      .catch(() => { if (!c.signal.aborted) setFailed(true) })
    return () => c.abort()
  }, [ids])
  const order = setup.needs.map(n => n.id).sort((a, b) => Number(Boolean(priorities[b])) - Number(Boolean(priorities[a])))
  return <Modal title="Compare saved areas" wide onClose={onClose}>
    {failed ? <p role="alert">The comparison could not be loaded. Close this window and try again.</p> : !areas ? <div className="wl-skeleton list"><i /><i /></div> : <>
      {missing > 0 && <p className="wl-notice" role="status">{missing === 1 ? 'One saved area is' : `${missing} saved areas are`} no longer in the data and {missing === 1 ? 'is' : 'are'} left out. Remove {missing === 1 ? 'it' : 'them'} from your saved areas.</p>}
      {areas.length === 0 ? <p>None of your saved areas could be loaded.</p> : <>
      <div className="wl-row"><label className="wl-check"><input type="checkbox" checked={diffOnly} onChange={e => setDiffOnly(e.target.checked)} /> Show differences only (10 or more percentile points apart, or data missing)</label></div>
      <div className="wl-table-wrap" tabIndex={0} role="region" aria-label="Comparison table, scrolls if wide"><table className="wl-table">
        <thead><tr><th scope="col">Measure</th>{areas.map(a => <th key={a.id} scope="col" className="num">{a.name}{matching && !matching.has(a.id) && <span className="wl-tag warn">Not in current results</span>}</th>)}</tr></thead>
        <tbody>
          {order.map(nid => {
            const rows = areas.map(a => a.needs.find(n => n.id === nid)!)
            const ps = rows.map(r => r.percentile).filter((p): p is number => p !== null)
            // A missing value is itself a difference worth showing.
            const differs = ps.length < rows.length || Math.max(...ps) - Math.min(...ps) >= 10
            if (diffOnly && !differs) return null
            return [<tr key={nid} className="wl-group"><th scope="rowgroup" colSpan={areas.length + 1}>{rows[0].label}{priorities[nid] && <span className="wl-tag">{LEVEL_LABEL[priorities[nid]]}</span>}</th></tr>,
              <tr key={`${nid}-p`}><td>Better than this share of Melbourne areas<span className="wl-unit">higher is better; the strongest is highlighted</span></td>{rows.map((r, i) => <td key={i} className={`num ${r.percentile !== null && ps.length > 1 && r.percentile === Math.max(...ps) ? 'is-best' : ''}`}>{r.percentile === null ? 'Not available' : `${Math.round(r.percentile)}%`}</td>)}</tr>,
              ...rows[0].measures.map((m, mi) => <tr key={`${nid}-${m.id}`}><td>{MEASURES[m.id]?.label}<span className="wl-unit">{MEASURES[m.id]?.unit}{MEASURES[m.id]?.lowerIsBetter ? ', lower is better' : ''} · {MEASURES[m.id]?.year}</span></td>
                {rows.map((r, i) => <td key={i} className="num">{formatMeasure(m.id, r.measures[mi].value)}</td>)}</tr>)]
          })}
          <tr className="wl-group"><th scope="rowgroup" colSpan={areas.length + 1}>Children starting school</th></tr>
          <tr><td>Change since 2015 (all five areas)<span className="wl-unit">percentage points · AEDC</span></td>{areas.map(a => <td key={a.id} className="num">{a.school_entry_change.pp === null ? '—' : `${a.school_entry_change.pp > 0 ? '+' : ''}${a.school_entry_change.pp.toFixed(1)}`}</td>)}</tr>
          <tr><td>Outlook for 2027<span className="wl-unit">% on track, 80% range · model forecast</span></td>{areas.map(a => <td key={a.id} className="num">{a.outlook_2027 ? `${Math.round(a.outlook_2027.pct)} (${Math.round(a.outlook_2027.lower80)}–${Math.round(a.outlook_2027.upper80)})` : '—'}</td>)}</tr>
        </tbody>
      </table></div>
      <p className="wl-caveat">Area-level figures. They do not confirm childcare vacancies, GP appointments or school enrolment.</p>
    </>}</>}
  </Modal>
}

function ChecklistDialog({ saved, priorities, needLabel, say, onClose }: { saved: Saved[]; priorities: Record<string, FamilyFitLevel>; needLabel: (id: string) => string; say: (t: string) => void; onClose: () => void }) {
  const [done, setDone] = useState<Record<string, boolean>>(() => read(CHECK_KEY, {}))
  useEffect(() => write(CHECK_KEY, done), [done])
  const needs = Object.keys(priorities).filter(n => CHECKLIST[n]).sort((a, b) => Number(priorities[b] === 'essential') - Number(priorities[a] === 'essential'))
  const areas = saved.length ? saved : []
  const text = [`Visit checklist${areas.length ? `: ${areas.map(a => a.name).join(', ')}` : ''}`, '',
    ...needs.flatMap(n => [`${needLabel(n)} (${LEVEL_LABEL[priorities[n]]})`, ...CHECKLIST[n].map(i => `[ ] ${i.text}${i.link ? ` ${i.link[1]}` : ''}`), '']),
    `[ ] ${CHECKLIST_GENERAL}`].join('\n')
  const copy = () => navigator.clipboard?.writeText(text).then(() => say('Checklist copied'), () => say('Copy did not work. Use Download instead.'))
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
    const a = document.createElement('a'); a.href = url; a.download = 'vkinder-visit-checklist.txt'; a.click(); URL.revokeObjectURL(url)
    say('Checklist downloaded')
  }
  return <Modal title="Visit checklist" onClose={onClose}>
    <p className="wl-sub">{areas.length ? `For ${areas.map(a => a.name).join(', ')}. ` : ''}Things the data cannot check for you, from your priorities. Your ticks are saved on this device.</p>
    {needs.length === 0 && <p>Choose some priorities to build a checklist.</p>}
    {needs.map(n => <section key={n} className="wl-check-group"><h3>{needLabel(n)} <span className="wl-tag">{LEVEL_LABEL[priorities[n]]}</span></h3>
      <ul>{CHECKLIST[n].map((item, i) => { const key = `${n}-${i}`; return <li key={key}><label className="wl-check"><input type="checkbox" checked={Boolean(done[key])} onChange={e => setDone(d => ({ ...d, [key]: e.target.checked }))} />
        <span>{item.text}{item.link && <> <a href={item.link[1]} target="_blank" rel="noreferrer">{item.link[0]}<span className="sr-only"> (opens in a new tab)</span></a></>}</span></label></li> })}</ul></section>)}
    <section className="wl-check-group"><ul><li><label className="wl-check"><input type="checkbox" checked={Boolean(done.general)} onChange={e => setDone(d => ({ ...d, general: e.target.checked }))} /><span>{CHECKLIST_GENERAL}</span></label></li></ul></section>
    <div className="wl-row"><button type="button" className="wl-btn primary" onClick={() => window.print()}>Print</button><button type="button" className="wl-btn" onClick={download}>Download</button><button type="button" className="wl-btn" onClick={copy}>Copy</button></div>
  </Modal>
}

function HowDialog({ setup, onClose }: { setup: FamilyFitSetup; onClose: () => void }) {
  const v = setup.validation
  const pct = (x: number) => `${Math.round(x * 100)}%`
  return <Modal title="How the match score works" onClose={onClose}>
    <ol className="wl-how">
      <li>Each priority uses two published measures, such as tree cover and how hot an area runs.</li>
      <li>For every measure, we work out how an area compares with all {v.areas} Greater Melbourne areas, from 0 to 100.</li>
      <li>The match score is the average for your priorities. Essential priorities count twice, and an area must be at or above the Melbourne median on each one.</li>
      <li>Areas without data for a chosen priority are left out, never guessed.</li>
    </ol>
    <p className="wl-notice">The match score is a comparative index. It is not a percentage chance that your family will thrive in an area, and it does not rate any home, school or service.</p>
    <details className="wl-method"><summary>Methodology and testing</summary>
      <ul>
        <li><b>Fair weighting.</b> The previous finder mixed raw percentages with rankings, so two healthcare measures drove {pct(v.old_engine_largest_two_measures_share)} of results in a typical search. Every measure now counts about equally ({pct(v.new_engine_measure_share_range[0])}–{pct(v.new_engine_measure_share_range[1])} each).</li>
        <li><b>Services across borders.</b> GP and childcare access count services in neighbouring areas, weighted by distance and how many people share them. {v.gp_border_credit[0]} of {v.gp_border_credit[1]} areas with no GP inside their border have one nearby.</li>
        <li><b>Small numbers of children.</b> School-entry results from areas with few children are adjusted toward their region. Tested on later results, this cut prediction error by {pct(v.adjustment_error_reduction_range[0])}–{pct(v.adjustment_error_reduction_range[1])} overall and {pct(v.adjustment_small_area_error_reduction_range[0])}–{pct(v.adjustment_small_area_error_reduction_range[1])} for the smallest areas.</li>
        <li><b>Shortlist position.</b> Each search is re-run 200 times with plausible variation in those results, to show which positions could change by chance.</li>
        <li><b>2027 outlook.</b> A ridge regression chosen from five candidates by a rule set in advance. On 2024 results it never saw, it was {pct(v.forecast_skill_vs_persistence)} more accurate than assuming no change (average error {v.forecast_holdout_mae_pp.toFixed(1)} points; ranking agreement {v.forecast_holdout_spearman.toFixed(2)}). Its 80% ranges held {pct(v.forecast_holdout_coverage_80)} of the time in that test, because results fell across Melbourne in 2024; the published ranges are widened to allow for shifts like that.</li>
      </ul>
      <p className="wl-caveat">Model {setup.model_version}, built {setup.built_utc.slice(0, 10)}. Area-level only. The family’s own visit and enquiries are always needed.</p>
    </details>
  </Modal>
}
