import { useCallback, useEffect, useRef, useState } from 'react'

import BrandHeader from './BrandHeader'
import { useNeighbourhoodSearch } from '../hooks/useNeighbourhoodSearch'
import { api } from '../services/api'
import { toNeighbourhood } from '../services/profileAdapter'

interface SimulationPageProps {
  onHome: () => void
  onInsight: () => void
  onExploreMap: () => void
  onSimulation: () => void
  onHealth: () => void
}

interface SimulationBaseline {
  id: string
  name: string
  generalPracticeAccess: number
  pharmacyAccess: number
  hospitalAccess: number
  earlyYearsPlaces: number
  physicalHealth: number
  socialCompetence: number
  vulnerability: number
  childDevelopment: number
  serviceAccess: number
  futureDemand: number
  trafficPressure: number
  industrialPressure: number
}

interface ScenarioValues {
  generalPracticeAccess: number
  pharmacyAccess: number
  hospitalAccess: number
  earlyYearsPlaces: number
}

interface ScenarioResult {
  careAccessDirection: string
  vulnerabilityDirection: string
  generalPracticeAccess: number
  baselineGeneralPracticeAccess: number
  vulnerability: number
  baselineVulnerability: number
  physicalHealth: number
  baselinePhysicalHealth: number
  physicalHealthDirection: string
  socialCompetence: number
  socialCompetenceDirection: string
  projectedChange: string
  projectedPhysicalHealthChange: string
  aiSummary: string
  modelContext: string
  insight: string
}

interface AiLinearModel {
  intercept: number
  generalPracticeWeight: number
  pharmacyWeight: number
  earlyYearsWeight: number
  r2: number
  sampleSize: number
}

interface AiSimulationModel {
  vulnerabilityModel: AiLinearModel | null
  developmentModel: AiLinearModel | null
  socialModel: AiLinearModel | null
  status: 'learned' | 'fallback'
  notes: string[]
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

type ComparisonMetric = {
  id: 'generalPractice' | 'pharmacy' | 'hospital' | 'earlyYears' | 'vulnerability'
  label: string
  unit: string
  baseline: number
  simulated: number
  max: number
  lowerIsBetter: boolean
}

type SimulationUpdateStatus = 'idle' | 'updating' | 'updated'

function formatMetricValue(value: number, unit: string) {
  return `${value.toFixed(1)}${unit}`
}

function metricDirection(metric: ComparisonMetric) {
  const delta = metric.simulated - metric.baseline
  if (Math.abs(delta) < 0.05) {
    return { delta, label: 'No change', tone: 'neutral' as const }
  }
  const improves = metric.lowerIsBetter ? delta < 0 : delta > 0
  return {
    delta,
    label: improves ? 'Improves' : 'Worsens',
    tone: improves ? 'improves' as const : 'worsens' as const,
  }
}

function outcomeDirection(baseline: number, simulated: number, lowerIsBetter = false) {
  const delta = simulated - baseline
  if (Math.abs(delta) < 0.05) return { status: 'No change', tone: 'neutral' as const, symbol: '→' }
  const improves = lowerIsBetter ? delta < 0 : delta > 0
  return improves
    ? { status: 'Improves', tone: 'improves' as const, symbol: '↗' }
    : { status: 'Worsens', tone: 'worsens' as const, symbol: '↘' }
}

function metricNumber(indicators: Record<string, { value: number | null; status: string }>, id: string): number | null {
  const indicator = indicators[id]
  return indicator && indicator.status === 'available' && typeof indicator.value === 'number' && Number.isFinite(indicator.value)
    ? indicator.value
    : null
}

function solveLinearSystem4x4(matrix: number[][], vector: number[]): number[] | null {
  const a = matrix.map((row, rowIndex) => [...row, vector[rowIndex]])
  const size = 4
  for (let pivot = 0; pivot < size; pivot += 1) {
    let maxRow = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(a[row][pivot]) > Math.abs(a[maxRow][pivot])) {
        maxRow = row
      }
    }
    if (Math.abs(a[maxRow][pivot]) < 1e-10) {
      return null
    }
    if (maxRow !== pivot) {
      const tmp = a[pivot]
      a[pivot] = a[maxRow]
      a[maxRow] = tmp
    }
    const pivotValue = a[pivot][pivot]
    for (let col = pivot; col <= size; col += 1) {
      a[pivot][col] /= pivotValue
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) {
        continue
      }
      const factor = a[row][pivot]
      for (let col = pivot; col <= size; col += 1) {
        a[row][col] -= factor * a[pivot][col]
      }
    }
  }
  return a.map((row) => row[size])
}

