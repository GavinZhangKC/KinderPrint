import type { PreferenceId } from '../types/neighbourhood'
const preferenceOptions: Array<{ id: PreferenceId; label: string }> = [
  { id: 'development', label: 'Development' },
  { id: 'heat', label: 'Heat' },
  { id: 'social', label: 'Social Disadvantage' },
  { id: 'vegetation', label: 'Vegetation' },
  { id: 'green-space', label: 'Green Space' },
]


interface PreferencePanelProps {
  value: PreferenceId | null
  onChange: (value: PreferenceId | null) => void
}

export default function PreferencePanel({ value, onChange }: PreferencePanelProps) {
  return (
    <section className="glass map-control preference-card" aria-labelledby="preference-title">
      <h2 id="preference-title">Overall Priority</h2>
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
            <span className={`custom-radio ${value === option.id ? 'is-selected' : ''}`} aria-hidden="true" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </section>
  )
}
