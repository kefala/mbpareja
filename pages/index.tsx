import Head from 'next/head'
import { signOut, useSession } from 'next-auth/react'

/** Placeholder autenticado — sin features de negocio (Fase 0). */
export default function HomePage() {
  const { data: session } = useSession()

  return (
    <>
      <Head>
        <title>Finanzas pareja</title>
      </Head>
      <main
        style={{
          minHeight: '100dvh',
          padding: '32px 20px',
          maxWidth: 640,
          margin: '0 auto'
        }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 700, color: '#0f172a' }}>
          Finanzas pareja
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 15, fontWeight: 500, color: '#475569' }}>
          Scaffold listo. Las pantallas de presupuesto, gastos y cuentas llegarán en fases
          posteriores.
        </p>
        {session?.user?.email ? (
          <p style={{ margin: '0 0 16px', fontSize: 14, color: '#334155' }}>
            Sesión: {session.user.email}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: '/login' })}
          style={{
            fontSize: 14,
            fontWeight: 600,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid #cbd5e1',
            background: '#fff',
            cursor: 'pointer'
          }}>
          Cerrar sesión
        </button>
      </main>
    </>
  )
}
