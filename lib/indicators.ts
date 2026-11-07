import type { BudgetLine, CategoryRowStats, MonthIndicators } from '@/types/domain'

export function lineAmountMap(lines: BudgetLine[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.categoryId, l.amountCents)
  return m
}

export function lineAdjustMap(lines: BudgetLine[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.categoryId, l.remainingAdjustCents ?? 0)
  return m
}

/** Fusiona importes nuevos conservando remainingAdjustCents existente. */
export function mergeBudgetLines(input: {
  previous: BudgetLine[]
  nextAmounts: { categoryId: string; amountCents: number }[]
}): BudgetLine[] {
  const adjustById = lineAdjustMap(input.previous)
  return input.nextAmounts.map((l) => {
    const remainingAdjustCents = adjustById.get(l.categoryId) ?? 0
    const line: BudgetLine = {
      categoryId: l.categoryId,
      amountCents: l.amountCents
    }
    if (remainingAdjustCents !== 0) line.remainingAdjustCents = remainingAdjustCents
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
  const adjustMap = lineAdjustMap(input.lines)
  const byCategory: CategoryRowStats[] = []

  let budgetTotalCents = 0
  let spentTotalCents = 0
  let remainingTotalCents = 0
  let pendingToExecuteCents = 0

  const seen = new Set<string>()

  function pushRow(categoryId: string, name: string, spentCents: number) {
    const budgetCents = budgetMap.get(categoryId) ?? 0
    const remainingAdjustCents = adjustMap.get(categoryId) ?? 0
    const remainingRawCents = budgetCents - spentCents
    const remainingEffectiveCents = remainingRawCents + remainingAdjustCents
    budgetTotalCents += budgetCents
    spentTotalCents += spentCents
    remainingTotalCents += remainingRawCents
    if (remainingEffectiveCents > 0) pendingToExecuteCents += remainingEffectiveCents
    byCategory.push({
      categoryId,
      name,
      budgetCents,
      spentCents,
      remainingRawCents,
      remainingAdjustCents,
      remainingEffectiveCents,
      overBudget: remainingEffectiveCents < 0
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
