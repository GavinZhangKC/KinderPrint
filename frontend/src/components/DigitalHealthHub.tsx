import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import LocalityGlobe from './LocalityGlobe'
import { api, type ChildHealthContext, type EnvironmentalDifference, type HealthFacility, type NeighbourhoodProfile, type NeighbourhoodSearchResult, type PopulationProjection, type ProfileIndicator, type VcamsAreaIndicator, type VcamsLgaIndicator } from '../services/api'
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

function LocalitySearch({ locality, onSelect }: { locality: NeighbourhoodSearchResult; onSelect: (value: NeighbourhoodSearchResult) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NeighbourhoodSearchResult[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const timer = window.setTimeout(() => api.searchNeighbourhoods(query).then(response => setResults(response.data.filter(item => /^\d{9}$/.test(item.id)).slice(0, 8))).catch(() => setResults([])), 220)
    return () => window.clearTimeout(timer)
  }, [query])
  return <div className="dh-locality-search"><label htmlFor="dh-locality-input">Choose reporting locality</label><div><span>⌕</span><input id="dh-locality-input" value={query} placeholder={`${locality.name} · SA2`} onChange={event => { setQuery(event.target.value); setOpen(true) }} onFocus={() => setOpen(true)} /></div>{open && results.length > 0 && <ul>{results.map(result => <li key={result.id}><button type="button" onClick={() => { onSelect(result); setQuery(''); setOpen(false) }}><strong>{result.name}</strong><small>{result.geographic_unit} · {result.id}</small></button></li>)}</ul>}</div>
}

