import type { NeighbourhoodProfile } from '../../services/api'
import { formatMetric, validMetric, type EvidenceState } from './useInsightData'

function Metric({ profile, id, unit, note }: { profile: NeighbourhoodProfile; id: string; unit: string; note?: string }) {
  const item = validMetric(profile, id, unit)
  const sourceItem = profile.domains.flatMap(domain => domain.indicators).find(indicator => indicator.id === id)
  if (!item) return <div className="insight-metric insight-metric--missing"><strong>Not available</strong><span>{sourceItem?.name ?? 'This indicator'}</span><small>A compatible value with confirmed source, year and unit is not available.</small></div>
  return <div className="insight-metric" data-metric={id}>
    <strong>{formatMetric(item)}</strong><span>{item.name}</span>
    {note && <small>{note}</small>}
    <cite>{item.source} · {item.reference_year} · {item.geographic_unit}</cite>
  </div>
}

export default function ChapterEvidence({ chapter, state, retry }: { chapter: number; state: EvidenceState; retry: () => void }) {
  if (chapter >= 5) return null
  if (state.status !== 'ready') return <div className="insight-data-state" role="status">
    <span className={state.status === 'loading' ? 'insight-loading-dot' : ''} />
    <p>{state.message}</p>
    {state.status !== 'loading' && <button type="button" className="button secondary" onClick={retry}>Retry evidence</button>}
  </div>
  const profile = state.profile.data
  const area = profile.neighbourhood
  const priority = state.priority
  const prioritySource = priority?.metadata.source
  const priorityYear = priority?.metadata.reference_year
  const validPriority = priority?.data.priority_band && typeof prioritySource === 'string' && prioritySource !== 'TBC' && (typeof priorityYear === 'string' || typeof priorityYear === 'number') && priorityYear !== 'TBC' && priority.metadata.geographic_unit === area.geographic_unit
  return <div className="insight-evidence" data-neighbourhood={area.id}>
    <p className="insight-example">A closer look <span>{area.name || area.id}</span></p>
    {chapter === 0 && <>
      <Metric profile={profile} id="census_children_0_4_pct" unit="percent" note="Share of the area's usual resident population aged 0–4." />
    </>}
    {chapter === 1 && <>
      <Metric profile={profile} id="env_urban_heat" unit="degrees Celsius" note="Heat island effect; not air temperature or a weather forecast." />
    </>}
    {chapter === 2 && <>
      <div className="insight-metrics insight-metrics--paired">
        <Metric profile={profile} id="env_vegetation_cover" unit="percent" />
        <Metric profile={profile} id="env_open_space_access" unit="percent" />
      </div>
    </>}
    {chapter === 3 && <>
      <Metric profile={profile} id="aedc_vulnerable_one_or_more" unit="percent" />
    </>}
    {chapter === 4 && <>
      {validPriority ? <>
        <div className="insight-priority"><span>Priority for Investigation</span><strong>{priority!.data.priority_band}</strong></div>
        <p>The combined indicators place this neighbourhood in the model's <strong>{priority!.data.priority_band?.toLowerCase()}</strong> investigation band.</p>
        <cite>{String(prioritySource)} · {String(priorityYear)} · {area.geographic_unit}</cite>
      </> : <p className="insight-data-state">{state.priorityError ?? 'The priority label lacks compatible source metadata and cannot be displayed.'}</p>}
    </>}
    {(state.profile.limitations.length > 0 || (chapter === 4 && priority?.limitations.length)) ? <details className="insight-limitations">
      <summary>Data limitations</summary>
      {[...state.profile.limitations, ...(chapter === 4 ? priority?.limitations ?? [] : [])].map((limitation, index) => <p key={`${limitation.code}-${index}`}>{limitation.message}</p>)}
    </details> : null}
  </div>
}

export const chapterCopy = [
  'Every neighbourhood creates a different setting for childhood. Begin with the selected place, its community and the everyday environment surrounding young children.',
  'Urban heat can add environmental pressure to daily life. Follow the local heat island indicator to see how strongly the built environment retains heat.',
  'Tree canopy and accessible public open space help shape how a neighbourhood feels. Here, the journey turns to the amount of green cover available locally.',
  'Environmental context sits alongside child development evidence. AEDC data shows the share of children developmentally vulnerable on one or more domains in this neighbourhood.',
  'Across neighbourhood-level indicators, a pattern can emerge: lower vegetation and higher heat exposure can coincide with higher child development vulnerability. This is a signal for investigation, not a claim about individual children.',
  'Environmental conditions are not fixed. More tree canopy, more accessible open space and lower heat exposure can become practical directions for local improvement.',
  'A better future begins with informed local choices. Clearer evidence can support conversations and action toward healthier, more supportive places for children to grow.',
]
