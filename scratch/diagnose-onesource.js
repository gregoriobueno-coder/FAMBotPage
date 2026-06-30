const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { applyStealth } = require('../crypto-helper');

(async () => {
  console.log('Starting OneSource login diagnosis...');
  const browser = await chromium.launch({
    headless: true, // We run headlessly so it runs in the background and saves screenshots
    args: ['--disable-http2']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });

  const page = await context.newPage();
  await applyStealth(page);

  const diagDir = path.join(__dirname, '..', 'inspect');
  if (!fs.existsSync(diagDir)) {
    fs.mkdirSync(diagDir, { recursive: true });
  }

  try {
    // Step 1: Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('https://www.onesourcecruises.com/onesource/login', { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(diagDir, 'onesource-step1.png') });
    console.log('Saved step 1 screenshot.');

    // Step 2: Fill credentials
    console.log('Entering credentials...');
    await page.locator('#userName').fill('GregorioTPI2369');
    await page.locator('#password').fill('8rs5kaMfh4Eg');
    await page.screenshot({ path: path.join(diagDir, 'onesource-step2.png') });
    console.log('Saved step 2 screenshot.');

    // Step 3: Click Sign In
    console.log('Submitting login...');
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(diagDir, 'onesource-step3.png') });
    console.log('Saved step 3 screenshot.');

    // Step 4: Wait more and capture final state
    console.log('Waiting another 5 seconds...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: path.join(diagDir, 'onesource-step4.png') });
    console.log('Saved step 4 screenshot.');
    
    // Dump HTML
    const html = await page.content();
    fs.writeFileSync(path.join(diagDir, 'onesource-diag.html'), html, 'utf8');
    console.log('Saved HTML dump.');

  } catch (error) {
    console.error('Diagnosis failed:', error.message);
  } finally {
    await browser.close();
    console.log('OneSource login diagnosis completed.');
  }
})();
