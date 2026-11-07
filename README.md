# mbpareja — Finanzas pareja

App privada (Next.js 14 Pages Router) para finanzas compartidas de pareja. Auth Google + allowlist de 2 emails. MongoDB Atlas en **base distinta** a `final/online` (`ATLAS_DB_NAME=mbpareja`).

## Requisitos

- Node 20+
- Cuenta Google OAuth (mismo Client ID que final; añadir redirect del origen local/prod)
- Cluster Atlas (mismo que final está bien) con DB `mbpareja`

## Arranque local (`:3003`)

```bash
cp .env.example .env
# Completar ATLAS_URI, ATLAS_DB_NAME=mbpareja, GOOGLE_*, NEXTAUTH_*, ALLOWED_EMAILS
npm i
npm run dev
```

Abrir [http://localhost:3003](http://localhost:3003).

- `NEXTAUTH_URL=http://localhost:3003` en local.
- Producción (subdominio a configurar): `NEXTAUTH_URL=https://mbpareja.x.com`.

## Variables de entorno

Ver `.env.example` (solo nombres; sin secretos en el repo):

| Variable | Uso |
|----------|-----|
| `ATLAS_URI` | Cadena Mongo Atlas (servidor) |
| `ATLAS_DB_NAME` | `mbpareja` (no usar `trading_read`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Google |
| `NEXTAUTH_SECRET` / `NEXTAUTH_URL` | NextAuth |
| `ALLOWED_EMAILS` | Exactamente 2 emails (coma). Alias: `ONLINE_ALLOWED_EMAILS` |

## Health

`GET /api/health` (requiere sesión allowlist) → ping a Mongo (`db.command({ ping: 1 })`).

## Dinero

Datos en **céntimos enteros** (`lib/money.ts`). UI siempre con 2 decimales.

## Deploy VPS (stub)

`deploy.sh`: pull `main` → `npm i` → `npm run build` → `pm2 restart mbpareja-prod`.

Primera vez:

```bash
pm2 start npm --name "mbpareja-prod" -- run start
```

Puerto app: **3003** (final usa 3002 / `final-prod`).

## Alcance Fase 0

Scaffold: auth, Mongo `getDb()`, health, placeholder home. **Sin** features de negocio (presupuesto, gastos, CSV, etc.).
