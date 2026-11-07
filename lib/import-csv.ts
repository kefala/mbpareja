import type { ClientSession, Db } from 'mongodb'

import {
  appMetaCol,
  budgetMonthsCol,
  categoriesCol,
  expensesCol
} from '@/lib/collections'
import { parseEurosToCents } from '@/lib/money'
import { getMongoClient } from '@/lib/mongodb'
import { isValidYearMonth } from '@/lib/months'
import type { BudgetLine } from '@/types/domain'

export interface CsvHistoricoRow {
  line: number
  categoryName: string
  yearMonth: string | null
  budgetCents: number | null
  spentCents: number | null
}

export interface ImportIssue {
  line: number
  level: 'error' | 'warning'
  message: string
}

export interface ImportPreview {
  rows: CsvHistoricoRow[]
  issues: ImportIssue[]
  summary: {
    categoryCreates: string[]
    categoryExisting: string[]
    monthsToUpsert: string[]
    monthsProtectedSkipped: string[]
    expenseCreates: number
    expenseDuplicates: number
    budgetLineUpserts: number
    categoryOnlyRows: number
  }
  canConfirm: boolean
}

function detectDelimiter(headerLine: string): ',' | ';' {
  const commas = (headerLine.match(/,/g) ?? []).length
  const semis = (headerLine.match(/;/g) ?? []).length
  return semis > commas ? ';' : ','
}

function parseCsvLine(line: string, delimiter: ',' | ';'): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
      continue
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

const CATEGORY_KEYS = new Set(['categoria', 'category', 'nombre', 'name'])
const YM_KEYS = new Set(['year_month', 'yearmonth', 'anio_mes', 'mes', 'periodo'])
const BUDGET_KEYS = new Set(['presupuesto', 'budget', 'presupuesto_eur', 'presup'])
const SPENT_KEYS = new Set(['gasto', 'spent', 'gasto_eur', 'ejecutado', 'gastado'])

function pickCol(headers: string[], keys: Set<string>): number {
  return headers.findIndex((h) => keys.has(h))
}

export function parseHistoricoCsv(raw: string): {
  rows: CsvHistoricoRow[]
  issues: ImportIssue[]
} {
  const text = raw.replace(/^\uFEFF/, '').trim()
  const issues: ImportIssue[] = []
  if (!text) {
    issues.push({ line: 0, level: 'error', message: 'CSV vacío' })
    return { rows: [], issues }
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) {
    issues.push({ line: 1, level: 'error', message: 'Falta cabecera o filas de datos' })
    return { rows: [], issues }
  }

  const delimiter = detectDelimiter(lines[0]!)
  const headers = parseCsvLine(lines[0]!, delimiter).map(normalizeHeader)
  const iCat = pickCol(headers, CATEGORY_KEYS)
  const iYm = pickCol(headers, YM_KEYS)
  const iBudget = pickCol(headers, BUDGET_KEYS)
  const iSpent = pickCol(headers, SPENT_KEYS)

  if (iCat < 0) {
    issues.push({
      line: 1,
      level: 'error',
      message: 'Falta columna categoria (o category/nombre)'
    })
    return { rows: [], issues }
  }

  const rows: CsvHistoricoRow[] = []
  for (let li = 1; li < lines.length; li++) {
    const lineNo = li + 1
    const cols = parseCsvLine(lines[li]!, delimiter)
    const categoryName = (cols[iCat] ?? '').trim()
    if (!categoryName) {
      issues.push({ line: lineNo, level: 'error', message: 'Categoría vacía' })
      continue
    }

    const ymRaw = iYm >= 0 ? (cols[iYm] ?? '').trim() : ''
    const budgetRaw = iBudget >= 0 ? (cols[iBudget] ?? '').trim() : ''
    const spentRaw = iSpent >= 0 ? (cols[iSpent] ?? '').trim() : ''

    if (!ymRaw && !budgetRaw && !spentRaw) {
      rows.push({
        line: lineNo,
        categoryName,
        yearMonth: null,
        budgetCents: null,
        spentCents: null
      })
      continue
    }

    if (!ymRaw || !isValidYearMonth(ymRaw)) {
      issues.push({
        line: lineNo,
        level: 'error',
        message: `year_month inválido (usa YYYY-MM): "${ymRaw}"`
      })
      continue
    }

    let budgetCents: number | null = null
    let spentCents: number | null = null
    try {
      if (budgetRaw) budgetCents = parseEurosToCents(budgetRaw)
      if (spentRaw) spentCents = parseEurosToCents(spentRaw)
    } catch (e) {
      issues.push({
        line: lineNo,
        level: 'error',
        message: e instanceof Error ? e.message : 'Importe inválido'
      })
      continue
    }

    if (budgetCents == null && spentCents == null) {
      issues.push({
        line: lineNo,
        level: 'error',
        message: 'Indica presupuesto y/o gasto, o deja year_month vacío para solo categoría'
      })
      continue
    }

    if (budgetCents != null && budgetCents < 0) {
      issues.push({ line: lineNo, level: 'error', message: 'Presupuesto no puede ser negativo' })
      continue
    }
    if (spentCents != null && spentCents < 0) {
      issues.push({ line: lineNo, level: 'error', message: 'Gasto no puede ser negativo' })
      continue
    }

    rows.push({
      line: lineNo,
      categoryName,
      yearMonth: ymRaw,
      budgetCents,
      spentCents
    })
  }

  return { rows, issues }
}

