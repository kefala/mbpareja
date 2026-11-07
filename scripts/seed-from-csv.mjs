#!/usr/bin/env node
/**
 * Seed operativo de datos reales (noviembre 2026).
 *
 * - 13 categorías canónicas
 * - 2025-01..12 + 2026-01..10 → meses closed (presupuesto + gasto agregado)
 * - 2026-11 → mes activo open (solo líneas de presupuesto)
 * - 2026-12 + 2027-01..05 → planificación futura open (solo presupuesto)
 *
 * Uso:
 *   node scripts/seed-from-csv.mjs
 *   node scripts/seed-from-csv.mjs --csv docs/import/import-2025-2027.csv
 *
 * Lee ATLAS_URI y ATLAS_DB_NAME / ATLAS_MIRROR_DB_NAME desde .env (idempotente).
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient } from 'mongodb'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const CANONICAL_CATEGORIES = [
  'Pepephone',
  'IKEA / Cosas de la casa',
  'Alquiler',
  'Agua',
  'Luz',
  'Gas',
  'Viajes',
  'Samsung / Financiación',
  'Supermercado',
  'Perros',
  'Citas',
  'Limpieza',
  'Mofletes'
]

const ACTIVE_YM = '2026-11'
const CLOSED_UNTIL = '2026-10' // inclusive with all of 2025
const FUTURE_YMS = ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']

function loadEnv(path) {
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1)
    if (process.env[key] == null || process.env[key] === '') process.env[key] = val
  }
}

function eurosToCents(raw) {
  const t = String(raw).trim().replace(/\s/g, '')
  if (!t) return 0
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normalized)
  if (!Number.isFinite(n)) throw new Error(`Importe inválido: ${raw}`)
  return Math.round(n * 100)
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error('CSV vacío')
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const iCat = header.indexOf('categoria')
  const iYm = header.indexOf('year_month')
  const iBud = header.indexOf('presupuesto')
  const iGas = header.indexOf('gasto')
  if (iCat < 0 || iYm < 0 || iBud < 0 || iGas < 0)
    throw new Error('Cabecera CSV inválida (categoria,year_month,presupuesto,gasto)')

  /** @type {Map<string, Map<string, { budgetCents: number, spentCents: number }>>} */
  const byMonth = new Map()
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    // Categorías pueden contener comas? En estos CSV no. Nombres fijos.
    // Pero "IKEA / Cosas de la casa" no tiene coma.
    const category = cols[iCat]?.trim()
    const yearMonth = cols[iYm]?.trim()
    if (!category || !yearMonth) continue
    const budgetCents = eurosToCents(cols[iBud] ?? '0')
    const spentCents = eurosToCents(cols[iGas] ?? '0')
    if (!byMonth.has(yearMonth)) byMonth.set(yearMonth, new Map())
    byMonth.get(yearMonth).set(category, { budgetCents, spentCents })
  }
  return byMonth
}

function ymLte(a, b) {
  return a <= b
}

function isClosedTarget(ym) {
  return ym.startsWith('2025-') || (ym.startsWith('2026-') && ymLte(ym, CLOSED_UNTIL))
}

function expenseDate(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1))
}

