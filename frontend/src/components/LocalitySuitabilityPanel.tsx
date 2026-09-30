interface LocalitySuitabilityPanelProps {
  criteria: string[]
  onToggle: (criterion: string) => void
  localities: Array<{
    id: string
    name: string
    geographic_unit: string
    score: number | null
    status: string
    criteria: string[]
    measures: Record<string, number | null>
    criterion_scores: Record<string, number | null>
  }>
  loading: boolean
  error: string | null
  notice: string | null
  onApplyPattern: (criteria: string[]) => void
  onSelectLocality: (id: string, name: string) => void
}

type SuitabilityOption = {
  id: string
  label: string
  description: string
  source: string
  available: boolean
}

const measureFormats: Record<string, { short: string; unit: string; digits?: number }> = {
  development_on_track: { short: 'All 5 AEDC', unit: '%' },
  lower_developmental_vulnerability: { short: 'AEDC vulnerable', unit: '%' },
  physical_health_on_track: { short: 'Physical', unit: '%' },
  social_competence_on_track: { short: 'Social', unit: '%' },
  emotional_maturity_on_track: { short: 'Emotional', unit: '%' },
  language_cognitive_on_track: { short: 'Language', unit: '%' },
  communication_knowledge_on_track: { short: 'Communication', unit: '%' },
  tree_canopy: { short: 'Vegetation', unit: '%' },
  public_open_space: { short: 'Open space', unit: '%' },
  lower_urban_heat: { short: 'Heat island', unit: '°C', digits: 1 },
  socioeconomic_resources: { short: 'IRSD', unit: '/10', digits: 0 },
  general_practice_access: { short: 'GPs', unit: '/10k', digits: 2 },
  hospital_access: { short: 'Hospitals', unit: '/10k', digits: 2 },
  pharmacy_access: { short: 'Pharmacies', unit: '/10k', digits: 2 },
  lower_industrial_emission_source_presence: { short: 'NPI facilities', unit: '', digits: 0 },
  lower_declared_road_traffic: { short: 'Traffic intensity', unit: '', digits: 0 },
  public_transport_availability: { short: 'Transit stops', unit: '/10k', digits: 1 },
  lower_bushfire_prone_share: { short: 'Bushfire-prone land', unit: '%', digits: 1 },
  approved_early_childhood_places: { short: 'Approved places', unit: '/1k children', digits: 1 },
  long_day_care_availability: { short: 'Long day care', unit: '/1k children', digits: 1 },
  kindergarten_availability: { short: 'Kindergarten', unit: '/1k children', digits: 1 },
  primary_school_campus_availability: { short: 'Primary campuses', unit: '/1k children', digits: 1 },
}

function formatMeasure(criterion: string, value: number | null | undefined) {
  if (value === null || value === undefined) return null
  const format = measureFormats[criterion]
  if (!format) return null
  return `${format.short}: ${value.toFixed(format.digits ?? 1)}${format.unit}`
}

