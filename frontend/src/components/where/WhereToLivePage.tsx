/* Where to live, in the same page template as Child Health: hero, Parent / Practitioner switch.
 * Parents: "Find an area" (area matching). Practitioners: "What if this area changed?" (Plan a change).
 * The audience is shared with Child Health, so a practitioner stays a practitioner across pages. */
import { useEffect, useState } from 'react'

import BrandHeader from '../BrandHeader'
import PlanChange from '../plan/PlanChange'
import { Hero } from '../hub/hubKit'
import WhereToLive from './WhereToLive'
import '../DigitalHealthHub.css'
import '../DigitalHealthHub.health.css'
import '../hub/KinderHub.css'
import '../hub/TodayPage.css'
import '../hub/HubPages.css'
import '../plan/PlanChange.css'
import '../plan/FutureArea.css'
import './WhereToLive.css'

interface Props {
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
  onHealth: () => void
}
type Audience = 'parent' | 'practitioner'

const AUDIENCE_KEY = 'kinderprint-audience'

function initialAudience(): Audience {
  const view = new URLSearchParams(window.location.search).get('view')
  if (view === 'plan') return 'practitioner'
  if (view === 'find') return 'parent'
  try {
    const stored = JSON.parse(window.localStorage.getItem(AUDIENCE_KEY) ?? 'null')
    if (stored === 'parent' || stored === 'practitioner') return stored
  } catch { /* storage unavailable */ }
  return 'parent'
}

const COPY = {
  parent: {
    label: 'Find an area',
    title: 'Find an area that fits your family',
    text: 'Compare Greater Melbourne areas by nearby services, outdoor spaces and what matters most to your family.',
  },
  practitioner: {
    label: 'What if this area changed?',
    title: 'What if this area changed?',
    text: 'Choose an area and a planned change, such as more tree cover or cooler streets. See how children are doing in similar Melbourne areas that already have it.',
  },
} as const

export default function WhereToLivePage(props: Props) {
  const [audience, setAudienceState] = useState<Audience>(initialAudience)
  const parent = audience === 'parent'
  const copy = COPY[audience]

  const setAudience = (next: Audience) => {
    setAudienceState(next)
    try { window.localStorage.setItem(AUDIENCE_KEY, JSON.stringify(next)) } catch { /* storage unavailable */ }
    // Keep the address shareable; the plan view keeps its own area and plan in the query.
    const q = new URLSearchParams(next === 'practitioner' ? window.location.search : '')
    if (next === 'practitioner') q.set('view', 'plan'); else q.delete('view')
    window.history.replaceState(null, '', `/where-to-live${q.toString() ? `?${q}` : ''}`)
    window.scrollTo({ top: 0 })
  }

  // The site header and page background take the same audience theme as Child Health.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.ktTheme = parent ? 'parent' : 'prac'
    return () => { delete root.dataset.ktTheme }
  }, [parent])

  return <div className="health-page-shell wl-page-shell">
    <BrandHeader activePage="where" onHome={props.onHome} onInsight={props.onInsight} onMap={props.onMap} onSimulation={props.onSimulation} onHealth={props.onHealth} />
    <div className="digital-health-hub dh-global-shell">
      <div className={`kp-hub ${parent ? 'is-parent kt-theme-parent' : 'is-practitioner kt-theme-prac'}`}>
        <div className="kh-shell">
          <header className="kh-top">
            <p className="kh-nav wl-hub-label"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></svg>{copy.label}</p>
            <div className="kh-seg" role="group" aria-label="Who is using Vkinder">
              <button type="button" aria-pressed={parent} onClick={() => setAudience('parent')}>Parent</button>
              <button type="button" aria-pressed={!parent} onClick={() => setAudience('practitioner')}>Practitioner</button>
            </div>
          </header>
          <div className={`kt ht vx hp where-page fu-hub wl-hub ${parent ? 'kt-parent' : 'kt-prac'}`} key={audience}>
            <Hero parent={parent} title={copy.title} text={copy.text} />
            {parent
              ? <WhereToLive {...props} bare />
              : <PlanChange {...props} embedded audience="practitioner" />}
          </div>
        </div>
      </div>
    </div>
  </div>
}
