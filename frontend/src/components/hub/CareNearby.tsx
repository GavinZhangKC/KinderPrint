/**
 * Care nearby. Parents: which care to use and where (emergency, urgent care, advice line, everyday
 * GP), then GPs, pharmacies and child health centres on a map, children's hospitals and urgent care,
 * childcare, and typical out-of-pocket costs. Practitioners: hospital emergency performance, urgent
 * care clinics, out-of-pocket costs against national figures, and childcare and transport counts.
 */
import { useState, type ReactNode } from 'react'
import { api, type AreaCostService, type CompareCare, type CompareClinic, type CompareHospital, type EarlyChildhoodServices, type NeighbourhoodSearchResult, type PreventionContext, type VaccinationPlace, type VaccinationPlaceKind, type VaccinationPlaces } from '../../services/api'
import { Dialog, Hero, Summary, TabPanel, Tabs, directionsTo, has, money, useLoad } from './hubKit'
import { ProximityMap } from './VaccinesTool'
import './TodayPage.css'
import './HealthTopics.css'
import './VaccinesTool.css'
import './HubPages.css'

const NURSE_ON_CALL = '1300 60 60 24'
const STARTING_BLOCKS = 'https://www.startingblocks.gov.au/find-child-care'
const KIND: Record<VaccinationPlaceKind, { label: string; note: string }> = {
  general_practice: { label: 'General practice', note: 'Check-ups, illness, referrals and vaccines.' },
  pharmacy: { label: 'Pharmacy', note: 'Advice on minor illness and medicines.' },
  maternal_child_health: { label: 'Maternal and Child Health', note: 'Free development checks and support from birth to school age.' },
}
/** Services a parent of a child is most likely to pay for, in the order shown. */
const PARENT_COSTS: Array<[string, string, string]> = [
  ['GP attendances (total)', 'All persons', 'GP visit'],
  ['Specialist attendances (total)', '0-24', 'Specialist visit, ages 0–24'],
  ['Speech Pathology', 'All persons', 'Speech pathology'],
  ['Occupational Therapy', 'All persons', 'Occupational therapy'],
  ['Clinical Psychologist', 'All persons', 'Clinical psychologist'],
]
/** Services most used for children, shown first on the practitioner cost table. */
const CHILD_COSTS = ['Early Intervention Services for Children|All persons', 'Speech Pathology|All persons', 'Specialist attendances (total)|0-24', 'GP attendances (total)|0-24', 'GP attendances (total)|All persons', 'Occupational Therapy|All persons', 'Clinical Psychologist|All persons']
const isChildrensEd = (h: CompareHospital) => h.has_paediatric_service && !!h.emergency_department && !/women/i.test(h.name)
const hospitalName = (name: string) => name.replace(/\s*\[[^\]]*\]/, '')
const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`
const costRow = (rows: AreaCostService[], service: string, demographic: string) => rows.find(r => r.service === service && r.demographic === demographic)
const pctDiff = (a: number, b: number) => Math.round((a / b - 1) * 100)

interface Props {
  parent: boolean
  locality: NeighbourhoodSearchResult
  controls: ReactNode
  childcare: EarlyChildhoodServices | null
  prevention: PreventionContext | null
  onOpenMap?: () => void
}
type Load<T> = { data: T | null; loading: boolean }

export default function CareNearby(props: Props) {
  const care = useLoad<CompareCare>(signal => api.getCompareCare(props.locality.id, signal), `cc-${props.locality.id}`)
  const places = useLoad<VaccinationPlaces>(signal => api.getVaccinationPlaces(props.locality.id, signal), `vp-${props.locality.id}`)
  return props.parent ? <ParentCare {...props} care={care} places={places} /> : <PractitionerCare {...props} care={care} />
}

function ChildcareFacts({ childcare, prevention, parent }: { childcare: EarlyChildhoodServices | null; prevention: PreventionContext | null; parent: boolean }) {
  if (!childcare) return <p className="kt-empty">Childcare counts aren’t available for this area.</p>
  return <>
    <div className="hp-facts">
      <div><strong>{childcare.active_education_care_services ?? '—'}</strong><span>childcare services</span><small>{childcare.long_day_care_services ?? 0} long day care · {childcare.kindergarten_services ?? 0} kindergarten</small></div>
      <div><strong>{childcare.total_approved_places ?? '—'}</strong><span>approved places</span><small>Approved, not currently vacant</small></div>
      <div><strong>{has(childcare.rating_coverage_pct) ? `${Math.round(childcare.rating_coverage_pct)}%` : '—'}</strong><span>have a quality rating</span><small>{childcare.services_with_current_rating ?? 0} services rated</small></div>
      {!parent && <div><strong>{prevention?.transport?.public_transport_stop_count ?? '—'}</strong><span>public transport stops</span><small>Inside the SA2</small></div>}
    </div>
    {parent && <div className="ht-actions"><a className="kh-btn primary" href={STARTING_BLOCKS} target="_blank" rel="noreferrer">Find childcare and check ratings</a><span className="ht-care-note">Starting Blocks, Australian Government</span></div>}
    <p className="kt-limit">Counts services registered inside {childcare.neighbourhood_name}. Vacancies, fees and waiting lists are not shown.</p>
  </>
}

/* ------------------------------------------------------------------ parents */

type ParentTab = 'clinics' | 'hospitals' | 'childcare' | 'costs'

function ParentCare({ locality, controls, childcare, prevention, onOpenMap, care, places }: Props & { care: Load<CompareCare>; places: Load<VaccinationPlaces> }) {
  const [tab, setTab] = useState<ParentTab>('clinics')
  const [hospital, setHospital] = useState<CompareHospital | null>(null)
  const [clinic, setClinic] = useState<CompareClinic | null>(null)
  const [moreUcc, setMoreUcc] = useState(false)
  const eds = (care.data?.hospitals ?? []).filter(isChildrensEd)
  const ucc = care.data?.urgent_care_clinics ?? []
  const gp = places.data?.places.find(p => p.kind === 'general_practice')
  const costs = care.data?.area_cost

  return <div className="kt ht vx hp kt-parent">
    <Hero parent title="Care nearby" text="Know where to go, from a cough to an emergency, and what care usually costs here." />
    <div className="kt-filters">{controls}{onOpenMap && <button type="button" className="kh-btn kt-link-btn" onClick={onOpenMap}>View on map</button>}</div>

    <section className="kt-card kt-tint hp-triage" aria-labelledby="hp-which">
      <h2 id="hp-which" className="vx-eyebrow">Which care do I need?</h2>
      <div className="hp-triage-grid">
        <div className="is-urgent"><b>Emergency</b><a className="hp-call" href="tel:000">Call 000</a><p>Struggling to breathe, a seizure, or very hard to wake.</p>{eds[0] && <button type="button" className="hp-link" onClick={() => setHospital(eds[0])}>{hospitalName(eds[0].name)}, {eds[0].distance_km.toFixed(1)} km</button>}</div>
        <div><b>Urgent, not life-threatening</b>{ucc[0] ? <><button type="button" className="hp-call" onClick={() => setClinic(ucc[0])}>{ucc[0].name.replace(' Medicare Urgent Care Clinic', ' urgent care')}</button><p>{ucc[0].distance_km.toFixed(1)} km. Free, no appointment needed.</p></> : <p>No urgent care clinic listed nearby.</p>}</div>
        <div><b>Not sure what to do</b><a className="hp-call" href={tel(NURSE_ON_CALL)}>{NURSE_ON_CALL}</a><p>NURSE-ON-CALL, a registered nurse, 24 hours a day.</p></div>
        <div><b>Everyday care</b>{gp ? <><span className="hp-call">{gp.name}</span><p>Nearest GP, {gp.distance_km.toFixed(1)} km.</p></> : <p>See the list below.</p>}</div>
      </div>
    </section>

    <section className="kt-card kt-cream vx-panel" aria-label="Care details">
      <Tabs label="Care details" value={tab} onChange={setTab} tabs={[['clinics', 'GPs and clinics'], ['hospitals', 'Hospitals and urgent care'], ['childcare', 'Childcare'], ['costs', 'Costs']]} />
      <TabPanel tab={tab}>
        {tab === 'clinics' && <Finder places={places} locality={locality.name} />}
        {tab === 'hospitals' && (care.data ? <>
          <p className="kt-sub">Children’s emergency departments and Medicare urgent care clinics nearest {locality.name}. Select one for address, phone and waiting times.</p>
          <ol className="vx-rows">
            {eds.map(h => <li key={h.id}><button type="button" className="vx-row" onClick={() => setHospital(h)}><span className="vx-txt"><b>{hospitalName(h.name)}</b><small>Emergency department with children’s services</small></span><span className="vx-dist">{h.distance_km.toFixed(1)} km</span><span className="vx-chev" aria-hidden="true">›</span></button></li>)}
            {ucc.slice(0, moreUcc ? ucc.length : 2).map(c => <li key={c.id}><button type="button" className="vx-row" onClick={() => setClinic(c)}><span className="vx-txt"><b>{c.name}</b><small>Urgent care · free, no appointment</small></span><span className="vx-dist">{c.distance_km.toFixed(1)} km</span><span className="vx-chev" aria-hidden="true">›</span></button></li>)}
          </ol>
          {ucc.length > 2 && !moreUcc && <button type="button" className="kh-btn" onClick={() => setMoreUcc(true)}>Show {ucc.length - 2} more urgent care clinics</button>}
          <p className="kt-limit">In an emergency call 000. Distances are straight-line.</p>
        </> : <p className="kt-empty">{care.loading ? 'Loading…' : 'Hospital information can’t be shown right now.'}</p>)}
        {tab === 'childcare' && <ChildcareFacts childcare={childcare} prevention={prevention} parent />}
        {tab === 'costs' && (costs ? <>
          <p className="kt-sub">What people in {costs.sa3_name} paid on average per visit after Medicare, {costs.reference_period.replace('-', '–')}, compared with Australia.</p>
          <ol className="vx-rows">{PARENT_COSTS.map(([service, demo, label]) => { const r = costRow(costs.services, service, demo); if (!r || !has(r.patient_contribution_per_service)) return null; const national = r.national_patient_contribution_per_service ?? costRow(costs.services, service, 'All persons')?.national_patient_contribution_per_service; return <li key={label} className="hp-habit">
            <span className="vx-txt"><b>{label}</b><small>Medicare pays {has(r.benefit_share_of_fees_pct) ? `${Math.round(r.benefit_share_of_fees_pct)}%` : '—'} of fees</small></span>
            <span className="hp-money"><strong>{money(r.patient_contribution_per_service)}</strong>{has(national) && <small>Australia {money(national)}</small>}</span>
          </li> })}</ol>
          <p className="kt-limit">Averages include bulk-billed visits. What you pay depends on the provider: ask about fees when you book.</p>
        </> : <p className="kt-empty">{care.loading ? 'Loading…' : 'Cost information isn’t available.'}</p>)}
      </TabPanel>
    </section>

    <footer className="kt-foot"><p>National Health Services Directory (March 2025); AIHW hospital performance 2024–25; Medicare urgent care clinic list (healthdirect); AIHW Medicare-subsidised care by area 2024–25; ACECQA National Registers. General guidance, not medical advice for your child. In an emergency call 000.</p></footer>

    {hospital && <HospitalDialog hospital={hospital} parent onClose={() => setHospital(null)} />}
    {clinic && <ClinicDialog clinic={clinic} onClose={() => setClinic(null)} />}
  </div>
}

function Finder({ places, locality }: { places: Load<VaccinationPlaces>; locality: string }) {
  const [filter, setFilter] = useState<'all' | VaccinationPlaceKind>('all')
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<VaccinationPlace | null>(null)
  if (places.loading) return <p className="kt-empty">Loading nearby places…</p>
  if (!places.data) return <p className="kt-empty">Nearby places can’t be shown right now.</p>
  const visible = places.data.places.filter(p => filter === 'all' || p.kind === filter).sort((a, b) => a.distance_km - b.distance_km)
  const shown = visible.slice(0, more ? visible.length : 5)
  const number = new Map(shown.map((p, i) => [`${p.kind}-${p.rank}`, i + 1]))
  return <>
    <p className="kt-sub">GPs, pharmacies and child health centres near {locality}. Select a place for details and directions.</p>
    <div className="ht-facets vx-filters" role="group" aria-label="Show">{([['all', 'All'], ['general_practice', 'GPs'], ['pharmacy', 'Pharmacies'], ['maternal_child_health', 'Child health centres']] as Array<['all' | VaccinationPlaceKind, string]>).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => { setFilter(id); setMore(false) }}>{label}</button>)}</div>
    <div className="vx-near">
      <ProximityMap places={places.data} visible={shown} number={number} onSelect={setOpen} />
      <div>
        <ol className="vx-rows">{shown.map(p => <li key={`${p.kind}-${p.rank}`}><button type="button" className="vx-row" onClick={() => setOpen(p)}>
          <span className={`vx-num hp-k-${p.kind}`} aria-hidden="true">{number.get(`${p.kind}-${p.rank}`)}</span>
          <span className="vx-txt"><b>{p.name}</b><small>{KIND[p.kind].label} · {p.suburb}</small></span><span className="vx-dist">{p.distance_km.toFixed(1)} km</span>
        </button></li>)}</ol>
        {visible.length > shown.length && <button type="button" className="kh-btn" onClick={() => setMore(true)}>Show {visible.length - shown.length} more</button>}
        <p className="kt-limit">Call ahead to check appointments, fees and bulk billing.</p>
      </div>
    </div>
    {open && <Dialog title={open.name} onClose={() => setOpen(null)}>
      <p className="vx-when">{KIND[open.kind].label} · {open.distance_km.toFixed(1)} km</p>
      <dl className="vx-facts"><dt>Address</dt><dd>{open.address}</dd><dt>Good for</dt><dd>{KIND[open.kind].note}</dd></dl>
      <div className="ht-actions"><a className="kh-btn primary" href={directionsTo(open.latitude, open.longitude)} target="_blank" rel="noreferrer">Directions</a></div>
      <p className="ht-care-note">National Health Services Directory, March 2025.</p>
    </Dialog>}
  </>
}

function HospitalDialog({ hospital, parent, onClose }: { hospital: CompareHospital; parent: boolean; onClose: () => void }) {
  const ed = hospital.emergency_department
  return <Dialog title={hospitalName(hospital.name)} onClose={onClose}>
    <p className="vx-when">{hospital.sector === 'public' ? 'Public hospital' : 'Private hospital'} · {hospital.distance_km.toFixed(1)} km</p>
    <dl className="vx-facts">
      {ed && has(ed.median_minutes) && <><dt>Time in emergency</dt><dd>Half of patients spent under {Math.floor(ed.median_minutes / 60)} h {Math.round(ed.median_minutes % 60)} min</dd></>}
      {ed && has(ed.departed_within_4h_pct) && <><dt>Within 4 hours</dt><dd>{Math.round(ed.departed_within_4h_pct)} in 100 patients left emergency</dd></>}
      {!parent && ed && has(ed.ninetieth_percentile_minutes) && <><dt>90th percentile</dt><dd>{Math.round(ed.ninetieth_percentile_minutes)} min</dd></>}
      <dt>Children’s services</dt><dd>{hospital.has_paediatric_service ? 'Yes' : 'No'}{hospital.has_neonatal_intensive_care ? ', including newborn intensive care' : ''}</dd>
      {ed && <><dt>Period</dt><dd>{ed.period.replace(/(\d{4})-\d{2}-\d{2} to \d{2}(\d{2})-\d{2}-\d{2}/, '$1–$2')}</dd></>}
    </dl>
    <div className="ht-actions"><a className="kh-btn primary" href={directionsTo(hospital.latitude, hospital.longitude)} target="_blank" rel="noreferrer">Directions</a></div>
    <p className="kt-limit">{parent ? 'The sickest children are always seen first. In an emergency call 000.' : 'All-patient emergency figures; not specific to children.'}</p>
  </Dialog>
}

function ClinicDialog({ clinic, onClose }: { clinic: CompareClinic; onClose: () => void }) {
  return <Dialog title={clinic.name} onClose={onClose}>
    <p className="vx-when">Urgent care · {clinic.distance_km.toFixed(1)} km</p>
    <dl className="vx-facts"><dt>Address</dt><dd>{clinic.address}</dd>{clinic.phone && <><dt>Phone</dt><dd><a href={tel(clinic.phone)}>{clinic.phone}</a></dd></>}<dt>Cost</dt><dd>{clinic.cost}</dd><dt>Good for</dt><dd>Sprains, minor burns, cuts, ear and eye problems, and fevers that are not an emergency.</dd></dl>
    <div className="ht-actions"><a className="kh-btn primary" href={directionsTo(clinic.latitude, clinic.longitude)} target="_blank" rel="noreferrer">Directions</a><a href={clinic.listing_url} target="_blank" rel="noreferrer">Opening hours (healthdirect)</a></div>
  </Dialog>
}

/* ------------------------------------------------------------------ practitioners */

type PracTab = 'hospitals' | 'urgent' | 'costs' | 'childcare'

function PractitionerCare({ controls, childcare, prevention, care }: Props & { care: Load<CompareCare> }) {
  const [tab, setTab] = useState<PracTab>('hospitals')
  const [hospital, setHospital] = useState<CompareHospital | null>(null)
  const costs = care.data?.area_cost
  const gp = costs ? costRow(costs.services, 'GP attendances (total)', 'All persons') : undefined
  const eds = (care.data?.hospitals ?? []).filter(isChildrensEd)
  const ucc = care.data?.urgent_care_clinics ?? []
  const hospitals = (care.data?.hospitals ?? []).filter(h => h.emergency_department)
  const [allEds, setAllEds] = useState(false)
  const [allCosts, setAllCosts] = useState(false)
  const period = (p: string) => p.replace('-', '–')
  const above = (costs?.services ?? []).filter(r => r.demographic === 'All persons' && has(r.patient_contribution_per_service) && has(r.national_patient_contribution_per_service) && r.patient_contribution_per_service! > r.national_patient_contribution_per_service!)

  return <div className="kt ht vx hp kt-prac">
    <Hero parent={false} title="Care access" text="Emergency performance, urgent care, out-of-pocket costs and childcare around the area. Listed presence is not capacity." />
    <div className="kt-filters">{controls}<p>{costs ? `Costs: ${costs.sa3_name} SA3 · ` : ''}Hospitals: nearest 10</p></div>

    {gp && has(gp.patient_contribution_per_service) && has(gp.national_patient_contribution_per_service) && <Summary id="hp-c-kf" eyebrow="Key finding">
      <p className="vx-lead">Out-of-pocket cost per GP service is <b>{money(gp.patient_contribution_per_service)}</b> in {costs!.sa3_name}, <b>{pctDiff(gp.patient_contribution_per_service, gp.national_patient_contribution_per_service)}% above</b> the national {money(gp.national_patient_contribution_per_service)} ({period(costs!.reference_period)}).</p>
      <details className="vx-more"><summary>More findings</summary><ul className="kt-findings kt-one">
        {eds[0]?.emergency_department && <li>Nearest children’s emergency department: {hospitalName(eds[0].name)}, {eds[0].distance_km.toFixed(1)} km; {Math.round(eds[0].emergency_department.departed_within_4h_pct ?? 0)}% of patients left within 4 hours.</li>}
        {ucc.length > 0 && <li>{ucc.length} Medicare urgent care clinics within {Math.ceil(Math.max(...ucc.map(c => c.distance_km)))} km; nearest {ucc[0].distance_km.toFixed(1)} km.</li>}
        <li>{above.length} of {(costs?.services ?? []).filter(r => r.demographic === 'All persons').length} Medicare service types cost more out of pocket here than nationally.</li>
      </ul></details>
    </Summary>}

    <section className="kt-card kt-cream vx-panel" aria-label="Care access details">
      <Tabs label="Care access details" value={tab} onChange={setTab} tabs={[['hospitals', 'Emergency departments'], ['urgent', 'Urgent care'], ['costs', 'Out-of-pocket costs'], ['childcare', 'Childcare and transport']]} />
      <TabPanel tab={tab}>
        {tab === 'hospitals' && (care.data ? <>
          <p className="kt-sub">Public hospitals with an emergency department, nearest first. Select a row for full figures.</p>
          <div className="hp-cal-wrap"><table className="kt-table hp-table hp-click"><thead><tr><th scope="col">Hospital</th><th scope="col">Distance</th><th scope="col">Median time</th><th scope="col">Left within 4 h</th></tr></thead>
            <tbody>{hospitals.slice(0, allEds ? hospitals.length : 5).map(h => <tr key={h.id} onClick={() => setHospital(h)}><th scope="row"><button type="button" className="hp-link" onClick={() => setHospital(h)}>{hospitalName(h.name)}</button><span>{h.has_paediatric_service ? 'Children’s services' : 'Adult services'}</span></th><td>{h.distance_km.toFixed(1)} km</td><td>{h.emergency_department?.median_minutes ?? '—'} min</td><td>{has(h.emergency_department?.departed_within_4h_pct) ? `${Math.round(h.emergency_department!.departed_within_4h_pct!)}%` : '—'}</td></tr>)}</tbody></table></div>
          {hospitals.length > 5 && <div className="ht-actions"><button type="button" className="kh-btn" aria-expanded={allEds} onClick={() => setAllEds(v => !v)}>{allEds ? 'Show nearest 5' : `Show ${hospitals.length - 5} more`}</button></div>}
          <p className="kt-limit">All-patient figures for {hospitals[0]?.emergency_department?.period.slice(0, 4)}–{hospitals[0]?.emergency_department?.period.slice(-8, -6)}; children are not reported separately.</p>
        </> : <p className="kt-empty">{care.loading ? 'Loading…' : 'Unavailable.'}</p>)}
        {tab === 'urgent' && <>
          <ul className="ht-care">{ucc.map(c => <li key={c.id}><span><b>{c.name}</b><span>{c.address}{c.phone ? ` · ${c.phone}` : ''}</span></span><b>{c.distance_km.toFixed(1)} km</b></li>)}</ul>
          <p className="kt-limit">Medicare urgent care clinics are bulk billed with no referral; opening hours vary.</p>
        </>}
        {tab === 'costs' && (costs ? <>
          <p className="kt-sub">Average patient contribution per Medicare service, {costs.sa3_name}, {period(costs.reference_period)}. {allCosts ? 'All services.' : 'Services most used for children.'}</p>
          <div className="hp-cal-wrap"><table className="kt-table hp-table"><thead><tr><th scope="col">Service</th><th scope="col">Here</th><th scope="col">Australia</th><th scope="col">Medicare share</th></tr></thead>
            <tbody>{[...costs.services].filter(r => has(r.patient_contribution_per_service) && (allCosts || CHILD_COSTS.includes(`${r.service}|${r.demographic}`))).sort((a, b) => (b.patient_contribution_per_service ?? 0) - (a.patient_contribution_per_service ?? 0)).map(r => { const hi = has(r.national_patient_contribution_per_service) && r.patient_contribution_per_service! > r.national_patient_contribution_per_service!; return <tr key={`${r.service}-${r.demographic}`}>
              <th scope="row"><b>{r.service.replace('Allied Health subtotal - ', 'Allied health: ').replace(' (total)', '')}</b><span>{r.demographic === 'All persons' ? 'All ages' : `Ages ${r.demographic.replace('-', '–')}`}</span></th>
              <td className={hi ? 'is-warn' : undefined}>{money(r.patient_contribution_per_service)}</td><td className="kt-small">{money(r.national_patient_contribution_per_service)}</td><td className="kt-small">{has(r.benefit_share_of_fees_pct) ? `${Math.round(r.benefit_share_of_fees_pct)}%` : '—'}</td>
            </tr> })}</tbody></table></div>
          <div className="ht-actions"><button type="button" className="kh-btn" aria-expanded={allCosts} onClick={() => setAllCosts(v => !v)}>{allCosts ? 'Show services used for children' : `Show all ${costs.services.length} services`}</button></div>
          <p className="kt-limit">SA3-level averages including bulk-billed services; amber values are above the national average.</p>
        </> : <p className="kt-empty">{care.loading ? 'Loading…' : 'Unavailable.'}</p>)}
        {tab === 'childcare' && <ChildcareFacts childcare={childcare} prevention={prevention} parent={false} />}
      </TabPanel>
    </section>

    <footer className="kt-foot"><p>AIHW hospital performance and Medicare-subsidised care by area, 2024–25; healthdirect urgent care clinic list; ACECQA National Registers matched to G-NAF; Department of Transport and Planning stops 2026. Area-level evidence only; not for individual diagnosis.</p></footer>

    {hospital && <HospitalDialog hospital={hospital} parent={false} onClose={() => setHospital(null)} />}
  </div>
}
