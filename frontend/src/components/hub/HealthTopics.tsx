/**
 * Health topics page for parents and practitioners. Both audiences share one layout:
 * topic tiles → illustration with focus points + figures → life stages → actions + care nearby.
 * Figures come from the hub's validated endpoints for the selected locality; nothing is invented
 * client-side, and a figure without a published value is left out rather than estimated.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  api,
  type ChildHealthPhaIndicator,
  type ChildHealthSa2Indicator,
  type ImmunisationContext,
  type NearbyService,
  type NeighbourhoodSearchResult,
  type NutritionContext,
  type PractitionerContext,
  type PreventionContext,
  type SeasonalAir,
} from '../../services/api'
import { OFFICIAL } from '../health/healthPlanning'
import './TodayPage.css'
import './HealthTopics.css'

export type TopicId = 'brain' | 'lungs' | 'metabolic' | 'immune' | 'perinatal'

export interface HealthFigures {
  aedc: { vulnerableOne: number | null; vulnerableTwo: number | null; onTrackAll: number | null; assessed: number | null; domains: Array<[string, number | null]> }
  sa2: (id: string) => ChildHealthSa2Indicator | null
  pha: (id: string) => ChildHealthPhaIndicator | null
  phaName: string
}

interface Props {
  parent: boolean
  locality: NeighbourhoodSearchResult
  age: string
  controls: ReactNode
  figures: HealthFigures
  immunisation: ImmunisationContext | null
  nutrition: NutritionContext | null
  prevention: PreventionContext | null
  topic: TopicId
  setTopic: (topic: TopicId) => void
  onPrepareVisit: () => void
  onOpenMap?: () => void
  onOpenCare: () => void
}

/* A figure: parents read value + sentence; practitioners read measure, value, geography, comparison, then period, source, geography and limitation. */
interface Figure { value: string; exact?: string; text: string; measure: string; geo: 'SA2' | 'PHA' | 'Dept area' | 'Monitor' | 'National'; cmp: string; period: string; source: string; where: string; limit: string }
interface Facet { id: string; label: string; one: string; x: number; y: number; figures: Figure[] }

const STEP_KEY = 'kinderprint-body-steps'

const TOPICS: Array<{ id: TopicId; label: string; blurb: string; pblurb: string }> = [
  { id: 'brain', label: 'Brain and development', blurb: 'Supports learning, behaviour and lifelong wellbeing.', pblurb: 'Development at school entry and reported mental-health conditions.' },
  { id: 'lungs', label: 'Lungs and asthma', blurb: 'Breathing, asthma and the air children breathe.', pblurb: 'Asthma prevalence, air quality and smoke exposure.' },
  { id: 'metabolic', label: 'Growth and weight', blurb: 'Healthy growth, eating well and moving every day.', pblurb: 'Modelled weight estimates and daily physical activity.' },
  { id: 'immune', label: 'Immunity', blurb: 'Vaccines protect your child and the children around them.', pblurb: 'Immunisation coverage at 12, 24 and 60 months.' },
  { id: 'perinatal', label: 'Pregnancy and baby', blurb: 'A healthy start, from pregnancy through the first year.', pblurb: 'Birth outcomes and smoking during pregnancy.' },
]

const STEPS: Record<TopicId, { plan?: boolean; link: string; items: Array<[string, string]> }> = {
  brain: { plan: true, link: OFFICIAL.movement, items: [['Read together every day', 'Builds language and early literacy.'], ['Keep a regular sleep routine', '10–13 hours for 3–5 year olds, 9–11 hours for 5–13 year olds.'], ['Talk to the teacher or GP early if something worries you', 'Use the preparation plan to organise what you have noticed.']] },
  lungs: { link: OFFICIAL.asthmaPlan, items: [['Written asthma action plan reviewed this year', 'The National Asthma Council recommends a written plan for everyone with asthma.'], ['Puffer and spacer technique checked by a pharmacist', 'Most people use their inhaler incorrectly.'], ['Smoke-free home and car', 'Protects developing lungs.']] },
  metabolic: { link: OFFICIAL.movement, items: [['60 minutes of active play every day', 'Australian 24-hour movement guidelines, 5–17 years.'], ['Water as the everyday drink', 'Instead of juice or soft drink.'], ['No more than 2 hours of screen time for fun', 'Australian 24-hour movement guidelines, 5–17 years.']] },
  immune: { link: OFFICIAL.nipSchedule, items: [['Vaccines kept on schedule', 'Every National Immunisation Program vaccine is free.'], ['Flu vaccine every April or May', 'Free for children aged 6 months to under 5.'], ['Missed vaccines caught up', 'Catch-up vaccines are free at your GP or council.']] },
  perinatal: { link: OFFICIAL.safeSleep, items: [['Whooping cough vaccine during pregnancy', 'Protects the newborn in the first months.'], ['RSV protection in pregnancy or after birth', 'National and Victorian programs.'], ['Safe sleep: on the back, in their own cot', 'Red Nose safe-sleeping guidance.']] },
}

