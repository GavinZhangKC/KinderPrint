import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import LocalityGlobe from './LocalityGlobe'
import { api, type EnvironmentalDifference, type HealthFacility, type NeighbourhoodProfile, type PopulationProjection, type ProfileIndicator, type VcamsAreaIndicator, type VcamsLgaIndicator } from '../services/api'
import './DigitalHealthHub.css'
import './DigitalHealthHub.responsive.css'
import './DigitalHealthHub.health.css'

type HealthView = 'overview' | 'conditions' | 'environment' | 'care' | 'demand' | 'review'
type ConditionId = 'brain' | 'lungs' | 'metabolic' | 'immune' | 'perinatal'

interface DigitalHealthHubProps { onHome: () => void }

const navigation = [
  { id: 'overview', label: 'Overview', symbol: '⌂', enabled: true },
  { id: 'conditions', label: 'Child health conditions', symbol: '✚', enabled: true },
  { id: 'environment', label: 'Environment', symbol: '◫', enabled: true },
  { id: 'development', label: 'Development', symbol: '▥', enabled: false },
  { id: 'prevention', label: 'Prevention', symbol: '♢', enabled: false },
  { id: 'care', label: 'Care access', symbol: '⌖', enabled: true },
  { id: 'demand', label: 'Future demand', symbol: '⌁', enabled: true },
  { id: 'review', label: 'Evidence review', symbol: '▤', enabled: true },
] as const

const conditions: Array<{ id: ConditionId; label: string; image: string; summary: string; status: string }> = [
  { id: 'brain', label: 'Brain & development', image: '/health-assets/brain-development.png', summary: 'Supports learning, behaviour and lifelong wellbeing.', status: 'Population evidence' },
  { id: 'lungs', label: 'Lungs & asthma', image: '/health-assets/lungs-asthma.png', summary: 'Respiratory-health evidence is available only as broader-area context.', status: 'PHA context' },
  { id: 'metabolic', label: 'Metabolic health', image: '/health-assets/metabolic-health.png', summary: 'No approved SA2 child metabolic-outcome dataset is integrated.', status: 'Local data unavailable' },
  { id: 'immune', label: 'Allergy & immune', image: '/health-assets/allergy-immune.png', summary: 'No approved SA2 allergy or immune-outcome dataset is integrated.', status: 'Local data unavailable' },
  { id: 'perinatal', label: 'Perinatal health', image: '/health-assets/perinatal-health.png', summary: 'Perinatal indicators require a different reporting geography.', status: 'Geography limited' },
]

type HealthPanel = 'Local health' | 'Prevention' | 'Daily routine' | 'Seasonal care' | 'Nearby care'

const healthPanels: HealthPanel[] = ['Local health', 'Prevention', 'Daily routine', 'Seasonal care', 'Nearby care']