const optionGroups: Array<{ title: string; summary: string; options: SuitabilityOption[] }> = [
  {
    title: 'Child development: available measures',
    summary: 'AEDC population results for children in their first year of full-time school.',
    options: [
      { id: 'development_on_track', label: 'Children on track across all five AEDC domains (%)', description: 'Percentage of assessed children on track in physical, social, emotional, language/cognitive and communication/general-knowledge domains.', source: 'AEDC SA2, 2024', available: true },
      { id: 'lower_developmental_vulnerability', label: 'Children vulnerable on one or more AEDC domains (%)', description: 'Percentage of assessed children classified as developmentally vulnerable on at least one domain. Ranking favours a smaller percentage.', source: 'AEDC SA2, 2024', available: true },
    ],
  },
  {
    title: 'Five AEDC development domains',
    summary: 'Each domain uses its own 2024 SA2 on-track percentage from the official AEDC workbook.',
    options: [
      { id: 'physical_health_on_track', label: 'Physical health and wellbeing: on track (%)', description: 'Percentage on track for school-day readiness, independence and gross and fine motor skills.', source: 'AEDC SA2, 2024', available: true },
      { id: 'social_competence_on_track', label: 'Social competence: on track (%)', description: 'Percentage on track for social competence, responsibility, learning approaches and readiness to explore.', source: 'AEDC SA2, 2024', available: true },
      { id: 'emotional_maturity_on_track', label: 'Emotional maturity: on track (%)', description: 'Percentage on track for prosocial behaviour and emotional/behavioural regulation.', source: 'AEDC SA2, 2024', available: true },
      { id: 'language_cognitive_on_track', label: 'Language and cognitive skills: on track (%)', description: 'Percentage on track for literacy, numeracy, memory and interest in learning.', source: 'AEDC SA2, 2024', available: true },
      { id: 'communication_knowledge_on_track', label: 'Communication and general knowledge: on track (%)', description: 'Percentage on track for communication, storytelling, articulation and age-appropriate general knowledge.', source: 'AEDC SA2, 2024', available: true },
    ],
  },
  {
    title: 'Child health outcomes: respiratory, immune and chronic',
    summary: 'Each condition needs a validated, geographically compatible outcome dataset before ranking.',
    options: [
      { id: 'asthma', label: 'Asthma', description: 'Prevalence, emergency presentations or hospital admissions among children.', source: 'No approved SA2 outcome data', available: false },
      { id: 'respiratory_illness', label: 'Other respiratory illness', description: 'Bronchiolitis, pneumonia, chronic lung disease and recurrent respiratory presentations.', source: 'No approved SA2 outcome data', available: false },
      { id: 'allergy_immunology', label: 'Allergy and immune conditions', description: 'Food allergy, anaphylaxis, eczema and immune-system conditions.', source: 'No approved SA2 outcome data', available: false },
      { id: 'diabetes_endocrine', label: 'Diabetes and endocrine conditions', description: 'Type 1 diabetes, thyroid, growth, puberty and other hormone-related conditions.', source: 'No approved SA2 outcome data', available: false },
      { id: 'obesity_nutrition', label: 'Healthy weight and nutrition outcomes', description: 'Validated child overweight, obesity, undernutrition or nutritional-deficiency measures.', source: 'No approved SA2 outcome data', available: false },
    ],
  },
  {
    title: 'Child health outcomes: organ systems and serious illness',
    summary: 'Clinical outcomes cannot be inferred from environment, disadvantage or nearby facilities.',
    options: [
      { id: 'cardiac', label: 'Heart and circulation conditions', description: 'Congenital and acquired cardiac conditions and related hospital care.', source: 'No approved SA2 outcome data', available: false },
      { id: 'neurological', label: 'Neurological conditions', description: 'Epilepsy, neuromuscular conditions, acquired brain injury and other neurological disorders.', source: 'No approved SA2 outcome data', available: false },
      { id: 'gastro_liver', label: 'Digestive and liver conditions', description: 'Gastrointestinal, inflammatory bowel, coeliac and liver conditions.', source: 'No approved SA2 outcome data', available: false },
      { id: 'kidney_urology', label: 'Kidney and urinary conditions', description: 'Renal disease, urinary-tract and bladder conditions.', source: 'No approved SA2 outcome data', available: false },
      { id: 'cancer_blood', label: 'Cancer and blood disorders', description: 'Childhood cancers, anaemia, bleeding disorders and other haematological conditions.', source: 'No approved SA2 outcome data', available: false },
      { id: 'musculoskeletal', label: 'Bone, joint and mobility conditions', description: 'Orthopaedic, rheumatological and mobility-related child-health outcomes.', source: 'No approved SA2 outcome data', available: false },
    ],
  },
  {
    title: 'Child health outcomes: senses, development and wellbeing',
    summary: 'These are distinct outcomes and must not be collapsed into a generic “child health” score.',
    options: [
      { id: 'vision', label: 'Vision and eye health', description: 'Vision impairment, screening results and diagnosed ophthalmic conditions.', source: 'No approved SA2 outcome data', available: false },
      { id: 'hearing', label: 'Hearing and ear health', description: 'Hearing loss, audiology outcomes and recurrent ear disease.', source: 'No approved SA2 outcome data', available: false },
      { id: 'oral_health', label: 'Dental and oral health', description: 'Dental caries, preventable admissions and other child oral-health outcomes.', source: 'No approved SA2 outcome data', available: false },
      { id: 'mental_health', label: 'Mental health and emotional wellbeing', description: 'Validated anxiety, depression, distress or mental-health service outcome measures.', source: 'No approved SA2 outcome data', available: false },
      { id: 'neurodevelopmental', label: 'Neurodevelopmental conditions', description: 'Autism, ADHD, intellectual disability and related developmental diagnoses.', source: 'No approved SA2 outcome data', available: false },
      { id: 'infectious_disease', label: 'Infectious disease', description: 'Validated childhood infection, notification or hospital-presentation measures.', source: 'No approved SA2 outcome data', available: false },
    ],
  },
  {
    title: 'Environment',
    summary: 'Measured characteristics of the physical environment. These are not inferred health effects.',
    options: [
      { id: 'tree_canopy', label: 'Tree and vegetation cover (%)', description: 'Area-weighted vegetation-cover percentage aggregated from Victorian mesh-block environmental data.', source: 'Cooling and Greening Melbourne, 2018', available: true },
      { id: 'public_open_space', label: 'Public open-space land share (%)', description: 'Area-weighted percentage classified as public open space in the environmental source.', source: 'Cooling and Greening Melbourne, 2018', available: true },
      { id: 'lower_urban_heat', label: 'Urban heat-island intensity (°C)', description: 'Area-weighted urban heat-island intensity. Ranking favours a smaller temperature difference.', source: 'Cooling and Greening Melbourne, 2018', available: true },
      { id: 'pm25', label: 'Fine-particle pollution (PM2.5)', description: 'Monitoring-station readings cannot be assigned to every SA2 without a validated exposure model.', source: 'Locality exposure unavailable', available: false },
      { id: 'pm10', label: 'Particle pollution (PM10)', description: 'Requires a defensible locality-level exposure surface rather than nearest-monitor assignment.', source: 'Locality exposure unavailable', available: false },
      { id: 'no2', label: 'Traffic-related nitrogen dioxide (NO₂)', description: 'Requires validated locality-level modelling or adequate monitoring coverage.', source: 'Locality exposure unavailable', available: false },
      { id: 'ozone', label: 'Ground-level ozone', description: 'Station observations alone do not support an SA2 suitability ranking.', source: 'Locality exposure unavailable', available: false },
      { id: 'noise', label: 'Transport noise exposure', description: 'No approved, comparable SA2 noise-exposure surface is integrated.', source: 'Data unavailable', available: false },
      { id: 'lower_bushfire_prone_share', label: 'Land designated bushfire-prone (%)', description: 'Percentage of locality land inside Victoria’s designated Bushfire Prone Area. Ranking favours a smaller share; this is not a property BAL or forecast.', source: 'Victorian BPA, gazetted June 2026', available: true },
      { id: 'flood_exposure', label: 'Lower flood exposure', description: 'A comparable current flood-hazard layer and validated locality scoring method are not yet integrated.', source: 'Locality exposure unavailable', available: false },
      { id: 'lower_industrial_emission_source_presence', label: 'NPI air-emission reporting facilities (count)', description: 'Count located inside the locality for selected reported air pollutants. Ranking favours fewer facilities; count is not ambient concentration or health risk.', source: 'National Pollutant Inventory, 2024–25', available: true },
      { id: 'lower_declared_road_traffic', label: 'Declared-road traffic intensity (AADT-road-km/km²)', description: '2019 annual-average daily traffic multiplied by covered declared-road length per locality area. Ranking favours a smaller value; this is not noise or air exposure.', source: 'Victorian DTP AADT, 2019', available: true },
    ],
  },
  {
    title: 'Approved early-childhood education and care',
    summary: 'ACECQA-listed supply is population-adjusted. It does not indicate vacancies, affordability, attendance, workforce or service quality.',
    options: [
      { id: 'approved_early_childhood_places', label: 'Approved places per 1,000 projected children aged 0–4', description: 'Approved places at active, deterministically geocoded ACECQA services divided by VIF-projected resident children aged 0–4.', source: 'ACECQA + G-NAF + VIF 2026', available: true },
      { id: 'long_day_care_availability', label: 'Long day care services per 1,000 projected children aged 0–4', description: 'Active geocoded services offering long day care divided by VIF-projected resident children aged 0–4.', source: 'ACECQA + G-NAF + VIF 2026', available: true },
      { id: 'kindergarten_availability', label: 'Preschool/kindergarten services per 1,000 projected children aged 0–4', description: 'Active geocoded school-based or standalone preschool/kindergarten services divided by VIF-projected resident children aged 0–4.', source: 'ACECQA + G-NAF + VIF 2026', available: true },
    ],
  },
  {
    title: 'School infrastructure',
    summary: 'Campus counts are normalised using the matching published VIF child-age band; they do not represent capacity or school quality.',
    options: [
      { id: 'primary_school_campus_availability', label: 'Primary-school campuses per 1,000 projected children aged 5–9', description: 'Open primary and combined primary/secondary campuses located inside the locality, divided by VIF-projected resident children aged 5–9.', source: 'Victorian School Locations 2025 + VIF 2026', available: true },
    ],
  },
  {
    title: 'Primary, early-years and urgent healthcare access',
    summary: 'Presence is not the same as capacity, waiting time, eligibility, affordability or quality.',
    options: [
      { id: 'general_paediatrics', label: 'General paediatricians', description: 'Local or hospital doctors providing specialist care for babies, children and adolescents.', source: 'Service directory not integrated', available: false },
      { id: 'general_practice_access', label: 'Listed general practices per 10,000 residents', description: 'Active HealthDirect-listed practices located inside the locality divided by resident population. It does not measure bulk billing, capacity or opening hours.', source: 'HealthDirect facilities, 2025', available: true },
      { id: 'pharmacy_access', label: 'Listed pharmacies per 10,000 residents', description: 'Active HealthDirect-listed pharmacies located inside the locality divided by resident population. It does not measure stock, hours or service quality.', source: 'HealthDirect facilities, 2025', available: true },
      { id: 'mch', label: 'Maternal and Child Health services', description: 'Universal and enhanced MCH centres supporting families from birth to school age.', source: 'Service locations not integrated', available: false },
      { id: 'early_parenting', label: 'Early Parenting Centres', description: 'Specialist support for sleep, settling, feeding and parenting for families with young children.', source: 'Service locations not integrated', available: false },
      { id: 'urgent_emergency', label: 'Paediatric urgent and emergency care', description: 'Child-capable urgent care, emergency departments and travel-time access.', source: 'Access model not integrated', available: false },
      { id: 'hospital_access', label: 'Listed hospitals per 10,000 residents', description: 'Active HealthDirect-listed hospitals located inside the locality divided by resident population. It does not identify paediatric capability, capacity or travel time.', source: 'HealthDirect facilities, 2025', available: true },
    ],
  },
  {
    title: 'Paediatric medical specialists',
    summary: 'Each specialty needs verified child-specific locations plus access and capacity information.',
    options: [
      { id: 'developmental_paediatrics', label: 'Developmental and behavioural paediatrics', description: 'Assessment and care for developmental, learning, attention and behavioural concerns.', source: 'Service data unavailable', available: false },
      { id: 'respiratory_clinic', label: 'Respiratory and sleep medicine', description: 'Asthma, chronic lung disease, breathing and paediatric sleep services.', source: 'Service data unavailable', available: false },
      { id: 'cardiology_clinic', label: 'Cardiology', description: 'Congenital and acquired heart-condition assessment and treatment.', source: 'Service data unavailable', available: false },
      { id: 'neurology_clinic', label: 'Neurology and epilepsy', description: 'Brain, nerve, neuromuscular and seizure-related specialist care.', source: 'Service data unavailable', available: false },
      { id: 'gastro_clinic', label: 'Gastroenterology and hepatology', description: 'Digestive-system, nutrition and liver specialist care.', source: 'Service data unavailable', available: false },
      { id: 'endocrine_clinic', label: 'Endocrinology and diabetes', description: 'Diabetes, growth, thyroid, puberty and hormone-related care.', source: 'Service data unavailable', available: false },
      { id: 'renal_clinic', label: 'Nephrology and urology', description: 'Kidney, bladder and urinary-system specialist care.', source: 'Service data unavailable', available: false },
      { id: 'allergy_clinic', label: 'Allergy and immunology', description: 'Food allergy, anaphylaxis, immune conditions and related testing.', source: 'Service data unavailable', available: false },
      { id: 'oncology_clinic', label: 'Oncology and haematology', description: 'Cancer and blood-disorder diagnosis and treatment.', source: 'Service data unavailable', available: false },
      { id: 'infectious_clinic', label: 'Infectious diseases', description: 'Specialist assessment and treatment of complex childhood infections.', source: 'Service data unavailable', available: false },
      { id: 'adolescent_medicine', label: 'Adolescent medicine', description: 'Developmentally appropriate care for complex physical and psychosocial needs in adolescence.', source: 'Service data unavailable', available: false },
    ],
  },
  {
    title: 'Surgical, sensory and diagnostic services',
    summary: 'A clinic listing would still require child eligibility, referral rules and travel-time validation.',
    options: [
      { id: 'paediatric_surgery', label: 'Paediatric surgery', description: 'General and subspecialty surgery designed for children.', source: 'Service data unavailable', available: false },
      { id: 'orthopaedics', label: 'Orthopaedics and rheumatology', description: 'Bone, joint, spine, mobility and inflammatory-condition care.', source: 'Service data unavailable', available: false },
      { id: 'ent', label: 'Ear, nose and throat (ENT)', description: 'ENT assessment, procedures and surgery for children.', source: 'Service data unavailable', available: false },
      { id: 'ophthalmology', label: 'Ophthalmology and optometry', description: 'Child eye-health assessment, treatment and vision correction.', source: 'Service data unavailable', available: false },
      { id: 'audiology', label: 'Audiology and hearing services', description: 'Hearing assessment, diagnostic audiology and hearing support.', source: 'Service data unavailable', available: false },
      { id: 'dental', label: 'Child dental and specialist oral care', description: 'Preventive, restorative and specialist paediatric dental services.', source: 'Service data unavailable', available: false },
      { id: 'imaging_pathology', label: 'Child-capable imaging and pathology', description: 'Diagnostic services with appropriate paediatric expertise and equipment.', source: 'Service data unavailable', available: false },
      { id: 'genetics', label: 'Clinical genetics', description: 'Genetic assessment, counselling and diagnostic services.', source: 'Service data unavailable', available: false },
    ],
  },
  {
    title: 'Mental health, therapy and family support',
    summary: 'Victorian child health care commonly includes several of these allied-health services.',
    options: [
      { id: 'child_mental_health', label: 'Child and adolescent mental-health services', description: 'Psychiatry, psychology, crisis and specialist mental-health care.', source: 'Service data unavailable', available: false },
      { id: 'speech_pathology', label: 'Speech pathology', description: 'Speech, language, communication, voice, fluency and swallowing support.', source: 'Service data unavailable', available: false },
      { id: 'occupational_therapy', label: 'Occupational therapy', description: 'Daily activities, sensory processing, participation and functional-development support.', source: 'Service data unavailable', available: false },
      { id: 'physiotherapy', label: 'Physiotherapy', description: 'Movement, mobility, strength, coordination and physical-development support.', source: 'Service data unavailable', available: false },
      { id: 'dietetics', label: 'Dietetics and feeding services', description: 'Nutrition, growth, feeding difficulty and therapeutic diet support.', source: 'Service data unavailable', available: false },
      { id: 'family_counselling', label: 'Family counselling and care coordination', description: 'Family support, coordinated referrals and navigation across services.', source: 'Service data unavailable', available: false },
      { id: 'rehabilitation', label: 'Paediatric rehabilitation and complex care', description: 'Multidisciplinary rehabilitation for disability, injury or complex health needs.', source: 'Service data unavailable', available: false },
    ],
  },
  {
    title: 'Locality context',
    summary: 'Area-level context that may help comparison but does not describe every household.',
    options: [
      { id: 'socioeconomic_resources', label: 'Index of Relative Socio-economic Disadvantage (decile 1–10)', description: 'ABS IRSD area decile; 10 indicates relatively fewer disadvantage characteristics. It does not describe every resident.', source: 'ABS SEIFA IRSD, 2021', available: true },
      { id: 'public_transport_availability', label: 'Public-transport stops per 10,000 residents', description: 'Mapped stops located inside the locality divided by resident population. It does not measure frequency, reliability, accessibility or travel time.', source: 'Victorian DTP stops, 2026', available: true },
    ],
  },
]