const QUESTIONS: Record<TopicId, string[]> = {
  brain: ['Are the 3½-year Maternal and Child Health checks reaching families before school entry?', 'Which early years services support social and emotional skills locally?', 'How are kindergartens linked to allied health referral?'],
  lungs: ['Are asthma action plans being reviewed before November?', 'Do childcare services and schools hold relievers and spacers?', 'How are families told about high-risk forecast days?'],
  metabolic: ['Do early years settings have water-only drink policies?', 'Where can children be active after school nearby?', 'Do growth checks continue after the 3½-year MCH visit?'],
  immune: ['How are children overdue at 18 months followed up before 24 months?', 'Do council immunisation sessions run at times working families can attend?', 'Is catch-up promoted at kindergarten enrolment?'],
  perinatal: ['Are whooping cough and RSV vaccines offered at antenatal visits?', 'Do MCH home visits reach newborns in the first two weeks?', 'Is quit support offered to partners as well?'],
}

/* Life stages: parents see what matters at each age; practitioners see which source covers each stage. */
const STAGES: Record<TopicId, Array<[string, string, string]>> = {
  brain: [['0–4 years', 'Early childhood', 'Talk, read, sing and play every day. Free Maternal and Child Health checks follow development up to 3½ years.'], ['5–9 years', 'School entry', 'The AEDC looks at development in the first year of school. Keep sleep at 9–11 hours.'], ['10–14 years', 'Growing independence', 'Friendships and feelings matter more. See the GP if worry or low mood lasts more than two weeks.']],
  lungs: [['0–4 years', 'Early childhood', 'Wheezing with colds is common. See the GP if breathing is fast, noisy or hard work.'], ['5–9 years', 'School years', 'Asthma is often diagnosed now. Give the school a copy of the action plan.'], ['10–14 years', 'Growing independence', 'Children start carrying their own puffer. Check technique and take it to sport.']],
  metabolic: [['0–4 years', 'Early childhood', '3 hours of active play a day, with water or plain milk as drinks. Nurses track growth at MCH checks.'], ['5–9 years', 'School years', '60 minutes of activity that gets them puffed, and vegetables in the lunchbox.'], ['10–14 years', 'Growth spurts', 'Appetite and body shape change. Keep family meals and limit sweet drinks.']],
  immune: [['0–4 years', 'Early childhood', 'Vaccines at 6 weeks, 4, 6, 12 and 18 months, then 4 years. Free flu vaccine each autumn.'], ['5–9 years', 'School years', 'Check the record before school starts and catch up anything missed, free.'], ['10–14 years', 'Year 7', 'HPV and diphtheria, tetanus and whooping cough vaccines through the school program.']],
  perinatal: [['Pregnancy', 'Before birth', 'Whooping cough and RSV vaccines are free in pregnancy. Quit support is free on 13 78 48.'], ['Newborn', 'First weeks', 'MCH home visit after birth. Safe sleep: on the back, in their own cot.'], ['First year', 'Babies', 'Vaccines at 6 weeks, 4 and 6 months, and RSV protection for the first winter.']],
}
const PSTAGES: Record<TopicId, Array<[string, string, string]>> = {
  brain: [['Birth–3½ years', 'Maternal and Child Health', 'Key Ages and Stages checks. Records are held by councils; no area measure in Vkinder.'], ['First school year', 'AEDC 2024', 'Five development domains for children assessed in the SA2.'], ['0–14 years', 'Census 2021', 'Reported mental-health condition, SA2 and PHA.']],
  lungs: [['All seasons', 'Air monitoring', 'Daily PM2.5 from the nearest EPA monitor.'], ['0–14 years', 'Census 2021', 'Asthma prevalence for the SA2 and PHA.'], ['Home', 'VCAMS', 'Tobacco smoke exposure for the department area.']],
  metabolic: [['2–17 years', 'Modelled estimates', 'Obesity and overweight for the PHA, with 95% intervals.'], ['School age', 'VCAMS', 'Daily physical activity for the department area.'], ['0–4 years', 'Maternal and Child Health', 'Growth checks; records are held by councils.']],
  immune: [['12 months', 'Australian Immunisation Register', 'Fully immunised at the first checkpoint, PHA.'], ['24 months', 'Australian Immunisation Register', 'Fully immunised at the second checkpoint, PHA.'], ['60 months', 'Australian Immunisation Register', 'Fully immunised before school, PHA.']],
  perinatal: [['Pregnancy', 'PHIDU Social Health Atlas', 'Smoking during pregnancy, PHA.'], ['Birth', 'PHIDU Social Health Atlas', 'Low birthweight, PHA.'], ['First year', 'PHIDU Social Health Atlas', 'Infant mortality, PHA.']],
}

