import Head from 'next/head'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import { CompactDateInput } from '@/components/compact-date-input'
import { apiFetch } from '@/lib/client-fetch'
import { centsToEuros, formatCentsCurrency, parseEurosToCents } from '@/lib/money'
import { labelDateShort, labelYearMonthShort } from '@/lib/months'
import type { MonthIndicators } from '@/types/domain'

interface HistoryMonthSummary {
  yearMonth: string
  budgetTotalCents: number
  spentTotalCents: number
  remainingTotalCents: number
}

interface Category {
  id: string
  name: string
  archived: boolean
}

interface Expense {
  id: string
  amountCents: number
  categoryId: string
  categoryName: string
  date: string
  source?: string
}

interface HistoryDetail {
  yearMonth: string
  status: string
  lines: { categoryId: string; amountCents: number }[]
  categories: Category[]
  indicators: MonthIndicators
  expenses: Expense[]
}

export default function HistoricoPage() {
  const [months, setMonths] = useState<HistoryMonthSummary[]>([])
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<HistoryDetail | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [saving, setSaving] = useState(false)

  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState('')
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    const json = await apiFetch<{ months: HistoryMonthSummary[] }>('/api/history')
    setMonths(json.months)
    setSelected((prev) => prev || json.months[0]?.yearMonth || '')
  }, [])

  const loadDetail = useCallback(async (ym: string) => {
    if (!ym) {
      setDetail(null)
      return
    }
    const json = await apiFetch<HistoryDetail>(`/api/history/${ym}`)
    setDetail(json)
    const next: Record<string, string> = {}
    const byId = new Map(json.lines.map((l) => [l.categoryId, l.amountCents]))
    for (const c of json.categories.filter((x) => !x.archived)) {
      next[c.id] = centsToEuros(byId.get(c.id) ?? 0).toFixed(2).replace('.', ',')
    }
    for (const l of json.lines) {
      if (next[l.categoryId] == null)
        next[l.categoryId] = centsToEuros(l.amountCents).toFixed(2).replace('.', ',')
    }
    setDraft(next)
    setCategoryId((prev) => {
      if (prev) return prev
      return (json.categories.find((c) => !c.archived) ?? json.categories[0])?.id || ''
    })
    setDate((prev) => prev || `${ym}-01`)
  }, [])

  useEffect(() => {
    void loadList().catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [loadList])

  useEffect(() => {
    if (!selected) return
    void loadDetail(selected).catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [selected, loadDetail])

  async function onSaveBudget(e: FormEvent) {
    e.preventDefault()
    if (!detail) return
    setSaving(true)
    setError('')
    setOk('')
    try {
      const lines = Object.entries(draft).map(([categoryId, raw]) => ({
        categoryId,
        amountCents: parseEurosToCents(raw || '0')
      }))
      await apiFetch(`/api/history/${detail.yearMonth}`, {
        method: 'PUT',
        body: JSON.stringify({ lines })
      })
      setOk('Presupuesto histórico guardado (sigue cerrado)')
      await loadDetail(detail.yearMonth)
      await loadList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  async function onSaveExpense(e: FormEvent) {
    e.preventDefault()
    if (!detail) return
    setSaving(true)
    setError('')
    setOk('')
    try {
      const amountCents = parseEurosToCents(amount)
      if (amountCents <= 0) throw new Error('Importe debe ser positivo')
      if (editingExpenseId) {
        await apiFetch(`/api/expenses/${editingExpenseId}`, {
          method: 'PATCH',
          body: JSON.stringify({ amountCents, categoryId, date })
        })
      } else {
        await apiFetch('/api/expenses', {
          method: 'POST',
          body: JSON.stringify({ amountCents, categoryId, date })
        })
      }
      setAmount('')
      setEditingExpenseId(null)
      setOk('Gasto histórico actualizado')
      await loadDetail(detail.yearMonth)
      await loadList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteExpense(id: string) {
    if (!detail || !window.confirm('¿Eliminar este gasto del histórico?')) return
    try {
      await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' })
      await loadDetail(detail.yearMonth)
      await loadList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    }
  }

  const budgetCats =
    detail?.categories.filter((c) => !c.archived || draft[c.id] != null) ?? []

  return (
    <>
      <Head>
        <title>Histórico — Finanzas pareja</title>
      </Head>
      <AppPageLayout
        title="Histórico"
        lead="Meses cerrados: consultables y editables. El estado cerrado se conserva.">
        {error ? <div className="error-banner">{error}</div> : null}
        {ok ? <div className="ok-banner">{ok}</div> : null}

        <section className="panel">
          <h2>Meses cerrados</h2>
          {months.length === 0 ? (
            <p className="muted">
              Aún no hay meses cerrados. Cierra el mes activo o importa histórico CSV en
              Configuración.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="num">Presup.</th>
                    <th className="num">Gastado</th>
                    <th className="num">Restante</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m) => (
                    <tr key={m.yearMonth} className={selected === m.yearMonth ? 'is-over' : undefined}>
                      <td>{labelYearMonthShort(m.yearMonth)}</td>
                      <td className="num">{formatCentsCurrency(m.budgetTotalCents)}</td>
                      <td className="num">{formatCentsCurrency(m.spentTotalCents)}</td>
                      <td className="num">{formatCentsCurrency(m.remainingTotalCents)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => {
                            setSelected(m.yearMonth)
                            setOk('')
                            setError('')
                          }}>
                          Abrir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {detail ? (
          <>
            <section className="panel">
              <h2>Resumen — {labelYearMonthShort(detail.yearMonth)}</h2>
              <div className="stats-grid">
                <div className="stat">
                  <span className="stat__label">Presupuesto</span>
                  <span className="stat__value">
                    {formatCentsCurrency(detail.indicators.budgetTotalCents)}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">Ejecutado</span>
                  <span className="stat__value">
                    {formatCentsCurrency(detail.indicators.spentTotalCents)}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat__label">Restante</span>
                  <span className="stat__value">
                    {formatCentsCurrency(detail.indicators.remainingTotalCents)}
                  </span>
                </div>
              </div>
            </section>

            <form className="panel" onSubmit={(e) => void onSaveBudget(e)}>
              <h2>Editar presupuesto</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Categoría</th>
                      <th className="num">Importe (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgetCats.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.name}
                          {c.archived ? ' (arch.)' : ''}
                        </td>
                        <td className="num">
                          <input
                            inputMode="decimal"
                            value={draft[c.id] ?? ''}
                            onChange={(e) =>
                              setDraft((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn btn--primary" type="submit" disabled={saving}>
                Guardar presupuesto histórico
              </button>
            </form>

            <section className="panel">
              <h2>{editingExpenseId ? 'Editar gasto' : 'Añadir gasto al histórico'}</h2>
              <form className="stack" onSubmit={(e) => void onSaveExpense(e)}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="h-amount">Importe (€)</label>
                    <input
                      id="h-amount"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="h-cat">Categoría</label>
                    <select
                      id="h-cat"
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      required>
                      {detail.categories
                        .filter((c) => !c.archived)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="h-date">Fecha</label>
                    <CompactDateInput
                      id="h-date"
                      value={date}
                      onChange={setDate}
                      required
                    />
                  </div>
                </div>
                <div className="row">
                  <button className="btn btn--primary" type="submit" disabled={saving}>
                    {editingExpenseId ? 'Actualizar' : 'Crear'}
                  </button>
                  {editingExpenseId ? (
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => {
                        setEditingExpenseId(null)
                        setAmount('')
                      }}>
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </form>

              <div className="table-wrap" style={{ marginTop: 14 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Categoría</th>
                      <th className="num">Importe</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.expenses.map((exp) => (
                      <tr key={exp.id}>
                        <td>{labelDateShort(exp.date)}</td>
                        <td>
                          {exp.categoryName}
                          {exp.source === 'import' ? ' · CSV' : ''}
                        </td>
                        <td className="num">{formatCentsCurrency(exp.amountCents)}</td>
                        <td>
                          <div className="row">
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => {
                                setEditingExpenseId(exp.id)
                                setAmount(
                                  centsToEuros(exp.amountCents).toFixed(2).replace('.', ',')
                                )
                                setCategoryId(exp.categoryId)
                                setDate(exp.date)
                              }}>
                              Editar
                            </button>
                            <button
                              type="button"
                              className="btn btn--danger btn--sm"
                              onClick={() => void onDeleteExpense(exp.id)}>
                              Borrar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </AppPageLayout>
    </>
  )
}
