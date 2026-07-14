const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const axios = require('axios');
const { sendNotification } = require('./notifier');
const { decrypt, applyStealth } = require('./crypto-helper');
require('dotenv').config();
const { summarizePdfText } = require('./gemini-helper');
const { compileStaticDashboard } = require('./dashboard-compiler');

// Load configurations
const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('Error: config.json not found.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize data folder
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const seenDealsPath = path.join(dataDir, 'seen_deals.json');

// Load previously seen deals
let seenDeals = {};
if (fs.existsSync(seenDealsPath)) {
  try {
    seenDeals = JSON.parse(fs.readFileSync(seenDealsPath, 'utf8'));
  } catch (e) {
    console.error('Error reading seen_deals.json, resetting database.');
    seenDeals = {};
  }
}

// Parse command line argument to scout a single portal, or all
const targetPortalName = process.argv[2];
const portalsToScout = targetPortalName 
  ? config.portals.filter(p => p.name === targetPortalName)
  : config.portals;

if (targetPortalName && portalsToScout.length === 0) {
  console.error(`Error: Portal "${targetPortalName}" not found in configuration.`);
  console.log('Available portals:', config.portals.map(p => p.name).join(', '));
  process.exit(1);
}

// Generate a unique MD5 hash for a deal string
function generateHash(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Downloads a file to a buffer from a page's context
 */
async function downloadFile(page, fileUrl) {
  const response = await page.request.get(fileUrl, {
    headers: {
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    }
  });
  if (!response.ok()) {
    throw new Error(`Failed to download file from ${fileUrl}: ${response.statusText()}`);
  }
  const body = await response.body();
  console.log(`Downloaded buffer size: ${body.length} bytes`);
  return body;
}

/**
 * Attempts automatic login for a portal using encrypted local credentials
 */
async function tryAutoLogin(portal, browser, statePath) {
  const credentialsPath = path.join(__dirname, 'auth', 'credentials.enc');
  if (!fs.existsSync(credentialsPath)) {
    console.log(`[${portal.displayName}] No encrypted local credentials file found.`);
    return null;
  }

  try {
    const encryptedData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    const decryptedText = decrypt(encryptedData);
    const credentials = JSON.parse(decryptedText);
    
    const creds = credentials[portal.name];
    if (!creds || !creds.username || !creds.password) {
      console.log(`[${portal.displayName}] No credentials configured for this portal in credentials.enc.`);
      return null;
    }

    console.log(`[${portal.displayName}] Session expired or missing. Attempting automatic login...`);
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
    const page = await context.newPage();
    await applyStealth(page);
    page.setDefaultTimeout(30000);

    console.log(`[${portal.displayName}] Navigating to login URL: ${portal.loginUrl}`);
    await page.goto(portal.loginUrl, { waitUntil: 'load' });
    await page.waitForTimeout(3000);

    // Click sign-in trigger if overlay needs opening
    if (portal.selectors.preLoginClick) {
      console.log(`[${portal.displayName}] Clicking pre-login overlay trigger...`);
      await page.locator(portal.selectors.preLoginClick).first().click();
      await page.waitForTimeout(3000);
    }

    // Type credentials
    console.log(`[${portal.displayName}] Entering username and password...`);
    await page.locator(portal.selectors.usernameInput).first().fill(creds.username);
    await page.locator(portal.selectors.passwordInput).first().fill(creds.password);
    
    // Submit form
    console.log(`[${portal.displayName}] Submitting login...`);
    await page.locator(portal.selectors.submitButton).first().click();
    
    // Wait for the verification indicator
    console.log(`[${portal.displayName}] Waiting for login verification element...`);
    await page.waitForSelector(portal.selectors.checkLoggedIn, { timeout: 20000 });
    
    // Save fresh storage state
    console.log(`[${portal.displayName}] Login verified successfully! Saving session state...`);
    await context.storageState({ path: statePath });
    
    return context;
  } catch (error) {
    console.error(`[${portal.displayName}] Automatic login failed:`, error.message);
    return null;
  }
}

/**
 * Scout a single portal
 */
async function scoutPortal(portal, browser) {
  const statePath = path.join(__dirname, 'auth', `${portal.name}-state.json`);
  let context = null;
  
  const hasSavedState = fs.existsSync(statePath);
  const timeout = parseInt(process.env.PLAYWRIGHT_TIMEOUT || '30000', 10);
  
  if (hasSavedState) {
    console.log(`\n--- Scouting: ${portal.displayName} ---`);
    context = await browser.newContext({
      storageState: statePath,
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
  }

  let page = null;
  let isLoggedIn = false;

  if (context) {
    page = await context.newPage();
    await applyStealth(page);
    page.setDefaultTimeout(timeout);
    
    try {
      console.log(`Navigating to: ${portal.url}...`);
      await page.goto(portal.url, { waitUntil: 'load' });
      
      if (portal.selectors.checkLoggedIn) {
        await page.waitForTimeout(3000);
        isLoggedIn = await page.locator(portal.selectors.checkLoggedIn).count() > 0;
      } else {
        isLoggedIn = true;
      }
    } catch (e) {
      console.log(`Initial navigation check failed: ${e.message}`);
      isLoggedIn = false;
    }
  }

  // If session expired or state file missing, execute auto-login
  if (!isLoggedIn) {
    if (context) {
      await context.close();
      context = null;
    }
    
    context = await tryAutoLogin(portal, browser, statePath);
    
    if (context) {
      page = await context.newPage();
      await applyStealth(page);
      page.setDefaultTimeout(timeout);
      console.log(`Navigating to target URL: ${portal.url}...`);
      await page.goto(portal.url, { waitUntil: 'load' });
      
      // Re-verify login status
      if (portal.selectors.checkLoggedIn) {
        await page.waitForTimeout(3000);
        isLoggedIn = await page.locator(portal.selectors.checkLoggedIn).count() > 0;
      } else {
        isLoggedIn = true;
      }
    }
  }

  if (!isLoggedIn) {
    const warningMsg = `Session expired and auto-login failed for ${portal.displayName}.`;
    console.warn(`[WARNING] ${warningMsg}`);
    if (context) await context.close();
    return;
  }

  try {
    if (portal.type === 'table') {
      await scrapeTablePortal(portal, page);
    } else if (portal.type === 'pdf') {
      await scrapePdfPortal(portal, page);
    }
  } catch (error) {
    console.error(`Error scraping ${portal.displayName}:`, error.message);
  } finally {
    if (context) await context.close();
  }
}

/**
 * Scrapes table-based deals
 */
async function scrapeTablePortal(portal, page) {
  console.log('Scraping HTML table...');
  const rowSelector = portal.selectors.tableRow;
  
  try {
    await page.waitForSelector(rowSelector, { timeout: 10000 });
  } catch (e) {
    console.log(`No table rows found with selector "${rowSelector}". The page might be empty or layout changed.`);
    return;
  }

  const rows = page.locator(rowSelector);
  const count = await rows.count();
  console.log(`Found ${count} rows matching selector.`);

  let newDealsFound = 0;

  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    try {
      const shipText = (await row.locator(portal.selectors.shipCell).innerText() || '').trim();
      const dateText = (await row.locator(portal.selectors.dateCell).innerText() || '').trim();
      const rateText = (await row.locator(portal.selectors.rateCell).innerText() || '').trim();

      if (!shipText && !dateText && !rateText) continue;

      const dealKey = `${portal.name}-${shipText}-${dateText}-${rateText}`;
      const dealHash = generateHash(dealKey);

      if (!seenDeals[dealHash]) {
        // New deal found!
        const dealInfo = {
          portal: portal.name,
          ship: shipText,
          date: dateText,
          rate: rateText,
          firstSeen: new Date().toISOString()
        };
        
        seenDeals[dealHash] = dealInfo;
        newDealsFound++;

        const alertMessage = `🚢 Ship: ${shipText}\n📅 Date: ${dateText}\n💰 Rate: ${rateText}\nPortal: ${portal.displayName}`;
        await sendNotification(alertMessage, 'New FAM Trip Deal Detected!');
      }
    } catch (rowError) {
      // Log error for row but continue parsing other rows
      console.error(`Error parsing row ${i}:`, rowError.message);
    }
  }

  console.log(`Finished scraping table. New deals found: ${newDealsFound}`);
}

/**
 * Scrapes PDF-based deals using Axios direct HTTP requests with session cookies
 */
async function scoutPdfPortalAxios(portal) {
  const statePath = path.join(__dirname, 'auth', `${portal.name}-state.json`);
  if (!fs.existsSync(statePath)) {
    console.log(`[${portal.displayName}] Session state cookies file not found. Skipping.`);
    return;
  }

  console.log(`\n--- Scouting (Axios): ${portal.displayName} ---`);
  
  try {
    const stateObj = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const cookieHeader = stateObj.cookies.map(c => `${c.name}=${c.value}`).join('; ');

    console.log(`Fetching portal page: ${portal.url}`);
    const response = await axios.get(portal.url, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
      },
      timeout: 15000
    });

    const html = response.data;
    
    // Find PDF link based on regex matches
    console.log('Extracting PDF link from HTML...');
    const matches = html.match(/href="([^"]+)"/g) || [];
    const hrefs = matches.map(m => m.replace(/^href="/, '').replace(/"$/, ''));
    
    let pdfUrl = '';
    if (portal.name === 'disney') {
      const match = hrefs.find(h => h.includes('dclspecialrates') || h.includes('dcltaaprates') || h.toLowerCase().endsWith('.pdf'));
      if (match) pdfUrl = match;
    } else if (portal.name === 'virgin') {
      const match = hrefs.find(h => h.includes('First%20Mate%20Rates%20Flyer.pdf') || h.toLowerCase().includes('rates') && h.toLowerCase().endsWith('.pdf'));
      if (match) pdfUrl = match;
    } else {
      const match = hrefs.find(h => h.toLowerCase().endsWith('.pdf'));
      if (match) pdfUrl = match;
    }

    if (!pdfUrl) {
      console.warn(`[${portal.displayName}] Could not locate PDF flyer link in HTML. User session might be expired.`);
      return;
    }

    // Resolve relative URLs
    if (!pdfUrl.startsWith('http')) {
      const baseUrl = new URL(portal.url);
      pdfUrl = new URL(pdfUrl, baseUrl.origin).toString();
    }

    console.log(`PDF URL located: ${pdfUrl}`);

    // Track the URL itself
    const urlHash = generateHash(`${portal.name}-${pdfUrl}`);
    
    // Download the PDF file using Axios
    console.log('Downloading PDF content...');
    const pdfResponse = await axios.get(pdfUrl, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      responseType: 'arraybuffer',
      timeout: 20000
    });

    const pdfBuffer = Buffer.from(pdfResponse.data);
    const rawHash = crypto.createHash('md5').update(pdfBuffer).digest('hex');
    const bufferHash = `${portal.name}-rawbuf-${rawHash}`;

    let pdfText = '';
    try {
      const pdfData = await pdfParse(pdfBuffer);
      pdfText = (pdfData.text || '').trim();
    } catch (parseError) {
      console.log(`Note: PDF text extraction skipped (${parseError.message}), using binary verification.`);
    }

    const isNewUrl = !seenDeals[urlHash];
    const isNewBuffer = !seenDeals[bufferHash];

    if (isNewUrl || isNewBuffer) {
      console.log('New or updated PDF deal document detected!');
      
      const aiSummary = (pdfText && process.env.GEMINI_API_KEY) ? await summarizePdfText(pdfText) : '';
      
      const pdfInfo = {
        portal: portal.name,
        pdfUrl: pdfUrl,
        urlHash: urlHash,
        bufferHash: bufferHash,
        firstSeen: new Date().toISOString(),
        title: `${portal.displayName} Flyer`,
        summary: aiSummary
      };

      if (isNewUrl) seenDeals[urlHash] = pdfInfo;
      if (isNewBuffer) seenDeals[bufferHash] = pdfInfo;

      let alertMessage = `📄 A new or updated FAM Rates PDF is available!\n🔗 Link: ${pdfUrl}\nPortal: ${portal.displayName}`;
      if (aiSummary) {
        alertMessage += `\n\n🎯 **AI Deal Summary:**\n${aiSummary}`;
      } else if (pdfText) {
        const textPreview = pdfText.replace(/\s+/g, ' ').substring(0, 200);
        alertMessage += `\n\n📝 Content Preview:\n"${textPreview}..."`;
      }

      await sendNotification(alertMessage, 'Updated FAM Rates Document Detected!');

      // Save PDF locally
      const downloadsDir = path.join(__dirname, 'downloads');
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }
      const fileName = `${portal.name}-${Date.now()}.pdf`;
      const filePath = path.join(__dirname, 'downloads', fileName);
      fs.writeFileSync(filePath, pdfBuffer);
      console.log(`Saved PDF locally to: ${filePath}`);
    } else {
      console.log('PDF document content has not changed since the last check.');
    }
  } catch (error) {
    console.error(`Error scouting ${portal.displayName} via Axios:`, error.message);
  }
}

