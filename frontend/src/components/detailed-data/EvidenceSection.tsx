import type { ReactNode } from 'react'

interface EvidenceItem {
  label: string
  value: ReactNode
}

interface EvidenceSectionProps {
  items: EvidenceItem[]
  limitations?: string[]
  notices?: string[]
}

function isUserFacingMessage(message: string) {
  return !/(environment variable|file path|\.json\b|\.csv\b|configured|configuration|backend|KINDERPRINT_)/i.test(message)
}

export default function EvidenceSection({
  items,
  limitations = [],
  notices = [],
}: EvidenceSectionProps) {
  const visibleItems = items.filter(({ value }) => value !== null && value !== undefined && value !== '')
  const visibleLimitations = limitations.filter((message) => message && isUserFacingMessage(message))
  const visibleNotices = notices.filter((message) => message && isUserFacingMessage(message))

  if (visibleItems.length === 0 && visibleLimitations.length === 0 && visibleNotices.length === 0) {
    return null
  }

  return (
    <details className="drawer-evidence">
      <summary><span>Evidence</span></summary>
      <div className="drawer-metric-provenance">
        {visibleItems.length > 0 && (
          <dl>
            {visibleItems.map((item) => (
              <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
            ))}
          </dl>
        )}
        {visibleLimitations.map((message) => <p className="evidence-limitation" key={message}>{message}</p>)}
        {visibleNotices.map((message) => <p className="evidence-notice" key={message}>{message}</p>)}
      </div>
    </details>
  )
}
