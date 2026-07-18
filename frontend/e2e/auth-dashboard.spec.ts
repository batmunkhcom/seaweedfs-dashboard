import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/login|\/auth/)
  })

  test('login with valid credentials', async ({ page }) => {
    await page.goto('/')
    await page.fill('input[id="username"], input[placeholder*="Username"], input[placeholder*="username"]', 'admin')
    await page.fill('input[type="password"]', 'REDACTED_PASSWORD')
    await page.click('button[type="submit"], button:has-text("Login"), button:has-text("Sign")')
    await page.waitForTimeout(3000)

    const url = page.url()
    expect(url).not.toContain('login')
    expect(url).not.toContain('auth')
  })

  test('invalid credentials shows error', async ({ page }) => {
    await page.goto('/')
    const visible = await page.isVisible('input[type="password"]')
    if (!visible) {
      test.skip(true, 'No login form visible — already authenticated or different setup')
      return
    }
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"], button:has-text("Login")')
    await page.waitForTimeout(2000)
    const hasError = await page.isVisible('[class*="error"], [class*="message"], .ant-message-error')
    expect(hasError || (await page.locator('input[type="password"]').isVisible())).toBeTruthy()
  })
})

test.describe('Dashboard', () => {
  test('dashboard loads after login', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(5000)
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
    const hasStats = await page.isVisible('text=Total Volumes, text=Nodes, text=Disk Usage, text=Cluster Health')
    expect(hasStats || (await page.locator('.ant-statistic').count()) > 0).toBeTruthy()
  })
})
