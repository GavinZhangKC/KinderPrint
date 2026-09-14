import { useEffect, useRef, useState } from 'react'
import MetricRing from './MetricRing'
import { api, type NeighbourhoodExplanation } from '../services/api'
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

type ExplanationLoadState = 'idle' | 'loading' | 'ready' | 'missing' | 'error'

function PriorityExplanationPopover({ neighbourhoodId }: { neighbourhoodId: string }) {
  const [isHovered, setIsHovered] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isPinned, setIsPinned] = useState(false)
  const [loadState, setLoadState] = useState<ExplanationLoadState>('idle')
  const [explanation, setExplanation] = useState<NeighbourhoodExplanation | null>(null)
  const requestedIdRef = useRef<string | null>(null)
  const requestVersionRef = useRef(0)
  const isOpen = isHovered || isFocused || isPinned
  const popoverId = `priority-explanation-${neighbourhoodId}`

  useEffect(() => {
    requestVersionRef.current += 1
    requestedIdRef.current = null
    setLoadState('idle')
    setExplanation(null)
    setIsHovered(false)
    setIsFocused(false)
    setIsPinned(false)
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
      .then((response) => {
        if (requestVersion !== requestVersionRef.current) return
        if (response.status === 'available' || response.status === 'limited') {
          setExplanation(response.data)
          setLoadState('ready')
          return
        }
        setLoadState(response.status === 'missing' ? 'missing' : 'error')
      })
      .catch(() => {
        if (requestVersion === requestVersionRef.current) setLoadState('error')
      })
  }

  const highlightedIds = new Set(explanation?.highlighted_factor_ids ?? [])

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
          setIsPinned(false)
        }
      }}
    >
      <button
        className="priority-explanation-trigger"
        type="button"
        aria-label="Why this priority?"
        aria-expanded={isOpen}
        aria-controls={popoverId}
        onClick={() => {
          if (window.matchMedia('(hover: none), (pointer: coarse)').matches) {
            setIsHovered(false)
            setIsFocused(false)
          }
          setIsPinned((open) => !open)
          loadExplanation()
        }}
      >
        ?
      </button>

      <div
        className={`glass priority-explanation-popover${isOpen ? ' is-open' : ''}`}
        id={popoverId}
        role="dialog"
        aria-label="Why this priority?"
        aria-hidden={!isOpen}
      >
        <strong className="priority-explanation-title">Why this priority?</strong>

        {loadState === 'loading' && <span className="priority-explanation-state">Loading…</span>}
        {loadState === 'missing' && <span className="priority-explanation-state">No explanation is available.</span>}
        {loadState === 'error' && <span className="priority-explanation-state">Explanation unavailable.</span>}

        {loadState === 'ready' && explanation && (
          <>
            <div className="priority-explanation-domains">
              {explanation.factor_domains.map((domain) => {
                const factors = domain.factors.filter((factor) => highlightedIds.has(factor.id))
                return (
                  <div className="priority-explanation-domain" key={domain.domain}>
                    <strong>{domain.domain}</strong>
                    {factors.length > 0 ? (
                      <ul>
                        {factors.map((factor) => <li key={factor.id}>{factor.name}</li>)}
                      </ul>
                    ) : (
                      <span className="priority-explanation-empty">No highlighted factors</span>
                    )}
                  </div>
                )
              })}
            </div>

            {explanation.incomplete_inputs.length > 0 && (
              <div className="priority-explanation-note">
                <strong>Data note</strong>
                {explanation.incomplete_inputs.map((item, index) => (
                  <span key={`${item.indicator}-${index}`}>
                    <b>{item.indicator}</b>: {item.reason}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}

export default function ProfileModal({ neighbourhood, onCompare, onExploreData, onClose, onActivate }: ProfileModalProps) {
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
          <PriorityExplanationPopover neighbourhoodId={neighbourhood.id} />
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
        <h2>Early Childhood Service Context</h2>
        {neighbourhood.activeEducationCareServices === null ? (
          <p>No validated aggregate service context is available.</p>
        ) : (
          <p>
            <strong>{neighbourhood.activeEducationCareServices}</strong> active education and care services ·{' '}
            <strong>{display(neighbourhood.totalApprovedPlaces)}</strong> total approved places ·{' '}
            <strong>{neighbourhood.kindergartenServices}</strong> kindergarten services
          </p>
        )}
        <p>Accepted Open G-NAF matches only. Counts describe local service context, not accessibility, quality or capacity sufficiency.</p>
      </article>

      <article className="glass-subtle key-insight-card">
        <h2>Child Population Outlook</h2>
        {neighbourhood.projectedChildren0To14 === null ? (
          <p>No compatible locality projection is available.</p>
        ) : (
          <p><strong>{neighbourhood.projectedChildren0To14.toLocaleString()}</strong> projected children aged 0–14 in {neighbourhood.projectionYear}.</p>
        )}
        <p>Victoria in Future projection at native SA2 geography; this is a projection, not an observed count.</p>
      </article>

      <article className="glass-subtle key-insight-card">
        <h2>Highlighted Factors</h2>
        {neighbourhood.highlightedFactors.length > 0 ? (
          <ul>
            {neighbourhood.highlightedFactors.map((factor) => <li key={factor}>{factor}</li>)}
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
