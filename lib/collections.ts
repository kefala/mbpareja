import type { Db, Collection } from 'mongodb'

import type {
  AppMetaDoc,
  BankAccountDoc,
  BudgetMonthDoc,
  CategoryDoc,
  ExpenseDoc
} from '@/types/domain'

export function categoriesCol(db: Db): Collection<CategoryDoc> {
  return db.collection<CategoryDoc>('categories')
}

export function budgetMonthsCol(db: Db): Collection<BudgetMonthDoc> {
  return db.collection<BudgetMonthDoc>('budget_months')
}

export function expensesCol(db: Db): Collection<ExpenseDoc> {
  return db.collection<ExpenseDoc>('expenses')
}

export function bankAccountsCol(db: Db): Collection<BankAccountDoc> {
  return db.collection<BankAccountDoc>('bank_accounts')
}

export function appMetaCol(db: Db): Collection<AppMetaDoc> {
  return db.collection<AppMetaDoc>('app_meta')
}
