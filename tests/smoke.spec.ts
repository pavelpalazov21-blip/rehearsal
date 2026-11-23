import { test, expect } from '@playwright/test'
for (const path of ['/rollcall', '/rollcall/', '/?space=old&customer=shopper-002']) {
  test('retired bookmark opens Rehearsal: ' + path, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveTitle(/Rehearsal/)
    await expect(page.getByRole('link', { name: 'Open the incident studio' })).toBeVisible()
    await expect(page.getByText('Price breakdown', {exact:true})).toHaveCount(0)
  })
}