/**
 * Custom scraper for OneSource (Princess/Holland/Cunard/Seabourn)
 */
async function scoutOneSourcePortal(portal, browser) {
  const statePath = path.join(__dirname, 'auth', `${portal.name}-state.json`);
  let context = null;
  const timeout = 30000;

  if (fs.existsSync(statePath)) {
    console.log(`\n--- Scouting: ${portal.displayName} ---`);
    context = await browser.newContext({
      storageState: statePath,
      viewport: { width: 1280, height: 1000 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'America/New_York'
    });
  }

  let page = null;
  let isLoggedIn = false;

  if (context) {
    page = await context.newPage();
    await applyStealth(page);
    page.setDefaultTimeout(timeout);
    
    try {
      console.log(`Navigating to OneSource: ${portal.url}...`);
      await page.goto(portal.url, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      isLoggedIn = await page.locator(portal.selectors.checkLoggedIn).count() > 0;
    } catch (e) {
      console.log(`OneSource check failed: ${e.message}`);
      isLoggedIn = false;
    }
  }

  if (!isLoggedIn) {
    if (context) {
      await context.close();
      context = null;
    }
    
    context = await tryAutoLogin(portal, browser, statePath);
    
    if (context) {
      page = await context.newPage();
      await applyStealth(page);
      page.setDefaultTimeout(timeout);
      console.log(`Navigating to OneSource rates page: ${portal.url}...`);
      await page.goto(portal.url, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      isLoggedIn = await page.locator(portal.selectors.checkLoggedIn).count() > 0;
    }
  }

  if (!isLoggedIn) {
    console.warn('[WARNING] Session expired and auto-login failed for OneSource.');
    if (context) await context.close();
    return;
  }

  // Accept cookie consent
  try {
    const consentBtn = page.locator('#onetrust-accept-btn-handler, button:has-text("Agree")');
    if (await consentBtn.count() > 0) {
      await consentBtn.first().click();
      await page.waitForTimeout(1000);
    }
  } catch (e) {}

  const brands = [
    { name: 'Princess', displayName: 'Princess Cruises' },
    { name: 'Holland America Line', displayName: 'Holland America Line' },
    { name: 'Seabourn', displayName: 'Seabourn' },
    { name: 'Cunard', displayName: 'Cunard Line' }
  ];

  const pdfsToDownload = [];

  for (const brand of brands) {
    console.log(`Switching to brand tab: ${brand.displayName}`);
    try {
      const locator = page.locator(`text=${brand.name}`).first();
      if (await locator.count() > 0) {
        await locator.click();
        await page.waitForTimeout(4000);

        // Extract direct PDF links on the page
        const pagePdfs = await page.evaluate((brandName) => {
          return Array.from(document.querySelectorAll('a'))
            .map(a => ({ text: a.innerText.trim(), href: a.href }))
            .filter(link => link.href.toLowerCase().endsWith('.pdf'))
            .map(link => ({
              brandName,
              text: link.text || 'Reduced Rates Flyer',
              url: link.href
            }));
        }, brand.displayName);

        pdfsToDownload.push(...pagePdfs);

        // Check if there is weekly deals to dive into
        const dealsLinkLoc = page.locator('a:has-text("Weekly Deals"), a:has-text("Cunard Deals")').first();
        if (await dealsLinkLoc.count() > 0) {
          const dealsUrl = await dealsLinkLoc.getAttribute('href');
          if (dealsUrl) {
            const absoluteDealsUrl = new URL(dealsUrl, page.url()).toString();
            console.log(`Diving into Deals for ${brand.displayName}: ${absoluteDealsUrl}`);
            await page.goto(absoluteDealsUrl, { waitUntil: 'load' });
            await page.waitForTimeout(4000);

            const dealsPdfs = await page.evaluate((brandName) => {
              return Array.from(document.querySelectorAll('a'))
                .map(a => ({ text: a.innerText.trim(), href: a.href }))
                .filter(link => link.href.toLowerCase().endsWith('.pdf'))
                .map(link => ({
                  brandName,
                  text: link.text || 'Weekly Deals PDF',
                  url: link.href
                }));
            }, brand.displayName);

            pdfsToDownload.push(...dealsPdfs);

            // Return to main rates page
            await page.goto(portal.url, { waitUntil: 'load' });
            await page.waitForTimeout(3000);
          }
        }
      } else {
        console.warn(`Brand selector not found for: ${brand.name}`);
      }
    } catch (brandError) {
      console.error(`Error processing brand ${brand.displayName}:`, brandError.message);
    }
  }

  console.log(`Discovered ${pdfsToDownload.length} total PDF flyers across all OneSource brands.`);

  // Process the PDFs
  for (const pdf of pdfsToDownload) {
    try {
      console.log(`Processing: [${pdf.brandName}] ${pdf.text} (${pdf.url})`);

      const urlHash = generateHash(`onesource-${pdf.url}`);
      let pdfBuffer = null;

      try {
        pdfBuffer = await downloadFile(page, pdf.url);
      } catch (dlErr) {
        console.error(`Failed to download PDF ${pdf.url}:`, dlErr.message);
        continue;
      }

      const rawHash = crypto.createHash('md5').update(pdfBuffer).digest('hex');
      const bufferHash = `onesource-rawbuf-${rawHash}`;
      const isNewUrl = !seenDeals[urlHash];
      const isNewBuffer = !seenDeals[bufferHash];

      let pdfText = '';
      try {
        const pdfData = await pdfParse(pdfBuffer);
        pdfText = (pdfData.text || '').trim();
      } catch (parseError) {
        console.log(`Note: PDF text parsing skipped for ${pdf.url} (${parseError.message})`);
      }

      if (isNewUrl || isNewBuffer) {
        console.log(`New document detected for ${pdf.brandName}!`);

        const aiSummary = (pdfText && process.env.GEMINI_API_KEY) ? await summarizePdfText(pdfText) : '';

        const pdfInfo = {
          portal: `onesource-${pdf.brandName.toLowerCase().replace(/\s+/g, '')}`,
          pdfUrl: pdf.url,
          urlHash: urlHash,
          bufferHash: bufferHash,
          firstSeen: new Date().toISOString(),
          title: pdf.text,
          summary: aiSummary
        };

        if (isNewUrl) seenDeals[urlHash] = pdfInfo;
        if (isNewBuffer) seenDeals[bufferHash] = pdfInfo;

        let alertMessage = `📄 A new or updated FAM Rates PDF is available!\n⚓ Cruise Line: ${pdf.brandName}\n🏷️ Document: ${pdf.text}\n🔗 Link: ${pdf.url}\nPortal: OneSource`;
        if (aiSummary) {
          alertMessage += `\n\n🎯 **AI Deal Summary:**\n${aiSummary}`;
        } else if (pdfText) {
          const textPreview = pdfText.replace(/\s+/g, ' ').substring(0, 200);
          alertMessage += `\n\n📝 Content Preview:\n"${textPreview}..."`;
        }

        await sendNotification(alertMessage, `Updated [${pdf.brandName}] FAM Rates Document!`);

        // Save locally
        const downloadsDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true });
        }
        const cleanBrand = pdf.brandName.toLowerCase().replace(/\s+/g, '-');
        const fileName = `onesource-${cleanBrand}-${Date.now()}.pdf`;
        const filePath = path.join(downloadsDir, fileName);
        fs.writeFileSync(filePath, pdfBuffer);
        console.log(`Saved PDF to: ${filePath}`);
      } else {
        console.log(`Document content has not changed.`);
      }
    } catch (pdfError) {
      console.error(`Error processing PDF ${pdf.url}:`, pdfError.message);
    }
  }

  if (context) await context.close();
}

