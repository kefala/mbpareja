import Head from 'next/head'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

import { AppPageLayout } from '@/components/app-page-layout'
import { apiFetch } from '@/lib/client-fetch'
import { labelYearMonth } from '@/lib/months'

interface Category {
  id: string
  name: string
  archived: boolean
}

interface ClosePreview {
  closingYearMonth: string
  nextActiveYearMonth: string
  newSixthYearMonth: string
}

interface ImportPreviewPayload {
  canConfirm: boolean
  issues: { line: number; level: string; message: string }[]
  summary: {
    categoryCreates: string[]
    categoryExisting: string[]
    monthsToUpsert: string[]
    monthsProtectedSkipped: string[]
    expenseCreates: number
    expenseDuplicates: number
    budgetLineUpserts: number
    categoryOnlyRows: number
  }
}

export default function ConfiguracionPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ClosePreview | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreviewPayload | null>(null)

  const load = useCallback(async () => {
    const [cats, close] = await Promise.all([
      apiFetch<{ categories: Category[] }>('/api/categories?includeArchived=1'),
      apiFetch<{ preview: ClosePreview }>('/api/months/close')
    ])
    setCategories(cats.categories)
    setPreview(close.preview)
  }, [])

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : 'Error'))
  }, [load])

  async function onSaveCategory(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setOk('')
    try {
      const trimmed = name.trim()
      if (!trimmed) throw new Error('Nombre obligatorio')
      if (editingId) {
        await apiFetch(`/api/categories/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmed })
        })
        setOk('Categoría actualizada')
      } else {
        await apiFetch('/api/categories', {
          method: 'POST',
          body: JSON.stringify({ name: trimmed })
        })
        setOk('Categoría creada')
      }
      setName('')
      setEditingId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteCategory(cat: Category) {
    if (!window.confirm(`¿Eliminar «${cat.name}»? Si tiene histórico se archivará.`)) return
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch<{ softDeleted: boolean }>(`/api/categories/${cat.id}`, {
        method: 'DELETE'
      })
      setOk(res.softDeleted ? 'Categoría archivada (tiene histórico)' : 'Categoría eliminada')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  async function onCloseMonth() {
    if (!preview) return
    const msg =
      `Cerrar ${labelYearMonth(preview.closingYearMonth)}.\n` +
      `Nuevo activo: ${labelYearMonth(preview.nextActiveYearMonth)}.\n` +
      `Nuevo 6º mes: ${labelYearMonth(preview.newSixthYearMonth)}.\n¿Confirmar?`
    if (!window.confirm(msg)) return
    setBusy(true)
    setError('')
    setOk('')
    try {
      await apiFetch('/api/months/close', {
        method: 'POST',
        body: JSON.stringify({ confirm: true })
      })
      setOk('Mes cerrado correctamente')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cerrar')
    } finally {
      setBusy(false)
    }
  }

  async function onPreviewCsv() {
    setBusy(true)
    setError('')
    setOk('')
    try {
      const res = await apiFetch<{ preview: ImportPreviewPayload }>('/api/import/csv', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText })
      })
      setImportPreview(res.preview)
      setOk(
        res.preview.canConfirm
          ? 'Validación OK. Revisa el resumen y confirma.'
          : 'Hay errores de validación; corrige el CSV.'
      )
    } catch (err) {
      setImportPreview(null)
      setError(err instanceof Error ? err.message : 'Error al validar CSV')
    } finally {
      setBusy(false)
    }
  }

  async function onConfirmCsv() {
    if (!importPreview?.canConfirm) return
    if (
      !window.confirm(
        '¿Confirmar importación? No alterará el mes activo ni la planificación futura. Los duplicados de gasto se omitirán.'
      )
    )
      return
    setBusy(true)
    setError('')
    setOk('')
    try {
      const res = await apiFetch<{
        ok: boolean
        applied: {
          categoriesCreated: number
          monthsUpserted: number
          expensesCreated: number
          expensesSkippedDuplicates: number
          rowsSkippedProtected: number
        }
      }>('/api/import/csv', {
        method: 'POST',
        body: JSON.stringify({ csv: csvText, confirm: true })
      })
      setOk(
        `Importado: ${res.applied.categoriesCreated} categorías, ${res.applied.monthsUpserted} meses, ${res.applied.expensesCreated} gastos` +
          (res.applied.expensesSkippedDuplicates
            ? ` (${res.applied.expensesSkippedDuplicates} duplicados omitidos)`
            : '') +
          (res.applied.rowsSkippedProtected
            ? ` (${res.applied.rowsSkippedProtected} filas protegidas omitidas)`
            : '')
      )
      setImportPreview(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al importar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Head>
        <title>Configuración — Finanzas pareja</title>
      </Head>
      <AppPageLayout title="Configuración" lead="Categorías, cierre mensual e importación CSV.">
        {error ? <div className="error-banner">{error}</div> : null}
        {ok ? <div className="ok-banner">{ok}</div> : null}

        <section className="panel">
          <h2>Importar histórico CSV</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            UTF-8, separador <code>,</code> o <code>;</code>. Columnas:{' '}
            <code>categoria,year_month,presupuesto,gasto</code>. No toca mes activo ni
            planificación. Decimales con punto o coma.
          </p>
          <div className="row" style={{ marginBottom: 10 }}>
            <a className="btn btn--ghost" href="/api/import/csv">
              Descargar plantilla
            </a>
          </div>
          <div className="field">
            <label htmlFor="csv">Pegar CSV</label>
            <textarea
              id="csv"
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value)
                setImportPreview(null)
              }}
              rows={8}
              style={{
                width: '100%',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 13,
                padding: 10,
                borderRadius: 10,
                border: '1px solid var(--line)'
              }}
              placeholder={'categoria,year_month,presupuesto,gasto\nAlquiler,2024-01,800,800'}
            />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy || !csvText.trim()}
              onClick={() => void onPreviewCsv()}>
              Validar / preview
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !importPreview?.canConfirm}
              onClick={() => void onConfirmCsv()}>
              Confirmar importación
            </button>
          </div>
          {importPreview ? (
            <div style={{ marginTop: 12 }}>
              <p className="muted" style={{ marginBottom: 8 }}>
                Categorías nuevas: {importPreview.summary.categoryCreates.length || 'ninguna'} ·
                Meses a escribir: {importPreview.summary.monthsToUpsert.join(', ') || '—'} ·
                Protegidos omitidos:{' '}
                {importPreview.summary.monthsProtectedSkipped.join(', ') || '—'} · Gastos nuevos:{' '}
                {importPreview.summary.expenseCreates} · Duplicados:{' '}
                {importPreview.summary.expenseDuplicates}
              </p>
              {importPreview.summary.categoryCreates.length > 0 ? (
                <p className="muted">
                  Crear: {importPreview.summary.categoryCreates.join(', ')}
                </p>
              ) : null}
              {importPreview.issues.length > 0 ? (
                <ul className="muted" style={{ paddingLeft: 18, margin: 0 }}>
                  {importPreview.issues.slice(0, 20).map((iss, i) => (
                    <li key={`${iss.line}-${i}`}>
                      L{iss.line} [{iss.level}] {iss.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Sin incidencias.</p>
              )}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2>Cierre mensual</h2>
          {preview ? (
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                Se cerrará <strong>{labelYearMonth(preview.closingYearMonth)}</strong>. Pasará a
                activo <strong>{labelYearMonth(preview.nextActiveYearMonth)}</strong>. Se añadirá{' '}
                <strong>{labelYearMonth(preview.newSixthYearMonth)}</strong> copiando el 6º mes
                actual.
              </p>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => void onCloseMonth()}>
                Cerrar mes activo
              </button>
            </div>
          ) : (
            <p className="muted">Cargando vista previa…</p>
          )}
        </section>

        <section className="panel">
          <h2>Categorías</h2>
          <form className="row" onSubmit={(e) => void onSaveCategory(e)} style={{ marginBottom: 12 }}>
            <div className="field">
              <label htmlFor="cat-name">{editingId ? 'Renombrar' : 'Nueva categoría'}</label>
              <input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre"
                required
              />
            </div>
            <button className="btn btn--primary" type="submit" disabled={busy}>
              {editingId ? 'Guardar' : 'Crear'}
            </button>
            {editingId ? (
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => {
                  setEditingId(null)
                  setName('')
                }}>
                Cancelar
              </button>
            ) : null}
          </form>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.archived ? 'Archivada' : 'Activa'}</td>
                    <td>
                      {!c.archived ? (
                        <div className="row">
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            onClick={() => {
                              setEditingId(c.id)
                              setName(c.name)
                            }}>
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            onClick={() => void onDeleteCategory(c)}>
                            Eliminar
                          </button>
                        </div>
                      ) : null}
                    </td>
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
