import type { ClientSession, Db } from 'mongodb'

import { appMetaCol, budgetMonthsCol } from '@/lib/collections'
import { getMongoClient } from '@/lib/mongodb'
import { addMonths } from '@/lib/months'
import type { BudgetLine } from '@/types/domain'

export interface CloseMonthPreview {
  closingYearMonth: string
  nextActiveYearMonth: string
  newSixthYearMonth: string
}

export async function previewCloseMonth(db: Db): Promise<CloseMonthPreview> {
  const meta = await appMetaCol(db).findOne({ _id: 'singleton' })
  if (!meta) throw new Error('App no inicializada')

  const active = await budgetMonthsCol(db).findOne({ isActive: true, status: 'open' })
  if (!active) throw new Error('No hay mes activo abierto')
  if (active.yearMonth !== meta.activeYearMonth)
    throw new Error('Inconsistencia: app_meta vs mes activo')

  const futures = await budgetMonthsCol(db)
    .find({ status: 'open', isActive: false, yearMonth: { $gt: active.yearMonth } })
    .sort({ yearMonth: 1 })
    .limit(6)
    .toArray()

  if (futures.length !== 6)
    throw new Error(`Se esperaban 6 meses futuros; hay ${futures.length}`)

  const next = futures[0]!
  const last = futures[5]!
  return {
    closingYearMonth: active.yearMonth,
    nextActiveYearMonth: next.yearMonth,
    newSixthYearMonth: addMonths(last.yearMonth, 1)
  }
}

function copyLines(lines: BudgetLine[]): BudgetLine[] {
  return lines.map((l) => ({ categoryId: l.categoryId, amountCents: l.amountCents }))
}

export async function closeActiveMonth(db: Db): Promise<CloseMonthPreview> {
  const preview = await previewCloseMonth(db)
  const client = await getMongoClient()
  const session = client.startSession()

  try {
    await session.withTransaction(async () => {
      await runCloseInSession(db, session, preview)
    })
  } finally {
    await session.endSession()
  }

  return preview
}

async function runCloseInSession(
  db: Db,
  session: ClientSession,
  preview: CloseMonthPreview
): Promise<void> {
  const months = budgetMonthsCol(db)
  const meta = appMetaCol(db)
  const now = new Date()

  const active = await months.findOne(
    { yearMonth: preview.closingYearMonth, isActive: true, status: 'open' },
    { session }
  )
  if (!active) throw new Error('El mes ya no está activo o ya está cerrado')

  const futures = await months
    .find(
      { status: 'open', isActive: false, yearMonth: { $gt: active.yearMonth } },
      { session }
    )
    .sort({ yearMonth: 1 })
    .limit(6)
    .toArray()

  if (futures.length !== 6) throw new Error('Ventana futura incompleta al cerrar')

  const next = futures[0]!
  const last = futures[5]!
  const newYm = addMonths(last.yearMonth, 1)

  if (newYm !== preview.newSixthYearMonth)
    throw new Error('Conflicto al calcular el nuevo sexto mes')

  const existingNew = await months.findOne({ yearMonth: newYm }, { session })
  if (existingNew) throw new Error(`Ya existe el mes ${newYm}`)

  const closed = await months.updateOne(
    { _id: active._id, isActive: true, status: 'open' },
    { $set: { status: 'closed', isActive: false, closedAt: now, updatedAt: now } },
    { session }
  )
  if (closed.modifiedCount !== 1) throw new Error('No se pudo cerrar el mes activo')

  const promoted = await months.updateOne(
    { _id: next._id, status: 'open', isActive: false },
    { $set: { isActive: true, updatedAt: now } },
    { session }
  )
  if (promoted.modifiedCount !== 1) throw new Error('No se pudo promover el siguiente mes')

  await months.insertOne(
    {
      yearMonth: newYm,
      status: 'open',
      isActive: false,
      lines: copyLines(last.lines),
      createdAt: now,
      updatedAt: now,
      closedAt: null
    },
    { session }
  )

  const metaUp = await meta.updateOne(
    { _id: 'singleton', activeYearMonth: preview.closingYearMonth },
    { $set: { activeYearMonth: preview.nextActiveYearMonth, updatedAt: now } },
    { session }
  )
  if (metaUp.modifiedCount !== 1) throw new Error('No se pudo actualizar app_meta')
}
