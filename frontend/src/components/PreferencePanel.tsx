import { preferenceOptions } from '../data/mockData'
import type { PreferenceId } from '../types/neighbourhood'

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
