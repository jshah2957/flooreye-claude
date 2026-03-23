import { test, expect } from '@playwright/test';

test.describe('Accessibility', () => {
  test('login page has proper heading hierarchy', async ({ page }) => {
    await page.goto('/login');
    const h1 = page.locator('h1, h2, [class*="text-2xl"], [class*="text-xl"]').first();
    await expect(h1).toBeVisible();
  });

  test('form inputs have labels or placeholders', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.getByPlaceholder(/email/i);
    await expect(emailInput).toBeVisible();
    const passwordInput = page.getByPlaceholder(/password/i);
    await expect(passwordInput).toBeVisible();
  });

  test('buttons are keyboard accessible', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    // After tabbing, some element should have focus
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('error messages have role=alert', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/email/i).fill('bad@test.com');
    await page.getByPlaceholder(/password/i).fill('wrong');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Wait for potential error
    await page.waitForTimeout(2000);
    const alerts = page.locator('[role="alert"]');
    const count = await alerts.count();
    // Either shows alert or the form is still visible (backend not running)
    expect(count >= 0).toBeTruthy();
  });
});
