import Head from 'next/head'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import { apiFetch } from '@/lib/client-fetch'
import { formatCentsCurrency, parseEurosToCents } from '@/lib/money'
import { labelYearMonth } from '@/lib/months'
import type { MonthIndicators } from '@/types/domain'

interface Category {
  id: string
  name: string
}

interface DashboardData {
  yearMonth: string
  indicators: MonthIndicators
  categories: Category[]
}

function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const json = await apiFetch<DashboardData>('/api/dashboard')
      setData(json)
      setCategoryId((prev) => prev || json.categories[0]?.id || '')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onQuickExpense(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const amountCents = parseEurosToCents(amount)
      if (amountCents <= 0) throw new Error('Importe debe ser positivo')
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({ amountCents, categoryId, date })
      })
      setAmount('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function onToggleSpentClosed(categoryIdToToggle: string, next: boolean) {
    if (!data) return
    setTogglingId(categoryIdToToggle)
    setError('')
    try {
      const res = await apiFetch<{ indicators: MonthIndicators }>('/api/budgets/spent-closed', {
        method: 'PATCH',
        body: JSON.stringify({
          categoryId: categoryIdToToggle,
          spentClosed: next,
          yearMonth: data.yearMonth
        })
      })
      setData((prev) => (prev ? { ...prev, indicators: res.indicators } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    } finally {
      setTogglingId('')
    }
  }

  const ind = data?.indicators

  return (
    <>
      <Head>
        <title>Dashboard — Finanzas pareja</title>
      </Head>
      <AppPageLayout
        title="Dashboard"
        lead={
          data ? (
            <span>
              Mes activo: <strong>{labelYearMonth(data.yearMonth)}</strong>
            </span>
          ) : (
            'Resumen del mes activo'
          )
        }>
        {error ? <div className="error-banner">{error}</div> : null}

        <section className="panel">
          <h2>Resumen</h2>
          <div className="stats-grid">
            <div className="stat">
              <span className="stat__label">Presupuesto</span>
              <span className="stat__value">
                {ind ? formatCentsCurrency(ind.budgetTotalCents) : '—'}
              </span>
            </div>
            <div className="stat">
              <span className="stat__label">Ejecutado</span>
              <span className="stat__value">
                {ind ? formatCentsCurrency(ind.spentTotalCents) : '—'}
              </span>
            </div>
            <div className="stat">
              <span className="stat__label">Restante</span>
              <span className="stat__value">
                {ind ? formatCentsCurrency(ind.remainingTotalCents) : '—'}
              </span>
            </div>
            <div className="stat">
              <span className="stat__label">Pendiente de ejecutar</span>
              <span className="stat__value">
                {ind ? formatCentsCurrency(ind.pendingToExecuteCents) : '—'}
              </span>
            </div>
            <div className="stat">
              <span className="stat__label">Saldo cuentas</span>
              <span className="stat__value">
                {ind ? formatCentsCurrency(ind.accountsTotalCents) : '—'}
              </span>
            </div>
            <div
              className={
                ind && ind.projectedMarginCents < 0 ? 'stat stat--danger' : 'stat stat--ok'
              }>
              <span className="stat__label">Margen previsto</span>
              <span className="stat__value">
                {ind ? formatCentsCurrency(ind.projectedMarginCents) : '—'}
              </span>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Registro rápido</h2>
          <form className="stack" onSubmit={(e) => void onQuickExpense(e)}>
            <div className="row">
              <div className="field">
                <label htmlFor="amount">Importe (€)</label>
                <input
                  id="amount"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="category">Categoría</label>
                <select
                  id="category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required>
                  {data?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="date">Fecha</label>
                <input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
            </div>
            <button className="btn btn--primary" type="submit" disabled={saving || !categoryId}>
              {saving ? 'Guardando…' : 'Añadir gasto'}
            </button>
          </form>
        </section>

        <section className="panel">
          <h2>Por categoría</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            El candado marca «ya no gastaré más este mes»: el restante positivo deja de contar en
            pendiente y margen. No cambia el presupuesto.
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th aria-label="Cerrar gasto" />
                  <th>Categoría</th>
                  <th className="num">Presup.</th>
                  <th className="num">Gastado</th>
                  <th className="num">Restante</th>
                </tr>
              </thead>
              <tbody>
                {ind?.byCategory.map((row) => (
                  <tr
                    key={row.categoryId}
                    className={[
                      row.overBudget ? 'is-over' : '',
                      row.spentClosed ? 'is-spent-closed' : ''
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined}>
                    <td className="cat-lock-cell">
                      <button
                        type="button"
                        className={
                          row.spentClosed
                            ? 'btn-lock btn-lock--on'
                            : 'btn-lock btn-lock--off'
                        }
                        aria-pressed={row.spentClosed}
                        aria-label={
                          row.spentClosed
                            ? `Reabrir gasto de ${row.name}`
                            : `Marcar ${row.name}: ya no gastaré más este mes`
                        }
                        title={
                          row.spentClosed
                            ? 'Ya no gastaré más (activo). Toca para reabrir.'
                            : 'Marcar: ya no gastaré más este mes'
                        }
                        disabled={togglingId === row.categoryId}
                        onClick={() =>
                          void onToggleSpentClosed(row.categoryId, !row.spentClosed)
                        }>
                        <svg
                          aria-hidden
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round">
                          {row.spentClosed ? (
                            <>
                              <rect x="5" y="11" width="14" height="10" rx="2" />
                              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                            </>
                          ) : (
                            <>
                              <rect x="5" y="11" width="14" height="10" rx="2" />
                              <path d="M8 11V8a4 4 0 0 1 7.5-1.8" />
                            </>
                          )}
                        </svg>
                      </button>
                    </td>
                    <td>
                      {row.name}
                      {row.spentClosed ? (
                        <span className="spent-closed-tag"> cerrada</span>
                      ) : null}
                    </td>
                    <td className="num">{formatCentsCurrency(row.budgetCents)}</td>
                    <td className="num">{formatCentsCurrency(row.spentCents)}</td>
                    <td className="num">{formatCentsCurrency(row.remainingCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </AppPageLayout>
    </>
  )
}
