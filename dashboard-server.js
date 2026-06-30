const express = require('express');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3050;

// Serve downloads folder statically so users can view/download local PDFs
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}
app.use('/downloads', express.static(downloadsDir));

// API Endpoint to get parsed deals list
app.get('/api/deals', (req, res) => {
  const seenDealsPath = path.join(__dirname, 'data', 'seen_deals.json');
  if (!fs.existsSync(seenDealsPath)) {
    return res.json([]);
  }

  try {
    const rawData = JSON.parse(fs.readFileSync(seenDealsPath, 'utf8'));
    
    // Filter to keep only the main document entries (by removing standard rawbuf hash duplicates)
    const uniqueDeals = Object.values(rawData).filter(deal => {
      // Raw buffers have keys/bufferHashes starting with 'onesource-rawbuf-' or similar,
      // but we only want the primary entries which contain the metadata and pdfUrl.
      // A primary entry has a urlHash equal to its key, or doesn't have a bufferHash key.
      return deal.urlHash && deal.pdfUrl && !deal.bufferHash.includes(deal.urlHash);
    });

    // Sort by discovery date descending
    uniqueDeals.sort((a, b) => new Date(b.firstSeen) - new Date(a.firstSeen));

    res.json(uniqueDeals);
  } catch (error) {
    console.error('Error fetching deals:', error.message);
    res.status(500).json({ error: 'Failed to read deals database' });
  }
});

// Serve premium single page HTML dashboard
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FAM Scout - Travel Agent Rates Dashboard</title>
  
  <!-- Modern Typography -->
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
      animation: slideDown 0.6s ease-out;
    }

    @keyframes slideDown {
      from { transform: translateY(-30px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
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

    /* Filters and Controls */
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
      box-shadow: 0 0 15px rgba(79, 172, 254, 0.3);
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
      opacity: 0;
      animation: fadeIn 0.8s 0.2s ease-out forwards;
    }

    @keyframes fadeIn {
      to { opacity: 1; }
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

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    /* Expander AI Summary Section */
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

    /* Markdown Table Rendering */
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

    /* Mobile Responsive styling */
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
  <div class="container">
    <header>
      <div class="brand-section">
        <h1>Wandering Bear FAM Scout</h1>
        <p>Interactive Cruise Rates & Special Incentives Monitor</p>
      </div>
      <div class="stats-badge" id="stats-badge">Loading deals...</div>
    </header>

    <div class="controls-panel">
      <div class="search-wrapper">
        <input type="text" id="search-bar" class="search-input" placeholder="Search by Ship, Itinerary, or Document Title..." oninput="filterDeals()">
      </div>
      
      <div class="filter-tabs" id="filter-tabs">
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
    let allDeals = [];
    let currentBrand = 'all';

    // Fetch Deals from API
    async function loadDeals() {
      try {
        const res = await fetch('/api/deals');
        allDeals = await res.json();
        
        document.getElementById('stats-badge').innerText = \`Total Active Deals: \${allDeals.length}\`;
        
        renderDeals(allDeals);
      } catch (err) {
        console.error('Failed to load deals', err);
        document.getElementById('stats-badge').innerText = 'Error loading database';
      }
    }

    // Helper to format Date
    function formatDate(dateStr) {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    // Helper to parse Markdown Table string to HTML Table
    function parseMarkdownTable(markdown) {
      if (!markdown) return '<p style="color: var(--text-muted); font-size: 0.8rem;">No AI Summarized deals found inside this document.</p>';
      
      const lines = markdown.split('\\n').map(l => l.trim()).filter(l => l);
      if (lines.length === 0) return '';
      
      let html = '<table>';
      let hasHeader = false;
      
      for (const line of lines) {
        if (line.includes('|-')) continue; // Skip separator line
        
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

    // Format portal names to human-readable
    function getPortalLabel(portal) {
      if (portal === 'disney') return 'Disney Cruise';
      if (portal === 'virgin') return 'Virgin Voyages';
      if (portal.includes('princess')) return 'Princess Cruises';
      if (portal.includes('holland')) return 'Holland America';
      if (portal.includes('cunard')) return 'Cunard Line';
      if (portal.includes('seabourn')) return 'Seabourn';
      return portal;
    }

    // Render Deals Grid
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
        
        // Determine portal badge class
        let badgeClass = 'badge-onesource';
        if (deal.portal === 'disney') badgeClass = 'badge-disney';
        else if (deal.portal === 'virgin') badgeClass = 'badge-virgin';

        const isLocalPdf = deal.pdfUrl.startsWith('http') ? false : true;

        card.innerHTML = \`
          <div class="card-header">
            <span class="portal-badge \${badgeClass}">\${getPortalLabel(deal.portal)}</span>
            <span class="date-badge">\${formatDate(deal.firstSeen)}</span>
          </div>
          <h3 class="card-title">\${deal.title || 'FAM Rates Flyer'}</h3>
          <div class="card-actions">
            <a href="\${deal.pdfUrl}" target="_blank" class="btn btn-primary" id="pdf-\${idx}">View Original PDF</a>
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

    // Toggle Summary Panel Expand/Collapse
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

    // Tab brand filters
    function setBrandFilter(brand) {
      currentBrand = brand;
      
      // Update active class
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

    // Filter deals based on search and brand tab
    function filterDeals() {
      const query = document.getElementById('search-bar').value.toLowerCase();
      
      const filtered = allDeals.filter(deal => {
        // Brand matches
        let brandMatch = false;
        if (currentBrand === 'all') brandMatch = true;
        else if (currentBrand === 'disney') brandMatch = deal.portal === 'disney';
        else if (currentBrand === 'virgin') brandMatch = deal.portal === 'virgin';
        else brandMatch = deal.portal.includes(currentBrand);

        // Search text matches (on title or summary content)
        const textMatch = (deal.title || '').toLowerCase().includes(query) || 
                          (deal.summary || '').toLowerCase().includes(query) || 
                          (deal.portal || '').toLowerCase().includes(query);

        return brandMatch && textMatch;
      });

      renderDeals(filtered);
    }

    // Initialize
    loadDeals();
  </script>
</body>
</html>
  `);
});

app.listen(PORT, () => {
  console.log(`FAM Scout Dashboard Server is running at http://localhost:${PORT}`);
});
