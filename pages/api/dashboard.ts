import type { NextApiRequest, NextApiResponse } from 'next'

import { methodNotAllowed, serverError, withApiAuth } from '@/lib/api'
import { getDb } from '@/lib/mongodb'
import {
  accountsSnapshot,
  buildMonthIndicators,
  getActiveBudgetMonth,
  listActiveCategories
} from '@/lib/queries'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!(await withApiAuth(req, res))) return
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const db = await getDb()
    const month = await getActiveBudgetMonth(db)
    const indicators = await buildMonthIndicators(db, month)
    const categories = await listActiveCategories(db)
    const accounts = await accountsSnapshot(db)
    return res.status(200).json({
      yearMonth: month.yearMonth,
      status: month.status,
      indicators,
      categories,
      accounts: accounts.accounts,
      accountsTotalCents: accounts.totalCents
    })
  } catch (err) {
    return serverError(res, err)
  }
}