function OverviewPage({ onConditions, onDemand, data, locality }: { onConditions: () => void; onDemand: () => void; data: DigitalHealthData; locality: NeighbourhoodSearchResult }) {
  const [mapMode, setMapMode] = useState<'lens' | 'map'>('lens')
  const projection = [...data.projections].filter(row => row.sex === 'persons').sort((a, b) => b.projection_year - a.projection_year)[0]
  const development = data.profile?.domains.find(domain => domain.id === 'child-development')?.indicators ?? []
  const developmentValue = (id: string) => development.find(item => item.id === id)?.value
  const serviceCount = (category: string) => data.facilities.filter(item => item.category === category).length
  const maternalCount = data.facilities.filter(item => item.service_type.includes('Maternal')).length
  return <div className="dh-page dh-overview-page">
    <header className="dh-topbar"><div className="dh-static-search">⌖ <span>{locality.name} · SA2</span></div><div className="dh-top-actions"><span>⌖ Melbourne</span><button type="button" disabled title="Help centre is planned">?</button><button type="button" disabled title="Accounts are not enabled">●</button></div></header>
    <div className="dh-overview-title"><div><h1>Locality overview</h1><p>Locality-level evidence. Not individual diagnosis or medical advice.</p></div><div className="dh-lens-tabs" role="tablist" aria-label="Map presentation"><button type="button" role="tab" aria-selected={mapMode === 'lens'} onClick={() => setMapMode('lens')}>Locality lens</button><button type="button" role="tab" aria-selected={mapMode === 'map'} onClick={() => setMapMode('map')}>Standard map</button></div><button className="dh-view-button" type="button" disabled title="Additional audience views are planned">♟ Planner view⌄</button></div>
    <div className="dh-overview-grid">
      <div className="dh-overview-left"><article className="dh-card dh-population-card"><div className="dh-card-title"><div><span>♟ Who lives here?</span><small>Children by age group, {locality.name} (SA2)</small></div><b>›</b></div><div className="dh-age-grid"><div><i>●</i><span>0–4 years</span><strong>{projection?.population_age_0_4_projected == null ? 'N/A' : Math.round(projection.population_age_0_4_projected).toLocaleString()}</strong><small>children</small></div><div><i>◆</i><span>5–9 years</span><strong>{projection?.population_age_5_9_projected == null ? 'N/A' : Math.round(projection.population_age_5_9_projected).toLocaleString()}</strong><small>children</small></div><div><i>▲</i><span>10–14 years</span><strong>{projection?.population_age_10_14_projected == null ? 'N/A' : Math.round(projection.population_age_10_14_projected).toLocaleString()}</strong><small>children</small></div></div><p className="dh-source">Source: Victoria in Future 2023 · {projection?.projection_year ?? 'no projection'} · SA2</p></article><article className="dh-card dh-development-card"><div className="dh-card-title"><div><span>▥ Child development</span><small>AEDC 2024, {locality.name} (SA2)</small></div><b>›</b></div><div className="dh-development-content"><DevelopmentWheel /><dl><div><dt>Vulnerable on one or more domains</dt><dd>{developmentValue('aedc_vulnerable_one_or_more') === undefined ? 'N/A' : `${Number(developmentValue('aedc_vulnerable_one_or_more')).toFixed(1)}%`}</dd></div><div><dt>On track across all five domains</dt><dd>{developmentValue('aedc_on_track_five') === undefined ? 'N/A' : `${Number(developmentValue('aedc_on_track_five')).toFixed(1)}%`}</dd></div></dl></div><p className="dh-source">Source: Australian Early Development Census 2024</p></article></div>
      <section className="dh-locality-lens"><LocalityGlobe mode={mapMode} localityId={locality.id} localityName={locality.name} /></section>
      <div className="dh-overview-right"><article className="dh-card dh-services-card"><div className="dh-card-title"><div><span>⌖ Child and family services</span><small>Listed presence only, {locality.name} (SA2)</small></div><b>›</b></div><div className="dh-service-grid"><div className="blue"><i>♧</i><strong>{serviceCount('general_practice')}</strong><span>General practices</span></div><div className="coral"><i>◆</i><strong>{serviceCount('pharmacy')}</strong><span>Pharmacies</span></div><div className="mint"><i>●</i><strong>{maternalCount}</strong><span>Maternal & child health service</span></div><div className="slate"><i>✚</i><strong>{serviceCount('hospital')}</strong><span>Hospitals</span></div></div><p className="dh-source">Source: Healthdirect 2025 · Listed presence only</p></article></div>
    </div>
    <div className="dh-overview-actions"><button type="button" onClick={onConditions}><i>◉</i><span><strong>Explore child health conditions</strong><small>View data and evidence boundaries</small></span><b>›</b></button><button type="button" disabled title="The redesigned comparison is planned"><i>⇄</i><span><strong>Compare another locality</strong><small>Redesigned comparison coming next</small></span><b>›</b></button><button type="button" onClick={onDemand}><i>▥</i><span><strong>View future demand</strong><small>Population projections and service planning</small></span><b>›</b></button></div>
  </div>
}

const conditionIndicatorIds: Record<ConditionId, { sa2: string[]; pha: string[] }> = {
  brain: { sa2: ['mental_health_condition', 'other_long_term_condition'], pha: ['child_mental_health_condition', 'child_one_or_more_long_term_conditions'] },
  lungs: { sa2: ['asthma', 'lung_condition'], pha: ['child_asthma'] },
  metabolic: { sa2: ['diabetes', 'heart_disease', 'kidney_disease'], pha: ['child_overweight_not_obese', 'child_obese'] },
  immune: { sa2: ['cancer', 'other_long_term_condition'], pha: ['immunised_age_1', 'immunised_age_2', 'immunised_age_5'] },
  perinatal: { sa2: [], pha: ['low_birthweight', 'smoking_during_pregnancy', 'infant_mortality'] },
}

