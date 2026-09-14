import type { PreferenceId } from '../types/neighbourhood'
const preferenceOptions: Array<{ id: PreferenceId; label: string; short: string }> = [
  { id: 'development', label: 'Learning & development', short: 'Development' },
  { id: 'heat', label: 'Heat & outdoor comfort', short: 'Heat' },
  { id: 'social', label: 'Social context', short: 'Context' },
  { id: 'vegetation', label: 'Canopy & nature', short: 'Nature' },
  { id: 'green-space', label: 'Parks & open space', short: 'Play' },
]


interface PreferencePanelProps {
  value: PreferenceId | null
  onChange: (value: PreferenceId | null) => void
}

export default function PreferencePanel({ value, onChange }: PreferencePanelProps) {
  return (
    <section className="glass map-control preference-card" aria-labelledby="preference-title">
      <div className="preference-heading">
        <span>Explore a layer</span>
        <h2 id="preference-title">What matters here?</h2>
      </div>
      <div className="preference-options" role="radiogroup" aria-labelledby="preference-title">
        {preferenceOptions.map((option) => (
          <label key={option.id} className="preference-option">
            <input
              type="radio"
              name="priority-layer"
              checked={value === option.id}
              onClick={(event) => {
                if (value === option.id) {
                  event.preventDefault()
                  onChange(null)
                }
              }}
              onChange={() => onChange(option.id)}
            />
            <span className="preference-orbit" aria-hidden="true"><i /></span>
            <span className="preference-copy"><strong>{option.short}</strong><small>{option.label}</small></span>
          </label>
        ))}
      </div>
    </section>
  )
}
