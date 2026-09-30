import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import './ChildHealthDrawer.css'

export interface ChildHealthNavigationItem<Id extends string = string> {
  id: Id
  label: string
  symbol: string
}

interface ChildHealthDrawerProps<Id extends string> {
  items: readonly ChildHealthNavigationItem<Id>[]
  current: Id
  onNavigate: (id: Id) => void
}

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function ChildHealthDrawer<Id extends string>({ items, current, onNavigate }: ChildHealthDrawerProps<Id>) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const drawerId = useId()
  const titleId = useId()

  const closeDrawer = useCallback(() => {
    triggerRef.current?.focus()
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }

      if (event.key !== 'Tab' || !drawerRef.current) return
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [closeDrawer, open])

  const navigate = (id: Id) => {
    onNavigate(id)
    closeDrawer()
  }

  const overlay = <>
    <div className={`child-health-drawer-backdrop${open ? ' is-open' : ''}`} aria-hidden="true" onClick={closeDrawer} />
    <aside
      ref={drawerRef}
      id={drawerId}
      className={`child-health-drawer${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-hidden={!open}
      aria-labelledby={titleId}
    >
      <header>
        <div><strong id={titleId}>Child Health</strong><small>Local evidence and care context</small></div>
        <button ref={closeRef} type="button" aria-label="Close Child Health navigation" tabIndex={open ? 0 : -1} onClick={closeDrawer}>×</button>
      </header>
      <nav aria-label="Child Health navigation">
        {items.map((item) => {
          const selected = item.id === current
          return <button key={item.id} type="button" className={selected ? 'is-active' : undefined} aria-current={selected ? 'page' : undefined} tabIndex={open ? 0 : -1} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.symbol}</span><b>{item.label}</b></button>
        })}
      </nav>
      <footer><span aria-hidden="true">⌖</span><div><strong>Melbourne</strong><small>SA2 reporting localities</small></div></footer>
    </aside>
  </>

  return <div className="child-health-drawer-root">
    <button
      ref={triggerRef}
      className="child-health-menu-button"
      type="button"
      aria-label={open ? 'Close Child Health navigation' : 'Open Child Health navigation'}
      aria-controls={drawerId}
      aria-expanded={open}
      onClick={() => open ? closeDrawer() : setOpen(true)}
    >
      <span aria-hidden="true"><i /><i /><i /></span>
    </button>
    {createPortal(overlay, document.body)}
  </div>
}
