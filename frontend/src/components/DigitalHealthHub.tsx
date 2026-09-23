import { useMemo, useState } from 'react'

import './DigitalHealthHub.css'

type HealthView = 'overview' | 'conditions'

interface DigitalHealthHubProps {
  onHome: () => void
}

const navigation = [
  { id: 'overview', label: 'Overview', symbol: '⌂', enabled: true },
  { id: 'conditions', label: 'Child health conditions', symbol: '✚', enabled: true },
  { id: 'development', label: 'Development', symbol: '▥', enabled: false },
  { id: 'prevention', label: 'Prevention', symbol: '◈', enabled: false },
  { id: 'care', label: 'Care access', symbol: '⌖', enabled: false },
  { id: 'demand', label: 'Future demand', symbol: '⌁', enabled: false },
  { id: 'evidence', label: 'Evidence', symbol: '▤', enabled: false },
] as const

const serviceCounts = [
  { label: 'General practices', value: 2, tone: 'blue', symbol: '♧' },
  { label: 'Pharmacies', value: 3, tone: 'coral', symbol: '◆' },
  { label: 'Maternal & child health', value: 1, tone: 'mint', symbol: '●' },
  { label: 'Hospitals', value: 0, tone: 'slate', symbol: '✚' },
] as const

const developmentDomains = [
  { label: 'Physical health and wellbeing', className: 'physical' },
  { label: 'Social competence', className: 'social' },
  { label: 'Emotional maturity', className: 'emotional' },
  { label: 'Language and cognitive skills', className: 'language' },
  { label: 'Communication skills and general knowledge', className: 'communication' },
] as const

const conditionTabs = ['Neurodevelopment', 'Emotional wellbeing', 'Mental health service use', 'Disability support'] as const

function SideNavigation({ current, onChange, onHome }: {
  current: HealthView
  onChange: (view: HealthView) => void
  onHome: () => void
}) {
  return <aside className="dh-sidebar">
    <button className="dh-brand" type="button" onClick={onHome} aria-label="Return to KinderPrint home">
      <span className="dh-brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
      <strong>KinderPrint</strong>
    </button>
    <nav aria-label="Child health navigation">
      {navigation.map((item) => {
        const selected = item.id === current
        return <button
          key={item.id}
          type="button"
          className={selected ? 'is-active' : undefined}
          aria-current={selected ? 'page' : undefined}
          disabled={!item.enabled}
          onClick={() => item.enabled && onChange(item.id as HealthView)}
        >
          <span aria-hidden="true">{item.symbol}</span>
          <b>{item.label}</b>
          {!item.enabled && <small>Next</small>}
        </button>
      })}
    </nav>
    <footer>
      <span>⌖</span>
      <div><strong>Greater Melbourne</strong><small>SA2 reporting localities</small></div>
    </footer>
  </aside>
}

function LocalityLens() {
  const [lens, setLens] = useState<'lens' | 'map'>('lens')
  return <section className={`dh-locality-lens ${lens === 'map' ? 'is-map' : ''}`} aria-label="Selected locality spatial view">
    <div className="dh-lens-tabs" role="tablist" aria-label="Map presentation">
      <button type="button" role="tab" aria-selected={lens === 'lens'} onClick={() => setLens('lens')}>Locality lens</button>
      <button type="button" role="tab" aria-selected={lens === 'map'} onClick={() => setLens('map')}>Standard map</button>
    </div>
    <div className="dh-globe" aria-label="Melbourne spatial lens highlighting Brunswick East">
      <div className="dh-globe-grid" />
      <div className="dh-bay">Port Phillip<br />Bay</div>
      <div className="dh-locality-shape" />
      <span className="dh-pin"><i />Brunswick East <small>SA2</small></span>
      <div className="dh-zoom-story" aria-hidden="true"><span>AU</span><i /><span>VIC</span><i /><span>MEL</span></div>
    </div>
  </section>
}

function OverviewPage({ onConditions }: { onConditions: () => void }) {
  return <div className="dh-page dh-overview-page">
    <header className="dh-page-header">
      <div><span className="dh-eyebrow">Community child-health intelligence</span><h1>Locality overview</h1><p>Community-level evidence, not individual diagnosis or medical advice.</p></div>
      <div className="dh-header-actions"><label><span className="sr-only">Search localities</span><input defaultValue="Brunswick East" aria-label="Selected locality" /></label><button type="button">Planner view⌄</button></div>
    </header>
    <div className="dh-overview-grid">
      <div className="dh-overview-left">
        <article className="dh-card dh-population-card"><div className="dh-card-title"><div><span>Who lives here?</span><small>Children by age group · VIF 2023 · SA2</small></div><b>↗</b></div><div className="dh-age-grid"><div><i>●</i><span>0–4 years</span><strong>488</strong></div><div><i>◆</i><span>5–9 years</span><strong>403</strong></div><div><i>▲</i><span>10–14 years</span><strong>360</strong></div></div></article>
        <article className="dh-card dh-development-card"><div className="dh-card-title"><div><span>Child development</span><small>AEDC 2024 · Brunswick East · SA2</small></div><b>↗</b></div><div className="dh-development-content"><div className="dh-domain-orbit">{developmentDomains.map((domain) => <i key={domain.className} className={domain.className} title={domain.label} />)}<span>5</span></div><dl><div><dt>Vulnerable on one or more domains</dt><dd>23.8%</dd></div><div><dt>On track across all five domains</dt><dd>56.8%</dd></div></dl></div></article>
      </div>
      <LocalityLens />
      <div className="dh-overview-right">
        <article className="dh-card dh-services-card"><div className="dh-card-title"><div><span>Child and family services</span><small>Listed presence only · Healthdirect 2025</small></div><b>↗</b></div><div className="dh-service-grid">{serviceCounts.map((item) => <div key={item.label} className={item.tone}><i>{item.symbol}</i><strong>{item.value}</strong><span>{item.label}</span></div>)}</div></article>
        <article className="dh-card dh-evidence-card"><div className="dh-card-title"><div><span>Evidence coverage</span><small>Geographic level for this locality</small></div><b>↗</b></div><ul><li><span>Development</span><strong>SA2</strong></li><li><span>Service presence</span><strong>SA2</strong></li><li><span>Child-health context</span><strong>PHA</strong></li><li><span>Immunisation context</span><strong>SA3</strong></li></ul></article>
      </div>
    </div>
    <div className="dh-overview-actions"><button type="button" onClick={onConditions}><i>◉</i><span><strong>Explore child health conditions</strong><small>View health evidence and service pathways</small></span><b>→</b></button><button type="button" disabled><i>⇄</i><span><strong>Compare another locality</strong><small>Comparison redesign is coming next</small></span><b>→</b></button><button type="button" disabled><i>▥</i><span><strong>View future demand</strong><small>Population projections and service planning</small></span><b>→</b></button></div>
  </div>
}

