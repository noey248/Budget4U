import { describe, expect, it } from 'vitest'
import { decimal, deleteExpense, deletePool, emptyBudget, getMonth, money, parseBackup, parseMoney, saveExpense, savePool, setIncome, totals } from '../src/budget'
import { KEY, loadBudget, writeBudget } from '../src/storage'

const key = '2026-11'
const base = () => getMonth(emptyBudget(), key)
const funded = () => {
  const month = setIncome(base(), 1000000)
  return savePool(savePool(month, { ...month.pools[0], allocation: 300000 }), { ...month.pools[1], allocation: 100000 })
}
const expense = (month, updates = {}) => ({ id: 'meal', date: key + '-10', poolId: month.pools[0].id, amount: 12000, note: 'Lunch', ...updates })
const doc = month => ({ version: 1, months: { [key]: month } })

describe('budget records', () => {
  it('parses and formats exact satang, including safe integer boundaries', () => {
    expect(parseMoney('0.29')).toBe(29)
    expect(parseMoney('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER)
    expect(decimal(Number.MAX_SAFE_INTEGER)).toBe('90071992547409.91')
    expect(money(-12000)).toBe('−฿120.00')
    for (const invalid of ['', '1e2', '-1', '1.001', 'Infinity', '90071992547409.92']) expect(() => parseMoney(invalid)).toThrow()
    expect(() => parseMoney('0', true)).toThrow()
  })

  it('keeps allocations within income and calculates the acceptance example', () => {
    const month = funded()
    expect(() => setIncome(month, 399999)).toThrow()
    expect(() => savePool(month, { ...month.pools[0], allocation: 900001 })).toThrow()
    const updated = saveExpense(month, key, expense(month))
    expect(totals(updated)).toEqual({ allocated: 400000, spent: 12000, unallocated: 600000, remaining: 988000 })
    expect(updated.pools[0].allocation - updated.expenses[0].amount).toBe(288000)
  })

  it('allows overspending and edits or deletes expenses without orphaning entries', () => {
    const month = funded()
    const over = saveExpense(month, key, expense(month, { amount: 1000001 }))
    expect(totals(over).remaining).toBe(-1)
    expect(() => deletePool(over, over.pools[0].id)).toThrow()
    expect(() => saveExpense(over, key, expense(over, { date: '2026-11-31' }))).toThrow()
    expect(() => saveExpense(over, key, expense(over, { date: '2026-12-01' }))).toThrow()
    const moved = saveExpense(over, key, expense(over, { poolId: over.pools[1].id }))
    expect(moved.expenses).toHaveLength(1)
    expect(deletePool(moved, over.pools[0].id).pools).toHaveLength(over.pools.length - 1)
    expect(totals(deleteExpense(moved, 'meal')).spent).toBe(0)
  })

  it('starts a fresh budget with seven zero-allocation pools', () => {
    const month = base()
    expect(month.pools.map(pool => pool.name)).toEqual([
      'Food', 'Transportation', 'Education', 'Dormitory Rent', 'Entertainment', 'Shopping', 'Bills',
    ])
    expect(month.pools.every(pool => pool.allocation === 0)).toBe(true)
  })

  it('copies only names from the latest earlier month', () => {
    const month = funded()
    const updated = savePool(month, { ...month.pools[0], name: 'Groceries' })
    const data = doc(saveExpense(updated, key, expense(updated)))
    data.months['2026-10'] = { ...base(), pools: [] }
    data.months['2027-02'] = { ...base(), pools: [] }
    const december = getMonth(data, '2026-12')
    expect(december.pools.map(pool => [pool.name, pool.allocation])).toEqual(updated.pools.map(pool => [pool.name, 0]))
    expect(december.pools[0].id).not.toBe(updated.pools[0].id)
    expect(december.income).toBe(0)
    expect(december.expenses).toEqual([])
  })

  it('validates an entire backup, including duplicate IDs, references and overflow', () => {
    const month = funded()
    const original = doc(saveExpense(month, key, expense(month)))
    expect(parseBackup(JSON.stringify(original))).toEqual(original)
    const withoutNote = doc(saveExpense(month, key, expense(month, { note: undefined })))
    expect(parseBackup(JSON.stringify(withoutNote)).months[key].expenses[0].note).toBe('')
    for (const invalid of [
      '{', JSON.stringify({ ...original, version: 2 }),
      JSON.stringify(doc({ ...month, income: 0 })),
      JSON.stringify(doc({ ...month, pools: [month.pools[0], month.pools[0]] })),
      JSON.stringify(doc({ ...month, expenses: [expense(month, { poolId: 'unknown' })] })),
      JSON.stringify(doc({ ...month, expenses: [expense(month, { amount: Number.MAX_SAFE_INTEGER }), expense(month, { id: 'second' })] })),
    ]) expect(() => parseBackup(invalid)).toThrow('valid budget 4U backup')
  })
})

describe('storage', () => {
  it('opens missing storage data and round-trips a versioned document', () => {
    let raw = null
    const storage = () => ({
      getItem: key => key === KEY ? raw : null,
      setItem: (key, value) => { if (key === KEY) raw = value },
    })
    expect(loadBudget(storage).data).toEqual(emptyBudget())
    expect(writeBudget(doc(funded()), storage)).toBe(true)
    expect(loadBudget(storage)).toEqual({ data: doc(funded()), status: 'ready' })
  })

  it('reports storage access and write failures and retains corrupt raw data', () => {
    const denied = () => { throw Error('Denied') }
    expect(loadBudget(denied).status).toBe('unavailable')
    expect(writeBudget(emptyBudget(), () => ({ setItem: denied }))).toBe(false)
    expect(loadBudget(() => ({ getItem: () => '{broken' }))).toMatchObject({ status: 'corrupt', raw: '{broken' })
  })
})
