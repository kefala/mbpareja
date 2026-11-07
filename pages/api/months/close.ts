import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

import {
  badRequest,
  methodNotAllowed,
  parseJsonBody,
  serverError,
  withApiAuth
} from '@/lib/api'
import { closeActiveMonth, previewCloseMonth } from '@/lib/close-month'
import { getDb } from '@/lib/mongodb'

const postSchema = z.object({
  confirm: z.literal(true)
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  const db = await getDb()

  try {
    if (req.method === 'GET') {
      const preview = await previewCloseMonth(db)
      return res.status(200).json({ preview })
    }

    if (req.method === 'POST') {
      const body = parseJsonBody(req, postSchema)
      if (!body.ok) return badRequest(res, 'Debes confirmar el cierre (confirm: true)')
      const result = await closeActiveMonth(db)
      return res.status(200).json({ ok: true, result })
    }

    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (err) {
    return serverError(res, err)
  }
}
