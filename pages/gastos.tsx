import dynamic from 'next/dynamic'
import Head from 'next/head'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import type { CategoryBudgetSpentPoint } from '@/components/category-budget-spent-chart'
import { CompactDateInput } from '@/components/compact-date-input'
import { apiFetch } from '@/lib/client-fetch'
import { centsToEuros, formatCentsCurrency, parseEurosToCents } from '@/lib/money'
import { labelDateShort, labelYearMonthShort } from '@/lib/months'
import type { CategoryRowStats, MonthIndicators } from '@/types/domain'

const CategoryBudgetSpentChart = dynamic(
  () =>
    import('@/components/category-budget-spent-chart').then((m) => m.CategoryBudgetSpentChart),
  {
    ssr: false,
    loading: () => <p className="muted">Cargando gráfico…</p>
  }
)

interface Category {
  id: string
  name: string
}

interface Expense {
  id: string
  amountCents: number
  categoryId: string
  categoryName: string
  date: string
  yearMonth: string
}

interface DashboardData {
  yearMonth: string
  indicators: MonthIndicators
}

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sortCategoryRows(rows: CategoryRowStats[]): CategoryRowStats[] {
  return [...rows].sort((a, b) => {
    const aOver = a.spentCents > a.budgetCents ? 1 : 0
    const bOver = b.spentCents > b.budgetCents ? 1 : 0
    if (aOver !== bOver) return bOver - aOver
    if (b.spentCents !== a.spentCents) return b.spentCents - a.spentCents
    return a.name.localeCompare(b.name, 'es')
  })
}

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [yearMonth, setYearMonth] = useState('')
  const [byCategory, setByCategory] = useState<CategoryRowStats[]>([])
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [exp, cats, dash] = await Promise.all([
      apiFetch<{ yearMonth: string; expenses: Expense[] }>('/api/expenses'),
      apiFetch<{ categories: Category[] }>('/api/categories'),
      apiFetch<DashboardData>('/api/dashboard')
    ])
    setExpenses(exp.expenses)
    setYearMonth(exp.yearMonth || dash.yearMonth)
    setByCategory(sortCategoryRows(dash.indicators.byCategory))
    setCategories(cats.categories)
    setCategoryId((prev) => prev || cats.categories[0]?.id || '')
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [load])

  const chartRows: CategoryBudgetSpentPoint[] = useMemo(
    () =>
      byCategory
        .filter((r) => r.budgetCents > 0 || r.spentCents > 0)
        .map((r) => ({
          name: r.name,
          budgetCents: r.budgetCents,
          spentCents: r.spentCents,
          over: r.spentCents > r.budgetCents
        })),
    [byCategory]
  )

  const totals = useMemo(() => {
    let budget = 0
    let spent = 0
    for (const r of byCategory) {
      budget += r.budgetCents
      spent += r.spentCents
    }
    return { budget, spent, diff: budget - spent }
  }, [byCategory])

  function startEdit(exp: Expense) {
    setEditingId(exp.id)
    setAmount(centsToEuros(exp.amountCents).toFixed(2).replace('.', ','))
    setCategoryId(exp.categoryId)
    setDate(exp.date)
  }

  function resetForm() {
    setEditingId(null)
    setAmount('')
    setDate(todayIso())
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const amountCents = parseEurosToCents(amount)
      if (amountCents <= 0) throw new Error('Importe debe ser positivo')
      if (editingId) {
        await apiFetch(`/api/expenses/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ amountCents, categoryId, date })
        })
      } else {
        await apiFetch('/api/expenses', {
          method: 'POST',
          body: JSON.stringify({ amountCents, categoryId, date })
        })
      }
      resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function onDelete(id: string) {
    if (!window.confirm('¿Eliminar este gasto?')) return
    setError('')
    try {
      await apiFetch(`/api/expenses/${id}`, { method: 'DELETE' })
      if (editingId === id) resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar')
    }
  }

  return (
    <>
      <Head>
        <title>Gastos — Finanzas pareja</title>
      </Head>
      <AppPageLayout
        title="Gastos"
        lead={`Mes: ${yearMonth ? labelYearMonthShort(yearMonth) : '…'}`}>
        {error ? <div className="error-banner">{error}</div> : null}

        <section className="panel">
          <h2>{editingId ? 'Editar gasto' : 'Nuevo gasto'}</h2>
          <form className="stack" onSubmit={(e) => void onSubmit(e)}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="g-amount">Importe (€)</label>
                <input
                  id="g-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="g-cat">Categoría</label>
                <select
                  id="g-cat"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  required>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="g-date">Fecha</label>
                <CompactDateInput id="g-date" value={date} onChange={setDate} required />
              </div>
            </div>
            <div className="row">
              <button className="btn btn--primary" type="submit" disabled={saving}>
                {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear'}
              </button>
              {editingId ? (
                <button className="btn btn--ghost" type="button" onClick={resetForm}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </section>

        <section className="panel">
          <h2>Por categoría (mes)</h2>
          <div className="stats-grid" style={{ marginBottom: 12 }}>
            <div className="stat">
              <span className="stat__label">Presupuesto</span>
              <span className="stat__value">{formatCentsCurrency(totals.budget)}</span>
            </div>
            <div className="stat">
              <span className="stat__label">Gastado</span>
              <span className="stat__value">{formatCentsCurrency(totals.spent)}</span>
            </div>
            <div className={totals.diff < 0 ? 'stat stat--danger' : 'stat stat--ok'}>
              <span className="stat__label">Diferencia</span>
              <span className="stat__value">{formatCentsCurrency(totals.diff)}</span>
            </div>
          </div>
          <ul className="cat-list">
            {byCategory.map((row) => {
              const over = row.spentCents > row.budgetCents
              const diff = row.budgetCents - row.spentCents
              return (
                <li
                  key={row.categoryId}
                  className={over ? 'cat-row cat-row--over' : 'cat-row cat-row--ok'}>
                  <header className="cat-row__head">
                    <div className="cat-row__name-wrap">
                      <span className="cat-row__name">{row.name}</span>
                      {over ? (
                        <span className="cat-status cat-status--over">Excedida</span>
                      ) : null}
                    </div>
                  </header>
                  <div className="cat-row__grid">
                    <div>
                      <span className="cat-row__label">Presup.</span>
                      <span className="cat-row__value">
                        {formatCentsCurrency(row.budgetCents)}
                      </span>
                    </div>
                    <div>
                      <span className="cat-row__label">Gastado</span>
                      <span
                        className={
                          over ? 'cat-row__value cat-row__value--danger' : 'cat-row__value'
                        }>
                        {formatCentsCurrency(row.spentCents)}
                      </span>
                    </div>
                    <div>
                      <span className="cat-row__label">Dif.</span>
                      <span
                        className={
                          diff < 0 ? 'cat-row__value cat-row__value--danger' : 'cat-row__value'
                        }>
                        {formatCentsCurrency(diff)}
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
          {byCategory.length === 0 ? (
            <p className="muted">Sin categorías con presupuesto o gastos.</p>
          ) : null}
        </section>

        <section className="panel">
          <h2>Presupuesto vs gastado</h2>
          <CategoryBudgetSpentChart rows={chartRows} />
        </section>

        <section className="panel">
          <h2>Listado</h2>
          <div className="table-wrap">
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
                {expenses.map((exp) => (
                  <tr key={exp.id}>
                    <td>{labelDateShort(exp.date)}</td>
                    <td>{exp.categoryName}</td>
                    <td className="num">{formatCentsCurrency(exp.amountCents)}</td>
                    <td>
                      <div className="row">
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => startEdit(exp)}>
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          onClick={() => void onDelete(exp.id)}>
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {expenses.length === 0 ? <p className="muted">Sin gastos en este mes.</p> : null}
        </section>
      </AppPageLayout>
    </>
  )
}
