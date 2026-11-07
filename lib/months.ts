const YM_RE = /^(\d{4})-(\d{2})$/

export function isValidYearMonth(ym: string): boolean {
  const m = YM_RE.exec(ym)
  if (!m) return false
  const month = Number(m[2])
  return month >= 1 && month <= 12
}

export function currentYearMonth(d = new Date()): string {
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth() + 1
  return `${y}-${String(mo).padStart(2, '0')}`
}

export function addMonths(yearMonth: string, delta: number): string {
  if (!isValidYearMonth(yearMonth)) throw new Error(`yearMonth inválido: ${yearMonth}`)
  const [ys, ms] = yearMonth.split('-')
  const y = Number(ys)
  const m = Number(ms)
  const idx = y * 12 + (m - 1) + delta
  const ny = Math.floor(idx / 12)
  const nm = (idx % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function yearMonthFromDate(d: Date): string {
  const y = d.getUTCFullYear()
  const mo = d.getUTCMonth() + 1
  return `${y}-${String(mo).padStart(2, '0')}`
}

/** Fecha date-only en UTC a medianoche. Acepta YYYY-MM-DD. */
export function parseDateOnly(raw: string): Date {
  const t = raw.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (!m) throw new Error('Fecha inválida (usa YYYY-MM-DD)')
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) throw new Error('Fecha inválida')
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    throw new Error('Fecha inválida')
  return dt
}

export function formatDateOnly(d: Date): string {
  const y = d.getUTCFullYear()
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${mo}-${day}`
}

export function labelYearMonth(yearMonth: string, locale = 'es-ES'): string {
  if (!isValidYearMonth(yearMonth)) return yearMonth
  const [ys, ms] = yearMonth.split('-')
  const d = new Date(Date.UTC(Number(ys), Number(ms) - 1, 1))
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}

/** Compacto para tablas mobile: 2026-10 → 10/26 */
export function labelYearMonthShort(yearMonth: string): string {
  if (!isValidYearMonth(yearMonth)) return yearMonth
  const [ys, ms] = yearMonth.split('-')
  return `${ms}/${ys!.slice(2)}`
}

/** ISO YYYY-MM-DD → DD/MM/YY para UI compacta */
export function labelDateShort(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim())
  if (!m) return isoDate
  return `${m[2]}/${m[3]}/${m[1]!.slice(2)}`
}