const SERVICE_TYPES: Record<TopicId, string[]> = {
  brain: ['Maternal, child and family health service', 'General practice service', 'Emergency department service'],
  lungs: ['General practice service', 'Pharmacy service', 'Walk-in centre', 'Emergency department service'],
  metabolic: ['Maternal, child and family health service', 'General practice service'],
  immune: ['General practice service', 'Maternal, child and family health service', 'Pharmacy service'],
  perinatal: ['Hospital-based outpatient clinic', 'Maternal, child and family health service', 'General practice service'],
}

const bandIndex = (age: string) => age.startsWith('0') ? 0 : age.startsWith('5') ? 1 : 2
const has = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value)
const pct = (value: number, digits = 1) => `${value.toFixed(digits)}%`
const inHundred = (value: number) => `${Math.round(value)} in 100`
const oneIn = (value: number) => `1 in ${Math.max(2, Math.round(100 / value))}`
const num = (value: number) => Math.round(value).toLocaleString('en-AU')
const ordinal = (n: number) => { const r = Math.round(n); const s = r % 100 >= 11 && r % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][r % 10] ?? 'th'; return `${r}${s}` }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function useLoad<T>(load: (signal: AbortSignal) => Promise<{ data: T }>, key: string) {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setData(null)
    load(controller.signal).then(result => setData(result.data)).catch(() => { if (!controller.signal.aborted) setData(null) })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return data
}

function useDone(): [string[], (key: string) => void] {
  const [done, setDone] = useState<string[]>(() => { try { return JSON.parse(window.localStorage.getItem(STEP_KEY) ?? '[]') } catch { return [] } })
  useEffect(() => { try { window.localStorage.setItem(STEP_KEY, JSON.stringify(done)) } catch { /* storage unavailable */ } }, [done])
  return [done, key => setDone(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key])]
}

