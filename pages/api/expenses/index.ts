import type { NextApiRequest, NextApiResponse } from 'next'
import { ObjectId } from 'mongodb'
import { z } from 'zod'

import {
  badRequest,
  methodNotAllowed,
  parseJsonBody,
  serverError,
  withApiAuth
} from '@/lib/api'
import { categoriesCol, expensesCol } from '@/lib/collections'
import { formatDateOnly, parseDateOnly, yearMonthFromDate } from '@/lib/months'
import { getDb } from '@/lib/mongodb'
import { getActiveBudgetMonth } from '@/lib/queries'

const createSchema = z.object({
  amountCents: z.number().int().positive('Importe debe ser positivo'),
  categoryId: z.string().min(1),
  date: z.string().min(1)
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  const db = await getDb()

  try {
    if (req.method === 'GET') {
      const active = await getActiveBudgetMonth(db)
      const yearMonth = String(req.query.yearMonth ?? active.yearMonth)
      const rows = await expensesCol(db)
        .find({ yearMonth })
        .sort({ date: -1, _id: -1 })
        .toArray()

      const catIds = [...new Set(rows.map((r) => r.categoryId))]
      const cats = catIds.length
        ? await categoriesCol(db)
            .find({ _id: { $in: catIds.filter(ObjectId.isValid).map((id) => new ObjectId(id)) } })
            .toArray()
        : []
      const nameById = new Map(cats.map((c) => [String(c._id), c.name]))

      return res.status(200).json({
        yearMonth,
        expenses: rows.map((e) => ({
          id: String(e._id),
          amountCents: e.amountCents,
          categoryId: e.categoryId,
          categoryName: nameById.get(e.categoryId) ?? '(archivada)',
          date: formatDateOnly(e.date),
          yearMonth: e.yearMonth
        }))
      })
    }

    if (req.method === 'POST') {
      const body = parseJsonBody(req, createSchema)
      if (!body.ok) return badRequest(res, body.message)
      if (!ObjectId.isValid(body.data.categoryId)) return badRequest(res, 'categoryId inválido')

      const cat = await categoriesCol(db).findOne({ _id: new ObjectId(body.data.categoryId) })
      if (!cat || cat.archivedAt) return badRequest(res, 'Categoría no disponible')

      let date: Date
      try {
        date = parseDateOnly(body.data.date)
      } catch (e) {
        return badRequest(res, e instanceof Error ? e.message : 'Fecha inválida')
      }

      const now = new Date()
      const yearMonth = yearMonthFromDate(date)
      const result = await expensesCol(db).insertOne({
        amountCents: body.data.amountCents,
        categoryId: body.data.categoryId,
        date,
        yearMonth,
        createdAt: now,
        updatedAt: now
      })

      return res.status(201).json({
        expense: {
          id: String(result.insertedId),
          amountCents: body.data.amountCents,
          categoryId: body.data.categoryId,
          categoryName: cat.name,
          date: formatDateOnly(date),
          yearMonth
        }
      })
    }

    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (err) {
    return serverError(res, err)
  }
}
