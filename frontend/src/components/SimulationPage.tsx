import { useCallback, useEffect, useRef, useState } from 'react'

import BrandHeader from './BrandHeader'
import { useNeighbourhoodSearch } from '../hooks/useNeighbourhoodSearch'
import { api, type BoundaryFeature, type BoundaryGeometry } from '../services/api'

interface SimulationPageProps {
  onHome: () => void
  onInsight: () => void
  onExploreMap: () => void
  onSimulation: () => void
  onHealth: () => void
}

type EnvironmentFeature = 'treeCanopy' | 'urbanHeat' | 'openSpace' | 'trafficIntensity' | 'bushfireProneShare'

type EnvironmentValues = Record<EnvironmentFeature, number>

const ENVIRONMENT_FEATURES: EnvironmentFeature[] = [
  'treeCanopy',
  'urbanHeat',
  'openSpace',
  'trafficIntensity',
  'bushfireProneShare',
]

const ENVIRONMENT_FEATURE_LABELS: Record<EnvironmentFeature, string> = {
  treeCanopy: 'Tree canopy cover',
  urbanHeat: 'Urban heat-island intensity',
  openSpace: 'Public open space',
  trafficIntensity: 'Declared-road traffic intensity',
  bushfireProneShare: 'Bushfire-prone land share',
}

const ENVIRONMENT_FEATURE_SOURCES: Record<EnvironmentFeature, string> = {
  treeCanopy: 'Cooling and Greening Melbourne, 2018; SA2 aggregate',
  urbanHeat: 'Cooling and Greening Melbourne, 2018; SA2 aggregate',
  openSpace: 'VPA open-space data, 2018; SA2 aggregate',
  trafficIntensity: 'Victorian DTP declared-road AADT, 2019; road-volume proxy',
  bushfireProneShare: 'Victorian Bushfire Prone Area designation, June 2026',
}

const ENVIRONMENT_RADAR_AXES: Array<{ feature: EnvironmentFeature; label: string; lowerIsBetter: boolean }> = [
  { feature: 'treeCanopy', label: 'Canopy', lowerIsBetter: false },
  { feature: 'urbanHeat', label: 'Lower heat', lowerIsBetter: true },
  { feature: 'openSpace', label: 'Open space', lowerIsBetter: false },
  { feature: 'trafficIntensity', label: 'Lower traffic', lowerIsBetter: true },
  { feature: 'bushfireProneShare', label: 'Lower bushfire share', lowerIsBetter: true },
]

interface SimulationBaseline extends EnvironmentValues {
  id: string
  name: string
  physicalHealth: number | null
  socialCompetence: number | null
  vulnerability: number | null
}

type ScenarioValues = EnvironmentValues
type QuickPresetId = 'custom' | 'greener-streets' | 'traffic-calming' | 'more-open-space'

interface SavedScenario {
  id: string
  name: string
  neighbourhoodId: string
  neighbourhoodName: string
  values: ScenarioValues
  savedAt: string
}

const RESULTS_PAGES = ['Environment map', 'Outcomes', 'Comparison', 'Drivers']
const QUICK_PRESET_OPTIONS: Array<{ id: QuickPresetId; label: string }> = [
  { id: 'custom', label: 'Custom' },
  { id: 'greener-streets', label: 'Greener streets' },
  { id: 'traffic-calming', label: 'Traffic calming' },
  { id: 'more-open-space', label: 'More open space' },
]
const SAVED_SCENARIOS_STORAGE_KEY = 'kinderprint-simulation-scenarios'
const GREATER_MELBOURNE_BOUNDARY_BBOX = '144.0,-38.6,145.9,-37.2'
const MAP_FACTOR_COLORS = ['#b96361', '#d08e6d', '#d9bb70', '#92b49a', '#338b7b']
const MAP_WIDTH = 900
const MAP_HEIGHT = 500
const MAP_MAX_ZOOM = 12
const MAP_BASE_VIEW = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT }
type MapView = typeof MAP_BASE_VIEW

interface ScenarioResult {
  scenarioSupported: boolean
  predictionsAvailable: boolean
  nearestAnalogue: (AnalogueLocality & { distance: number }) | null
  factorContributions: Array<{
    feature: EnvironmentFeature
    vulnerability: number | null
    physicalHealth: number | null
    socialCompetence: number | null
  }>
  vulnerability: number | null
  vulnerabilityRange: OutcomeRange | null
  baselineVulnerability: number | null
  vulnerabilityUnavailableReason: string | null
  physicalHealth: number | null
  physicalHealthRange: OutcomeRange | null
  baselinePhysicalHealth: number | null
  physicalHealthUnavailableReason: string | null
  socialCompetence: number | null
  socialCompetenceRange: OutcomeRange | null
  baselineSocialCompetence: number | null
  socialCompetenceUnavailableReason: string | null
  modelSummary: string
  modelContext: string
  insight: string
}

interface OutcomeRange {
  low: number
  high: number
}

interface WaterfallStep {
  feature: EnvironmentFeature
  value: number | null
  start: number
  end: number
  favorable: boolean | null
}

interface OutcomeWaterfall {
  id: string
  label: string
  baseline: number
  scenario: number
  range: OutcomeRange | null
  steps: WaterfallStep[]
}

interface AnalogueLocality extends EnvironmentValues {
  id: string
  name: string
  geographicUnit: string
  physicalHealth: number | null
  socialCompetence: number | null
  vulnerability: number | null
}

interface AnalogueBoundaries {
  selected: BoundaryGeometry | null
  match: BoundaryGeometry | null
}

interface FactorMapShape {
  id: string
  name: string
  geographicUnit: string
  path: string
}

interface AiLinearModel {
  intercept: number
  featureMeans: EnvironmentValues
  featureScales: EnvironmentValues
  featureWeights: EnvironmentValues
  sampleSize: number
  sa3HeldOutR2: number | null
  sa3HeldOutMae: number | null
  sa3HeldOutResidualLow: number | null
  sa3HeldOutResidualHigh: number | null
}

