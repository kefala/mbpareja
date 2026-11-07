import type { ObjectId } from 'mongodb'

export type MonthStatus = 'open' | 'closed'

export interface BudgetLine {
  categoryId: string
  amountCents: number
  /**
   * Ajuste del restante (céntimos), sin cambiar el presupuesto.
   * restanteEfectivo = presupuesto − gastado + remainingAdjustCents
   * (negativo ⇒ esperas gastar más; positivo ⇒ sobrará más; −bruto ⇒ restante 0)
   * Campo legado `spentClosed` se ignora si existe en documentos antiguos.
   */
  remainingAdjustCents?: number
}

export interface CategoryDoc {
  _id?: ObjectId
  name: string
  createdAt: Date
  updatedAt: Date
  archivedAt?: Date | null
}

export interface BudgetMonthDoc {
  _id?: ObjectId
  yearMonth: string
  status: MonthStatus
  isActive: boolean
  lines: BudgetLine[]
  createdAt: Date
  updatedAt: Date
  closedAt?: Date | null
}

export interface ExpenseDoc {
  _id?: ObjectId
  amountCents: number
  categoryId: string
  date: Date
  yearMonth: string
  createdAt: Date
  updatedAt: Date
  /** Gasto agregado de import CSV; clave natural categoryId:yearMonth */
  source?: 'manual' | 'import'
  importKey?: string
}

export interface BankAccountDoc {
  _id?: ObjectId
  name: string
  balanceCents: number
  updatedAt: Date
}

export interface AppMetaDoc {
  _id: 'singleton'
  activeYearMonth: string
  updatedAt: Date
}

export interface CategoryRowStats {
  categoryId: string
  name: string
  budgetCents: number
  spentCents: number
  /** presupuesto − gastado (sin ajuste) */
  remainingRawCents: number
  remainingAdjustCents: number
  /** presupuesto − gastado + ajuste */
  remainingEffectiveCents: number
  overBudget: boolean
}

export interface MonthIndicators {
  budgetTotalCents: number
  spentTotalCents: number
  /** Suma de restantes brutos (sin ajuste) */
  remainingTotalCents: number
  pendingToExecuteCents: number
  accountsTotalCents: number
  projectedMarginCents: number
  byCategory: CategoryRowStats[]
}
