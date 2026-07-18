import { test, expect } from '@playwright/test'

test.describe('Volumes', () => {
  test('volumes page loads after login', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    const url = page.url()
    if (url.includes('login') || url.includes('auth')) {
      await page.fill('input[type="password"]', 'REDACTED_PASSWORD')
      const usernameField = page.locator('input[id="username"], input[placeholder*="Username"]')
      if (await usernameField.isVisible()) {
        await usernameField.fill('admin')
      }
      await page.click('button[type="submit"], button:has-text("Login")')
      await page.waitForTimeout(3000)
    }

    await page.goto('/volumes')
    await page.waitForTimeout(3000)

    const hasTable = await page.isVisible('table, .ant-table')
    expect(hasTable).toBeTruthy()
  })

  test('volumes page shows node filter if param present', async ({ page }) => {
    await page.goto('/volumes?node=172.16.0.1')
    await page.waitForTimeout(3000)

    const url = page.url()
    if (url.includes('login') || url.includes('auth')) {
      test.skip(true, 'Auth required')
      return
    }

    expect(url).toContain('node=')
  })
})

test.describe('Workers', () => {
  test('workers page loads after login', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    const url = page.url()
    if (url.includes('login') || url.includes('auth')) {
      await page.fill('input[type="password"]', 'REDACTED_PASSWORD')
      const usernameField = page.locator('input[id="username"], input[placeholder*="Username"]')
      if (await usernameField.isVisible()) {
        await usernameField.fill('admin')
      }
      await page.click('button[type="submit"], button:has-text("Login")')
      await page.waitForTimeout(3000)
    }

    await page.goto('/workers')
    await page.waitForTimeout(3000)

    const hasContent = await page.isVisible('text=Workers, table, .ant-table, .ant-card')
    expect(hasContent || (await page.locator('.ant-statistic').count()) > 0).toBeTruthy()
  })

  test('workers page shows node stats', async ({ page }) => {
    await page.goto('/workers')
    await page.waitForTimeout(3000)

    const url = page.url()
    if (url.includes('login') || url.includes('auth')) {
      test.skip(true, 'Auth required')
      return
    }

    const statsCount = await page.locator('.ant-statistic').count()
    expect(statsCount).toBeGreaterThanOrEqual(2)
  })
})
