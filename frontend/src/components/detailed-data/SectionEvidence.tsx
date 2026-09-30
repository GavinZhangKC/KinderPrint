import { indicatorStatusLabel } from '../../services/profileAdapter'
import type { IndicatorProvenance } from '../../types/neighbourhood'
import EvidenceSection from './EvidenceSection'

interface SectionEvidenceEntry {
  label: string
  provenance?: IndicatorProvenance
}

function uniqueValues(values: Array<string | number | null | undefined>) {
  return [...new Set(values.filter((value): value is string | number => value !== null && value !== undefined && value !== ''))]
}

function combinedValue(values: Array<string | number | null | undefined>) {
  const unique = uniqueValues(values)
  return unique.length > 0 ? unique.join(' · ') : null
}

export default function SectionEvidence({ entries }: { entries: SectionEvidenceEntry[] }) {
  const availableEntries = entries.filter((entry) => entry.provenance)
  const provenances = availableEntries.flatMap((entry) => entry.provenance ? [entry.provenance] : [])

  if (provenances.length === 0) return null

  const qualityItems = availableEntries.map((entry) => ({
    label: `${entry.label} quality`,
    value: entry.provenance?.dataQuality,
  }))

  return (
    <div className="drawer-section-evidence">
      <EvidenceSection
        items={[
          { label: 'Source', value: combinedValue(provenances.map((item) => item.source)) },
          { label: 'Reference year', value: combinedValue(provenances.map((item) => item.referenceYear)) },
          { label: 'Geographic unit', value: combinedValue(provenances.map((item) => item.geographicUnit)) },
          { label: 'Data status', value: combinedValue(provenances.map((item) => indicatorStatusLabel(item.status))) },
          ...qualityItems,
        ]}
        limitations={provenances.flatMap((item) => item.limitations)}
        notices={provenances.flatMap((item) => item.notices)}
      />
    </div>
  )
}
