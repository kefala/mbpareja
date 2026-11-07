import type { BudgetLine, CategoryRowStats, MonthIndicators } from '@/types/domain'

export function lineAmountMap(lines: BudgetLine[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.categoryId, l.amountCents)
  return m
}

export function computeMonthIndicators(input: {
  lines: BudgetLine[]
  spentByCategory: Map<string, number>
  categories: { id: string; name: string }[]
  accountsTotalCents: number
}): MonthIndicators {
  const budgetMap = lineAmountMap(input.lines)
  const byCategory: CategoryRowStats[] = []

  let budgetTotalCents = 0
  let spentTotalCents = 0
  let pendingToExecuteCents = 0

  const seen = new Set<string>()

  for (const cat of input.categories) {
    seen.add(cat.id)
    const budgetCents = budgetMap.get(cat.id) ?? 0
    const spentCents = input.spentByCategory.get(cat.id) ?? 0
    const remainingCents = budgetCents - spentCents
    budgetTotalCents += budgetCents
    spentTotalCents += spentCents
    if (remainingCents > 0) pendingToExecuteCents += remainingCents
    byCategory.push({
      categoryId: cat.id,
      name: cat.name,
      budgetCents,
      spentCents,
      remainingCents,
      overBudget: remainingCents < 0
    })
  }

  for (const [categoryId, spentCents] of input.spentByCategory) {
    if (seen.has(categoryId)) continue
    const budgetCents = budgetMap.get(categoryId) ?? 0
    const remainingCents = budgetCents - spentCents
    budgetTotalCents += budgetCents
    spentTotalCents += spentCents
    if (remainingCents > 0) pendingToExecuteCents += remainingCents
    byCategory.push({
      categoryId,
      name: '(archivada)',
      budgetCents,
      spentCents,
      remainingCents,
      overBudget: remainingCents < 0
    })
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