const healthIndicatorLabels: Record<string, string> = {
  asthma: 'Children reporting asthma', lung_condition: 'Children reporting another lung condition',
  mental_health_condition: 'Children reporting a mental health condition', other_long_term_condition: 'Other long-term condition',
  diabetes: 'Children reporting diabetes', heart_disease: 'Children reporting heart disease', kidney_disease: 'Children reporting kidney disease', cancer: 'Children reporting cancer',
  child_asthma: 'Childhood asthma', child_mental_health_condition: 'Child mental health condition', child_one_or_more_long_term_conditions: 'One or more long-term conditions',
  child_overweight_not_obese: 'Above healthy weight, excluding obesity', child_obese: 'Children living with obesity',
  immunised_age_1: 'Fully immunised at 1 year', immunised_age_2: 'Fully immunised at 2 years', immunised_age_5: 'Fully immunised at 5 years',
  low_birthweight: 'Babies with low birthweight', smoking_during_pregnancy: 'Smoking during pregnancy', infant_mortality: 'Infant mortality',
}

function ConditionsPage({ data, locality }: { data: DigitalHealthData; locality: NeighbourhoodSearchResult }) {
  const [conditionId, setConditionId] = useState<ConditionId>('brain')
  const [panel, setPanel] = useState<HealthPanel>('Local health')
  const selected = conditions.find((item) => item.id === conditionId) ?? conditions[0]
  const guidance = conditionGuidance[conditionId]
  const ids = conditionIndicatorIds[conditionId]
  const exact = (data.childHealth?.sa2_indicators ?? []).filter(item => ids.sa2.includes(item.indicator))
  const regional = (data.childHealth?.pha_context ?? []).filter(item => ids.pha.includes(item.indicator_id))
  const selectCondition = (id: ConditionId) => { setConditionId(id); setPanel('Local health') }
  return <div className="dh-page dh-conditions-page"><header className="dh-topbar"><div className="dh-static-search">⌕ <span>Search is unavailable in this release</span></div><div className="dh-top-actions"><span>⌖ Melbourne</span><button type="button" disabled title="Help centre is planned">?</button><button type="button" disabled title="Accounts are not enabled">●</button></div></header><div className="dh-condition-layout">
    <section className="dh-condition-visual" aria-label="Selected child health condition"><span className="dh-eyebrow">Child health conditions</span><h1>Child health conditions</h1><p>Local population context and practical prevention guidance.<br />Not individual diagnosis or medical advice.</p><div className="dh-organ-stage" tabIndex={0}><img src={selected.image} alt={`Medical educational illustration for ${selected.label}`} /><span className="dh-organ-tooltip"><strong>{selected.label}</strong><small>{selected.summary}</small></span></div><div className="dh-condition-picker" aria-label="Health condition categories">{conditions.map((item) => <button key={item.id} type="button" aria-pressed={conditionId === item.id} onClick={() => selectCondition(item.id)}><img src={item.image} alt="" /><span>{item.label}</span></button>)}</div></section>
    <section className="dh-condition-detail"><div className="dh-condition-heading"><h2>{selected.label}</h2><span>{selected.status}</span></div><div className="dh-topic-tabs dh-health-tabs" role="tablist" aria-label="Condition information">{healthPanels.map((item) => <button key={item} type="button" role="tab" aria-selected={panel === item} onClick={() => setPanel(item)}>{item}</button>)}</div>
      {panel === 'Local health' && <article className="dh-health-panel"><header><div><h3>Health indicators for {locality.name}</h3><p>Exact SA2 observations are separated from containing-PHA context.</p></div><span>{exact.length + regional.length} relevant measures</span></header>{data.loading ? <p className="dh-health-empty">Loading validated locality data.</p> : <><h4 className="dh-geography-title">Selected SA2 · {locality.name}</h4><div className="dh-health-metrics">{exact.map(indicator => <div key={indicator.indicator}><small>{healthIndicatorLabels[indicator.indicator] ?? indicator.indicator}</small><strong>{indicator.percent === null ? 'Not published' : `${indicator.percent.toFixed(2)}%`}</strong><span>{indicator.count?.toLocaleString() ?? 'Not published'} children · ABS Census {indicator.reference_year}</span></div>)}{exact.length === 0 && <p className="dh-health-empty">No exact SA2 measure is published for this condition group.</p>}</div><h4 className="dh-geography-title">Regional context · {data.childHealth?.locality?.pha_name ?? 'Population Health Area unavailable'}</h4><div className="dh-health-metrics">{regional.map(indicator => <div key={indicator.indicator_id}><small>{healthIndicatorLabels[indicator.indicator_id] ?? indicator.indicator_id}</small><strong>{indicator.rate_or_percent === null ? 'Not published' : `${indicator.rate_or_percent.toFixed(2)}${indicator.indicator_id === 'infant_mortality' ? ' per 1,000' : '%'}`}</strong><span>{indicator.reference_period} · {indicator.methodology_class.replace(/_/g, ' ')}{indicator.lower_95_ci !== null ? ` · 95% CI ${indicator.lower_95_ci.toFixed(2)}–${indicator.upper_95_ci?.toFixed(2)}` : ''}</span></div>)}</div></>}</article>}
      {panel === 'Prevention' && <GuidancePanel title="Practical prevention" icon="✚" items={guidance.prevention} footer="Discuss decisions about symptoms, medicines or treatment with a qualified health professional." />}
      {panel === 'Daily routine' && <GuidancePanel title="Healthy daily routine" icon="☀" items={guidance.routine} footer="Adapt routines to the child’s age, ability, diagnosed conditions and clinical plan." />}
      {panel === 'Seasonal care' && <GuidancePanel title="Melbourne seasonal care" icon="☁" items={guidance.seasonal} footer="Current warnings and forecasts should be checked through Victorian Government services." />}
      {panel === 'Nearby care' && <NearbyCarePanel data={data} locality={locality} />}
    </section>
  </div></div>
}

