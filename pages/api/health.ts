import type { NextApiRequest, NextApiResponse } from 'next'

import { ensureSessionOr401 } from '@/lib/ensure-session'
import { getDb } from '@/lib/mongodb'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  if (!(await ensureSessionOr401(req, res))) return

  try {
    const db = await getDb()
    const ping = await db.command({ ping: 1 })
    return res.status(200).json({
      ok: true,
      db: db.databaseName,
      ping: ping?.ok === 1
    })
  } catch (err) {
    console.error('[api/health]', err)
    return res.status(503).json({ error: 'db_unavailable' })
  }
}
