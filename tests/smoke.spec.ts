import { test, expect } from '@playwright/test'
test('a draft changes the test receipt; publishing and restoring survive refresh', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Price breakdown' }),
  ).toBeVisible()
  await expect(page.getByLabel('Itemized checkout receipt')).toBeVisible()
  await page.getByRole('button', { name: 'Published receipt' }).click()
  await expect(page.getByLabel('Total-only checkout receipt')).toBeVisible()
  await page
    .getByLabel('Release note')
    .fill('Try the breakdown on a small group.')
  await page.getByRole('button', { name: 'Publish 25%' }).click()
  await expect(page.getByText('Published 25% as revision 1.')).toBeVisible()
  await expect(page.getByLabel('Itemized checkout receipt')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Restore revision 0 at 0%' }).click()
  await expect(page.getByText('Restored revision 0 at 0%.')).toBeVisible()
  await expect(page.getByLabel('Total-only checkout receipt')).toBeVisible()
  await expect(page.locator('.history li')).toHaveCount(3)
})

test('the console finds a committed release when its HTTP response is lost', async ({
  page,
}) => {
  await page.goto('/')
  await page.route(
    '**/api/rollcall/workspaces/*/releases',
    async (route) => {
      const saved = await route.fetch()
      expect(saved.status()).toBe(201)
      await route.abort('failed')
    },
    { times: 1 },
  )
  await page.getByRole('button', { name: 'Publish 25%' }).click()
  await expect(page.getByText('Published 25% as revision 1.')).toBeVisible()
  await expect(page.locator('.history li')).toHaveCount(2)
  await expect(page.locator('.live-strip code')).toHaveText('rev 1')
})
