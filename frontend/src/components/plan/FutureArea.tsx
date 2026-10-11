/* Your area in 2031: official population projections (Victoria in Future 2023) for children,
   and what they mean for childcare, GPs and primary schools if no new services open.
   Desktop layout: map and year slider on the left, the chosen area on the right. */
import { useEffect, useMemo, useState } from 'react'

import { api, type FutureOverviewRow, type FutureYear } from '../../services/api'
import './FutureArea.css'

type Area = { id: string; name: string }
type Measure = 'growth' | 'childcare'
const YEARS = [2021, 2026, 2031, 2036]

const GROWTH_BINS: Array<[number, string]> = [[-5, 'Fewer (more than 5% down)'], [5, 'About the same (±5%)'], [15, '5–15% more'], [30, '15–30% more'], [Infinity, 'More than 30% more']]
const CARE_BINS: Array<[number, string]> = [[40, 'Under 40'], [60, '40–60'], [80, '60–80'], [100, '80–100'], [Infinity, '100 or more']]
const fmt = (n: number | null | undefined, d = 0) => n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: d })
const signed = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(0)}%`

function bin(value: number | null, bins: Array<[number, string]>) {
  if (value === null || !Number.isFinite(value)) return -1
  return bins.findIndex(([upper]) => value < upper)
}


interface Props {
  /** The Child Health area (SA2). */
  area: Area | null
  /** Selecting an area on the map or in the table changes the Child Health area. */
  onSelectArea: (area: Area) => void
  parent: boolean
}

export default function FutureArea({ area, onSelectArea, parent }: Props) {
  const [year, setYear] = useState(2031)
  const [measure, setMeasure] = useState<Measure>('growth')
  const [playing, setPlaying] = useState(false)
  const [overview, setOverview] = useState<FutureOverviewRow[] | null>(null)
  const [shapes, setShapes] = useState<Record<string, Array<Array<[number, number]>>> | null>(null)
  const [failed, setFailed] = useState(false)
  const [years, setYears] = useState<FutureYear[] | null>(null)
  const [areaError, setAreaError] = useState<string | null>(null)

  useEffect(() => {
    const c = new AbortController()
    Promise.all([api.getFutureOverview(c.signal), api.getFamilyFitShapes(c.signal)]).then(([o, s]) => {
      if (o.status !== 'available') { setFailed(true); return }
      setOverview(o.data.rows); setShapes(s.status === 'available' ? s.data.areas : null)
    }).catch(e => { if (!c.signal.aborted) { console.error(e); setFailed(true) } })
    return () => c.abort()
  }, [])

  useEffect(() => {
    if (!area) { setYears(null); return }
    const c = new AbortController()
    setYears(null); setAreaError(null)
    api.getFutureArea(area.id, c.signal).then(r => {
      if (r.status === 'available') setYears(r.data.years)
      else setAreaError(r.limitations[0]?.message ?? 'This area is not available.')
    }).catch(e => { if (!c.signal.aborted) { console.error(e); setAreaError('Could not load this area. Check your connection and try again.') } })
    return () => c.abort()
  }, [area?.id])

  // Play through the years once.
  useEffect(() => {
    if (!playing) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const t = window.setTimeout(() => {
      const i = YEARS.indexOf(year)
      if (i === YEARS.length - 1) setPlaying(false)
      else setYear(YEARS[i + 1])
    }, reduce ? 300 : 1100)
    return () => window.clearTimeout(t)
  }, [playing, year])

  return <div className="fu-scope">
    <div className="fu-controls">
      <div className="fu-years" role="group" aria-label="Projection year">
        <span className="fu-label">Year</span>
        <div className="wl-seg" role="radiogroup" aria-label="Year">{YEARS.map(y => <button key={y} type="button" role="radio" aria-checked={year === y} onClick={() => { setPlaying(false); setYear(y) }}>{y}</button>)}</div>
        <button type="button" className="wl-btn" onClick={() => { if (!playing && year === 2036) setYear(2021); setPlaying(p => !p) }} aria-pressed={playing}>{playing ? 'Pause' : 'Play 2021 to 2036'}</button>
      </div>
      <p className="fu-sub">{parent
        ? 'How many children will live here, and whether childcare, GPs and schools keep up if nothing new opens.'
        : 'Victoria in Future 2023 projections, with childcare and GP access re-run for each year and today’s services held fixed.'}</p>
    </div>

    {failed ? <div className="wl-state" role="alert"><h2>Projections are unavailable right now</h2><p>Try again in a moment.</p></div>
      : <div className="fu-layout">
        <section className="fu-card fu-mapcard" aria-labelledby="fu-map-title">
          <div className="fu-map-head">
            <h2 id="fu-map-title">{measure === 'growth' ? `Children under 5, change from 2026 to ${year}` : `Childcare places per 100 children under 5, ${year}`}</h2>
            <div className="wl-seg fu-measure" role="radiogroup" aria-label="Colour the map by">
              <button type="button" role="radio" aria-checked={measure === 'growth'} onClick={() => setMeasure('growth')}>Child growth</button>
              <button type="button" role="radio" aria-checked={measure === 'childcare'} onClick={() => setMeasure('childcare')}>Childcare places</button>
            </div>
          </div>
          <FutureMap shapes={shapes} rows={overview} year={year} measure={measure} selected={area?.id ?? null}
            onSelect={(id, name) => onSelectArea({ id, name })} />
          <p className="wl-caveat">Areas are AEDC reporting areas (one or more SA2s). Select an area to make it your Child Health area. Services are held at today’s level.</p>
        </section>

        <aside className="fu-side" aria-live="polite">
          {!area && <div className="fu-card"><h2 className="fu-h">Choose an area</h2><p className="fu-sub">Use the area chooser above or select an area on the map.</p></div>}
          {areaError && <p className="wl-notice pl-warn" role="alert">{areaError}</p>}
          {area && years && <AreaPanel years={years} year={year} />}
          {area && !years && !areaError && <div className="fu-card"><p className="fu-sub" role="status">Loading…</p></div>}
        </aside>
      </div>}

    {overview && !parent && <Fastest rows={overview} year={year} onSelect={onSelectArea} />}

    <details className="fu-card fu-how">
      <summary><h2 className="fu-h">How this works</h2></summary>
      <ul>
        <li><b>Children:</b> Victoria in Future 2023, the Victorian Government’s official population projections by age for every area. Vkinder does not make its own population forecast.</li>
        <li><b>Childcare places per 100 children under 5:</b> approved places within about 5 km, shared fairly between nearby families (the two-step floating catchment method), re-run for each year with that year’s projected children and today’s services.</li>
        <li><b>GP practices per 10,000 residents:</b> the same method with all residents.</li>
        <li><b>Places to keep today’s access:</b> extra approved places that would hold the 2026 level for the projected children; a rough guide that ignores neighbouring areas.</li>
        <li>Projections are scenarios, not certainties. Approved places are licensed capacity, not vacancies. Distances are straight-line.</li>
      </ul>
    </details>
  </div>
}

function AreaPanel({ years, year }: { years: FutureYear[]; year: number }) {
  const base = years.find(y => y.projection_year === 2026)
  const now = years.find(y => y.projection_year === year)
  if (!base || !now) return null
  const change = now.children_0_4_change_from_2026_pct
  const kids = (r: FutureYear) => r.children_0_4 ?? 0
  const rows: Array<[string, number | null, number | null, number, string]> = [
    ['Children under 5', base.children_0_4, now.children_0_4, 0, ''],
    ['Children 5 to 9', base.children_5_9, now.children_5_9, 0, ''],
    ['Children 10 to 14', base.children_10_14, now.children_10_14, 0, ''],
    ['Childcare places per 100 under-5s', base.ecec_places_per_100_0_4, now.ecec_places_per_100_0_4, 0, 'within about 5 km'],
    ['GP practices per 10,000 residents', base.gp_practices_per_10000, now.gp_practices_per_10000, 1, 'within about 5 km'],
    ['Primary school campuses per 1,000 children 5 to 9', base.primary_campuses_per_1000_5_9, now.primary_campuses_per_1000_5_9, 1, `${now.primary_campuses ?? 0} in the area`],
  ]
  const headline = year === 2026 ? `${now.sa2_name} today` : year < 2026
    ? `${now.sa2_name} in ${year}`
    : `By ${year}, about ${fmt(now.children_0_4)} children under 5 in ${now.sa2_name}`
  return <div className="fu-card">
    <p className="pl-eyebrow">{now.sa2_name}</p>
    <h2 className="fu-h">{headline}{year > 2026 && change !== null && <span className={`fu-chip ${change > 5 ? 'is-up' : change < -5 ? 'is-down' : ''}`}>{signed(change)} from 2026</span>}</h2>
    {year > 2026 && now.ecec_places_to_keep_2026_access !== null && now.ecec_places_to_keep_2026_access > 0 &&
      <p className="fu-lead">About <b>{fmt(now.ecec_places_to_keep_2026_access)}</b> more childcare places would keep today’s level of access.</p>}
    {year > 2026 && now.ecec_places_to_keep_2026_access === 0 && <p className="fu-lead">Today’s childcare places would still cover the projected number of under-5s at the same level.</p>}
    <Trend years={years} year={year} />
    <table className="pl-table fu-table">
      <thead><tr><th scope="col">Measure</th><th scope="col">2026</th><th scope="col">{year}</th></tr></thead>
      <tbody>{rows.map(([label, a, b, d, note]) => <tr key={label}>
        <th scope="row">{label}{note && <small>{note}</small>}</th><td>{fmt(a, d)}</td><td><b>{fmt(b, d)}</b></td>
      </tr>)}</tbody>
    </table>
    <p className="wl-caveat">Total {fmt(kids(base) + (base.children_5_9 ?? 0) + (base.children_10_14 ?? 0))} children aged 0–14 in 2026; {fmt(now.children_0_14)} in {year}.</p>
  </div>
}

/** Children by age band, 2021 to 2036, with the chosen year marked. */
function Trend({ years, year }: { years: FutureYear[]; year: number }) {
  const series: Array<[keyof FutureYear, string, string]> = [['children_0_4', 'Under 5', 'fu-s1'], ['children_5_9', '5 to 9', 'fu-s2'], ['children_10_14', '10 to 14', 'fu-s3']]
  const values = years.flatMap(y => series.map(([k]) => Number(y[k] ?? 0)))
  const max = Math.max(...values, 1) * 1.1
  const W = 420, H = 150, L = 40, R = 70, T = 10, B = 26
  const x = (yr: number) => L + (yr - 2021) / 15 * (W - L - R)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const ticks = [0, max / 2 / 1.1, max / 1.1].map(v => Math.round(v / 10) * 10)
  const label = series.map(([k, name]) => `${name}: ${years.map(r => `${r.projection_year} ${fmt(Number(r[k]))}`).join(', ')}`).join('. ')
  return <svg className="fu-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Children by age, 2021 to 2036. ${label}.`}>
    {ticks.map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="fu-grid" /><text x={L - 6} y={y(t) + 4} textAnchor="end" className="fu-axis">{fmt(t)}</text></g>)}
    {YEARS.map(yr => <text key={yr} x={x(yr)} y={H - 6} textAnchor="middle" className={yr === year ? 'fu-axis is-on' : 'fu-axis'}>{yr}</text>)}
    <line x1={x(year)} x2={x(year)} y1={T} y2={H - B} className="fu-now" />
    {series.map(([k, name, cls]) => {
      const pts = years.map(r => [x(r.projection_year), y(Number(r[k] ?? 0))] as const)
      const last = pts[pts.length - 1]
      return <g key={name} className={cls}>
        <polyline points={pts.map(p => p.join(',')).join(' ')} />
        {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={years[i].projection_year === year ? 4.5 : 2.5} />)}
        <text x={last[0] + 8} y={last[1] + 4} className="fu-series">{name}</text>
      </g>
    })}
  </svg>
}

