import { useEffect, useRef, useState } from 'react'
import './PlaceLayersStory.css'

const scenes = [
  { label: 'Place', title: 'Where children grow matters.', detail: 'Begin with Melbourne—not as a set of scores, but as a living collection of places.', tone: 'place' },
  { label: 'Locality', title: 'A locality is more than an address.', detail: 'Boundaries help us compare evidence consistently while remembering that daily life crosses them.', tone: 'boundary' },
  { label: 'Heat', title: 'It is the heat children experience.', detail: 'Urban form and surface temperature shape outdoor comfort at a neighbourhood scale.', tone: 'heat' },
  { label: 'Nature', title: 'The nature surrounding them.', detail: 'Canopy, vegetation and open space reveal a different environmental layer.', tone: 'nature' },
  { label: 'Play', title: 'The places available to play.', detail: 'Public open space provides context for active, social and exploratory environments.', tone: 'play' },
  { label: 'Support', title: 'The services families can reach.', detail: 'Early childhood service availability adds a practical support layer to place.', tone: 'services' },
  { label: 'Development', title: 'The patterns already observed there.', detail: 'AEDC outcomes describe aggregate child-development patterns—not individual children.', tone: 'development' },
  { label: 'KinderPrint', title: 'The layers become one evidence journey.', detail: 'Explore each place, open the evidence, and compare without declaring a winner.', tone: 'together' },
] as const

interface PlaceLayersStoryProps {
  onEnter: () => void
}

export default function PlaceLayersStory({ onEnter }: PlaceLayersStoryProps) {
  const rootRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-layer-scene]'))
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visible) setActive(Number((visible.target as HTMLElement).dataset.layerScene ?? 0))
    }, { rootMargin: '-32% 0px -38%', threshold: [0, .25, .55, .8] })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  return (
    <section className="place-story" ref={rootRef} aria-label="The layers of a locality">
      <div className="place-story-visual" data-tone={scenes[active].tone} aria-hidden="true">
        <div className="place-map-field">
          <div className="place-contours" />
          <div className="place-boundaries" />
          <div className="place-heat" />
          <div className="place-canopy"><i /><i /><i /><i /><i /><i /></div>
          <div className="place-services"><i /><i /><i /><i /></div>
          <div className="place-development"><i /><i /><i /></div>
          <div className="place-child-mark"><span>Every place</span><strong>leaves a different footprint</strong></div>
        </div>
        <div className="place-layer-readout">
          <span>{String(active + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}</span>
          <strong>{scenes[active].label}</strong>
        </div>
      </div>

      <div className="place-story-copy">
        {scenes.map((scene, index) => (
          <article className="place-scene" data-layer-scene={index} key={scene.label} aria-current={active === index ? 'step' : undefined}>
            <span className="place-scene-index">{String(index + 1).padStart(2, '0')} · {scene.label}</span>
            <h2>{scene.title}</h2>
            <p>{scene.detail}</p>
            {index === scenes.length - 1 && (
              <button className="button primary place-story-enter" type="button" onClick={onEnter}>
                Enter Melbourne <span aria-hidden="true">↗</span>
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
