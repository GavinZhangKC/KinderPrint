/**
 * Overview map for "Where to live": every area coloured by what the search did with it, the
 * stay-near ring, a scale bar and numbered top results. The list view is the text alternative;
 * every top result is also a keyboard-focusable button here.
 */
import { useEffect, useMemo, useState } from 'react'
import type { FamilyFitMapStatus, FamilyFitSearch } from '../../services/api'

interface Props {
  shapes: Record<string, Array<Array<[number, number]>>> | null
  result: FamilyFitSearch
  selected: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  /** Narrower column ("List and map"): draw labels and pins larger so they stay readable. */
  compact?: boolean
}

const STATUS_LABEL: Record<Exclude<FamilyFitMapStatus, 'outside'>, string> = {
  top: 'Top results (numbered)',
  match: 'Other matching areas',
  filtered_out: 'Below the median on an Essential priority',
  no_data: 'Data unavailable for a chosen priority',
}

export default function WhereMap({ shapes, result, selected, onSelect, onOpen, compact = false }: Props) {
  const anchor = result.anchor
  const k = Math.cos((anchor.latitude * Math.PI) / 180)
  // Project to kilometres around the anchor: x east, y south.
  const px = (lon: number) => (lon - anchor.longitude) * 111.32 * k
  const py = (lat: number) => (anchor.latitude - lat) * 110.57
  const half = result.radius_km * 1.25
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [full])
  const status = useMemo(() => new Map(result.map.map(m => [m.id, m.status])), [result])
  const numbers = useMemo(() => new Map(result.results.slice(0, 10).map(r => [r.id, r.rank])), [result])

  if (!shapes) return <div className="wl-map wl-map-loading" role="status">Loading the map…</div>

  const paths = Object.entries(shapes).map(([id, rings]) => {
    const d = rings.map(ring => 'M' + ring.map(([lon, lat]) => `${px(lon).toFixed(2)},${py(lat).toFixed(2)}`).join('L') + 'Z').join('')
    const s = status.get(id) ?? 'outside'
    return { id, d, s }
  })
  const scaleKm = result.radius_km <= 5 ? 1 : result.radius_km <= 10 ? 2 : 5
  const top = result.results.slice(0, 10)
  const sel = result.results.find(r => r.id === selected)
  // Narrow screens: bigger labels; a full-screen portrait map also shows more north-south.
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches
  const tall = full && typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  const vh = tall ? 1.25 : 0.82   // half-height of the view, as a share of `half`
  const font = half / (narrow ? 12 : compact ? 17 : 26)
  // Spread pins that would overlap (areas whose centres are close), so every number stays readable.
  const pins = new Map<string, [number, number]>()
  for (const r of top) {
    let x = px(r.longitude), y = py(r.latitude)
    for (let step = 0; step < 12; step++) {
      const clash = [...pins.values()].find(([qx, qy]) => Math.hypot(qx - x, qy - y) < font * 2.3)
      if (!clash) break
      const dx = x - clash[0], dy = y - clash[1], d = Math.hypot(dx, dy) || 1
      x = clash[0] + (dx / d) * font * 2.4; y = clash[1] + (dy / d || 1) * font * 2.4
    }
    pins.set(r.id, [x, y])
  }
  // Label the top 3 and the selected area. Put each label right of its pin, else left, else
  // leave it out (the list names every area), so labels never cover another pin.
  const labelSide = new Map<string, 'right' | 'left'>()
  // Placed label boxes [x0, x1, y]; the anchor's own label is reserved first.
  const boxes: Array<[number, number, number]> = [[-font * 0.6, font * 1.1 + anchor.name.length * font * 0.62, 0]]
  const ordered = [...top].sort((a, b) => Number(b.id === selected) - Number(a.id === selected) || a.rank - b.rank)
  for (const r of ordered) {
    // Full map: try to name every numbered area. Narrow split view: top 3 and the selected one.
    if (!(r.id === selected || r.rank <= 3 || (!compact && r.rank <= 10))) continue
    const [x, y] = pins.get(r.id)!
    const w = r.name.length * font * 0.58 + font * 1.4
    const free = (x0: number, x1: number) => x0 > -half + font * 0.3 && x1 < half - font * 0.3 && [...pins.entries()].every(([id, [qx, qy]]) =>
      id === r.id || Math.abs(qy - y) > font * 1.6 || qx + font < x0 || qx - font > x1)
      && boxes.every(([bx0, bx1, by]) => Math.abs(by - y) > font * 1.3 || bx1 < x0 || bx0 > x1)
    if (free(x, x + w)) { labelSide.set(r.id, 'right'); boxes.push([x, x + w, y]) }
    else if (free(x - w, x)) { labelSide.set(r.id, 'left'); boxes.push([x - w, x, y]) }
  }

  return <figure className={`wl-map ${full ? 'is-full' : ''}`} aria-label={full ? 'Map, full screen' : undefined}>
    <div className="wl-map-tools">
      <button type="button" className="wl-btn small" aria-pressed={full} onClick={() => setFull(f => !f)}>{full ? 'Exit full screen' : 'Full screen map'}</button>
    </div>
    <svg viewBox={`${-half} ${-half * vh} ${2 * half} ${2 * vh * half}`} role="group"
      aria-label={`Map of areas within ${result.radius_km} km of ${anchor.name}. ${result.counts.matching} areas match; the top ${top.length} are numbered. The list view gives the same information as text.`}>
      <defs>
        <pattern id="wl-hatch" width={half / 40} height={half / 40} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={half / 40} height={half / 40} fill="var(--wl-map-filtered)" /><line x1="0" y1="0" x2="0" y2={half / 40} stroke="var(--wl-map-line)" strokeWidth={half / 160} />
        </pattern>
        <pattern id="wl-dots" width={half / 40} height={half / 40} patternUnits="userSpaceOnUse">
          <rect width={half / 40} height={half / 40} fill="var(--wl-map-nodata)" /><circle cx={half / 80} cy={half / 80} r={half / 260} fill="var(--wl-map-line)" />
        </pattern>
      </defs>
      <rect x={-half} y={-half} width={2 * half} height={2 * half} fill="var(--wl-map-sea)" />
      {paths.map(p => <path key={p.id} d={p.d}
        fill={p.s === 'top' ? 'var(--wl-map-top)' : p.s === 'match' ? 'var(--wl-map-match)' : p.s === 'filtered_out' ? 'url(#wl-hatch)' : p.s === 'no_data' ? 'url(#wl-dots)' : 'var(--wl-map-outside)'}
        stroke={p.id === selected ? 'var(--wl-ink)' : 'var(--wl-map-stroke)'} strokeWidth={p.id === selected ? half / 90 : half / 400}
        onClick={() => (p.s === 'top' || p.s === 'match') && onSelect(p.id)} style={{ cursor: p.s === 'top' || p.s === 'match' ? 'pointer' : 'default' }}>
        <title>{p.s === 'outside' ? 'Outside your search distance' : STATUS_LABEL[p.s as Exclude<FamilyFitMapStatus, 'outside'>]}</title>
      </path>)}
      <circle cx={0} cy={0} r={result.radius_km} fill="none" stroke="var(--wl-brand)" strokeWidth={half / 220} strokeDasharray={`${half / 60} ${half / 80}`} />
      <rect x={-font * 0.55} y={-font * 0.55} width={font * 1.1} height={font * 1.1} transform="rotate(45)" fill="var(--wl-ink)" />
      <text x={font * 1.1} y={font * 0.4} fontSize={font * 1.05} fontWeight={800} fill="var(--wl-ink)" stroke="var(--wl-surface)" strokeWidth={font * 0.3} strokeLinejoin="round" paintOrder="stroke" className="wl-map-label">{anchor.name}</text>
      {[...top].reverse().map(r => {
        const [x, y] = pins.get(r.id)!
        const isSel = r.id === selected
        return <g key={r.id} className="wl-pin" role="button" tabIndex={0} aria-label={`${r.rank}. ${r.name}, match score ${Math.round(r.match)}. Open details`}
          onClick={() => { onSelect(r.id); onOpen(r.id) }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.id); onOpen(r.id) } }}>
          <circle cx={x} cy={y} r={font * (isSel ? 1.25 : 1)} fill={isSel ? 'var(--wl-ink)' : 'var(--wl-brand)'} stroke="var(--wl-surface)" strokeWidth={font / 4} />
          <text x={x} y={y + font * 0.38} textAnchor="middle" fontSize={font * 1.05} fontWeight={800} fill="#fff">{numbers.get(r.id)}</text>
          {labelSide.has(r.id) && <text x={labelSide.get(r.id) === 'right' ? x + font * 1.4 : x - font * 1.4} textAnchor={labelSide.get(r.id) === 'right' ? 'start' : 'end'} y={y + font * 0.38} fontSize={font * 0.95} fontWeight={700} fill="var(--wl-ink)" stroke="var(--wl-surface)" strokeWidth={font * 0.3} strokeLinejoin="round" paintOrder="stroke" className="wl-map-label">{r.name}</text>}
        </g>
      })}
      <g transform={`translate(${-half + half * 0.06} ${half * vh - half * 0.08})`}>
        <rect x={-font * 0.4} y={-font * 1.6} width={scaleKm + font * 4.4} height={font * 2.3} rx={font * 0.3} fill="var(--wl-surface)" opacity={0.92} />
        <line x1={0} y1={0} x2={scaleKm} y2={0} stroke="var(--wl-ink)" strokeWidth={half / 160} />
        <line x1={0} y1={-font * 0.3} x2={0} y2={font * 0.3} stroke="var(--wl-ink)" strokeWidth={half / 200} />
        <line x1={scaleKm} y1={-font * 0.3} x2={scaleKm} y2={font * 0.3} stroke="var(--wl-ink)" strokeWidth={half / 200} />
        <text x={scaleKm + font * 0.4} y={font * 0.35} fontSize={font * 0.9} fill="var(--wl-ink)" fontWeight={700}>{scaleKm} km</text>
      </g>
    </svg>
    <figcaption className="wl-legend">
      <span><i className="sw top" />{STATUS_LABEL.top}</span>
      <span><i className="sw match" />{STATUS_LABEL.match}</span>
      <span><i className="sw filtered" />{STATUS_LABEL.filtered_out}</span>
      <span><i className="sw nodata" />{STATUS_LABEL.no_data}</span>
      <span><i className="sw ring" />{result.radius_km} km straight-line distance from {anchor.name}</span>
    </figcaption>
    {sel && <p className="wl-help">Selected: <b>{sel.rank}. {sel.name}</b>. <button type="button" className="wl-link" onClick={() => onOpen(sel.id)}>View area details</button></p>}
  </figure>
}
