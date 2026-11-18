import { expect, test } from '@playwright/test'

const path = '/Budget4U/'
const overview = page => page.getByRole('region', { name: 'Monthly overview' })
const dialog = page => page.getByRole('dialog')
const capture = (page, file, mimeType = 'application/json') => page.locator('input[type=file]').setInputFiles({ name: 'budget.json', mimeType, buffer: Buffer.from(file) })

async function enterBudget(page) {
  await page.getByRole('button', { name: 'Edit income' }).click()
  await dialog(page).getByLabel('Amount (THB)').fill('10000')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  for (const [pool, amount] of [['Food', '3000'], ['Transportation', '1000']]) {
    await page.getByRole('button', { name: 'Edit ' + pool }).click()
    await dialog(page).getByLabel('Allocation (THB)').fill(amount)
    await dialog(page).getByRole('button', { name: 'Save' }).click()
  }
  await page.getByRole('button', { name: 'Add expense' }).click()
  await dialog(page).getByLabel('Amount (THB)').fill('120')
  await dialog(page).getByLabel('Note (optional)').fill('Lunch')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
}

test('production assets, budgeting flow, persistence and month isolation', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  const response = await page.goto(path)
  expect(response.ok()).toBeTruthy()
  for (const asset of await page.locator('script[src], link[rel=stylesheet]').evaluateAll(nodes => nodes.map(node => node.getAttribute('src') ?? node.getAttribute('href')))) {
    expect(asset).toMatch(/^\/Budget4U\/assets\//)
    expect((await page.request.get(asset)).ok()).toBeTruthy()
  }
  await enterBudget(page)
  await expect(overview(page)).toContainText('฿6,000.00')
  await expect(overview(page)).toContainText('฿9,880.00')
  await expect(page.getByText('฿2,880.00', { exact: false })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Lunch')).toBeVisible()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.getByText('No expenses yet')).toBeVisible()
  await expect(page.getByText('Food', { exact: true })).toBeVisible()
  await expect(overview(page)).not.toContainText('฿10,000.00')
  const local = await page.evaluate(() => [new Date().getFullYear(), new Date().getMonth() + 1])
  await page.getByRole('button', { name: /^Budget month/ }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog(page).getByLabel('Month', { exact: true })).toBeFocused()
  await dialog(page).getByLabel('Month', { exact: true }).selectOption(String(local[1]).padStart(2, '0'))
  await dialog(page).getByLabel('Year').fill(String(local[0]))
  await dialog(page).getByRole('button', { name: 'Open month' }).click()
  await expect(page.getByText('Lunch')).toBeVisible()
  expect(errors).toEqual([])
})

test('backup restoration is validated and requires confirmation', async ({ page }) => {
  await page.goto(path)
  await enterBudget(page)
  const exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export' }).click()
  const backup = await (await exported).path()
  await capture(page, '{}')
  await expect(page.getByText('Restore failed')).toBeVisible()
  await expect(page.getByText('Lunch')).toBeVisible()
  await page.getByRole('button', { name: 'Delete expense Lunch' }).click()
  await dialog(page).getByRole('button', { name: 'Delete expense' }).click()
  await page.locator('input[type=file]').setInputFiles(backup)
  await expect(dialog(page)).toContainText('Replace saved budgets?')
  await expect(page.getByText('No expenses yet')).toBeVisible()
  await dialog(page).getByRole('button', { name: 'Replace budgets' }).click()
  await expect(page.getByText('Lunch')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Lunch')).toBeVisible()
})

for (const width of [360, 768, 1440]) {
  test(`keyboard, overspending and layout at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 950 })
    await page.goto(path)
    await expect(page.getByRole('button', { name: 'Export' })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Export' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Restore' })).toBeFocused()
    const add = page.getByRole('button', { name: 'Add expense' })
    await add.focus()
    await page.keyboard.press('Enter')
    await expect(dialog(page).getByLabel('Amount (THB)')).toBeFocused()
    await page.keyboard.type('120')
    await page.keyboard.press('Enter')
    await expect(page.getByText('Over budget', { exact: true })).toBeVisible()
    await expect(page.getByText('Over monthly income', { exact: true })).toBeVisible()
    await expect(dialog(page)).toBeHidden()
    const layout = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll('body *')].flatMap(element => {
        const rect = element.getBoundingClientRect()
        return rect.right > innerWidth + 1 ? [element.tagName + '.' + element.getAttribute('class')] : []
      }).slice(0, 15),
    }))
    expect(layout.width, layout.overflowing.join(', ')).toBe(width)
    await page.screenshot({ path: info.outputPath(`ledger-${width}.png`), fullPage: true })
  })
}

test('corrupt data can be downloaded before a confirmed reset', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('kanompang-ai:budget-4u', '{broken')
      sessionStorage.setItem('seeded', 'yes')
    }
  })
  await page.goto(path)
  await expect(page.getByRole('alert')).toContainText('Saved data could not be read')
  await expect(page.getByRole('button', { name: 'Edit income' })).toBeDisabled()
  const exported = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download original' }).click()
  expect((await exported).suggestedFilename()).toBe('budget-4u-original.json')
  await page.getByRole('button', { name: 'Reset saved data' }).click()
  expect(await page.evaluate(() => localStorage.getItem('kanompang-ai:budget-4u'))).toBe('{broken')
  await dialog(page).getByRole('button', { name: 'Reset budget' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('failed writes remain visible and can be retried', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'kanompang-ai:budget-4u' && window.budgetWriteDenied) throw new DOMException('Storage full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
  })
  await page.goto(path)
  await page.evaluate(() => { window.budgetWriteDenied = true })
  await page.getByRole('button', { name: 'Edit income' }).click()
  await dialog(page).getByLabel('Amount (THB)').fill('50')
  await dialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('alert')).toContainText('Changes could not be saved')
  await expect(overview(page)).toContainText('฿50.00')
  await page.evaluate(() => { window.budgetWriteDenied = false })
  await page.getByRole('button', { name: 'Retry save' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.reload()
  await expect(overview(page)).toContainText('฿50.00')
})
