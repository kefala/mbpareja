import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'

import { centsToEuros, formatCentsCurrency } from '@/lib/money'

export interface CategoryBudgetSpentPoint {
  name: string
  budgetCents: number
  spentCents: number
  over: boolean
}

interface CategoryBudgetSpentChartProps {
  rows: CategoryBudgetSpentPoint[]
}

const BUDGET_FILL = '#94a3b8'
const SPENT_OK = '#0f766e'
const SPENT_OVER = '#b91c1c'

export function CategoryBudgetSpentChart({ rows }: CategoryBudgetSpentChartProps) {
  const data = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name.length > 14 ? `${r.name.slice(0, 13)}…` : r.name,
        fullName: r.name,
        presupuesto: centsToEuros(r.budgetCents),
        gastado: centsToEuros(r.spentCents),
        over: r.over,
        budgetCents: r.budgetCents,
        spentCents: r.spentCents
      })),
    [rows]
  )

  if (!data.length)
    return <p className="muted">Sin datos de presupuesto/gasto para graficar.</p>

  const chartHeight = Math.max(220, Math.min(560, data.length * 42))

  return (
    <div className="chart-wrap" style={{ width: '100%', height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
          barCategoryGap={10}
          barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: '#64748b' }}
            tickFormatter={(v: number) =>
              v >= 1000
                ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k`
                : String(Math.round(v))
            }
          />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tick={{ fontSize: 11, fill: '#334155' }}
          />
          <Tooltip
            formatter={(value: unknown, name: string) => {
              const n = typeof value === 'number' ? value : Number(value)
              const label = name === 'presupuesto' ? 'Presupuesto' : 'Gastado'
              return [
                Number.isFinite(n)
                  ? n.toLocaleString('es-ES', {
                      style: 'currency',
                      currency: 'EUR',
                      minimumFractionDigits: 2
                    })
                  : '—',
                label
              ]
            }}
            labelFormatter={(_label, payload) => {
              const full = payload?.[0]?.payload?.fullName
              return typeof full === 'string' ? full : String(_label)
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => (value === 'presupuesto' ? 'Presupuesto' : 'Gastado')}
          />
          <Bar dataKey="presupuesto" name="presupuesto" fill={BUDGET_FILL} radius={[0, 3, 3, 0]} />
          <Bar dataKey="gastado" name="gastado" radius={[0, 3, 3, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.over ? SPENT_OVER : SPENT_OK} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
        Barras rojas = gastado &gt; presupuesto. Totales:{' '}
        {formatCentsCurrency(rows.reduce((s, r) => s + r.budgetCents, 0))} presup. ·{' '}
        {formatCentsCurrency(rows.reduce((s, r) => s + r.spentCents, 0))} gastado.
      </p>
    </div>
  )
}
