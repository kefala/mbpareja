import type { NextApiRequest, NextApiResponse } from 'next'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

import {
  badRequest,
  methodNotAllowed,
  notFound,
  parseJsonBody,
  serverError,
  withApiAuth
} from '@/lib/api'
import { budgetMonthsCol, categoriesCol, expensesCol } from '@/lib/collections'
import { mergeBudgetLines } from '@/lib/indicators'
import { formatDateOnly, isValidYearMonth } from '@/lib/months'
import { getDb } from '@/lib/mongodb'
import { buildMonthIndicators, listAllCategories } from '@/lib/queries'

const putSchema = z.object({
  lines: z.array(
    z.object({
      categoryId: z.string().min(1),
      amountCents: z.number().int().min(0)
    })
  )
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  const db = await getDb()
  const yearMonth = String(req.query.yearMonth ?? '')
  if (!isValidYearMonth(yearMonth)) return badRequest(res, 'yearMonth inválido')

  try {
    if (req.method === 'GET') {
      const month = await budgetMonthsCol(db).findOne({ yearMonth, status: 'closed' })
      if (!month) return notFound(res, 'Mes cerrado no encontrado')

      const indicators = await buildMonthIndicators(db, month, {
        includeArchivedCategories: true
      })
      const categories = await listAllCategories(db)
      const expenses = await expensesCol(db)
        .find({ yearMonth })
        .sort({ date: -1, _id: -1 })
        .toArray()
      const catIds = [...new Set(expenses.map((e) => e.categoryId))]
      const cats = catIds.length
        ? await categoriesCol(db)
            .find({
              _id: { $in: catIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) }
            })
            .toArray()
        : []
      const nameById = new Map(cats.map((c) => [String(c._id), c.name]))

      return res.status(200).json({
        yearMonth: month.yearMonth,
        status: month.status,
        isActive: month.isActive,
        closedAt: month.closedAt ?? null,
        lines: month.lines,
        categories,
        indicators,
        expenses: expenses.map((e) => ({
          id: String(e._id),
          amountCents: e.amountCents,
          categoryId: e.categoryId,
          categoryName: nameById.get(e.categoryId) ?? '(archivada)',
          date: formatDateOnly(e.date),
          yearMonth: e.yearMonth,
          source: e.source ?? 'manual'
        }))
      })
    }

    if (req.method === 'PUT') {
      const body = parseJsonBody(req, putSchema)
      if (!body.ok) return badRequest(res, body.message)

      const month = await budgetMonthsCol(db).findOne({ yearMonth, status: 'closed' })
      if (!month) return notFound(res, 'Mes cerrado no encontrado')

      const cats = await listAllCategories(db)
      const known = new Set(cats.map((c) => c.id))
      for (const line of body.data.lines) {
        if (!known.has(line.categoryId))
          return badRequest(res, `Categoría desconocida: ${line.categoryId}`)
      }

      const byId = new Map(body.data.lines.map((l) => [l.categoryId, l.amountCents]))
      const mergedAmounts = new Map(month.lines.map((l) => [l.categoryId, l.amountCents]))
      for (const [id, cents] of byId) mergedAmounts.set(id, cents)
      const lines = mergeBudgetLines({
        previous: month.lines,
        nextAmounts: [...mergedAmounts.entries()].map(([categoryId, amountCents]) => ({
          categoryId,
          amountCents
        }))
      })

      await budgetMonthsCol(db).updateOne(
        { _id: month._id },
        { $set: { lines, updatedAt: new Date(), status: 'closed', isActive: false } }
      )

      const updated = await budgetMonthsCol(db).findOne({ _id: month._id })
      if (!updated) return notFound(res)
      const indicators = await buildMonthIndicators(db, updated, {
        includeArchivedCategories: true
      })
      return res.status(200).json({
        yearMonth: updated.yearMonth,
        status: updated.status,
        lines: updated.lines,
        indicators
      })
    }

    return methodNotAllowed(res, ['GET', 'PUT'])
  } catch (err) {
    return serverError(res, err)
  }
}