// Main execution loop
(async () => {
  const headless = process.env.HEADLESS !== 'false';
  console.log(`Starting FAM Scout... Headless = ${headless}`);
  
  const runRecord = {
    timestamp: new Date().toISOString(),
    status: "success",
    newDealsCount: 0,
    totalDealsCount: 0,
    portals: {}
  };
  const initialDealsCount = Object.keys(seenDeals).length;

  // Launch Playwright browser if we need it
  const needsBrowser = portalsToScout.some(p => p.type === 'table' || p.name === 'onesource');
  let browser = null;
  if (needsBrowser) {
    browser = await chromium.launch({
      headless,
      args: ['--disable-http2']
    });
  }

  for (const portal of portalsToScout) {
    runRecord.portals[portal.name] = { status: "checking", details: "" };
    try {
      if (portal.name === 'onesource' && browser) {
        await scoutOneSourcePortal(portal, browser);
      } else if (portal.type === 'pdf') {
        await scoutPdfPortalAxios(portal);
      } else if (portal.type === 'table' && browser) {
        await scoutPortal(portal, browser);
      }
      runRecord.portals[portal.name].status = "success";
    } catch (portalErr) {
      console.error(`Error scouting ${portal.name}:`, portalErr.message);
      runRecord.portals[portal.name].status = "failed";
      runRecord.portals[portal.name].details = portalErr.message;
      runRecord.status = "partial_failure";
    }
  }

  // Save the updated database of seen deals
  fs.writeFileSync(seenDealsPath, JSON.stringify(seenDeals, null, 2), 'utf8');

  // Compile the serverless static dashboard page
  let netNewDealsCount = 0;
  let totalSailingsCount = 0;
  try {
    const compileResult = compileStaticDashboard();
    if (compileResult) {
      netNewDealsCount = compileResult.netNewDealsCount;
      totalSailingsCount = compileResult.totalSailingsCount;
    }
  } catch (compileErr) {
    console.error('Failed to compile static dashboard:', compileErr.message);
  }

  runRecord.newDealsCount = netNewDealsCount;
  runRecord.totalDealsCount = totalSailingsCount;
  console.log(`\nSeen deals database updated. Net new deals found: ${netNewDealsCount}. Total active sailings: ${totalSailingsCount}.`);

  // Update run history
  const runHistoryPath = path.join(dataDir, 'run_history.json');
  let runHistory = [];
  try {
    if (fs.existsSync(runHistoryPath)) {
      runHistory = JSON.parse(fs.readFileSync(runHistoryPath, 'utf8'));
    }
  } catch (historyErr) {
    console.error('Error reading run_history.json, resetting database history:', historyErr.message);
  }
  runHistory.unshift(runRecord);
  runHistory = runHistory.slice(0, 50); // Keep last 50 runs for visual audit
  fs.writeFileSync(runHistoryPath, JSON.stringify(runHistory, null, 2), 'utf8');

  // Auto-push to GitHub repository if git is configured
  if (fs.existsSync(path.join(__dirname, '.git')) && process.env.GITHUB_ACTIONS !== 'true') {
    console.log('Git repository detected. Attempting to sync changes to remote...');
    const { execSync } = require('child_process');
    try {
      execSync('git add index.html flyers/ .nojekyll data/seen_deals.json', { stdio: 'inherit' });
      execSync('git commit -m "Auto-update deals database & static dashboard"', { stdio: 'inherit' });
      
      // Check if remote is configured
      const hasRemote = execSync('git remote', { encoding: 'utf8' }).trim();
      if (hasRemote) {
        console.log('Pushing updates to GitHub remote...');
        execSync('git push', { stdio: 'inherit' });
        console.log('Git push completed successfully!');
      } else {
        console.log('Warning: No git remote configured. Local commit completed, but push skipped.');
      }
    } catch (gitErr) {
      console.log('Note: Git sync skipped or failed (likely due to no changes or remote issues):', gitErr.message);
    }
  }

  if (browser) {
    await browser.close();
  }
  console.log('FAM Scout execution finished.');
})();