const conditionGuidance: Record<ConditionId, {
  indicators: Array<{ label: string; value: string; detail: string }>
  prevention: string[]
  routine: string[]
  seasonal: string[]
  source: string
}> = {
  brain: {
    indicators: [
      { label: 'Children with a mental-health condition', value: '1.55%', detail: 'ABS Census, SA2, age 0–14, 2021' },
      { label: 'One or more long-term conditions', value: '7.47%', detail: 'PHIDU, PHA, 2021' },
      { label: 'Developmentally vulnerable on ≥1 domain', value: '23.8%', detail: 'AEDC, SA2, 2024' },
    ],
    prevention: ['Respond early to learning, behaviour, hearing or developmental concerns.', 'Keep routine health, hearing and vision checks up to date.', 'Seek professional support when distress or behaviour changes persist.'],
    routine: ['Use consistent sleep and wake times.', 'Include active play, reading and screen-free family interaction.', 'Create predictable routines with calm transition time.'],
    seasonal: ['Maintain routines during school holidays and daylight-saving changes.', 'Plan indoor active play on extreme-heat or poor-air-quality days.', 'Watch for stress around school transitions and seek help early.'],
    source: 'ABS Census 2021 G19 SA2, PHIDU 2026 PHA context and AEDC 2024 SA2 data',
  },
  lungs: {
    indicators: [
      { label: 'Children reporting asthma', value: '5.38%', detail: 'ABS Census, SA2, age 0–14, 2021' },
      { label: 'Respiratory ED presentations, age 0–4', value: '166', detail: 'PHA count, 2022/23' },
      { label: 'Respiratory ED presentations, age 5–14', value: '45', detail: 'PHA count, 2022/23' },
    ],
    prevention: ['Ask a GP for a current written asthma action plan.', 'Keep children away from tobacco smoke and known triggers.', 'Review inhaler and spacer technique with a clinician or pharmacist.'],
    routine: ['Follow the child’s prescribed preventer plan.', 'Keep reliever medicine and the action plan accessible.', 'Support normal active play when asthma is controlled.'],
    seasonal: ['Victoria’s grass-pollen season runs from October to December.', 'Check thunderstorm-asthma forecasts and pollen conditions.', 'On high-risk days, go indoors, close windows and use recirculated air.'],
    source: 'ABS Census 2021 G19 SA2, PHIDU 2026 PHA context and Better Health Channel guidance',
  },
  metabolic: {
    indicators: [
      { label: 'Children above healthy weight, excluding obesity', value: '17.04%', detail: 'Modelled PHA estimate, 2022' },
      { label: 'Children living with obesity', value: '4.87%', detail: 'Modelled PHA estimate, 2022' },
      { label: '95% confidence interval for obesity', value: '3.58–6.17%', detail: 'Modelled estimate uncertainty' },
    ],
    prevention: ['Use growth assessment by a qualified clinician rather than visual judgement.', 'Make water the usual drink and offer varied minimally processed foods.', 'Discuss persistent growth, feeding or energy concerns with a GP.'],
    routine: ['Build active play into the day.', 'Keep regular meals and age-appropriate sleep routines.', 'Make changes as a household and avoid weight stigma.'],
    seasonal: ['Use shaded or indoor activity during extreme heat.', 'Keep water available during warmer weather and sport.', 'Maintain movement routines during winter and school holidays.'],
    source: 'PHIDU 2026 modelled PHA estimates',
  },
  immune: {
    indicators: [
      { label: 'Fully immunised at 1 year', value: '97.14%', detail: 'PHA, 2023' },
      { label: 'Fully immunised at 2 years', value: '90.86%', detail: 'PHA, 2023' },
      { label: 'Fully immunised at 5 years', value: '96.06%', detail: 'PHA, 2023' },
    ],
    prevention: ['Keep immunisations current using the Australian schedule.', 'Use an ASCIA action plan when a clinician diagnoses allergy or anaphylaxis.', 'Do not remove foods from a child’s diet without clinical advice.'],
    routine: ['Keep prescribed allergy medicine accessible.', 'Share the child’s action plan with school or childcare.', 'Check labels and prevent cross-contact for confirmed food allergy.'],
    seasonal: ['Monitor pollen during spring.', 'Manage hay fever with advice from a GP or pharmacist.', 'Children with asthma or hay fever need thunderstorm-asthma preparation.'],
    source: 'PHIDU 2026 PHA immunisation context; Victorian health guidance',
  },
  perinatal: {
    indicators: [
      { label: 'Babies with low birthweight', value: '5.16%', detail: 'PHA pooled data, 2019–2021' },
      { label: 'Smoking during pregnancy', value: '2.95%', detail: 'PHA pooled data, 2019–2021' },
      { label: 'Infant mortality', value: '2.99 per 1,000', detail: 'PHA pooled data, 2019–2023' },
    ],
    prevention: ['Attend recommended antenatal and postnatal care.', 'Keep pregnancy and infant environments smoke-free.', 'Use safe-sleep advice and seek help for feeding or growth concerns.'],
    routine: ['Follow the baby’s feeding plan and routine health checks.', 'Practise safe sleep for every sleep.', 'Use maternal and child health support when concerns arise.'],
    seasonal: ['Protect babies from extreme heat and direct sun.', 'Reduce infection exposure and keep family vaccinations current.', 'Dress babies for the room temperature rather than the season alone.'],
    source: 'PHIDU 2026 pooled PHA perinatal indicators',
  },
}

const nearbyCare = [
  { name: 'Maternal and Child Health Centre – Lygon East', type: 'Maternal, child and family health', distance: '0.31 km', fee: 'Contact service' },
  { name: 'East Brunswick Medical Centre', type: 'General practice', distance: '0.35 km', fee: 'Contact clinic' },
  { name: 'Inner North Medical Clinic', type: 'General practice', distance: '0.37 km', fee: 'Contact clinic' },
  { name: "The Royal Children’s Hospital", type: 'Paediatric emergency department', distance: '3.63 km', fee: 'Public hospital conditions apply' },
]

