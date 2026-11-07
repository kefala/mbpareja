import Link from 'next/link'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import type { ReactNode } from 'react'

interface NavItem {
  href: string
  label: string
  shortLabel: string
}

const BOTTOM_NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', shortLabel: 'Home' },
  { href: '/presupuesto', label: 'Presupuesto', shortLabel: 'Presup.' },
  { href: '/planificacion', label: 'Planificación', shortLabel: 'Plan' },
  { href: '/gastos', label: 'Gastos', shortLabel: 'Gastos' },
  { href: '/cuentas', label: 'Cuentas', shortLabel: 'Cuentas' },
  { href: '/configuracion', label: 'Configuración', shortLabel: 'Config' }
]

interface AppPageLayoutProps {
  title: string
  lead?: ReactNode
  children: ReactNode
}

function navIsActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppPageLayout({ title, lead, children }: AppPageLayoutProps) {
  const router = useRouter()
  const pathname = router.pathname
  const { data: session } = useSession()

  return (
    <>
      <main className="app-page">
        <header className="app-page-header">
          <div className="app-page-header__row">
            <p className="app-brand">Finanzas pareja</p>
            {session?.user?.email ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void signOut({ callbackUrl: '/login' })}>
                Salir
              </button>
            ) : null}
          </div>
          <h1 className="app-page-title">{title}</h1>
          {lead ? <div className="app-page-lead">{lead}</div> : null}
        </header>
        {children}
      </main>
      <nav className="app-bottom-nav" aria-label="Navegación principal">
        {BOTTOM_NAV.map((item) => {
          const active = navIsActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? 'app-bottom-nav__link is-active' : 'app-bottom-nav__link'}
              aria-current={active ? 'page' : undefined}>
              <span className="app-bottom-nav__short">{item.shortLabel}</span>
              <span className="app-bottom-nav__full">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
