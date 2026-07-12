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

  // Check if the Wandering Bear logo exists in the root
  const logoPath = path.join(__dirname, 'logo.png');
  const hasLogo = fs.existsSync(logoPath);

  const rawData = JSON.parse(fs.readFileSync(seenDealsPath, 'utf8'));
  const uniqueDeals = Object.values(rawData).filter(deal => {
    return deal.urlHash && deal.pdfUrl && !deal.bufferHash.includes(deal.urlHash);
  });
  uniqueDeals.sort((a, b) => new Date(b.firstSeen) - new Date(a.firstSeen));

  // Region classification helper
  function getRegion(itinerary) {
    const it = (itinerary || '').toLowerCase();
    if (it.includes('alaska')) return 'Alaska';
    if (it.includes('bahamas')) return 'Bahamas';
    if (it.includes('caribbean') || it.includes('cayman')) return 'Caribbean';
    if (it.includes('mediterranean') || it.includes('aegean') || it.includes('europe') || it.includes('france') || it.includes('italy') || it.includes('greece') || it.includes('croatia') || it.includes('spain')) return 'Europe & Med';
    if (it.includes('transatlantic') || it.includes('crossing')) return 'Transatlantic';
    if (it.includes('fjord') || it.includes('norway') || it.includes('iceland')) return 'Northern Europe';
    return 'Other / Global';
  }

  const allSailings = [];
  const cutoffDate = new Date();
  cutoffDate.setHours(0, 0, 0, 0);
  const seenKeys = new Set();

  for (const deal of uniqueDeals) {
    if (!deal.summary) continue;

    const lines = deal.summary.split('\n').map(l => l.trim()).filter(l => l);
    for (const line of lines) {
      if (line.includes('|-') || line.toLowerCase().includes('sail date')) continue;
      
      const cells = line.split('|').map(c => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
      if (cells.length < 5) continue;

      const [sailDateStr, ship, nightsStr, itinerary, category, priceStr, rateBasis, dealScoreStr, aiInsight] = cells;
      
      // Parse pricing - if no price is available, do not add the sailing!
      const price = parseInt(priceStr.replace(/[^0-9]/g, '')) || 0;
      if (price === 0 || priceStr.toLowerCase().includes('n/a') || !priceStr) {
        continue; // Skip sailings with no pricing
      }

      const sailDate = new Date(sailDateStr);
      const isExpired = !isNaN(sailDate.getTime()) && sailDate < cutoffDate;
      
      if (isExpired) {
        continue; // Exclude expired sailings
      }

      // Deduplicate: same ship, date, nights, itinerary, category, price
      const key = `${sailDateStr}|${ship}|${nightsStr}|${itinerary}|${category}|${price}`;
      if (seenKeys.has(key)) {
        continue;
      }
      seenKeys.add(key);

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
        price,
        dealScore: parseInt(dealScoreStr) || 0,
        aiInsight: aiInsight || '',
        region: getRegion(itinerary)
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
  <title>FAM Scout - Wandering Bear Travel Agency</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Plus+Jakarta+Sans:wght@300;400;600;700&display=swap" rel="stylesheet">
  
  <style>
    :root {
      /* Wandering Bear Premium Warm Light Theme */
      --bg-warm: #fdfbf7;
      --card-bg: #ffffff;
      --card-border: rgba(43, 24, 16, 0.08);
      --input-bg: #f5f0e4;
      --espresso: #21120b;
      --cocoa-gray: #6b5c54;
      --terracotta: #cf5230;
      --terracotta-light: rgba(207, 82, 48, 0.06);
      --seafoam-teal: #367c72;
      --seafoam-light: rgba(70, 149, 138, 0.08);
      --amber: #b97025;
      --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background-color: var(--bg-warm);
      background-image: radial-gradient(circle at 10% 20%, rgba(207, 82, 48, 0.015) 0%, transparent 40%),
                        radial-gradient(circle at 90% 80%, rgba(70, 149, 138, 0.015) 0%, transparent 50%);
      color: var(--espresso);
      min-height: 100vh;
      padding: 2.5rem 1.5rem;
    }

    .container {
      max-width: 1400px;
      margin: 0 auto;
      display: none; /* Hidden until authenticated */
    }

    /* Lock Screen for Authenticated Access */
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
      background-color: var(--bg-warm);
      background-image: radial-gradient(circle at 50% 50%, rgba(207, 82, 48, 0.04) 0%, transparent 60%);
    }

    .lock-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 32px;
      padding: 3.5rem 2.5rem;
      max-width: 440px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(43, 24, 16, 0.06);
    }

    .lock-logo-wrapper {
      margin-bottom: 1.8rem;
      display: flex;
      justify-content: center;
    }

    .lock-logo {
      height: 110px;
      object-fit: contain;
    }

    .lock-card h2 {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      margin-bottom: 0.6rem;
      color: var(--espresso);
      letter-spacing: -0.01em;
    }

    .lock-card p {
      color: var(--cocoa-gray);
      font-size: 0.92rem;
      line-height: 1.5;
      margin-bottom: 2.2rem;
    }

    .pw-input {
      width: 100%;
      background: var(--bg-warm);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1rem 1.2rem;
      color: var(--espresso);
      font-size: 1.05rem;
      outline: none;
      text-align: center;
      letter-spacing: 0.25em;
      margin-bottom: 1.2rem;
      transition: var(--transition);
    }

    .pw-input:focus {
      border-color: var(--terracotta);
      background: #ffffff;
      box-shadow: 0 0 15px rgba(207, 82, 48, 0.15);
    }

    .pw-btn {
      width: 100%;
      background: var(--terracotta);
      color: #ffffff;
      border: none;
      border-radius: 14px;
      padding: 1rem;
      font-size: 1.05rem;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(207, 82, 48, 0.2);
      transition: var(--transition);
    }

    .pw-btn:hover {
      background: #b43c22;
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(207, 82, 48, 0.3);
    }

    .error-msg {
      color: #d23f30;
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

    /* Branded Header */
    header {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 28px;
      padding: 1.8rem 2.5rem;
      margin-bottom: 2.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 8px 30px rgba(43, 24, 16, 0.04);
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 1.8rem;
    }

    .header-logo {
      height: 100px;
      width: auto;
      object-fit: contain;
      filter: drop-shadow(0 8px 16px rgba(43, 24, 16, 0.05));
    }

    .brand-section h1 {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      font-size: 2.6rem;
      color: var(--espresso);
      margin-bottom: 0.2rem;
      letter-spacing: -0.02em;
    }

    .brand-section p {
      color: var(--cocoa-gray);
      font-size: 1.05rem;
      font-weight: 600;
    }

    .stats-badge {
      background: var(--terracotta-light);
      border: 1px solid var(--terracotta);
      border-radius: 14px;
      padding: 0.7rem 1.4rem;
       font-size: 0.95rem;
       color: var(--terracotta);
       font-weight: 700;
       box-shadow: 0 4px 15px rgba(207, 82, 48, 0.08);
       transition: var(--transition);
     }

     .stats-badge:hover {
       background: var(--terracotta);
       color: #ffffff;
       transform: translateY(-2px);
       box-shadow: 0 8px 25px rgba(207, 82, 48, 0.2);
     }

     /* Filters Layout */
     .filter-panel {
       background: var(--card-bg);
       border: 1px solid var(--card-border);
       border-radius: 28px;
       padding: 2rem;
       margin-bottom: 2.5rem;
       display: flex;
       flex-direction: column;
       gap: 1.8rem;
       box-shadow: 0 8px 30px rgba(43, 24, 16, 0.04);
    }

    .filter-row-top {
      display: flex;
      flex-wrap: wrap;
      gap: 1.5rem;
      align-items: center;
    }

    .search-wrapper {
      flex: 1;
      min-width: 300px;
    }

    .search-input {
      width: 100%;
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 0.9rem 1.2rem;
      color: var(--espresso);
      font-size: 0.95rem;
      outline: none;
      transition: var(--transition);
    }

    .search-input:focus {
      border-color: var(--terracotta);
      background: #ffffff;
      box-shadow: 0 0 10px rgba(207, 82, 48, 0.1);
    }

    .filter-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-tab {
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.65rem 1.2rem;
      color: var(--espresso);
      cursor: pointer;
      font-size: 0.88rem;
      font-weight: 600;
      transition: var(--transition);
    }

    .filter-tab:hover {
      border-color: var(--espresso);
    }

    .filter-tab.active {
      background: var(--espresso);
      border-color: transparent;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(33, 18, 11, 0.25);
    }

    /* Sub-filters (Sliders and Dropdowns) */
    .filter-row-bottom {
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
      align-items: center;
      border-top: 1px solid var(--card-border);
      padding-top: 1.5rem;
    }

    .dropdown-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 200px;
      flex: 1;
    }

    .dropdown-label {
      font-size: 0.85rem;
      color: var(--cocoa-gray);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .select-control {
      background: var(--input-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 0.8rem 1rem;
      color: var(--espresso);
      outline: none;
      font-weight: 600;
      cursor: pointer;
    }

    .slider-container {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      min-width: 280px;
      flex: 1.5;
    }

    .slider-label-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.85rem;
      color: var(--cocoa-gray);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .slider-control {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: var(--card-border);
      outline: none;
    }

    .slider-control::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--terracotta);
      cursor: pointer;
      box-shadow: 0 0 8px rgba(207, 82, 48, 0.4);
      transition: var(--transition);
    }

    /* Master Table Styling */
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(43, 24, 16, 0.04);
      margin-bottom: 4rem;
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
      border-bottom: 1px solid var(--card-border);
    }

    th {
      font-family: 'Outfit', sans-serif;
      font-weight: 700;
      color: var(--cocoa-gray);
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      cursor: pointer;
      user-select: none;
      background: rgba(43, 24, 16, 0.01);
      transition: var(--transition);
    }

    th:hover {
      background: rgba(43, 24, 16, 0.03);
      color: var(--espresso);
    }

    th.active-sort {
      color: var(--terracotta);
    }

    td {
      font-size: 0.95rem;
      vertical-align: middle;
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(43, 24, 16, 0.008);
    }

    /* Branded Badges */
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

    .badge-disney { background: rgba(248, 87, 166, 0.1); color: #db2777; border: 1px solid rgba(248, 87, 166, 0.2); }
    .badge-virgin { background: rgba(255, 68, 68, 0.08); color: #dc2626; border: 1px solid rgba(255, 68, 68, 0.15); }
    .badge-onesource { background: var(--terracotta-light); color: var(--terracotta); border: 1px solid rgba(207, 82, 48, 0.2); }

    .price-value {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      color: var(--terracotta);
      font-size: 1.15rem;
    }

    .basis-badge {
      font-size: 0.72rem;
      color: var(--cocoa-gray);
      border: 1px solid var(--card-border);
      border-radius: 6px;
      padding: 0.2rem 0.5rem;
      text-transform: uppercase;
      font-weight: 700;
    }

    .deal-score-pill {
      font-family: 'Outfit', sans-serif;
      font-weight: 800;
      border-radius: 20px;
      padding: 0.35rem 0.85rem;
      font-size: 0.82rem;
      text-align: center;
      display: inline-block;
      min-width: 54px;
    }
    .score-high { background: rgba(70, 149, 138, 0.15); color: var(--seafoam-teal); border: 1px solid rgba(70, 149, 138, 0.3); }
    .score-medium { background: rgba(214, 141, 69, 0.15); color: var(--amber); border: 1px solid rgba(214, 141, 69, 0.3); }
    .score-fair { background: rgba(122, 107, 99, 0.1); color: var(--cocoa-gray); border: 1px solid rgba(122, 107, 99, 0.2); }
    .score-low { background: rgba(43, 24, 16, 0.05); color: var(--espresso); border: 1px solid rgba(43, 24, 16, 0.15); }

    .btn-action {
      display: inline-block;
      background: var(--bg-warm);
      border: 1px solid var(--card-border);
      color: var(--espresso);
      border-radius: 10px;
      padding: 0.5rem 0.9rem;
      font-size: 0.85rem;
      font-weight: 700;
      text-decoration: none;
      text-align: center;
      cursor: pointer;
      transition: var(--transition);
      margin-right: 0.4rem;
    }

    .btn-action:hover {
      border-color: var(--espresso);
      background: #ffffff;
    }

    .btn-quote {
      background: var(--terracotta-light);
      border-color: rgba(207, 82, 48, 0.3);
      color: var(--terracotta);
    }

    .btn-quote:hover {
      background: var(--terracotta);
      color: #ffffff;
      border-color: transparent;
      box-shadow: 0 4px 10px rgba(207, 82, 48, 0.2);
    }

    /* Branded Quote Modal */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(43, 24, 16, 0.5);
      backdrop-filter: blur(8px);
      z-index: 1000;
      display: none;
      justify-content: center;
      align-items: center;
      animation: fadeIn 0.3s ease-out;
    }

    .modal-container {
      background: var(--bg-warm);
      border: 2px solid var(--card-border);
      border-radius: 28px;
      width: 90%;
      max-width: 580px;
      padding: 2.5rem;
      box-shadow: 0 20px 50px rgba(43, 24, 16, 0.25);
      position: relative;
    }

    .modal-close {
      position: absolute;
      top: 1.5rem;
      right: 1.5rem;
      background: none;
      border: none;
      font-size: 1.8rem;
      color: var(--cocoa-gray);
      cursor: pointer;
    }

    /* Branded Quote Card Style (Matches Logo Background Style) */
    .quote-card {
      background: #ffffff;
      border: 1px solid #e1dacb;
      border-radius: 20px;
      padding: 2rem;
      text-align: center;
      margin-bottom: 1.5rem;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.02);
    }

    .quote-logo {
      height: 85px;
      object-fit: contain;
      margin-bottom: 1rem;
    }

    .quote-subtitle {
      font-family: 'Outfit', sans-serif;
      font-size: 0.72rem;
      letter-spacing: 0.2em;
      color: var(--cocoa-gray);
      text-transform: uppercase;
      font-weight: 800;
      margin-top: -0.2rem;
      margin-bottom: 1.5rem;
    }

    .quote-divider {
      height: 1px;
      background: #e1dacb;
      margin: 1.5rem 0;
      position: relative;
    }

    .quote-divider::before {
      content: '⚓';
      position: absolute;
      top: -10px;
      left: calc(50% - 10px);
      background: #ffffff;
      padding: 0 8px;
      font-size: 0.9rem;
      color: var(--terracotta);
    }

    .quote-details {
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .quote-detail-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dashed #e1dacb;
      padding-bottom: 0.5rem;
    }

    .quote-label {
      color: var(--cocoa-gray);
      font-weight: 700;
      font-size: 0.85rem;
      text-transform: uppercase;
    }

    .quote-val {
      font-weight: 600;
      color: var(--espresso);
      font-size: 0.95rem;
      text-align: right;
    }

    .quote-price {
      font-size: 1.5rem;
      color: var(--terracotta);
      font-weight: 800;
      font-family: 'Outfit', sans-serif;
    }

    .notes-field {
      width: 100%;
      background: #ffffff;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 0.8rem 1rem;
      color: var(--espresso);
      font-family: inherit;
      font-size: 0.9rem;
      resize: none;
      outline: none;
      margin-bottom: 1.5rem;
    }

    .notes-field:focus {
      border-color: var(--terracotta);
    }

    .quote-actions {
      display: flex;
      gap: 1rem;
    }

    .quote-btn-primary {
      flex: 1;
      background: var(--terracotta);
      color: #ffffff;
      border: none;
      border-radius: 12px;
      padding: 0.9rem;
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      transition: var(--transition);
      text-align: center;
    }

    .quote-btn-primary:hover {
      background: #b43c22;
    }

    /* Print styles for Quote Card export */
    @media print {
      body * {
        visibility: hidden;
      }
      .modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: auto;
        background: none;
        backdrop-filter: none;
        display: flex !important;
        justify-content: center;
        visibility: visible;
      }
      .modal-container {
        border: none;
        box-shadow: none;
        background: none;
        visibility: visible;
        width: 100%;
        max-width: 100%;
        padding: 0;
      }
      .modal-container * {
        visibility: visible;
      }
      .notes-field, .quote-actions, .modal-close {
        display: none !important;
      }
      .quote-card {
        border: 2px solid #2b1810;
        box-shadow: none;
      }
    }

    /* Empty view & Footnotes */
    .no-results {
      text-align: center;
      padding: 5rem 2rem;
      color: var(--cocoa-gray);
      font-size: 1.1rem;
      font-weight: 600;
    }

    }

    .table-footnote {
      padding: 1.2rem 1.5rem;
      font-size: 0.82rem;
      color: var(--cocoa-gray);
      border-top: 1px solid var(--card-border);
      background: rgba(43, 24, 16, 0.005);
      font-style: italic;
    }

    /* Progress Overlay Styles */
    #progress-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(43, 24, 16, 0.5);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    }
    .progress-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 20px;
      padding: 2rem;
      width: 90%;
      max-width: 520px;
      box-shadow: 0 12px 40px rgba(43, 24, 16, 0.15);
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .progress-bar-container {
      background: #e6dfcf;
      border-radius: 10px;
      height: 10px;
      overflow: hidden;
    }
    .progress-bar-fill {
      background: var(--accent-mint);
      width: 0%;
      height: 100%;
      transition: width 0.3s ease;
    }
    .progress-logs {
      background: #faf8f5;
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 0.8rem;
      height: 160px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 0.72rem;
      color: var(--espresso-light);
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
      text-align: left;
    }
  </style>
