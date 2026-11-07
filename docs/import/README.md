# Datos de importación / seed

CSVs generados a partir del Excel real (noviembre 2026).

| Archivo | Contenido |
|---------|-----------|
| `import-2025.csv` | Histórico 2025 |
| `import-2026.csv` | 2026 completo |
| `import-2027.csv` | 2027 (planificación) |
| `import-2025-2027.csv` | Combinado |

## Seed operativo

Con la DB vacía (o para re-aplicar de forma idempotente):

```bash
# desde la raíz del repo, con .env (ATLAS_URI + ATLAS_DB_NAME o ATLAS_MIRROR_DB_NAME=mbpareja)
node scripts/seed-from-csv.mjs
```

Efecto:

1. Asegura las 13 categorías canónicas.
2. `2025-01`…`2026-10` → meses **closed** (presupuesto + gasto agregado por categoría).
3. `2026-11` → mes **activo open** (solo presupuesto).
4. `2026-12`, `2027-01`…`2027-05` → planificación futura (solo presupuesto).
5. No deja duplicados de gastos importados (`importKey`).

Ver también el formato genérico en [`../import-csv.md`](../import-csv.md).
