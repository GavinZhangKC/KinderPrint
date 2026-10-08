/** Shared building blocks for the KinderHub pages. */
import { useEffect, useState, type ReactNode } from 'react'

import { readStored, writeStored } from '../health/healthPlanning'

export type Loaded<T> = { data: T | null; loading: boolean; error?: string | null }

export const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const km = (value: number | null | undefined) => value === null || value === undefined ? '—' : value < 1 ? `${Math.round(value * 1000)} m` : `${value.toFixed(1)} km`

export const pct = (value: number | null | undefined, digits = 1) => value === null || value === undefined ? '—' : `${value.toFixed(digits)}%`

export const inHundred = (value: number | null | undefined) => value === null || value === undefined ? '—' : `${Math.round(value)} in 100`

export const count = (value: number | null | undefined) => value === null || value === undefined ? '—' : Math.round(value).toLocaleString('en-AU')

export function useEndpoint<T>(load: (signal: AbortSignal) => Promise<{ data: T }>, key: string): Loaded<T> {
  const [state, setState] = useState<Loaded<T>>({ data: null, loading: true, error: null })
  useEffect(() => {
    const controller = new AbortController()
    setState({ data: null, loading: true, error: null })
    load(controller.signal)
      .then(response => setState({ data: response.data, loading: false, error: null }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setState({ data: null, loading: false, error: 'This data section could not be loaded.' }) })
    return () => controller.abort()
    // The loader closes over the locality id, which is the key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

export function useStored<T>(key: string, fallback: T): [T, (value: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, fallback))
  useEffect(() => writeStored(key, value), [key, value])
  return [value, setValue]
}

export function Geo({ children }: { children: ReactNode }) {
  return <span className="kh-tag kh-geo">{children}</span>
}

export function Card({ title, sub, aside, children, className = '' }: { title: ReactNode; sub?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`kh-card ${className}`}>
    <header className="kh-card-h"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{aside}</header>
    {children}
  </section>
}

