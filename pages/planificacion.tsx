import Head from 'next/head'
import { useCallback, useEffect, useState } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import { apiFetch } from '@/lib/client-fetch'
import { centsToEuros, formatCentsCurrency, parseEurosToCents } from '@/lib/money'
import { labelYearMonthShort } from '@/lib/months'

interface Category {
  id: string
  name: string
}

interface PlanningMonth {
  yearMonth: string
  lines: { categoryId: string; amountCents: number }[]
  totalCents: number
}

interface PlanningData {
  activeYearMonth: string
  months: PlanningMonth[]
  categories: Category[]
}

export default function PlanificacionPage() {
  const [data, setData] = useState<PlanningData | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState('')

  const cellKey = (ym: string, catId: string) => `${ym}:${catId}`

  const load = useCallback(async () => {
    const json = await apiFetch<PlanningData>('/api/budgets/planning')
    setData(json)
    const next: Record<string, string> = {}
    for (const m of json.months) {
      const byId = new Map(m.lines.map((l) => [l.categoryId, l.amountCents]))
      for (const c of json.categories) {
        const cents = byId.get(c.id) ?? 0
        next[cellKey(m.yearMonth, c.id)] = centsToEuros(cents).toFixed(2).replace('.', ',')
      }
    }
    setDraft(next)
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [load])

  async function saveCell(yearMonth: string, categoryId: string, raw: string) {
    const key = cellKey(yearMonth, categoryId)
    setSavingKey(key)
    setError('')
    try {
      const amountCents = parseEurosToCents(raw || '0')
      await apiFetch('/api/budgets/planning', {
        method: 'PUT',
        body: JSON.stringify({ yearMonth, categoryId, amountCents })
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSavingKey('')
    }
  }

  return (
    <>
      <Head>
        <title>Planificación — Finanzas pareja</title>
      </Head>
      <AppPageLayout
        title="Planificación (6 meses)"
        lead={
          data
            ? `Tras el activo ${labelYearMonthShort(data.activeYearMonth)}. Edita una celda y sal del campo para guardar.`
            : 'Cargando…'
        }>
        {error ? <div className="error-banner">{error}</div> : null}

        <section className="panel plan-matrix">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Categoría</th>
                  {data?.months.map((m) => (
                    <th key={m.yearMonth} className="num">
                      {labelYearMonthShort(m.yearMonth)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    {data.months.map((m) => {
                      const key = cellKey(m.yearMonth, c.id)
                      return (
                        <td key={key} className="num">
                          <input
                            inputMode="decimal"
                            value={draft[key] ?? ''}
                            disabled={savingKey === key}
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                            }
                            onBlur={(e) => void saveCell(m.yearMonth, c.id, e.target.value)}
                            aria-label={`${c.name} ${m.yearMonth}`}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr>
                  <td>
                    <strong>Total</strong>
                  </td>
                  {data?.months.map((m) => (
                    <td key={m.yearMonth} className="num">
                      <strong>{formatCentsCurrency(m.totalCents)}</strong>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </AppPageLayout>
    </>
  )
}
