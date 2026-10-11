/* Where to live, with a second view: "What if this area changed?" (Plan a change). */
import { useState } from 'react'

import BrandHeader from '../BrandHeader'
import PlanChange from '../plan/PlanChange'
import WhereToLive from './WhereToLive'
import '../plan/PlanChange.css'

interface Props {
  onHome: () => void
  onInsight: () => void
  onMap: () => void
  onSimulation: () => void
  onHealth: () => void
}
type View = 'find' | 'plan'

export default function WhereToLivePage(props: Props) {
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).get('view') === 'plan' ? 'plan' : 'find')
  const choose = (next: View) => {
    setView(next)
    const q = new URLSearchParams(next === 'plan' ? window.location.search : '')
    if (next === 'plan') q.set('view', 'plan')
    window.history.replaceState(null, '', `/where-to-live${q.toString() ? `?${q}` : ''}`)
    window.scrollTo({ top: 0 })
  }
  const viewSwitch = <div className="wl-seg wl-view-switch" role="radiogroup" aria-label="Where to live view">
    <button type="button" role="radio" aria-checked={view === 'find'} onClick={() => choose('find')}>Find an area</button>
    <button type="button" role="radio" aria-checked={view === 'plan'} onClick={() => choose('plan')}>What if this area changed?</button>
  </div>
  if (view === 'find') return <WhereToLive {...props} viewSwitch={viewSwitch} />
  return <div className="app-background where-page plan-page">
    <BrandHeader activePage="where" onHome={props.onHome} onInsight={props.onInsight} onMap={props.onMap} onSimulation={props.onSimulation} onHealth={props.onHealth} />
    <PlanChange {...props} embedded viewSwitch={viewSwitch} />
  </div>
}