function buildFacets(topic: TopicId, p: Pick<Props, 'figures' | 'immunisation' | 'nutrition' | 'prevention'> & { context: PractitionerContext | null; air: SeasonalAir | null; localityName: string }): Facet[] {
  const { figures, immunisation, nutrition, prevention, context, air } = p
  const phaName = figures.phaName
  const out: Facet[] = []
  const f = (facet: Omit<Facet, 'figures'>, list: Array<Figure | null>) => out.push({ ...facet, figures: list.filter((item): item is Figure => item !== null) })
  const aedc = figures.aedc
  const domain = (name: string) => aedc.domains.find(([label]) => label === name)?.[1] ?? null
  const aedcFig = (measure: string, value: number | null, text: string, cmp = '', limit = 'Teacher-completed checklist; describes the cohort, not individual children.'): Figure | null => has(value)
    ? { value: pct(value), exact: pct(value), text, measure, geo: 'SA2', cmp, period: '2024', source: 'Australian Early Development Census', where: `${p.localityName} SA2${has(aedc.assessed) ? `, ${num(aedc.assessed)} children assessed` : ''}`, limit } : null
  const vcams = (list: Array<{ indicator_id: string; area: { percent: number | null }; reference_year: number }> | undefined, id: string) => list?.find(item => item.indicator_id === id) ?? null

  if (topic === 'brain') {
    const dev = context?.development
    const range = dev && has(dev.expected_vulnerable_pct) && has(dev.expected_range_pct[0]) && has(dev.expected_range_pct[1])
      ? `Expected ${pct(dev.expected_vulnerable_pct)} for this area (range ${dev.expected_range_pct[0].toFixed(1)}–${pct(dev.expected_range_pct[1])}): ${dev.observed_vulnerable_pct! > dev.expected_range_pct[1] ? 'higher than expected' : dev.observed_vulnerable_pct! < dev.expected_range_pct[0] ? 'lower than expected' : 'within the expected range'}` : ''
    const one = aedcFig('AEDC: vulnerable on 1 or more domains', aedc.vulnerableOne, 'need extra support in at least one area.', range, 'A snapshot of children in their first year of school; not a diagnostic assessment of any child.')
    if (one && has(aedc.vulnerableOne)) one.value = oneIn(aedc.vulnerableOne)
    const all = has(aedc.onTrackAll) ? { ...aedcFig('AEDC: on track in all five domains', aedc.onTrackAll, 'of children starting school are on track in all five areas of development.')!, value: pct(aedc.onTrackAll, 0) } : null
    f({ id: 'dev', label: 'Development', one: 'Five areas checked when children start school.', x: 55, y: 26 }, [all, one, aedcFig('AEDC: vulnerable on 2 or more domains', aedc.vulnerableTwo, 'need extra support in two or more areas.')])
    const social = domain('Social'), emotional = domain('Emotional')
    f({ id: 'emo', label: 'Emotional and social', one: 'Getting along with others and managing feelings.', x: 21, y: 40 }, [
      social !== null ? { ...aedcFig('AEDC: social competence on track', social, 'children are on track for social skills at school entry.')!, value: inHundred(social) } : null,
      emotional !== null ? { ...aedcFig('AEDC: emotional maturity on track', emotional, 'are on track for emotional maturity.')!, value: inHundred(emotional) } : null])
    const language = domain('Language'), communication = domain('Communication'), physical = domain('Physical')
    f({ id: 'lang', label: 'Language and physical', one: 'Talking, early literacy, and coordination.', x: 46, y: 60 }, [
      language !== null ? { ...aedcFig('AEDC: language and cognitive skills on track', language, 'children are on track for language and thinking skills.', '', 'Measures school readiness skills, not intelligence.')!, value: inHundred(language) } : null,
      communication !== null ? { ...aedcFig('AEDC: communication on track', communication, 'are on track for communication and general knowledge.', '', 'Includes children still learning English.')!, value: inHundred(communication) } : null,
      physical !== null ? { ...aedcFig('AEDC: physical health on track', physical, 'are on track for physical health and wellbeing.', '', 'Teacher-observed; not a medical examination.')!, value: inHundred(physical) } : null])
    const mh = figures.sa2('mental_health_condition'), mhPha = figures.pha('child_mental_health_condition')
    f({ id: 'mh', label: 'Mental health', one: 'Reported long-term mental-health conditions.', x: 80, y: 44 }, [
      mh && has(mh.percent) ? { value: pct(mh.percent), exact: pct(mh.percent, 2), text: `of children aged 0–14 have a reported mental-health condition${has(mh.count) ? ` (${num(mh.count)} children)` : ''}.`, measure: 'Mental-health condition, 0–14', geo: 'SA2', cmp: mhPha && has(mhPha.rate_or_percent) ? `PHA ${pct(mhPha.rate_or_percent, 2)}` : '', period: String(mh.reference_year), source: 'ABS Census, long-term health conditions', where: `${mh.sa2_name_2021} SA2${has(mh.count) && has(mh.population_denominator) ? `, ${num(mh.count)} of ${num(mh.population_denominator)} children` : ''}`, limit: 'Household-reported in the Census; under-reports undiagnosed conditions.' } : null])
  }

  if (topic === 'lungs') {
    const asthma = figures.sa2('asthma'), asthmaPha = figures.pha('child_asthma')
    f({ id: 'asthma', label: 'Asthma', one: 'How many children here live with asthma.', x: 28, y: 58 }, [
      asthma && has(asthma.percent) ? { value: has(asthma.count) ? num(asthma.count) : pct(asthma.percent), exact: pct(asthma.percent, 2), text: has(asthma.count) ? `children aged 0–14 here have asthma, about ${Math.round(asthma.percent)} in every 100.` : 'of children aged 0–14 here have asthma.', measure: 'Asthma, 0–14', geo: 'SA2', cmp: asthmaPha && has(asthmaPha.rate_or_percent) ? `PHA ${pct(asthmaPha.rate_or_percent, 2)}` : '', period: String(asthma.reference_year), source: 'ABS Census, long-term health conditions', where: `${asthma.sa2_name_2021} SA2${has(asthma.count) && has(asthma.population_denominator) ? `, ${num(asthma.count)} of ${num(asthma.population_denominator)} children` : ''}`, limit: 'Household-reported diagnosis; does not show severity or control.' } : null,
      asthmaPha && has(asthmaPha.rate_or_percent) && has(asthmaPha.standardised_ratio) ? { value: pct(asthmaPha.rate_or_percent), text: `of children in the wider ${phaName} area have asthma.`, measure: 'Asthma, 0–14 (age standardised)', geo: 'PHA', cmp: `Standardised ratio ${asthmaPha.standardised_ratio.toFixed(1)} (100 = reference rate)`, period: asthmaPha.reference_period, source: 'PHIDU Social Health Atlas', where: `${asthmaPha.pha_name_2021} PHA`, limit: 'Area larger than the SA2.' } : null])
    const jan = air?.months.find(m => m.month === 1), oct = air?.months.find(m => m.month === 10), st = air?.station
    f({ id: 'air', label: 'Air and seasons', one: 'Smoke, pollen and thunderstorm asthma.', x: 50, y: 12 }, [
      { value: 'Oct–Dec', text: 'is thunderstorm asthma season in Victoria.', measure: 'Thunderstorm asthma season', geo: 'National', cmp: 'Daily risk forecast published by the Victorian Department of Health', period: 'Every year', source: 'Victorian Department of Health', where: 'Victoria', limit: 'Seasonal guidance, not a local measurement.' },
      jan && st ? { value: `${jan.days_above_standard} days`, text: `in January (${st.first_year}–${st.last_year}) had fine-particle pollution above the daily standard.`, measure: `PM2.5 days above ${st.standard_ug_m3} µg/m³, January`, geo: 'Monitor', cmp: `January average ${jan.mean_daily_ug_m3.toFixed(1)} µg/m³${oct ? `; October ${oct.mean_daily_ug_m3.toFixed(1)} with ${oct.days_above_standard} days above` : ''}`, period: `${st.first_year}–${st.last_year}`, source: 'EPA Victoria air monitoring', where: `${st.name} monitor, ${st.distance_km.toFixed(1)} km away`, limit: 'Nearest monitor, not measured inside the SA2.' } : null])
    const tobacco = vcams(prevention?.vcams, 'tobacco_smoke_exposure_at_home'), traffic = prevention?.transport
    f({ id: 'smoke', label: 'Smoke and traffic', one: 'Tobacco smoke at home and busy roads.', x: 74, y: 55 }, [
      tobacco && has(tobacco.area.percent) ? { value: pct(tobacco.area.percent, 0), exact: pct(tobacco.area.percent), text: `of children in the ${prevention?.locality?.department_area ?? 'surrounding'} area are exposed to tobacco smoke at home.`, measure: 'Tobacco smoke exposure at home', geo: 'Dept area', cmp: '', period: String(tobacco.reference_year), source: 'Victorian Child and Adolescent Monitoring System', where: `${prevention?.locality?.department_area ?? ''} department area`, limit: 'Regional survey estimate; not available for the SA2.' } : null,
      traffic && has(traffic.traffic_intensity_percentile) ? { value: `${ordinal(traffic.traffic_intensity_percentile)} percentile`, text: `for traffic on major roads, out of ${num(traffic.sa2_compared)} areas compared.`, measure: 'Declared-road traffic intensity', geo: 'SA2', cmp: '', period: '2019', source: 'VicRoads annual average daily traffic', where: `SA2, of ${num(traffic.sa2_compared)} SA2s compared`, limit: 'Declared roads only; local streets not counted.' } : null])
  }

  if (topic === 'metabolic') {
    const weight = (id: string) => nutrition?.weight.find(item => item.indicator_id === id)
    const w = (id: 'child_obese' | 'child_overweight_not_obese', measure: string, text: (v: string, vic: string) => string): Figure | null => {
      const item = weight(id); if (!item || !has(item.pha.percent)) return null
      const vic = item.victoria ? pct(item.victoria.percent) : ''
      return { value: pct(item.pha.percent, id === 'child_obese' ? 1 : 0), exact: pct(item.pha.percent, 2), text: text(pct(item.pha.percent), vic), measure, geo: 'PHA', cmp: vic ? `Victoria ${vic}` : '', period: item.reference_period, source: 'PHIDU modelled estimates', where: `${phaName} PHA${has(item.pha.lower_95_ci) && has(item.pha.upper_95_ci) ? `, 95% CI ${item.pha.lower_95_ci.toFixed(1)}–${item.pha.upper_95_ci.toFixed(1)}` : ''}`, limit: 'Modelled from survey data, not measured locally.' }
    }
    f({ id: 'weight', label: 'Weight', one: 'Children above a healthy weight.', x: 38, y: 30 }, [
      w('child_obese', 'Obesity, children', (_, vic) => `of children nearby live with obesity${vic ? `, compared with ${vic} across Victoria` : ''}.`),
      w('child_overweight_not_obese', 'Overweight, excluding obesity', () => 'are above a healthy weight, not counting obesity.')])
    const activity = vcams(nutrition?.vcams, 'recommended_daily_physical_activity')
    f({ id: 'active', label: 'Activity', one: 'Children active for an hour every day.', x: 72, y: 62 }, [
      activity && has(activity.area.percent) ? { value: inHundred(activity.area.percent), exact: pct(activity.area.percent), text: 'children in the region are active for 60 minutes a day.', measure: 'Active 60 minutes every day', geo: 'Dept area', cmp: '', period: String(activity.reference_year), source: 'Victorian Child and Adolescent Monitoring System', where: `${nutrition?.locality?.department_area ?? ''} department area`, limit: 'Parent-reported; regional estimate.' } : null])
  }

  if (topic === 'immune') {
    const list = immunisation?.indicators ?? []
    const lowest = list.filter(item => has(item.pha.percent)).sort((a, b) => a.pha.percent! - b.pha.percent!)[0]
    f({ id: 'cov', label: 'Vaccination coverage', one: 'Children fully vaccinated at each checkpoint.', x: 34, y: 34 }, list.map(item => has(item.pha.percent) ? {
      value: inHundred(item.pha.percent), exact: pct(item.pha.percent, 2), text: `children nearby are fully vaccinated at ${item.age}${item === lowest && list.length > 1 ? ', the lowest of the checkpoints' : ''}.`, measure: `Fully immunised, ${item.age}`, geo: 'PHA' as const,
      cmp: [item.victoria ? `Victoria ${pct(item.victoria.percent)}` : '', item.pha.percent < item.national_aspirational_target ? `national target ${item.national_aspirational_target}%` : ''].filter(Boolean).join('; '),
      period: item.reference_period, source: 'Australian Immunisation Register', where: `${immunisation?.locality?.pha_name ?? phaName} PHA${has(item.pha.numerator) && has(item.pha.denominator) ? `, ${num(item.pha.numerator)} of ${num(item.pha.denominator)}` : ''}`, limit: 'Late recording can understate coverage.' } : null))
    f({ id: 'sched', label: 'Schedule', one: 'When the free vaccines are due.', x: 66, y: 66 }, [
      { value: '6 visits', text: 'in the first 4 years: 6 weeks, 4, 6, 12 and 18 months, and 4 years.', measure: 'National Immunisation Program, early childhood', geo: 'National', cmp: '', period: 'Current schedule', source: 'Australian Government Department of Health', where: 'Australia', limit: 'Schedule only; coverage is in the coverage tab.' },
      { value: 'Year 7', text: 'school program: HPV and diphtheria, tetanus and whooping cough.', measure: 'National Immunisation Program, school', geo: 'National', cmp: '', period: 'Current schedule', source: 'Australian Government Department of Health', where: 'Australia', limit: 'Delivered through schools; timing varies by school.' }])
  }

  if (topic === 'perinatal') {
    const ph = (id: string, measure: string, text: string, label: string, one: string, x: number, y: number, limit: string, per1000 = false) => {
      const item = figures.pha(id)
      f({ id, label, one, x, y }, [item && has(item.rate_or_percent) ? { value: per1000 ? item.rate_or_percent.toFixed(1) : pct(item.rate_or_percent), exact: per1000 ? `${item.rate_or_percent.toFixed(2)} per 1,000` : pct(item.rate_or_percent, 2), text, measure, geo: 'PHA', cmp: '', period: item.reference_period, source: 'PHIDU Social Health Atlas', where: `${item.pha_name_2021} PHA`, limit } : null])
    }
    ph('smoking_during_pregnancy', 'Smoking during pregnancy', 'of mothers nearby smoked during pregnancy.', 'Pregnancy', 'Smoking and vaccines in pregnancy.', 36, 26, 'Self-reported at the first antenatal visit.')
    ph('low_birthweight', 'Low birthweight', 'of babies nearby are born with low birthweight.', 'Birth', 'Babies born at a healthy weight.', 52, 56, 'Under 2,500 g; includes preterm births.')
    ph('infant_mortality', 'Infant mortality, per 1,000 live births', 'infant deaths per 1,000 births.', 'First year', 'Keeping babies safe in their first year.', 74, 76, 'Small numbers; a multi-year average is used.', true)
  }
  return out
}