function ConditionsPage() {
  const condition = 'Brain & development'
  const [topic, setTopic] = useState<(typeof conditionTabs)[number]>('Neurodevelopment')
  const conditions = useMemo(() => ['Brain & development', 'Lungs & asthma', 'Metabolic health', 'Allergy & immune', 'Perinatal health'], [])
  return <div className="dh-page dh-conditions-page">
    <header className="dh-page-header"><div><span className="dh-eyebrow">Child health conditions</span><h1>Child health conditions</h1><p>Aggregate evidence, not an individual clinical record. No diagnosis or medication advice.</p></div><div className="dh-header-actions"><label><span className="sr-only">Search health topics</span><input placeholder="Search topics, data or services…" /></label><button type="button">Melbourne⌄</button></div></header>
    <div className="dh-condition-layout">
      <section className="dh-condition-visual" aria-label="Selected child health condition">
        <div className="dh-brain-stage"><img src="/brain-health-hero.png" alt="Three-dimensional educational illustration of a human brain" /><button className="hotspot one" type="button" aria-label="Developmental region"><i /></button><button className="hotspot two" type="button" aria-label="Emotional wellbeing region"><i /></button><button className="hotspot three" type="button" aria-label="Communication region"><i /></button><span><strong>{condition}</strong><small>Population evidence</small></span></div>
        <div className="dh-condition-picker" aria-label="Health condition categories">{conditions.map((item, index) => {
          const available = item === condition
          return <button key={item} type="button" aria-pressed={available} disabled={!available}><i aria-hidden="true">{['◉','♧','◆','✣','◍'][index]}</i><span>{item}</span>{!available && <small>Next</small>}</button>
        })}</div>
      </section>
      <section className="dh-condition-detail">
        <div className="dh-condition-heading"><h2>{condition}</h2><span>Population evidence</span></div>
        <div className="dh-topic-tabs" role="tablist" aria-label="Condition evidence topics">{conditionTabs.map((item) => <button key={item} type="button" role="tab" aria-selected={topic === item} onClick={() => setTopic(item)}>{item}</button>)}</div>
        <article className="dh-pathway-card"><div className="dh-card-title"><div><span>Developmental pathway across childhood</span><small>Different evidence sources inform each life stage.</small></div></div><div className="dh-pathway-ribbon"><i /><i /><i /><i /></div><div className="dh-life-stages"><div><b>Early childhood</b><span>Birth–5 years</span><small>Foundations for learning, health and wellbeing</small></div><div><b>School entry</b><span>5–8 years</span><small>Transition, learning and social development</small></div><div><b>Middle childhood</b><span>9–12 years</span><small>Growing independence and social connections</small></div><div><b>Adolescence</b><span>13–17 years</span><small>Identity, mental wellbeing and future opportunities</small></div></div></article>
        <div className="dh-condition-bottom"><article className="dh-detail-list"><h3>Available evidence</h3><ul><li><span>AEDC development domains<small>Australian Early Development Census</small></span><b>SA2</b></li><li><span>School Entrant Health Questionnaire<small>Victorian Government data</small></span><b>LGA</b></li><li><span>Child mental-health conditions<small>PHIDU research context</small></span><b>PHA</b></li><li><span>NDIS disability-support participation<small>Public dataset candidate</small></span><b>SA2</b></li></ul></article><article className="dh-detail-list"><h3>Local service pathways</h3><ul><li><span>Maternal & child health<small>Council-delivered services</small></span></li><li><span>General practice<small>Primary care providers</small></span></li><li><span>Child and family health<small>Assessment and early support</small></span></li><li><span>Mental health support<small>Specialist and community services</small></span></li></ul><p>Listed presence does not mean availability, capacity or quality.</p></article><article className="dh-evidence-drawer"><h3>Evidence details</h3><dl><div><dt>Source</dt><dd>AEDC</dd></div><div><dt>Year</dt><dd>2024</dd></div><div><dt>Geography</dt><dd>SA2 / context areas</dd></div><div><dt>Status</dt><dd>Published</dd></div></dl><p>Population-level data only. Not suitable for identifying individual children or making clinical decisions.</p></article></div>
      </section>
    </div>
  </div>
}

export default function DigitalHealthHub({ onHome }: DigitalHealthHubProps) {
  const [view, setView] = useState<HealthView>('overview')
  return <div className="digital-health-hub"><SideNavigation current={view} onChange={setView} onHome={onHome} /><main>{view === 'overview' ? <OverviewPage onConditions={() => setView('conditions')} /> : <ConditionsPage />}</main></div>
}
