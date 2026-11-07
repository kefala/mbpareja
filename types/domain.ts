import type { ObjectId } from 'mongodb'

export type MonthStatus = 'open' | 'closed'

export interface BudgetLine {
  categoryId: string
  amountCents: number
  /** Si true, el restante positivo no cuenta en pendiente/margen este mes. */
  spentClosed?: boolean
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
  remainingCents: number
  overBudget: boolean
  spentClosed: boolean
}

export interface MonthIndicators {
  budgetTotalCents: number
  spentTotalCents: number
  remainingTotalCents: number
  pendingToExecuteCents: number
  accountsTotalCents: number
  projectedMarginCents: number
  byCategory: CategoryRowStats[]
}
