import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'

export type Theme = 'light' | 'dark'
export const THEME_STORAGE_KEY = 'kinderprint-theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    'content', theme === 'dark' ? '#091525' : '#edf4ff',
  )
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // The head script restores this before the first paint, including on full-page navigation.
  const [theme, updateTheme] = useState<Theme>(
    () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )

  const setTheme = useCallback((nextTheme: Theme) => {
    if (document.documentElement.dataset.theme === nextTheme) return
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // Switching still works when browser storage is unavailable.
    }
    const change = () => {
      applyTheme(nextTheme)
      flushSync(() => updateTheme(nextTheme))
    }
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(change)
    } else {
      change()
    }
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const syncPreference = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || (event.key !== THEME_STORAGE_KEY && event.key !== null)) return
      const nextTheme = event.newValue === 'dark' ? 'dark' : 'light'
      applyTheme(nextTheme)
      updateTheme(nextTheme)
    }
    window.addEventListener('storage', syncPreference)
    return () => window.removeEventListener('storage', syncPreference)
  }, [])

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme requires ThemeProvider')
  return context
}