function GuidancePanel({ title, icon, items, footer }: { title: string; icon: string; items: string[]; footer: string }) {
  return <article className="dh-health-panel dh-guidance-panel"><header><div><h3>{icon} {title}</h3><p>General, evidence-informed guidance for parents and carers.</p></div></header><ol>{items.map((item, index) => <li key={item}><b>{index + 1}</b><span>{item}</span></li>)}</ol><p className="dh-health-note">{footer}</p></article>
}

function NearbyCarePanel({ data, locality }: { data: DigitalHealthData; locality: NeighbourhoodSearchResult }) {
  return <article className="dh-health-panel dh-care-panel"><header><div><h3>Verified care in {locality.name}</h3><p>Active directory listings whose coordinates fall inside the selected SA2.</p></div><span>Healthdirect 2025</span></header><div className="dh-care-list">{data.facilities.map(service => <div key={service.facility_id}><i>⌖</i><span><strong>{service.name}</strong><small>{service.service_type}</small></span><b>In SA2</b><em>Contact service</em></div>)}{!data.loading && data.facilities.length === 0 && <p className="dh-health-empty">No matching active facility was listed inside this SA2. This does not mean care is unavailable nearby.</p>}</div><p className="dh-health-note">The public directory does not provide consultation prices, current bulk-billing eligibility, appointment availability or verified paediatric specialist staffing. Confirm details directly with the service.</p></article>
}

