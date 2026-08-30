interface MetricRingProps {
  value: number
  label: string
  size?: 'small' | 'large'
  tone?: 'primary' | 'positive' | 'concern'
}

export default function MetricRing({ value, label, size = 'small', tone = 'primary' }: MetricRingProps) {
  const safeValue = Math.max(0, Math.min(100, value))
  return (
    <div
      className={`metric-ring metric-ring-${size} ring-${tone}`}
      style={{ '--ring-value': `${safeValue * 3.6}deg` } as React.CSSProperties}
      role="img"
      aria-label={`${label}: ${safeValue}%`}
    >
      <div className="metric-ring-inner">
        <strong>{safeValue}%</strong>
      </div>
    </div>
  )
}