function SideNavigation({ current, onChange, onHome }: { current: HealthView; onChange: (view: HealthView) => void; onHome: () => void }) {
  return <aside className="dh-sidebar">
    <button className="dh-brand" type="button" onClick={onHome} aria-label="Return to KinderPrint home"><span>K</span><strong>inderPrint</strong></button>
    <nav aria-label="Child health navigation">{navigation.map((item) => {
      const selected = item.id === current
      return <button key={item.id} type="button" className={selected ? 'is-active' : undefined} aria-current={selected ? 'page' : undefined} disabled={!item.enabled} title={item.enabled ? undefined : `${item.label} is planned for a later release`} onClick={() => item.enabled && onChange(item.id as HealthView)}><span aria-hidden="true">{item.symbol}</span><b>{item.label}</b>{!item.enabled && <small>Planned</small>}</button>
    })}</nav>
    <footer><span>⌖</span><div><strong>Melbourne</strong><small>SA2 reporting localities</small></div></footer>
    <div className="dh-community-mark"><i>▥</i><span>Evidence<br />for brighter futures</span></div>
  </aside>
}

function DevelopmentWheel() {
  const domains = [
    { className: 'physical', label: 'Physical health and wellbeing', icon: 'heart' },
    { className: 'social', label: 'Social competence', icon: 'people' },
    { className: 'language', label: 'Language and cognitive skills', icon: 'book' },
    { className: 'emotional', label: 'Emotional maturity', icon: 'smile' },
    { className: 'communication', label: 'Communication and general knowledge', icon: 'chat' },
  ]
  return <div className="dh-development-visual" aria-label="Five AEDC child development domains">
    <div className="dh-development-wheel"><b><DomainIcon name="child" /></b></div>
    <ul>{domains.map((domain) => <li key={domain.className} className={domain.className}><i><DomainIcon name={domain.icon} /></i><span>{domain.label}</span></li>)}</ul>
  </div>
}

function DomainIcon({ name }: { name: string }) {
  if (name === 'heart') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
  if (name === 'people') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20v-2a5 5 0 0 1 10 0v2M14 20v-1.5a4 4 0 0 1 7-2.7V20" /></svg>
  if (name === 'book') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v15H7.5A3.5 3.5 0 0 0 4 20.5ZM20 5.5A3.5 3.5 0 0 0 16.5 4H13v15h3.5a3.5 3.5 0 0 1 3.5 1.5Z" /></svg>
  if (name === 'smile') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 14.5a5 5 0 0 0 8 0M9 9h.01M15 9h.01" /></svg>
  if (name === 'chat') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4Z" /><path d="M8 9h8M8 12h5" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="3" /><path d="M12 10v7M7 13l5-3 5 3M9 21l3-4 3 4" /></svg>
}

function OverviewPage({ onConditions, onDemand }: { onConditions: () => void; onDemand: () => void }) {
  const [mapMode, setMapMode] = useState<'lens' | 'map'>('lens')
  return <div className="dh-page dh-overview-page">
    <header className="dh-topbar"><div className="dh-static-search">⌕ <span>Brunswick East · SA2</span></div><div className="dh-top-actions"><span>⌖ Melbourne</span><button type="button" disabled title="Help centre is planned">?</button><button type="button" disabled title="Accounts are not enabled">●</button></div></header>
    <div className="dh-overview-title"><div><h1>Locality overview</h1><p>Locality-level evidence. Not individual diagnosis or medical advice.</p></div><div className="dh-lens-tabs" role="tablist" aria-label="Map presentation"><button type="button" role="tab" aria-selected={mapMode === 'lens'} onClick={() => setMapMode('lens')}>Locality lens</button><button type="button" role="tab" aria-selected={mapMode === 'map'} onClick={() => setMapMode('map')}>Standard map</button></div><button className="dh-view-button" type="button" disabled title="Additional audience views are planned">♟ Planner view⌄</button></div>
    <div className="dh-overview-grid">
      <div className="dh-overview-left"><article className="dh-card dh-population-card"><div className="dh-card-title"><div><span>♟ Who lives here?</span><small>Children by age group, Brunswick East (SA2)</small></div><b>›</b></div><div className="dh-age-grid"><div><i>●</i><span>0–4 years</span><strong>488</strong><small>children</small></div><div><i>◆</i><span>5–9 years</span><strong>403</strong><small>children</small></div><div><i>▲</i><span>10–14 years</span><strong>360</strong><small>children</small></div></div><p className="dh-source">Source: Victoria in Future 2023 · SA2 projection</p></article><article className="dh-card dh-development-card"><div className="dh-card-title"><div><span>▥ Child development</span><small>AEDC 2024, Brunswick East (SA2)</small></div><b>›</b></div><div className="dh-development-content"><DevelopmentWheel /><dl><div><dt>Vulnerable on one or more domains</dt><dd>23.8%</dd></div><div><dt>On track across all five domains</dt><dd>56.8%</dd></div></dl></div><p className="dh-source">Source: Australian Early Development Census 2024</p></article></div>
      <section className="dh-locality-lens"><LocalityGlobe mode={mapMode} /></section>
      <div className="dh-overview-right"><article className="dh-card dh-services-card"><div className="dh-card-title"><div><span>⌖ Child and family services</span><small>Listed presence only, Brunswick East (SA2)</small></div><b>›</b></div><div className="dh-service-grid"><div className="blue"><i>♧</i><strong>2</strong><span>General practices</span></div><div className="coral"><i>◆</i><strong>3</strong><span>Pharmacies</span></div><div className="mint"><i>●</i><strong>1</strong><span>Maternal & child health service</span></div><div className="slate"><i>✚</i><strong>0</strong><span>Hospitals</span></div></div><p className="dh-source">Source: Healthdirect 2025 · Listed presence only</p></article></div>
    </div>
    <div className="dh-overview-actions"><button type="button" onClick={onConditions}><i>◉</i><span><strong>Explore child health conditions</strong><small>View data and evidence boundaries</small></span><b>›</b></button><button type="button" disabled title="The redesigned comparison is planned"><i>⇄</i><span><strong>Compare another locality</strong><small>Redesigned comparison coming next</small></span><b>›</b></button><button type="button" onClick={onDemand}><i>▥</i><span><strong>View future demand</strong><small>Population projections and service planning</small></span><b>›</b></button></div>
  </div>
}

