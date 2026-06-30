const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

function compileStaticDashboard() {
  const dataDir = path.join(__dirname, 'data');
  const downloadsDir = path.join(__dirname, 'downloads');
  const seenDealsPath = path.join(dataDir, 'seen_deals.json');
  
  if (!fs.existsSync(seenDealsPath)) {
    console.log('No deals database found to compile.');
    return;
  }

  const rawData = JSON.parse(fs.readFileSync(seenDealsPath, 'utf8'));
  const uniqueDeals = Object.values(rawData).filter(deal => {
    return deal.urlHash && deal.pdfUrl && !deal.bufferHash.includes(deal.urlHash);
  });
  uniqueDeals.sort((a, b) => new Date(b.firstSeen) - new Date(a.firstSeen));

  // Extract individual sailings from the Gemini summaries
  const allSailings = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const deal of uniqueDeals) {
    if (!deal.summary) continue;

    const lines = deal.summary.split('\n').map(l => l.trim()).filter(l => l);
    for (const line of lines) {
      if (line.includes('|-') || line.toLowerCase().includes('sail date')) continue;
      
      const cells = line.split('|').map(c => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
      if (cells.length < 5) continue;

      const [sailDateStr, ship, nightsStr, itinerary, category, priceStr] = cells;
      
      // Parse date
      const sailDate = new Date(sailDateStr);
      const isExpired = !isNaN(sailDate.getTime()) && sailDate < today;
      
      if (isExpired) {
        // Skip expired sailings at compile time
        continue;
      }

      // Format filename for local linking
      const isExternal = deal.pdfUrl.startsWith('http');
      const filename = isExternal ? 'View Original PDF' : deal.pdfUrl.split('/').pop();
      const displayLink = isExternal ? deal.pdfUrl : `./flyers/${filename}`;

      allSailings.push({
        portal: deal.portal,
        pdfUrl: displayLink,
        sailDateStr,
        sailDateObj: !isNaN(sailDate.getTime()) ? sailDate.getTime() : null,
        ship,
        nights: parseInt(nightsStr) || 0,
        itinerary,
        category,
        priceStr,
        price: parseInt(priceStr.replace(/[^0-9]/g, '')) || 0
      });
    }
  }

  const payloadJson = JSON.stringify(allSailings);
  let payloadType = 'plaintext';
  let payloadData = Buffer.from(payloadJson).toString('base64');
  let saltBase64 = '';
  let ivBase64 = '';

  const password = process.env.DASHBOARD_PASSWORD;
  if (password) {
    console.log('Encrypting static dashboard payload...');
    payloadType = 'encrypted';
    
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([cipher.update(payloadJson, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    const ciphertext = Buffer.concat([encrypted, tag]);
    payloadData = ciphertext.toString('base64');
    saltBase64 = salt.toString('base64');
    ivBase64 = iv.toString('base64');
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FAM Scout - Master Cruise Rates Dashboard</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
  
  <style>
    :root {
      --bg-dark: #070a13;
      --card-bg: rgba(18, 25, 41, 0.65);
      --card-border: rgba(255, 255, 255, 0.08);
      --neon-teal: #00f2fe;
      --neon-blue: #4facfe;
      --neon-pink: #f857a6;
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg-dark);
      background-image: 
        radial-gradient(at 10% 20%, rgba(79, 172, 254, 0.15) 0px, transparent 50%),
        radial-gradient(at 90% 80%, rgba(248, 87, 166, 0.1) 0px, transparent 50%);
      color: var(--text-main);
      min-height: 100vh;
      padding: 2rem 1.5rem;
      overflow-x: hidden;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      display: none; /* Hidden until authenticated */
    }

    /* Password Screen */
    .lock-screen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      background: var(--bg-dark);
    }

    .lock-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(24px);
      border-radius: 24px;
      padding: 3rem 2rem;
      max-width: 420px;
      width: 90%;
      text-align: center;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    }

    .lock-icon {
      font-size: 3rem;
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-teal));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 1rem;
    }

    .lock-card h2 {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      margin-bottom: 0.5rem;
    }

    .lock-card p {
      color: var(--text-muted);
      font-size: 0.9rem;
      margin-bottom: 2rem;
    }

    .pw-input {
      width: 100%;
      background: rgba(7, 10, 19, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 0.9rem 1.2rem;
      color: var(--text-main);
      font-size: 1rem;
      outline: none;
      text-align: center;
      letter-spacing: 0.2em;
      margin-bottom: 1rem;
      transition: var(--transition);
    }

    .pw-input:focus {
      border-color: var(--neon-blue);
      box-shadow: 0 0 15px rgba(79, 172, 254, 0.3);
    }

    .pw-btn {
      width: 100%;
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-teal));
      color: var(--bg-dark);
      border: none;
      border-radius: 12px;
      padding: 0.9rem;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: var(--transition);
    }

    .pw-btn:hover {
      box-shadow: 0 0 15px rgba(0, 242, 254, 0.4);
    }

    .error-msg {
      color: #ff4444;
      font-size: 0.85rem;
      margin-top: 1rem;
      display: none;
    }

    .shake {
      animation: shakeEffect 0.4s ease-in-out;
    }

    @keyframes shakeEffect {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-10px); }
      40%, 80% { transform: translateX(10px); }
    }

    /* Glassmorphism Header */
    header {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 24px;
      padding: 2rem;
      margin-bottom: 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
    }

    .brand-section h1 {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 2.2rem;
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-teal));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.25rem;
    }

    .brand-section p {
      color: var(--text-muted);
      font-size: 0.95rem;
    }

    /* Dashboard Metrics Row */
    .metrics-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }

    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 20px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    .metric-card::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 20px;
      right: 20px;
      height: 2px;
      background: linear-gradient(to right, var(--neon-blue), var(--neon-teal));
      opacity: 0.5;
    }

    .metric-label {
      color: var(--text-muted);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }

    .metric-value {
      font-family: 'Outfit', sans-serif;
      font-size: 2.2rem;
      font-weight: 800;
      color: var(--text-main);
    }

    /* Filters Layout */
    .filter-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 24px;
      padding: 2rem;
      margin-bottom: 2rem;
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .filter-row-top {
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
    }

    .search-wrapper {
      flex: 2;
      min-width: 300px;
    }

    .search-input {
      width: 100%;
      background: rgba(7, 10, 19, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 0.9rem 1.2rem;
      color: var(--text-main);
      font-size: 0.95rem;
      outline: none;
      transition: var(--transition);
    }

    .search-input:focus {
      border-color: var(--neon-blue);
      box-shadow: 0 0 15px rgba(79, 172, 254, 0.2);
    }

    .filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-tab {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.65rem 1.2rem;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 0.88rem;
      font-weight: 600;
      transition: var(--transition);
    }

    .filter-tab:hover {
      border-color: var(--text-muted);
      color: var(--text-main);
    }

    .filter-tab.active {
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-teal));
      border-color: transparent;
      color: var(--bg-dark);
    }

    /* Sub-filters (Nights and Price sliders) */
    .filter-row-bottom {
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
      align-items: center;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 1.5rem;
    }

    .slider-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 280px;
      flex: 1;
    }

    .slider-label-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--text-muted);
    }

    .slider-control {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.1);
      outline: none;
    }

    .slider-control::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--neon-blue);
      cursor: pointer;
      box-shadow: 0 0 10px rgba(79, 172, 254, 0.5);
      transition: var(--transition);
    }

    .slider-control::-webkit-slider-thumb:hover {
      transform: scale(1.2);
    }

    /* Master Table Card */
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .table-wrapper {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    th, td {
      padding: 1.2rem 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    th {
      font-family: 'Outfit', sans-serif;
      font-weight: 600;
      color: var(--text-muted);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      user-select: none;
      background: rgba(255, 255, 255, 0.02);
      transition: var(--transition);
    }

    th:hover {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
    }

    th.active-sort {
      color: var(--neon-teal);
    }

    td {
      font-size: 0.95rem;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.015);
    }

    /* Badges & Accents */
    .portal-badge {
      border-radius: 8px;
      padding: 0.4rem 0.8rem;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: inline-block;
      text-align: center;
    }

    .badge-disney { background: rgba(248, 87, 166, 0.15); color: var(--neon-pink); }
    .badge-virgin { background: rgba(255, 68, 68, 0.15); color: #ff4444; }
    .badge-onesource { background: rgba(79, 172, 254, 0.15); color: var(--neon-blue); }

    .price-value {
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      color: var(--neon-teal);
      font-size: 1.1rem;
    }

    .btn-pdf {
      display: inline-block;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--card-border);
      color: var(--text-main);
      border-radius: 10px;
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      text-decoration: none;
      text-align: center;
      transition: var(--transition);
    }

    .btn-pdf:hover {
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-teal));
      border-color: transparent;
      color: var(--bg-dark);
      box-shadow: 0 0 15px rgba(0, 242, 254, 0.3);
    }

    /* Empty state */
    .no-results {
      text-align: center;
      padding: 5rem 2rem;
      color: var(--text-muted);
      font-size: 1.1rem;
    }

    @media (max-width: 992px) {
      td, th {
        padding: 0.9rem 1.1rem;
      }
    }
  </style>
