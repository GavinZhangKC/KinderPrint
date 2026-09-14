import { useState } from 'react'
import type { Neighbourhood } from '../types/neighbourhood'
import './HealthPathwayExplorer.css'

interface Pathway {
  id: string
  title: string
  nodes: string[]
  local: (place: Neighbourhood) => string
  note: string
}

const pathways: Pathway[] = [
  {
    id: 'heat',
    title: 'Heat & outdoor comfort',
    nodes: ['Urban heat context', 'Outdoor thermal comfort', 'Opportunity for outdoor activity', 'Physical-development pathway'],
    local: (place) => place.heatExposure === null ? 'Local heat evidence is unavailable.' : `Local urban heat indicator: ${place.heatExposure}°C.`,
    note: 'A pathway for exploration only. KinderPrint does not infer that the local heat indicator caused a child-development outcome.',
  },
  {
    id: 'respiratory',
    title: 'Traffic & respiratory environment',
    nodes: ['Declared-road traffic context', 'Potential emissions context', 'Respiratory environment', 'Child respiratory pathway'],
    local: (place) => place.highTrafficRoadShare === null ? 'Local traffic context is unavailable.' : `High-traffic declared-road share: ${place.highTrafficRoadShare}%.`,
    note: 'Traffic context is not personal exposure, ambient air quality or a health-risk estimate.',
  },
  {
    id: 'nature',
    title: 'Nature & play',
    nodes: ['Tree canopy context', 'Nature interaction', 'Exploratory or active play', 'Potential development pathway'],
    local: (place) => place.treeCanopy === null ? 'Local canopy evidence is unavailable.' : `Local tree canopy indicator: ${place.treeCanopy}%.`,
    note: 'This visual communicates a research hypothesis pathway, not a causal finding for this locality.',
  },
]

export default function HealthPathwayExplorer({ neighbourhood }: { neighbourhood: Neighbourhood }) {
  const [activeId, setActiveId] = useState(pathways[0].id)
  const active = pathways.find((pathway) => pathway.id === activeId) ?? pathways[0]

  return (
    <section className="pathway-explorer" aria-labelledby="pathway-title">
      <span className="eyebrow">Relationship explorer</span>
      <h3 id="pathway-title">How might place connect to health?</h3>
      <p className="pathway-intro">Follow a contextual pathway, then open its boundary before interpreting it.</p>
      <div className="pathway-tabs" role="tablist" aria-label="Health pathways">
        {pathways.map((pathway) => (
          <button key={pathway.id} type="button" role="tab" aria-selected={activeId === pathway.id} onClick={() => setActiveId(pathway.id)}>{pathway.title}</button>
        ))}
      </div>
      <div className="pathway-flow" role="tabpanel">
        {active.nodes.map((node, index) => (
          <div className="pathway-node" key={node}>
            <span>{String(index + 1).padStart(2, '0')}</span><strong>{node}</strong>
            {index < active.nodes.length - 1 && <i aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="pathway-evidence"><strong>{active.local(neighbourhood)}</strong><p>{active.note}</p></div>
    </section>
  )
}