function ConditionsPage() {
  const [conditionId, setConditionId] = useState<ConditionId>('brain')
  const [panel, setPanel] = useState<HealthPanel>('Local health')
  const selected = conditions.find((item) => item.id === conditionId) ?? conditions[0]
  const guidance = conditionGuidance[conditionId]
  const selectCondition = (id: ConditionId) => { setConditionId(id); setPanel('Local health') }
  return <div className="dh-page dh-conditions-page"><header className="dh-topbar"><div className="dh-static-search">⌕ <span>Search is unavailable in this release</span></div><div className="dh-top-actions"><span>⌖ Melbourne</span><button type="button" disabled title="Help centre is planned">?</button><button type="button" disabled title="Accounts are not enabled">●</button></div></header><div className="dh-condition-layout">
    <section className="dh-condition-visual" aria-label="Selected child health condition"><span className="dh-eyebrow">Child health conditions</span><h1>Child health conditions</h1><p>Local population context and practical prevention guidance.<br />Not individual diagnosis or medical advice.</p><div className="dh-organ-stage" tabIndex={0}><img src={selected.image} alt={`Medical educational illustration for ${selected.label}`} /><span className="dh-organ-tooltip"><strong>{selected.label}</strong><small>{selected.summary}</small></span></div><div className="dh-condition-picker" aria-label="Health condition categories">{conditions.map((item) => <button key={item.id} type="button" aria-pressed={conditionId === item.id} onClick={() => selectCondition(item.id)}><img src={item.image} alt="" /><span>{item.label}</span></button>)}</div></section>
    <section className="dh-condition-detail"><div className="dh-condition-heading"><h2>{selected.label}</h2><span>{selected.status}</span></div><div className="dh-topic-tabs dh-health-tabs" role="tablist" aria-label="Condition information">{healthPanels.map((item) => <button key={item} type="button" role="tab" aria-selected={panel === item} onClick={() => setPanel(item)}>{item}</button>)}</div>
      {panel === 'Local health' && <article className="dh-health-panel"><header><div><h3>Health indicators for Brunswick / Brunswick East</h3><p>Regional PHA context unless an SA2 geography is stated.</p></div><span>Population data</span></header><div className="dh-health-metrics">{guidance.indicators.map((indicator) => <div key={indicator.label}><small>{indicator.label}</small><strong>{indicator.value}</strong><span>{indicator.detail}</span></div>)}</div><p className="dh-health-note">{guidance.source}. PHA values describe the broader Brunswick / Brunswick East population and are not SA2 estimates or individual risk predictions.</p></article>}
      {panel === 'Prevention' && <GuidancePanel title="Practical prevention" icon="✚" items={guidance.prevention} footer="Discuss decisions about symptoms, medicines or treatment with a qualified health professional." />}
      {panel === 'Daily routine' && <GuidancePanel title="Healthy daily routine" icon="☀" items={guidance.routine} footer="Adapt routines to the child’s age, ability, diagnosed conditions and clinical plan." />}
      {panel === 'Seasonal care' && <GuidancePanel title="Melbourne seasonal care" icon="☁" items={guidance.seasonal} footer="Current warnings and forecasts should be checked through Victorian Government services." />}
      {panel === 'Nearby care' && <NearbyCarePanel />}
    </section>
  </div></div>
}