async function main() {
  loadEnv(resolve(ROOT, '.env'))
  loadEnv(resolve(ROOT, '.env.local'))

  const args = process.argv.slice(2)
  const csvIdx = args.indexOf('--csv')
  const csvPath = resolve(
    ROOT,
    csvIdx >= 0 && args[csvIdx + 1]
      ? args[csvIdx + 1]
      : 'docs/import/import-2025-2027.csv'
  )

  const uri = process.env.ATLAS_URI?.trim() || process.env.ATLAS_MIRROR_URI?.trim()
  if (!uri) throw new Error('Falta ATLAS_URI en .env')
  const dbName =
    process.env.ATLAS_DB_NAME?.trim() ||
    process.env.ATLAS_MIRROR_DB_NAME?.trim() ||
    'mbpareja'

  console.log(`[seed] DB=${dbName} csv=${csvPath}`)
  const byMonth = parseCsv(readFileSync(csvPath, 'utf8'))

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 45_000 })
  await client.connect()
  const db = client.db(dbName)
  const now = new Date()

  try {
    await db.collection('budget_months').createIndex({ yearMonth: 1 }, { unique: true })
    await db.collection('expenses').createIndex({ yearMonth: 1, categoryId: 1 })
    await db.collection('expenses').createIndex({ importKey: 1 }, { unique: true, sparse: true })
    await db
      .collection('categories')
      .createIndex({ name: 1 }, { unique: true, collation: { locale: 'es', strength: 2 } })

    /** @type {Map<string, string>} */
    const catIds = new Map()
    for (const name of CANONICAL_CATEGORIES) {
      const existing = await db.collection('categories').findOne(
        { name },
        { collation: { locale: 'es', strength: 2 } }
      )
      if (existing) {
        await db.collection('categories').updateOne(
          { _id: existing._id },
          { $set: { name, archivedAt: null, updatedAt: now } }
        )
        catIds.set(name, String(existing._id))
      } else {
        const r = await db.collection('categories').insertOne({
          name,
          createdAt: now,
          updatedAt: now,
          archivedAt: null
        })
        catIds.set(name, String(r.insertedId))
      }
    }

    // Desactivar cualquier otro mes activo previo
    await db.collection('budget_months').updateMany(
      { isActive: true },
      { $set: { isActive: false, updatedAt: now } }
    )

    let closedMonths = 0
    let expensesUpserted = 0
    let futureMonths = 0

    async function upsertMonth({ yearMonth, status, isActive, includeSpent }) {
      const catMap = byMonth.get(yearMonth) ?? new Map()
      const lines = CANONICAL_CATEGORIES.map((name) => ({
        categoryId: catIds.get(name),
        amountCents: catMap.get(name)?.budgetCents ?? 0
      }))

      const existing = await db.collection('budget_months').findOne({ yearMonth })
      const doc = {
        yearMonth,
        status,
        isActive,
        lines,
        updatedAt: now,
        closedAt: status === 'closed' ? existing?.closedAt ?? now : null
      }
      if (existing) {
        await db.collection('budget_months').updateOne(
          { _id: existing._id },
          { $set: doc, $setOnInsert: { createdAt: now } }
        )
      } else {
        await db.collection('budget_months').insertOne({ ...doc, createdAt: now })
      }

      if (includeSpent) {
        for (const name of CANONICAL_CATEGORIES) {
          const spentCents = catMap.get(name)?.spentCents ?? 0
          const categoryId = catIds.get(name)
          const importKey = `${categoryId}:${yearMonth}`
          if (spentCents <= 0) {
            await db.collection('expenses').deleteOne({ importKey })
            continue
          }
          const payload = {
            amountCents: spentCents,
            categoryId,
            date: expenseDate(yearMonth),
            yearMonth,
            updatedAt: now,
            source: 'import',
            importKey
          }
          const prev = await db.collection('expenses').findOne({ importKey })
          if (prev) {
            await db.collection('expenses').updateOne(
              { _id: prev._id },
              { $set: payload }
            )
          } else {
            await db.collection('expenses').insertOne({ ...payload, createdAt: now })
          }
          expensesUpserted++
        }
      } else {
        // Activo / futuros: no gastos importados de seed
        for (const name of CANONICAL_CATEGORIES) {
          const categoryId = catIds.get(name)
          await db.collection('expenses').deleteOne({ importKey: `${categoryId}:${yearMonth}` })
        }
      }
    }

    // Closed: all months in CSV that are <= 2026-10
    const closedYms = [...byMonth.keys()].filter(isClosedTarget).sort()
    for (const yearMonth of closedYms) {
      await upsertMonth({
        yearMonth,
        status: 'closed',
        isActive: false,
        includeSpent: true
      })
      closedMonths++
    }

    // Active Nov 2026
    await upsertMonth({
      yearMonth: ACTIVE_YM,
      status: 'open',
      isActive: true,
      includeSpent: false
    })

    // Future planning
    for (const yearMonth of FUTURE_YMS) {
      await upsertMonth({
        yearMonth,
        status: 'open',
        isActive: false,
        includeSpent: false
      })
      futureMonths++
    }

    // Limpiar meses open que no sean activo ni los 6 futuros (p.ej. basura de bootstrap)
    const keepOpen = new Set([ACTIVE_YM, ...FUTURE_YMS])
    const stray = await db
      .collection('budget_months')
      .find({ status: 'open', yearMonth: { $nin: [...keepOpen] } })
      .toArray()
    for (const m of stray) {
      console.log(`[seed] eliminando mes open fuera de ventana: ${m.yearMonth}`)
      await db.collection('budget_months').deleteOne({ _id: m._id })
    }

    await db.collection('app_meta').updateOne(
      { _id: 'singleton' },
      { $set: { activeYearMonth: ACTIVE_YM, updatedAt: now } },
      { upsert: true }
    )

    const accCount = await db.collection('bank_accounts').countDocuments()
    if (accCount === 0) {
      await db.collection('bank_accounts').insertMany([
        { name: 'Cuenta conjunta', balanceCents: 0, updatedAt: now },
        { name: 'Cuenta ahorro', balanceCents: 0, updatedAt: now }
      ])
    }

    const categories = await db.collection('categories').countDocuments({
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }]
    })
    const active = await db.collection('budget_months').findOne({ isActive: true })
    const closedCount = await db.collection('budget_months').countDocuments({ status: 'closed' })
    const futureCount = await db.collection('budget_months').countDocuments({
      status: 'open',
      isActive: false
    })
    const closed2025 = await db.collection('budget_months').countDocuments({
      status: 'closed',
      yearMonth: { $regex: '^2025-' }
    })

    console.log('[seed] OK')
    console.log(
      JSON.stringify(
        {
          categories,
          activeYearMonth: active?.yearMonth ?? null,
          closedMonthsWritten: closedMonths,
          closedMonthsInDb: closedCount,
          closed2025,
          futureMonthsWritten: futureMonths,
          futureOpenInDb: futureCount,
          expensesUpserted,
          keepOpen: [...keepOpen]
        },
        null,
        2
      )
    )
  } finally {
    await client.close()
  }
}

main().catch((err) => {
  console.error('[seed] FAIL', err)
  process.exit(1)
})
