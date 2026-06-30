const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { applyStealth } = require('./crypto-helper');
require('dotenv').config();

// Load configurations
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('Error: config.json not found.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Parse command line arguments
const portalName = process.argv[2];
const customUrl = process.argv[3];

if (!portalName) {
  console.log('Usage: node inspect.js <portal_name> [custom_url]');
  console.log('Available portals:', config.portals.map(p => p.name).join(', '));
  process.exit(1);
}

const portal = config.portals.find(p => p.name === portalName);
if (!portal) {
  console.error(`Error: Portal "${portalName}" not found in config.json.`);
  process.exit(1);
}

const statePath = path.join(__dirname, 'auth', `${portal.name}-state.json`);
if (!fs.existsSync(statePath)) {
  console.error(`Error: Saved session state not found at: ${statePath}`);
  console.error(`Please run "node auth.js ${portal.name}" first to authenticate.`);
  process.exit(1);
}

const inspectDir = path.join(__dirname, 'inspect');
if (!fs.existsSync(inspectDir)) {
  fs.mkdirSync(inspectDir, { recursive: true });
}

const targetUrl = customUrl || portal.url;
const screenshotPath = path.join(inspectDir, `${portal.name}-screenshot.png`);
const htmlPath = path.join(inspectDir, `${portal.name}-page.html`);

(async () => {
  console.log(`\n==================================================`);
  console.log(`Inspecting portal: ${portal.displayName}`);
  console.log(`Target URL: ${targetUrl}`);
  console.log(`Using state file: ${statePath}`);
  console.log(`==================================================\n`);

  const headless = process.env.HEADLESS !== 'false';
  const timeout = parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000', 10);

  const browser = await chromium.launch({
    headless,
    args: ['--disable-http2']
  });
  
  try {
    // Load context with saved storage state
    console.log('Loading session context...');
    const context = await browser.newContext({
      storageState: statePath,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
    
    const page = await context.newPage();
    await applyStealth(page);
    page.setDefaultTimeout(timeout);

    console.log(`Navigating to ${targetUrl}...`);
    const response = await page.goto(targetUrl, { waitUntil: 'load' });
    
    console.log(`HTTP Status: ${response ? response.status() : 'No response'}`);
    
    console.log('Waiting 5 seconds for dynamic content to load...');
    await page.waitForTimeout(5000);

    // Save screenshot
    console.log('Capturing screenshot...');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);

    // Save HTML
    console.log('Dumping HTML page source...');
    const htmlContent = await page.content();
    fs.writeFileSync(htmlPath, htmlContent, 'utf8');
    console.log(`HTML dumped to: ${htmlPath}`);
    
    console.log('\nInspection Completed successfully!');
    console.log(`Check the screenshot to verify you are logged in and seeing the expected page.`);
  } catch (error) {
    console.error('An error occurred during inspection:', error);
  } finally {
    await browser.close();
  }
})();
