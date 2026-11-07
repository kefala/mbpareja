import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

import {
  badRequest,
  methodNotAllowed,
  parseJsonBody,
  serverError,
  withApiAuth
} from '@/lib/api'
import { budgetMonthsCol } from '@/lib/collections'
import { getDb } from '@/lib/mongodb'
import { getActiveBudgetMonth, listActiveCategories } from '@/lib/queries'

const putSchema = z.object({
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
  categoryId: z.string().min(1),
  amountCents: z.number().int().min(0)
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  const db = await getDb()

  try {
    if (req.method === 'GET') {
      const active = await getActiveBudgetMonth(db)
      const futures = await budgetMonthsCol(db)
        .find({ status: 'open', isActive: false, yearMonth: { $gt: active.yearMonth } })
        .sort({ yearMonth: 1 })
        .limit(6)
        .toArray()
      const categories = await listActiveCategories(db)
      return res.status(200).json({
        activeYearMonth: active.yearMonth,
        months: futures.map((m) => ({
          yearMonth: m.yearMonth,
          lines: m.lines,
          totalCents: m.lines.reduce((s, l) => s + l.amountCents, 0)
        })),
        categories
      })
    }

    if (req.method === 'PUT') {
      const body = parseJsonBody(req, putSchema)
      if (!body.ok) return badRequest(res, body.message)

      const active = await getActiveBudgetMonth(db)
      const month = await budgetMonthsCol(db).findOne({
        yearMonth: body.data.yearMonth,
        status: 'open',
        isActive: false
      })
      if (!month || month.yearMonth <= active.yearMonth)
        return badRequest(res, 'Mes de planificación no válido')

      const cats = await listActiveCategories(db)
      if (!cats.some((c) => c.id === body.data.categoryId))
        return badRequest(res, 'Categoría no válida')

      const lines = [...month.lines]
      const idx = lines.findIndex((l) => l.categoryId === body.data.categoryId)
      if (idx >= 0) lines[idx] = { categoryId: body.data.categoryId, amountCents: body.data.amountCents }
      else lines.push({ categoryId: body.data.categoryId, amountCents: body.data.amountCents })

      // Asegurar todas las categorías activas
      const byId = new Map(lines.map((l) => [l.categoryId, l.amountCents]))
      const nextLines = cats.map((c) => ({
        categoryId: c.id,
        amountCents: byId.get(c.id) ?? 0
      }))

      await budgetMonthsCol(db).updateOne(
        { _id: month._id },
        { $set: { lines: nextLines, updatedAt: new Date() } }
      )

      return res.status(200).json({
        yearMonth: month.yearMonth,
        lines: nextLines,
        totalCents: nextLines.reduce((s, l) => s + l.amountCents, 0)
      })
    }

    return methodNotAllowed(res, ['GET', 'PUT'])
  } catch (err) {
    return serverError(res, err)
  }
}