function trainAiLinearModel(samples: Array<{ generalPracticeAccess: number; pharmacyAccess: number; earlyYearsPlaces: number; target: number }>): AiLinearModel | null {
  if (samples.length < 24) {
    return null
  }
  const xTx = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  const xTy = [0, 0, 0, 0]
  const ridge = 0.08
  for (const sample of samples) {
    const features = [1, sample.generalPracticeAccess, sample.pharmacyAccess, sample.earlyYearsPlaces]
    for (let row = 0; row < 4; row += 1) {
      xTy[row] += features[row] * sample.target
      for (let col = 0; col < 4; col += 1) {
        xTx[row][col] += features[row] * features[col]
      }
    }
  }
  for (let idx = 1; idx < 4; idx += 1) {
    xTx[idx][idx] += ridge
  }
  const coefficients = solveLinearSystem4x4(xTx, xTy)
  if (!coefficients) {
    return null
  }
  const [intercept, generalPracticeWeight, pharmacyWeight, earlyYearsWeight] = coefficients
  const meanTarget = samples.reduce((total, sample) => total + sample.target, 0) / samples.length
  let sse = 0
  let sst = 0
  for (const sample of samples) {
    const predicted = intercept
      + (generalPracticeWeight * sample.generalPracticeAccess)
      + (pharmacyWeight * sample.pharmacyAccess)
      + (earlyYearsWeight * sample.earlyYearsPlaces)
    const residual = sample.target - predicted
    sse += residual * residual
    const centered = sample.target - meanTarget
    sst += centered * centered
  }
  const rawR2 = sst > 0 ? 1 - (sse / sst) : 0
  return {
    intercept,
    generalPracticeWeight,
    pharmacyWeight,
    earlyYearsWeight,
    r2: clamp(rawR2, 0, 1),
    sampleSize: samples.length,
  }
}

function predictAi(model: AiLinearModel, generalPracticeAccess: number, pharmacyAccess: number, earlyYearsPlaces: number): number {
  return model.intercept
    + (model.generalPracticeWeight * generalPracticeAccess)
    + (model.pharmacyWeight * pharmacyAccess)
    + (model.earlyYearsWeight * earlyYearsPlaces)
}

function buildAiModel(indicatorRows: Array<{ indicators: Record<string, { value: number | null; status: string }> }>): AiSimulationModel {
  const notes: string[] = []
  const vulnerabilitySamples: Array<{ generalPracticeAccess: number; pharmacyAccess: number; earlyYearsPlaces: number; target: number }> = []
  const physicalHealthSamples: Array<{ generalPracticeAccess: number; pharmacyAccess: number; earlyYearsPlaces: number; target: number }> = []
  const socialSamples: Array<{ generalPracticeAccess: number; pharmacyAccess: number; earlyYearsPlaces: number; target: number }> = []

  for (const row of indicatorRows) {
    const generalPracticeAccess = metricNumber(row.indicators, 'general_practice_access')
    const pharmacyAccess = metricNumber(row.indicators, 'pharmacy_access')
    const earlyYearsPlaces = metricNumber(row.indicators, 'approved_early_childhood_places')
    if (generalPracticeAccess === null || pharmacyAccess === null || earlyYearsPlaces === null) {
      continue
    }
    const vulnerability = metricNumber(row.indicators, 'aedc_vulnerable_one_or_more')
    if (vulnerability !== null) {
      vulnerabilitySamples.push({ generalPracticeAccess, pharmacyAccess, earlyYearsPlaces, target: vulnerability })
    }
    const physicalHealth = metricNumber(row.indicators, 'aedc_physical_on_track')
    if (physicalHealth !== null) {
      physicalHealthSamples.push({ generalPracticeAccess, pharmacyAccess, earlyYearsPlaces, target: physicalHealth })
    }
    const socialCompetence = metricNumber(row.indicators, 'aedc_social_on_track')
    if (socialCompetence !== null) {
      socialSamples.push({ generalPracticeAccess, pharmacyAccess, earlyYearsPlaces, target: socialCompetence })
    }
  }

  const vulnerabilityModel = trainAiLinearModel(vulnerabilitySamples)
  const developmentModel = trainAiLinearModel(physicalHealthSamples)
  const socialModel = trainAiLinearModel(socialSamples)
  if (!vulnerabilityModel) {
    notes.push('Vulnerability model fallback: insufficient or unstable samples')
  }
  if (!developmentModel) {
    notes.push('Physical-health model fallback: insufficient or unstable samples')
  }
  if (!socialModel) {
    notes.push('Social-health model fallback: insufficient or unstable samples')
  }
  return {
    vulnerabilityModel,
    developmentModel,
    socialModel,
    status: vulnerabilityModel && developmentModel ? 'learned' : 'fallback',
    notes,
  }
}

