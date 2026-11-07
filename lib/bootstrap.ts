import type { Db } from 'mongodb'

import {
  appMetaCol,
  bankAccountsCol,
  budgetMonthsCol,
  categoriesCol,
  expensesCol
} from '@/lib/collections'
import { addMonths, currentYearMonth } from '@/lib/months'

const SEED_CATEGORY_NAMES = [
  'Pepephone',
  'IKEA / Cosas de la casa',
  'Alquiler',
  'Agua',
  'Luz',
  'Gas',
  'Viajes',
  'Samsung / Financiación',
  'Supermercado',
  'Perros',
  'Citas',
  'Limpieza',
  'Mofletes'
]

const DEFAULT_ACCOUNTS = ['Cuenta conjunta', 'Cuenta ahorro']

declare global {
  // eslint-disable-next-line no-var
  var __mbparejaBootstrapped: Promise<void> | undefined
}

export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    budgetMonthsCol(db).createIndex({ yearMonth: 1 }, { unique: true }),
    expensesCol(db).createIndex({ yearMonth: 1, categoryId: 1 }),
    expensesCol(db).createIndex({ date: 1 }),
    categoriesCol(db).createIndex(
      { name: 1 },
      { unique: true, collation: { locale: 'es', strength: 2 } }
    ),
    budgetMonthsCol(db).createIndex({ isActive: 1 })
  ])
}

async function seedIfEmpty(db: Db): Promise<void> {
  const meta = appMetaCol(db)
  const existing = await meta.findOne({ _id: 'singleton' })
  if (existing) return

  const now = new Date()
  const active = currentYearMonth(now)
  const catCount = await categoriesCol(db).countDocuments()
  if (catCount === 0) {
    await categoriesCol(db).insertMany(
      SEED_CATEGORY_NAMES.map((name) => ({
        name,
        createdAt: now,
        updatedAt: now,
        archivedAt: null
      }))
    )
  }

  const cats = await categoriesCol(db)
    .find({ $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] })
    .toArray()
  const emptyLines = cats.map((c) => ({ categoryId: String(c._id), amountCents: 0 }))

  const months = [active, ...Array.from({ length: 6 }, (_, i) => addMonths(active, i + 1))]
  for (let i = 0; i < months.length; i++) {
    const yearMonth = months[i]!
    await budgetMonthsCol(db).updateOne(
      { yearMonth },
      {
        $setOnInsert: {
          yearMonth,
          status: 'open' as const,
          isActive: i === 0,
          lines: emptyLines.map((l) => ({ ...l })),
          createdAt: now,
          updatedAt: now,
          closedAt: null
        }
      },
      { upsert: true }
    )
  }

  const accCount = await bankAccountsCol(db).countDocuments()
  if (accCount === 0) {
    await bankAccountsCol(db).insertMany(
      DEFAULT_ACCOUNTS.map((name) => ({
        name,
        balanceCents: 0,
        updatedAt: now
      }))
    )
  }

  await meta.insertOne({
    _id: 'singleton',
    activeYearMonth: active,
    updatedAt: now
  })
}

export async function ensureAppReady(db: Db): Promise<void> {
  if (!globalThis.__mbparejaBootstrapped) {
    globalThis.__mbparejaBootstrapped = (async () => {
      await ensureIndexes(db)
      await seedIfEmpty(db)
    })()
  }
  await globalThis.__mbparejaBootstrapped
}
