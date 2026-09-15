import { useState } from 'react'
import './TemplateHomeSections.css'
import './EmergentLocalitySection.css'
import './EmergentHomepage.css'

interface TemplateHomeSectionsProps {
  onInsight: () => void
  onMap: () => void
}

const layers = [
  ['01', 'Heat and outdoor comfort', 'Explore locality-level urban heat context and the conditions surrounding outdoor comfort.'],
  ['02', 'Nature and canopy', 'Read tree canopy and vegetation as one layer of the environment surrounding children.'],
  ['03', 'Parks and play', 'Understand public open-space context without treating proximity as access or quality.'],
  ['04', 'Early-years services', 'See accepted, geocoded education and care services as local context.'],
] as const

const priorities = [
  'Learning and development',
  'Social and emotional wellbeing',
  'Physical development and active living',
  'Respiratory environment',
  'Heat and outdoor comfort',
  'Parks, playgrounds and nature',
  'Healthcare access',
  'Early-childhood support',
]

const localityLayers = [
  ['01', 'Heat and outdoor comfort', 'URBAN HEAT CONTEXT · COVERAGE DISCLOSED'],
  ['02', 'Nature and canopy', 'TREE CANOPY · SOURCE AND YEAR SHOWN'],
  ['03', 'Parks and play', 'PUBLIC OPEN SPACE · LIMITATIONS SHOWN'],
  ['04', 'Early-years services', 'GEOCODED SERVICES · MATCH STATUS SHOWN'],
] as const

export default function TemplateHomeSections({ onInsight, onMap }: TemplateHomeSectionsProps) {
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <>
      <div className="template-marquee" aria-label="Greater Melbourne locality coverage">
        <div>GREATER MELBOURNE <span>•</span> SA2 LOCALITIES <span>•</span> CHILD DEVELOPMENT <span>•</span> ENVIRONMENT <span>•</span> EARLY YEARS <span>•</span> GREATER MELBOURNE <span>•</span> SA2 LOCALITIES</div>
      </div>

      <section className="template-intro" id="home-insight">
        <div className="template-intro-inner">
          <span className="template-eyebrow">From street to dataset</span>
          <h2 aria-label="A locality is more than an address.">
            {'A locality is more than an address.'.split(' ').map((word, index) => (
              <span key={word} style={{ '--word-index': index } as React.CSSProperties}>{word}</span>
            ))}
          </h2>
          <p>It is the canopy over the path, the heat on the footpath, the places available to play and the early-years support around a family. KinderPrint reads these surroundings together—as one print of place.</p>
          <div className="template-intro-layers">
            {localityLayers.map(([number, title, metric]) => (
              <article key={number}>
                <span>{number}</span>
                <strong>{title}</strong>
                <small>{metric}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="template-layers">
        <div className="template-section-heading"><span className="template-eyebrow">The environmental layers</span><h2>Four layers,<br /><em>one childhood.</em></h2><p>Every locality carries a print made of surroundings—measured together, shown together, never collapsed into a medically authoritative score.</p></div>
        <div className="template-layer-list">
          {layers.map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p><i aria-hidden="true" /></article>)}
        </div>
      </section>

      <section className="template-discovery" id="home-explore">
        <div className="template-discovery-copy"><span className="template-eyebrow">Discovery</span><h2>What matters most<br />for your child?</h2><p>Not a form to fill in—a first look at the layers behind a childhood. Choose a focus, then enter the live Melbourne map.</p></div>
        <div className="template-discovery-tools">
          <div className="template-priorities" role="group" aria-label="Choose an exploration focus">
            {priorities.map((priority, index) => <button type="button" key={priority} aria-pressed={selected === priority} onClick={() => setSelected(selected === priority ? null : priority)}><span>{String(index + 1).padStart(2, '0')}</span>{priority}</button>)}
          </div>
          <div className="template-locality-readout" aria-live="polite">
            <div><span>LOCALITY EXPLORER</span><small>LIVE DATA</small></div>
            <strong>{selected ?? 'All locality layers'}</strong>
            <p>{selected ? `Open the map to inspect ${selected.toLowerCase()} with its source, status and limitations.` : 'Choose a focus above to frame your exploration, or enter the map to inspect all available layers.'}</p>
            <div className="template-map-glyph" aria-hidden="true"><i /><i /><i /><b /></div>
            <button className="template-enter-map" type="button" onClick={onMap}>Explore Melbourne <span aria-hidden="true">↗</span></button>
          </div>
        </div>
      </section>

      <section className="template-compare-story">
        <div>
          <span className="template-eyebrow">Compare</span>
          <h2>Two prints,<br />side by side.</h2>
          <p>Compare localities layer by layer—never ranked, never reduced to a single score, and always with evidence status attached.</p>
          <button type="button" onClick={onMap}>Open the comparison studio <span aria-hidden="true">↗</span></button>
        </div>
        <div className="template-compare-lines" aria-hidden="true">
          <span>CHILD DEVELOPMENT</span><i /><span>ENVIRONMENT</span><i /><span>EARLY YEARS</span><i />
        </div>
      </section>

      <section className="template-method" id="home-about">
        <span className="template-eyebrow">How KinderPrint works</span><h2>From place, to layers,<br />to evidence.</h2>
        <div className="template-method-grid">
          <article><span>01</span><h3>Choose what matters</h3><p>Begin with a family question rather than a ranked list of suburbs.</p></article>
          <article><span>02</span><h3>See the locality layers</h3><p>Move between validated child-development, social and environmental context.</p></article>
          <article><span>03</span><h3>Read it with care</h3><p>Every detailed view carries its status, source and limitations.</p></article>
        </div>
        <button className="template-text-action" type="button" onClick={onInsight}>Enter the Insight Journey <span aria-hidden="true">↗</span></button>
        <div className="template-pathway-callout">
          <span className="template-eyebrow">Health pathways</span>
          <h3>From a locality to the services around it.</h3>
          <p>Follow an evidence layer into the nearby supports represented in KinderPrint, with geographic and data-quality limits kept visible.</p>
          <button type="button" onClick={onInsight}>Preview a pathway <span aria-hidden="true">↗</span></button>
        </div>
      </section>

      <section className="template-evidence" id="home-evidence">
        <div><span className="template-eyebrow">Scientific transparency</span><h2>What this evidence is—<br />and what it is not.</h2><p>KinderPrint supports serious exploration by making the boundary of every layer visible.</p></div>
        <div className="template-evidence-list">
          <details><summary>Aggregate, never individual</summary><p>Every figure describes a locality, never a single child or family.</p></details>
          <details><summary>Description, not diagnosis</summary><p>KinderPrint shows conditions and patterns. It does not assess or label a child’s development.</p></details>
          <details><summary>Difference, not deficiency</summary><p>A difference is a starting point for inquiry, not a verdict on a community.</p></details>
          <details><summary>No “best suburb” list</summary><p>Places are compared without declaring an overall winner.</p></details>
        </div>
      </section>

      <section className="template-final"><span className="template-eyebrow">Enter the map</span><h2>Step into the layers<br />that surround childhood.</h2><p>Begin with a locality and explore its development, environment and support context.</p><button type="button" onClick={onMap}>Explore Melbourne <span aria-hidden="true">↗</span></button></section>
      <footer className="template-footer"><strong>KinderPrint</strong><p>Locality-level evidence for thoughtful exploration—not individual assessment or causal advice.</p><span>Greater Melbourne · ASGS Edition 3</span></footer>
    </>
  )
}
