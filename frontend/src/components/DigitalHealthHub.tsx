import { useState } from 'react'

import LocalityGlobe from './LocalityGlobe'
import './DigitalHealthHub.css'
import './DigitalHealthHub.responsive.css'

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

const conditionTabs = ['Neurodevelopment', 'Emotional wellbeing', 'Mental health service use', 'Disability support'] as const

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
      <div className="dh-overview-right"><article className="dh-card dh-services-card"><div className="dh-card-title"><div><span>⌖ Child and family services</span><small>Listed presence only, Brunswick East (SA2)</small></div><b>›</b></div><div className="dh-service-grid"><div className="blue"><i>♧</i><strong>2</strong><span>General practices</span></div><div className="coral"><i>◆</i><strong>3</strong><span>Pharmacies</span></div><div className="mint"><i>●</i><strong>1</strong><span>Maternal & child health service</span></div><div className="slate"><i>✚</i><strong>0</strong><span>Hospitals</span></div></div><p className="dh-source">Source: Healthdirect 2025 · Listed presence only</p></article><article className="dh-card dh-evidence-card"><div className="dh-card-title"><div><span>▤ Evidence coverage</span><small>Geographic level of available data</small></div><b>›</b></div><ul><li><span>Development</span><strong>SA2</strong></li><li><span>Service presence</span><strong>SA2</strong></li><li><span>Child-health context</span><strong>PHA</strong></li><li><span>Immunisation context</span><strong>SA3</strong></li></ul></article></div>
    </div>
    <div className="dh-overview-actions"><button type="button" onClick={onConditions}><i>◉</i><span><strong>Explore child health conditions</strong><small>View data and evidence boundaries</small></span><b>›</b></button><button type="button" disabled title="The redesigned comparison is planned"><i>⇄</i><span><strong>Compare another locality</strong><small>Redesigned comparison coming next</small></span><b>›</b></button><button type="button" disabled title="The future demand board is planned"><i>▥</i><span><strong>View future demand</strong><small>Population projections and service planning</small></span><b>›</b></button></div>
  </div>
}

function Pathway() {
  const stages = [['♟','Early childhood','Birth–5 years','Foundations for learning, health and wellbeing'],['♙','School entry','5–8 years','Transition, learning and social development'],['♟♟','Middle childhood','9–12 years','Growing independence and social connections'],['♙','Adolescence','13–17 years','Identity, mental wellbeing and future opportunities']]
  return <article className="dh-pathway-card"><div className="dh-card-title"><div><span>▤ Developmental pathway across childhood</span><small>Different data sources inform each life stage. Select a stage to review its evidence boundary.</small></div></div><div className="dh-pathway-ribbon"><i /><i /><i /><i /></div><div className="dh-life-stages">{stages.map(([icon,title,age,copy]) => <button key={title} type="button" title={`${title}: ${copy}`}><i>{icon}</i><b>{title}</b><span>{age}</span><small>{copy}</small></button>)}</div></article>
}

function ConditionsPage() {
  const [conditionId, setConditionId] = useState<ConditionId>('brain')
  const [topic, setTopic] = useState<(typeof conditionTabs)[number]>('Neurodevelopment')
  const selected = conditions.find((item) => item.id === conditionId) ?? conditions[0]
  const brainAvailable = conditionId === 'brain'
  return <div className="dh-page dh-conditions-page"><header className="dh-topbar"><div className="dh-static-search">⌕ <span>Search is unavailable in this release</span></div><div className="dh-top-actions"><span>⌖ Melbourne</span><button type="button" disabled title="Help centre is planned">?</button><button type="button" disabled title="Accounts are not enabled">●</button></div></header><div className="dh-condition-layout">
    <section className="dh-condition-visual" aria-label="Selected child health condition"><span className="dh-eyebrow">Child health conditions</span><h1>Child health conditions</h1><p>Aggregate evidence — not an individual clinical record.<br />No diagnosis or medication advice.</p><div className="dh-organ-stage"><img src={selected.image} alt={`Medical educational illustration for ${selected.label}`} /><button className="hotspot one" type="button" aria-label="Open evidence summary"><i /></button><button className="hotspot two" type="button" aria-label="Open evidence boundary"><i /></button><span><strong>{selected.label}</strong><small>{selected.summary}</small></span></div><div className="dh-condition-picker" aria-label="Health condition categories">{conditions.map((item) => <button key={item.id} type="button" aria-pressed={conditionId === item.id} onClick={() => setConditionId(item.id)}><img src={item.image} alt="" /><span>{item.label}</span></button>)}</div></section>
    <section className="dh-condition-detail"><div className="dh-condition-heading"><h2>{selected.label}</h2><span>{selected.status}</span></div><div className="dh-topic-tabs" role="tablist" aria-label="Condition evidence topics">{conditionTabs.map((item) => <button key={item} type="button" role="tab" aria-selected={topic === item} disabled={!brainAvailable && item !== 'Neurodevelopment'} title={!brainAvailable && item !== 'Neurodevelopment' ? 'No approved locality evidence is integrated for this topic' : undefined} onClick={() => setTopic(item)}>{item}</button>)}</div><Pathway /><div className="dh-condition-bottom"><article className="dh-detail-list"><h3>▤ Available evidence</h3>{brainAvailable ? <ul><li><span>AEDC development domains<small>Australian Early Development Census</small></span><b>SA2</b></li><li><span>School Entrant Health Questionnaire<small>Victorian Government data</small></span><b>LGA</b></li><li><span>Child mental-health conditions<small>PHIDU research context</small></span><b>PHA</b></li><li><span>NDIS disability-support participation<small>Public dataset candidate</small></span><b>SA2*</b></li></ul> : <div className="dh-unavailable"><strong>No approved SA2 outcome data</strong><p>{selected.summary}</p><small>This category remains visible to communicate the intended health model without fabricating locality statistics.</small></div>}</article><article className="dh-detail-list"><h3>⌘ Local service pathways</h3><ul><li><span>Maternal & child health<small>Council-delivered services</small></span></li><li><span>General practice<small>Primary care providers</small></span></li><li><span>Child and family health<small>Assessment and early support</small></span></li><li><span>Mental health support<small>Specialist and community services</small></span></li></ul><p>Listed presence does not mean availability, capacity or quality.</p></article><article className="dh-evidence-drawer"><h3>▤ Evidence details</h3><dl><div><dt>Source</dt><dd>{brainAvailable ? 'AEDC' : 'Not integrated'}</dd></div><div><dt>Year</dt><dd>{brainAvailable ? '2024' : 'Not available'}</dd></div><div><dt>Geography</dt><dd>{brainAvailable ? 'SA2 / context areas' : 'Unsupported at SA2'}</dd></div><div><dt>Status</dt><dd>{brainAvailable ? 'Published' : 'Unavailable'}</dd></div></dl><p>Population-level data only. Not suitable for identifying individual children or making clinical decisions.</p></article></div></section>
  </div></div>
}

export default function DigitalHealthHub({ onHome }: DigitalHealthHubProps) {
  const [view, setView] = useState<HealthView>('overview')
  return <div className="digital-health-hub"><SideNavigation current={view} onChange={setView} onHome={onHome} /><main>{view === 'overview' ? <OverviewPage onConditions={() => setView('conditions')} /> : <ConditionsPage />}</main></div>
}