async function protectedYearMonths(db: Db): Promise<Set<string>> {
  const meta = await appMetaCol(db).findOne({ _id: 'singleton' })
  const protectedSet = new Set<string>()
  if (meta?.activeYearMonth) protectedSet.add(meta.activeYearMonth)

  const open = await budgetMonthsCol(db)
    .find({ status: 'open' })
    .project({ yearMonth: 1, isActive: 1 })
    .toArray()
  for (const m of open) protectedSet.add(m.yearMonth)
  return protectedSet
}

function normCat(name: string): string {
  return name.trim().toLowerCase()
}

export async function buildImportPreview(db: Db, rawCsv: string): Promise<ImportPreview> {
  const { rows, issues } = parseHistoricoCsv(rawCsv)
  const protectedYm = await protectedYearMonths(db)

  const existingCats = await categoriesCol(db).find({}).toArray()
  const catByNorm = new Map(existingCats.map((c) => [normCat(c.name), c]))

  const categoryCreates = new Set<string>()
  const categoryExisting = new Set<string>()
  const monthsToUpsert = new Set<string>()
  const monthsProtectedSkipped = new Set<string>()
  let expenseCreates = 0
  let expenseDuplicates = 0
  let budgetLineUpserts = 0
  let categoryOnlyRows = 0

  const pendingCatIds = new Map<string, string>() // norm -> temp or existing id

  for (const row of rows) {
    const n = normCat(row.categoryName)
    const existing = catByNorm.get(n)
    if (existing) {
      categoryExisting.add(existing.name)
      pendingCatIds.set(n, String(existing._id))
    } else {
      categoryCreates.add(row.categoryName.trim())
      pendingCatIds.set(n, `new:${n}`)
    }

    if (!row.yearMonth) {
      categoryOnlyRows++
      continue
    }

    if (protectedYm.has(row.yearMonth)) {
      monthsProtectedSkipped.add(row.yearMonth)
      issues.push({
        line: row.line,
        level: 'warning',
        message: `Mes ${row.yearMonth} protegido (activo o planificación): se omitirá`
      })
      continue
    }

    monthsToUpsert.add(row.yearMonth)
    if (row.budgetCents != null) budgetLineUpserts++

    if (row.spentCents != null && row.spentCents > 0) {
      const catId = pendingCatIds.get(n)!
      const importKey = `${catId}:${row.yearMonth}`
      if (!catId.startsWith('new:')) {
        const dup = await expensesCol(db).findOne({ importKey })
        if (dup) {
          expenseDuplicates++
          issues.push({
            line: row.line,
            level: 'warning',
            message: `Duplicado import ${row.categoryName} ${row.yearMonth}: se omitirá el gasto`
          })
        } else expenseCreates++
      } else expenseCreates++
    }
  }

  const hasErrors = issues.some((i) => i.level === 'error')
  return {
    rows,
    issues,
    summary: {
      categoryCreates: [...categoryCreates].sort((a, b) => a.localeCompare(b, 'es')),
      categoryExisting: [...categoryExisting].sort((a, b) => a.localeCompare(b, 'es')),
      monthsToUpsert: [...monthsToUpsert].sort(),
      monthsProtectedSkipped: [...monthsProtectedSkipped].sort(),
      expenseCreates,
      expenseDuplicates,
      budgetLineUpserts,
      categoryOnlyRows
    },
    canConfirm: !hasErrors && rows.length > 0
  }
}

function importExpenseDate(yearMonth: string): Date {
  const [ys, ms] = yearMonth.split('-')
  return new Date(Date.UTC(Number(ys), Number(ms) - 1, 1))
}

export interface ImportApplyResult {
  categoriesCreated: number
  monthsUpserted: number
  expensesCreated: number
  expensesSkippedDuplicates: number
  rowsSkippedProtected: number
}

export async function applyImportCsv(
  db: Db,
  rawCsv: string
): Promise<{ preview: ImportPreview; applied: ImportApplyResult }> {
  const preview = await buildImportPreview(db, rawCsv)
  if (!preview.canConfirm) throw new Error('Importación no válida; corrige errores antes de confirmar')

  const client = await getMongoClient()
  const session = client.startSession()
  const protectedYm = await protectedYearMonths(db)

  let applied: ImportApplyResult = {
    categoriesCreated: 0,
    monthsUpserted: 0,
    expensesCreated: 0,
    expensesSkippedDuplicates: 0,
    rowsSkippedProtected: 0
  }
  try {
    await session.withTransaction(async () => {
      applied = await applyInSession(db, session, preview.rows, protectedYm)
    })
  } finally {
    await session.endSession()
  }

  return { preview, applied }
}