const evidencePatterns = [
  { label: 'Development + canopy', criteria: ['development_on_track', 'tree_canopy'], description: 'On-track development alongside tree-canopy coverage' },
  { label: 'Vulnerability + heat', criteria: ['lower_developmental_vulnerability', 'lower_urban_heat'], description: 'Lower developmental vulnerability alongside lower urban heat' },
  { label: 'Green-space access', criteria: ['tree_canopy', 'public_open_space'], description: 'Tree canopy and public open space considered together' },
  { label: 'Everyday healthcare availability', criteria: ['general_practice_access', 'pharmacy_access', 'hospital_access'], description: 'Population-adjusted presence of listed general practices, pharmacies and hospitals' },
  { label: 'Early-years service availability', criteria: ['approved_early_childhood_places', 'long_day_care_availability', 'kindergarten_availability'], description: 'Population-adjusted approved places, long day care and kindergarten supply' },
  { label: 'Early learning to primary school', criteria: ['approved_early_childhood_places', 'kindergarten_availability', 'primary_school_campus_availability'], description: 'Age-normalised early-childhood places, kindergarten services and primary-school campuses' },
  { label: 'Lower environmental pressures', criteria: ['lower_urban_heat', 'lower_declared_road_traffic', 'lower_industrial_emission_source_presence', 'lower_bushfire_prone_share'], description: 'Measured or clearly labelled proxy indicators for heat, traffic, industrial sources and designated bushfire-prone land' },
  { label: 'Whole evidence view', criteria: ['development_on_track', 'lower_developmental_vulnerability', 'tree_canopy', 'public_open_space', 'lower_urban_heat', 'socioeconomic_resources'], description: 'All currently supported measures, equally weighted' },
]