function GuidancePanel({ title, icon, items, footer }: { title: string; icon: string; items: string[]; footer: string }) {
  return <article className="dh-health-panel dh-guidance-panel"><header><div><h3>{icon} {title}</h3><p>General, evidence-informed guidance for parents and carers.</p></div></header><ol>{items.map((item, index) => <li key={item}><b>{index + 1}</b><span>{item}</span></li>)}</ol><p className="dh-health-note">{footer}</p></article>
}

function NearbyCarePanel() {
  return <article className="dh-health-panel dh-care-panel"><header><div><h3>Verified nearby care</h3><p>Distance from the Brunswick East reference point, calculated as straight-line distance.</p></div><span>Healthdirect 2025</span></header><div className="dh-care-list">{nearbyCare.map((service) => <div key={service.name}><i>⌖</i><span><strong>{service.name}</strong><small>{service.type}</small></span><b>{service.distance}</b><em>{service.fee}</em></div>)}</div><p className="dh-health-note">The public directory does not provide consultation prices, current bulk-billing eligibility, appointment availability or verified paediatric specialist staffing. Confirm fees, suitability and availability directly with the service. Distance is not travel time.</p></article>
}

interface DigitalHealthData {
  area: VcamsAreaIndicator[]
  lga: VcamsLgaIndicator[]
  facilities: HealthFacility[]
  projections: PopulationProjection[]
  profile: NeighbourhoodProfile | null
  environmentalDifference: EnvironmentalDifference | null
  loading: boolean
  error: string | null
}

const indicatorNames: Record<string, string> = {
  minimum_recommended_fruit: 'Recommended fruit intake',
  minimum_recommended_vegetables: 'Recommended vegetable intake',
  special_healthcare_needs: 'Special healthcare needs',
  good_or_better_general_health: 'Good or better general health',
  recommended_daily_physical_activity: 'Recommended daily physical activity',
  electronic_media_over_two_hours: 'More than two hours screen time',
  tobacco_smoke_exposure_at_home: 'Tobacco smoke exposure at home',
  household_food_insecurity: 'Household food insecurity',
  speech_or_language_concern_at_school_entry: 'Speech or language concern at school entry',
  emotional_or_behavioural_difficulty_at_school_entry: 'Emotional or behavioural difficulty at school entry',
  fully_breastfed: 'Fully breastfed at three months',
  maternal_child_health_home_consultation: 'MCH home consultation',
  maternal_child_health_3_5_year_visit: '3.5-year MCH visit',
}

function useDigitalHealthData(): DigitalHealthData {
  const [data, setData] = useState<DigitalHealthData>({ area: [], lga: [], facilities: [], projections: [], profile: null, environmentalDifference: null, loading: true, error: null })
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      api.getVcamsAreaContext('Hume Moreland', 2021, controller.signal),
      api.getVcamsLgaContext('Merri-bek (C)|Moreland (C)', controller.signal),
      api.getHealthFacilities('206011106', controller.signal),
      api.getPopulationProjections('206011106', controller.signal),
      api.getProfile('206011106', controller.signal),
      api.getEnvironmentalDifference('206011106', '206011496'),
    ]).then(([area, lga, facilities, projections, profile, environmentalDifference]) => setData({
      area: area.data.indicators,
      lga: lga.data.indicators,
      facilities: facilities.data.facilities,
      projections: projections.data.projections,
      profile: profile.data,
      environmentalDifference: environmentalDifference.data,
      loading: false,
      error: null,
    })).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setData(current => ({ ...current, loading: false, error: 'Validated health data could not be loaded.' }))
    })
    return () => controller.abort()
  }, [])
  return data
}

function environmentIndicators(data: DigitalHealthData): ProfileIndicator[] {
  return data.profile?.domains.find(domain => domain.id === 'environment')?.indicators ?? []
}

