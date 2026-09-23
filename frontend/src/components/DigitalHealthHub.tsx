import { useState } from 'react'

import LocalityGlobe from './LocalityGlobe'
import './DigitalHealthHub.css'
import './DigitalHealthHub.responsive.css'
import './DigitalHealthHub.health.css'

type HealthView = 'overview' | 'conditions'
type ConditionId = 'brain' | 'lungs' | 'metabolic' | 'immune' | 'perinatal'

interface DigitalHealthHubProps { onHome: () => void }

const navigation = [
  { id: 'overview', label: 'Overview', symbol: '⌂', enabled: true },
  { id: 'conditions', label: 'Child health conditions', symbol: '✚', enabled: true },
  { id: 'development', label: 'Development', symbol: '▥', enabled: false },
  { id: 'prevention', label: 'Prevention', symbol: '♢', enabled: false },
  { id: 'care', label: 'Care access', symbol: '⌖', enabled: false },
  { id: 'demand', label: 'Future demand', symbol: '⌁', enabled: false },
  { id: 'evidence', label: 'Evidence', symbol: '▤', enabled: false },
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
    <div className="dh-community-mark"><i>▥</i><span>Community<br />for brighter futures</span></div>
  </aside>
}

function DevelopmentWheel() {
  return <div className="dh-development-wheel" aria-label="Five AEDC child development domains"><span className="domain physical">♥<small>Physical health<br />and wellbeing</small></span><span className="domain social">●●<small>Social<br />competence</small></span><span className="domain language">▣<small>Language and<br />cognitive skills</small></span><span className="domain emotional">☺<small>Emotional<br />maturity</small></span><span className="domain communication">●<small>Communication skills<br />and general knowledge</small></span><b>♟</b></div>
}

function OverviewPage({ onConditions }: { onConditions: () => void }) {
  const [mapMode, setMapMode] = useState<'lens' | 'map'>('lens')
  return <div className="dh-page dh-overview-page">
    <header className="dh-topbar"><div className="dh-static-search">⌕ <span>Brunswick East · SA2</span></div><div className="dh-top-actions"><span>⌖ Melbourne</span><button type="button" disabled title="Help centre is planned">?</button><button type="button" disabled title="Accounts are not enabled">●</button></div></header>
    <div className="dh-overview-title"><div><h1>Locality overview</h1><p>Community-level evidence — not individual diagnosis or medical advice.</p></div><div className="dh-lens-tabs" role="tablist" aria-label="Map presentation"><button type="button" role="tab" aria-selected={mapMode === 'lens'} onClick={() => setMapMode('lens')}>Locality lens</button><button type="button" role="tab" aria-selected={mapMode === 'map'} onClick={() => setMapMode('map')}>Standard map</button></div><button className="dh-view-button" type="button" disabled title="Additional audience views are planned">♟ Planner view⌄</button></div>
    <div className="dh-overview-grid">
      <div className="dh-overview-left"><article className="dh-card dh-population-card"><div className="dh-card-title"><div><span>♟ Who lives here?</span><small>Children by age group, Brunswick East (SA2)</small></div><b>›</b></div><div className="dh-age-grid"><div><i>●</i><span>0–4 years</span><strong>488</strong><small>children</small></div><div><i>◆</i><span>5–9 years</span><strong>403</strong><small>children</small></div><div><i>▲</i><span>10–14 years</span><strong>360</strong><small>children</small></div></div><p className="dh-source">Source: Victoria in Future 2023 · SA2 projection</p></article><article className="dh-card dh-development-card"><div className="dh-card-title"><div><span>▥ Child development</span><small>AEDC 2024, Brunswick East (SA2)</small></div><b>›</b></div><div className="dh-development-content"><DevelopmentWheel /><dl><div><dt>Vulnerable on one or more domains</dt><dd>23.8%</dd></div><div><dt>On track across all five domains</dt><dd>56.8%</dd></div></dl></div><p className="dh-source">Source: Australian Early Development Census 2024</p></article></div>
      <section className="dh-locality-lens"><LocalityGlobe mode={mapMode} /></section>
      <div className="dh-overview-right"><article className="dh-card dh-services-card"><div className="dh-card-title"><div><span>⌖ Child and family services</span><small>Listed presence only, Brunswick East (SA2)</small></div><b>›</b></div><div className="dh-service-grid"><div className="blue"><i>♧</i><strong>2</strong><span>General practices</span></div><div className="coral"><i>◆</i><strong>3</strong><span>Pharmacies</span></div><div className="mint"><i>●</i><strong>1</strong><span>Maternal & child health service</span></div><div className="slate"><i>✚</i><strong>0</strong><span>Hospitals</span></div></div><p className="dh-source">Source: Healthdirect 2025 · Listed presence only</p></article></div>
    </div>
    <div className="dh-overview-actions"><button type="button" onClick={onConditions}><i>◉</i><span><strong>Explore child health conditions</strong><small>View data and evidence boundaries</small></span><b>›</b></button><button type="button" disabled title="The redesigned comparison is planned"><i>⇄</i><span><strong>Compare another locality</strong><small>Redesigned comparison coming next</small></span><b>›</b></button><button type="button" disabled title="The future demand board is planned"><i>▥</i><span><strong>View future demand</strong><small>Population projections and service planning</small></span><b>›</b></button></div>
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

export default function DigitalHealthHub({ onHome }: DigitalHealthHubProps) {
  const [view, setView] = useState<HealthView>('overview')
  return <div className="digital-health-hub"><SideNavigation current={view} onChange={setView} onHome={onHome} /><main>{view === 'overview' ? <OverviewPage onConditions={() => setView('conditions')} /> : <ConditionsPage />}</main></div>
}