function buildScenarioResult(
  baseline: SimulationBaseline,
  values: ScenarioValues,
  aiModel: AiSimulationModel | null,
): ScenarioResult {
  const generalPracticeIncrease = values.generalPracticeAccess - baseline.generalPracticeAccess
  const pharmacyIncrease = values.pharmacyAccess - baseline.pharmacyAccess
  const hospitalIncrease = values.hospitalAccess - baseline.hospitalAccess
  const earlyYearsIncrease = values.earlyYearsPlaces - baseline.earlyYearsPlaces
  const ruleVulnerabilityAdjustment = (generalPracticeIncrease * 1.4) + (pharmacyIncrease * 0.8) + (hospitalIncrease * 1.1) + (earlyYearsIncrease * 0.08)
  const rulePhysicalHealthAdjustment = (generalPracticeIncrease * 0.9) + (pharmacyIncrease * 0.5) + (hospitalIncrease * 0.7) + (earlyYearsIncrease * 0.1)
  const ruleSocialAdjustment = (generalPracticeIncrease * 0.5) + (pharmacyIncrease * 0.3) + (hospitalIncrease * 0.3) + (earlyYearsIncrease * 0.12)

  // Stronger care access makes capacity improvements easier to convert into outcomes,
  // while projected demand and contextual pressure dampen expected effect size.
  const serviceCapacityFactor = clamp(0.8 + (baseline.serviceAccess / 100) * 0.25 + (baseline.hospitalAccess / 20) * 0.15, 0.8, 1.2)
  const demandPressureFactor = clamp(1.15 - (baseline.futureDemand / 100) * 0.35, 0.8, 1.15)
  const backgroundPressure = (baseline.trafficPressure + baseline.industrialPressure) / 2
  const pressureDampeningFactor = clamp(1.1 - (backgroundPressure / 100) * 0.35, 0.75, 1.1)
  const contextMultiplier = clamp(
    (serviceCapacityFactor + demandPressureFactor + pressureDampeningFactor) / 3,
    0.7,
    1.2,
  )

  const aiVulnerabilityAdjustment = aiModel?.vulnerabilityModel
    ? predictAi(
      aiModel.vulnerabilityModel,
      baseline.generalPracticeAccess,
      baseline.pharmacyAccess,
      baseline.earlyYearsPlaces,
    ) - predictAi(
      aiModel.vulnerabilityModel,
      values.generalPracticeAccess,
      values.pharmacyAccess,
      values.earlyYearsPlaces,
    )
    : null
  const aiPhysicalHealthAdjustment = aiModel?.developmentModel
    ? predictAi(
      aiModel.developmentModel,
      values.generalPracticeAccess,
      values.pharmacyAccess,
      values.earlyYearsPlaces,
    ) - predictAi(
      aiModel.developmentModel,
      baseline.generalPracticeAccess,
      baseline.pharmacyAccess,
      baseline.earlyYearsPlaces,
    )
    : null
  const aiSocialAdjustment = aiModel?.socialModel
    ? predictAi(
      aiModel.socialModel,
      values.generalPracticeAccess,
      values.pharmacyAccess,
      values.earlyYearsPlaces,
    ) - predictAi(
      aiModel.socialModel,
      baseline.generalPracticeAccess,
      baseline.pharmacyAccess,
      baseline.earlyYearsPlaces,
    )
    : null

  const vulnerabilityAdjustment = aiVulnerabilityAdjustment === null
    ? ruleVulnerabilityAdjustment
    : (ruleVulnerabilityAdjustment * 0.4) + (aiVulnerabilityAdjustment * 0.6)
  const physicalHealthAdjustment = aiPhysicalHealthAdjustment === null
    ? rulePhysicalHealthAdjustment
    : (rulePhysicalHealthAdjustment * 0.4) + (aiPhysicalHealthAdjustment * 0.6)
  const socialAdjustment = aiSocialAdjustment === null
    ? ruleSocialAdjustment
    : (ruleSocialAdjustment * 0.4) + (aiSocialAdjustment * 0.6)

  const effectiveVulnerabilityAdjustment = vulnerabilityAdjustment > 0
    ? vulnerabilityAdjustment * contextMultiplier
    : vulnerabilityAdjustment
  const effectivePhysicalHealthAdjustment = physicalHealthAdjustment > 0
    ? physicalHealthAdjustment * contextMultiplier
    : physicalHealthAdjustment
  const effectiveSocialAdjustment = socialAdjustment > 0
    ? socialAdjustment * contextMultiplier
    : socialAdjustment

  const projectedVulnerability = clamp(
    baseline.vulnerability - effectiveVulnerabilityAdjustment,
    5,
    100,
  )

  const projectedPhysicalHealth = clamp(
    baseline.physicalHealth + effectivePhysicalHealthAdjustment,
    30,
    100,
  )
  const projectedSocialCompetence = clamp(
    baseline.socialCompetence + effectiveSocialAdjustment,
    30,
    100,
  )

  const careAccessDirection = generalPracticeIncrease + pharmacyIncrease + hospitalIncrease + earlyYearsIncrease > 0 ? 'Improves' : 'Lower access'
  const vulnerabilityDirection = projectedVulnerability < baseline.vulnerability ? 'Improves' : projectedVulnerability > baseline.vulnerability ? 'Higher risk' : 'No change'
  const physicalHealthDirection = projectedPhysicalHealth > baseline.physicalHealth ? 'Improves' : projectedPhysicalHealth < baseline.physicalHealth ? 'Lower outlook' : 'No change'
  const socialCompetenceDirection = projectedSocialCompetence > baseline.socialCompetence ? 'Improves' : projectedSocialCompetence < baseline.socialCompetence ? 'Lower outlook' : 'No change'
  const aiSummary = aiModel?.status === 'learned' && aiModel.vulnerabilityModel && aiModel.developmentModel && aiModel.socialModel
    ? `AI learned from ${Math.min(aiModel.vulnerabilityModel.sampleSize, aiModel.developmentModel.sampleSize, aiModel.socialModel.sampleSize)} localities across vulnerability, physical-health, and social-competence outcomes.`
    : 'AI fallback to rules for one or more outputs because model training data was incomplete.'
  const modelContext = `Care access ${baseline.serviceAccess.toFixed(1)} · Demand ${baseline.futureDemand.toFixed(1)} · Traffic ${baseline.trafficPressure.toFixed(1)} · Industrial ${baseline.industrialPressure.toFixed(1)} · Multiplier ${contextMultiplier.toFixed(2)}x`
  const insight = generalPracticeIncrease + pharmacyIncrease + hospitalIncrease + earlyYearsIncrease > 0
    ? 'Increasing primary-care, pharmacy, hospital, and early-years capacity produces stronger estimated physical-health and social-competence profiles with lower vulnerability.'
    : 'This scenario reduces local health-service capacity, increasing estimated vulnerability and weakening the physical-health outlook after context adjustment.'

  return {
    careAccessDirection,
    vulnerabilityDirection,
    generalPracticeAccess: values.generalPracticeAccess,
    baselineGeneralPracticeAccess: baseline.generalPracticeAccess,
    vulnerability: Number(projectedVulnerability.toFixed(1)),
    baselineVulnerability: baseline.vulnerability,
    physicalHealth: Number(projectedPhysicalHealth.toFixed(1)),
    baselinePhysicalHealth: baseline.physicalHealth,
    physicalHealthDirection,
    socialCompetence: Number(projectedSocialCompetence.toFixed(1)),
    socialCompetenceDirection,
    projectedChange: `${Number(baseline.vulnerability.toFixed(1))}% → ${Number(projectedVulnerability.toFixed(1))}%`,
    projectedPhysicalHealthChange: `${Number(baseline.physicalHealth.toFixed(1))} → ${Number(projectedPhysicalHealth.toFixed(1))}`,
    aiSummary,
    modelContext,
    insight,
  }
}