interface AiSimulationModel {
  vulnerabilityModel: AiLinearModel | null
  developmentModel: AiLinearModel | null
  socialModel: AiLinearModel | null
  environmentRanges: Record<EnvironmentFeature, { min: number; max: number }> | null
  supportMeans: EnvironmentValues | null
  supportScales: EnvironmentValues | null
  supportSamples: EnvironmentValues[]
  jointSupportDistanceLimit: number | null
  observedLocalities: AnalogueLocality[]
  status: 'learned' | 'partial' | 'unavailable'
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

function radarPolygonPoints(scores: number[]) {
  const centerX = 180
  const centerY = 128
  const radius = 78
  return scores.map((score, index) => {
    const angle = (-Math.PI / 2) + ((index * Math.PI * 2) / ENVIRONMENT_RADAR_AXES.length)
    const pointRadius = radius * score
    return `${(centerX + (Math.cos(angle) * pointRadius)).toFixed(1)},${(centerY + (Math.sin(angle) * pointRadius)).toFixed(1)}`
  }).join(' ')
}

function environmentRadarScores(values: EnvironmentValues, ranges: Record<EnvironmentFeature, { min: number; max: number }>): number[] {
  return ENVIRONMENT_RADAR_AXES.map(({ feature, lowerIsBetter }) => {
    const range = ranges[feature]
    const span = range.max - range.min
    const observedPosition = span === 0 ? 0.5 : clamp((values[feature] - range.min) / span, 0, 1)
    return lowerIsBetter ? 1 - observedPosition : observedPosition
  })
}

type ComparisonMetric = {
  id: string
  label: string
  unit: string
  baseline: number | null
  simulated: number | null
  max: number
  lowerIsBetter: boolean
  unavailableReason?: string
  simulatedRange?: OutcomeRange | null
  showRange?: boolean
}

type SimulationUpdateStatus = 'idle' | 'updating' | 'updated'

function formatMetricValue(value: number, unit: string) {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k${unit}`
  return `${value.toFixed(1)}${unit}`
}

function renderReadoutValue(value: number | null, unit: string, fallback: string) {
  if (value === null) return <strong>{fallback}</strong>
  if (unit.trim().length <= 3) return <strong>{formatMetricValue(value, unit)}</strong>
  return <><strong>{formatMetricValue(value, '')}</strong><span className="comparison-readout-unit">{unit.trim()}</span></>
}

function formatContribution(value: number | null) {
  if (value === null) return 'Unavailable'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pp`
}

function createOutcomeWaterfall(
  id: string,
  label: string,
  baseline: number | null,
  scenario: number | null,
  range: OutcomeRange | null,
  contributions: ScenarioResult['factorContributions'],
  lowerIsBetter: boolean,
): OutcomeWaterfall | null {
  if (baseline === null || scenario === null) return null
  let cumulativeValue = baseline
  const steps = contributions.map((contribution): WaterfallStep => {
    const value = contribution[id as keyof typeof contribution] as number | null
    const start = cumulativeValue
    if (value !== null) cumulativeValue += value
    return {
      feature: contribution.feature,
      value,
      start,
      end: cumulativeValue,
      favorable: value === null ? null : lowerIsBetter ? value < 0 : value > 0,
    }
  })
  return { id, label, baseline, scenario, range, steps }
}

function formatScenarioOutcome(value: number | null, range: OutcomeRange | null) {
  if (value === null) return 'Unavailable'
  return range
    ? `${value.toFixed(1)}% (${range.low.toFixed(1)}–${range.high.toFixed(1)})`
    : `${value.toFixed(1)}%`
}

function formatEnvironmentValue(feature: EnvironmentFeature, value: number) {
  if (feature === 'urbanHeat') return `${value.toFixed(1)}°C`
  if (feature === 'trafficIntensity') return `${Math.round(value).toLocaleString()} AADT-road-km/km²`
  return `${value.toFixed(1)}%`
}

function metricDirection(metric: ComparisonMetric) {
  if (metric.baseline === null || metric.simulated === null) {
    return {
      delta: null,
      label: metric.unavailableReason ?? 'Estimate unavailable',
      tone: 'neutral' as const,
    }
  }
  const delta = metric.simulated - metric.baseline
  if (metric.simulatedRange !== undefined) {
    if (metric.simulatedRange === null) {
      return { delta, label: 'Validation unavailable', tone: 'neutral' as const }
    }
    if (metric.simulatedRange.low <= metric.baseline && metric.simulatedRange.high >= metric.baseline) {
      return { delta, label: 'Unclear within held-out range', tone: 'neutral' as const }
    }
    const improves = metric.lowerIsBetter
      ? metric.simulatedRange.high < metric.baseline
      : metric.simulatedRange.low > metric.baseline
    return {
      delta,
      label: improves ? 'Improves' : 'Worsens',
      tone: improves ? 'improves' as const : 'worsens' as const,
    }
  }
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
  if (Math.abs(delta) < 0.1) return { status: 'No change', tone: 'neutral' as const, symbol: '→' }
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

function createBoundaryPaths(geometries: Array<BoundaryGeometry | null>): string[] {
  const ringsByGeometry = geometries.map((geometry) => {
    if (!geometry) return []
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
    return polygons.map((polygon) => polygon[0])
  })
  const points = ringsByGeometry.flat(2).map((coordinate) => [coordinate[0], coordinate[1]] as [number, number])
  if (!points.length) return geometries.map(() => '')
  const minX = Math.min(...points.map(([x]) => x))
  const maxX = Math.max(...points.map(([x]) => x))
  const minY = Math.min(...points.map(([, y]) => y))
  const maxY = Math.max(...points.map(([, y]) => y))
  const width = 180
  const height = 120
  const padding = 8
  const scale = Math.min(
    (width - (padding * 2)) / Math.max(maxX - minX, 0.00001),
    (height - (padding * 2)) / Math.max(maxY - minY, 0.00001),
  )
  const offsetX = (width - ((maxX - minX) * scale)) / 2
  const offsetY = (height - ((maxY - minY) * scale)) / 2
  return ringsByGeometry.map((rings) => rings.map((ring) => ring.map(([x, y], index) => {
    const projectedX = offsetX + ((x - minX) * scale)
    const projectedY = height - offsetY - ((y - minY) * scale)
    return `${index === 0 ? 'M' : 'L'}${projectedX.toFixed(1)},${projectedY.toFixed(1)}`
  }).join(' ') + ' Z').join(' '))
}

function boundaryPositions(geometry: BoundaryGeometry): Array<[number, number]> {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.flatMap((polygon) => polygon.flatMap((ring) =>
    ring.map(([longitude, latitude]) => [longitude, latitude] as [number, number])))
}

function createFactorMapShapes(features: BoundaryFeature[]): FactorMapShape[] {
  const allPositions = features.flatMap((feature) => boundaryPositions(feature.geometry))
  if (allPositions.length === 0) return []
  const bounds = allPositions.reduce((current, [longitude, latitude]) => ({
    minX: Math.min(current.minX, longitude),
    maxX: Math.max(current.maxX, longitude),
    minY: Math.min(current.minY, latitude),
    maxY: Math.max(current.maxY, latitude),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity })
  const { minX, maxX, minY, maxY } = bounds
  const width = 900
  const height = 500
  const padding = 12
  const scale = Math.min(
    (width - padding * 2) / Math.max(maxX - minX, 0.00001),
    (height - padding * 2) / Math.max(maxY - minY, 0.00001),
  )
  const offsetX = (width - ((maxX - minX) * scale)) / 2
  const offsetY = (height - ((maxY - minY) * scale)) / 2
  return features.map((feature) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
    const path = polygons.flatMap((polygon) => polygon.map((ring) => ring.map(([longitude, latitude], index) => {
      const x = offsetX + ((longitude - minX) * scale)
      const y = height - offsetY - ((latitude - minY) * scale)
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    }).join(' ') + ' Z')).join(' ')
    return {
      id: String(feature.properties.id),
      name: feature.properties.name,
      geographicUnit: feature.properties.geographic_unit,
      path,
    }
  })
}

function factorMapColor(value: number | null, feature: EnvironmentFeature, range: { min: number; max: number } | undefined) {
  if (value === null || !range) return '#d7dfeb'
  const span = range.max - range.min
  const rawScore = span === 0 ? 0.5 : clamp((value - range.min) / span, 0, 1)
  const lowerIsBetter = ENVIRONMENT_RADAR_AXES.find((axis) => axis.feature === feature)?.lowerIsBetter ?? false
  const favorability = lowerIsBetter ? 1 - rawScore : rawScore
  const index = Math.min(MAP_FACTOR_COLORS.length - 1, Math.floor(favorability * MAP_FACTOR_COLORS.length))
  return MAP_FACTOR_COLORS[index]
}

function readSavedScenarios(): SavedScenario[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(SAVED_SCENARIOS_STORAGE_KEY) ?? '[]') as unknown
    if (!Array.isArray(stored)) return []
    return stored.filter((item): item is SavedScenario => Boolean(
      item && typeof item === 'object'
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.neighbourhoodId === 'string'
      && typeof item.neighbourhoodName === 'string'
      && item.values && typeof item.values === 'object'
      && ENVIRONMENT_FEATURES.every((feature) => Number.isFinite(item.values[feature]))
      && typeof item.savedAt === 'string',
    ))
  } catch {
    return []
  }
}

function quantile(values: number[], probability: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower))
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length
  const a = matrix.map((row, rowIndex) => [...row, vector[rowIndex]])
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

type EnvironmentSample = EnvironmentValues & { target: number; sa3Block: string }

function trainAiLinearModel(samples: EnvironmentSample[], validateBySa3 = true): AiLinearModel | null {
  if (samples.length < 24) {
    return null
  }
  const featureMeans = Object.fromEntries(ENVIRONMENT_FEATURES.map((feature) => [
    feature,
    samples.reduce((total, sample) => total + sample[feature], 0) / samples.length,
  ])) as EnvironmentValues
  const featureScales = Object.fromEntries(ENVIRONMENT_FEATURES.map((feature) => {
    const variance = samples.reduce((total, sample) => total + ((sample[feature] - featureMeans[feature]) ** 2), 0) / samples.length
    return [feature, Math.sqrt(variance) || 1]
  })) as EnvironmentValues
  const size = ENVIRONMENT_FEATURES.length + 1
  const xTx = Array.from({ length: size }, () => Array<number>(size).fill(0))
  const xTy = Array<number>(size).fill(0)
  const ridge = 0.08
  for (const sample of samples) {
    const features = [1, ...ENVIRONMENT_FEATURES.map((feature) =>
      (sample[feature] - featureMeans[feature]) / featureScales[feature])]
    for (let row = 0; row < size; row += 1) {
      xTy[row] += features[row] * sample.target
      for (let col = 0; col < size; col += 1) {
        xTx[row][col] += features[row] * features[col]
      }
    }
  }
  for (let idx = 1; idx < size; idx += 1) {
    xTx[idx][idx] += ridge
  }
  const coefficients = solveLinearSystem(xTx, xTy)
  if (!coefficients) {
    return null
  }
  const [intercept, ...weights] = coefficients
  const featureWeights = Object.fromEntries(ENVIRONMENT_FEATURES.map((feature, index) => [feature, weights[index]])) as EnvironmentValues
  const model: AiLinearModel = {
    intercept,
    featureMeans,
    featureScales,
    featureWeights,
    sampleSize: samples.length,
    sa3HeldOutR2: null,
    sa3HeldOutMae: null,
    sa3HeldOutResidualLow: null,
    sa3HeldOutResidualHigh: null,
  }
  if (!validateBySa3) return model

  const heldOutPredictions: Array<{ actual: number; predicted: number }> = []
  const sa3Blocks = [...new Set(samples.map((sample) => sample.sa3Block))]
  for (const sa3Block of sa3Blocks) {
    const trainingSamples = samples.filter((sample) => sample.sa3Block !== sa3Block)
    const heldOutSamples = samples.filter((sample) => sample.sa3Block === sa3Block)
    const foldModel = trainAiLinearModel(trainingSamples, false)
    if (!foldModel) continue
    for (const sample of heldOutSamples) {
      heldOutPredictions.push({ actual: sample.target, predicted: predictAi(foldModel, sample) })
    }
  }

  if (heldOutPredictions.length < 24) return model
  const residuals = heldOutPredictions.map(({ actual, predicted }) => actual - predicted)
  const actualMean = heldOutPredictions.reduce((total, item) => total + item.actual, 0) / heldOutPredictions.length
  const squaredError = heldOutPredictions.reduce((total, item) => total + ((item.actual - item.predicted) ** 2), 0)
  const totalVariance = heldOutPredictions.reduce((total, item) => total + ((item.actual - actualMean) ** 2), 0)
  return {
    ...model,
    sa3HeldOutR2: totalVariance > 0 ? 1 - (squaredError / totalVariance) : null,
    sa3HeldOutMae: residuals.reduce((total, residual) => total + Math.abs(residual), 0) / residuals.length,
    sa3HeldOutResidualLow: quantile(residuals, 0.1),
    sa3HeldOutResidualHigh: quantile(residuals, 0.9),
  }
}

function predictAi(model: AiLinearModel, values: ScenarioValues): number {
  return model.intercept + ENVIRONMENT_FEATURES.reduce((total, feature) =>
    total + (model.featureWeights[feature] * ((values[feature] - model.featureMeans[feature]) / model.featureScales[feature])), 0)
}

