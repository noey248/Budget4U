import { emptyBudget, parseBackup } from './budget.js'

export const KEY = 'kanompang-ai:budget-4u'

export function loadBudget(storage = () => window.localStorage) {
  let raw
  try {
    raw = storage().getItem(KEY)
  } catch {
    return { data: emptyBudget(), status: 'unavailable' }
  }
  if (raw === null) return { data: emptyBudget(), status: 'ready' }
  try {
    return { data: parseBackup(raw), status: 'ready' }
  } catch {
    return { data: emptyBudget(), status: 'corrupt', raw }
  }
}

export function writeBudget(data, storage = () => window.localStorage) {
  try {
    storage().setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}
