import { test, expect } from '@playwright/test';

test.describe('Security', () => {
  test('login page does not expose sensitive data in HTML', async ({ page }) => {
    await page.goto('/login');
    const content = await page.content();
    // Should not contain API keys, tokens, or secrets
    expect(content).not.toContain('CHANGE_ME');
    expect(content).not.toContain('minioadmin');
    expect(content).not.toContain('flooreye_secret');
    expect(content).not.toContain('Bearer ey');
  });

  test('password field is type=password', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toBeVisible();
  });

  test('no autocomplete on password field or proper autocomplete attribute', async ({ page }) => {
    await page.goto('/login');
    const passwordInput = page.locator('input[type="password"]');
    const autocomplete = await passwordInput.getAttribute('autocomplete');
    // Should be 'current-password', 'new-password', or 'off'
    if (autocomplete) {
      expect(['current-password', 'new-password', 'off']).toContain(autocomplete);
    }
  });
});