</head>
<body>
  <!-- Lock Screen for Authenticated Access -->
  <div class="lock-screen" id="lock-screen" style="display: ${payloadType === 'encrypted' ? 'flex' : 'none'};">
    <div class="lock-card" id="lock-card">
      <div class="lock-logo-wrapper">
        ${hasLogo ? `<img src="logo.png" alt="Wandering Bear Logo" class="lock-logo">` : `<span style="font-size:4rem;">🐻</span>`}
      </div>
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
        ${hasLogo ? `<img src="logo.png" alt="Wandering Bear Logo" class="header-logo">` : `<span style="font-size:3rem;">🐻</span>`}
        <div>
          <h1>Wandering Bear FAM Scout</h1>
          <p>Interactive Cruise Rates & Special Incentives Monitor</p>
        </div>
      </div>
      <button class="stats-badge" id="last-updated" onclick="triggerScraperRun()" style="cursor:pointer;border:none;outline:none;display:inline-flex;align-items:center;gap:0.4rem;transition:var(--transition);font-family:inherit;">🔄 Real-time Rates</button>
    </header>

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
        <div class="dropdown-container">
          <span class="dropdown-label">Destination Region</span>
          <select id="region-filter" class="select-control" onchange="filterAndRender()">
            <option value="all">All Regions</option>
            <option value="Alaska">Alaska</option>
            <option value="Bahamas">Bahamas</option>
            <option value="Caribbean">Caribbean</option>
            <option value="Europe & Med">Europe & Mediterranean</option>
            <option value="Northern Europe">Northern Europe</option>
            <option value="Transatlantic">Transatlantic</option>
            <option value="Other / Global">Other / Global</option>
          </select>
        </div>

        <div class="dropdown-container">
          <span class="dropdown-label">Departure Month</span>
          <select id="month-filter" class="select-control" onchange="filterAndRender()">
            <option value="all">All Months</option>
            <!-- Filled dynamically based on dataset -->
          </select>
        </div>

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
              <th onclick="toggleSort('price')" id="th-price">Rate (PP)*</th>
              <th onclick="toggleSort('dealScore')" id="th-dealScore">Deal Score</th>
              <th>AI Insight</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <!-- Populated dynamically -->
          </tbody>
        </table>
        <div class="table-footnote">
          * Note: Rates are listed Per Person (PP) double occupancy in USD, unless explicitly stated otherwise in the original flyer notes.
        </div>
        <div class="no-results" id="no-results-view" style="display: none;">
          No matching active sailings found. Try refining your filters!
        </div>
      </div>
    </div>
  </div>

  <!-- Branded Client Quote Modal Overlay -->
  <div class="modal-overlay" id="quote-modal" onclick="if(event.target===this) closeQuoteModal()">
    <div class="modal-container">
      <button class="modal-close" onclick="closeQuoteModal()">×</button>
      
      <!-- Styled Branded Quote Card -->
      <div class="quote-card" id="printable-quote">
        ${hasLogo ? `<img src="logo.png" alt="Wandering Bear Logo" class="quote-logo">` : `<span style="font-size:3rem;">🐻</span>`}
        <div style="font-family:'Outfit', sans-serif; font-size: 1.4rem; font-weight: 800; letter-spacing: 0.05em; color: var(--espresso);">WANDERING BEAR</div>
        <div class="quote-subtitle">TRAVEL AGENCY — EST. 2024</div>
        
        <div class="quote-divider"></div>
        
        <div class="quote-details">
          <div class="quote-detail-row">
            <span class="quote-label">Cruise Line</span>
            <span class="quote-val" id="q-brand">-</span>
          </div>
          <div class="quote-detail-row">
            <span class="quote-label">Ship Name</span>
            <span class="quote-val" id="q-ship">-</span>
          </div>
          <div class="quote-detail-row">
            <span class="quote-label">Departure Date</span>
            <span class="quote-val" id="q-date">-</span>
          </div>
          <div class="quote-detail-row">
            <span class="quote-label">Itinerary</span>
            <span class="quote-val" id="q-itinerary">-</span>
          </div>
          <div class="quote-detail-row">
            <span class="quote-label">Stateroom Category</span>
            <span class="quote-val" id="q-category">-</span>
          </div>
          <div class="quote-detail-row" style="border-bottom: none; margin-top: 0.5rem;">
            <span class="quote-label" style="align-self: center;">Special Agent Rate</span>
            <span class="quote-price" id="q-price">-</span>
          </div>
        </div>
      </div>

      <textarea id="quote-notes" class="notes-field" rows="3" placeholder="Add personalized agent notes for your client here..."></textarea>
      
      <div class="quote-actions">
        <button class="quote-btn-primary" onclick="window.print()">Print / Save PDF</button>
      </div>
    </div>
  </div>

  <script>
    window.PAYLOAD_TYPE = "${payloadType}";
    window.PAYLOAD_DATA = "${payloadData}";
    window.PAYLOAD_SALT = "${saltBase64}";
    window.PAYLOAD_IV = "${ivBase64}";

    let allSailings = [];
    let lastFilteredSailings = [];
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

    // Date formatting helper
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

    function initializeData() {
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);

      // Exclude expired older than today
      allSailings = allSailings.filter(s => {
        if (!s.sailDateObj) return true;
        return new Date(s.sailDateObj) >= cutoffDate;
      });

      // Calculate slider limits
      const prices = allSailings.map(s => s.price).filter(p => p > 0);
      const maxPrice = prices.length ? Math.max(...prices) : 3000;
      
      const slider = document.getElementById('price-slider');
      slider.max = maxPrice;
      slider.value = maxPrice;
      document.getElementById('price-slider-val').innerText = '$' + maxPrice;



      // Populate Month select options dynamically
      const monthsMap = {};
      allSailings.forEach(s => {
        if (s.sailDateObj) {
          const d = new Date(s.sailDateObj);
          const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          monthsMap[monthKey] = monthLabel;
        }
      });

      const monthSelect = document.getElementById('month-filter');
      const sortedMonthKeys = Object.keys(monthsMap).sort();
      sortedMonthKeys.forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.innerText = monthsMap[key];
        monthSelect.appendChild(opt);
      });

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

      document.querySelectorAll('th').forEach(th => th.classList.remove('active-sort'));
      document.getElementById('th-' + column).classList.add('active-sort');
      filterAndRender();
    }

    function filterAndRender() {
      const query = document.getElementById('search-bar').value.toLowerCase();
      const maxPrice = parseInt(document.getElementById('price-slider').value) || 99999;
      const maxNights = parseInt(document.getElementById('nights-slider').value) || 99;
      const regionVal = document.getElementById('region-filter').value;
      const monthVal = document.getElementById('month-filter').value;

      let filtered = allSailings.filter(s => {
        // Brand filter
        let brandMatch = false;
        if (currentBrand === 'all') brandMatch = true;
        else if (currentBrand === 'disney') brandMatch = s.portal === 'disney';
        else if (currentBrand === 'virgin') brandMatch = s.portal === 'virgin';
        else brandMatch = s.portal.includes(currentBrand);

        // Region filter
        const regionMatch = regionVal === 'all' || s.region === regionVal;

        // Month filter
        let monthMatch = true;
        if (monthVal !== 'all' && s.sailDateObj) {
          const d = new Date(s.sailDateObj);
          const monthKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
          monthMatch = monthKey === monthVal;
        }

        // Sliders
        const priceMatch = s.price === 0 || s.price <= maxPrice;
        const nightsMatch = s.nights === 0 || s.nights <= (maxNights === 21 ? 999 : maxNights);

        // Text search
        const textMatch = (s.ship || '').toLowerCase().includes(query) || 
                          (s.itinerary || '').toLowerCase().includes(query) || 
                          (s.category || '').toLowerCase().includes(query) ||
                          (s.portal || '').toLowerCase().includes(query);

        return brandMatch && regionMatch && monthMatch && priceMatch && nightsMatch && textMatch;
      });

      // Sort
      filtered.sort((a, b) => {
        let valA = a[currentSort.column];
        let valB = b[currentSort.column];

        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (typeof valA === 'string') {
          return currentSort.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
          return currentSort.direction === 'asc' ? valA - valB : valB - valA;
        }
      });

      lastFilteredSailings = filtered;

      const tbody = document.getElementById('table-body');
      tbody.innerHTML = '';

      if (filtered.length === 0) {
        document.getElementById('no-results-view').style.display = 'block';
        return;
      }
      document.getElementById('no-results-view').style.display = 'none';

      function getScoreBadgeClass(score) {
        if (score >= 9) return 'score-high';
        if (score >= 7) return 'score-medium';
        if (score >= 5) return 'score-fair';
        return 'score-low';
      }

      filtered.forEach((s, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = \`
          <td><span class="portal-badge \${getBrandBadgeClass(s.portal)}">\${getPortalLabel(s.portal)}</span></td>
          <td><strong>\${formatDate(s.sailDateStr)}</strong></td>
          <td>\${s.nights} Nights</td>
          <td>\${s.ship}</td>
          <td>\${s.itinerary}</td>
          <td>\${s.category}</td>
          <td><span class="price-value">\${s.priceStr}</span></td>
          <td><span class="deal-score-pill \${getScoreBadgeClass(s.dealScore)}">\${s.dealScore}/10</span></td>
          <td><em style="color: var(--seafoam-teal); font-size: 0.9rem;">\${s.aiInsight}</em></td>
          <td>
            <a href="\${s.pdfUrl}" target="_blank" class="btn-action">Flyer</a>
            <button class="btn-action btn-quote" onclick="openQuoteModal(\${idx})">Quote</button>
          </td>
        \`;
        tbody.appendChild(tr);
      });
    }

    // Modal Operations
    function openQuoteModal(idx) {
      const sailing = lastFilteredSailings[idx];
      if (!sailing) return;

      document.getElementById('q-brand').innerText = getPortalLabel(sailing.portal);
      document.getElementById('q-ship').innerText = sailing.ship;
      document.getElementById('q-date').innerText = formatDate(sailing.sailDateStr);
      document.getElementById('q-itinerary').innerText = sailing.itinerary;
      document.getElementById('q-category').innerText = sailing.category;
      document.getElementById('q-price').innerText = sailing.priceStr;
      
      document.getElementById('quote-notes').value = '';
      
      const modal = document.getElementById('quote-modal');
      modal.style.display = 'flex';
    }

    function closeQuoteModal() {
      document.getElementById('quote-modal').style.display = 'none';
    }

    function appendLog(container, message, isError = false) {
      const line = document.createElement('div');
      line.style.padding = '2px 0';
      if (isError) {
        line.style.color = 'var(--terracotta)';
      }
      line.innerText = \`[\${new Date().toLocaleTimeString()}] \${message}\`;
      container.appendChild(line);
      container.scrollTop = container.scrollHeight;
    }

    function addCloseButton(overlay, btn) {
      const card = overlay.querySelector('.progress-card');
      const closeBtn = document.createElement('button');
      closeBtn.className = 'pw-btn';
      closeBtn.style.marginTop = '1rem';
      closeBtn.innerText = 'Dismiss Logs';
      closeBtn.onclick = () => {
        overlay.style.display = 'none';
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.innerHTML = '🔄 Real-time Rates';
      };
      card.appendChild(closeBtn);
    }

    async function triggerScraperRun() {
      const btn = document.getElementById('last-updated');
      if (btn.disabled) return;

      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.innerHTML = '⚙️ Executing...';

      let overlay = document.getElementById('progress-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'progress-overlay';
        overlay.innerHTML = \`
          <div class="progress-card">
            <h3 style="font-family:'Playfair Display', serif;font-weight:700;font-size:1.2rem;color:var(--espresso);margin-bottom:0.2rem;">Live Scraper Progress</h3>
            <p id="progress-status" style="font-size:0.78rem;color:var(--cocoa-gray);margin-bottom:0.8rem;">Connecting to local backend server...</p>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" id="progress-fill"></div>
            </div>
            <div class="progress-logs" id="progress-logs"></div>
          </div>
        \`;
        document.body.appendChild(overlay);
      } else {
        overlay.style.display = 'flex';
      }

      const logContainer = document.getElementById('progress-logs');
      const fill = document.getElementById('progress-fill');
      const statusText = document.getElementById('progress-status');

      logContainer.innerHTML = '';
      fill.style.width = '3%';

      try {
        const source = new EventSource('/api/run-scraper');
        
        source.addEventListener('status', (e) => {
          const data = JSON.parse(e.data);
          statusText.innerText = data.message;
          if (data.done) {
            fill.style.width = '100%';
            source.close();
            
            if (data.failed) {
              fill.style.backgroundColor = 'var(--terracotta)';
              addCloseButton(overlay, btn);
            } else {
              statusText.innerText = 'Sync succeeded! Reloading dashboard...';
              setTimeout(() => window.location.reload(), 2000);
            }
          }
        });

        source.addEventListener('log', (e) => {
          const data = JSON.parse(e.data);
          appendLog(logContainer, data.message, false);
          
          if (data.message.includes('Status: queued')) {
            fill.style.width = '20%';
          } else if (data.message.includes('state: in_progress')) {
            fill.style.width = '50%';
          } else if (data.message.includes('completed successfully')) {
            fill.style.width = '90%';
          }
        });

        source.addEventListener('error', (e) => {
          const data = JSON.parse(e.data);
          appendLog(logContainer, data.message, true);
        });

        source.onerror = (err) => {
          console.error(err);
          appendLog(logContainer, 'Lost connection to local Express server.', true);
          source.close();
          fill.style.backgroundColor = 'var(--terracotta)';
          addCloseButton(overlay, btn);
        };
      } catch (err) {
        appendLog(logContainer, 'Failed to trigger scraper: ' + err.message, true);
        fill.style.backgroundColor = 'var(--terracotta)';
        addCloseButton(overlay, btn);
      }
    }
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