export default function LocalitySuitabilityPanel({
  criteria,
  onToggle,
  localities,
  loading,
  error,
  notice,
  onApplyPattern,
  onSelectLocality,
}: LocalitySuitabilityPanelProps) {
  const activeCriteria = new Set(criteria)

  return (
    <section className="glass map-control suitability-card" aria-labelledby="suitability-title">
      <div className="suitability-header">
        <h2 id="suitability-title">Locality suitability</h2>
        <button
          type="button"
          className="suitability-help"
          aria-label="How the suitability score is calculated"
          data-tooltip="This provisional score compares aggregate area-level indicators for the selected criteria. It is an investigation aid, not an assessment of individual children or proof that one neighbourhood is better than another."
        >
          ?
        </button>
      </div>

      <p className="suitability-intro">Choose from the evidence currently supported for every reporting locality. Results are relative area-level matches, not medical or personal advice.</p>

      <div className="suitability-layout">
        <div className="suitability-controls">
          <div className="suitability-patterns" aria-label="Evidence pattern shortcuts">
        <strong>Explore a concrete evidence pattern</strong>
        <p>These shortcuts combine measured indicators; they do not claim that one causes another.</p>
        <div>
          {evidencePatterns.map((pattern) => {
            const isActive = pattern.criteria.length === criteria.length
              && pattern.criteria.every((criterion) => activeCriteria.has(criterion))
            return (
              <button
                key={pattern.label}
                type="button"
                aria-pressed={isActive}
                title={pattern.description}
                onClick={() => onApplyPattern(pattern.criteria)}
              >
                {pattern.label}
              </button>
            )
          })}
        </div>
          </div>

          <div className="suitability-options" aria-label="Suitability filters">
        {optionGroups.map((group) => ({
          ...group,
          options: group.options.filter((option) => option.available),
        })).filter((group) => group.options.length > 0).map((group) => {
          const availableCount = group.options.length
          return (
            <details key={group.title} className="suitability-group">
              <summary>
                <span>{group.title}</span>
                <small>{availableCount} available</small>
              </summary>
              <div className="suitability-group-content">
                <p>{group.summary}</p>
                {group.options.map((option) => (
                  <label key={option.id} className={`suitability-option${option.available ? '' : ' is-unavailable'}`}>
                    <input
                      type="checkbox"
                      checked={activeCriteria.has(option.id)}
                      disabled={!option.available}
                      onChange={() => onToggle(option.id)}
                    />
                    <span className="suitability-option-copy">
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                      <em>{option.available ? option.source : `${option.source}: unavailable`}</em>
                    </span>
                  </label>
                ))}
              </div>
            </details>
          )
        })}
          </div>
        </div>

        <div className="suitability-results" aria-live="polite">
        {loading ? (
          <p>Calculating suitable localities…</p>
        ) : error ? (
          <p className="suitability-error">{error}</p>
        ) : localities.length === 0 ? (
          <p>{criteria.length === 0 ? 'Select one or more criteria to view results.' : 'No supported results are available.'}</p>
        ) : (
          <>
            <ol>
              {localities.map((locality, index) => (
                <li key={locality.id}>
                  <button
                    type="button"
                    className="suitability-result-button"
                    onClick={() => onSelectLocality(locality.id, locality.name)}
                    aria-label={`View ${locality.name}`}
                  >
                    <span className="rank">#{index + 1}</span>
                    <span className="suitability-result-name">
                      <strong>{locality.name}</strong>
                      <small>{locality.geographic_unit}</small>
                      <small className="suitability-result-measures">
                        {locality.criteria.map((criterion) => formatMeasure(criterion, locality.measures[criterion])).filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    <span className="score">{locality.score === null ? 'N/A' : <>{locality.score.toFixed(0)}<small>/100</small></>}</span>
                  </button>
                </li>
              ))}
            </ol>
            {notice ? <p className="suitability-notice">{notice}</p> : null}
            <p className="suitability-score-note">Relative evidence fit for the selected indicators. It is not an overall suburb rating.</p>
          </>
        )}
        </div>
      </div>
    </section>
  )
}
