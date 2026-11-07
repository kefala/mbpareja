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
import { categoriesCol } from '@/lib/collections'
import { getDb } from '@/lib/mongodb'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional()
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
      if (!body.data.name) return badRequest(res, 'Nada que actualizar')
      try {
        const result = await categoriesCol(db).findOneAndUpdate(
          { _id },
          { $set: { name: body.data.name, updatedAt: new Date() } },
          { returnDocument: 'after' }
        )
        if (!result) return notFound(res, 'Categoría no encontrada')
        return res.status(200).json({
          category: {
            id: String(result._id),
            name: result.name,
            archived: Boolean(result.archivedAt)
          }
        })
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000)
          return badRequest(res, 'Ya existe una categoría con ese nombre')
        throw err
      }
    }

    if (req.method === 'DELETE') {
      const cat = await categoriesCol(db).findOne({ _id })
      if (!cat) return notFound(res, 'Categoría no encontrada')
      if (cat.archivedAt) return res.status(200).json({ ok: true, softDeleted: true })

      // Soft-delete: conserva gastos e histórico de presupuesto.
      await categoriesCol(db).updateOne(
        { _id },
        { $set: { archivedAt: new Date(), updatedAt: new Date() } }
      )
      return res.status(200).json({ ok: true, softDeleted: true })
    }

    return methodNotAllowed(res, ['PATCH', 'DELETE'])
  } catch (err) {
    return serverError(res, err)
  }
}
