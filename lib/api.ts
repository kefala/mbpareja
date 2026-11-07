import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'

import { ensureAppReady } from '@/lib/bootstrap'
import { ensureSessionOr401 } from '@/lib/ensure-session'
import { getDb } from '@/lib/mongodb'

export async function withApiAuth(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<boolean> {
  if (!(await ensureSessionOr401(req, res))) return false
  const db = await getDb()
  await ensureAppReady(db)
  return true
}

export function methodNotAllowed(res: NextApiResponse, allow: string[]): void {
  res.setHeader('Allow', allow.join(', '))
  res.status(405).json({ error: 'method_not_allowed' })
}

export function badRequest(res: NextApiResponse, message: string): void {
  res.status(400).json({ error: 'bad_request', message })
}

export function notFound(res: NextApiResponse, message = 'no_encontrado'): void {
  res.status(404).json({ error: 'not_found', message })
}

export function serverError(res: NextApiResponse, err: unknown): void {
  console.error('[api]', err)
  const message = err instanceof Error ? err.message : 'error_interno'
  res.status(500).json({ error: 'server_error', message })
}

export function parseJsonBody<T>(
  req: NextApiRequest,
  schema: z.ZodType<T>
): { ok: true; data: T } | { ok: false; message: string } {
  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => i.message).join('; ') || 'body inválido'
    return { ok: false, message: msg }
  }
  return { ok: true, data: parsed.data }
}