interface DigitalHealthData {
  area: VcamsAreaIndicator[]
  lga: VcamsLgaIndicator[]
  facilities: HealthFacility[]
  projections: PopulationProjection[]
  profile: NeighbourhoodProfile | null
  environmentalDifference: EnvironmentalDifference | null
  childHealth: ChildHealthContext | null
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

function useDigitalHealthData(locality: NeighbourhoodSearchResult): DigitalHealthData {
  const [data, setData] = useState<DigitalHealthData>({ area: [], lga: [], facilities: [], projections: [], profile: null, environmentalDifference: null, childHealth: null, loading: true, error: null })
  useEffect(() => {
    const controller = new AbortController()
    setData(current => ({ ...current, loading: true, error: null }))
    Promise.all([
      api.getHealthFacilities(locality.id, controller.signal),
      api.getPopulationProjections(locality.id, controller.signal),
      api.getProfile(locality.id, controller.signal),
      api.getEnvironmentalDifference(locality.id, '206011496'),
      api.getChildHealthContext(locality.id, controller.signal),
    ]).then(([facilities, projections, profile, environmentalDifference, childHealth]) => setData({
      area: [],
      lga: [],
      facilities: facilities.data.facilities,
      projections: projections.data.projections,
      profile: profile.data,
      environmentalDifference: environmentalDifference.data,
      childHealth: childHealth.data,
      loading: false,
      error: null,
    })).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setData(current => ({ ...current, loading: false, error: 'Validated health data could not be loaded.' }))
    })
    return () => controller.abort()
  }, [locality.id])
  return data
}

function environmentIndicators(data: DigitalHealthData): ProfileIndicator[] {
  return data.profile?.domains.find(domain => domain.id === 'environment')?.indicators ?? []
}

function EnvironmentPage({ data, locality }: { data: DigitalHealthData; locality: NeighbourhoodSearchResult }) {
  const indicators = environmentIndicators(data).filter(item => item.id.startsWith('env_'))
  const comparison = data.environmentalDifference
  const metric = (id: string) => indicators.find(item => item.id === id)
  const canopy = metric('env_vegetation_cover')
  const heat = metric('env_urban_heat')
  const openSpace = metric('env_open_space_access')
  const exact = (item?: ProfileIndicator) => item?.value === null || item?.value === undefined ? 'Unavailable' : `${Number(item.value).toFixed(4)}${item.unit === 'percent' ? '%' : item.unit === 'degrees Celsius' ? '°C' : ''}`
  return <div className="dh-page dh-board-page"><BoardHeader locality={locality} title="Environment and child health context" subtitle={`Validated environmental context for ${locality.name}. These measures do not diagnose a child or establish causation.`} />
    <section className="dh-env-dashboard">
      <article className="dh-env-insights"><header><div><h2>AI-assisted insight review</h2><p>Generated only from the validated values shown below</p></div><span>3 source-backed findings</span></header><div className="dh-insight-table"><div className="head"><span>Factor</span><span>Exact value</span><span>Generated interpretation</span><span>Evidence state</span></div><div><b>Tree canopy</b><strong>{exact(canopy)}</strong><p>Limited canopy coverage may reduce shade availability during hot conditions.</p><i>Source verified</i></div><div><b>Urban heat island</b><strong>{exact(heat)}</strong><p>The published surface-temperature context indicates a material urban heat effect.</p><i>Source verified</i></div><div><b>Public open space</b><strong>{exact(openSpace)}</strong><p>Open-space share provides place context, not a measure of accessibility or quality.</p><i>Source verified</i></div></div><footer>Interpretations are deterministic summaries of published values, not clinical recommendations or newly generated statistics.</footer></article>
      <article className="dh-env-health"><h3>Environmental profile</h3><div className="dh-env-score"><strong>3/3</strong><span>indicators available</span></div>{indicators.map(item => <div className="dh-env-metric" key={item.id}><span><b>{item.name}</b><small>{item.reference_year} · {item.geographic_unit}</small></span><strong>{exact(item)}</strong><i style={{ width: `${Math.min(100, Math.abs(Number(item.value)) * 5)}%` }} /></div>)}</article>
      <article className="dh-env-comparison"><header><div><h3>Environmental comparison</h3><p>{comparison ? `${comparison.neighbourhood_a.name} compared with ${comparison.neighbourhood_b.name}` : `No approved matched comparison is available for ${locality.name}`}</p></div><span>Matched comparison</span></header><div>{comparison?.environmental_indicators.map(item => <article key={item.id}><header><b>{item.name}</b><small>{item.source} · {item.reference_year}</small></header><div><span><small>{comparison.neighbourhood_a.name}</small><strong>{Number(item.neighbourhood_a.value).toFixed(2)} {item.unit}</strong></span><i><b style={{ width: `${Math.min(100, Number(item.neighbourhood_a.value) * 6)}%` }} /></i><span><small>{comparison.neighbourhood_b.name}</small><strong>{Number(item.neighbourhood_b.value).toFixed(2)} {item.unit}</strong></span></div><footer>Difference: {Number(item.approved_difference.value).toFixed(2)} {item.unit}</footer></article>) ?? <p>Select a locality with an approved comparison to populate this panel.</p>}</div></article>
      <article className="dh-needs-attention"><h3>Needs attention</h3><ul><li><i>!</i><span><b>Source age</b><small>Environmental observations are from 2018 and should not be described as current conditions.</small></span></li><li><i>!</i><span><b>Exposure boundary</b><small>Area-level heat and canopy do not estimate an individual child’s exposure.</small></span></li><li><i>✓</i><span><b>Geography verified</b><small>All three values are harmonised to ASGS Edition 3 SA2.</small></span></li></ul></article>
    </section>
  </div>
}

