import type { NextApiRequest, NextApiResponse } from 'next'
import type { Session } from 'next-auth'
import { getServerSession } from 'next-auth/next'

import { nextAuthOptions } from '@/lib/auth-options'

function normalizeEmail(s: string | null | undefined): string | null {
  if (typeof s !== 'string') return null
  const t = s.trim().toLowerCase()
  return t === '' ? null : t
}

/** Allowlist desde ALLOWED_EMAILS o alias ONLINE_ALLOWED_EMAILS / ONLINE_ALLOWED_EMAIL. */
export function allowedEmailsFromEnv(): Set<string> {
  const raw = String(
    process.env.ALLOWED_EMAILS ??
      process.env.ONLINE_ALLOWED_EMAILS ??
      process.env.ONLINE_ALLOWED_EMAIL ??
      ''
  ).trim()
  const parts = raw
    .split(/[,;\s]+/)
    .map((s) => normalizeEmail(s))
    .filter((e): e is string => e != null)
  return new Set(parts)
}

export function isEmailAllowed(email: string | null | undefined): boolean {
  const norm = normalizeEmail(email)
  if (!norm) return false
  const allowed = allowedEmailsFromEnv()
  if (allowed.size === 0) {
    console.error('[auth] ALLOWED_EMAILS vacío: denegar acceso')
    return false
  }
  return allowed.has(norm)
}

export async function getSession(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  return getServerSession(req, res, nextAuthOptions)
}

export async function requireAccess(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<Session | null> {
  const session = await getSession(req, res)
  const email = session?.user?.email
  if (!session || !isEmailAllowed(email)) return null
  return session
}
