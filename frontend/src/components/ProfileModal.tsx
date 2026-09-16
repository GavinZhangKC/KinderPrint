import { useEffect, useRef, useState } from 'react'
import MetricRing from './MetricRing'
import { api, type ApiEnvelope, type NeighbourhoodExplanation } from '../services/api'
import { indicatorStatusLabel } from '../services/profileAdapter'
import type { IndicatorProvenance, Neighbourhood } from '../types/neighbourhood'

interface ProfileModalProps {
  neighbourhood: Neighbourhood
  onCompare: () => void
  onExploreData: () => void
  onClose: () => void
  onActivate: () => void
}

function display(value: number | null, suffix = '') {
  return value === null ? 'Not available' : `${value}${suffix}`
}

function IndicatorMetaLine({ details }: { details?: IndicatorProvenance }) {
  if (!details) return null
  const items = [details.referenceYear, indicatorStatusLabel(details.status)]
    .filter((item): item is string | number => item !== null && item !== '')
  return items.length > 0
    ? <small className="indicator-meta-line">{items.join(' · ')}</small>
    : null
}

type ExplanationLoadState = 'idle' | 'loading' | 'ready' | 'missing' | 'unavailable'

function isUserFacingExplanationMessage(message: string) {
  return !/(environment variable|file path|\.json\b|configured|configuration|backend|KINDERPRINT_)/i.test(message)
}

