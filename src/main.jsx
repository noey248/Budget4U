import { BudgetCharts, poolColors } from './BudgetCharts.jsx'
import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ActionIcon, Alert, Button, MantineProvider, Modal, NativeSelect, TextInput, Textarea, createTheme } from '@mantine/core'
import { ArrowDownToLine, ArrowDownLeft, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, CircleAlert, Coins, Layers3, Pencil, Plus, ReceiptText, ShieldCheck, Trash2, Upload, Utensils, Wallet, BusFront } from 'lucide-react'
import '@mantine/core/styles.css'
import './style.css'
import { decimal, deleteExpense, deletePool, emptyBudget, getMonth, money, parseBackup, parseMoney, saveExpense, savePool, setIncome, totals, validMonth } from './budget.js'
import { loadBudget, writeBudget } from './storage.js'

const theme = createTheme({ primaryColor: 'moss', defaultRadius: 'md', fontFamily: 'Inter, system-ui, sans-serif', colors: {
  moss: ['#f1f5ec','#e6eedf','#d1dfc5','#b0c7a2','#95b086','#749769','#52764b','#3d6238','#30502b','#243f20'],
} })
const localDate = (date = new Date()) => [date.getFullYear(), date.getMonth() + 1, date.getDate()].map(x => String(x).padStart(2, '0')).join('-')
const displayDate = (value, options) => new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'))

function download(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function Editor({ dialog, month, monthKey, close, commit, replace }) {
  const { kind, entry, backup } = dialog
  const [error, setError] = useState('')
  const titles = {
    income: 'Edit monthly income', pool: entry ? 'Edit pool' : 'Add pool',
    expense: entry ? 'Edit expense' : 'Add expense', restore: 'Replace saved budgets?',
    reset: 'Reset unreadable data?', deletePool: 'Delete pool?', deleteExpense: 'Delete expense?',
  }
  const confirm = ['restore', 'reset', 'deletePool', 'deleteExpense'].includes(kind)
  const today = localDate()
  const lastDay = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5)), 0).getDate()
  const descriptions = {
    restore: 'This replaces all budgets in this browser with the contents of your backup.',
    reset: 'This replaces the unreadable saved data with a fresh budget.',
    deletePool: `“${entry?.name}” and its allocation will be removed.`,
    deleteExpense: 'This expense will be removed and your balances will update.',
  }

  function submit(event) {
    event.preventDefault()
    setError('')
    const fields = new FormData(event.currentTarget)
    try {
      if (kind === 'restore' || kind === 'reset') {
        if (!replace(backup ?? emptyBudget())) throw Error('Storage could not be updated. Your current data is preserved.')
      } else if (kind === 'income') {
        commit(setIncome(month, parseMoney(fields.get('amount'))))
      } else if (kind === 'pool') {
        commit(savePool(month, { id: entry?.id ?? crypto.randomUUID(), name: fields.get('name'), allocation: parseMoney(fields.get('amount')) }))
      } else if (kind === 'expense') {
        commit(saveExpense(month, monthKey, {
          id: entry?.id ?? crypto.randomUUID(), amount: parseMoney(fields.get('amount'), true),
          date: fields.get('date'), poolId: fields.get('poolId'), note: fields.get('note').trim(),
        }))
      } else {
        commit(kind === 'deletePool' ? deletePool(month, entry.id) : deleteExpense(month, entry.id))
      }
      close()
    } catch (failure) {
      setError(failure.message)
    }
  }

  return <Modal opened onClose={close} title={titles[kind]} centered overlayProps={{ backgroundOpacity: 0.38, blur: 2 }}>
    <form className="editor" onSubmit={submit}>
      {confirm ? <p>{descriptions[kind]}</p> : <>
        {kind === 'pool' && <TextInput name="name" label="Pool name" defaultValue={entry?.name} required data-autofocus />}
        <TextInput name="amount" label={kind === 'pool' ? 'Allocation (THB)' : 'Amount (THB)'}
          inputMode="decimal" required data-autofocus={kind !== 'pool' || undefined}
          defaultValue={kind === 'expense' && !entry ? '' : decimal(kind === 'income' ? month.income : (entry?.allocation ?? entry?.amount ?? 0))} />
        {kind === 'expense' && <>
          <NativeSelect name="poolId" label="Pool" data={month.pools.map(pool => ({ value: pool.id, label: pool.name }))} defaultValue={entry?.poolId} />
          <TextInput type="date" name="date" label="Date" required min={monthKey + '-01'} max={monthKey + '-' + lastDay}
            defaultValue={entry?.date ?? (today.startsWith(monthKey) ? today : monthKey + '-01')} />
          <Textarea name="note" label="Note (optional)" defaultValue={entry?.note} />
        </>}
      </>}
      {error && <Alert color="red" role="alert">{error}</Alert>}
      <div className="dialog-actions">
        <Button variant="default" onClick={close} data-autofocus={confirm || undefined}>Cancel</Button>
        <Button type="submit" color={kind.startsWith('delete') || kind === 'reset' ? 'red' : undefined}>
          {{ restore: 'Replace budgets', reset: 'Reset budget', deletePool: 'Delete pool', deleteExpense: 'Delete expense' }[kind] ?? 'Save'}
        </Button>
      </div>
    </form>
  </Modal>
}

