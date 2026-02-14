import { test, expect } from '@playwright/test';

test('verify app title and manifest', async ({ page }) => {
    await page.goto('http://localhost:5173/');

    // Check title
    await expect(page).toHaveTitle(/NovaChat/);

    // Check manifest link
    const manifestLink = await page.locator('link[rel="manifest"]');
    await expect(manifestLink).toBeAttached();

    console.log('✅ Title and Manifest verified successfully!');
});
