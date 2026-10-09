/** Published schedules, guidelines and calendar helpers used by the health action pages. */

export interface ScheduleItem {
  id: string
  ageMonths: number
  when: string
  vaccines: string
  where: string
}

/** National Immunisation Program childhood schedule, June 2026. */
export const NIP_SCHEDULE: ScheduleItem[] = [
  { id: 'nip-birth', ageMonths: 0, when: 'Birth', vaccines: 'Hepatitis B', where: 'Hospital' },
  { id: 'nip-2m', ageMonths: 2, when: '2 months', vaccines: 'Diphtheria, tetanus, whooping cough, hepatitis B, polio, Hib · Rotavirus · Pneumococcal', where: 'GP or council immunisation session' },
  { id: 'nip-4m', ageMonths: 4, when: '4 months', vaccines: 'Diphtheria, tetanus, whooping cough, hepatitis B, polio, Hib · Rotavirus · Pneumococcal', where: 'GP or council immunisation session' },
  { id: 'nip-6m', ageMonths: 6, when: '6 months', vaccines: 'Diphtheria, tetanus, whooping cough, hepatitis B, polio, Hib', where: 'GP or council immunisation session' },
  { id: 'nip-12m', ageMonths: 12, when: '12 months', vaccines: 'Meningococcal ACWY · Measles, mumps, rubella · Pneumococcal', where: 'GP or council immunisation session' },
  { id: 'nip-18m', ageMonths: 18, when: '18 months', vaccines: 'Hib · Measles, mumps, rubella, chickenpox · Diphtheria, tetanus, whooping cough', where: 'GP or council immunisation session' },
  { id: 'nip-4y', ageMonths: 48, when: '4 years', vaccines: 'Diphtheria, tetanus, whooping cough, polio', where: 'GP or council immunisation session' },
  { id: 'nip-y7', ageMonths: 150, when: 'Year 7', vaccines: 'HPV · Diphtheria, tetanus, whooping cough', where: 'School immunisation program' },
  { id: 'nip-y10', ageMonths: 180, when: 'Year 10', vaccines: 'Meningococcal ACWY', where: 'School immunisation program' },
]

export type ScheduleStatus = 'done' | 'catch-up' | 'due-soon' | 'upcoming' | 'school'

export function monthsBetween(birthMonth: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(birthMonth)
  if (!match) return null
  const months = (today.getFullYear() - Number(match[1])) * 12 + (today.getMonth() + 1 - Number(match[2]))
  return months >= 0 ? months : null
}

export function dueDate(birthMonth: string, ageMonths: number): Date {
  const [year, month] = birthMonth.split('-').map(Number)
  return new Date(year, month - 1 + ageMonths, 15)
}

export function scheduleStatus(item: ScheduleItem, birthMonth: string, done: boolean, today = new Date()): ScheduleStatus {
  if (done) return 'done'
  const due = dueDate(birthMonth, item.ageMonths)
  if (item.where.startsWith('School') && due > today) return 'school'
  const days = (due.getTime() - today.getTime()) / 86_400_000
  if (days < -30) return 'catch-up'
  if (days <= 60) return 'due-soon'
  return 'upcoming'
}

export const STATUS_LABEL: Record<ScheduleStatus, string> = {
  done: 'Done', 'catch-up': 'Catch up', 'due-soon': 'Due soon', upcoming: 'Coming up', school: 'Given at school',
}

