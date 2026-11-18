import React from 'react'
import { ChartBar, ChartPie, CircleAlert } from 'lucide-react'
import { money } from './budget.js'

export const poolColors = ['#426c55', '#ce734b', '#5e64a3', '#bf8a2e', '#a04f77', '#327d88', '#79713a', '#8c6250']
const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })

export function BudgetCharts({ pools, spent }) {
  const slices = pools.filter(pool => pool.spent > 0)
  let start = 0
  const stops = slices.map(pool => {
    const from = start
    start += pool.spent
    return `${pool.color} ${from / spent * 100}% ${start / spent * 100}%`
  })
  const scale = pools.reduce((max, pool) => Math.max(max, pool.allocation, pool.spent), 0)
  const over = pools.filter(pool => pool.spent > pool.allocation)

  return <section className="chart-grid" aria-label="Monthly budget charts">
    <article className="panel chart-card" aria-labelledby="spending-chart">
      <h2 id="spending-chart"><ChartPie size={21} /> Spending breakdown</h2>
      {spent > 0 ? <div className="donut-layout">
        <div className="donut" style={{ backgroundImage: `conic-gradient(${stops.join(', ')})` }}>
          <div className="donut-center"><span>Total spent</span><strong>{money(spent)}</strong></div>
        </div>
        <ul className="chart-legend">
          {slices.map(pool => <li key={pool.id}>
            <i style={{ backgroundColor: pool.color }} aria-hidden="true" />
            <span>{pool.name}<small>{money(pool.spent)}</small></span>
            <strong>{percent.format(pool.spent / spent)}</strong>
          </li>)}
        </ul>
      </div> : <p className="chart-empty">Add an expense to see your spending by pool.</p>}
    </article>
    <article className="panel chart-card" aria-labelledby="comparison-chart">
      <h2 id="comparison-chart"><ChartBar size={21} /> Allocated vs. spent</h2>
      {scale > 0 ? <>
        <ul className="bar-list">
          {pools.map(pool => <li key={pool.id}>
            <strong className="bar-name">{pool.name}</strong>
            {[[pool.allocation, 'Allocated', 'allocated'], [pool.spent, 'Spent', 'spent']].map(([amount, label, kind]) =>
              <div className="bar-row" key={kind}>
                <span>{label}</span>
                <div className="bar-track" aria-hidden="true">
                  <div className={'bar-fill ' + kind} style={{ '--bar-size': `${amount / scale * 100}%`, '--bar-color': pool.color }} />
                </div>
                <strong>{money(amount)}</strong>
              </div>
            )}
          </li>)}
        </ul>
        {over.length > 0 && <p className="chart-warning"><CircleAlert size={16} />
          {over.length === 1 ? '1 pool is over budget.' : `${over.length} pools are over budget.`}
        </p>}
      </> : <p className="chart-empty">Allocate money or record spending to compare your pools.</p>}
    </article>
  </section>
}
