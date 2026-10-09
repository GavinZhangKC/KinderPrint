import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useTheme } from '../theme/ThemeProvider'
import '../styles/theme-switcher.css'

export default function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const controlRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextTheme = event.key === 'ArrowLeft' || event.key === 'Home' ? 'light' : 'dark'
    setTheme(nextTheme)
    controlRef.current?.querySelector<HTMLButtonElement>(`[data-theme-option="${nextTheme}"]`)?.focus()
  }

  return (
    <div ref={controlRef} className="theme-switcher" data-active-theme={theme} role="group" aria-label="Website theme" onKeyDown={handleKeyDown}>
      <span className="theme-switcher__indicator" aria-hidden="true" />
      <button type="button" data-theme-option="light" aria-label="Light mode" aria-pressed={theme === 'light'} title="Light mode" onClick={() => setTheme('light')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </button>
      <button type="button" data-theme-option="dark" aria-label="Midnight Glass dark mode" aria-pressed={theme === 'dark'} title="Midnight Glass" onClick={() => setTheme('dark')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" />
        </svg>
      </button>
    </div>
  )
}
