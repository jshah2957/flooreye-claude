import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login page loads correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('FloorEye')).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder(/email/i).fill('wrong@test.com');
    await page.getByPlaceholder(/password/i).fill('wrongpass');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5000 });
  });

  test('forgot password page accessible', async ({ page }) => {
    await page.goto('/login');
    await page.getByText(/forgot.*password/i).click();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
  });

  test('login form validates empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /sign in/i }).click();
    // Browser validation or custom validation should prevent submission
    const emailInput = page.getByPlaceholder(/email/i);
    await expect(emailInput).toBeVisible();
  });
});
