# Importación CSV de histórico

## Formato

- Encoding: UTF-8 (BOM opcional).
- Separador: `,` o `;` (se detecta por la cabecera).
- Decimales: punto o coma (`800.50` / `800,50`).

Cabeceras aceptadas:

| Campo | Alias |
|-------|--------|
| `categoria` | `category`, `nombre`, `name` |
| `year_month` | `anio_mes`, `mes`, `periodo`, `yearMonth` |
| `presupuesto` | `budget`, `presupuesto_eur` |
| `gasto` | `spent`, `gasto_eur`, `ejecutado`, `gastado` |

## Filas

1. **Solo categoría:** `NuevaCategoria,,,` → crea la categoría si no existe.
2. **Histórico:** `Alquiler,2024-01,800,800` → presupuesto y/o gasto agregado del mes.

El gasto se guarda como un movimiento agregado el día 1 del mes, con `importKey = categoryId:yearMonth` (anti-duplicados).

## Protecciones

No se modifica:

- el mes activo
- los meses abiertos de planificación futura

Esas filas aparecen como warning en el preview y se omiten al confirmar.

## Flujo

1. Descargar plantilla: `GET /api/import/csv`
2. Preview: `POST /api/import/csv` `{ "csv": "..." }`
3. Confirmar: `POST /api/import/csv` `{ "csv": "...", "confirm": true }`
