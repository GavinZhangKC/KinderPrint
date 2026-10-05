import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type {
  CesiumJourneyOverlayAnchor,
  ParkvilleJourneyChapter,
} from './CesiumScene'
import type { VerifiedParkvilleLocation } from './parkvilleVerification'
import './JourneyLocationCards.css'

export interface JourneyLocationCardsHandle {
  updateAnchors: (anchors: CesiumJourneyOverlayAnchor[]) => void
}

interface JourneyLocationCardsProps {
  chapters: ParkvilleJourneyChapter[]
  locations: VerifiedParkvilleLocation[]
  onExpandedChange?: (expanded: boolean) => void
}

interface JourneyCard {
  chapter: ParkvilleJourneyChapter
  location: VerifiedParkvilleLocation
}

interface SmoothedPosition {
  x: number
  y: number
  initialized: boolean
  hiddenFrames: number
}

const cardOffsets: Record<string, { x: number; y: number }> = {
  'royal-childrens-hospital': { x: 92, y: -8 },
  'royal-park': { x: -92, y: -4 },
  'wimble-street-childcare': { x: 90, y: -2 },
  'university-high-school': { x: -88, y: -8 },
  'royal-womens-hospital': { x: -92, y: -4 },
  'royal-melbourne-hospital': { x: 94, y: -12 },
  'university-of-melbourne': { x: -94, y: -8 },
}

export type JourneyLocationCardSide = 'left' | 'right'

export function journeyLocationCardSide(locationId: string): JourneyLocationCardSide {
  return (cardOffsets[locationId]?.x ?? 86) < 0 ? 'left' : 'right'
}

function locationDescription(location: VerifiedParkvilleLocation) {
  if (location.category === 'Healthcare') {
    return 'Verified healthcare landmark featured along the Parkville journey.'
  }
  if (location.category === 'Green space') {
    return 'Verified green-space landmark highlighted beside the journey route.'
  }
  if (location.category === 'Childcare') {
    return 'Verified childcare service from the local City of Melbourne dataset.'
  }
  return 'Verified education landmark connected to this Parkville journey chapter.'
}

function coverageLabel(status: VerifiedParkvilleLocation['coverage']) {
  if (status === 'within-near-edge') return 'Within local coverage, near edge'
  if (status === 'outside') return 'Outside local coverage'
  return 'Within local coverage'
}

function categoryClass(location: VerifiedParkvilleLocation) {
  if (location.category === 'Healthcare') return 'is-healthcare'
  if (location.category === 'Green space') return 'is-green-space'
  return 'is-education'
}

const JourneyLocationCards = forwardRef<
  JourneyLocationCardsHandle,
  JourneyLocationCardsProps
