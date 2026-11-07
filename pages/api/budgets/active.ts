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
import { mergeBudgetLines } from '@/lib/indicators'
import { getDb } from '@/lib/mongodb'
import { buildMonthIndicators, getActiveBudgetMonth, listActiveCategories } from '@/lib/queries'

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

  try {
    if (req.method === 'GET') {
      const month = await getActiveBudgetMonth(db)
      const categories = await listActiveCategories(db)
      const indicators = await buildMonthIndicators(db, month)
      return res.status(200).json({
        yearMonth: month.yearMonth,
        status: month.status,
        isActive: month.isActive,
        lines: month.lines,
        categories,
        indicators
      })
    }

    if (req.method === 'PUT') {
      const body = parseJsonBody(req, putSchema)
      if (!body.ok) return badRequest(res, body.message)
      const month = await getActiveBudgetMonth(db)
      if (month.status !== 'open') return badRequest(res, 'El mes activo no está abierto')

      const activeCats = new Set((await listActiveCategories(db)).map((c) => c.id))
      for (const line of body.data.lines) {
        if (!activeCats.has(line.categoryId))
          return badRequest(res, `Categoría desconocida: ${line.categoryId}`)
      }

      const byId = new Map(body.data.lines.map((l) => [l.categoryId, l.amountCents]))
      const lines = mergeBudgetLines({
        previous: month.lines,
        nextAmounts: [...activeCats].map((categoryId) => ({
          categoryId,
          amountCents: byId.get(categoryId) ?? 0
        }))
      })

      await budgetMonthsCol(db).updateOne(
        { _id: month._id },
        { $set: { lines, updatedAt: new Date() } }
      )

      const updated = await getActiveBudgetMonth(db)
      const indicators = await buildMonthIndicators(db, updated)
      return res.status(200).json({
        yearMonth: updated.yearMonth,
        lines: updated.lines,
        indicators
      })
    }

    return methodNotAllowed(res, ['GET', 'PUT'])
  } catch (err) {
    return serverError(res, err)
  }
}