</head>
<body>
  <!-- Lock Screen for Authenticated Access -->
  <div class="lock-screen" id="lock-screen" style="display: ${payloadType === 'encrypted' ? 'flex' : 'none'};">
    <div class="lock-card" id="lock-card">
      <div class="lock-icon">🔒</div>
      <h2>Secure Access</h2>
      <p>Please enter your credentials password to load the FAM rates dashboard.</p>
      <input type="password" id="password-field" class="pw-input" placeholder="••••••••" onkeydown="if(event.key==='Enter') verifyAndUnlock()">
      <button class="pw-btn" onclick="verifyAndUnlock()">Unlock Dashboard</button>
      <div class="error-msg" id="error-msg">Incorrect Password. Please try again.</div>
    </div>
  </div>

  <div class="container" id="main-container" style="display: ${payloadType === 'plaintext' ? 'block' : 'none'};">
    <header>
      <div class="brand-section">
        <h1>Wandering Bear FAM Scout</h1>
        <p>Interactive Cruise Rates & Special Incentives Monitor</p>
      </div>
      <div class="stats-badge" id="last-updated">Real-time Rates</div>
    </header>

    <!-- Metrics Summary Cards -->
    <div class="metrics-row">
      <div class="metric-card">
        <span class="metric-label">Active FAM Sailing Deals</span>
        <span class="metric-value" id="metric-deals">0</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Lowest Price Deal</span>
        <span class="metric-value" id="metric-min-price">$0</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Average Cruise Rate</span>
        <span class="metric-value" id="metric-avg-price">$0</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Brands Monitored</span>
        <span class="metric-value" id="metric-brands">6</span>
      </div>
    </div>

    <!-- Interactive Filters Dashboard -->
    <div class="filter-panel">
      <div class="filter-row-top">
        <div class="search-wrapper">
          <input type="text" id="search-bar" class="search-input" placeholder="Search by Ship, Itinerary, or Category..." oninput="filterAndRender()">
        </div>
        
        <div class="filter-tabs">
          <button class="filter-tab active" onclick="setBrandFilter('all')">All Brands</button>
          <button class="filter-tab" onclick="setBrandFilter('disney')">Disney</button>
          <button class="filter-tab" onclick="setBrandFilter('virgin')">Virgin Voyages</button>
          <button class="filter-tab" onclick="setBrandFilter('princess')">Princess</button>
          <button class="filter-tab" onclick="setBrandFilter('holland')">Holland America</button>
          <button class="filter-tab" onclick="setBrandFilter('cunard')">Cunard</button>
          <button class="filter-tab" onclick="setBrandFilter('seabourn')">Seabourn</button>
        </div>
      </div>

      <div class="filter-row-bottom">
        <div class="slider-container">
          <div class="slider-label-row">
            <span>Max Price limit</span>
            <span id="price-slider-val">$5000</span>
          </div>
          <input type="range" id="price-slider" class="slider-control" min="0" max="5000" step="50" value="5000" oninput="updateSliders()">
        </div>

        <div class="slider-container">
          <div class="slider-label-row">
            <span>Max Nights Limit</span>
            <span id="nights-slider-val">20 Nights</span>
          </div>
          <input type="range" id="nights-slider" class="slider-control" min="1" max="21" step="1" value="21" oninput="updateSliders()">
        </div>
      </div>
    </div>

    <!-- Unified Master Table Card -->
    <div class="table-card">
      <div class="table-wrapper">
        <table id="sailings-table">
          <thead>
            <tr>
              <th onclick="toggleSort('portal')" id="th-portal">Brand</th>
              <th onclick="toggleSort('sailDateObj')" id="th-sailDateObj" class="active-sort">Sail Date</th>
              <th onclick="toggleSort('nights')" id="th-nights">Nights</th>
              <th onclick="toggleSort('ship')" id="th-ship">Ship</th>
              <th onclick="toggleSort('itinerary')" id="th-itinerary">Itinerary</th>
              <th onclick="toggleSort('category')" id="th-category">Cabin Category</th>
              <th onclick="toggleSort('price')" id="th-price">Rate</th>
              <th>PDF Flyer</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <!-- Populated dynamically -->
          </tbody>
        </table>
        <div class="no-results" id="no-results-view" style="display: none;">
          No matching active sailings found. Try refining your filters!
        </div>
      </div>
    </div>
  </div>

  <script>
    window.PAYLOAD_TYPE = "${payloadType}";
    window.PAYLOAD_DATA = "${payloadData}";
    window.PAYLOAD_SALT = "${saltBase64}";
    window.PAYLOAD_IV = "${ivBase64}";

    let allSailings = [];
    let currentBrand = 'all';
    let currentSort = { column: 'sailDateObj', direction: 'asc' };

    // Decryption helpers
    function base64ToArrayBuffer(base64) {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    async function decryptPayload(password) {
      const salt = base64ToArrayBuffer(window.PAYLOAD_SALT);
      const iv = base64ToArrayBuffer(window.PAYLOAD_IV);
      const ciphertext = base64ToArrayBuffer(window.PAYLOAD_DATA);

      const enc = new TextEncoder();
      const baseKey = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      );

      const key = await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: salt,
          iterations: 100000,
          hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["decrypt"]
      );

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: iv,
          tagLength: 128
        },
        key,
        ciphertext
      );

      const dec = new TextDecoder();
      return JSON.parse(dec.decode(decrypted));
    }

    async function verifyAndUnlock() {
      const field = document.getElementById('password-field');
      const card = document.getElementById('lock-card');
      const errMsg = document.getElementById('error-msg');
      const password = field.value;

      try {
        allSailings = await decryptPayload(password);
        
        document.getElementById('lock-screen').style.display = 'none';
        document.getElementById('main-container').style.display = 'block';
        
        initializeData();
      } catch (err) {
        console.error(err);
        card.classList.add('shake');
        errMsg.style.display = 'block';
        setTimeout(() => card.classList.remove('shake'), 500);
      }
    }

    // Helper functions
    function formatDate(dateStr) {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }

    function getPortalLabel(portal) {
      if (portal === 'disney') return 'Disney';
      if (portal === 'virgin') return 'Virgin';
      if (portal.includes('princess')) return 'Princess';
      if (portal.includes('holland')) return 'Holland';
      if (portal.includes('cunard')) return 'Cunard';
      if (portal.includes('seabourn')) return 'Seabourn';
      return portal;
    }

    function getBrandBadgeClass(portal) {
      if (portal === 'disney') return 'badge-disney';
      if (portal === 'virgin') return 'badge-virgin';
      return 'badge-onesource';
    }

    // Main execution
    function initializeData() {
      // Clean dates: filter out expired cruise dates dynamically based on client calendar
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      allSailings = allSailings.filter(s => {
        if (!s.sailDateObj) return true; // Fail-safe
        return new Date(s.sailDateObj) >= today;
      });

      // Calculate max price and nights to auto-configure sliders max values
      const prices = allSailings.map(s => s.price).filter(p => p > 0);
      const maxPrice = prices.length ? Math.max(...prices) : 3000;
      
      const slider = document.getElementById('price-slider');
      slider.max = maxPrice;
      slider.value = maxPrice;
      document.getElementById('price-slider-val').innerText = '$' + maxPrice;

      // Populate metrics
      document.getElementById('metric-deals').innerText = allSailings.length;
      
      if (prices.length) {
        const minPrice = Math.min(...prices);
        const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        document.getElementById('metric-min-price').innerText = '$' + minPrice;
        document.getElementById('metric-avg-price').innerText = '$' + avgPrice;
      }

      filterAndRender();
    }

    function updateSliders() {
      const priceVal = document.getElementById('price-slider').value;
      const nightsVal = document.getElementById('nights-slider').value;
      
      document.getElementById('price-slider-val').innerText = '$' + priceVal;
      document.getElementById('nights-slider-val').innerText = nightsVal == 21 ? '20+ Nights' : nightsVal + ' Nights';
      
      filterAndRender();
    }

    function setBrandFilter(brand) {
      currentBrand = brand;
      const tabs = document.querySelectorAll('.filter-tab');
      tabs.forEach(tab => {
        if (tab.innerText.toLowerCase().includes(brand === 'all' ? 'all' : brand === 'holland' ? 'holland' : brand)) {
          tab.classList.add('active');
        } else {
          tab.classList.remove('active');
        }
      });
      filterAndRender();
    }

    function toggleSort(column) {
      if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
      }

      // Update active header styling
      document.querySelectorAll('th').forEach(th => th.classList.remove('active-sort'));
      document.getElementById('th-' + column).classList.add('active-sort');

      filterAndRender();
    }

    function filterAndRender() {
      const query = document.getElementById('search-bar').value.toLowerCase();
      const maxPrice = parseInt(document.getElementById('price-slider').value) || 99999;
      const maxNights = parseInt(document.getElementById('nights-slider').value) || 99;

      let filtered = allSailings.filter(s => {
        // Brand filter
        let brandMatch = false;
        if (currentBrand === 'all') brandMatch = true;
        else if (currentBrand === 'disney') brandMatch = s.portal === 'disney';
        else if (currentBrand === 'virgin') brandMatch = s.portal === 'virgin';
        else brandMatch = s.portal.includes(currentBrand);

        // Slider filters
        const priceMatch = s.price === 0 || s.price <= maxPrice;
        const nightsMatch = s.nights === 0 || s.nights <= (maxNights === 21 ? 999 : maxNights);

        // Search text match
        const textMatch = (s.ship || '').toLowerCase().includes(query) || 
                          (s.itinerary || '').toLowerCase().includes(query) || 
                          (s.category || '').toLowerCase().includes(query) ||
                          (s.portal || '').toLowerCase().includes(query);

        return brandMatch && priceMatch && nightsMatch && textMatch;
      });

      // Apply sorting
      filtered.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];

        // Handle nulls
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'string') {
          return currentSort.direction === 'asc' 
            ? valA.localeCompare(valB) 
            : valB.localeCompare(valA);
        } else {
          return currentSort.direction === 'asc' 
            ? valA - valB 
            : valB - valA;
        }
      });

      // Render table
      const tbody = document.getElementById('table-body');
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        document.getElementById('no-results-view').style.display = 'block';
        return;
      }
      document.getElementById('no-results-view').style.display = 'none';

      filtered.forEach(s => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td><span class="portal-badge \${getBrandBadgeClass(s.portal)}">\${getPortalLabel(s.portal)}</span></td>
          <td><strong>\${formatDate(s.sailDateStr)}</strong></td>
          <td>\${s.nights} Nights</td>
          <td>\${s.ship}</td>
          <td>\${s.itinerary}</td>
          <td>\${s.category}</td>
          <td><span class="price-value">\${s.priceStr}</span></td>
          <td><a href="\${s.pdfUrl}" target="_blank" class="btn-pdf">Flyer PDF</a></td>
        \`;
        tbody.appendChild(tr);
      });
    }

    // Initialize plaintext immediately if unencrypted
    if (window.PAYLOAD_TYPE === 'plaintext') {
      allSailings = JSON.parse(window.atob(window.PAYLOAD_DATA));
      initializeData();
    }
  </script>
</body>
</html>
  `;

  // Copy downloaded PDFs to flyers/ for GitHub Pages local path linking
  const flyersDir = path.join(__dirname, 'flyers');
  if (!fs.existsSync(flyersDir)) {
    fs.mkdirSync(flyersDir, { recursive: true });
  }

  try {
    const files = fs.readdirSync(downloadsDir);
    for (const file of files) {
      if (file.startsWith('mock-')) continue;
      fs.copyFileSync(path.join(downloadsDir, file), path.join(flyersDir, file));
    }
  } catch (err) {
    console.error('Failed to copy flyers folder:', err.message);
  }

  // Create .nojekyll file to prevent Jekyll processing
  fs.writeFileSync(path.join(__dirname, '.nojekyll'), '', 'utf8');

  // Write new HTML file
  fs.writeFileSync(path.join(__dirname, 'index.html'), htmlContent, 'utf8');
  console.log(`Static dashboard successfully compiled to index.html at root! (Type: ${payloadType})`);
}

module.exports = { compileStaticDashboard };
