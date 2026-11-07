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
import { bankAccountsCol } from '@/lib/collections'
import { getDb } from '@/lib/mongodb'
import { accountsSnapshot } from '@/lib/queries'

const putSchema = z.object({
  accounts: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string().trim().min(1).max(80),
        balanceCents: z.number().int()
      })
    )
    .length(2)
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  const db = await getDb()

  try {
    if (req.method === 'GET') {
      const snap = await accountsSnapshot(db)
      return res.status(200).json(snap)
    }

    if (req.method === 'PUT') {
      const body = parseJsonBody(req, putSchema)
      if (!body.ok) return badRequest(res, body.message)

      const now = new Date()
      for (const acc of body.data.accounts) {
        if (!ObjectId.isValid(acc.id)) return badRequest(res, 'id de cuenta inválido')
        const result = await bankAccountsCol(db).updateOne(
          { _id: new ObjectId(acc.id) },
          { $set: { name: acc.name, balanceCents: acc.balanceCents, updatedAt: now } }
        )
        if (result.matchedCount !== 1) return badRequest(res, `Cuenta no encontrada: ${acc.id}`)
      }

      const snap = await accountsSnapshot(db)
      return res.status(200).json(snap)
    }

    return methodNotAllowed(res, ['GET', 'PUT'])
  } catch (err) {
    return serverError(res, err)
  }
}
