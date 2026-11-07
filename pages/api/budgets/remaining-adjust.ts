import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

import {
  badRequest,
  methodNotAllowed,
  notFound,
  parseJsonBody,
  serverError,
  withApiAuth
} from '@/lib/api'
import { budgetMonthsCol } from '@/lib/collections'
import { getDb } from '@/lib/mongodb'
import { buildMonthIndicators, getActiveBudgetMonth } from '@/lib/queries'
import type { BudgetLine } from '@/types/domain'

const patchSchema = z.object({
  categoryId: z.string().min(1),
  /** Ajuste en céntimos: restanteEfectivo = bruto + remainingAdjustCents */
  remainingAdjustCents: z.number().int(),
  yearMonth: z.string().regex(/^\d{4}-\d{2}$/).optional()
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH'])

  const db = await getDb()

  try {
    const body = parseJsonBody(req, patchSchema)
    if (!body.ok) return badRequest(res, body.message)

    const active = await getActiveBudgetMonth(db)
    const yearMonth = body.data.yearMonth ?? active.yearMonth
    const month = await budgetMonthsCol(db).findOne({ yearMonth })
    if (!month) return notFound(res, 'Mes no encontrado')

    const lines: BudgetLine[] = month.lines.map((l) => {
      const { spentClosed: _legacy, ...rest } = l as BudgetLine & { spentClosed?: boolean }
      return { ...rest }
    })
    const idx = lines.findIndex((l) => l.categoryId === body.data.categoryId)
    const adjust = body.data.remainingAdjustCents

    if (idx < 0) {
      const line: BudgetLine = {
        categoryId: body.data.categoryId,
        amountCents: 0
      }
      if (adjust !== 0) line.remainingAdjustCents = adjust
      lines.push(line)
    } else {
      const line: BudgetLine = {
        categoryId: lines[idx]!.categoryId,
        amountCents: lines[idx]!.amountCents
      }
      if (adjust !== 0) line.remainingAdjustCents = adjust
      lines[idx] = line
    }

    await budgetMonthsCol(db).updateOne(
      { _id: month._id },
      { $set: { lines, updatedAt: new Date() } }
    )

    const updated = await budgetMonthsCol(db).findOne({ _id: month._id })
    if (!updated) return notFound(res)
    const indicators = await buildMonthIndicators(db, updated, {
      includeArchivedCategories: !updated.isActive
    })

    return res.status(200).json({
      yearMonth: updated.yearMonth,
      categoryId: body.data.categoryId,
      remainingAdjustCents: adjust,
      indicators
    })
  } catch (err) {
    return serverError(res, err)
  }
}