function FutureMap({ shapes, rows, year, measure, selected, onSelect }: {
  shapes: Record<string, Array<Array<[number, number]>>> | null; rows: FutureOverviewRow[] | null; year: number; measure: Measure
  selected: string | null; onSelect: (id: string, name: string) => void
}) {
  const byArea = useMemo(() => {
    if (!rows || !shapes) return new Map<string, { value: number | null; name: string; first: string }>()
    const key = (r: FutureOverviewRow) => `${r.sa2_code}|${r.projection_year}`
    const index = new Map(rows.map(r => [key(r), r]))
    const out = new Map<string, { value: number | null; name: string; first: string }>()
    for (const id of Object.keys(shapes)) {
      const parts = id.split('_')
      const now = parts.map(p => index.get(`${p}|${year}`)).filter(Boolean) as FutureOverviewRow[]
      const base = parts.map(p => index.get(`${p}|2026`)).filter(Boolean) as FutureOverviewRow[]
      if (!now.length) continue
      const kids = now.reduce((t, r) => t + (r.children_0_4 ?? 0), 0)
      let value: number | null
      if (measure === 'growth') {
        const b = base.reduce((t, r) => t + (r.children_0_4 ?? 0), 0)
        value = b > 0 ? (kids / b - 1) * 100 : null
      } else {
        value = kids > 0 ? now.reduce((t, r) => t + (r.ecec_places_per_100_0_4 ?? 0) * (r.children_0_4 ?? 0), 0) / kids : null
      }
      out.set(id, { value, name: now.map(r => r.sa2_name).join(' and '), first: parts[0] })
    }
    return out
  }, [rows, shapes, year, measure])

  if (!shapes || !rows) return <div className="fu-map fu-loading" role="status">Loading the map…</div>
  const all = Object.values(shapes).flat(2)
  const lons = all.map(p => p[0]), lats = all.map(p => p[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180)
  const W = 1000, H = Math.round(W * (maxLat - minLat) / ((maxLon - minLon) * k))
  const px = (lon: number) => (lon - minLon) / (maxLon - minLon) * W
  const py = (lat: number) => (maxLat - lat) / (maxLat - minLat) * H
  const bins = measure === 'growth' ? GROWTH_BINS : CARE_BINS
  const prefix = measure === 'growth' ? 'g' : 'c'
  const selectedKey = selected ? Object.keys(shapes).find(id => id.split('_').includes(selected)) : undefined
  return <div className="fu-map">
    <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Map of Greater Melbourne areas coloured by ${measure === 'growth' ? 'change in children under 5' : 'childcare places per 100 children under 5'}`}>
      {Object.entries(shapes).map(([id, rings]) => {
        const info = byArea.get(id)
        const b = bin(info?.value ?? null, bins)
        const d = rings.map(ring => 'M' + ring.map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join('L') + 'Z').join('')
        return <path key={id} d={d} className={`fu-area-shape ${b < 0 ? 'nodata' : `${prefix}${b}`}${id === selectedKey ? ' is-sel' : ''}`}
          onClick={() => info && onSelect(info.first, info.name)}>
          <title>{info ? `${info.name}: ${info.value === null ? 'no data' : measure === 'growth' ? signed(info.value) : `${info.value.toFixed(0)} places per 100`}` : id}</title>
        </path>
      })}
      {selectedKey && shapes[selectedKey].map((ring, i) => <path key={i} className="fu-sel-outline" d={'M' + ring.map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join('L') + 'Z'} />)}
    </svg>
    <ul className="fu-legend" aria-label="Legend">
      {bins.map(([, text], i) => <li key={text}><i className={`${prefix}${i}`} aria-hidden="true" />{text}</li>)}
      <li><i aria-hidden="true" />No data</li>
    </ul>
  </div>
}

function Fastest({ rows, year, onSelect }: { rows: FutureOverviewRow[]; year: number; onSelect: (a: Area) => void }) {
  if (year <= 2026) return null
  const top = rows.filter(r => r.projection_year === year && r.children_0_4_change_from_2026_pct !== null && (r.children_0_4 ?? 0) >= 200)
    .sort((a, b) => (b.ecec_places_to_keep_2026_access ?? 0) - (a.ecec_places_to_keep_2026_access ?? 0)).slice(0, 10)
  return <section className="fu-card" aria-labelledby="fu-fast">
    <h2 id="fu-fast" className="fu-h">Where childcare pressure grows most by {year}</h2>
    <p className="fu-sub">Areas needing the most extra places to keep today’s access, if nothing new opens.</p>
    <table className="pl-table fu-table">
      <thead><tr><th scope="col">Area</th><th scope="col">Under-5s in {year}</th><th scope="col">Change from 2026</th><th scope="col">Places per 100</th><th scope="col">Extra places to keep access</th></tr></thead>
      <tbody>{top.map(r => <tr key={r.sa2_code}>
        <th scope="row"><button type="button" className="wl-link" onClick={() => onSelect({ id: r.sa2_code, name: r.sa2_name })}>{r.sa2_name}</button></th>
        <td>{fmt(r.children_0_4)}</td><td>{signed(r.children_0_4_change_from_2026_pct!)}</td><td>{fmt(r.ecec_places_per_100_0_4)}</td><td><b>{fmt(r.ecec_places_to_keep_2026_access)}</b></td>
      </tr>)}</tbody>
    </table>
  </section>
}
