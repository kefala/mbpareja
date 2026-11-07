import type { NextApiRequest, NextApiResponse } from 'next'

import { methodNotAllowed, serverError, withApiAuth } from '@/lib/api'
import { getDb } from '@/lib/mongodb'
import { listClosedMonths } from '@/lib/queries'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const db = await getDb()
    const months = await listClosedMonths(db)
    return res.status(200).json({ months })
  } catch (err) {
    return serverError(res, err)
  }
}