function MonthPicker({ monthKey, close, choose }) {
  const [year, month] = monthKey.split('-')
  const months = Array.from({ length: 12 }, (_, i) => {
    const value = String(i + 1).padStart(2, '0')
    return { value, label: displayDate(`2000-${value}-01`, { month: 'long' }) }
  })
  return <Modal opened onClose={close} title="Choose budget month" centered>
    <form className="editor" onSubmit={event => {
      event.preventDefault()
      const fields = new FormData(event.currentTarget)
      const key = `${fields.get('year')}-${fields.get('month')}`
      if (!validMonth(key)) return
      choose(key)
      close()
    }}>
      <NativeSelect name="month" label="Month" data={months} defaultValue={month} data-autofocus />
      <TextInput name="year" label="Year" defaultValue={year} required inputMode="numeric" pattern="[1-9][0-9]{3}" title="Enter a four-digit year from 1000 to 9999." />
      <div className="dialog-actions">
        <Button variant="default" onClick={close}>Cancel</Button>
        <Button type="submit">Open month</Button>
      </div>
    </form>
  </Modal>
}

function App() {
  const [state, setState] = useState(loadBudget)
  const [monthKey, setMonthKey] = useState(() => localDate().slice(0, 7))
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const backupInput = useRef(null)
  const month = getMonth(state.data, monthKey)
  const { spent, unallocated, remaining } = totals(month)
  const corrupt = state.status === 'corrupt'
  const close = () => setDialog(null)
  const open = (kind, entry) => { setNotice(''); setDialog({ kind, entry }) }

  function persist(data, requireWrite = false) {
    if (!requireWrite && (corrupt || state.status === 'unavailable')) return false
    const saved = writeBudget(data)
    if (saved || !requireWrite) setState({ data, status: saved ? 'ready' : 'unsaved' })
    return saved
  }

  function selectMonth(key) {
    if (!validMonth(key) || key === monthKey) return
    setMonthKey(key)
    if (!Object.hasOwn(state.data.months, key) && !corrupt && state.status !== 'unavailable') {
      const data = { ...state.data, months: { ...state.data.months, [monthKey]: month } }
      data.months[key] = getMonth(data, key)
      persist(data)
    }
  }

  function shiftMonth(offset) {
    const date = new Date(monthKey + '-01T12:00:00')
    date.setMonth(date.getMonth() + offset)
    selectMonth(localDate(date).slice(0, 7))
  }

  async function readBackup(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      setNotice('')
      setDialog({ kind: 'restore', backup })
    } catch (failure) {
      setNotice(failure.message)
    }
  }

  const spendingByPool = new Map()
  for (const expense of month.expenses) {
    spendingByPool.set(expense.poolId, (spendingByPool.get(expense.poolId) ?? 0) + expense.amount)
  }
  const poolSummaries = month.pools.map((pool, index) => ({
    ...pool,
    spent: spendingByPool.get(pool.id) ?? 0,
    color: poolColors[index % poolColors.length],
  }))
  const expenseList = [...month.expenses].sort((a, b) => b.date.localeCompare(a.date))
  const stats = [
    ['Monthly income', month.income, ArrowDownLeft, 'Edit income'],
    ['Unallocated', unallocated, Layers3],
    ['Total spent', spent, ArrowUpRight],
    ['Remaining', remaining, Wallet],
  ]

  return <>
    <header className="top"><div className="shell top-inner">
      <div className="brand"><span className="brand-icon"><Wallet size={21} /></span><span>budget <b>4U</b></span></div>
      <div className="header-actions">
        <Button variant="subtle" leftSection={<ArrowDownToLine size={16} />} onClick={() => download(JSON.stringify(state.data, null, 2), 'budget-4u.json')} disabled={corrupt}>Export</Button>
        <Button variant="default" leftSection={<Upload size={16} />} onClick={() => backupInput.current.click()}>Restore</Button>
        <input ref={backupInput} type="file" accept=".json,application/json" hidden onChange={readBackup} />
      </div>
    </div></header>
    <main className="shell">
      <section className="intro" aria-labelledby="title">
        <div><h1 id="title">Monthly budget</h1><p>Plan your money and track where it goes.</p></div>
        <div className="month-control">
          <ActionIcon variant="subtle" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={18} /></ActionIcon>
          <Button className="month-field" variant="subtle" onClick={() => open('month')} leftSection={<CalendarDays size={17} />}
            aria-label={`Budget month, ${displayDate(monthKey + '-01', { month: 'long', year: 'numeric' })}`}>
            {displayDate(monthKey + '-01', { month: 'long', year: 'numeric' })}
          </Button>
          <ActionIcon variant="subtle" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={18} /></ActionIcon>
        </div>
      </section>
      {notice && <Alert color="red" role="alert" title="Restore failed">{notice}</Alert>}
      {corrupt && <Alert color="red" role="alert" title="Saved data could not be read" icon={<CircleAlert size={18} />}>
        Download the original contents before resetting, or restore a valid backup.
        <div className="recovery"><Button variant="default" onClick={() => download(state.raw, 'budget-4u-original.json')}>Download original</Button>
          <Button color="red" onClick={() => open('reset')}>Reset saved data</Button></div>
      </Alert>}
      {state.status === 'unavailable' && <Alert color="orange" role="alert" title="Browser storage is unavailable">Editing is paused to protect any existing budget. Reload after allowing local storage.</Alert>}
      {state.status === 'unsaved' && <Alert color="orange" role="alert" title="Changes could not be saved">Export a backup before closing this page. <Button size="compact-sm" variant="default" onClick={() => persist(state.data)}>Retry save</Button></Alert>}
      <fieldset disabled={corrupt || state.status === 'unavailable'}>
        <section className="summary" aria-label="Monthly overview">
          {stats.map(([label, amount, Icon, edit], i) => <article className={`stat stat-${i}`} key={label}>
            <div className="stat-top"><span className="stat-icon"><Icon size={19} /></span>
              {edit && <ActionIcon variant="subtle" aria-label={edit} onClick={() => open('income')}><Pencil size={16} /></ActionIcon>}</div>
            <div className="stat-label">{label}</div>
            <div className={'amount ' + (amount < 0 ? 'negative' : '')}>{money(amount)}</div>
            {amount < 0 && <div className="negative warning"><CircleAlert size={14} /> Over monthly income</div>}
          </article>)}
        </section>
        <BudgetCharts pools={poolSummaries} spent={spent} />
        <section className="panel" aria-labelledby="pools-heading">
          <div className="panel-head"><div><h2 id="pools-heading">Budget pools</h2><p>Set aside money for each spending category.</p></div>
            <Button variant="default" leftSection={<Plus size={17} />} onClick={() => open('pool')}>Add pool</Button></div>
          {month.pools.length ? <div className="pool-list">
            <div className="pool-grid column-head" aria-hidden="true"><span>Pool</span><span>Allocated</span><span>Spent</span><span>Remaining</span><span /></div>
            {poolSummaries.map(pool => {
              const poolSpent = pool.spent
              const balance = pool.allocation - poolSpent
              const Icon = pool.name === 'Food' ? Utensils : pool.name === 'Transportation' ? BusFront : Coins
              return <div className="pool-grid pool-row" key={pool.id}>
                <div className="pool-name"><span className="pool-icon"><Icon size={17} /></span><strong>{pool.name}</strong></div>
                <div className="pool-money"><span>Allocated</span>{money(pool.allocation)}</div>
                <div className="pool-money"><span>Spent</span>{money(poolSpent)}</div>
                <div className={'pool-money balance ' + (balance < 0 ? 'negative' : '')}><span>Remaining</span>{money(balance)}
                  {balance < 0 && <small className="warning"><CircleAlert size={13} /> Over budget</small>}</div>
                <div className="row-actions">
                  <ActionIcon variant="subtle" aria-label={`Edit ${pool.name}`} onClick={() => open('pool', pool)}><Pencil size={16} /></ActionIcon>
                  {poolSpent === 0 && <ActionIcon variant="subtle" color="gray" aria-label={`Delete ${pool.name}`} onClick={() => open('deletePool', pool)}><Trash2 size={16} /></ActionIcon>}
                </div>
              </div>
            })}
          </div> : <div className="empty"><Layers3 size={24} /><strong>No pools yet</strong><p>Add a pool to allocate income and track expenses.</p></div>}
        </section>
        <section className="panel history" aria-labelledby="history-heading">
          <div className="panel-head"><div><h2 id="history-heading">Spending history</h2><p>See what you’ve spent this month.</p></div>
            <Button leftSection={<Plus size={19} />} disabled={!month.pools.length} onClick={() => open('expense')}>Add expense</Button></div>
          {expenseList.length ? expenseList.map(expense => {
            const pool = month.pools.find(item => item.id === expense.poolId)
            return <div className="expense-row" key={expense.id}><span className="expense-icon"><ReceiptText size={18} /></span>
              <div className="expense-text"><strong>{expense.note || pool.name}</strong>
                <small>{displayDate(expense.date, { month: 'short', day: 'numeric' })} · {pool.name}</small></div>
              <strong>{money(expense.amount)}</strong>
              <div className="row-actions">
                <ActionIcon variant="subtle" aria-label={`Edit expense ${expense.note || pool.name}`} onClick={() => open('expense', expense)}><Pencil size={16} /></ActionIcon>
                <ActionIcon variant="subtle" color="gray" aria-label={`Delete expense ${expense.note || pool.name}`} onClick={() => open('deleteExpense', expense)}><Trash2 size={16} /></ActionIcon>
              </div>
            </div>
          }) : <div className="empty"><div className="empty-icon"><ReceiptText size={24} /></div><strong>No expenses yet</strong>
            <p>{month.pools.length ? 'Add an expense to see it here.' : 'Create a budget pool to start recording expenses.'}</p></div>}
        </section>
      </fieldset>
      <footer><ShieldCheck size={15} /> Your budget data stays in this browser.</footer>
    </main>
    {dialog?.kind === 'month' && <MonthPicker monthKey={monthKey} close={close} choose={selectMonth} />}
    {dialog && dialog.kind !== 'month' && <Editor dialog={dialog} month={month} monthKey={monthKey} close={close}
      commit={next => persist({ ...state.data, months: { ...state.data.months, [monthKey]: next } })}
      replace={data => persist(data, true)} />}
  </>
}

createRoot(document.getElementById('root')).render(<MantineProvider theme={theme}><App /></MantineProvider>)
