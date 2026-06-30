const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { decrypt, applyStealth } = require('./crypto-helper');

// Load configurations
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('Error: config.json not found. Run from the project root.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Parse command line arguments
const portalName = process.argv[2];
if (!portalName) {
  console.log('Usage: node auth.js <portal_name>');
  console.log('Available portals:', config.portals.map(p => p.name).join(', '));
  process.exit(1);
}

const portal = config.portals.find(p => p.name === portalName);
if (!portal) {
  console.error(`Error: Portal "${portalName}" not found in config.json.`);
  console.log('Available portals:', config.portals.map(p => p.name).join(', '));
  process.exit(1);
}

const authDir = path.join(__dirname, 'auth');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}
const statePath = path.join(authDir, `${portal.name}-state.json`);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

(async () => {
  console.log(`\n==================================================`);
  console.log(`🔑 Authenticating for: ${portal.displayName}`);
  console.log(`URL: ${portal.loginUrl}`);
  console.log(`==================================================\n`);

  // Load local credentials if configured
  let creds = null;
  const credentialsPath = path.join(authDir, 'credentials.enc');
  if (fs.existsSync(credentialsPath)) {
    try {
      const encryptedData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      const decryptedText = decrypt(encryptedData);
      const credentials = JSON.parse(decryptedText);
      creds = credentials[portal.name];
    } catch (e) {
      console.log('Note: Encrypted credentials found but could not be decrypted/loaded.');
    }
  }

  if (creds && creds.username && creds.password) {
    console.log(`Found saved credentials for ${portal.displayName}.`);
    console.log(`The script will attempt to auto-fill the login form once the page loads.`);
  } else {
    console.log(`No saved credentials found. You will need to type them manually in the browser.`);
  }

  console.log(`\nLaunching visible browser...`);
  // Launch headful browser
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-http2'] // Bypasses net::ERR_HTTP2_PROTOCOL_ERROR on Disney
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/New_York'
  });
  const page = await context.newPage();
  await applyStealth(page);

  try {
    console.log(`Navigating to: ${portal.loginUrl}...`);
    await page.goto(portal.loginUrl);
    
    // Auto-fill logic
    if (creds && creds.username && creds.password) {
      try {
        console.log(`Waiting for page loading before attempting auto-fill...`);
        await page.waitForTimeout(4000);

        // Click pre-login trigger if required (e.g. Virgin Voyages Sign In button)
        if (portal.selectors.preLoginClick) {
          console.log(`Clicking pre-login trigger element...`);
          const preClickLoc = page.locator(portal.selectors.preLoginClick).first();
          if (await preClickLoc.count() > 0) {
            await preClickLoc.click();
            await page.waitForTimeout(3000);
          }
        }

        // Fill username and password
        console.log(`Auto-filling fields...`);
        const userLoc = page.locator(portal.selectors.usernameInput).first();
        const passLoc = page.locator(portal.selectors.passwordInput).first();
        
        await userLoc.waitFor({ state: 'visible', timeout: 5000 });
        await userLoc.fill(creds.username);
        
        await passLoc.waitFor({ state: 'visible', timeout: 5000 });
        await passLoc.fill(creds.password);
        
        console.log(`✅ Auto-fill successful!`);
      } catch (fillError) {
        console.log(`Note: Auto-fill skipped or partially failed (elements not found or not visible).`);
        console.log(`Reason: ${fillError.message}`);
        console.log(`Please enter any missing credentials manually.`);
      }
    }

    console.log(`\n==================================================`);
    console.log(`ACTION REQUIRED:`);
    console.log(`1. Perform the login (solve any CAPTCHA, type 2FA code, etc.).`);
    console.log(`2. Click "Sign In" or "Log In" inside the browser window.`);
    console.log(`3. Once you see the dashboard or benefits page, return here.`);
    console.log(`==================================================\n`);
    
    await new Promise((resolve) => {
      rl.question('Press [ENTER] in this terminal when you are fully logged in to save your session: ', () => {
        resolve();
      });
    });

    console.log('\nSaving storage state (cookies & tokens)...');
    await context.storageState({ path: statePath });
    console.log(`Successfully saved session state to: ${statePath}`);
  } catch (error) {
    console.error('An error occurred during authentication:', error);
  } finally {
    rl.close();
    await browser.close();
    console.log('Browser closed. Authentication process finished.');
  }
})();
