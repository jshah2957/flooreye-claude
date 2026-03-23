import { test, expect } from '@playwright/test';

test.describe('Navigation & Layout', () => {
  test('unauthenticated user redirected to login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/login/);
  });

  test('login page has FloorEye branding', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('FloorEye')).toBeVisible();
    await expect(page.getByText(/see every drop/i)).toBeVisible();
  });

  test('page is responsive at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    // Login card should not overflow
    const card = page.locator('.shadow-lg, [class*="shadow"]').first();
    if (await card.isVisible()) {
      const box = await card.boundingBox();
      if (box) expect(box.width).toBeLessThanOrEqual(375);
    }
  });

  test('page is responsive at tablet width', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});