function PriorityExplanationPopover({
  neighbourhoodId,
  onLoaded,
}: {
  neighbourhoodId: string
  onLoaded: (explanation: NeighbourhoodExplanation) => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [loadState, setLoadState] = useState<ExplanationLoadState>('idle')
  const [response, setResponse] = useState<ApiEnvelope<NeighbourhoodExplanation> | null>(null)
  const requestedIdRef = useRef<string | null>(null)
  const requestVersionRef = useRef(0)
  const popoverId = `priority-explanation-${neighbourhoodId}`
  const explanation = response?.data ?? null
  const isOpen = isHovered || isFocused

  useEffect(() => {
    requestVersionRef.current += 1
    requestedIdRef.current = null
    setLoadState('idle')
    setResponse(null)
    setIsHovered(false)
    setIsFocused(false)
  }, [neighbourhoodId])

  useEffect(() => () => {
    requestVersionRef.current += 1
  }, [])

  const loadExplanation = () => {
    if (requestedIdRef.current === neighbourhoodId) return

    requestedIdRef.current = neighbourhoodId
    const requestVersion = ++requestVersionRef.current
    setLoadState('loading')

    void api.getExplanation(neighbourhoodId)
      .then((nextResponse) => {
        if (requestVersion !== requestVersionRef.current) return
        setResponse(nextResponse)
        if (nextResponse.status === 'available' || nextResponse.status === 'limited') {
          setLoadState('ready')
          onLoaded(nextResponse.data)
          return
        }
        setLoadState(nextResponse.status === 'missing' ? 'missing' : 'unavailable')
      })
      .catch(() => {
        if (requestVersion === requestVersionRef.current) setLoadState('unavailable')
      })
  }

  const highlightedIds = new Set(explanation?.highlighted_factor_ids ?? [])
  const limitations = (response?.limitations ?? [])
    .map((item) => item.message)
    .filter(isUserFacingExplanationMessage)
  const notices = (response?.notices ?? [])
    .map((item) => item.message)
    .filter(isUserFacingExplanationMessage)

  return (
    <div
      className="priority-explanation"
      onMouseEnter={() => {
        setIsHovered(true)
        loadExplanation()
      }}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => {
        setIsFocused(true)
        loadExplanation()
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsFocused(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setIsHovered(false)
          setIsFocused(false)
        }
      }}
    >
      <button
        className="priority-explanation-trigger"
        type="button"
        aria-label="Why am I seeing this?"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        data-tooltip="Why am I seeing this?"
      >
        ?
      </button>

      <div
        className={`glass priority-explanation-popover${isOpen ? ' is-open' : ''}`}
        id={popoverId}
        role="dialog"
        aria-label="Why am I seeing this?"
        aria-hidden={!isOpen}
      >
        <strong className="priority-explanation-title">Why am I seeing this?</strong>

        {loadState === 'loading' && <span className="priority-explanation-state">Loading…</span>}
        {loadState === 'missing' && <span className="priority-explanation-state">No explanation is available for this locality.</span>}
        {loadState === 'unavailable' && <span className="priority-explanation-state">This explanation is currently unavailable.</span>}

        {loadState === 'ready' && explanation && (
          <>
            <div className="priority-explanation-domains">
              {explanation.factor_domains.map((domain) => (
                <div className="priority-explanation-domain" key={domain.domain}>
                  <strong>{domain.domain}</strong>
                  {domain.factors.length > 0 && (
                    <ul>
                      {domain.factors.map((factor) => (
                        <li
                          className={highlightedIds.has(factor.id) ? 'is-highlighted' : undefined}
                          key={factor.id}
                        >
                          {factor.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {explanation.incomplete_inputs.length > 0 && (
              <div className="priority-explanation-note">
                <strong>Data limitations</strong>
                {explanation.incomplete_inputs.map((item, index) => (
                  <span key={`${item.indicator}-${index}`}>
                    <b>{item.indicator}</b>: {item.reason}
                  </span>
                ))}
              </div>
            )}

          </>
        )}

        {(limitations.length > 0 || notices.length > 0) && (
          <div className="priority-explanation-messages">
            {limitations.map((message) => <p key={`limitation-${message}`}>{message}</p>)}
            {notices.map((message) => <p key={`notice-${message}`}>{message}</p>)}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProfileModal({ neighbourhood, onCompare, onExploreData, onClose, onActivate }: ProfileModalProps) {
  const [loadedExplanation, setLoadedExplanation] = useState<NeighbourhoodExplanation | null>(null)

  useEffect(() => {
    setLoadedExplanation(null)
  }, [neighbourhood.id])

  const highlightedIds = new Set(loadedExplanation?.highlighted_factor_ids ?? [])
  const highlightedFactors = loadedExplanation
    ? loadedExplanation.factor_domains
      .flatMap((domain) => domain.factors)
      .filter((factor) => highlightedIds.has(factor.id))
      .map((factor) => factor.name)
    : neighbourhood.highlightedFactors

  return (
    <section className="glass profile-modal page-enter" aria-labelledby="profile-title" onPointerDown={onActivate}>
      <button className="icon-close" type="button" onClick={onClose} aria-label="Close profile">×</button>
      <h1 id="profile-title">{neighbourhood.name} Profile</h1>
      <p className="profile-subtitle">A snapshot of child development, social and environmental conditions in this neighbourhood.</p>

      <div className="profile-meta glass-subtle">
        <span>{neighbourhood.geographicUnit} · Reference period {neighbourhood.referencePeriod}</span>
        <div className="priority-inline">
          Priority for Investigation
          <strong>{neighbourhood.priority ?? 'Not available'}</strong>
          <PriorityExplanationPopover
            neighbourhoodId={neighbourhood.id}
            onLoaded={setLoadedExplanation}
          />
        </div>
      </div>

      <div className="profile-domain-grid">
        <article className="glass-subtle profile-domain-card child-card">
          <h2>CHILD DEVELOPMENT</h2>
          <MetricRing value={neighbourhood.childDevelopmentScore} label="Child development score" />
          <p>On track on all five AEDC domains</p>
          <IndicatorMetaLine details={neighbourhood.indicatorProvenance.aedc_on_track_five} />
        </article>

        <article className="glass-subtle profile-domain-card social-card">
          <h2>SOCIAL CONTEXT</h2>
          <p className="metric-label">Socioeconomic<br />disadvantage</p>
          <strong className="metric-large">{display(neighbourhood.socialDisadvantageDecile)}</strong>
          <p>National SEIFA IRSD decile</p>
          <IndicatorMetaLine details={neighbourhood.indicatorProvenance.seifa_irsd_decile} />
        </article>

        <article className="glass-subtle profile-domain-card environment-card">
          <h2>ENVIRONMENT</h2>
          <div className="environment-row"><span>Urban heat island effect</span><strong>{display(neighbourhood.heatExposure, '°C')}</strong><IndicatorMetaLine details={neighbourhood.indicatorProvenance.env_urban_heat} /></div>
          <div className="environment-row"><span>Tree canopy</span><strong>{display(neighbourhood.treeCanopy, '%')}</strong><IndicatorMetaLine details={neighbourhood.indicatorProvenance.env_vegetation_cover} /></div>
          <div className="environment-row"><span>Public open space</span><strong>{display(neighbourhood.greenSpaceAccess, '%')}</strong><IndicatorMetaLine details={neighbourhood.indicatorProvenance.env_open_space_access} /></div>
        </article>
      </div>

      <article className="glass-subtle key-insight-card">
        <h2>Highlighted Factors</h2>
        {highlightedFactors.length > 0 ? (
          <ul>
            {highlightedFactors.map((factor) => <li key={factor}>{factor}</li>)}
          </ul>
        ) : (
          <p>No approved highlighted factors are available.</p>
        )}
      </article>

      <div className="profile-actions">
        <button className="button secondary" type="button" onClick={onCompare}>Compare Neighbourhoods</button>
        <button className="button primary" type="button" onClick={onExploreData}>Explore Detailed Data</button>
      </div>
    </section>
  )
}