function buildAiModel(indicatorRows: Array<{ id: string; name?: string | null; geographic_unit: string; indicators: Record<string, { value: number | null; status: string }> }>): AiSimulationModel {
  const vulnerabilitySamples: EnvironmentSample[] = []
  const physicalHealthSamples: EnvironmentSample[] = []
  const socialSamples: EnvironmentSample[] = []
  const environmentSamples: EnvironmentValues[] = []
  const observedLocalities: AnalogueLocality[] = []

  for (const row of indicatorRows) {
    const treeCanopy = metricNumber(row.indicators, 'env_vegetation_cover')
    const urbanHeat = metricNumber(row.indicators, 'env_urban_heat')
    const openSpace = metricNumber(row.indicators, 'env_open_space_access')
    const trafficIntensity = metricNumber(row.indicators, 'env_declared_road_traffic_intensity')
    const bushfireProneShare = metricNumber(row.indicators, 'env_bushfire_prone_share_pct')
    if (treeCanopy === null || urbanHeat === null || openSpace === null || trafficIntensity === null || bushfireProneShare === null) {
      continue
    }
    const values: EnvironmentValues = { treeCanopy, urbanHeat, openSpace, trafficIntensity, bushfireProneShare }
    environmentSamples.push(values)
    const sa3Block = /^\d{9}$/.test(row.id) ? row.id.slice(0, 5) : row.id
    const sample = (target: number): EnvironmentSample => ({ ...values, target, sa3Block })
    const vulnerability = metricNumber(row.indicators, 'aedc_vulnerable_one_or_more')
    if (vulnerability !== null) {
      vulnerabilitySamples.push(sample(vulnerability))
    }
    const physicalHealth = metricNumber(row.indicators, 'aedc_physical_on_track')
    if (physicalHealth !== null) {
      physicalHealthSamples.push(sample(physicalHealth))
    }
    const socialCompetence = metricNumber(row.indicators, 'aedc_social_on_track')
    if (socialCompetence !== null) {
      socialSamples.push(sample(socialCompetence))
    }
    observedLocalities.push({
      id: row.id,
      name: row.name ?? row.id,
      geographicUnit: row.geographic_unit,
      ...values,
      physicalHealth,
      socialCompetence,
      vulnerability,
    })
  }

  const vulnerabilityModel = trainAiLinearModel(vulnerabilitySamples)
  const developmentModel = trainAiLinearModel(physicalHealthSamples)
  const socialModel = trainAiLinearModel(socialSamples)
  const availableModels = [vulnerabilityModel, developmentModel, socialModel].filter(Boolean).length
  const environmentRanges = Object.fromEntries(ENVIRONMENT_FEATURES.map((feature) => {
    const values = environmentSamples.map((sample) => sample[feature])
    return [feature, values.length ? { min: Math.min(...values), max: Math.max(...values) } : null]
  })) as Record<EnvironmentFeature, { min: number; max: number } | null>
  const hasRanges = ENVIRONMENT_FEATURES.every((feature) => environmentRanges[feature] !== null)
  const supportMeans = Object.fromEntries(ENVIRONMENT_FEATURES.map((feature) => [
    feature,
    environmentSamples.length
      ? environmentSamples.reduce((total, sample) => total + sample[feature], 0) / environmentSamples.length
      : 0,
  ])) as EnvironmentValues
  const supportScales = Object.fromEntries(ENVIRONMENT_FEATURES.map((feature) => {
    const variance = environmentSamples.length
      ? environmentSamples.reduce((total, sample) => total + ((sample[feature] - supportMeans[feature]) ** 2), 0) / environmentSamples.length
      : 0
    return [feature, Math.sqrt(variance) || 1]
  })) as EnvironmentValues
  const distance = (first: EnvironmentValues, second: EnvironmentValues) => Math.sqrt(
    ENVIRONMENT_FEATURES.reduce((total, feature) =>
      total + (((first[feature] - second[feature]) / supportScales[feature]) ** 2), 0),
  )
  const nearestNeighbourDistances = environmentSamples.map((sample, index) => {
    const distances = environmentSamples
      .filter((_, candidateIndex) => candidateIndex !== index)
      .map((candidate) => distance(sample, candidate))
    return distances.length ? Math.min(...distances) : null
  }).filter((value): value is number => value !== null)
  return {
    vulnerabilityModel,
    developmentModel,
    socialModel,
    environmentRanges: hasRanges
      ? environmentRanges as Record<EnvironmentFeature, { min: number; max: number }>
      : null,
    supportMeans: environmentSamples.length ? supportMeans : null,
    supportScales: environmentSamples.length ? supportScales : null,
    supportSamples: environmentSamples,
    jointSupportDistanceLimit: quantile(nearestNeighbourDistances, 0.95),
    observedLocalities,
    status: availableModels === 3 ? 'learned' : availableModels > 0 ? 'partial' : 'unavailable',
  }
}

