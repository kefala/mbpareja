import type { BudgetLine, CategoryRowStats, MonthIndicators } from '@/types/domain'

export function lineAmountMap(lines: BudgetLine[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.categoryId, l.amountCents)
  return m
}

export function lineSpentClosedMap(lines: BudgetLine[]): Map<string, boolean> {
  const m = new Map<string, boolean>()
  for (const l of lines) m.set(l.categoryId, Boolean(l.spentClosed))
  return m
}

/** Fusiona importes nuevos conservando spentClosed existente. */
export function mergeBudgetLines(input: {
  previous: BudgetLine[]
  nextAmounts: { categoryId: string; amountCents: number }[]
}): BudgetLine[] {
  const closedById = lineSpentClosedMap(input.previous)
  return input.nextAmounts.map((l) => {
    const spentClosed = closedById.get(l.categoryId)
    const line: BudgetLine = {
      categoryId: l.categoryId,
      amountCents: l.amountCents
    }
    if (spentClosed) line.spentClosed = true
    return line
  })
}

export function computeMonthIndicators(input: {
  lines: BudgetLine[]
  spentByCategory: Map<string, number>
  categories: { id: string; name: string }[]
  accountsTotalCents: number
}): MonthIndicators {
  const budgetMap = lineAmountMap(input.lines)
  const closedMap = lineSpentClosedMap(input.lines)
  const byCategory: CategoryRowStats[] = []

  let budgetTotalCents = 0
  let spentTotalCents = 0
  let pendingToExecuteCents = 0

  const seen = new Set<string>()

  function pushRow(categoryId: string, name: string, spentCents: number) {
    const budgetCents = budgetMap.get(categoryId) ?? 0
    const remainingCents = budgetCents - spentCents
    const spentClosed = closedMap.get(categoryId) ?? false
    budgetTotalCents += budgetCents
    spentTotalCents += spentCents
    // Solo restante positivo y categorías NO cerradas cuentan para pendiente/margen.
    if (remainingCents > 0 && !spentClosed) pendingToExecuteCents += remainingCents
    byCategory.push({
      categoryId,
      name,
      budgetCents,
      spentCents,
      remainingCents,
      overBudget: remainingCents < 0,
      spentClosed
    })
  }

  for (const cat of input.categories) {
    seen.add(cat.id)
    pushRow(cat.id, cat.name, input.spentByCategory.get(cat.id) ?? 0)
  }

  for (const [categoryId, spentCents] of input.spentByCategory) {
    if (seen.has(categoryId)) continue
    pushRow(categoryId, '(archivada)', spentCents)
  }

  byCategory.sort((a, b) => a.name.localeCompare(b.name, 'es'))

  const remainingTotalCents = budgetTotalCents - spentTotalCents
  const accountsTotalCents = input.accountsTotalCents
  const projectedMarginCents = accountsTotalCents - pendingToExecuteCents

  return {
    budgetTotalCents,
    spentTotalCents,
    remainingTotalCents,
    pendingToExecuteCents,
    accountsTotalCents,
    projectedMarginCents,
    byCategory
  }
}