/** Australian Dietary Guidelines, recommended serves per day. */
export const DAILY_SERVES: Record<string, Array<{ group: string; serves: number; example: string }>> = {
  '2–3 years': [
    { group: 'Vegetables and legumes', serves: 2.5, example: '½ cup cooked vegetables or 1 cup salad' },
    { group: 'Fruit', serves: 1, example: '1 medium apple or 2 small apricots' },
    { group: 'Grain foods', serves: 4, example: '1 slice bread or ½ cup cooked rice' },
    { group: 'Lean meat, fish, eggs, nuts, legumes', serves: 1, example: '2 eggs or 65 g cooked meat' },
    { group: 'Milk, yoghurt, cheese', serves: 1.5, example: '1 cup milk or 2 slices cheese' },
  ],
  '4–8 years': [
    { group: 'Vegetables and legumes', serves: 4.5, example: '½ cup cooked vegetables or 1 cup salad' },
    { group: 'Fruit', serves: 1.5, example: '1 medium apple or 2 small apricots' },
    { group: 'Grain foods', serves: 4, example: '1 slice bread or ½ cup cooked rice' },
    { group: 'Lean meat, fish, eggs, nuts, legumes', serves: 1.5, example: '2 eggs or 65 g cooked meat' },
    { group: 'Milk, yoghurt, cheese', serves: 1.5, example: '1 cup milk or 2 slices cheese' },
  ],
  '9–11 years': [
    { group: 'Vegetables and legumes', serves: 5, example: '½ cup cooked vegetables or 1 cup salad' },
    { group: 'Fruit', serves: 2, example: '1 medium apple or 2 small apricots' },
    { group: 'Grain foods', serves: 4, example: '1 slice bread or ½ cup cooked rice' },
    { group: 'Lean meat, fish, eggs, nuts, legumes', serves: 2.5, example: '2 eggs or 65 g cooked meat' },
    { group: 'Milk, yoghurt, cheese', serves: 2.5, example: '1 cup milk or 2 slices cheese' },
  ],
}

export const OFFICIAL = {
  nipSchedule: 'https://www.health.gov.au/topics/immunisation/immunisation-throughout-life/national-immunisation-program-schedule',
  victorianSchedule: 'https://www.health.vic.gov.au/immunisation/immunisation-schedule-victoria-and-vaccine-eligibility-criteria',
  rsv: 'https://www.health.vic.gov.au/immunisation/respiratory-syncytial-virus-immunisation',
  historyStatement: 'https://www.servicesaustralia.gov.au/immunisation-history-statement',
  serves: 'https://www.eatforhealth.gov.au/food-essentials/how-much-do-we-need-each-day/recommended-number-serves-children-adolescents-and-toddlers',
  heat: 'https://www.health.vic.gov.au/environmental-health/heat-health-warning',
  asthmaForecast: 'https://www.health.vic.gov.au/environmental-health/epidemic-thunderstorm-asthma-risk-forecast',
  airWatch: 'https://www.epa.vic.gov.au/check-air-and-water-quality',
  sunSmart: 'https://www.sunsmart.com.au/',
  waterSafety: 'https://www.royallifesaving.com.au/',
  asthmaPlan: 'https://www.nationalasthma.org.au/living-with-asthma/asthma-action-plans',
  movement: 'https://www.health.gov.au/topics/physical-activity-and-exercise/physical-activity-and-exercise-guidelines-for-all-australians',
  safeSleep: 'https://rednose.org.au/section/safe-sleeping',
} as const

export interface CalendarEvent {
  id: string
  title: string
  date: Date
  description: string
}

function icsDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
}

function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

export function buildCalendar(events: CalendarEvent[]): string {
  const stamp = `${icsDate(new Date())}T000000Z`
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//KinderPrint//Child health reminders//EN', 'CALSCALE:GREGORIAN']
  for (const event of events) {
    const next = new Date(event.date)
    next.setDate(next.getDate() + 1)
    lines.push('BEGIN:VEVENT', `UID:${event.id}@kinderprint`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(event.date)}`, `DTEND;VALUE=DATE:${icsDate(next)}`,
      `SUMMARY:${icsText(event.title)}`, `DESCRIPTION:${icsText(event.description)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P3D', `DESCRIPTION:${icsText(event.title)}`, 'END:VALARM', 'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Opens the family's own email app with the plan pre-filled. Nothing is sent by KinderPrint. */
export function emailToSelf(subject: string, body: string): void {
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.slice(0, 1800))}`
}

export function readStored<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return fallback
    const value: unknown = JSON.parse(raw)
    if (validate) return validate(value) ? value : fallback
    if (value === null || typeof value !== typeof fallback) return fallback
    if (Array.isArray(fallback)) {
      return Array.isArray(value) ? value as T : fallback
    }
    if (Array.isArray(value)) return fallback
    return value as T
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown): void {
  try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

export function nextOccurrence(month: number, day: number, today = new Date()): Date {
  const date = new Date(today.getFullYear(), month, day)
  if (date < today) date.setFullYear(date.getFullYear() + 1)
  return date
}
