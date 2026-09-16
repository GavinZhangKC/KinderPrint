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

function uniqueUserFacingMessages(messages: string[], excluded = new Set<string>()) {
  const seen = new Set(excluded)

  return messages.flatMap((message) => {
    const normalized = message.trim()
    if (!normalized || !isUserFacingMessage(normalized) || seen.has(normalized)) {
      return []
    }

    seen.add(normalized)
    return [normalized]
  })
}

export default function EvidenceSection({
  items,
  limitations = [],
  notices = [],
}: EvidenceSectionProps) {
  const visibleItems = items.filter(({ value }) => value !== null && value !== undefined && value !== '')
  const visibleLimitations = uniqueUserFacingMessages(limitations)
  const visibleNotices = uniqueUserFacingMessages(notices, new Set(visibleLimitations))

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