export default function SimulationPage({
  onHome,
  onInsight,
  onExploreMap,
  onSimulation,
  onHealth,
}: SimulationPageProps) {
  const [selectedNeighbourhood, setSelectedNeighbourhood] = useState('')
  const [selectedNeighbourhoodId, setSelectedNeighbourhoodId] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<SimulationBaseline | null>(null)
  const [scenarioValues, setScenarioValues] = useState<ScenarioValues>({
    generalPracticeAccess: 1.8,
    pharmacyAccess: 1.2,
    hospitalAccess: 0.4,
    earlyYearsPlaces: 85,
  })
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null)
  const [aiModel, setAiModel] = useState<AiSimulationModel | null>(null)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [insightExpanded, setInsightExpanded] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<SimulationUpdateStatus>('idle')
  const [showResults, setShowResults] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const autoRunPendingRef = useRef(false)

  const {
    search,
    setSearch,
    showSearchResults,
    setShowSearchResults,
    searchResults,
    searchLoading,
    searchError,
    handleSearchResultSelect,
    submitSearch,
  } = useNeighbourhoodSearch({
    onSelectResult: async (item) => {
      setSelectedNeighbourhood(item.name)
      setSelectedNeighbourhoodId(item.id)
      setSearch(item.name)
      await loadNeighbourhoodScenario(item.id, item.name)
    },
  })

  async function loadNeighbourhoodScenario(id: string, name: string) {
    setScenarioLoading(true)
    setUpdateStatus('updating')

    try {
      const [
        profileResponse,
        priorityResponse,
        explanationResponse,
        trafficResponse,
        industrialResponse,
        indicatorsResponse,
      ] = await Promise.all([
        api.getProfile(id),
        api.getPriority(id),
        api.getExplanation(id),
        api.getTrafficContext(id),
        api.getIndustrialEmissionsContext(id),
        api.getNeighbourhoodIndicators(),
      ])

      if (profileResponse.status !== 'available' && profileResponse.status !== 'limited') {
        throw new Error(profileResponse.limitations[0]?.message ?? 'The neighbourhood profile is unavailable.')
      }

      const neighbourhood = toNeighbourhood(
        profileResponse.data,
        priorityResponse.status === 'available' || priorityResponse.status === 'limited'
          ? priorityResponse.data
          : null,
        explanationResponse.status === 'available' || explanationResponse.status === 'limited'
          ? explanationResponse.data
          : null,
        {
          metadata: profileResponse.metadata,
          profileLimitations: profileResponse.limitations,
          profileNotices: profileResponse.notices,
          limitations: [profileResponse, priorityResponse, explanationResponse]
            .flatMap((response) => response.limitations)
            .map((item) => item.message),
          notices: [profileResponse, priorityResponse, explanationResponse]
            .flatMap((response) => response.notices)
            .map((item) => item.message)
            .filter(Boolean),
        },
        id,
        name,
      )

      const metricValue = (response: typeof trafficResponse | typeof industrialResponse, key: string): number | null => {
        if (response.status !== 'available' && response.status !== 'limited') {
          return null
        }
        const metric = response.data?.metrics?.[key]
        return metric && metric.status === 'available' && typeof metric.value === 'number' && Number.isFinite(metric.value)
          ? metric.value
          : null
      }

      const average = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null

      const trafficPressureComponents: number[] = []
      const highTrafficShare = metricValue(trafficResponse, 'high_traffic_road_share_pct')
      if (highTrafficShare !== null) {
        trafficPressureComponents.push(clamp(highTrafficShare, 0, 100))
      }
      const weightedAadt = metricValue(trafficResponse, 'length_weighted_aadt')
      if (weightedAadt !== null) {
        trafficPressureComponents.push(clamp((weightedAadt / 20000) * 100, 0, 100))
      }
      const heavyAadt = metricValue(trafficResponse, 'length_weighted_heavy_aadt')
      if (heavyAadt !== null) {
        trafficPressureComponents.push(clamp((heavyAadt / 2500) * 100, 0, 100))
      }
      const trafficPressure = average(trafficPressureComponents)

      const industrialPressureComponents: number[] = []
      const respiratoryFacilities = metricValue(industrialResponse, 'npi_respiratory_reporting_facilities')
      if (respiratoryFacilities !== null) {
        industrialPressureComponents.push(clamp(respiratoryFacilities * 20, 0, 100))
      }
      const nearestRespiratoryFacility = metricValue(industrialResponse, 'nearest_npi_respiratory_reporting_facility_km')
      if (nearestRespiratoryFacility !== null) {
        industrialPressureComponents.push(clamp((5 - nearestRespiratoryFacility) / 5 * 100, 0, 100))
      }
      const industrialPressure = average(industrialPressureComponents)

      const nextAiModel = (
        (indicatorsResponse.status === 'available' || indicatorsResponse.status === 'limited')
          ? buildAiModel(indicatorsResponse.data.neighbourhoods)
          : { vulnerabilityModel: null, developmentModel: null, socialModel: null, status: 'fallback' as const, notes: ['Map indicators unavailable for AI training'] }
      )
      setAiModel(nextAiModel)

      const selectedIndicators = (indicatorsResponse.status === 'available' || indicatorsResponse.status === 'limited')
        ? indicatorsResponse.data.neighbourhoods.find((item) => item.id === id)?.indicators ?? {}
        : {}
      const selectedIndicatorValue = (indicatorId: string, fallback: number) => metricNumber(selectedIndicators, indicatorId) ?? fallback

      const nextBaseline: SimulationBaseline = {
        id: neighbourhood.id,
        name: neighbourhood.name,
        generalPracticeAccess: clamp(selectedIndicatorValue('general_practice_access', 1.8), 0, 20),
        pharmacyAccess: clamp(selectedIndicatorValue('pharmacy_access', 1.2), 0, 20),
        hospitalAccess: clamp(selectedIndicatorValue('hospital_access', 0.4), 0, 20),
        earlyYearsPlaces: clamp(selectedIndicatorValue('approved_early_childhood_places', 85), 0, 300),
        physicalHealth: clamp(selectedIndicatorValue('aedc_physical_on_track', 68), 0, 100),
        socialCompetence: clamp(selectedIndicatorValue('aedc_social_on_track', 68), 0, 100),
        vulnerability: clamp(neighbourhood.developmentalVulnerability ?? 25, 0, 100),
        childDevelopment: clamp(neighbourhood.childDevelopmentScore ?? 68, 0, 100),
        serviceAccess: clamp(neighbourhood.serviceAccessScore ?? 50, 0, 100),
        futureDemand: clamp(neighbourhood.futureDemandScore ?? 50, 0, 100),
        trafficPressure: clamp(trafficPressure ?? 50, 0, 100),
        industrialPressure: clamp(industrialPressure ?? 50, 0, 100),
      }

      autoRunPendingRef.current = false
      setBaseline(nextBaseline)
      setScenarioValues({
        generalPracticeAccess: nextBaseline.generalPracticeAccess,
        pharmacyAccess: nextBaseline.pharmacyAccess,
        hospitalAccess: nextBaseline.hospitalAccess,
        earlyYearsPlaces: nextBaseline.earlyYearsPlaces,
      })
      setScenarioResult(buildScenarioResult(nextBaseline, {
        generalPracticeAccess: nextBaseline.generalPracticeAccess,
        pharmacyAccess: nextBaseline.pharmacyAccess,
        hospitalAccess: nextBaseline.hospitalAccess,
        earlyYearsPlaces: nextBaseline.earlyYearsPlaces,
      }, nextAiModel))
      setShowResults(true)
      setUpdateStatus('updated')
    } catch (error) {
      console.error('Failed to load simulation baseline:', error)
      setBaseline(null)
      setAiModel(null)
      setScenarioResult(null)
      setShowResults(false)
      setUpdateStatus('idle')
    } finally {
      setScenarioLoading(false)
    }
  }

  const handleSearchSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await submitSearch()
  }

  const runSimulation = useCallback(() => {
    autoRunPendingRef.current = false
    if (!baseline) {
      return
    }

    setScenarioResult(buildScenarioResult(baseline, scenarioValues, aiModel))
    setUpdateStatus('updated')
  }, [aiModel, baseline, scenarioValues])

  useEffect(() => {
    if (!baseline || !autoRunPendingRef.current) return
    const timer = window.setTimeout(() => {
      if (autoRunPendingRef.current) runSimulation()
    }, 350)
    return () => window.clearTimeout(timer)
  }, [baseline, runSimulation, scenarioValues])

  useEffect(() => {
    if (updateStatus !== 'updated') return
    const timer = window.setTimeout(() => setUpdateStatus('idle'), 1600)
    return () => window.clearTimeout(timer)
  }, [updateStatus])

  useEffect(() => {
    if (!showSearchResults) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!searchWrapRef.current?.contains(event.target as Node)) {
        setShowSearchResults(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSearchResults(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showSearchResults])

  const updateScenarioValue = (key: keyof ScenarioValues, value: number) => {
    autoRunPendingRef.current = true
    setShowResults(true)
    setUpdateStatus('updating')
    setScenarioValues((current) => ({ ...current, [key]: value }))
  }

  const comparisonMetrics: ComparisonMetric[] = baseline ? [
    {
      id: 'generalPractice',
      label: 'General practices',
      unit: '/10k',
      baseline: baseline.generalPracticeAccess,
      simulated: scenarioValues.generalPracticeAccess,
      max: 20,
      lowerIsBetter: false,
    },
    {
      id: 'pharmacy',
      label: 'Pharmacies',
      unit: '/10k',
      baseline: baseline.pharmacyAccess,
      simulated: scenarioValues.pharmacyAccess,
      max: 20,
      lowerIsBetter: false,
    },
    {
      id: 'hospital',
      label: 'Hospitals',
      unit: '/10k',
      baseline: baseline.hospitalAccess,
      simulated: scenarioValues.hospitalAccess,
      max: 20,
      lowerIsBetter: false,
    },
    {
      id: 'earlyYears',
      label: 'Approved early-years places',
      unit: '/1k',
      baseline: baseline.earlyYearsPlaces,
      simulated: scenarioValues.earlyYearsPlaces,
      max: 300,
      lowerIsBetter: false,
    },
    {
      id: 'vulnerability',
      label: 'Vulnerability',
      unit: '%',
      baseline: baseline.vulnerability,
      simulated: scenarioResult?.vulnerability ?? baseline.vulnerability,
      max: 100,
      lowerIsBetter: true,
    },
  ] : []

  const outcomeSummaries = baseline ? [
    { label: 'GP', ...outcomeDirection(baseline.generalPracticeAccess, scenarioValues.generalPracticeAccess) },
    { label: 'Pharmacy', ...outcomeDirection(baseline.pharmacyAccess, scenarioValues.pharmacyAccess) },
    { label: 'Vulnerability', ...outcomeDirection(baseline.vulnerability, scenarioResult?.vulnerability ?? baseline.vulnerability, true) },
    { label: 'Physical health', ...outcomeDirection(baseline.physicalHealth, scenarioResult?.physicalHealth ?? baseline.physicalHealth) },
    { label: 'Social competence', ...outcomeDirection(baseline.socialCompetence, scenarioResult?.socialCompetence ?? baseline.socialCompetence) },
  ] : []

  return (
    <div className="app-background simulation-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <BrandHeader
        activePage="simulation"
        onHome={onHome}
        onInsight={onInsight}
        onMap={onExploreMap}
        onSimulation={onSimulation}
        onHealth={onHealth}
      />

      <main className="simulation-shell simulation-main">
        <div className="simulation-header-row">
          <div className="simulation-title-copy">
            <div className="simulation-title-line">
              <h1>Simulation Engine</h1>
              <div className="simulation-page-info">
                <button type="button" aria-label="About the Simulation Engine">i</button>
                <div className="simulation-page-info-tooltip">
                  <strong>Adjust local care capacity and explore how outcomes may change.</strong>
                  <span>Planning estimate · Not a forecast</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`simulation-grid${baseline && showResults ? ' has-results' : ''}`}>
          <section className="simulation-panel simulation-builder-panel">
            <div className="scenario-heading">
              <h2>Build a Scenario</h2>
              <div className="method-info-wrap">
                <button type="button" className="method-info-trigger" aria-label="How the estimate is built">i</button>
                <div className="method-info-tooltip">
                  <h3>How the estimate is built</h3>
                  <ul>
                    <li>More general practices, pharmacies, and hospitals lower vulnerability.</li>
                    <li>More approved early-years places support physical-health outlook.</li>
                    <li>Higher care access amplifies expected gains; projected demand dampens gains.</li>
                    <li>Traffic and industrial context can further dampen estimated gains.</li>
                    <li>This is a planning comparison, not a year-by-year forecast.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="field-group">
              <label htmlFor="simulation-neighbourhood">Neighbourhood</label>
              <div className="simulation-search-wrap" ref={searchWrapRef}>
                <form
                  className="glass search-input-shell simulation-search-shell"
                  onSubmit={handleSearchSubmit}
                >
                  <input
                    id="simulation-neighbourhood"
                    type="search"
                    value={search}
                    placeholder={selectedNeighbourhood || 'Search neighbourhood'}
                    autoComplete="off"
                    onFocus={() => setShowSearchResults(true)}
                    onChange={(event) => {
                      const nextValue = event.target.value
                      setSearch(nextValue)
                      setShowSearchResults(true)
                    }}
                  />
                  <button
                    className="search-submit-button"
                    type="submit"
                    aria-label="Search neighbourhood"
                    disabled={searchLoading || scenarioLoading}
                  >
                    <span aria-hidden="true">⌕</span>
                  </button>
                </form>

                {showSearchResults && (
                  <div className="glass search-results simulation-search-results">
                    {searchLoading && (
                      <div className="search-state">Searching neighbourhoods…</div>
                    )}

                    {!searchLoading && searchResults.length > 0 && searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          void handleSearchResultSelect(item)
                        }}
                      >
                        <span>{item.name}</span>
                        <small>{item.geographic_unit}</small>
                      </button>
                    ))}

                    {!searchLoading && searchResults.length === 0 && (
                      <div className="search-state">{searchError ?? 'No neighbourhood found'}</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="field-group scenario-variables">
              <h3>Scenario Variables</h3>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>General practices</label>
                  <span>Current {baseline ? `${baseline.generalPracticeAccess.toFixed(2)}/10k` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.01"
                    value={scenarioValues.generalPracticeAccess}
                    onChange={(event) => updateScenarioValue('generalPracticeAccess', Number(event.target.value))}
                    aria-label="General practices per 10,000 residents"
                  />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>{scenarioValues.generalPracticeAccess.toFixed(2)}/10k</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>Pharmacies</label>
                  <span>Current {baseline ? `${baseline.pharmacyAccess.toFixed(2)}/10k` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.01"
                    value={scenarioValues.pharmacyAccess}
                    onChange={(event) => updateScenarioValue('pharmacyAccess', Number(event.target.value))}
                    aria-label="Pharmacies per 10,000 residents"
                  />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>{scenarioValues.pharmacyAccess.toFixed(2)}/10k</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>Approved early-years places</label>
                  <span>Current {baseline ? `${baseline.earlyYearsPlaces.toFixed(1)}/1k` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="300"
                    step="0.1"
                    value={scenarioValues.earlyYearsPlaces}
                    onChange={(event) => updateScenarioValue('earlyYearsPlaces', Number(event.target.value))}
                    aria-label="Approved early-years places per 1,000 children"
                  />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>{scenarioValues.earlyYearsPlaces.toFixed(1)}/1k</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label>Hospitals</label>
                  <span>Current {baseline ? `${baseline.hospitalAccess.toFixed(2)}/10k` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="0.01"
                    value={scenarioValues.hospitalAccess}
                    onChange={(event) => updateScenarioValue('hospitalAccess', Number(event.target.value))}
                    aria-label="Hospitals per 10,000 residents"
                  />
                  <div className="slider-meta">
                    <span>Proposed</span>
                    <strong>{scenarioValues.hospitalAccess.toFixed(2)}/10k</strong>
                  </div>
                </div>
              </div>
            </div>

            {showResults && <div className="action-row simulation-actions">
              <button type="button" className="button button-tertiary" onClick={() => setShowResults(false)}>Scenario only</button>
            </div>}
          </section>

          {baseline && showResults && <section className="simulation-panel simulation-results-panel">
            <div className="results-header">
              <h2>Simulation Results</h2>
              {updateStatus !== 'idle' && <span className={`simulation-update-status ${updateStatus}`}>
                {updateStatus === 'updating' ? 'Updating…' : '✓ Updated'}
              </span>}
            </div>

            <div className="outcome-summary-strip" aria-label="Outcome summary">
              {outcomeSummaries.map((item) => <div className={`outcome-summary-item ${item.tone}`} key={item.label}>
                <span>{item.label}</span>
                <b aria-hidden="true">{item.symbol}</b>
                <small>{item.status}</small>
              </div>)}
            </div>

            <div className="comparison-panel">
              <div className="comparison-header">
                <h3>Scenario Comparison</h3>
                <div className="comparison-legend">
                  <span>Baseline</span>
                  <span>Simulated</span>
                </div>
              </div>

              {!baseline && (
                <div className="comparison-empty">Select a neighbourhood to view a clear baseline vs simulated comparison.</div>
              )}

              {baseline && comparisonMetrics.map((metric) => {
                const direction = metricDirection(metric)
                const baselineWidth = clamp((metric.baseline / metric.max) * 100, 0, 100)
                const simulatedWidth = clamp((metric.simulated / metric.max) * 100, 0, 100)
                const deltaPrefix = direction.delta > 0 ? '+' : ''
                return (
                  <div className="comparison-row" key={metric.id} tabIndex={0}>
                    <div className="comparison-metric">
                      <span className="comparison-label">{metric.label}</span>
                      <span className="comparison-rule">{metric.lowerIsBetter ? 'Lower is better' : 'Higher is better'}</span>
                    </div>
                    <div className="comparison-track" role="img" aria-label={`${metric.label} baseline ${formatMetricValue(metric.baseline, metric.unit)} simulated ${formatMetricValue(metric.simulated, metric.unit)}`}>
                      <div className="comparison-track-fill baseline" style={{ width: `${baselineWidth}%` }} />
                      <div className="comparison-track-fill simulated" style={{ width: `${simulatedWidth}%` }} />
                    </div>
                    <div className="comparison-detail" role="tooltip">
                      <strong>{metric.label}</strong>
                      <dl>
                        <div><dt>Baseline</dt><dd>{formatMetricValue(metric.baseline, metric.unit)}</dd></div>
                        <div><dt>Simulated</dt><dd>{formatMetricValue(metric.simulated, metric.unit)}</dd></div>
                      </dl>
                      <span className={`comparison-delta ${direction.tone}`}>
                        {`${deltaPrefix}${direction.delta.toFixed(1)}${metric.unit} · ${direction.label}`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className={`insight-box${insightExpanded ? ' is-expanded' : ''}`}>
              <button
                type="button"
                className="insight-summary"
                aria-label={insightExpanded ? 'Hide Model Insight details' : 'Show Model Insight details'}
                aria-expanded={insightExpanded}
                onClick={() => setInsightExpanded((expanded) => !expanded)}
              >
                <span><strong>Model Insight</strong><small>Confidence: Medium</small></span>
                <i aria-hidden="true" />
              </button>
              {insightExpanded && <div className="insight-content">
                <p>{scenarioResult ? scenarioResult.insight : 'Select a neighbourhood and adjust the controls to update the scenario estimate.'}</p>
                <div className="insight-details">
                  <div className="projected-change secondary">
                    <span>Model context:</span>
                    <strong>{scenarioResult ? scenarioResult.modelContext : `${baseline.serviceAccess.toFixed(1)} · ${baseline.futureDemand.toFixed(1)}`}</strong>
                  </div>
                  <div className="projected-change secondary">
                    <span>AI model:</span>
                    <strong>{scenarioResult ? scenarioResult.aiSummary : 'Awaiting training data from neighbourhood indicators.'}</strong>
                  </div>
                  <div className="projected-change">
                    <span>Vulnerability change:</span>
                    <strong>{scenarioResult ? scenarioResult.projectedChange : `${baseline.vulnerability}% → ${baseline.vulnerability}%`}</strong>
                  </div>
                  <div className="projected-change secondary">
                    <span>Physical-health outlook:</span>
                    <strong>{scenarioResult ? scenarioResult.projectedPhysicalHealthChange : `${baseline.physicalHealth} → ${baseline.physicalHealth}`}</strong>
                  </div>
                </div>
              </div>}
            </div>

          </section>}
        </div>
      </main>
    </div>
  )
}
