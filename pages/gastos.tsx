import Head from 'next/head'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import { CompactDateInput } from '@/components/compact-date-input'
import { apiFetch } from '@/lib/client-fetch'
import { centsToEuros, formatCentsCurrency, parseEurosToCents } from '@/lib/money'
import { labelDateShort, labelYearMonthShort } from '@/lib/months'

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

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GastosPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [yearMonth, setYearMonth] = useState('')
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
      apiFetch<{ yearMonth: string }>('/api/dashboard')
    ])
    setExpenses(exp.expenses)
    setYearMonth(exp.yearMonth || dash.yearMonth)
    setCategories(cats.categories)
    setCategoryId((prev) => prev || cats.categories[0]?.id || '')
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [load])

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
                <CompactDateInput
                  id="g-date"
                  value={date}
                  onChange={setDate}
                  required
                />
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
