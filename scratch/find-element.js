const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { applyStealth } = require('../crypto-helper');

(async () => {
  console.log('Finding element on OneSource page...');
  const statePath = path.join(__dirname, '..', 'auth', 'onesource-state.json');
  if (!fs.existsSync(statePath)) {
    console.error('onesource-state.json not found!');
    return;
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-http2']
  });

  const context = await browser.newContext({
    storageState: statePath,
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });

  const page = await context.newPage();
  await applyStealth(page);

  try {
    const url = 'https://www.onesourcecruises.com/onesource/home/pages/other/travel-advisor-rates';
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(5000);

    // Find the element containing "View 2026 Travel Agent Fares" or "Fares"
    const elementDetails = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const found = elements.filter(el => {
        return el.childNodes.length === 1 && 
               el.childNodes[0].nodeType === 3 && 
               el.innerText && 
               (el.innerText.includes('Fares') || el.innerText.includes('rates') || el.innerText.includes('Rates'));
      });
      
      return found.map(el => ({
        tag: el.tagName,
        text: el.innerText.trim(),
        class: el.className,
        href: el.href || null,
        parentTag: el.parentElement ? el.parentElement.tagName : null,
        outerHTML: el.outerHTML.substring(0, 300)
      }));
    });

    console.log('Found elements matching keyword:', elementDetails.length);
    console.log(JSON.stringify(elementDetails.slice(0, 20), null, 2));

  } catch (error) {
    console.error('Failed to analyze elements:', error.message);
  } finally {
    await browser.close();
  }
})();
