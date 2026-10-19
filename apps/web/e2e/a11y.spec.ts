import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Plan §13: zero serious or critical violations on the guest pages.
for (const path of ['/r/demo/pt', '/r/demo/en', '/r/demo/pt/favorites', '/r/rtl/ar']) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path)
    const { violations } = await new AxeBuilder({ page }).analyze()
    const bad = violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    expect(bad.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
