import React from 'react'
import { CalendarDays, ChartColumn, CircleAlert, ReceiptText, Wallet } from 'lucide-react'
import { money, totals } from './budget.js'
import { poolColors } from './BudgetCharts.jsx'

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, index, 1))))
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const percentage = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })
export const savingsRate = (net, income) => income ? percentage.format(Number(net) / Number(income)) : '—'

function categorySpending(month) {
  const names = new Map(month.pools.map(pool => [pool.id, pool.name]))
  const spending = new Map()
  for (const expense of month.expenses) {
    const name = names.get(expense.poolId)
    spending.set(name, (spending.get(name) ?? 0) + expense.amount)
  }
  return [...spending].sort((a, b) => b[1] - a[1])
}

export function MonthInsights({ month, pools, spent, monthKey, months, today }) {
  if (!spent && !month.income) return null
  const top = categorySpending(month)[0]
  const finalDate = new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5)), 0)).getUTCDate()
  const days = monthKey === today.slice(0, 7) ? Number(today.slice(8)) : finalDate
  const priorKey = new Date(Date.UTC(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5)) - 2, 1)).toISOString().slice(0, 7)
  const priorSpent = months[priorKey]?.expenses.reduce((total, expense) =>
    Number(expense.date.slice(8)) <= (monthKey === today.slice(0, 7) ? days : 31) ? total + expense.amount : total, 0)
  const change = priorSpent ? (spent - priorSpent) / priorSpent : null
  const nearLimit = pools.filter(pool => pool.allocation > 0 && pool.spent <= pool.allocation && pool.spent / pool.allocation >= .8)
  const over = pools.filter(pool => pool.spent > pool.allocation)
  return <section className="insight-grid" aria-label="Monthly insights">
    {top && <p><ChartColumn size={18} /><span><strong>{top[0]}</strong> accounts for {percentage.format(top[1] / spent)} of spending.</span></p>}
    {spent > 0 && <p><CalendarDays size={18} /><span><strong>{money(Math.round(spent / days))}</strong> spent per day on average.</span></p>}
    {change !== null && <p><ChartColumn size={18} /><span>Spending is <strong>{change === 0 ? 'unchanged' : percentage.format(Math.abs(change)) + (change > 0 ? ' higher' : ' lower')}</strong> than {monthKey === today.slice(0, 7) ? 'at this point last month' : 'last month'}.</span></p>}
    <p><Wallet size={18} /><span>Savings rate <strong>{savingsRate(month.income - spent, month.income)}</strong></span></p>
    {(over.length > 0 || nearLimit.length > 0) && <p className={over.length ? 'insight-alert' : ''}><CircleAlert size={18} />
      <span>{over.length ? <><strong>{over.map(pool => pool.name).join(', ')}</strong> {over.length === 1 ? 'is' : 'are'} over budget.</>
        : <><strong>{nearLimit.map(pool => pool.name).join(', ')}</strong> {nearLimit.length === 1 ? 'is' : 'are'} close to the limit.</>}</span></p>}
  </section>
}

export function SpendingDetails({ month }) {
  if (!month.expenses.length) return null
  const totalsByDay = Array(7).fill(0)
  for (const expense of month.expenses) {
    const day = new Date(expense.date + 'T00:00:00Z').getUTCDay()
    totalsByDay[(day + 6) % 7] += expense.amount
  }
  const scale = Math.max(...totalsByDay)
  const names = new Map(month.pools.map(pool => [pool.id, pool.name]))
  const largest = [...month.expenses].sort((a, b) => b.amount - a.amount).slice(0, 5)
  return <section className="chart-grid report-secondary" aria-label="Spending details">
    <article className="panel chart-card">
      <h2><CalendarDays size={20} /> Spending by weekday</h2>
      <ul className="weekday-chart">{weekdays.map((day, index) =>
        <li key={day}><span>{day}</span><div className="bar-track" aria-hidden="true"><div className="bar-fill" style={{
          '--bar-size': `${totalsByDay[index] / scale * 100}%`, '--bar-color': '#ce734b',
        }} /></div><strong>{money(totalsByDay[index])}</strong></li>)}</ul>
    </article>
    <article className="panel chart-card">
      <h2><ReceiptText size={20} /> Largest expenses</h2>
      <ol className="largest-list">{largest.map(expense => <li key={expense.id}>
        <span><strong>{expense.note || names.get(expense.poolId)}</strong><small>{names.get(expense.poolId)} · {expense.date}</small></span>
        <strong>{money(expense.amount)}</strong>
      </li>)}</ol>
    </article>
  </section>
}

