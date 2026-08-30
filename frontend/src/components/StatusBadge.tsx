import type { SemanticStatus } from '../types/neighbourhood'

interface StatusBadgeProps {
  status: SemanticStatus
  compact?: boolean
}

export default function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  return <span className={`status-badge status-${status.toLowerCase()} ${compact ? 'compact' : ''}`}>{status}</span>
}
