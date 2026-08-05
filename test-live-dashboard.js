const { chromium } = require('playwright');

async function testLiveDashboard() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Listen for console messages and errors
  page.on('console', msg => {
    console.log(`[Browser Console] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });
  
  page.on('pageerror', err => {
    console.error(`[Browser Runtime Error]`, err.stack || err.message);
  });

  console.log('Navigating to live FAMBotPage...');
  await page.goto('https://gregoriobueno-coder.github.io/FAMBotPage/', { waitUntil: 'networkidle' });
  
  console.log('Checking lock screen display state...');
  const lockScreenVisible = await page.isVisible('#lock-screen');
  console.log(`Lock screen visible: ${lockScreenVisible}`);

  if (lockScreenVisible) {
    console.log('Entering password...');
    await page.fill('#password-field', 'wanderingbear');
    console.log('Clicking Unlock...');
    await page.click('button:has-text("Unlock Dashboard")');
  } else {
    console.log('Lock screen not visible, skipping login...');
  }

  console.log('Waiting for main container to become visible...');
  await page.waitForSelector('#main-container', { state: 'visible', timeout: 5000 }).catch(e => {
    console.log('Main container did NOT become visible: ' + e.message);
  });

  console.log('Checking main container visibility...');
  const mainVisible = await page.isVisible('#main-container');
  console.log(`Main container visible: ${mainVisible}`);

  console.log('Checking visible row count in table...');
  const rowsCount = await page.$$eval('#table-body tr', rows => rows.length).catch(() => 0);
  console.log(`Visible deals rows count: ${rowsCount}`);

  console.log('Capturing redesigned dashboard screenshot...');
  await page.screenshot({ path: '/Users/gregoriobueno/.gemini/antigravity/brain/efd24403-1e9c-4d61-b58d-c4272d2f3dd1/redesigned_dashboard.png', fullPage: true });

  await browser.close();
}

testLiveDashboard();
