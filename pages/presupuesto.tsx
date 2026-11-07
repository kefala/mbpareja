import Head from 'next/head'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import { apiFetch } from '@/lib/client-fetch'
import { centsToEuros, formatCentsCurrency, parseEurosToCents } from '@/lib/money'
import { labelYearMonth } from '@/lib/months'

interface Category {
  id: string
  name: string
}

interface ActiveBudget {
  yearMonth: string
  lines: { categoryId: string; amountCents: number }[]
  categories: Category[]
}

export default function PresupuestoPage() {
  const [yearMonth, setYearMonth] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setError('')
    const json = await apiFetch<ActiveBudget>('/api/budgets/active')
    setYearMonth(json.yearMonth)
    setCategories(json.categories)
    const next: Record<string, string> = {}
    const byId = new Map(json.lines.map((l) => [l.categoryId, l.amountCents]))
    for (const c of json.categories) {
      const cents = byId.get(c.id) ?? 0
      next[c.id] = centsToEuros(cents).toFixed(2).replace('.', ',')
    }
    setDraft(next)
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
      const lines = categories.map((c) => ({
        categoryId: c.id,
        amountCents: parseEurosToCents(draft[c.id] ?? '0')
      }))
      await apiFetch('/api/budgets/active', {
        method: 'PUT',
        body: JSON.stringify({ lines })
      })
      setOk('Presupuesto guardado')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const totalCents = categories.reduce((s, c) => {
    try {
      return s + parseEurosToCents(draft[c.id] ?? '0')
    } catch {
      return s
    }
  }, 0)

  return (
    <>
      <Head>
        <title>Presupuesto — Finanzas pareja</title>
      </Head>
      <AppPageLayout
        title="Presupuesto mensual"
        lead={yearMonth ? `Mes activo: ${labelYearMonth(yearMonth)}` : 'Cargando…'}>
        {error ? <div className="error-banner">{error}</div> : null}
        {ok ? <div className="ok-banner">{ok}</div> : null}

        <form className="panel" onSubmit={(e) => void onSave(e)}>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th className="num">Importe (€)</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td className="num">
                      <input
                        inputMode="decimal"
                        value={draft[c.id] ?? ''}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [c.id]: e.target.value }))
                        }
                        aria-label={`Presupuesto ${c.name}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 12 }}>
            Total: <strong>{formatCentsCurrency(totalCents)}</strong>
          </p>
          <button className="btn btn--primary" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar presupuesto'}
          </button>
        </form>
      </AppPageLayout>
    </>
  )
}