export function AnnualReport({ months, monthKey, selectMonth }) {
  const year = monthKey.slice(0, 4)
  let net = 0n
  const rows = monthNames.map((name, index) => {
    const key = `${year}-${String(index + 1).padStart(2, '0')}`
    const month = months[key]
    const { spent, remaining } = month ? totals(month) : { spent: 0, remaining: 0 }
    const categories = month ? categorySpending(month) : []
    net += BigInt(remaining)
    return { key, name, income: month?.income ?? 0, spent, remaining, net, categories }
  })
  const active = rows.filter(row => row.income || row.spent)
  const scale = Math.max(1, ...rows.map(row => Math.max(row.income, row.spent)))
  const income = active.reduce((sum, row) => sum + BigInt(row.income), 0n)
  const spent = active.reduce((sum, row) => sum + BigInt(row.spent), 0n)
  const categoryNames = [...new Set(rows.flatMap(row => row.categories.map(([name]) => name)))]
  const colors = new Map(categoryNames.map((name, index) => [name, poolColors[index % poolColors.length]]))
  const lineRows = rows.slice(0, rows.lastIndexOf(active.at(-1)) + 1)
  const values = [0, ...lineRows.map(row => Number(row.net))]
  const min = Math.min(...values)
  const range = Math.max(1, Math.max(...values) - min)
  const points = lineRows.map((row, i) => [16 + i * 28, 106 - (Number(row.net) - min) / range * 94])
  const bars = (value, color, key) => <span key={key} style={{ flexBasis: `${value / scale * 100}%`, background: color }} />

  return <section id="annual" className="annual-report" aria-labelledby="annual-heading">
    <div className="report-title"><h2 id="annual-heading">{year} at a glance</h2><p>Choose a month to open its budget.</p></div>
    {active.length > 0 ? <>
      <div className="chart-grid annual-grid">
        <article className="panel chart-card">
          <h3>Income vs. spending</h3>
          <p className="series-key"><span className="income-key">Income</span><span className="spent-key">Spending</span></p>
          <div className="annual-bars">{rows.map(row =>
            <button key={row.key} type="button" aria-pressed={row.key === monthKey} onClick={() => selectMonth(row.key)}
              aria-label={`${row.name}, income ${money(row.income)}, spent ${money(row.spent)}`}>
              <span className="columns" aria-hidden="true"><span>{bars(row.income, '#517b69')}</span><span>{bars(row.spent, '#ce734b')}</span></span>
              <small>{row.name.slice(0, 3)}</small>
            </button>)}</div>
        </article>
        <article className="panel chart-card">
          <h3>Running savings</h3>
          <p className="report-hint">Income minus spending through {lineRows.at(-1).name}</p>
          <strong className={net < 0n ? 'negative' : ''}>{money(net)}</strong>
          <svg className="savings-line" viewBox="0 0 340 116" aria-hidden="true">
            <line x1="10" x2="330" y1={106 + min / range * 94} y2={106 + min / range * 94} stroke="#d6ded0" />
            <polyline points={points.map(point => point.join(',')).join(' ')} fill="none" stroke="#426c55" strokeWidth="2.5" />
            {points.map(([x, y], i) => <circle key={lineRows[i].key} cx={x} cy={y} r="3" fill="#426c55" />)}
          </svg>
          <div className="savings-months" aria-hidden="true">{rows.map(row => <small key={row.key}>{row.name.slice(0, 1)}</small>)}</div>
        </article>
      </div>
      {categoryNames.length > 0 && <article className="panel chart-card category-trend">
        <h3>Monthly spending by category</h3>
        <ul className="series-key category-key">{categoryNames.map(name => <li key={name}><i style={{ background: colors.get(name) }} />{name}</li>)}</ul>
        <div className="annual-bars">{rows.map(row => <button type="button" key={row.key} aria-pressed={row.key === monthKey}
          onClick={() => selectMonth(row.key)} aria-label={`${row.name} spending by category${row.categories.map(([name, amount]) => `, ${name} ${money(amount)}`).join('')}`}>
          <span className="columns stacked" aria-hidden="true"><span>{row.categories.map(([name, amount]) => bars(amount, colors.get(name), name))}</span></span>
          <small>{row.name.slice(0, 3)}</small>
        </button>)}</div>
      </article>}
    </> : <p className="panel chart-card report-hint">Record income or expenses to start seeing annual trends.</p>}
    <div className="panel annual-table">
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Annual summary table">
        <table>
          <thead><tr>{['Month', 'Income', 'Spent', 'Net', 'Savings rate', 'Largest category'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.key} data-selected={row.key === monthKey || undefined}>
            <th scope="row"><button aria-current={row.key === monthKey ? 'true' : undefined} type="button" onClick={() => selectMonth(row.key)}>{row.name}</button></th>
            <td>{row.income || row.spent ? money(row.income) : '—'}</td>
            <td>{row.income || row.spent ? money(row.spent) : '—'}</td>
            <td className={row.remaining < 0 ? 'negative' : ''}>{row.income || row.spent ? money(row.remaining) : '—'}</td>
            <td>{savingsRate(row.remaining, row.income)}</td><td>{row.categories[0]?.[0] ?? '—'}</td>
          </tr>)}</tbody>
          <tfoot><tr><th scope="row">Total {year}</th><td>{money(income)}</td><td>{money(spent)}</td><td>{money(net)}</td>
            <td>{savingsRate(net, income)}</td><td>—</td></tr>
            {active.length > 0 && <tr><th scope="row">Average ({active.length} mo.)</th>
              {[income, spent, net].map((value, index) => <td key={index}>{money(value / BigInt(active.length))}</td>)}<td>—</td><td>—</td></tr>}
          </tfoot>
        </table>
      </div>
    </div>
  </section>
}