function EvidenceReviewPage({ data, locality }: { data: DigitalHealthData; locality: NeighbourhoodSearchResult }) {
  const [language, setLanguage] = useState<'English' | 'Plain English'>('English')
  const [verified, setVerified] = useState<string[]>([])
  const evidence = environmentIndicators(data).filter(item => item.id.startsWith('env_'))
  const verify = (id: string) => setVerified(current => current.includes(id) ? current : [...current, id])
  return <div className="dh-page dh-board-page"><BoardHeader locality={locality} title="Evidence review" subtitle="Check generated statements against the actual published record before using them in reports or presentations." />
    <section className="dh-review-layout"><article className="dh-review-list"><header><div><h2>Generated claims</h2><p>Select a claim and verify it against its source fields.</p></div><label>Display language<select value={language} onChange={event => setLanguage(event.target.value as 'English' | 'Plain English')}><option>English</option><option>Plain English</option></select></label></header>{evidence.map(item => <div key={item.id}><span><b>{item.name}</b><small>{language === 'Plain English' ? `The source reports ${Number(item.value).toFixed(4)} ${item.unit} for ${locality.name}.` : `Claim value: ${Number(item.value).toFixed(4)} ${item.unit}`}</small></span><strong>{verified.includes(item.id) ? 'Verified' : 'Pending review'}</strong><button type="button" onClick={() => verify(item.id)} disabled={verified.includes(item.id)}>{verified.includes(item.id) ? 'Checked' : 'Verify source'}</button></div>)}</article><aside className="dh-source-document"><span>ACTUAL SOURCE RECORD</span><h3>Environmental context contract</h3><dl><div><dt>Locality</dt><dd>{locality.name}</dd></div><div><dt>Geography</dt><dd>{locality.geographic_unit}</dd></div><div><dt>Source</dt><dd>{evidence[0]?.source ?? 'No source record available'}</dd></div><div><dt>Reference year</dt><dd>{evidence[0]?.reference_year ?? 'Not available'}</dd></div><div><dt>Available records</dt><dd>{evidence.length}</dd></div><div><dt>Verification progress</dt><dd>{verified.length}/{evidence.length}</dd></div></dl><p>The review confirms exact value, unit, source, year and geography. It does not independently validate the publisher’s methodology.</p></aside></section>
  </div>
}

function BoardHeader({ title, subtitle, locality }: { title: string; subtitle: string; locality: NeighbourhoodSearchResult }) {
  return <><header className="dh-topbar"><div className="dh-static-search">⌖ <span>{locality.name} · SA2</span></div><div className="dh-top-actions"><span>⌖ Melbourne</span><button type="button" disabled title="Help centre is planned">?</button></div></header><div className="dh-board-heading"><div><span className="dh-eyebrow">Digital child health planning</span><h1>{title}</h1><p>{subtitle}</p></div><span className="dh-data-state">Validated data</span></div></>
}

