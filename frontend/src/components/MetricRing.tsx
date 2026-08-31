interface MetricRingProps {
  value: number | null
  label: string
  size?: 'small' | 'large'
  tone?: 'primary' | 'positive' | 'concern'
}

export default function MetricRing({ value, label, size = 'small', tone = 'primary' }: MetricRingProps) {
  const available = value !== null && Number.isFinite(value)
  const safeValue = available ? Math.max(0, Math.min(100, value)) : 0
  return (
    <div
      className={`metric-ring metric-ring-${size} ring-${tone}`}
      style={{ '--ring-value': `${safeValue * 3.6}deg` } as React.CSSProperties}
      role="img"
      aria-label={`${label}: ${available ? `${safeValue}%` : 'Not available'}`}
    >
      <div className="metric-ring-inner">
        <strong>{available ? `${safeValue}%` : 'N/A'}</strong>
      </div>
    </div>
  )
}
