import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

import {
  badRequest,
  methodNotAllowed,
  parseJsonBody,
  serverError,
  withApiAuth
} from '@/lib/api'
import { ensureAppReady } from '@/lib/bootstrap'
import { budgetMonthsCol, categoriesCol } from '@/lib/collections'
import { getDb } from '@/lib/mongodb'
import { listAllCategories } from '@/lib/queries'

const createSchema = z.object({
  name: z.string().trim().min(1, 'Nombre obligatorio').max(80)
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  const db = await getDb()
  await ensureAppReady(db)

  try {
    if (req.method === 'GET') {
      const includeArchived = String(req.query.includeArchived ?? '') === '1'
      const categories = includeArchived
        ? await listAllCategories(db)
        : (await listAllCategories(db)).filter((c) => !c.archived)
      return res.status(200).json({ categories })
    }

    if (req.method === 'POST') {
      const body = parseJsonBody(req, createSchema)
      if (!body.ok) return badRequest(res, body.message)
      const now = new Date()
      try {
        const result = await categoriesCol(db).insertOne({
          name: body.data.name,
          createdAt: now,
          updatedAt: now,
          archivedAt: null
        })
        const categoryId = String(result.insertedId)
        await budgetMonthsCol(db).updateMany(
          { status: 'open' },
          {
            $push: { lines: { categoryId, amountCents: 0 } },
            $set: { updatedAt: now }
          }
        )
        return res.status(201).json({
          category: { id: categoryId, name: body.data.name, archived: false }
        })
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000)
          return badRequest(res, 'Ya existe una categoría con ese nombre')
        throw err
      }
    }

    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (err) {
    return serverError(res, err)
  }
}
