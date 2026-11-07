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
import { categoriesCol, expensesCol } from '@/lib/collections'
import { formatDateOnly, parseDateOnly, yearMonthFromDate } from '@/lib/months'
import { getDb } from '@/lib/mongodb'

const patchSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  categoryId: z.string().min(1).optional(),
  date: z.string().min(1).optional()
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  const db = await getDb()
  const id = String(req.query.id ?? '')
  if (!ObjectId.isValid(id)) return badRequest(res, 'id inválido')
  const _id = new ObjectId(id)

  try {
    if (req.method === 'PATCH') {
      const body = parseJsonBody(req, patchSchema)
      if (!body.ok) return badRequest(res, body.message)

      const existing = await expensesCol(db).findOne({ _id })
      if (!existing) return notFound(res, 'Gasto no encontrado')

      const patch: {
        amountCents?: number
        categoryId?: string
        date?: Date
        yearMonth?: string
        updatedAt: Date
      } = { updatedAt: new Date() }

      if (body.data.amountCents != null) patch.amountCents = body.data.amountCents

      if (body.data.categoryId) {
        if (!ObjectId.isValid(body.data.categoryId)) return badRequest(res, 'categoryId inválido')
        const cat = await categoriesCol(db).findOne({ _id: new ObjectId(body.data.categoryId) })
        if (!cat || cat.archivedAt) return badRequest(res, 'Categoría no disponible')
        patch.categoryId = body.data.categoryId
      }

      if (body.data.date) {
        try {
          const date = parseDateOnly(body.data.date)
          patch.date = date
          patch.yearMonth = yearMonthFromDate(date)
        } catch (e) {
          return badRequest(res, e instanceof Error ? e.message : 'Fecha inválida')
        }
      }

      await expensesCol(db).updateOne({ _id }, { $set: patch })
      const updated = await expensesCol(db).findOne({ _id })
      if (!updated) return notFound(res)
      const cat = await categoriesCol(db).findOne({ _id: new ObjectId(updated.categoryId) })
      return res.status(200).json({
        expense: {
          id: String(updated._id),
          amountCents: updated.amountCents,
          categoryId: updated.categoryId,
          categoryName: cat?.name ?? '(archivada)',
          date: formatDateOnly(updated.date),
          yearMonth: updated.yearMonth
        }
      })
    }

    if (req.method === 'DELETE') {
      const result = await expensesCol(db).deleteOne({ _id })
      if (result.deletedCount !== 1) return notFound(res, 'Gasto no encontrado')
      return res.status(200).json({ ok: true })
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE'])
  } catch (err) {
    return serverError(res, err)
  }
}
