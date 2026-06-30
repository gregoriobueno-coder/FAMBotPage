const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { applyStealth } = require('../crypto-helper');

(async () => {
  console.log('Testing OneSource multi-brand switching...');
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
    viewport: { width: 1280, height: 1000 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });

  const page = await context.newPage();
  await applyStealth(page);

  try {
    const ratesUrl = 'https://www.onesourcecruises.com/onesource/home/pages/other/travel-advisor-rates';
    console.log(`Navigating to: ${ratesUrl}`);
    await page.goto(ratesUrl, { waitUntil: 'load' });
    await page.waitForTimeout(5000);

    // Accept consent if it shows up
    try {
      const consentBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Agree")');
      if (await consentBtn.count() > 0) {
        await consentBtn.first().click();
        await page.waitForTimeout(1000);
      }
    } catch (e) {}

    // Find the brand buttons in the header
    const brands = ['Princess', 'Holland America Line', 'Seabourn', 'Cunard'];
    
    for (const brand of brands) {
      console.log(`\n--- Switching to Brand: ${brand} ---`);
      
      // Let's find the brand link/button in the top brand selector bar
      // It might be a div or list item or anchor containing the brand text
      const brandSelector = `text=${brand}`;
      const locator = page.locator(brandSelector).first();
      
      if (await locator.count() > 0) {
        console.log(`Clicking brand selector for: ${brand}`);
        await locator.click();
        
        // Wait for page transition / load
        await page.waitForTimeout(5000);
        console.log(`Current page URL: ${page.url()}`);

        // Take a screenshot
        const screenshotPath = path.join(__dirname, '..', 'inspect', `onesource-brand-${brand.replace(/\s+/g, '')}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Saved screenshot: ${screenshotPath}`);

        // Now, let's extract PDF/weekly deals links on this brand's page
        const pageText = await page.innerText('body');
        console.log(`Page text snippet for ${brand}:`);
        console.log(pageText.substring(0, 400).replace(/\n+/g, ' '));
        
        // If there's a link to travel advisor fares or weekly deals, let's find it
        const links = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a'))
            .map(a => ({ text: a.innerText.trim(), href: a.href }))
            .filter(link => 
              link.text.toLowerCase().includes('fares') || 
              link.text.toLowerCase().includes('rates') || 
              link.text.toLowerCase().includes('deals') || 
              link.href.includes('.pdf') || 
              link.href.includes('.xls')
            );
        });
        console.log(`Target links found for ${brand}:`, links);

        // If we need to navigate to weekly-deals for this brand:
        if (links.some(l => l.text.toLowerCase().includes('weekly deals') || l.text.toLowerCase().includes('deals'))) {
          const dealLink = links.find(l => l.text.toLowerCase().includes('weekly deals') || l.text.toLowerCase().includes('deals')).href;
          console.log(`Navigating to weekly deals for ${brand}: ${dealLink}`);
          await page.goto(dealLink);
          await page.waitForTimeout(5000);
          
          const dealPageLinks = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('a'))
              .map(a => ({ text: a.innerText.trim(), href: a.href }))
              .filter(link => link.href.includes('.pdf') || link.href.includes('.xls'));
          });
          console.log(`PDF/XLS links on ${brand} weekly deals page:`, dealPageLinks);
          
          // Navigate back to travel advisor rates page
          await page.goto(ratesUrl);
          await page.waitForTimeout(3000);
        }
      } else {
        console.warn(`Brand selector not found for: ${brand}`);
      }
    }

  } catch (error) {
    console.error('Brand switching test failed:', error.message);
  } finally {
    await browser.close();
    console.log('Finished brand testing.');
  }
})();