>(function JourneyLocationCards(
  { chapters, locations, onExpandedChange },
  ref,
) {
  const cardElementsRef = useRef(new Map<string, HTMLButtonElement>())
  const smoothedPositionsRef = useRef(new Map<string, SmoothedPosition>())
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const lastFocusedLocationRef = useRef<string | null>(null)
  const [expandedLocationId, setExpandedLocationId] = useState<string | null>(null)

  const cards = useMemo(() => chapters.flatMap((chapter): JourneyCard[] => {
    const location = locations.find((item) => item.id === chapter.locationId)
    return location ? [{ chapter, location }] : []
  }), [chapters, locations])

  const expandedCard = cards.find(
    ({ location }) => location.id === expandedLocationId,
  )

  useImperativeHandle(ref, () => ({
    updateAnchors(anchors) {
      for (const anchor of anchors) {
        const element = cardElementsRef.current.get(anchor.locationId)
        if (!element) continue

        const offset = cardOffsets[anchor.locationId] ?? { x: 86, y: -6 }
        const cardWidth = element.offsetWidth || (window.innerWidth <= 720 ? 220 : 276)
        const cardHeight = element.offsetHeight || 142
        const viewportWidth = Math.max(1, window.innerWidth)
        const viewportHeight = Math.max(1, window.innerHeight)
        const edgeGap = viewportWidth <= 720 ? 12 : 24
        const halfWidth = cardWidth / 2
        const minimumX = edgeGap + halfWidth
        const navigationClearance = viewportWidth > 760 ? 54 : 0
        const maximumX = Math.max(
          minimumX,
          viewportWidth - edgeGap - navigationClearance - halfWidth,
        )
        const headerBottom = viewportWidth <= 760 ? 74 : 96
        const headerGap = viewportWidth <= 760 ? 14 : 18
        const minimumCardY = headerBottom + headerGap + cardHeight
        const rightSide = offset.x >= 0
        const railX = rightSide ? maximumX : minimumX
        const projectedCardX = anchor.x + offset.x
        const railBias = viewportWidth <= 720 ? 0.9 : 0.78
        let targetCardX = projectedCardX * (1 - railBias) + railX * railBias

        // Keep the primary scene readable: cards occupy the side rails and
        // never drift over the central subject as the camera moves.
        if (viewportWidth > 720) {
          const centreX = viewportWidth / 2
          const clearHalfWidth = Math.min(230, viewportWidth * 0.18)
          targetCardX = rightSide
            ? Math.max(targetCardX, centreX + clearHalfWidth + halfWidth)
            : Math.min(targetCardX, centreX - clearHalfWidth - halfWidth)
        }
        targetCardX = Math.min(maximumX, Math.max(minimumX, targetCardX))

        const targetCardY = Math.min(
          viewportHeight - (viewportWidth <= 720 ? 74 : 46),
          Math.max(minimumCardY, anchor.y + offset.y),
        )
        const candidateVisible = anchor.visible && anchor.intensity > 0.025
        const position = smoothedPositionsRef.current.get(anchor.locationId) ?? {
          x: targetCardX,
          y: targetCardY,
          initialized: false,
          hiddenFrames: 0,
        }

        position.hiddenFrames = candidateVisible ? 0 : position.hiddenFrames + 1
        const canShow = candidateVisible || (
          position.initialized
          && anchor.intensity > 0.025
          && position.hiddenFrames < 4
        )
        const canInteract = canShow && anchor.intensity > 0.28 && !expandedLocationId
        const blend = position.initialized ? 0.2 : 1
        const nextX = position.x + (targetCardX - position.x) * blend
        const nextY = position.y + (targetCardY - position.y) * blend
        position.x = Math.abs(nextX - position.x) < 0.6
          ? position.x
          : Math.round(nextX * 2) / 2
        position.y = Math.abs(nextY - position.y) < 0.6
          ? position.y
          : Math.round(nextY * 2) / 2
        position.initialized = candidateVisible || position.initialized
        smoothedPositionsRef.current.set(anchor.locationId, position)

        // The CSS offset remains available as the card's side preference; the
        // rendered position itself is computed above to guarantee safe rails.
        element.style.setProperty('--anchor-x', `${position.x - offset.x}px`)
        element.style.setProperty('--anchor-y', `${position.y - offset.y}px`)
        element.style.setProperty('--card-rise', `${(1 - anchor.intensity) * 12}px`)
        element.style.opacity = canShow
          ? String(Math.min(1, anchor.intensity * 1.35))
          : '0'
        element.dataset.visible = String(canShow)
        element.dataset.interactive = String(canInteract)
        element.setAttribute('aria-hidden', String(!canShow))
        element.tabIndex = canInteract ? 0 : -1
      }
    },
  }), [expandedLocationId])

  useEffect(() => {
    if (!expandedCard) return
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closePanel()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [expandedCard])

  function openPanel(locationId: string) {
    lastFocusedLocationRef.current = locationId
    setExpandedLocationId(locationId)
    onExpandedChange?.(true)
  }

  function closePanel() {
    const previousLocationId = lastFocusedLocationRef.current
    setExpandedLocationId(null)
    onExpandedChange?.(false)
    window.requestAnimationFrame(() => {
      if (previousLocationId) {
        cardElementsRef.current.get(previousLocationId)?.focus()
      }
    })
  }

  return (
    <>
      <div
        className="journey-location-card-layer"
        aria-hidden={expandedCard ? true : undefined}
      >
        {cards.map(({ chapter, location }) => {
          const offset = cardOffsets[location.id] ?? { x: 86, y: -6 }
          const style = {
            '--card-offset-x': `${offset.x}px`,
            '--card-offset-y': `${offset.y}px`,
          } as CSSProperties

          return (
            <button
              key={location.id}
              ref={(element) => {
                if (element) cardElementsRef.current.set(location.id, element)
                else cardElementsRef.current.delete(location.id)
              }}
              type="button"
              className={`journey-location-card ${categoryClass(location)}`}
              style={style}
              data-visible="false"
              data-interactive="false"
              aria-haspopup="dialog"
              aria-hidden="true"
              tabIndex={-1}
              onClick={() => openPanel(location.id)}
            >
              <span className="journey-location-card-category">
                {location.category}
              </span>
              <strong>{location.name}</strong>
              <span className="journey-location-card-description">
                {locationDescription(location)}
              </span>
              <span className="journey-location-card-action">
                Explore location <i aria-hidden="true">&#8599;</i>
              </span>
              <span className="journey-location-card-chapter" aria-hidden="true">
                {String(chapter.chapter).padStart(2, '0')}
              </span>
            </button>
          )
        })}
      </div>

      {expandedCard && (
        <div
          className="journey-location-detail-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePanel()
          }}
        >
          <section
            className={`journey-location-detail ${categoryClass(expandedCard.location)}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="journey-location-detail-title"
          >
            <button
              ref={closeButtonRef}
              type="button"
              className="journey-location-detail-close"
              aria-label="Close location details"
              onClick={closePanel}
            >
              <span aria-hidden="true">&times;</span>
            </button>

            <span className="journey-location-detail-kicker">
              Chapter {String(expandedCard.chapter.chapter).padStart(2, '0')}
              {' '}&middot; {expandedCard.location.category}
            </span>
            <h2 id="journey-location-detail-title">
              {expandedCard.location.name}
            </h2>
            <p>{locationDescription(expandedCard.location)}</p>

            <dl>
              <div>
                <dt>Journey context</dt>
                <dd>{expandedCard.chapter.title}</dd>
              </div>
              <div>
                <dt>Verified position</dt>
                <dd>
                  {expandedCard.location.latitude.toFixed(6)},{' '}
                  {expandedCard.location.longitude.toFixed(6)}
                </dd>
              </div>
              <div>
                <dt>Coverage</dt>
                <dd>{coverageLabel(expandedCard.location.coverage)}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{expandedCard.location.source}</dd>
              </div>
            </dl>

            <a
              href={expandedCard.location.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              View verified data source <span aria-hidden="true">&#8599;</span>
            </a>
          </section>
        </div>
      )}
    </>
  )
})

export default JourneyLocationCards
