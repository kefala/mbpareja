/** Importes en datos: enteros en céntimos. UI: siempre 2 decimales. */

export function eurosToCents(euros: number): number {
  if (!Number.isFinite(euros)) throw new Error('Importe inválido')
  return Math.round(euros * 100)
}

export function centsToEuros(cents: number): number {
  if (!Number.isInteger(cents)) throw new Error('Céntimos deben ser enteros')
  return cents / 100
}

/** Parsea input UI ("12,34" | "12.34" | "12") → céntimos. */
export function parseEurosToCents(raw: string): number {
  const t = raw.trim().replace(/\s/g, '')
  if (!t) throw new Error('Importe vacío')
  const normalized = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t
  const n = Number(normalized)
  if (!Number.isFinite(n)) throw new Error('Importe inválido')
  return eurosToCents(n)
}

/** Formato UI fijo a 2 decimales (sin símbolo). Ej: 12345 → "123.45" */
export function formatCents(cents: number, locale = 'es-ES'): string {
  if (!Number.isInteger(cents)) throw new Error('Céntimos deben ser enteros')
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(centsToEuros(cents))
}

/** Formato UI con moneda EUR. */
export function formatCentsCurrency(cents: number, locale = 'es-ES'): string {
  if (!Number.isInteger(cents)) throw new Error('Céntimos deben ser enteros')
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(centsToEuros(cents))
}
