/**
 * In 2031 (Child Health). Parents: "Growing up here in 2031". Practitioners: "Future demand".
 * Official Victoria in Future 2023 projections for children, with childcare, GP and school pressure
 * if nothing new opens. The body is shared with plan/FutureArea and themed with the hub tokens.
 */
import type { ReactNode } from 'react'
import type { NeighbourhoodSearchResult } from '../../services/api'
import FutureArea from '../plan/FutureArea'
import { Hero } from './hubKit'
import '../where/WhereToLive.css'
import '../plan/PlanChange.css'
import './TodayPage.css'
import './HealthTopics.css'
import './VaccinesTool.css'
import './HubPages.css'

interface Props {
  parent: boolean
  locality: NeighbourhoodSearchResult
  controls: ReactNode
  onSelectLocality: (value: NeighbourhoodSearchResult) => void
}

export default function LookingAhead({ parent, locality, controls, onSelectLocality }: Props) {
  return <div className={`kt ht vx hp fu-hub ${parent ? 'kt-parent' : 'kt-prac'}`}>
    <Hero parent={parent} title={parent ? 'Growing up here in 2031' : 'Future demand'}
      text={parent ? 'How many children will live in your area, and whether childcare, GPs and schools keep up.' : 'Projected children by age, 2021 to 2036, and pressure on childcare, GPs and primary schools if no new services open.'} />
    <div className="kt-filters">{controls}<p>Victoria in Future 2023, the Victorian Government’s official population projections.</p></div>
    <FutureArea parent={parent} area={{ id: locality.id, name: locality.name }}
      onSelectArea={a => onSelectLocality({ id: a.id, name: a.name, geographic_unit: 'SA2' })} />
    <footer className="kt-foot"><p>Victoria in Future 2023; ACECQA National Registers 2026; National Health Services Directory 2025; Victorian school locations 2025. Area-level evidence, never about a child.</p></footer>
  </div>
}