function buildScenarioResult(
  baseline: SimulationBaseline,
  values: ScenarioValues,
  aiModel: AiSimulationModel | null,
): ScenarioResult {
  const ranges = aiModel?.environmentRanges
  const isWithinObservedRange = (valuesToCheck: ScenarioValues) => ranges !== null && ranges !== undefined
    && ENVIRONMENT_FEATURES.every((feature) =>
      valuesToCheck[feature] >= ranges[feature].min && valuesToCheck[feature] <= ranges[feature].max)
  const isWithinJointSupport = (valuesToCheck: ScenarioValues) => {
    if (!aiModel?.supportMeans || !aiModel.supportScales || aiModel.jointSupportDistanceLimit === null) return false
    const nearestDistance = Math.min(...aiModel.supportSamples.map((sample) => Math.sqrt(
      ENVIRONMENT_FEATURES.reduce((total, feature) =>
        total + (((valuesToCheck[feature] - sample[feature]) / aiModel.supportScales![feature]) ** 2), 0),
    )))
    return Number.isFinite(nearestDistance) && nearestDistance <= aiModel.jointSupportDistanceLimit
  }
  const baselineValues: ScenarioValues = {
    treeCanopy: baseline.treeCanopy,
    urbanHeat: baseline.urbanHeat,
    openSpace: baseline.openSpace,
    trafficIntensity: baseline.trafficIntensity,
    bushfireProneShare: baseline.bushfireProneShare,
  }
  const predictionsAvailable = isWithinObservedRange(values) && isWithinObservedRange(baselineValues)
  const isScenarioSupported = predictionsAvailable
    && isWithinJointSupport(values) && isWithinJointSupport(baselineValues)
  const nearestAnalogue = aiModel?.supportScales
    ? aiModel.observedLocalities
      .filter((locality) => locality.id !== baseline.id)
      .map((locality) => ({
        ...locality,
        distance: Math.sqrt(ENVIRONMENT_FEATURES.reduce((total, feature) =>
          total + (((values[feature] - locality[feature]) / aiModel.supportScales![feature]) ** 2), 0)),
      }))
      .sort((left, right) => left.distance - right.distance)[0] ?? null
    : null
  const predictChange = (model: AiLinearModel | null, current: number | null) => model && current !== null && predictionsAvailable
    ? Number(clamp(current + predictAi(model, values) - predictAi(model, baselineValues), 0, 100).toFixed(1))
    : null
  const projectedVulnerability = predictChange(aiModel?.vulnerabilityModel ?? null, baseline.vulnerability)
  const projectedPhysicalHealth = predictChange(aiModel?.developmentModel ?? null, baseline.physicalHealth)
  const projectedSocialCompetence = predictChange(aiModel?.socialModel ?? null, baseline.socialCompetence)
  const featureContribution = (model: AiLinearModel | null, feature: EnvironmentFeature) =>
    model && predictionsAvailable
      ? Number((model.featureWeights[feature] * ((values[feature] - baselineValues[feature]) / model.featureScales[feature])).toFixed(1))
      : null
  const factorContributions = ENVIRONMENT_FEATURES.map((feature) => ({
    feature,
    vulnerability: featureContribution(aiModel?.vulnerabilityModel ?? null, feature),
    physicalHealth: featureContribution(aiModel?.developmentModel ?? null, feature),
    socialCompetence: featureContribution(aiModel?.socialModel ?? null, feature),
  }))
  const trainedModels = [aiModel?.vulnerabilityModel, aiModel?.developmentModel, aiModel?.socialModel].filter(Boolean) as AiLinearModel[]
  const sampleSize = trainedModels.length ? Math.min(...trainedModels.map((model) => model.sampleSize)) : 0
  const modelSummary = sampleSize
    ? `Models use leave-one-SA3-out validation. Held-out MAE (percentage points): vulnerability ${aiModel?.vulnerabilityModel?.sa3HeldOutMae?.toFixed(1) ?? 'unavailable'}, physical health ${aiModel?.developmentModel?.sa3HeldOutMae?.toFixed(1) ?? 'unavailable'}, social competence ${aiModel?.socialModel?.sa3HeldOutMae?.toFixed(1) ?? 'unavailable'}.`
    : 'Insufficient comparable locality data to estimate child-development outcomes.'
  const modelContext = 'Area-level cross-sectional associations · Not a causal or clinical prediction'
  const insight = sampleSize
    ? 'The scenario shows how area-level AEDC outcomes vary with these environmental indicators in the available data. Changing a slider does not predict that changing the environment will cause the displayed health change.'
    : 'Child-development estimates are unavailable because comparable environmental and AEDC data are insufficient for this locality set.'

  const unavailableReason = (current: number | null, model: AiLinearModel | null) => current === null
    ? 'Baseline AEDC outcome unavailable'
    : !predictionsAvailable
      ? 'Outside observed single-factor ranges'
      : !model
        ? 'Insufficient comparable AEDC data'
        : null
  const rangeFor = (estimate: number | null, model: AiLinearModel | null): OutcomeRange | null => {
    if (estimate === null || model?.sa3HeldOutResidualLow === null || model?.sa3HeldOutResidualHigh === null
      || model?.sa3HeldOutResidualLow === undefined || model?.sa3HeldOutResidualHigh === undefined) return null
    return {
      low: clamp(estimate + model.sa3HeldOutResidualLow, 0, 100),
      high: clamp(estimate + model.sa3HeldOutResidualHigh, 0, 100),
    }
  }

  return {
    scenarioSupported: isScenarioSupported,
    predictionsAvailable,
    nearestAnalogue,
    factorContributions,
    vulnerability: projectedVulnerability,
    vulnerabilityRange: rangeFor(projectedVulnerability, aiModel?.vulnerabilityModel ?? null),
    baselineVulnerability: baseline.vulnerability,
    vulnerabilityUnavailableReason: unavailableReason(baseline.vulnerability, aiModel?.vulnerabilityModel ?? null),
    physicalHealth: projectedPhysicalHealth,
    physicalHealthRange: rangeFor(projectedPhysicalHealth, aiModel?.developmentModel ?? null),
    baselinePhysicalHealth: baseline.physicalHealth,
    physicalHealthUnavailableReason: unavailableReason(baseline.physicalHealth, aiModel?.developmentModel ?? null),
    socialCompetence: projectedSocialCompetence,
    socialCompetenceRange: rangeFor(projectedSocialCompetence, aiModel?.socialModel ?? null),
    baselineSocialCompetence: baseline.socialCompetence,
    socialCompetenceUnavailableReason: unavailableReason(baseline.socialCompetence, aiModel?.socialModel ?? null),
    modelSummary,
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
  const [baseline, setBaseline] = useState<SimulationBaseline | null>(null)
  const [scenarioValues, setScenarioValues] = useState<ScenarioValues>({
    treeCanopy: 0,
    urbanHeat: 0,
    openSpace: 0,
    trafficIntensity: 0,
    bushfireProneShare: 0,
  })
  const [quickPreset, setQuickPreset] = useState<QuickPresetId>('custom')
  const [scenarioName, setScenarioName] = useState('')
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>(readSavedScenarios)
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null)
  const [analogueBoundaries, setAnalogueBoundaries] = useState<AnalogueBoundaries>({ selected: null, match: null })
  const [factorMapShapes, setFactorMapShapes] = useState<FactorMapShape[]>([])
  const [factorMapStatus, setFactorMapStatus] = useState<'loading' | 'available' | 'unavailable'>('loading')
  const [mapFactor, setMapFactor] = useState<EnvironmentFeature>('treeCanopy')
  const [mapFactorOpen, setMapFactorOpen] = useState(false)
  const mapFactorWrapRef = useRef<HTMLDivElement>(null)
  const [mapView, setMapView] = useState<MapView>(MAP_BASE_VIEW)
  const mapSvgRef = useRef<SVGSVGElement>(null)
  const mapDraggedRef = useRef(false)
  const [isPlayingScenario, setIsPlayingScenario] = useState(false)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [aiModel, setAiModel] = useState<AiSimulationModel | null>(null)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [insightExpanded, setInsightExpanded] = useState(false)
  const [resultsPage, setResultsPage] = useState(0)
  const [updateStatus, setUpdateStatus] = useState<SimulationUpdateStatus>('idle')
  const [showResults, setShowResults] = useState(false)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const searchWrapRef = useRef<HTMLDivElement>(null)
  const presetWrapRef = useRef<HTMLDivElement>(null)
  const [presetOpen, setPresetOpen] = useState(false)
  const autoRunPendingRef = useRef(false)
  const playbackFrameRef = useRef<number | null>(null)
  const playbackTargetRef = useRef<ScenarioValues | null>(null)

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
      setSearch(item.name)
      await loadNeighbourhoodScenario(item.id, item.name)
    },
  })

  const cancelScenarioPlayback = (skipToEnd = false) => {
    if (playbackFrameRef.current !== null) {
      window.cancelAnimationFrame(playbackFrameRef.current)
      playbackFrameRef.current = null
    }
    const target = playbackTargetRef.current
    playbackTargetRef.current = null
    setIsPlayingScenario(false)
    if (skipToEnd && baseline && aiModel && target) {
      setScenarioValues(target)
      setScenarioResult(buildScenarioResult(baseline, target, aiModel))
      setPlaybackProgress(1)
      setUpdateStatus('updated')
    } else {
      setPlaybackProgress(0)
    }
  }

  async function loadNeighbourhoodScenario(id: string, name: string) {
    cancelScenarioPlayback()
    setScenarioLoading(true)
    setScenarioError(null)
    setUpdateStatus('updating')

    try {
      const indicatorsResponse = await api.getNeighbourhoodIndicators()
      if (indicatorsResponse.status !== 'available' && indicatorsResponse.status !== 'limited') {
        throw new Error(indicatorsResponse.limitations[0]?.message ?? 'Neighbourhood indicators are unavailable.')
      }
      const selectedIndicators = indicatorsResponse.data.neighbourhoods.find((item) => item.id === id)?.indicators
      if (!selectedIndicators) {
        throw new Error('No approved indicators are available for this neighbourhood.')
      }
      const selectedIndicatorValue = (indicatorId: string) => {
        return metricNumber(selectedIndicators, indicatorId)
      }
      const requiredEnvironmentValue = (indicatorId: string) => {
        const value = selectedIndicatorValue(indicatorId)
        if (value === null) throw new Error(`The approved ${indicatorId.replace(/_/g, ' ')} indicator is unavailable.`)
        return value
      }

      const nextBaseline: SimulationBaseline = {
        id,
        name,
        treeCanopy: clamp(requiredEnvironmentValue('env_vegetation_cover'), 0, 100),
        urbanHeat: clamp(requiredEnvironmentValue('env_urban_heat'), 0, 20),
        openSpace: clamp(requiredEnvironmentValue('env_open_space_access'), 0, 100),
        trafficIntensity: requiredEnvironmentValue('env_declared_road_traffic_intensity'),
        bushfireProneShare: clamp(requiredEnvironmentValue('env_bushfire_prone_share_pct'), 0, 100),
        physicalHealth: selectedIndicatorValue('aedc_physical_on_track'),
        socialCompetence: selectedIndicatorValue('aedc_social_on_track'),
        vulnerability: selectedIndicatorValue('aedc_vulnerable_one_or_more'),
      }
      const nextAiModel = buildAiModel(indicatorsResponse.data.neighbourhoods)

      autoRunPendingRef.current = false
      setBaseline(nextBaseline)
      setAiModel(nextAiModel)
      setScenarioValues({
        treeCanopy: nextBaseline.treeCanopy,
        urbanHeat: nextBaseline.urbanHeat,
        openSpace: nextBaseline.openSpace,
        trafficIntensity: nextBaseline.trafficIntensity,
        bushfireProneShare: nextBaseline.bushfireProneShare,
      })
      setQuickPreset('custom')
      setScenarioResult(buildScenarioResult(nextBaseline, {
        treeCanopy: nextBaseline.treeCanopy,
        urbanHeat: nextBaseline.urbanHeat,
        openSpace: nextBaseline.openSpace,
        trafficIntensity: nextBaseline.trafficIntensity,
        bushfireProneShare: nextBaseline.bushfireProneShare,
      }, nextAiModel))
      setShowResults(true)
      setUpdateStatus('updated')
    } catch (error) {
      console.error('Failed to load simulation baseline:', error)
      setScenarioError(error instanceof Error ? error.message : 'The neighbourhood scenario could not be loaded.')
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

  const clampMapView = (view: MapView): MapView => ({
    ...view,
    x: clamp(view.x, 0, MAP_WIDTH - view.w),
    y: clamp(view.y, 0, MAP_HEIGHT - view.h),
  })

  // Zooms around a point given as fractions (0-1) of the current viewport.
  const zoomMap = (factor: number, fractionX = 0.5, fractionY = 0.5) => {
    setMapView((view) => {
      const width = clamp(view.w / factor, MAP_WIDTH / MAP_MAX_ZOOM, MAP_WIDTH)
      const height = (width * MAP_HEIGHT) / MAP_WIDTH
      return clampMapView({
        x: view.x + (fractionX * view.w) - (fractionX * width),
        y: view.y + (fractionY * view.h) - (fractionY * height),
        w: width,
        h: height,
      })
    })
  }

  const zoomMapToSelected = () => {
    const shape = factorMapShapes.find((item) => item.id === baseline?.id)
    if (!shape) return
    const numbers = [...shape.path.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map((match) => [Number(match[1]), Number(match[2])])
    if (numbers.length === 0) return
    const xs = numbers.map(([x]) => x)
    const ys = numbers.map(([, y]) => y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const width = clamp(Math.max((maxX - minX) * 3, ((maxY - minY) * 3 * MAP_WIDTH) / MAP_HEIGHT), MAP_WIDTH / MAP_MAX_ZOOM, MAP_WIDTH)
    const height = (width * MAP_HEIGHT) / MAP_WIDTH
    setMapView(clampMapView({
      x: ((minX + maxX) / 2) - (width / 2),
      y: ((minY + maxY) / 2) - (height / 2),
      w: width,
      h: height,
    }))
  }

  const handleMapPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    mapDraggedRef.current = false
    const svg = mapSvgRef.current
    const scale = svg?.getScreenCTM()?.a
    if (!svg || !scale || mapView.w >= MAP_WIDTH) return
    const start = { x: event.clientX, y: event.clientY, view: mapView }
    const handleMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - start.x
      const dy = moveEvent.clientY - start.y
      if (Math.hypot(dx, dy) > 4) mapDraggedRef.current = true
      if (!mapDraggedRef.current) return
      setMapView(clampMapView({ ...start.view, x: start.view.x - (dx / scale), y: start.view.y - (dy / scale) }))
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  useEffect(() => {
    const svg = mapSvgRef.current
    if (!svg) return
    // Wheel zoom needs ctrl/cmd (also sent by trackpad pinch) so normal page scrolling still works.
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const matrix = svg.getScreenCTM()
      if (!matrix) return
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      setMapView((view) => {
        const width = clamp(view.w * Math.exp(event.deltaY * 0.01), MAP_WIDTH / MAP_MAX_ZOOM, MAP_WIDTH)
        const height = (width * MAP_HEIGHT) / MAP_WIDTH
        const fractionX = (point.x - view.x) / view.w
        const fractionY = (point.y - view.y) / view.h
        return clampMapView({
          x: point.x - (fractionX * width),
          y: point.y - (fractionY * height),
          w: width,
          h: height,
        })
      })
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [factorMapStatus, resultsPage, showResults, baseline])

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

  useEffect(() => () => {
    if (playbackFrameRef.current !== null) window.cancelAnimationFrame(playbackFrameRef.current)
    playbackTargetRef.current = null
  }, [])

  const nearestAnalogueId = scenarioResult?.nearestAnalogue?.id ?? null
  useEffect(() => {
    if (!baseline || !nearestAnalogueId) {
      setAnalogueBoundaries({ selected: null, match: null })
      return
    }
    let cancelled = false
    setAnalogueBoundaries({ selected: null, match: null })
    Promise.all([api.getBoundary(baseline.id), api.getBoundary(nearestAnalogueId)])
      .then(([selectedResponse, matchResponse]) => {
        if (cancelled) return
        setAnalogueBoundaries({
          selected: selectedResponse.status === 'available' || selectedResponse.status === 'limited'
            ? selectedResponse.data.geometry
            : null,
          match: matchResponse.status === 'available' || matchResponse.status === 'limited'
            ? matchResponse.data.geometry
            : null,
        })
      })
      .catch(() => {
        if (!cancelled) setAnalogueBoundaries({ selected: null, match: null })
      })
    return () => { cancelled = true }
  }, [baseline?.id, nearestAnalogueId])

  useEffect(() => {
    let cancelled = false
    api.getBoundaries(GREATER_MELBOURNE_BOUNDARY_BBOX)
      .then((response) => {
        if (cancelled) return
        if (response.status === 'available' || response.status === 'limited') {
          setFactorMapShapes(createFactorMapShapes(response.data.features))
          setFactorMapStatus('available')
        } else {
          setFactorMapStatus('unavailable')
        }
      })
      .catch(() => {
        if (!cancelled) setFactorMapStatus('unavailable')
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!mapFactorOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!mapFactorWrapRef.current?.contains(event.target as Node)) setMapFactorOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMapFactorOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [mapFactorOpen])

  useEffect(() => {
    if (!presetOpen) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!presetWrapRef.current?.contains(event.target as Node)) setPresetOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPresetOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [presetOpen])

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
    cancelScenarioPlayback()
    autoRunPendingRef.current = true
    setShowResults(true)
    setUpdateStatus('updating')
    setQuickPreset('custom')
    setScenarioValues((current) => ({ ...current, [key]: value }))
  }

  const playScenario = () => {
    if (!baseline || !aiModel) return
    if (isPlayingScenario) {
      cancelScenarioPlayback(true)
      return
    }
    if (playbackFrameRef.current !== null) window.cancelAnimationFrame(playbackFrameRef.current)
    const target: ScenarioValues = { ...scenarioValues }
    const start: ScenarioValues = {
      treeCanopy: baseline.treeCanopy,
      urbanHeat: baseline.urbanHeat,
      openSpace: baseline.openSpace,
      trafficIntensity: baseline.trafficIntensity,
      bushfireProneShare: baseline.bushfireProneShare,
    }
    if (ENVIRONMENT_FEATURES.every((feature) => Math.abs(target[feature] - start[feature]) < 0.01)) return
    autoRunPendingRef.current = false
    playbackTargetRef.current = target
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setScenarioValues(target)
      setScenarioResult(buildScenarioResult(baseline, target, aiModel))
      setPlaybackProgress(1)
      setUpdateStatus('updated')
      return
    }
    setIsPlayingScenario(true)
    setPlaybackProgress(0)
    setScenarioValues(start)
    setScenarioResult(buildScenarioResult(baseline, start, aiModel))
    setUpdateStatus('updating')
    let startTime: number | null = null
    let lastRenderTime = 0
    const duration = 1700
    const animate = (time: number) => {
      if (playbackTargetRef.current === null) return
      if (startTime === null) startTime = time
      const linearProgress = clamp((time - startTime) / duration, 0, 1)
      const easedProgress = 1 - ((1 - linearProgress) ** 3)
      if (time - lastRenderTime >= 64 || linearProgress === 1) {
        const values = Object.fromEntries(ENVIRONMENT_FEATURES.map((feature) => [
          feature,
          start[feature] + ((target[feature] - start[feature]) * easedProgress),
        ])) as ScenarioValues
        setScenarioValues(values)
        setScenarioResult(buildScenarioResult(baseline, values, aiModel))
        setPlaybackProgress(linearProgress)
        lastRenderTime = time
      }
      if (linearProgress < 1) {
        playbackFrameRef.current = window.requestAnimationFrame(animate)
      } else {
        playbackFrameRef.current = null
        playbackTargetRef.current = null
        setIsPlayingScenario(false)
        setUpdateStatus('updated')
      }
    }
    playbackFrameRef.current = window.requestAnimationFrame(animate)
  }

  const applyQuickPreset = (preset: QuickPresetId) => {
    cancelScenarioPlayback()
    setQuickPreset(preset)
    if (!baseline || preset === 'custom') return
    const ranges = aiModel?.environmentRanges
    const bounded = (feature: EnvironmentFeature, value: number) => clamp(
      value,
      ranges?.[feature].min ?? 0,
      ranges?.[feature].max ?? (feature === 'trafficIntensity' ? 100000 : 100),
    )
    const nextValues: ScenarioValues = { ...baseline }
    if (preset === 'greener-streets') {
      nextValues.treeCanopy = bounded('treeCanopy', baseline.treeCanopy + 8)
      nextValues.openSpace = bounded('openSpace', baseline.openSpace + 5)
      nextValues.urbanHeat = bounded('urbanHeat', baseline.urbanHeat - 1)
    } else if (preset === 'traffic-calming') {
      nextValues.trafficIntensity = bounded('trafficIntensity', baseline.trafficIntensity * 0.8)
    } else if (preset === 'more-open-space') {
      nextValues.openSpace = bounded('openSpace', baseline.openSpace + 10)
      nextValues.treeCanopy = bounded('treeCanopy', baseline.treeCanopy + 3)
      nextValues.urbanHeat = bounded('urbanHeat', baseline.urbanHeat - 0.5)
    }
    autoRunPendingRef.current = true
    setShowResults(true)
    setUpdateStatus('updating')
    setScenarioValues(nextValues)
  }

  const resetScenario = () => {
    if (!baseline) return
    cancelScenarioPlayback()
    autoRunPendingRef.current = true
    setQuickPreset('custom')
    setScenarioValues({
      treeCanopy: baseline.treeCanopy,
      urbanHeat: baseline.urbanHeat,
      openSpace: baseline.openSpace,
      trafficIntensity: baseline.trafficIntensity,
      bushfireProneShare: baseline.bushfireProneShare,
    })
    setUpdateStatus('updating')
  }

  const saveScenario = () => {
    if (!baseline) return
    const localityScenarios = savedScenarios.filter((scenario) => scenario.neighbourhoodId === baseline.id)
    const nextScenario: SavedScenario = {
      id: `${baseline.id}-${Date.now()}`,
      name: scenarioName.trim() || `Scenario ${localityScenarios.length + 1}`,
      neighbourhoodId: baseline.id,
      neighbourhoodName: baseline.name,
      values: { ...scenarioValues },
      savedAt: new Date().toISOString(),
    }
    setSavedScenarios((current) => [
      ...current.filter((scenario) => scenario.neighbourhoodId !== baseline.id),
      ...[...localityScenarios, nextScenario].slice(-3),
    ].slice(-12))
    setScenarioName('')
  }

  const loadSavedScenario = (scenario: SavedScenario) => {
    cancelScenarioPlayback()
    autoRunPendingRef.current = true
    setScenarioValues({ ...scenario.values })
    setQuickPreset('custom')
    setScenarioName(scenario.name)
    setShowResults(true)
    setUpdateStatus('updating')
  }

  const deleteSavedScenario = (scenarioId: string) => {
    const deletedScenario = savedScenarios.find((scenario) => scenario.id === scenarioId)
    if (deletedScenario?.name === scenarioName) setScenarioName('')
    setSavedScenarios((current) => current.filter((scenario) => scenario.id !== scenarioId))
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(SAVED_SCENARIOS_STORAGE_KEY, JSON.stringify(savedScenarios))
    } catch {
      setScenarioError('Saved scenarios could not be stored in this browser.')
    }
  }, [savedScenarios])

  const comparisonMetrics: ComparisonMetric[] = baseline ? [
    {
      id: 'treeCanopy',
      label: 'Tree canopy cover',
      unit: '%',
      baseline: baseline.treeCanopy,
      simulated: scenarioValues.treeCanopy,
      max: aiModel?.environmentRanges?.treeCanopy.max ?? 100,
      lowerIsBetter: false,
    },
    {
      id: 'urbanHeat',
      label: 'Urban heat-island intensity',
      unit: '°C',
      baseline: baseline.urbanHeat,
      simulated: scenarioValues.urbanHeat,
      max: aiModel?.environmentRanges?.urbanHeat.max ?? 20,
      lowerIsBetter: true,
    },
    {
      id: 'openSpace',
      label: 'Public open space',
      unit: '%',
      baseline: baseline.openSpace,
      simulated: scenarioValues.openSpace,
      max: aiModel?.environmentRanges?.openSpace.max ?? 100,
      lowerIsBetter: false,
    },
    {
      id: 'trafficIntensity',
      label: 'Declared-road traffic intensity',
      unit: ' AADT-road-km/km²',
      baseline: baseline.trafficIntensity,
      simulated: scenarioValues.trafficIntensity,
      max: aiModel?.environmentRanges?.trafficIntensity.max ?? baseline.trafficIntensity,
      lowerIsBetter: true,
    },
    {
      id: 'bushfireProneShare',
      label: 'Bushfire-prone land share',
      unit: '%',
      baseline: baseline.bushfireProneShare,
      simulated: scenarioValues.bushfireProneShare,
      max: aiModel?.environmentRanges?.bushfireProneShare.max ?? 100,
      lowerIsBetter: true,
    },
    {
      id: 'vulnerability',
      label: 'Developmentally vulnerable on one or more domains',
      unit: '%',
      baseline: baseline.vulnerability,
      simulated: scenarioResult?.vulnerability ?? null,
      simulatedRange: scenarioResult?.vulnerabilityRange,
      showRange: true,
      max: 100,
      lowerIsBetter: true,
      unavailableReason: scenarioResult?.vulnerabilityUnavailableReason ?? 'Estimate pending',
    },
    {
      id: 'physicalHealth', label: 'Physical health and wellbeing on track', unit: '%',
      baseline: baseline.physicalHealth, simulated: scenarioResult?.physicalHealth ?? null, max: 100, lowerIsBetter: false,
      simulatedRange: scenarioResult?.physicalHealthRange,
      showRange: true,
      unavailableReason: scenarioResult?.physicalHealthUnavailableReason ?? 'Estimate pending',
    },
    {
      id: 'socialCompetence', label: 'Social competence on track', unit: '%',
      baseline: baseline.socialCompetence, simulated: scenarioResult?.socialCompetence ?? null, max: 100, lowerIsBetter: false,
      simulatedRange: scenarioResult?.socialCompetenceRange,
      showRange: true,
      unavailableReason: scenarioResult?.socialCompetenceUnavailableReason ?? 'Estimate pending',
    },
  ] : []
  const hasScenarioChanges = Boolean(baseline && ENVIRONMENT_FEATURES.some((feature) =>
    Math.abs(scenarioValues[feature] - baseline[feature]) >= 0.01))
  const savedScenarioComparisons = baseline && aiModel
    ? savedScenarios
      .filter((scenario) => scenario.neighbourhoodId === baseline.id)
      .map((scenario) => ({
        ...scenario,
        result: buildScenarioResult(baseline, scenario.values, aiModel),
      }))
    : []
  const analoguePaths = createBoundaryPaths([analogueBoundaries.selected, analogueBoundaries.match])
  const observedLocalitiesById = new Map((aiModel?.observedLocalities ?? []).map((locality) => [locality.id, locality]))
  const selectedFactorRange = aiModel?.environmentRanges?.[mapFactor]
  const comparisonOutcomeRows = baseline ? [
    {
      id: 'vulnerability', label: 'Developmental vulnerability', baseline: baseline.vulnerability,
      active: scenarioResult?.vulnerability ?? null, activeRange: scenarioResult?.vulnerabilityRange ?? null,
      saved: savedScenarioComparisons.map((scenario) => ({ id: scenario.id, value: scenario.result.vulnerability, range: scenario.result.vulnerabilityRange })),
    },
    {
      id: 'physicalHealth', label: 'Physical health on track', baseline: baseline.physicalHealth,
      active: scenarioResult?.physicalHealth ?? null, activeRange: scenarioResult?.physicalHealthRange ?? null,
      saved: savedScenarioComparisons.map((scenario) => ({ id: scenario.id, value: scenario.result.physicalHealth, range: scenario.result.physicalHealthRange })),
    },
    {
      id: 'socialCompetence', label: 'Social competence on track', baseline: baseline.socialCompetence,
      active: scenarioResult?.socialCompetence ?? null, activeRange: scenarioResult?.socialCompetenceRange ?? null,
      saved: savedScenarioComparisons.map((scenario) => ({ id: scenario.id, value: scenario.result.socialCompetence, range: scenario.result.socialCompetenceRange })),
    },
  ] : []
  const outcomeWaterfalls: OutcomeWaterfall[] = baseline && scenarioResult
    ? [
      createOutcomeWaterfall('vulnerability', 'Developmental vulnerability', baseline.vulnerability, scenarioResult.vulnerability, scenarioResult.vulnerabilityRange, scenarioResult.factorContributions, true),
      createOutcomeWaterfall('physicalHealth', 'Physical health on track', baseline.physicalHealth, scenarioResult.physicalHealth, scenarioResult.physicalHealthRange, scenarioResult.factorContributions, false),
      createOutcomeWaterfall('socialCompetence', 'Social competence on track', baseline.socialCompetence, scenarioResult.socialCompetence, scenarioResult.socialCompetenceRange, scenarioResult.factorContributions, false),
    ].filter((row): row is OutcomeWaterfall => row !== null)
    : []
  const nearestAnalogue = scenarioResult?.nearestAnalogue ?? null
  const analogueOutcomeRows = baseline && nearestAnalogue ? [
    { label: 'Developmental vulnerability', selected: baseline.vulnerability, analogue: nearestAnalogue.vulnerability },
    { label: 'Physical health on track', selected: baseline.physicalHealth, analogue: nearestAnalogue.physicalHealth },
    { label: 'Social competence on track', selected: baseline.socialCompetence, analogue: nearestAnalogue.socialCompetence },
  ] : []
  const analogueBoundaryPaths = createBoundaryPaths([analogueBoundaries.selected, analogueBoundaries.match])
  const scenarioComparisonColumns = `minmax(180px, 1.3fr) repeat(${savedScenarioComparisons.length + 2}, minmax(132px, 1fr))`
  const environmentRadar = baseline && aiModel?.environmentRanges ? {
    baseline: radarPolygonPoints(environmentRadarScores(baseline, aiModel.environmentRanges)),
    scenario: radarPolygonPoints(environmentRadarScores(scenarioValues, aiModel.environmentRanges)),
  } : null

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
                  <strong>Adjust environmental conditions and compare area-level child-development outcomes.</strong>
                  <span>Association model · Not a clinical forecast</span>
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
                    <li>Adjust tree canopy, urban heat, open space, road traffic intensity and bushfire-prone land share.</li>
                    <li>Traffic intensity is a road-volume proxy, not air pollution or noise exposure.</li>
                    <li>Bushfire-prone land is a mapped designation, not smoke exposure or individual property risk.</li>
                    <li>Child outcomes are AEDC area-level measures, not individual health predictions.</li>
                    <li>Environmental and health associations do not establish cause and effect.</li>
                    <li>Factor contributions are modelled area-level associations, not causal effects.</li>
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

            {scenarioError && <p className="simulation-load-error" role="alert">{scenarioError}</p>}

            <div className="field-group scenario-variables">
              <h3>Environmental factors</h3>
              <div className="simulation-preset-controls">
                <label htmlFor="simulation-quick-preset">Quick scenario</label>
                <div className="simulation-preset-select" ref={presetWrapRef}>
                  <button
                    id="simulation-quick-preset"
                    type="button"
                    className="simulation-preset-trigger"
                    aria-haspopup="listbox"
                    aria-expanded={presetOpen}
                    disabled={!baseline}
                    onClick={() => setPresetOpen((open) => !open)}
                  >
                    <span>{QUICK_PRESET_OPTIONS.find((option) => option.id === quickPreset)?.label ?? 'Custom'}</span>
                    <i aria-hidden="true">⌄</i>
                  </button>
                  {presetOpen && <div className="glass search-results simulation-search-results" role="listbox" aria-labelledby="simulation-quick-preset">
                    {QUICK_PRESET_OPTIONS.map((option) => <button
                      key={option.id}
                      type="button"
                      role="option"
                      aria-selected={option.id === quickPreset}
                      className={option.id === quickPreset ? 'selected' : ''}
                      onClick={() => {
                        applyQuickPreset(option.id)
                        setPresetOpen(false)
                      }}
                    >
                      <span>{option.label}</span>
                    </button>)}
                  </div>}
                </div>
                <button type="button" disabled={!baseline} onClick={resetScenario}>Reset to current</button>
              </div>
              <div className="simulation-save-controls">
                <input
                  type="text"
                  value={scenarioName}
                  maxLength={48}
                  placeholder="Name this scenario"
                  aria-label="Scenario name"
                  disabled={!baseline}
                  onChange={(event) => setScenarioName(event.target.value)}
                />
                <button type="button" disabled={!baseline} onClick={saveScenario}>Save scenario</button>
              </div>
              {savedScenarioComparisons.length > 0 && <div className="simulation-saved-list" aria-label="Saved scenarios">
                {savedScenarioComparisons.map((scenario) => <div className="simulation-saved-item" key={scenario.id}>
                  <span title={scenario.name}>{scenario.name}</span>
                  <button type="button" onClick={() => loadSavedScenario(scenario)}>Load</button>
                  <button type="button" aria-label={`Delete ${scenario.name}`} onClick={() => deleteSavedScenario(scenario.id)}>Delete</button>
                </div>)}
              </div>}

              <div className="slider-row">
                <div className="slider-labels">
                  <label title={ENVIRONMENT_FEATURE_SOURCES.treeCanopy}>Tree canopy cover</label>
                  <span>Current {baseline ? `${baseline.treeCanopy.toFixed(1)}%` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min={aiModel?.environmentRanges?.treeCanopy.min ?? 0}
                    max={aiModel?.environmentRanges?.treeCanopy.max ?? 100}
                    step="0.1"
                    value={scenarioValues.treeCanopy}
                    onChange={(event) => updateScenarioValue('treeCanopy', Number(event.target.value))}
                    aria-label="Scenario tree canopy cover percentage"
                  />
                  <div className="slider-meta">
                    <span>Scenario</span>
                    <strong>{scenarioValues.treeCanopy.toFixed(1)}%</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label title={ENVIRONMENT_FEATURE_SOURCES.urbanHeat}>Urban heat-island intensity</label>
                  <span>Current {baseline ? `${baseline.urbanHeat.toFixed(1)}°C` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min={aiModel?.environmentRanges?.urbanHeat.min ?? 0}
                    max={aiModel?.environmentRanges?.urbanHeat.max ?? 20}
                    step="0.1"
                    value={scenarioValues.urbanHeat}
                    onChange={(event) => updateScenarioValue('urbanHeat', Number(event.target.value))}
                    aria-label="Scenario urban heat-island intensity in degrees Celsius"
                  />
                  <div className="slider-meta">
                    <span>Scenario</span>
                    <strong>{scenarioValues.urbanHeat.toFixed(1)}°C</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label title={ENVIRONMENT_FEATURE_SOURCES.openSpace}>Public open space</label>
                  <span>Current {baseline ? `${baseline.openSpace.toFixed(1)}%` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min={aiModel?.environmentRanges?.openSpace.min ?? 0}
                    max={aiModel?.environmentRanges?.openSpace.max ?? 100}
                    step="0.1"
                    value={scenarioValues.openSpace}
                    onChange={(event) => updateScenarioValue('openSpace', Number(event.target.value))}
                    aria-label="Scenario public open-space percentage"
                  />
                  <div className="slider-meta">
                    <span>Scenario</span>
                    <strong>{scenarioValues.openSpace.toFixed(1)}%</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label title={ENVIRONMENT_FEATURE_SOURCES.trafficIntensity}>Declared-road traffic intensity</label>
                  <span>Current {baseline ? `${baseline.trafficIntensity.toFixed(0)} AADT-road-km/km²` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min={aiModel?.environmentRanges?.trafficIntensity.min ?? 0}
                    max={aiModel?.environmentRanges?.trafficIntensity.max ?? 100000}
                    step="any"
                    value={scenarioValues.trafficIntensity}
                    onChange={(event) => updateScenarioValue('trafficIntensity', Number(event.target.value))}
                    aria-label="Scenario declared-road traffic intensity in AADT-road-kilometres per square kilometre"
                  />
                  <div className="slider-meta">
                    <span>Scenario</span>
                    <strong>{scenarioValues.trafficIntensity.toFixed(0)} AADT-road-km/km²</strong>
                  </div>
                </div>
              </div>

              <div className="slider-row">
                <div className="slider-labels">
                  <label title={ENVIRONMENT_FEATURE_SOURCES.bushfireProneShare}>Bushfire-prone land share</label>
                  <span>Current {baseline ? `${baseline.bushfireProneShare.toFixed(1)}%` : '—'}</span>
                </div>
                <div className="slider-control">
                  <input
                    type="range"
                    min={aiModel?.environmentRanges?.bushfireProneShare.min ?? 0}
                    max={aiModel?.environmentRanges?.bushfireProneShare.max ?? 100}
                    step="0.1"
                    value={scenarioValues.bushfireProneShare}
                    onChange={(event) => updateScenarioValue('bushfireProneShare', Number(event.target.value))}
                    aria-label="Scenario bushfire-prone land percentage"
                  />
                  <div className="slider-meta">
                    <span>Scenario</span>
                    <strong>{scenarioValues.bushfireProneShare.toFixed(1)}%</strong>
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

            <div className="simulation-playback">
              <button
                type="button"
                disabled={!hasScenarioChanges}
                onClick={playScenario}
                aria-label={isPlayingScenario ? 'Finish scenario transition' : 'Play scenario transition'}
              >
                {isPlayingScenario ? 'Finish transition' : playbackProgress === 1 ? 'Replay scenario' : 'Play scenario'}
              </button>
              <div className="simulation-playback-track" role="progressbar" aria-label="Scenario transition progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(playbackProgress * 100)}>
                <i style={{ width: `${playbackProgress * 100}%` }} />
              </div>
              <span>Visual transition · not a future timeline</span>
            </div>

            {resultsPage === 0 && <>
            {environmentRadar && <section className="simulation-environment-radar" aria-labelledby="simulation-radar-title">
              <div className="simulation-radar-copy">
                <h3 id="simulation-radar-title">Environment fingerprint</h3>
                <p>Five factors scaled to observed localities; farther out means more of the favorable direction.</p>
                <div className="simulation-radar-legend">
                  <span><i className="baseline-key" />Current</span>
                  <span><i className="scenario-key" />Scenario</span>
                </div>
              </div>
              <svg className="simulation-radar-chart" viewBox="0 0 360 270" role="img" aria-label="Baseline and scenario environmental fingerprint across five factors">
                {[0.25, 0.5, 0.75, 1].map((level) => <polygon key={level} points={radarPolygonPoints(ENVIRONMENT_FEATURES.map(() => level))} className="simulation-radar-grid" />)}
                {ENVIRONMENT_RADAR_AXES.map((axis, index) => {
                  const angle = (-Math.PI / 2) + ((index * Math.PI * 2) / ENVIRONMENT_RADAR_AXES.length)
                  const endX = 180 + (Math.cos(angle) * 78)
                  const endY = 128 + (Math.sin(angle) * 78)
                  const labelX = 180 + (Math.cos(angle) * 108)
                  const labelY = 128 + (Math.sin(angle) * 108)
                  const anchor = Math.cos(angle) > 0.3 ? 'start' : Math.cos(angle) < -0.3 ? 'end' : 'middle'
                  return <g key={axis.feature}>
                    <line x1="180" y1="128" x2={endX} y2={endY} className="simulation-radar-axis" />
                    <text x={labelX} y={labelY} textAnchor={anchor} className="simulation-radar-label">{axis.label}</text>
                  </g>
                })}
                <polygon points={environmentRadar.baseline} className="simulation-radar-baseline" />
                <polygon points={environmentRadar.scenario} className="simulation-radar-scenario" />
              </svg>
            </section>}

            <section className="simulation-factor-map" aria-labelledby="simulation-factor-map-title">
              <div className="simulation-factor-map-header">
                <div>
                  <h3 id="simulation-factor-map-title">Greater Melbourne · SA2 environment</h3>
                  <p>Observed values by locality. The highlighted area shows your scenario value.</p>
                </div>
                <div className="simulation-map-factor-field">
                  <span id="simulation-map-factor-label">Map factor</span>
                  <div className="simulation-preset-select" ref={mapFactorWrapRef}>
                    <button
                      type="button"
                      className="simulation-preset-trigger"
                      aria-haspopup="listbox"
                      aria-expanded={mapFactorOpen}
                      aria-labelledby="simulation-map-factor-label"
                      onClick={() => setMapFactorOpen((open) => !open)}
                    >
                      <span>{ENVIRONMENT_FEATURE_LABELS[mapFactor]}</span>
                      <i aria-hidden="true">⌄</i>
                    </button>
                    {mapFactorOpen && <div className="glass search-results simulation-search-results" role="listbox" aria-labelledby="simulation-map-factor-label">
                      {ENVIRONMENT_FEATURES.map((feature) => <button
                        key={feature}
                        type="button"
                        role="option"
                        aria-selected={feature === mapFactor}
                        className={feature === mapFactor ? 'selected' : ''}
                        onClick={() => {
                          setMapFactor(feature)
                          setMapFactorOpen(false)
                        }}
                      >
                        <span>{ENVIRONMENT_FEATURE_LABELS[feature]}</span>
                      </button>)}
                    </div>}
                  </div>
                </div>
              </div>
              {baseline && <p className="simulation-factor-map-selected">
                {baseline.name}: {formatEnvironmentValue(mapFactor, baseline[mapFactor])} baseline → {formatEnvironmentValue(mapFactor, scenarioValues[mapFactor])} scenario
              </p>}
              {factorMapStatus === 'loading' && <p className="simulation-factor-map-state">Loading SA2 boundaries…</p>}
              {factorMapStatus === 'unavailable' && <p className="simulation-factor-map-state">The SA2 environment map is unavailable.</p>}
              {factorMapStatus === 'available' && <div className="simulation-factor-map-canvas">
                <div className="simulation-map-zoom" role="group" aria-label="Map zoom controls">
                  <button type="button" aria-label="Zoom in" disabled={mapView.w <= MAP_WIDTH / MAP_MAX_ZOOM + 0.01} onClick={() => zoomMap(1.6)}>+</button>
                  <button type="button" aria-label="Zoom out" disabled={mapView.w >= MAP_WIDTH} onClick={() => zoomMap(1 / 1.6)}>−</button>
                  <button type="button" aria-label="Zoom to selected area" disabled={!baseline} onClick={zoomMapToSelected}>Selected</button>
                  <button type="button" aria-label="Reset map view" disabled={mapView.w >= MAP_WIDTH} onClick={() => setMapView(MAP_BASE_VIEW)}>Reset</button>
                </div>
                <svg ref={mapSvgRef} className={`${baseline ? 'has-selection' : ''}${mapView.w < MAP_WIDTH ? ' is-zoomed' : ''}`} viewBox={`${mapView.x} ${mapView.y} ${mapView.w} ${mapView.h}`} onPointerDown={handleMapPointerDown} role="img" aria-label={`Greater Melbourne SA2 map showing ${ENVIRONMENT_FEATURE_LABELS[mapFactor]}`}>
                  {[...factorMapShapes]
                    .sort((left, right) => Number(left.id === nearestAnalogue?.id) - Number(right.id === nearestAnalogue?.id)
                      || Number(left.id === baseline?.id) - Number(right.id === baseline?.id))
                    .flatMap((shape) => {
                    const observedValue = observedLocalitiesById.get(shape.id)?.[mapFactor] ?? null
                    const isSelected = shape.id === baseline?.id
                    const isAnalogue = shape.id === nearestAnalogue?.id
                    const value = isSelected ? scenarioValues[mapFactor] : observedValue
                    const halo = isSelected
                      ? <path key={`${shape.id}-halo`} className="simulation-map-halo" d={shape.path} fill="none" fillRule="evenodd" pointerEvents="none" aria-hidden="true" />
                      : null
                    return [halo, <path
                      key={shape.id}
                      className={isSelected ? 'is-selected' : isAnalogue ? 'is-analogue' : undefined}
                      d={shape.path}
                      fill={factorMapColor(value, mapFactor, selectedFactorRange)}
                      stroke={isSelected ? '#1c2f5c' : isAnalogue ? '#218c78' : 'rgba(255,255,255,.8)'}
                      strokeWidth={isSelected ? 3 : isAnalogue ? 2 : 0.45}
                      fillRule="evenodd"
                      tabIndex={0}
                      role="button"
                      aria-label={`${shape.name}, ${ENVIRONMENT_FEATURE_LABELS[mapFactor]} ${value === null ? 'unavailable' : formatEnvironmentValue(mapFactor, value)}${isSelected ? ', active scenario' : ''}${isAnalogue ? ', closest observed match' : ''}`}
                      onClick={() => {
                        if (mapDraggedRef.current || shape.id === baseline?.id) return
                        setSelectedNeighbourhood(shape.name)
                        setSearch(shape.name)
                        setShowSearchResults(false)
                        void loadNeighbourhoodScenario(shape.id, shape.name)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          if (shape.id === baseline?.id) return
                          setSelectedNeighbourhood(shape.name)
                          setSearch(shape.name)
                          setShowSearchResults(false)
                          void loadNeighbourhoodScenario(shape.id, shape.name)
                        }
                      }}
                    ><title>{shape.name}: {value === null ? 'data unavailable' : formatEnvironmentValue(mapFactor, value)}</title></path>]
                  })}
                </svg>
              </div>}
              {factorMapStatus === 'available' && <div className="simulation-factor-map-legend">
                <span>Less favorable</span>
                <div aria-hidden="true">{MAP_FACTOR_COLORS.map((color) => <i key={color} style={{ backgroundColor: color }} />)}</div>
                <span>More favorable</span>
                <b><i />Selected area</b>
                <b><i />Closest observed match</b>
              </div>}
              <p className="simulation-factor-map-note">The map colors non-selected SA2s by observed values; it does not distribute the selected scenario across surrounding areas. Zoom with the buttons or Ctrl/⌘ + scroll, and drag to pan.</p>
            </section>
            </>}

            {resultsPage === 1 && <>
            <div className="comparison-panel">
              <div className="comparison-header">
                <h3>Environmental Conditions &amp; Child Outcomes</h3>
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
                const baselineWidth = metric.baseline === null ? 0 : clamp((metric.baseline / metric.max) * 100, 0, 100)
                const simulatedWidth = metric.simulated === null ? 0 : clamp((metric.simulated / metric.max) * 100, 0, 100)
                const displayedDelta = metric.baseline === null || metric.simulated === null
                  ? direction.delta
                  : Number((Number(metric.simulated.toFixed(1)) - Number(metric.baseline.toFixed(1))).toFixed(1))
                const deltaPrefix = displayedDelta !== null && displayedDelta > 0 ? '+' : ''
                return (
                  <div className="comparison-row" key={metric.id} tabIndex={0}>
                    <div className="comparison-metric">
                      <span className="comparison-label">{metric.label}</span>
                      <span className="comparison-rule">{metric.simulated === null ? direction.label : metric.lowerIsBetter ? 'Lower is better' : 'Higher is better'}</span>
                    </div>
                    <div className="comparison-track" role="img" aria-label={`${metric.label} baseline ${metric.baseline === null ? 'unavailable' : formatMetricValue(metric.baseline, metric.unit)} simulated ${metric.simulated === null ? direction.label : formatMetricValue(metric.simulated, metric.unit)}`}>
                      {metric.baseline !== null && <div className="comparison-track-fill baseline" style={{ width: `${baselineWidth}%` }} />}
                      {metric.simulated !== null && <div className="comparison-track-fill simulated" style={{ width: `${simulatedWidth}%` }} />}
                    </div>
                    <div className="comparison-readout" aria-label={`${metric.label} values and change`}>
                      <div>
                        <small>Baseline</small>
                        {renderReadoutValue(metric.baseline, metric.unit, 'Unavailable')}
                      </div>
                      <span className="comparison-readout-arrow" aria-hidden="true">→</span>
                      <div>
                        <small>Scenario</small>
                        {renderReadoutValue(metric.simulated, metric.unit, direction.label)}
                      </div>
                      <span className={`comparison-readout-delta ${direction.tone}`}>
                        {direction.delta === null
                          ? direction.label
                          : `${deltaPrefix}${displayedDelta?.toFixed(1) ?? direction.delta.toFixed(1)}${metric.unit === '%' || metric.showRange ? ' pp' : metric.unit}`}
                      </span>
                    </div>
                    <div className="comparison-detail" role="tooltip">
                      <strong>{metric.label}</strong>
                      <dl>
                        <div><dt>Baseline</dt><dd>{metric.baseline === null ? 'Unavailable' : formatMetricValue(metric.baseline, metric.unit)}</dd></div>
                        <div><dt>Simulated</dt><dd>{metric.simulated === null ? direction.label : formatMetricValue(metric.simulated, metric.unit)}</dd></div>
                        {metric.showRange && metric.simulated !== null && <div><dt>80% held-out range</dt><dd>{metric.simulatedRange ? `${metric.simulatedRange.low.toFixed(1)}–${metric.simulatedRange.high.toFixed(1)}${metric.unit}` : 'Unavailable'}</dd></div>}
                      </dl>
                      <span className={`comparison-delta ${direction.tone}`}>
                        {displayedDelta === null ? direction.label : `${deltaPrefix}${displayedDelta.toFixed(1)}${metric.unit} · ${direction.label}`}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            </>}

            {resultsPage === 2 && <>
            <section className="simulation-scenario-comparison" aria-labelledby="simulation-scenario-comparison-title">
              <div className="simulation-driver-header">
                <div>
                  <h3 id="simulation-scenario-comparison-title">Scenario comparison</h3>
                  <p>Observed baseline versus active and saved options for {baseline.name}.</p>
                </div>
              </div>
              <div className="simulation-scenario-table" role="table" aria-label="Side-by-side scenario outcome comparison">
                <div className="simulation-scenario-row header" role="row" style={{ gridTemplateColumns: scenarioComparisonColumns }}>
                  <span role="columnheader">AEDC outcome</span>
                  <span role="columnheader">Baseline</span>
                  <span role="columnheader">Active</span>
                  {savedScenarioComparisons.map((scenario) => <span role="columnheader" key={scenario.id} title={scenario.name}>{scenario.name}</span>)}
                </div>
                {comparisonOutcomeRows.map((row) => <div className="simulation-scenario-row" role="row" key={row.id} style={{ gridTemplateColumns: scenarioComparisonColumns }}>
                  <span role="rowheader">{row.label}</span>
                  <span role="cell">{row.baseline === null ? 'Unavailable' : `${row.baseline.toFixed(1)}%`}</span>
                  <span role="cell">{formatScenarioOutcome(row.active, row.activeRange)}</span>
                  {row.saved.map((scenario) => <span role="cell" key={scenario.id}>{formatScenarioOutcome(scenario.value, scenario.range)}</span>)}
                </div>)}
              </div>
            </section>

            <section className="simulation-analogue" aria-labelledby="simulation-analogue-title">
              <div className="simulation-driver-header">
                <div>
                  <h3 id="simulation-analogue-title">Closest observed environmental match</h3>
                  <p>Nearest five-factor SA2 profile; its AEDC outcomes are observed, not forecast.</p>
                </div>
              </div>
              {!nearestAnalogue
                ? <p className="simulation-driver-empty">No comparable observed locality is available.</p>
                : <div className="simulation-analogue-content">
                  <figure className="simulation-analogue-map">
                    <svg viewBox="0 0 180 120" role="img" aria-label={`Selected and closest-match SA2 boundaries: ${baseline.name} and ${nearestAnalogue.name}`}>
                      {analogueBoundaryPaths[0] && <path d={analogueBoundaryPaths[0]} className="selected-boundary" />}
                      {analogueBoundaryPaths[1] && <path d={analogueBoundaryPaths[1]} className="analogue-boundary" />}
                    </svg>
                    <figcaption><span><i className="selected-key" />Current SA2</span><span><i className="analogue-key" />Closest observed SA2</span></figcaption>
                  </figure>
                  <div className="simulation-analogue-outcomes">
                    <strong>{nearestAnalogue.name}</strong>
                    <small>{nearestAnalogue.geographicUnit} · AEDC 2024 observed values</small>
                    {analogueOutcomeRows.map((row) => <div className="simulation-analogue-row" key={row.label}>
                      <span>{row.label}</span>
                      <b>{row.selected === null ? '—' : `${row.selected.toFixed(1)}%`}</b>
                      <i aria-hidden="true">→</i>
                      <b>{row.analogue === null ? '—' : `${row.analogue.toFixed(1)}%`}</b>
                    </div>)}
                    <p>This is a comparison with a real locality, not a prediction of what would happen if its environment changed.</p>
                  </div>
                </div>}
            </section>
            </>}

            {resultsPage === 3 && <>
            <section className="simulation-driver-breakdown" aria-labelledby="simulation-driver-title">
              <div className="simulation-driver-header">
                <div>
                  <h3 id="simulation-driver-title">What drives the change</h3>
                  <p>How much each factor you adjusted shifts each outcome, compared with today.</p>
                </div>
              </div>
              <div className="simulation-waterfall-legend" aria-label="How to read the driver chart">
                <p>Each bar shows one factor’s share of the change, in percentage points (pp) of children. A bar to the right raises the outcome; to the left lowers it. The centre line means no change.</p>
                <div>
                  <span><i className="key-favorable" />Better for children</span>
                  <span><i className="key-adverse" />Worse for children</span>
                </div>
              </div>
              {!scenarioResult?.predictionsAvailable
                ? <p className="simulation-driver-empty">Breakdown unavailable outside the model’s observed feature ranges.</p>
                : <div className="simulation-waterfalls">
                  {outcomeWaterfalls.map((outcome) => {
                    const net = Number((outcome.scenario - outcome.baseline).toFixed(1))
                    const lowerIsBetter = outcome.id === 'vulnerability'
                    const netVerdict = net === 0 ? 'No net change' : (lowerIsBetter ? net < 0 : net > 0) ? 'Better' : 'Worse'
                    const maxShift = Math.max(1, ...outcome.steps.map((step) => Math.abs(step.value ?? 0)))
                    const hasShift = outcome.steps.some((step) => Math.abs(step.value ?? 0) >= 0.05)
                    return <article className="simulation-waterfall" key={outcome.id}>
                      <header>
                        <strong>{outcome.label}</strong>
                        <span>{outcome.baseline.toFixed(1)}% today → {outcome.scenario.toFixed(1)}% scenario</span>
                        <small>
                          {net === 0 ? netVerdict : `${netVerdict}: ${net > 0 ? '+' : ''}${net.toFixed(1)} pp`}
                          {outcome.range ? ` · likely range ${outcome.range.low.toFixed(1)}–${outcome.range.high.toFixed(1)}%` : ''}
                        </small>
                      </header>
                      {!hasShift
                        ? <p className="simulation-driver-empty">Move a slider to see which factor drives the change.</p>
                        : <div className="simulation-driver-rows">
                          {outcome.steps.map((step) => {
                            const value = step.value ?? 0
                            const widthPct = (Math.abs(value) / maxShift) * 50
                            const side = value < 0 ? 'left' : 'right'
                            return <div
                              className="simulation-driver-row"
                              key={step.feature}
                              role="img"
                              aria-label={`${ENVIRONMENT_FEATURE_LABELS[step.feature]}: ${formatContribution(step.value)}${step.favorable === null || value === 0 ? '' : step.favorable ? ', better' : ', worse'}`}
                            >
                              <span className="simulation-driver-name">{ENVIRONMENT_FEATURE_LABELS[step.feature]}</span>
                              <div className="simulation-driver-track">
                                {value !== 0 && <i
                                  className={`simulation-driver-bar ${side} ${step.favorable ? 'favorable' : 'adverse'}`}
                                  style={{ width: `${Math.max(widthPct, 1.5)}%` }}
                                />}
                              </div>
                              <b className={value === 0 ? 'neutral' : step.favorable ? 'favorable' : 'adverse'}>{formatContribution(step.value)}</b>
                            </div>
                          })}
                        </div>}
                    </article>
                  })}
                </div>}
              <p className="simulation-driver-caveat">These fitted cross-sectional contributions are decompositions, not causal effects.</p>
            </section>

            <p className="simulation-evidence-note">
              Child-development estimates use AEDC 2024; canopy, heat and open-space measures are from 2018, traffic from 2019 and bushfire designation from 2026. Inputs are not contemporaneous. Held-out ranges are residual bands, not causal confidence intervals. Traffic is not pollution exposure; bushfire-prone share is not smoke exposure.
            </p>

            <div className={`insight-box${insightExpanded ? ' is-expanded' : ''}`}>
              <button
                type="button"
                className="insight-summary"
                aria-label={insightExpanded ? 'Hide Model Insight details' : 'Show Model Insight details'}
                aria-expanded={insightExpanded}
                onClick={() => setInsightExpanded((expanded) => !expanded)}
              >
                <span><strong>Model Insight</strong><small>Area-level associations</small></span>
                <i aria-hidden="true" />
              </button>
              {insightExpanded && <div className="insight-content">
                <p>{scenarioResult ? scenarioResult.insight : 'Select a neighbourhood and adjust the controls to update the scenario estimate.'}</p>
                <div className="insight-details">
                  <div className="projected-change secondary">
                    <span>Method:</span>
                    <strong>{scenarioResult?.modelContext ?? 'Using approved environmental and AEDC indicators.'}</strong>
                  </div>
                  <div className="projected-change secondary">
                    <span>Model:</span>
                    <strong>{scenarioResult?.modelSummary ?? 'Awaiting neighbourhood indicators.'}</strong>
                  </div>
                  <div className="projected-change">
                    <span>Developmental vulnerability:</span>
                    <strong>{scenarioResult?.vulnerability === null || !scenarioResult || baseline.vulnerability === null ? 'Unavailable' : `${baseline.vulnerability.toFixed(1)}% → ${scenarioResult.vulnerability.toFixed(1)}%`}</strong>
                  </div>
                  <div className="projected-change secondary">
                    <span>Physical health on track:</span>
                    <strong>{scenarioResult?.physicalHealth === null || !scenarioResult || baseline.physicalHealth === null ? 'Unavailable' : `${baseline.physicalHealth.toFixed(1)}% → ${scenarioResult.physicalHealth.toFixed(1)}%`}</strong>
                  </div>
                </div>
              </div>}
            </div>
            </>}

            <nav className="simulation-results-pager" aria-label="Results pages">
              <button type="button" className="prev" aria-label="Previous page" disabled={resultsPage === 0} onClick={() => setResultsPage((page) => Math.max(page - 1, 0))}>‹</button>
              <div className="simulation-results-dots">
                {RESULTS_PAGES.map((label, index) => <button
                  type="button"
                  key={label}
                  className={index === resultsPage ? 'active' : ''}
                  aria-label={`${label} (page ${index + 1} of ${RESULTS_PAGES.length})`}
                  aria-current={index === resultsPage ? 'page' : undefined}
                  title={label}
                  onClick={() => setResultsPage(index)}
                />)}
              </div>
              <button type="button" className="next" aria-label={`Next: ${RESULTS_PAGES[Math.min(resultsPage + 1, RESULTS_PAGES.length - 1)]}`} disabled={resultsPage === RESULTS_PAGES.length - 1} onClick={() => setResultsPage((page) => Math.min(page + 1, RESULTS_PAGES.length - 1))}>›</button>
            </nav>

          </section>}
        </div>
      </main>
    </div>
  )
}
