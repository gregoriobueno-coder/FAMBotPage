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

  const dealsJson = JSON.stringify(uniqueDeals);
  let payloadType = 'plaintext';
  let payloadData = Buffer.from(dealsJson).toString('base64');
  let saltBase64 = '';
  let ivBase64 = '';

  const password = process.env.DASHBOARD_PASSWORD;
  if (password) {
    console.log('Encrypting static dashboard payload...');
    payloadType = 'encrypted';
    
    // Encrypt the JSON data using AES-GCM
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    const encrypted = Buffer.concat([cipher.update(dealsJson, 'utf8'), cipher.final()]);
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
  <title>FAM Scout - Travel Agent Rates Dashboard</title>
  
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
      max-width: 1300px;
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

    .stats-badge {
      background: rgba(79, 172, 254, 0.15);
      border: 1px solid rgba(79, 172, 254, 0.3);
      border-radius: 12px;
      padding: 0.6rem 1.2rem;
      font-size: 0.9rem;
      color: var(--neon-blue);
      font-weight: 600;
    }

    /* Controls Panel */
    .controls-panel {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 20px;
      padding: 1.5rem;
      margin-bottom: 2rem;
      display: flex;
      flex-wrap: wrap;
      gap: 1rem;
      align-items: center;
      justify-content: space-between;
    }

    .search-wrapper {
      position: relative;
      flex: 1;
      min-width: 300px;
    }

    .search-input {
      width: 100%;
      background: rgba(7, 10, 19, 0.6);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 0.8rem 1rem;
      color: var(--text-main);
      font-size: 0.95rem;
      outline: none;
      transition: var(--transition);
    }

    .search-input:focus {
      border-color: var(--neon-blue);
    }

    .filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-tab {
      background: transparent;
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.6rem 1.1rem;
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

    /* Deals Grid */
    .deals-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 1.5rem;
    }

    .deal-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      backdrop-filter: blur(16px);
      border-radius: 20px;
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
      transition: var(--transition);
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    .deal-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 4px;
      height: 100%;
      background: linear-gradient(to bottom, var(--neon-blue), var(--neon-teal));
      opacity: 0.7;
    }

    .deal-card:hover {
      transform: translateY(-5px);
      border-color: rgba(79, 172, 254, 0.4);
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 1rem;
    }

    .portal-badge {
      border-radius: 8px;
      padding: 0.3rem 0.6rem;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .badge-disney { background: rgba(248, 87, 166, 0.15); color: var(--neon-pink); }
    .badge-virgin { background: rgba(255, 68, 68, 0.15); color: #ff4444; }
    .badge-onesource { background: rgba(79, 172, 254, 0.15); color: var(--neon-blue); }

    .date-badge {
      color: var(--text-muted);
      font-size: 0.8rem;
    }

    .card-title {
      font-family: 'Outfit', sans-serif;
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 1rem;
      line-height: 1.4;
      flex-grow: 1;
    }

    .card-actions {
      display: flex;
      gap: 0.8rem;
      margin-top: 1rem;
    }

    .btn {
      flex: 1;
      padding: 0.65rem 1rem;
      border-radius: 10px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: var(--transition);
      outline: none;
    }

    .btn-primary {
      background: linear-gradient(135deg, var(--neon-blue), var(--neon-teal));
      color: var(--bg-dark);
      border: none;
    }

    .btn-primary:hover {
      box-shadow: 0 0 15px rgba(0, 242, 254, 0.4);
    }

    .btn-secondary {
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-main);
      border: 1px solid var(--card-border);
    }

    /* Expander summary */
    .summary-section {
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.4s cubic-bezier(0, 1, 0, 1);
      background: rgba(7, 10, 19, 0.4);
      border-radius: 12px;
      margin-top: 1rem;
    }

    .summary-section.expanded {
      max-height: 1000px;
      transition: max-height 0.4s cubic-bezier(1, 0, 1, 0);
      border: 1px solid var(--card-border);
      padding: 1rem;
    }

    .summary-section h4 {
      font-size: 0.88rem;
      color: var(--neon-blue);
      margin-bottom: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .table-container {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.8rem;
      margin-top: 0.5rem;
    }

    th, td {
      padding: 0.5rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    th {
      color: var(--neon-teal);
      font-weight: 600;
    }

    tr:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    @media (max-width: 768px) {
      header {
        flex-direction: column;
        align-items: flex-start;
        gap: 1rem;
      }
      .controls-panel {
        flex-direction: column;
        align-items: stretch;
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
      <div class="stats-badge" id="stats-badge">Total Active Deals: 0</div>
    </header>

    <div class="controls-panel">
      <div class="search-wrapper">
        <input type="text" id="search-bar" class="search-input" placeholder="Search by Ship, Itinerary, or Document Title..." oninput="filterDeals()">
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

    <div class="deals-grid" id="deals-grid">
      <!-- Deals injected dynamically -->
    </div>
  </div>

  <script>
    // Embedded Payload Config
    window.PAYLOAD_TYPE = "${payloadType}";
    window.PAYLOAD_DATA = "${payloadData}";
    window.PAYLOAD_SALT = "${saltBase64}";
    window.PAYLOAD_IV = "${ivBase64}";

    let allDeals = [];
    let currentBrand = 'all';

    // Base64 to ArrayBuffer helper
    function base64ToArrayBuffer(base64) {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    // Client-side AES-GCM PBKDF2 Decryption
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
        allDeals = await decryptPayload(password);
        
        // Hide lock screen, show dashboard
        document.getElementById('lock-screen').style.display = 'none';
        document.getElementById('main-container').style.display = 'block';
        
        document.getElementById('stats-badge').innerText = \`Total Active Deals: \${allDeals.length}\`;
        renderDeals(allDeals);
      } catch (err) {
        console.error(err);
        card.classList.add('shake');
        errMsg.style.display = 'block';
        setTimeout(() => card.classList.remove('shake'), 500);
      }
    }

    // Format Date helper
    function formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // Parse Markdown table helper
    function parseMarkdownTable(markdown) {
      if (!markdown) return '<p style="color: var(--text-muted); font-size: 0.8rem;">No AI Summarized deals found inside this document.</p>';
      
      const lines = markdown.split('\\n').map(l => l.trim()).filter(l => l);
      if (lines.length === 0) return '';
      
      let html = '<table>';
      let hasHeader = false;
      
      for (const line of lines) {
        if (line.includes('|-')) continue;
        
        const cells = line.split('|').map(c => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
        if (cells.length === 0) continue;
        
        if (!hasHeader) {
          html += '<thead><tr>';
          for (const cell of cells) {
            html += \`<th>\${cell}</th>\`;
          }
          html += '</tr></thead><tbody>';
          hasHeader = true;
        } else {
          html += '<tr>';
          for (const cell of cells) {
            html += \`<td>\${cell}</td>\`;
          }
          html += '</tr>';
        }
      }
      if (hasHeader) html += '</tbody>';
      html += '</table>';
      return html;
    }

    function getPortalLabel(portal) {
      if (portal === 'disney') return 'Disney Cruise';
      if (portal === 'virgin') return 'Virgin Voyages';
      if (portal.includes('princess')) return 'Princess Cruises';
      if (portal.includes('holland')) return 'Holland America';
      if (portal.includes('cunard')) return 'Cunard Line';
      if (portal.includes('seabourn')) return 'Seabourn';
      return portal;
    }

    function renderDeals(deals) {
      const grid = document.getElementById('deals-grid');
      grid.innerHTML = '';

      if (deals.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 4rem;">No matching deals found.</div>';
        return;
      }

      deals.forEach((deal, idx) => {
        const card = document.createElement('div');
        card.className = 'deal-card';
        
        let badgeClass = 'badge-onesource';
        if (deal.portal === 'disney') badgeClass = 'badge-disney';
        else if (deal.portal === 'virgin') badgeClass = 'badge-virgin';

        // Extract filename from pdfUrl if relative path
        const isExternal = deal.pdfUrl.startsWith('http');
        const filename = isExternal ? 'View Original PDF' : deal.pdfUrl.split('/').pop();
        const displayLink = isExternal ? deal.pdfUrl : \`./downloads/\${filename}\`;

        card.innerHTML = \`
          <div class="card-header">
            <span class="portal-badge \${badgeClass}">\${getPortalLabel(deal.portal)}</span>
            <span class="date-badge">\${formatDate(deal.firstSeen)}</span>
          </div>
          <h3 class="card-title">\text=\${deal.title || 'FAM Rates Flyer'}</h3>
          <div class="card-actions">
            <a href="\${displayLink}" target="_blank" class="btn btn-primary" id="pdf-\${idx}">View Flyer PDF</a>
            <button class="btn btn-secondary" onclick="toggleSummary(\${idx})" id="btn-summary-\${idx}">AI Deals List</button>
          </div>
          <div class="summary-section" id="summary-\${idx}">
            <h4>🎯 Active Rates List (AI Parsed)</h4>
            <div class="table-container">
              \${parseMarkdownTable(deal.summary)}
            </div>
          </div>
        \`;
        grid.appendChild(card);
      });
    }

    function toggleSummary(idx) {
      const panel = document.getElementById(\`summary-\${idx}\`);
      const btn = document.getElementById(\`btn-summary-\${idx}\`);
      
      if (panel.classList.contains('expanded')) {
        panel.classList.remove('expanded');
        btn.innerText = 'AI Deals List';
      } else {
        panel.classList.add('expanded');
        btn.innerText = 'Close Summary';
      }
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
      filterDeals();
    }

    function filterDeals() {
      const query = document.getElementById('search-bar').value.toLowerCase();
      
      const filtered = allDeals.filter(deal => {
        let brandMatch = false;
        if (currentBrand === 'all') brandMatch = true;
        else if (currentBrand === 'disney') brandMatch = deal.portal === 'disney';
        else if (currentBrand === 'virgin') brandMatch = deal.portal === 'virgin';
        else brandMatch = deal.portal.includes(currentBrand);

        const textMatch = (deal.title || '').toLowerCase().includes(query) || 
                          (deal.summary || '').toLowerCase().includes(query) || 
                          (deal.portal || '').toLowerCase().includes(query);

        return brandMatch && textMatch;
      });

      renderDeals(filtered);
    }

    // Initialize plaintext immediately if unencrypted
    if (window.PAYLOAD_TYPE === 'plaintext') {
      allDeals = JSON.parse(window.atob(window.PAYLOAD_DATA));
      document.getElementById('stats-badge').innerText = \`Total Active Deals: \${allDeals.length}\`;
      renderDeals(allDeals);
    }
  </script>
</body>
</html>
  `;

  const docsDir = path.join(__dirname, 'docs');
  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  // Copy downloaded PDFs to docs/downloads/ for GitHub Pages local path linking
  const docsDownloadsDir = path.join(docsDir, 'downloads');
  if (!fs.existsSync(docsDownloadsDir)) {
    fs.mkdirSync(docsDownloadsDir, { recursive: true });
  }

  try {
    const files = fs.readdirSync(downloadsDir);
    for (const file of files) {
      fs.copyFileSync(path.join(downloadsDir, file), path.join(docsDownloadsDir, file));
    }
  } catch (err) {
    console.error('Failed to copy downloads folder:', err.message);
  }

  fs.writeFileSync(path.join(docsDir, 'index.html'), htmlContent, 'utf8');
  console.log(`Static dashboard successfully compiled to docs/index.html! (Type: ${payloadType})`);
}

module.exports = { compileStaticDashboard };
