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

export default function ConfiguracionPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<ClosePreview | null>(null)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

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

  return (
    <>
      <Head>
        <title>Configuración — Finanzas pareja</title>
      </Head>
      <AppPageLayout title="Configuración" lead="Categorías y cierre mensual.">
        {error ? <div className="error-banner">{error}</div> : null}
        {ok ? <div className="ok-banner">{ok}</div> : null}

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
