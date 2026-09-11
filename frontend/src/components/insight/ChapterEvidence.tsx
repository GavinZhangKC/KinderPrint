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
  if (chapter === 4) return <p className="insight-footnote">The sunlight is a symbol of possibility. It does not mean these challenges have been solved.</p>
  if (state.status !== 'ready') return <div className="insight-data-state" role="status">
    <span className={state.status === 'loading' ? 'insight-loading-dot' : ''} />
    <p>{state.message}</p>
    {state.status !== 'loading' && <button type="button" className="button secondary" onClick={retry}>Retry evidence</button>}
  </div>
  const profile = state.profile.data
  const area = profile.neighbourhood
  const dv = validMetric(profile, 'aedc_vulnerable_one_or_more', 'percent')
  const priority = state.priority
  const prioritySource = priority?.metadata.source
  const priorityYear = priority?.metadata.reference_year
  const validPriority = priority?.data.priority_band && typeof prioritySource === 'string' && prioritySource !== 'TBC' && (typeof priorityYear === 'string' || typeof priorityYear === 'number') && priorityYear !== 'TBC' && priority.metadata.geographic_unit === area.geographic_unit
  return <div className="insight-evidence" data-neighbourhood={area.id}>
    <p className="insight-example">A closer look <span>{area.name || area.id}</span></p>
    {chapter === 0 && <>
      <Metric profile={profile} id="census_children_0_4_pct" unit="percent" note="Share of the area's usual resident population aged 0–4." />
      <p className="insight-footnote">Example selection: the first neighbourhood ID with available AEDC vulnerability data, in ascending order. This is an illustration, not a ranking or a representative sample.</p>
    </>}
    {chapter === 1 && <>
      <Metric profile={profile} id="aedc_vulnerable_one_or_more" unit="percent" />
      <p>{dv ? `In the published ${dv.reference_year} area-level AEDC data for ${area.name || area.id}, ${formatMetric(dv)} were developmentally vulnerable on at least one domain.` : 'A publishable vulnerability percentage is not available for this profile.'} The measure describes a group, not the prospects of an individual child.</p>
      <p className="insight-footnote">AEDC looks across physical, social, emotional, language and communication development. Area estimates carry uncertainty.</p>
    </>}
    {chapter === 2 && <>
      <div className="insight-metrics">
        <Metric profile={profile} id="seifa_irsd_decile" unit="decile" note="Lower deciles indicate greater relative disadvantage." />
        <Metric profile={profile} id="env_urban_heat" unit="degrees Celsius" note="Heat island effect; not air temperature or a weather forecast." />
        <Metric profile={profile} id="env_vegetation_cover" unit="percent" />
      </div>
      <p className="insight-footnote">These measures can be considered together as context. Their reference years differ; they do not describe simultaneous exposure, establish a trend, or show that one condition caused another.</p>
    </>}
    {chapter === 3 && <>
      {validPriority ? <>
        <div className="insight-priority"><span>Priority for Investigation</span><strong>{priority!.data.priority_band}</strong></div>
        <p>This example carries the model's <strong>{priority!.data.priority_band?.toLowerCase()}</strong> investigation band. Review the local evidence and speak with communities before deciding where closer investigation or preventive work is warranted.</p>
        <cite>{String(prioritySource)} · {String(priorityYear)} · {area.geographic_unit}</cite>
        <p className="insight-footnote">The existing model considers AEDC vulnerability relative to socioeconomic position, weighted by children assessed. This label does not demonstrate an environmental cause or an intervention's effectiveness.</p>
      </> : <p className="insight-data-state">{state.priorityError ?? 'The priority label lacks compatible source metadata and cannot be displayed.'}</p>}
      <p className="insight-footnote">The system does not make the final investigation or resource-allocation decision; people do.</p>
    </>}
    {(state.profile.limitations.length > 0 || (chapter === 3 && priority?.limitations.length)) ? <details className="insight-limitations">
      <summary>Data limitations</summary>
      {[...state.profile.limitations, ...(chapter === 3 ? priority?.limitations ?? [] : [])].map((limitation, index) => <p key={`${limitation.code}-${index}`}>{limitation.message}</p>)}
    </details> : null}
  </div>
}

export const chapterCopy = [
  'Every child begins with possibility. The places where children grow offer different surroundings, resources and everyday experiences. Follow the light to explore the evidence behind those differences.',
  'Understanding begins with listening to the evidence. KinderPrint brings together child development, social context and environmental indicators to help us see neighbourhood conditions more clearly.',
  'The path is not always clear. Social conditions, heat and tree cover add different pieces to the picture. Looking across them raises questions about pressures that may overlap, without assuming every area or child faces the same challenges.',
  'As the clouds lift, better questions come into view. Results are starting points for investigation, not conclusions. They indicate where a closer look may be warranted.',
  'A clearer picture is a beginning. Bring local evidence into conversations with communities, explore the questions it raises, and help shape more supportive places for children to grow.',
]
