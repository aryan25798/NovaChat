import { chromium } from 'playwright';
import path from 'path';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });

    try {
        await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
        const screenshotPath = 'C:\\Users\\aryan\\.gemini\\antigravity\\brain\\6621609a-6a6c-4299-a58b-ad707e21599f\\app_verification.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`✅ Screenshot saved to ${screenshotPath}`);
    } catch (error) {
        console.error('❌ Failed to capture screenshot:', error);
    } finally {
        await browser.close();
    }
})();
