import Head from 'next/head'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import { apiFetch } from '@/lib/client-fetch'
import {
  centsToEuros,
  formatCentsCurrency,
  parseEurosToCents
} from '@/lib/money'
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

function formatAdjustInput(cents: number): string {
  return centsToEuros(cents).toFixed(2).replace('.', ',')
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [date, setDate] = useState(todayIso())
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [expectedDraft, setExpectedDraft] = useState('')
  const [savingAdjust, setSavingAdjust] = useState(false)

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

  function startEditExpected(categoryIdToEdit: string, remainingEffectiveCents: number) {
    setEditingId(categoryIdToEdit)
    setExpectedDraft(formatAdjustInput(remainingEffectiveCents))
  }

  async function saveExpected(categoryIdToSave: string, remainingRawCents: number, raw: string) {
    if (!data) return
    setSavingAdjust(true)
    setError('')
    try {
      const expectedCents = parseEurosToCents(raw || '0')
      const remainingAdjustCents = expectedCents - remainingRawCents
      const res = await apiFetch<{ indicators: MonthIndicators }>(
        '/api/budgets/remaining-adjust',
        {
          method: 'PATCH',
          body: JSON.stringify({
            categoryId: categoryIdToSave,
            remainingAdjustCents,
            yearMonth: data.yearMonth
          })
        }
      )
      setData((prev) => (prev ? { ...prev, indicators: res.indicators } : prev))
      setEditingId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el ajuste')
    } finally {
      setSavingAdjust(false)
    }
  }

  async function setExpectedZero(categoryIdToSave: string, remainingRawCents: number) {
    await saveExpected(categoryIdToSave, remainingRawCents, '0')
  }

  async function clearAdjust(categoryIdToSave: string) {
    if (!data) return
    setSavingAdjust(true)
    setError('')
    try {
      const res = await apiFetch<{ indicators: MonthIndicators }>(
        '/api/budgets/remaining-adjust',
        {
          method: 'PATCH',
          body: JSON.stringify({
            categoryId: categoryIdToSave,
            remainingAdjustCents: 0,
            yearMonth: data.yearMonth
          })
        }
      )
      setData((prev) => (prev ? { ...prev, indicators: res.indicators } : prev))
      setEditingId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo quitar el ajuste')
    } finally {
      setSavingAdjust(false)
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
              <span className="stat__label">Restante (bruto)</span>
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
            «Restante previsto» se puede ajustar si sabes que gastarás más o menos, sin tocar el
            presupuesto. Pendiente y margen usan ese valor (solo positivos).
          </p>
          <div className="cat-list">
            {ind?.byCategory.map((row) => {
              const isEditing = editingId === row.categoryId
              const hasAdjust = row.remainingAdjustCents !== 0
              return (
                <article
                  key={row.categoryId}
                  className={[
                    'cat-card',
                    row.overBudget ? 'cat-card--over' : '',
                    hasAdjust ? 'cat-card--adjusted' : ''
                  ]
                    .filter(Boolean)
                    .join(' ')}>
                  <header className="cat-card__head">
                    <h3 className="cat-card__title">{row.name}</h3>
                    {hasAdjust ? (
                      <span className="cat-card__badge">ajustado</span>
                    ) : null}
                  </header>
                  <div className="cat-card__grid">
                    <div>
                      <span className="cat-card__label">Presup.</span>
                      <span className="cat-card__value">
                        {formatCentsCurrency(row.budgetCents)}
                      </span>
                    </div>
                    <div>
                      <span className="cat-card__label">Gastado</span>
                      <span className="cat-card__value">
                        {formatCentsCurrency(row.spentCents)}
                      </span>
                    </div>
                    <div>
                      <span className="cat-card__label">Restante bruto</span>
                      <span className="cat-card__value">
                        {formatCentsCurrency(row.remainingRawCents)}
                      </span>
                    </div>
                  </div>

                  <div className="cat-card__expected">
                    <label className="cat-card__label" htmlFor={`exp-${row.categoryId}`}>
                      Restante previsto (€)
                    </label>
                    {isEditing ? (
                      <div className="row" style={{ marginTop: 6 }}>
                        <input
                          id={`exp-${row.categoryId}`}
                          className="cat-card__input"
                          inputMode="decimal"
                          value={expectedDraft}
                          disabled={savingAdjust}
                          onChange={(e) => setExpectedDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              void saveExpected(
                                row.categoryId,
                                row.remainingRawCents,
                                expectedDraft
                              )
                            }
                            if (e.key === 'Escape') setEditingId('')
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={savingAdjust}
                          onClick={() =>
                            void saveExpected(
                              row.categoryId,
                              row.remainingRawCents,
                              expectedDraft
                            )
                          }>
                          OK
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={savingAdjust}
                          onClick={() => setEditingId('')}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="row" style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          className="cat-card__expected-btn"
                          onClick={() =>
                            startEditExpected(row.categoryId, row.remainingEffectiveCents)
                          }>
                          {formatCentsCurrency(row.remainingEffectiveCents)}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          disabled={savingAdjust}
                          title="Poner restante previsto a 0"
                          onClick={() =>
                            void setExpectedZero(row.categoryId, row.remainingRawCents)
                          }>
                          → 0
                        </button>
                        {hasAdjust ? (
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={savingAdjust}
                            title="Quitar ajuste (volver al bruto)"
                            onClick={() => void clearAdjust(row.categoryId)}>
                            Reset
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      </AppPageLayout>
    </>
  )
}
