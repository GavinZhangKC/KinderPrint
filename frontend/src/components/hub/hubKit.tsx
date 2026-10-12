/**
 * Shared building blocks for the themed Child Health pages: data loading, the accessible dialog,
 * tabs, the hero and small number helpers. Same markup and classes as the Vaccines page.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export const has = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value)
export const slug = (value: string) => value.replace(/\W+/g, '-').replace(/^-|-$/g, '').toLowerCase()
export const ordinal = (n: number) => { const r = Math.round(n); const s = r % 100 >= 11 && r % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][r % 10] ?? 'th'; return `${r}${s}` }
export const pct = (value: number | null | undefined, digits = 1) => has(value) ? `${value.toFixed(digits)}%` : '—'
export const inHundred = (value: number | null | undefined) => has(value) ? `${Math.round(value)} in 100` : '—'
export const money = (value: number | null | undefined) => has(value) ? `$${value.toFixed(2)}` : '—'
export const directionsTo = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTHS_SHORT = MONTHS.map(m => m.slice(0, 3))

export function useLoad<T>(load: (signal: AbortSignal) => Promise<{ data: T }>, key: string) {
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

/** Native <dialog>: focus moves in, Escape and the backdrop close it. */
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const el = ref.current; if (el && !el.open) el.showModal() }, [])
  return <dialog ref={ref} className="vx-dialog" aria-labelledby="hp-dialog-title" onClose={onClose} onClick={event => { if (event.target === ref.current) onClose() }}>
    <div className="vx-dialog-body">
      <div className="vx-dialog-head"><h2 id="hp-dialog-title">{title}</h2><button type="button" className="vx-close" aria-label="Close" onClick={onClose}>×</button></div>
      {children}
    </div>
  </dialog>
}

export function Tabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: Array<[T, string]>; value: T; onChange: (value: T) => void }) {
  return <div className="ht-facets vx-tabs" role="tablist" aria-label={label}>{tabs.map(([id, text]) => <button key={id} type="button" role="tab" id={`hp-tab-${id}`} aria-selected={value === id} aria-controls="hp-panel" onClick={() => onChange(id)}>{text}</button>)}</div>
}

export function TabPanel({ tab, children }: { tab: string; children: ReactNode }) {
  return <div id="hp-panel" role="tabpanel" aria-labelledby={`hp-tab-${tab}`} className="vx-tabpanel">{children}</div>
}

export function Hero({ parent, title, text }: { parent: boolean; title: string; text: string }) {
  return <section className="kt-hero ht-hero" aria-label="Introduction">
    <img src={parent ? '/health-assets/today-parent.webp' : '/health-assets/today-practitioner.jpg'} alt={parent ? 'A mother lifting her smiling baby in a sunny park' : 'A healthcare professional in protective gear gently holding an infant'} className="kt-hero-img" />
    <div className="kt-hero-text"><h1>{title}</h1><p>{text}</p></div>
  </section>
}

/** One summary block at the top of a page: an eyebrow, the main line, optional detail and actions. */
export function Summary({ id, eyebrow, children, actions }: { id: string; eyebrow: string; children: ReactNode; actions?: ReactNode }) {
  return <section className="kt-card kt-tint vx-summary" aria-labelledby={id}>
    <div><h2 id={id} className="vx-eyebrow">{eyebrow}</h2>{children}</div>
    {actions && <div className="vx-summary-act">{actions}</div>}
  </section>
}

/** A horizontal value bar with an optional comparison tick (for example the median of all areas). */
export function Bar({ value, max = 100, tick, label }: { value: number; max?: number; tick?: number | null; label: string }) {
  return <span className="vx-bar hp-bar" role="img" aria-label={label}><span style={{ width: `${Math.max(0, Math.min(100, value / max * 100))}%` }} />{has(tick) && <i style={{ left: `${Math.max(0, Math.min(100, tick / max * 100))}%` }} />}</span>
}
