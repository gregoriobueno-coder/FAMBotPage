const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { applyStealth } = require('../crypto-helper');

(async () => {
  console.log('Running OneSource scraping analysis...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-http2']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 1600 }, // taller viewport to see more
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });

  const page = await context.newPage();
  await applyStealth(page);

  const authDir = path.join(__dirname, '..', 'auth');
  const statePath = path.join(authDir, 'onesource-state.json');

  try {
    // 1. Perform automated login
    console.log('Logging in to OneSource...');
    await page.goto('https://www.onesourcecruises.com/onesource/login', { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    await page.locator('#userName').fill('GregorioTPI2369');
    await page.locator('#password').fill('8rs5kaMfh4Eg');
    
    console.log('Submitting login...');
    await page.locator('button[type="submit"]').click();
    
    // Wait for the dashboard to load (we check for GREGORIO text or account menu)
    console.log('Waiting for landing page to load...');
    await page.waitForTimeout(10000);

    // Save the valid storage state now!
    console.log('Saving successful login storage state...');
    await context.storageState({ path: statePath });
    console.log(`Saved session cookies to: ${statePath}`);

    // 2. Navigate directly to Travel Advisor Rates
    const ratesUrl = 'https://www.onesourcecruises.com/onesource/home/pages/other/travel-advisor-rates';
    console.log(`Navigating to rates page: ${ratesUrl}`);
    await page.goto(ratesUrl, { waitUntil: 'load' });
    await page.waitForTimeout(5000);

    // Accept cookie consent dialog if it blocks
    try {
      const consentBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Agree")');
      if (await consentBtn.count() > 0) {
        console.log('Clicking cookie consent accept button...');
        await consentBtn.first().click();
        await page.waitForTimeout(2000);
      }
    } catch (e) {
      console.log('Cookie consent button check skipped:', e.message);
    }

    // Capture screenshot of the rates page
    await page.screenshot({ path: path.join(__dirname, '..', 'inspect', 'onesource-rates.png'), fullPage: true });
    console.log('Saved full-page screenshot of advisor rates page.');

    // Print all text elements on the page to search for rates
    const text = await page.innerText('body');
    fs.writeFileSync(path.join(__dirname, '..', 'inspect', 'onesource-body.txt'), text, 'utf8');
    console.log('Saved page body text dump.');

    // Check for pdf or table structures
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).map(a => ({
        text: a.innerText.trim(),
        href: a.href
      }));
    });
    fs.writeFileSync(path.join(__dirname, '..', 'inspect', 'onesource-links.json'), JSON.stringify(links, null, 2), 'utf8');
    console.log(`Saved link extractions (Total: ${links.length}).`);

  } catch (error) {
    console.error('OneSource analysis failed:', error.message);
  } finally {
    await browser.close();
    console.log('Analysis finished.');
  }
})();
