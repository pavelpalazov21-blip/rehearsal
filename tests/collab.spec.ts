import { test, expect } from '@playwright/test'
test('an observer and a live checkout follow changes without reloading', async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Publish 25%' }).click()
  await expect(page.getByText('Published 25% as revision 1.')).toBeVisible()
  const guest = await browser.newContext({ baseURL })
  try {
    const observer = await guest.newPage()
    await observer.goto(page.url())
    await expect(observer.getByText('Read only', { exact: true })).toBeVisible()
    await expect(
      observer.getByRole('button', { name: 'Publish 25%' }),
    ).toHaveCount(0)
    const shop = await guest.newPage()
    await shop.goto(page.url() + '&customer=shopper-002')
    await expect(shop.getByLabel('Itemized checkout receipt')).toBeVisible()
    await expect(page.getByText('3 online', { exact: true })).toBeVisible({
      timeout: 12000,
    })
    await page.getByRole('button', { name: 'Restore revision 0 at 0%' }).click()
    await expect(observer.locator('.live-strip code')).toHaveText('rev 2')
    await expect(shop.getByLabel('Total-only checkout receipt')).toBeVisible()
    await expect(shop.getByText(/Published policy r2/)).toBeVisible()
  } finally {
    await guest.close()
  }
})
test('an older operator draft needs an explicit rebase', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Publish 25%' }).click()
  await expect(page.getByText('Published 25% as revision 1.')).toBeVisible()
  const other = await context.newPage()
  await other.goto(page.url())
  await other.getByRole('button', { name: '50%', exact: true }).click()
  await page.getByRole('button', { name: '100%', exact: true }).click()
  await page.getByRole('button', { name: 'Publish 100%' }).click()
  await expect(
    other.getByRole('button', { name: 'Publish 50%' }),
  ).toBeDisabled()
  await other.getByRole('button', { name: 'Review against revision 2' }).click()
  await other.getByRole('button', { name: 'Publish 50%' }).click()
  await expect(page.locator('.live-strip')).toContainText('rev 3')
})
