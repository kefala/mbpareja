import { signIn } from 'next-auth/react'
import Head from 'next/head'

/** Acceso con Google (allowlist en servidor). */
export default function LoginPage() {
  return (
    <>
      <Head>
        <title>Iniciar sesión — Finanzas pareja</title>
      </Head>
      <main
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background:
            'radial-gradient(1200px 600px at 50% -10%, #dbeafe 0%, #f1f5f9 45%, #e2e8f0 100%)'
        }}>
        <section
          style={{
            width: '100%',
            maxWidth: 420,
            padding: '32px 28px',
            borderRadius: 16,
            background: 'rgba(255,255,255,0.92)',
            boxShadow: '0 25px 50px -12px rgba(15,23,42,0.18)',
            border: '1px solid rgba(148,163,184,0.35)'
          }}>
          <h1 style={{ margin: '0 0 10px', fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
            Finanzas pareja
          </h1>
          <p
            style={{
              margin: '0 0 22px',
              fontSize: 14,
              fontWeight: 500,
              color: '#475569',
              lineHeight: 1.55
            }}>
            Acceso privado con Google. Si tu correo no está autorizado, no podrás continuar.
          </p>
          <button
            type="button"
            onClick={() => void signIn('google', { callbackUrl: '/' })}
            style={{
              width: '100%',
              fontSize: 15,
              fontWeight: 600,
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10
            }}>
            <span aria-hidden style={{ fontSize: 18 }}>
              G
            </span>
            Continuar con Google
          </button>
        </section>
      </main>
    </>
  )
}