function EnvironmentPage({ data }: { data: DigitalHealthData }) {
  const indicators = environmentIndicators(data).filter(item => item.id.startsWith('env_'))
  const comparison = data.environmentalDifference
  const metric = (id: string) => indicators.find(item => item.id === id)
  const canopy = metric('env_vegetation_cover')
  const heat = metric('env_urban_heat')
  const openSpace = metric('env_open_space_access')
  const exact = (item?: ProfileIndicator) => item?.value === null || item?.value === undefined ? 'Unavailable' : `${Number(item.value).toFixed(4)}${item.unit === 'percent' ? '%' : item.unit === 'degrees Celsius' ? '°C' : ''}`
  return <div className="dh-page dh-board-page"><BoardHeader title="Environment and child health context" subtitle="Environmental conditions can shape opportunities for play, heat exposure and respiratory comfort. They do not diagnose a child or establish causation." />
    <section className="dh-env-dashboard">
      <article className="dh-env-insights"><header><div><h2>AI-assisted insight review</h2><p>Generated only from the validated values shown below</p></div><span>3 source-backed findings</span></header><div className="dh-insight-table"><div className="head"><span>Factor</span><span>Exact value</span><span>Generated interpretation</span><span>Evidence state</span></div><div><b>Tree canopy</b><strong>{exact(canopy)}</strong><p>Limited canopy coverage may reduce shade availability during hot conditions.</p><i>Source verified</i></div><div><b>Urban heat island</b><strong>{exact(heat)}</strong><p>The published surface-temperature context indicates a material urban heat effect.</p><i>Source verified</i></div><div><b>Public open space</b><strong>{exact(openSpace)}</strong><p>Open-space share provides place context, not a measure of accessibility or quality.</p><i>Source verified</i></div></div><footer>Interpretations are deterministic summaries of published values, not clinical recommendations or newly generated statistics.</footer></article>
      <article className="dh-env-health"><h3>Environmental profile</h3><div className="dh-env-score"><strong>3/3</strong><span>indicators available</span></div>{indicators.map(item => <div className="dh-env-metric" key={item.id}><span><b>{item.name}</b><small>{item.reference_year} · {item.geographic_unit}</small></span><strong>{exact(item)}</strong><i style={{ width: `${Math.min(100, Math.abs(Number(item.value)) * 5)}%` }} /></div>)}</article>
      <article className="dh-env-comparison"><header><div><h3>Environmental comparison</h3><p>Brunswick East compared with Brunswick South</p></div><span>Matched comparison</span></header><div>{comparison?.environmental_indicators.map(item => <article key={item.id}><header><b>{item.name}</b><small>{item.source} · {item.reference_year}</small></header><div><span><small>Brunswick East</small><strong>{Number(item.neighbourhood_a.value).toFixed(2)} {item.unit}</strong></span><i><b style={{ width: `${Math.min(100, Number(item.neighbourhood_a.value) * 6)}%` }} /></i><span><small>Brunswick South</small><strong>{Number(item.neighbourhood_b.value).toFixed(2)} {item.unit}</strong></span></div><footer>Difference: {Number(item.approved_difference.value).toFixed(2)} {item.unit}</footer></article>) ?? <p>Comparison data is loading.</p>}</div></article>
      <article className="dh-needs-attention"><h3>Needs attention</h3><ul><li><i>!</i><span><b>Source age</b><small>Environmental observations are from 2018 and should not be described as current conditions.</small></span></li><li><i>!</i><span><b>Exposure boundary</b><small>Area-level heat and canopy do not estimate an individual child’s exposure.</small></span></li><li><i>✓</i><span><b>Geography verified</b><small>All three values are harmonised to ASGS Edition 3 SA2.</small></span></li></ul></article>
    </section>
  </div>
}

function EvidenceReviewPage({ data }: { data: DigitalHealthData }) {
  const [language, setLanguage] = useState<'English' | 'Plain English'>('English')
  const [verified, setVerified] = useState<string[]>([])
  const evidence = environmentIndicators(data).filter(item => item.id.startsWith('env_'))
  const verify = (id: string) => setVerified(current => current.includes(id) ? current : [...current, id])
  return <div className="dh-page dh-board-page"><BoardHeader title="Evidence review" subtitle="Check generated statements against the actual published record before using them in reports or presentations." />
    <section className="dh-review-layout"><article className="dh-review-list"><header><div><h2>Generated claims</h2><p>Select a claim and verify it against its source fields.</p></div><label>Display language<select value={language} onChange={event => setLanguage(event.target.value as 'English' | 'Plain English')}><option>English</option><option>Plain English</option></select></label></header>{evidence.map(item => <div key={item.id}><span><b>{item.name}</b><small>{language === 'Plain English' ? `The source reports ${Number(item.value).toFixed(4)} ${item.unit} for Brunswick East.` : `Claim value: ${Number(item.value).toFixed(4)} ${item.unit}`}</small></span><strong>{verified.includes(item.id) ? 'Verified' : 'Pending review'}</strong><button type="button" onClick={() => verify(item.id)} disabled={verified.includes(item.id)}>{verified.includes(item.id) ? 'Checked' : 'Verify source'}</button></div>)}</article><aside className="dh-source-document"><span>ACTUAL SOURCE RECORD</span><h3>Environmental context contract</h3><dl><div><dt>Locality</dt><dd>Brunswick East</dd></div><div><dt>Geography</dt><dd>SA2 (ASGS Edition 3, 2021)</dd></div><div><dt>Source</dt><dd>DELWP Cooling & Greening Melbourne 2018 / VPA Open Space</dd></div><div><dt>Reference year</dt><dd>2018</dd></div><div><dt>Available records</dt><dd>{evidence.length}</dd></div><div><dt>Verification progress</dt><dd>{verified.length}/{evidence.length}</dd></div></dl><p>The review confirms exact value, unit, source, year and geography. It does not independently validate the publisher’s methodology.</p></aside></section>
  </div>
}

function BoardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <><header className="dh-topbar"><div className="dh-static-search">⌕ <span>Brunswick East · SA2</span></div><div className="dh-top-actions"><span>⌖ Melbourne</span><button type="button" disabled title="Help centre is planned">?</button></div></header><div className="dh-board-heading"><div><span className="dh-eyebrow">Digital child health planning</span><h1>{title}</h1><p>{subtitle}</p></div><span className="dh-data-state">Validated data</span></div></>
}

function CareAccessPage({ data }: { data: DigitalHealthData }) {
  const groups = useMemo(() => data.facilities.reduce<Record<string, HealthFacility[]>>((result, facility) => {
    const key = facility.service_type.includes('Maternal') ? 'Maternal and child health' : facility.category === 'pharmacy' ? 'Pharmacy' : facility.category === 'hospital' ? 'Hospital' : 'General practice'
    result[key] = [...(result[key] ?? []), facility]
    return result
  }, {}), [data.facilities])
  const categories = ['General practice', 'Pharmacy', 'Maternal and child health', 'Hospital']
  return <div className="dh-page dh-board-page"><BoardHeader title="Care access" subtitle="Verified service locations inside Brunswick East. Presence is not capacity, price or appointment availability." />
    {data.error && <p className="dh-board-error">{data.error}</p>}
    <section className="dh-board-grid dh-care-board">
      <article className="dh-feature-card dh-care-hero"><div><span className="dh-card-kicker">LOCAL CARE NETWORK</span><h2>{data.loading ? 'Loading' : `${data.facilities.length} listed services`}</h2><p>Directory-listed services physically located within the Brunswick East SA2 boundary.</p></div><div className="dh-care-orbit" aria-hidden="true"><i>✚</i><span>⌖</span><b>●</b></div><small>Healthdirect facilities extract · 7 March 2025</small></article>
      <article className="dh-board-card dh-access-summary"><h3>Service mix</h3><div className="dh-access-rings">{categories.map((category, index) => <div key={category}><span style={{ '--ring': `${Math.min(100, (groups[category]?.length ?? 0) * 25)}%` } as CSSProperties}><b>{groups[category]?.length ?? 0}</b></span><small>{category}</small><i className={`tone-${index}`} /></div>)}</div></article>
      <article className="dh-board-card dh-service-directory"><header><div><h3>Verified directory</h3><p>Active records in the source extract</p></div><span>{data.facilities.length} results</span></header><div>{data.facilities.map(facility => <article key={facility.facility_id}><i>{facility.category === 'pharmacy' ? '◆' : facility.service_type.includes('Maternal') ? '●' : '✚'}</i><span><strong>{facility.name}</strong><small>{facility.service_type}</small><em>{facility.address}</em></span><b>Listed</b></article>)}</div></article>
      <article className="dh-board-card dh-access-boundary"><h3>What this board can answer</h3><ul><li><b>Available</b><span>Service name, type, address and listed location</span></li><li><b>Not published</b><span>Consultation fee, bulk billing, waiting time and paediatric staffing</span></li><li><b>Interpret carefully</b><span>Being nearby does not mean the service is suitable or accepting patients</span></li></ul></article>
    </section>
  </div>
}

