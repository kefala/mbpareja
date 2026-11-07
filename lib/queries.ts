import type { Db } from 'mongodb'
import { ObjectId } from 'mongodb'

import {
  appMetaCol,
  bankAccountsCol,
  budgetMonthsCol,
  categoriesCol,
  expensesCol
} from '@/lib/collections'
import { computeMonthIndicators } from '@/lib/indicators'
import { formatDateOnly } from '@/lib/months'
import type { BudgetMonthDoc, MonthIndicators } from '@/types/domain'

export async function listActiveCategories(db: Db) {
  const rows = await categoriesCol(db)
    .find({ $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] })
    .sort({ name: 1 })
    .toArray()
  return rows.map((c) => ({
    id: String(c._id),
    name: c.name,
    archived: false
  }))
}

export async function listAllCategories(db: Db) {
  const rows = await categoriesCol(db).find({}).sort({ name: 1 }).toArray()
  return rows.map((c) => ({
    id: String(c._id),
    name: c.name,
    archived: Boolean(c.archivedAt)
  }))
}

export async function getActiveBudgetMonth(db: Db): Promise<BudgetMonthDoc> {
  const meta = await appMetaCol(db).findOne({ _id: 'singleton' })
  if (!meta) throw new Error('App no inicializada')
  const doc = await budgetMonthsCol(db).findOne({ isActive: true })
  if (!doc) throw new Error('No hay mes activo')
  return doc
}

export async function spentByCategoryForMonth(
  db: Db,
  yearMonth: string
): Promise<Map<string, number>> {
  const agg = await expensesCol(db)
    .aggregate<{ _id: string; total: number }>([
      { $match: { yearMonth } },
      { $group: { _id: '$categoryId', total: { $sum: '$amountCents' } } }
    ])
    .toArray()
  const m = new Map<string, number>()
  for (const row of agg) m.set(row._id, row.total)
  return m
}

export async function accountsSnapshot(db: Db) {
  const rows = await bankAccountsCol(db).find({}).sort({ name: 1 }).toArray()
  const accounts = rows.map((a) => ({
    id: String(a._id),
    name: a.name,
    balanceCents: a.balanceCents
  }))
  const totalCents = accounts.reduce((s, a) => s + a.balanceCents, 0)
  return { accounts, totalCents }
}

export async function buildMonthIndicators(
  db: Db,
  month: BudgetMonthDoc,
  opts?: { includeArchivedCategories?: boolean }
): Promise<MonthIndicators> {
  const cats = opts?.includeArchivedCategories
    ? await listAllCategories(db)
    : await listActiveCategories(db)
  const spent = await spentByCategoryForMonth(db, month.yearMonth)
  const { totalCents } = await accountsSnapshot(db)
  return computeMonthIndicators({
    lines: month.lines,
    spentByCategory: spent,
    categories: cats.map((c) => ({
      id: c.id,
      name: c.archived ? `${c.name} (arch.)` : c.name
    })),
    accountsTotalCents: totalCents
  })
}

export async function listClosedMonths(db: Db) {
  const months = await budgetMonthsCol(db)
    .find({ status: 'closed' })
    .sort({ yearMonth: -1 })
    .toArray()

  const out = []
  for (const m of months) {
    const spent = await spentByCategoryForMonth(db, m.yearMonth)
    let spentTotal = 0
    for (const v of spent.values()) spentTotal += v
    const budgetTotal = m.lines.reduce((s, l) => s + l.amountCents, 0)
    out.push({
      yearMonth: m.yearMonth,
      status: m.status,
      closedAt: m.closedAt ?? null,
      budgetTotalCents: budgetTotal,
      spentTotalCents: spentTotal,
      remainingTotalCents: budgetTotal - spentTotal
    })
  }
  return out
}

export async function serializeExpense(
  db: Db,
  id: string
) {
  if (!ObjectId.isValid(id)) return null
  const doc = await expensesCol(db).findOne({ _id: new ObjectId(id) })
  if (!doc) return null
  const cat = await categoriesCol(db).findOne({ _id: new ObjectId(doc.categoryId) })
  return {
    id: String(doc._id),
    amountCents: doc.amountCents,
    categoryId: doc.categoryId,
    categoryName: cat?.name ?? '(sin categoría)',
    date: formatDateOnly(doc.date),
    yearMonth: doc.yearMonth
  }
}
