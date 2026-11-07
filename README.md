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

## Alcance

**Fase 0:** auth, Mongo `getDb()`, health, deploy stub.  
**Fase 1 (MVP):** categorías, presupuesto activo, planificación 6 meses, gastos, cuentas/margen, dashboard, cierre mensual atómico.  
**Fase 2:** histórico de meses cerrados (editable) + import CSV (preview/confirmación/anti-duplicados).  

**Fuera aún:** analítica avanzada (Fase 3).

## Flujos clave (local)

1. Login Google → Dashboard (seed automático de categorías, mes activo + 6 futuros, 2 cuentas).
2. **Presupuesto:** editar importes del mes activo → Guardar.
3. **Gastos / Dashboard:** registrar gasto (céntimos; UI en € con 2 decimales) → ver restante y desviaciones.
4. **Cuentas:** editar nombres y saldos → saldo total; margen en Dashboard.
5. **Planificación:** matriz 6 meses; blur en celda guarda.
6. **Configuración:** categorías (archivar) + **Cerrar mes activo** (confirmación + transacción).
7. **Import CSV (Config):** pegar CSV → Validar/preview → Confirmar. No toca activo ni planificación. Plantilla en `GET /api/import/csv` (ver `docs/import-csv.md`).
8. **Histórico:** abrir mes cerrado → editar presupuesto/gastos (sigue `closed`).