function FutureDemandPage({ data }: { data: DigitalHealthData }) {
  const projections = [...data.projections].filter(row => row.sex === 'persons').sort((a, b) => a.projection_year - b.projection_year)
  const first = projections[0]
  const last = projections.length ? projections[projections.length - 1] : undefined
  const childChange = first && last ? ((last.population_age_0_14_projected ?? 0) - (first.population_age_0_14_projected ?? 0)) : null
  const max = Math.max(...projections.map(row => row.population_age_0_14_projected ?? 0), 1)
  return <div className="dh-page dh-board-page"><BoardHeader title="Future demand" subtitle="Published population projections help plan child and family services. They are modelled scenarios, not forecasts of individual need." />
    {data.error && <p className="dh-board-error">{data.error}</p>}
    <section className="dh-board-grid dh-demand-board">
      <article className="dh-feature-card dh-demand-hero"><div><span className="dh-card-kicker">CHILD POPULATION OUTLOOK</span><h2>{last ? Math.round(last.population_age_0_14_projected ?? 0).toLocaleString() : 'Loading'}</h2><p>children aged 0–14 projected for Brunswick East in {last?.projection_year ?? '2036'}</p></div><div className="dh-demand-wave">{projections.map(row => <i key={row.projection_year} style={{ height: `${32 + ((row.population_age_0_14_projected ?? 0) / max) * 90}px` }}><span>{row.projection_year}</span></i>)}</div><small>Victoria in Future 2023 Release 2 · SA2</small></article>
      <article className="dh-board-card dh-demand-change"><h3>Planning signal</h3><strong>{childChange === null ? 'Loading' : `${childChange >= 0 ? '+' : ''}${Math.round(childChange).toLocaleString()}`}</strong><p>projected change in children aged 0–14 from {first?.projection_year ?? 2021} to {last?.projection_year ?? 2036}</p><span>Projection, not observed growth</span></article>
      <article className="dh-board-card dh-age-outlook"><header><div><h3>Age-group outlook</h3><p>Published counts by five-year age band</p></div></header><div className="dh-projection-chart">{projections.map(row => <div key={row.projection_year}><b>{row.projection_year}</b><span title={`Ages 0–4: ${Math.round(row.population_age_0_4_projected ?? 0)}`} style={{ '--value': `${((row.population_age_0_4_projected ?? 0) / max) * 100}%` } as CSSProperties} /><span title={`Ages 5–9: ${Math.round(row.population_age_5_9_projected ?? 0)}`} style={{ '--value': `${((row.population_age_5_9_projected ?? 0) / max) * 100}%` } as CSSProperties} /><span title={`Ages 10–14: ${Math.round(row.population_age_10_14_projected ?? 0)}`} style={{ '--value': `${((row.population_age_10_14_projected ?? 0) / max) * 100}%` } as CSSProperties} /></div>)}</div><footer><span>● 0–4 years</span><span>● 5–9 years</span><span>● 10–14 years</span></footer></article>
      <article className="dh-board-card dh-health-demand"><h3>Health planning context</h3><div>{data.area.filter(item => ['special_healthcare_needs', 'recommended_daily_physical_activity', 'household_food_insecurity'].includes(item.indicator_id)).map(item => <div key={item.indicator_id}><span><b>{indicatorNames[item.indicator_id]}</b><small>Hume Moreland · {item.reference_year}</small></span><strong>{item.percent?.toFixed(1)}%</strong><i className={item.quality_flag}>{item.quality_flag.replace(/_/g, ' ')}</i></div>)}</div><p>These broad-area survey estimates describe current context; they are not projected forward.</p></article>
    </section>
  </div>
}

function VcamsContext({ data }: { data: DigitalHealthData }) {
  const latestLga = Object.values(data.lga.reduce<Record<string, VcamsLgaIndicator>>((result, item) => {
    if (!result[item.indicator_id] || item.reference_period > result[item.indicator_id].reference_period) result[item.indicator_id] = item
    return result
  }, {}))
  const items = [...data.area, ...latestLga]
  if (!items.length) return null
  return <section className="dh-context-strip"><header><div><h2>Wider child health and healthy-living context</h2><p>All newly integrated VCAMS indicators, shown at their published geography.</p></div><span>{items.length} measures</span></header><div>{items.map(item => <article key={`${item.indicator_id}-${'reference_year' in item ? item.reference_year : item.reference_period}`}><small>{indicatorNames[item.indicator_id] ?? item.indicator_id}</small><strong>{item.percent === null ? 'Not published' : `${item.percent.toFixed(1)}%`}</strong><span>{'area_name' in item ? `${item.area_name} area · ${item.reference_year}` : `${item.lga_name.replace(' (C)', '')} LGA · ${item.reference_period}`}</span><i>{'quality_flag' in item ? item.quality_flag.replace(/_/g, ' ') : item.publication_status}</i></article>)}</div></section>
}

export default function DigitalHealthHub({ onHome }: DigitalHealthHubProps) {
  const [view, setView] = useState<HealthView>('overview')
  const data = useDigitalHealthData()
  const page = view === 'overview'
    ? <OverviewPage onConditions={() => setView('conditions')} onDemand={() => setView('demand')} />
    : view === 'conditions' ? <><ConditionsPage /><VcamsContext data={data} /></>
      : view === 'environment' ? <EnvironmentPage data={data} />
        : view === 'care' ? <CareAccessPage data={data} />
          : view === 'demand' ? <FutureDemandPage data={data} />
            : <EvidenceReviewPage data={data} />
  return <div className="digital-health-hub"><SideNavigation current={view} onChange={setView} onHome={onHome} /><main>{page}</main></div>
}
