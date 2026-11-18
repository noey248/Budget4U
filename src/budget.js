export const emptyBudget = () => ({ version: 1, months: {} })
export const validMonth = value => typeof value === 'string' && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)
const integer = value => Number.isSafeInteger(value) && value >= 0
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const named = value => typeof value === 'string' && value.trim().length > 0
const sum = (items, field) => items.reduce((total, item) => total + item[field], 0)

export function parseMoney(input, positive = false) {
  const value = String(input).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw Error('Enter a baht amount with up to two decimal places.')
  const [baht, fraction = ''] = value.split('.')
  const satang = BigInt(baht) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (satang > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('This amount is too large.')
  if (positive && satang === 0n) throw Error('Enter an amount greater than zero.')
  return Number(satang)
}

export function decimal(value) {
  const amount = BigInt(Math.abs(value))
  return `${value < 0 ? '-' : ''}${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`
}

const grouping = new Intl.NumberFormat('en-TH')
export function money(value) {
  const satang = BigInt(value)
  const amount = satang < 0n ? -satang : satang
  const whole = amount / 100n
  const fraction = String(amount % 100n).padStart(2, '0')
  return `${value < 0 ? '−' : ''}฿${grouping.format(whole)}.${fraction}`
}

export function validDate(date, month) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month) return false
  const parsed = new Date(date + 'T00:00:00Z')
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === date
}

export function getMonth(doc, key) {
  if (Object.hasOwn(doc.months, key)) return doc.months[key]
  const previous = Object.keys(doc.months).filter(month => month < key).sort().at(-1)
  const names = previous ? doc.months[previous].pools.map(pool => pool.name) : ['Food', 'Transportation']
  return { income: 0, pools: names.map((name, i) => ({ id: `${key}-${i}`, name, allocation: 0 })), expenses: [] }
}

export function totals(month) {
  const allocated = sum(month.pools, 'allocation')
  const spent = sum(month.expenses, 'amount')
  return { allocated, spent, unallocated: month.income - allocated, remaining: month.income - spent }
}

export function setIncome(month, income) {
  if (!integer(income) || income < totals(month).allocated) throw Error('Income must cover existing allocations.')
  return { ...month, income }
}

export function savePool(month, pool) {
  const name = pool.name.trim()
  if (!name) throw Error('Enter a pool name.')
  const otherPools = month.pools.filter(item => item.id !== pool.id)
  if (!integer(pool.allocation) || pool.allocation > month.income - sum(otherPools, 'allocation')) {
    throw Error('Allocations cannot exceed monthly income.')
  }
  const entry = { ...pool, name }
  const pools = month.pools.some(item => item.id === pool.id)
    ? month.pools.map(item => item.id === pool.id ? entry : item)
    : [...month.pools, entry]
  return { ...month, pools }
}

export function deletePool(month, id) {
  if (month.expenses.some(item => item.poolId === id)) throw Error('Move or delete this pool’s expenses first.')
  return { ...month, pools: month.pools.filter(item => item.id !== id) }
}

export function saveExpense(month, key, expense) {
  if (!validDate(expense.date, key)) throw Error('Choose a date in the selected month.')
  if (!month.pools.some(pool => pool.id === expense.poolId)) throw Error('Choose a pool.')
  const others = month.expenses.filter(item => item.id !== expense.id)
  if (!integer(expense.amount) || expense.amount === 0 || expense.amount > Number.MAX_SAFE_INTEGER - sum(others, 'amount')) {
    throw Error('Enter a positive expense within the supported monthly total.')
  }
  return { ...month, expenses: [...others, expense] }
}

export function deleteExpense(month, id) {
  return { ...month, expenses: month.expenses.filter(item => item.id !== id) }
}

export function parseBackup(raw) {
  const fail = () => { throw Error('This file is not a valid budget 4U backup.') }
  let data
  try { data = JSON.parse(raw) } catch { fail() }
  if (!record(data) || data.version !== 1 || !record(data.months)) fail()
  const clean = emptyBudget()
  for (const [key, month] of Object.entries(data.months)) {
    if (!validMonth(key) || !record(month) || !integer(month.income) || !Array.isArray(month.pools) || !Array.isArray(month.expenses)) fail()
    const pools = new Set()
    const expenses = new Set()
    for (const pool of month.pools) {
      if (!record(pool) || !named(pool.id) || pools.has(pool.id) || !named(pool.name) || !integer(pool.allocation)) fail()
      pools.add(pool.id)
    }
    for (const expense of month.expenses) {
      if (!record(expense) || !named(expense.id) || expenses.has(expense.id) || !pools.has(expense.poolId) ||
        !integer(expense.amount) || !expense.amount || !validDate(expense.date, key) || (expense.note !== undefined && typeof expense.note !== 'string')) fail()
      expenses.add(expense.id)
    }
    const { allocated, spent } = totals(month)
    if (allocated > month.income || !integer(spent)) fail()
    clean.months[key] = {
      income: month.income,
      pools: month.pools.map(({ id, name, allocation }) => ({ id, name, allocation })),
      expenses: month.expenses.map(({ id, amount, date, poolId, note = '' }) => ({ id, amount, date, poolId, note })),
    }
  }
  return clean
}
