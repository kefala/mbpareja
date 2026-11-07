import type { NextApiRequest, NextApiResponse } from 'next'

import { requireAccess } from '@/lib/auth'

export async function ensureSessionOr401(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  const session = await requireAccess(req, res)
  if (!session) {
    res.status(401).json({ error: 'no_autorizado' })
    return false
  }
  return true
}