export default function HealthTopics(props: Props) {
  const { parent, locality, age, controls, topic, setTopic, onPrepareVisit, onOpenMap, onOpenCare } = props
  const context = useLoad<PractitionerContext>(signal => api.getPractitionerContext(locality.id, signal), `ctx-${locality.id}`)
  const air = useLoad<SeasonalAir>(signal => api.getSeasonalAir(locality.id, signal), `air-${locality.id}`)
  const services = useLoad<{ services: NearbyService[] }>(signal => api.getNearbyServices(locality.id, signal), `svc-${locality.id}`)
  const [facetId, setFacetId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [done, toggle] = useDone()
  useEffect(() => { setFacetId(null); setCopied(false) }, [topic])

  const current = TOPICS.find(item => item.id === topic) ?? TOPICS[0]
  const facets = useMemo(() => buildFacets(current.id, { ...props, context, air, localityName: locality.name }), [current.id, locality.name, props.figures, props.immunisation, props.nutrition, props.prevention, context, air]) // eslint-disable-line react-hooks/exhaustive-deps
  const facet = facets.find(item => item.id === facetId) ?? facets[0]
  const stages = parent ? STAGES[current.id] : PSTAGES[current.id]
  const highlight = parent && current.id !== 'perinatal' ? bandIndex(age) : -1
  const steps = STEPS[current.id]
  const doneCount = steps.items.filter((_, index) => done.includes(`${current.id}-${index}`)).length
  const care = SERVICE_TYPES[current.id].map(type => services?.services.filter(item => item.service_type === type).sort((a, b) => a.distance_km - b.distance_km)[0]).filter((item): item is NearbyService => !!item)
  const gp = context?.access?.general_practice
  const copy = () => {
    const text = facets.flatMap(item => item.figures).map(item => [item.measure, item.value, item.geo, item.period, item.source].join('\t')).join('\n')
    void navigator.clipboard?.writeText(text).then(() => setCopied(true)).catch(() => setCopied(false))
  }

  return <div className={`kt ht ${parent ? 'kt-parent' : 'kt-prac'}`}>
    <section className="kt-hero ht-hero" aria-label="Introduction">
      <img src={parent ? '/health-assets/today-parent.webp' : '/health-assets/today-practitioner.jpg'} alt={parent ? 'A mother lifting her smiling baby in a sunny park' : 'A healthcare professional in protective gear gently holding an infant'} className="kt-hero-img" />
      <div className="kt-hero-text">
        <h1>{parent ? 'Your child’s health, topic by topic' : 'Child health conditions'}</h1>
        <p>{parent ? 'What the area data shows for each part of growing up, and simple steps that help at home.' : 'Aggregate evidence by topic, with geography, period and source for every value. Not an individual clinical record.'}</p>
      </div>
    </section>
    <div className="kt-filters">
      {controls}
      <p>{parent ? 'Everything below follows the age you choose.' : `Population Health Area: ${props.figures.phaName}`}</p>
      {parent && onOpenMap && <button type="button" className="kh-btn kt-link-btn" onClick={onOpenMap}>View on map</button>}
    </div>

    <div className="ht-topics" role="tablist" aria-label="Health topic">{TOPICS.map(item => <button key={item.id} type="button" role="tab" aria-selected={item.id === current.id} onClick={() => setTopic(item.id)}>
      <img src={`/health-assets/organs/${item.id}-sm.webp`} alt="" width={52} height={52} /><span>{item.label}</span>
    </button>)}</div>

    <div className="kt-row">
      <section className="kt-card kt-cream kt-half ht-visual" aria-labelledby="ht-topic">
        <div className="ht-visual-head"><h2 id="ht-topic">{current.label}</h2><span className="kt-pill">{parent ? 'Area evidence' : 'Population evidence'}</span></div>
        <p className="kt-sub">{parent ? current.blurb : current.pblurb}</p>
        <div className="ht-figure">
          <div className="ht-stage">
            <AnimatePresence mode="wait" initial={false}>
              <motion.img key={current.id} src={`/health-assets/organs/${current.id}.webp`} alt={`Illustration: ${current.label.toLowerCase()}`} initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: .22 }} />
            </AnimatePresence>
            {facets.map(item => <button key={item.id} type="button" className="ht-spot" style={{ left: `${item.x}%`, top: `${item.y}%` }} aria-label={`Show ${item.label.toLowerCase()}`} aria-pressed={item.id === facet?.id} onClick={() => setFacetId(item.id)}><span /></button>)}
          </div>
          <p className="ht-hint">Select a point on the illustration or a focus below.</p>
        </div>
        <div className="ht-facets" role="tablist" aria-label="Focus">{facets.map(item => <button key={item.id} type="button" role="tab" aria-selected={item.id === facet?.id} onClick={() => setFacetId(item.id)}>{item.label}</button>)}</div>
      </section>

      <section className="kt-card kt-tint kt-half ht-figures" aria-labelledby="ht-fig" aria-live="polite">
        <h2 id="ht-fig">{parent ? `In ${locality.name}` : 'Indicators'}</h2>
        <p className="kt-sub">{facet ? (parent ? `${facet.label}: ${facet.one}` : `${facet.label}: measure, value, comparison, then period and source.`) : ''}</p>
        {facet && facet.figures.length > 0 ? facet.figures.map(item => parent
          ? <div key={item.measure} className="ht-fig"><strong>{item.value}</strong><p>{item.text}</p><small>{item.source}, {item.period}</small></div>
          : <div key={item.measure} className="ht-fig"><b className="ht-measure">{item.measure}</b><p className="ht-value"><strong>{item.exact ?? item.value}</strong><span className={`ht-geo${item.geo === 'SA2' ? ' is-sa2' : ''}`}>{item.geo}</span></p>{item.cmp && <p>{item.cmp}</p>}<small>{item.period} · {item.source} · {item.where}. {item.limit}</small></div>)
          : <p className="kt-empty ht-fig">No published figure for {locality.name} on this focus.</p>}
        {parent && <p className="ht-note">These describe children in the area, not your child.</p>}
      </section>
    </div>

    <section aria-labelledby="ht-stages">
      <h2 id="ht-stages">{parent ? 'What matters at each age' : 'Evidence across childhood'}</h2>
      <p className="kt-sub">{parent ? (highlight >= 0 ? 'Your child’s age group is highlighted. Change it in the age selector above.' : 'From pregnancy through the first year.') : 'Which data source describes each life stage for this topic.'}</p>
      <div className="kt-card kt-tint ht-stages">{stages.map(([range, name, text], index) => <div key={range} className={index === highlight ? 'is-current' : undefined}>
        <span className="ht-range">{range}</span><h3>{name}</h3><p>{text}</p>
      </div>)}</div>
    </section>

    <div className="kt-row kt-row-top">
      <section className="kt-card kt-cream kt-wide" aria-labelledby="ht-do">
        <div className="ht-do-head"><h2 id="ht-do">{parent ? 'What you can do' : 'Questions for local services'}</h2>{parent && <span>{doneCount} of {steps.items.length} done</span>}</div>
        <p className="kt-sub">{parent ? 'Tick as you go. Saved on this device.' : 'Prompts for prevention and service planning on this topic.'}</p>
        {parent ? <>
          <div className="ht-progress" aria-hidden="true"><span style={{ width: `${doneCount / steps.items.length * 100}%` }} /></div>
          <ul className="ht-steps">{steps.items.map(([text, why], index) => { const key = `${current.id}-${index}`; return <li key={key} className={done.includes(key) ? 'is-done' : undefined}>
            <label><input type="checkbox" checked={done.includes(key)} onChange={() => toggle(key)} /><span><b>{text}</b><span>{why}</span></span></label>
          </li> })}</ul>
          <div className="ht-actions">
            {steps.plan && <button type="button" className="kh-btn primary" onClick={onPrepareVisit}>Prepare for a GP visit</button>}
            <a href={steps.link} target="_blank" rel="noreferrer">Official guidance</a>
          </div>
        </> : <>
          <ol className="ht-questions">{QUESTIONS[current.id].map((text, index) => <li key={text}><span aria-hidden="true">{index + 1}</span>{text}</li>)}</ol>
          <div className="ht-actions">
            <button type="button" className="kh-btn" onClick={copy}>{copied ? 'Copied' : 'Copy indicators'}</button>
          </div>
        </>}
      </section>

      <section className="kt-card kt-cream kt-narrow" aria-labelledby="ht-care">
        <h2 id="ht-care">{parent ? 'Care nearby' : 'Access to care'}</h2>
        {care.length > 0 ? <ul className="ht-care">{care.map(item => <li key={item.name}><span><b>{item.name}</b><span>{item.service_type.replace(/ service$/, '')}</span></span><b>{item.distance_km.toFixed(1)} km</b></li>)}</ul>
          : <p className="kt-empty">{services ? 'No matching services listed near this locality.' : 'Loading nearby services…'}</p>}
        <p className="ht-care-note">{parent ? 'Listed services may not have appointments available. In an emergency call 000.' : `Listed presence does not mean availability, capacity or quality.${gp && has(gp.percentile) ? ` GP access is at the ${ordinal(gp.percentile)} percentile of Victorian SA2s.` : ''}`} National Health Services Directory{services?.services[0] ? `, ${MONTHS[Number(services.services[0].source_date.slice(5, 7)) - 1]} ${services.services[0].source_date.slice(0, 4)}` : ''}.</p>
        <button type="button" className="kh-btn kt-link-btn" onClick={onOpenCare}>{parent ? 'See all care nearby' : 'Open care access'}</button>
      </section>
    </div>

    <footer className="kt-foot"><p>{locality.name} SA2 and the {props.figures.phaName} Population Health Area. Sources: AEDC 2024; ABS Census 2021; PHIDU Social Health Atlas; VCAMS; Australian Immunisation Register; EPA Victoria; VicRoads. {parent ? 'General guidance for age groups, not a diagnosis for your child.' : 'Area-level evidence only; not for individual diagnosis.'}</p></footer>
  </div>
}
