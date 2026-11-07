import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

import {
  badRequest,
  methodNotAllowed,
  parseJsonBody,
  serverError,
  withApiAuth
} from '@/lib/api'
import { applyImportCsv, buildImportPreview, CSV_TEMPLATE } from '@/lib/import-csv'
import { getDb } from '@/lib/mongodb'

const bodySchema = z.object({
  csv: z.string().min(1, 'CSV vacío'),
  confirm: z.boolean().optional()
})

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb'
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  const db = await getDb()

  try {
    if (req.method === 'GET') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="plantilla-historico.csv"')
      return res.status(200).send(CSV_TEMPLATE)
    }

    if (req.method === 'POST') {
      const body = parseJsonBody(req, bodySchema)
      if (!body.ok) return badRequest(res, body.message)

      if (body.data.confirm) {
        const result = await applyImportCsv(db, body.data.csv)
        return res.status(200).json({ ok: true, ...result })
      }

      const preview = await buildImportPreview(db, body.data.csv)
      return res.status(200).json({ preview })
    }

    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (err) {
    return serverError(res, err)
  }
}