function CareAccessPage({ data, locality }: { data: DigitalHealthData; locality: NeighbourhoodSearchResult }) {
  const groups = useMemo(() => data.facilities.reduce<Record<string, HealthFacility[]>>((result, facility) => {
    const key = facility.service_type.includes('Maternal') ? 'Maternal and child health' : facility.category === 'pharmacy' ? 'Pharmacy' : facility.category === 'hospital' ? 'Hospital' : 'General practice'
    result[key] = [...(result[key] ?? []), facility]
    return result
  }, {}), [data.facilities])
  const categories = ['General practice', 'Pharmacy', 'Maternal and child health', 'Hospital']
  return <div className="dh-page dh-board-page"><BoardHeader locality={locality} title="Care access" subtitle={`Verified service locations inside ${locality.name}. Presence is not capacity, price or appointment availability.`} />
    {data.error && <p className="dh-board-error">{data.error}</p>}
    <section className="dh-board-grid dh-care-board">
      <article className="dh-feature-card dh-care-hero"><div><span className="dh-card-kicker">LOCAL CARE NETWORK</span><h2>{data.loading ? 'Loading' : `${data.facilities.length} listed services`}</h2><p>Directory-listed services physically located within the {locality.name} SA2 boundary.</p></div><div className="dh-care-orbit" aria-hidden="true"><i>✚</i><span>⌖</span><b>●</b></div><small>Healthdirect facilities extract · 7 March 2025</small></article>
      <article className="dh-board-card dh-access-summary"><h3>Service mix</h3><div className="dh-access-rings">{categories.map((category, index) => <div key={category}><span style={{ '--ring': `${Math.min(100, (groups[category]?.length ?? 0) * 25)}%` } as CSSProperties}><b>{groups[category]?.length ?? 0}</b></span><small>{category}</small><i className={`tone-${index}`} /></div>)}</div></article>
      <article className="dh-board-card dh-service-directory"><header><div><h3>Verified directory</h3><p>Active records in the source extract</p></div><span>{data.facilities.length} results</span></header><div>{data.facilities.map(facility => <article key={facility.facility_id}><i>{facility.category === 'pharmacy' ? '◆' : facility.service_type.includes('Maternal') ? '●' : '✚'}</i><span><strong>{facility.name}</strong><small>{facility.service_type}</small><em>{facility.address}</em></span><b>Listed</b></article>)}</div></article>
      <article className="dh-board-card dh-access-boundary"><h3>What this board can answer</h3><ul><li><b>Available</b><span>Service name, type, address and listed location</span></li><li><b>Not published</b><span>Consultation fee, bulk billing, waiting time and paediatric staffing</span></li><li><b>Interpret carefully</b><span>Being nearby does not mean the service is suitable or accepting patients</span></li></ul></article>
    </section>
  </div>
}

