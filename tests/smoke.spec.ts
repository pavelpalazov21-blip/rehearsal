import { test, expect } from '@playwright/test'
for (const path of [
  '/rollcall',
  '/rollcall/',
  '/?space=old&customer=shopper-002',
]) {
  test('retired bookmark opens Rehearsal: ' + path, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveTitle(/Rehearsal/)
    await expect(
      page.getByRole('link', { name: 'Open the incident studio' }),
    ).toBeVisible()
    await expect(
      page.getByText('Price breakdown', { exact: true }),
    ).toHaveCount(0)
  })
}
for (const path of ['/rehearsal-source', '/rehearsal-source/']) {
  test(
    'anonymous source browser serves the release directly at ' + path,
    async ({ request, page }) => {
      const response = await request.get(path, { maxRedirects: 0 })
      expect(response.status()).toBe(200)
      expect(await response.text()).toContain('JavaScript evaluator')
      await page.goto(path)
      await page.getByText('JavaScript evaluator').first().click()
      await expect(page.locator('details[open] code')).toContainText(
        'checkJavaScript',
      )
      const listing = await (
        await request.get('/release-source/listing.json')
      ).json()
      expect(
        await (await request.get('/release-source/git/info/refs')).text(),
      ).toContain(listing.commit)
      await expect(page.locator('main p code')).toHaveText(
        listing.commit.slice(0, 12),
      )
    },
  )
}
test('client route can recover the source browser from an app shell', async ({
  page,
}) => {
  await page.route('**/rehearsal-source/', async (route) => {
    const shell = await route.fetch({
      url: new URL('/_spa.html', route.request().url()).href,
    })
    await route.fulfill({ response: shell })
  })
  await page.goto('/rehearsal-source/')
  await expect(
    page.getByRole('heading', { name: 'Source code', exact: true }),
  ).toBeVisible()
  await page.getByText('JavaScript evaluator').first().click()
  await expect(page.locator('details[open] code')).toContainText(
    'checkJavaScript',
  )
})
