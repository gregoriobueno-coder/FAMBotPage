# FAM Scout: Headless Cruise FAM Trip Scout

FAM Scout is a local Node.js and Playwright-based scout designed to monitor agent-only cruise portals for new FAM (Familiarization) trip rates/deals, and send immediate push notifications to your phone (via Telegram, Pushover, or local desktop alerts).

By running locally on your own machine, you bypass cloud bot-blocking firewalls and keep your travel agency login credentials completely within your own network.

---

## 🛠️ Technology Stack
- **Playwright**: For headless browser automation and session persistence.
- **Node.js**: The underlying runtime environment.
- **pdf-parse**: To scan and read downloaded FAM rate sheets/PDFs.
- **Express**: To run a local mock portal server for end-to-end testing.

---

## 🚀 Getting Started

### 1. Installation

Clone/save this folder to your machine, then install dependencies:

```bash
# If you have standard permissions:
npm install

# If you encounter EACCES npm cache folder permission errors:
npm install --cache .npm-cache

# Install Playwright browser engines:
npx playwright install chromium
```

### 2. Configure Notifications

1. Copy the template configuration file:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` in a text editor and enable/configure your preferred channels:
   - **Desktop**: Runs locally on your Mac. Set `ENABLE_DESKTOP=true`.
   - **Telegram**: Set `ENABLE_TELEGRAM=true` and input your `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.
   - **Pushover**: Set `ENABLE_PUSHOVER=true` and input your `PUSHOVER_USER_KEY` and `PUSHOVER_API_TOKEN`.
   - **AI Deal Summaries (Optional)**: Get a free API Key from [Google AI Studio](https://aistudio.google.com/) and paste it under `GEMINI_API_KEY`. This formats messy PDF flyer lists into beautiful, clean Markdown tables in your Telegram messages!

---

## 🔑 Authentication & Portal Setup

Because these portals require login credentials, FAM Scout uses **Session Persistence**. You perform a one-time manual login, and Playwright captures your cookies and storage state to use for automated headless runs.

### Step 1: Perform Manual Login
For each portal you want to scout, run the authentication script:
```bash
node auth.js <portal_name>
```
*Available portals: `disney`, `virgin`, `onesource`, `cruisingpower`*

**What happens:**
1. A visible Chrome window will open.
2. Navigate and log in manually using your credentials.
3. Once you see the dashboard or rates homepage, return to the terminal and press **[ENTER]**.
4. The script saves your session cookies to `auth/<portal_name>-state.json` and closes the browser.

### Step 2: Inspect Portal Pages (Optional)
To check if your session is active and verify what the page looks like without opening a visible browser, run:
```bash
node inspect.js <portal_name>
```
**What happens:**
1. The script logs in using your saved session state headlessly.
2. It captures a screenshot to `inspect/<portal_name>-screenshot.png`.
3. It dumps the HTML source to `inspect/<portal_name>-page.html`.
4. You can open these files to identify page elements or confirm that the login session is valid.

### Step 3: Configure Target Selectors
If a portal changes its layout or you need to specify new CSS selectors, edit the `config.json` file.
- **Table-based Portals** (e.g. Princess/Holland, Royal Caribbean): Map selectors for rows, ship name, date, and rate.
- **PDF-based Portals** (e.g. Disney, Virgin Voyages): Map the selector for the PDF link.

---

## 🤖 Running the Scout

To check all portals for new deals:
```bash
node scout.js
```

To scout a single portal:
```bash
node scout.js disney
```

**How it works:**
- It loads your saved auth states.
- It scans the portals or downloads PDF rate sheets.
- It compares findings with `data/seen_deals.json`.
- If a new row is added to a table, or if the PDF link/binary file contents change, it sends you a push notification and updates the database of seen deals.
- Any downloaded PDFs are saved to the `downloads/` directory.

---

## 🧪 Integration & End-to-End Testing

We have built a mock server that simulates both table-based and PDF-based portals. To verify that all authentication, scraping, and notification pipelines are working correctly, run the automated integration test:

```bash
node verify.js
```

**What it does:**
1. Spins up a mock express portal server at `http://localhost:3001`.
2. Programmatically injects a mock session cookie.
3. Runs the initial scan (discovering baseline deals and generating desktop notifications).
4. Dinamically updates the mock portal with a new table row and a new PDF rates sheet.
5. Runs the second scan to ensure it only alerts you on the newly added deals.
6. Cleans up and shuts down the mock server.

---

## ⏰ Scheduling Automated Scans (Mac)

To keep your phone updated in real-time, you can set the script to run automatically in the background on your Mac.

### Option A: Using Mac Launchd (Recommended)
This runs in the background even if your terminal is closed.

1. Create a file at `~/Library/LaunchAgents/com.agent.famscout.plist` with the following contents:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.agent.famscout</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/gregoriobueno/.gemini/antigravity/scratch/fam-scout/scout.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/Users/gregoriobueno/.gemini/antigravity/scratch/fam-scout</string>
    <key>StartInterval</key>
    <integer>14400</integer> <!-- Run every 4 hours (14400 seconds) -->
    <key>StandardOutPath</key>
    <string>/Users/gregoriobueno/.gemini/antigravity/scratch/fam-scout/scout-output.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/gregoriobueno/.gemini/antigravity/scratch/fam-scout/scout-error.log</string>
</dict>
</plist>
```

> ⚠️ **Note**: Run `which node` in your terminal. If your Node path is different than `/usr/local/bin/node` (e.g. `/opt/homebrew/bin/node` or NVM path), change the first program argument string to match your node path.

2. Load and start the launch agent:
   ```bash
   launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.agent.famscout.plist
   ```
3. To stop or unload the service:
   ```bash
   launchctl bootout gui/501 ~/Library/LaunchAgents/com.agent.famscout.plist
   ```

### Option B: Using Cron
Alternatively, open your crontab editor:
```bash
crontab -e
```
Add a line to run it every 4 hours:
```text
0 */4 * * * cd /Users/gregoriobueno/.gemini/antigravity/scratch/fam-scout && /usr/local/bin/node scout.js >> scout-cron.log 2>&1
```
