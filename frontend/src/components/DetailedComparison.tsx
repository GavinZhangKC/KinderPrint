import MetricRing from './MetricRing'
import StatusBadge from './StatusBadge'
import type { Neighbourhood } from '../types/neighbourhood'

interface DetailedComparisonProps {
  a: Neighbourhood
  b: Neighbourhood
  similarity: number
  onBack: () => void
}

function statusForHeat(value: Neighbourhood['heatExposure']) {
  return value === 'High' ? 'Concern' : value === 'Low' ? 'Strong' : 'Moderate'
}

export default function DetailedComparison({ a, b, similarity, onBack }: DetailedComparisonProps) {
  const difference = Math.abs(a.developmentalVulnerability - b.developmentalVulnerability)
  const aLower = a.developmentalVulnerability <= b.developmentalVulnerability
  return (
    <main className="comparison-page page-enter">
      <div className="comparison-heading-row">
        <div>
          <button className="text-back" type="button" onClick={onBack}>← Back to map</button>
          <h1>Detailed Comparison</h1>
          <h2>{a.name} <span>vs</span> {b.name}</h2>
          <p>Compare child development, social context and environmental conditions across the two selected neighbourhoods.</p>
        </div>
        <span className="similarity-chip">Similarity {similarity}%</span>
      </div>

      <section className="glass comparison-section child-comparison-section reveal-section">
        <span className="eyebrow">CHILD DEVELOPMENT COMPARISON</span>
        <h3>Developmental vulnerability</h3>
        <p className="section-copy">The two indicators are placed first because child development is the primary comparison outcome.</p>
        <div className="hero-ring-grid">
          {[a, b].map((item, index) => {
            const lower = index === 0 ? aLower : !aLower
            return (
              <article className="glass-subtle hero-ring-card" key={item.id}>
                <h4>{item.name}</h4>
                <div className="hero-ring-content">
                  <MetricRing value={item.developmentalVulnerability} label="Developmental vulnerability" size="large" tone={lower ? 'positive' : 'concern'} />
                  <div className="hero-ring-copy">
                    <StatusBadge status={lower ? 'Strong' : 'Concern'} />
                    <strong>{item.developmentalVulnerability}% developmental vulnerability</strong>
                    <p>{lower ? `${difference} percentage points lower than ${index === 0 ? b.name : a.name}` : 'Higher relative vulnerability in this comparison'}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">COMPARISON SUMMARY</span>
        <div className="summary-grid">
          <article className="glass-subtle summary-card">
            <h3>Social & Demographic Similarity</h3>
            <strong className="summary-number">{similarity}%</strong>
            <p>SEIFA · Demographic · Household · Remoteness</p>
          </article>
          <article className="glass-subtle summary-card">
            <h3>Priority Context</h3>
            <div className="priority-pair"><span>A · {a.priority}</span><span>B · {b.priority}</span></div>
          </article>
          <article className="glass-subtle summary-card insight-summary">
            <h3>Key Insight</h3>
            <p>{a.name} has {a.developmentalVulnerability < b.developmentalVulnerability ? 'lower' : 'higher'} developmental vulnerability, while {b.name} shows {b.treeCanopy > a.treeCanopy ? 'stronger' : 'weaker'} vegetation conditions. These patterns may warrant further investigation.</p>
          </article>
        </div>
      </section>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">ENVIRONMENT COMPARISON</span>
        <h3>Environmental conditions</h3>
        <p className="section-copy">Compare the environmental conditions that may shape local context.</p>
        <div className="environment-comparison-grid">
          <article className="glass-subtle environmental-compare-card">
            <h4>Heat Exposure</h4>
            <div className="compare-value-row"><span>{a.name}</span><StatusBadge status={statusForHeat(a.heatExposure)} compact /><strong>{a.heatExposure}</strong></div>
            <div className="compare-value-row"><span>{b.name}</span><StatusBadge status={statusForHeat(b.heatExposure)} compact /><strong>{b.heatExposure}</strong></div>
          </article>
          <article className="glass-subtle environmental-compare-card">
            <h4>Tree Canopy</h4>
            <div className="bar-compare"><span>{a.name}</span><div><i style={{ width: `${a.treeCanopy}%` }} /></div><strong>{a.treeCanopy}%</strong></div>
            <div className="bar-compare"><span>{b.name}</span><div><i style={{ width: `${b.treeCanopy}%` }} /></div><strong>{b.treeCanopy}%</strong></div>
          </article>
          <article className="glass-subtle environmental-compare-card">
            <h4>Green-Space Access</h4>
            <div className="bar-compare"><span>{a.name}</span><div><i style={{ width: `${a.greenSpaceAccess}%` }} /></div><strong>{a.greenSpaceAccess}%</strong></div>
            <div className="bar-compare"><span>{b.name}</span><div><i style={{ width: `${b.greenSpaceAccess}%` }} /></div><strong>{b.greenSpaceAccess}%</strong></div>
          </article>
        </div>
      </section>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">KEY DIFFERENCES</span>
        <div className="difference-grid">
          <article className="glass-subtle difference-card"><span>01</span><div><h3>Child development</h3><p>{a.name}: {a.developmentalVulnerability}% vulnerability · {b.name}: {b.developmentalVulnerability}%.</p></div></article>
          <article className="glass-subtle difference-card"><span>02</span><div><h3>Heat exposure</h3><p>{a.name}: {a.heatExposure} · {b.name}: {b.heatExposure}.</p></div></article>
          <article className="glass-subtle difference-card"><span>03</span><div><h3>Vegetation</h3><p>{b.treeCanopy > a.treeCanopy ? b.name : a.name} has the greater tree-canopy coverage in this comparison.</p></div></article>
        </div>
      </section>

      <section className="glass comparison-section reveal-section">
        <span className="eyebrow">SUGGESTED NEXT STEPS</span>
        <div className="next-step-grid">
          <article className="glass-subtle next-step-card"><span>01</span><h3>Tree Canopy</h3><p>Review vegetation coverage and local greening context where lower canopy is observed.</p></article>
          <article className="glass-subtle next-step-card"><span>02</span><h3>Heat Exposure</h3><p>Examine whether heat-exposure differences align with local built-environment conditions.</p></article>
          <article className="glass-subtle next-step-card"><span>03</span><h3>Green-Space Access</h3><p>Validate access measures with local context before drawing conclusions about service needs.</p></article>
        </div>
        <div className="comparison-notice">
          These are investigation leads only. They are not evidence of causation or prescribed interventions. Human decision-making and local validation remain required.
        </div>
      </section>
    </main>
  )
}
