import type { PreferenceId } from '../types/neighbourhood'

interface LegendProps {
  preference: PreferenceId | null
}

const labels: Record<PreferenceId, { title: string; low: string; middle: string; high: string }> = {
  development: { title: 'DEVELOPMENT', low: 'Needs attention', middle: 'Moderate', high: 'Strong' },
  heat: { title: 'HEAT EXPOSURE', low: 'Low', middle: 'Moderate', high: 'High' },
  social: { title: 'SOCIAL DISADVANTAGE', low: 'Low', middle: 'Moderate', high: 'High' },
  vegetation: { title: 'VEGETATION', low: 'Low', middle: 'Moderate', high: 'Strong' },
  'green-space': { title: 'GREEN SPACE', low: 'Low', middle: 'Moderate', high: 'Strong' },
}

export default function Legend({ preference }: LegendProps) {
  const active = preference ? labels[preference] : labels.heat
  const positive = preference === 'development' || preference === 'vegetation' || preference === 'green-space'
  return (
    <section className="glass map-control legend-card" aria-labelledby="legend-title">
      <h2 id="legend-title">Legend</h2>
      <p>{active.title}</p>
      <div className="legend-row"><i className={`legend-swatch ${positive ? 'positive-low' : 'risk-low'}`} />{active.low}</div>
      <div className="legend-row"><i className="legend-swatch mid" />{active.middle}</div>
      <div className="legend-row"><i className={`legend-swatch ${positive ? 'positive-high' : 'risk-high'}`} />{active.high}</div>
    </section>
  )
}
