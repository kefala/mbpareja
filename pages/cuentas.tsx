import Head from 'next/head'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import { apiFetch } from '@/lib/client-fetch'
import { centsToEuros, formatCentsCurrency, parseEurosToCents } from '@/lib/money'

interface Account {
  id: string
  name: string
  balanceCents: number
}

export default function CuentasPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [balances, setBalances] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const json = await apiFetch<{ accounts: Account[]; totalCents: number }>('/api/accounts')
    setAccounts(json.accounts)
    const n: Record<string, string> = {}
    const b: Record<string, string> = {}
    for (const a of json.accounts) {
      n[a.id] = a.name
      b[a.id] = centsToEuros(a.balanceCents).toFixed(2).replace('.', ',')
    }
    setNames(n)
    setBalances(b)
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [load])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setOk('')
    try {
      const payload = {
        accounts: accounts.map((a) => ({
          id: a.id,
          name: names[a.id]?.trim() || a.name,
          balanceCents: parseEurosToCents(balances[a.id] ?? '0')
        }))
      }
      if (payload.accounts.length !== 2) throw new Error('Debe haber exactamente 2 cuentas')
      const json = await apiFetch<{ accounts: Account[]; totalCents: number }>('/api/accounts', {
        method: 'PUT',
        body: JSON.stringify(payload)
      })
      setAccounts(json.accounts)
      setOk(`Guardado. Saldo total: ${formatCentsCurrency(json.totalCents)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const totalPreview = accounts.reduce((s, a) => {
    try {
      return s + parseEurosToCents(balances[a.id] ?? '0')
    } catch {
      return s
    }
  }, 0)

  return (
    <>
      <Head>
        <title>Cuentas — Finanzas pareja</title>
      </Head>
      <AppPageLayout title="Cuentas" lead="Dos cuentas compartidas. Solo se guarda el último saldo.">
        {error ? <div className="error-banner">{error}</div> : null}
        {ok ? <div className="ok-banner">{ok}</div> : null}

        <form className="panel stack" onSubmit={(e) => void onSave(e)}>
          {accounts.map((a, idx) => (
            <div key={a.id} className="row">
              <div className="field">
                <label htmlFor={`name-${a.id}`}>Cuenta {idx + 1}</label>
                <input
                  id={`name-${a.id}`}
                  value={names[a.id] ?? ''}
                  onChange={(e) => setNames((p) => ({ ...p, [a.id]: e.target.value }))}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor={`bal-${a.id}`}>Saldo (€)</label>
                <input
                  id={`bal-${a.id}`}
                  inputMode="decimal"
                  value={balances[a.id] ?? ''}
                  onChange={(e) => setBalances((p) => ({ ...p, [a.id]: e.target.value }))}
                  required
                />
              </div>
            </div>
          ))}
          <p className="muted">
            Saldo total: <strong>{formatCentsCurrency(totalPreview)}</strong>
          </p>
          <p className="muted">
            Margen previsto = saldo total − presupuesto pendiente de ejecutar (ver Dashboard).
          </p>
          <button className="btn btn--primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar saldos'}
          </button>
        </form>
      </AppPageLayout>
    </>
  )
}