async function applyInSession(
  db: Db,
  session: ClientSession,
  rows: CsvHistoricoRow[],
  protectedYm: Set<string>
): Promise<ImportApplyResult> {
  const now = new Date()
  const existingCats = await categoriesCol(db).find({}, { session }).toArray()
  const catByNorm = new Map(existingCats.map((c) => [normCat(c.name), c]))
  let categoriesCreated = 0
  let rowsSkippedProtected = 0
  let expensesCreated = 0
  let expensesSkippedDuplicates = 0

  async function ensureCategory(name: string): Promise<string> {
    const n = normCat(name)
    const hit = catByNorm.get(n)
    if (hit?._id) return String(hit._id)
    const result = await categoriesCol(db).insertOne(
      {
        name: name.trim(),
        createdAt: now,
        updatedAt: now,
        archivedAt: null
      },
      { session }
    )
    const doc = {
      _id: result.insertedId,
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    }
    catByNorm.set(n, doc)
    categoriesCreated++
    return String(result.insertedId)
  }

  const budgetByMonth = new Map<string, Map<string, number>>()
  const spentByMonth = new Map<string, Map<string, number>>()

  for (const row of rows) {
    const categoryId = await ensureCategory(row.categoryName)
    if (!row.yearMonth) continue
    if (protectedYm.has(row.yearMonth)) {
      rowsSkippedProtected++
      continue
    }

    if (row.budgetCents != null) {
      if (!budgetByMonth.has(row.yearMonth)) budgetByMonth.set(row.yearMonth, new Map())
      budgetByMonth.get(row.yearMonth)!.set(categoryId, row.budgetCents)
    }
    if (row.spentCents != null && row.spentCents > 0) {
      if (!spentByMonth.has(row.yearMonth)) spentByMonth.set(row.yearMonth, new Map())
      const prev = spentByMonth.get(row.yearMonth)!.get(categoryId) ?? 0
      spentByMonth.get(row.yearMonth)!.set(categoryId, prev + row.spentCents)
    }
  }

  const allMonths = new Set([...budgetByMonth.keys(), ...spentByMonth.keys()])
  let monthsUpserted = 0

  for (const yearMonth of allMonths) {
    const existing = await budgetMonthsCol(db).findOne({ yearMonth }, { session })
    if (existing && (existing.isActive || existing.status === 'open')) continue

    const budgetMap = budgetByMonth.get(yearMonth) ?? new Map()
    let lines: BudgetLine[] = existing?.lines ? existing.lines.map((l) => ({ ...l })) : []
    const lineByCat = new Map(lines.map((l) => [l.categoryId, l.amountCents]))
    for (const [categoryId, amountCents] of budgetMap) {
      lineByCat.set(categoryId, amountCents)
    }
    lines = [...lineByCat.entries()].map(([categoryId, amountCents]) => ({
      categoryId,
      amountCents
    }))

    if (existing?._id) {
      await budgetMonthsCol(db).updateOne(
        { _id: existing._id },
        {
          $set: {
            status: 'closed',
            isActive: false,
            lines,
            updatedAt: now,
            closedAt: existing.closedAt ?? now
          }
        },
        { session }
      )
    } else {
      await budgetMonthsCol(db).insertOne(
        {
          yearMonth,
          status: 'closed',
          isActive: false,
          lines,
          createdAt: now,
          updatedAt: now,
          closedAt: now
        },
        { session }
      )
    }
    monthsUpserted++

    const spentMap = spentByMonth.get(yearMonth) ?? new Map()
    for (const [categoryId, amountCents] of spentMap) {
      const importKey = `${categoryId}:${yearMonth}`
      const dup = await expensesCol(db).findOne({ importKey }, { session })
      if (dup) {
        expensesSkippedDuplicates++
        continue
      }
      await expensesCol(db).insertOne(
        {
          amountCents,
          categoryId,
          date: importExpenseDate(yearMonth),
          yearMonth,
          createdAt: now,
          updatedAt: now,
          source: 'import',
          importKey
        },
        { session }
      )
      expensesCreated++
    }
  }

  return {
    categoriesCreated,
    monthsUpserted,
    expensesCreated,
    expensesSkippedDuplicates,
    rowsSkippedProtected
  }
}

export const CSV_TEMPLATE = `categoria,year_month,presupuesto,gasto
Alquiler,2024-01,800.00,800.00
Supermercado,2024-01,400.00,350.50
Agua,2024-01,30.00,28.15
NuevaCategoria,,,
`