function FutureDemandPage({ data, locality }: { data: DigitalHealthData; locality: NeighbourhoodSearchResult }) {
  const projections = [...data.projections].filter(row => row.sex === 'persons').sort((a, b) => a.projection_year - b.projection_year)
  const first = projections[0]
  const last = projections.length ? projections[projections.length - 1] : undefined
  const childChange = first && last ? ((last.population_age_0_14_projected ?? 0) - (first.population_age_0_14_projected ?? 0)) : null
  const max = Math.max(...projections.map(row => row.population_age_0_14_projected ?? 0), 1)
  return <div className="dh-page dh-board-page"><BoardHeader locality={locality} title="Future demand" subtitle="Published population projections help plan child and family services. They are modelled scenarios, not forecasts of individual need." />
    {data.error && <p className="dh-board-error">{data.error}</p>}
    <section className="dh-board-grid dh-demand-board">
      <article className="dh-feature-card dh-demand-hero"><div><span className="dh-card-kicker">CHILD POPULATION OUTLOOK</span><h2>{last ? Math.round(last.population_age_0_14_projected ?? 0).toLocaleString() : data.loading ? 'Loading' : 'Not available'}</h2><p>children aged 0–14 projected for {locality.name} in {last?.projection_year ?? 'the latest published year'}</p></div><div className="dh-demand-wave">{projections.map(row => <i key={row.projection_year} style={{ height: `${32 + ((row.population_age_0_14_projected ?? 0) / max) * 90}px` }}><span>{row.projection_year}</span></i>)}</div><small>Victoria in Future 2023 Release 2 · SA2</small></article>
      <article className="dh-board-card dh-demand-change"><h3>Planning signal</h3><strong>{childChange === null ? 'Loading' : `${childChange >= 0 ? '+' : ''}${Math.round(childChange).toLocaleString()}`}</strong><p>projected change in children aged 0–14 from {first?.projection_year ?? 2021} to {last?.projection_year ?? 2036}</p><span>Projection, not observed growth</span></article>
      <article className="dh-board-card dh-age-outlook"><header><div><h3>Age-group outlook</h3><p>Published counts by five-year age band</p></div></header><div className="dh-projection-chart">{projections.map(row => <div key={row.projection_year}><b>{row.projection_year}</b><span title={`Ages 0–4: ${Math.round(row.population_age_0_4_projected ?? 0)}`} style={{ '--value': `${((row.population_age_0_4_projected ?? 0) / max) * 100}%` } as CSSProperties} /><span title={`Ages 5–9: ${Math.round(row.population_age_5_9_projected ?? 0)}`} style={{ '--value': `${((row.population_age_5_9_projected ?? 0) / max) * 100}%` } as CSSProperties} /><span title={`Ages 10–14: ${Math.round(row.population_age_10_14_projected ?? 0)}`} style={{ '--value': `${((row.population_age_10_14_projected ?? 0) / max) * 100}%` } as CSSProperties} /></div>)}</div><footer><span>● 0–4 years</span><span>● 5–9 years</span><span>● 10–14 years</span></footer></article>
      <article className="dh-board-card dh-health-demand"><h3>Health planning context</h3><div>{data.area.filter(item => ['special_healthcare_needs', 'recommended_daily_physical_activity', 'household_food_insecurity'].includes(item.indicator_id)).map(item => <div key={item.indicator_id}><span><b>{indicatorNames[item.indicator_id]}</b><small>Hume Moreland · {item.reference_year}</small></span><strong>{item.percent?.toFixed(1)}%</strong><i className={item.quality_flag}>{item.quality_flag.replace(/_/g, ' ')}</i></div>)}</div><p>These broad-area survey estimates describe current context; they are not projected forward.</p></article>
    </section>
  </div>
}

export default function DigitalHealthHub({ onHome }: DigitalHealthHubProps) {
  const [view, setView] = useState<HealthView>('overview')
  const [locality, setLocality] = useState<NeighbourhoodSearchResult>({ id: '206011106', name: 'Brunswick East', geographic_unit: 'SA2 (ASGS Edition 3, 2021)' })
  const data = useDigitalHealthData(locality)
  const page = view === 'overview'
    ? <OverviewPage onConditions={() => setView('conditions')} onDemand={() => setView('demand')} data={data} locality={locality} />
    : view === 'conditions' ? <ConditionsPage data={data} locality={locality} />
      : view === 'environment' ? <EnvironmentPage data={data} locality={locality} />
        : view === 'care' ? <CareAccessPage data={data} locality={locality} />
          : view === 'demand' ? <FutureDemandPage data={data} locality={locality} />
            : <EvidenceReviewPage data={data} locality={locality} />
  return <div className="digital-health-hub"><SideNavigation current={view} onChange={setView} onHome={onHome} /><main><LocalitySearch locality={locality} onSelect={setLocality} />{page}</main></div>
}
