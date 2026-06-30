const fs = require('fs');
const path = require('path');

const seenDealsPath = path.join(__dirname, '..', 'data', 'seen_deals.json');
if (!fs.existsSync(seenDealsPath)) {
  console.error('seen_deals.json not found!');
  process.exit(1);
}

const seenDeals = JSON.parse(fs.readFileSync(seenDealsPath, 'utf8'));
const uniqueDeals = Object.values(seenDeals).filter(deal => {
  return deal.urlHash && deal.pdfUrl && !deal.bufferHash.includes(deal.urlHash);
});

console.log(`Loaded ${uniqueDeals.length} primary documents. Parsing sailings...`);

const allSailings = [];
const today = new Date();
today.setHours(0, 0, 0, 0);

for (const deal of uniqueDeals) {
  if (!deal.summary) continue;

  const lines = deal.summary.split('\n').map(l => l.trim()).filter(l => l);
  let hasHeader = false;

  for (const line of lines) {
    if (line.includes('|-') || line.toLowerCase().includes('sail date')) continue; // Skip header lines
    
    const cells = line.split('|').map(c => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 5) continue; // Invalid row

    const [sailDateStr, ship, nights, itinerary, category, price] = cells;
    
    // Parse date
    const sailDate = new Date(sailDateStr);
    if (isNaN(sailDate.getTime())) {
      // If date parsing fails, keep it but warn
      console.log(`Warning: Failed to parse date string "${sailDateStr}" for ship ${ship}`);
    } else if (sailDate < today) {
      // Exclude expired rates
      console.log(`Skipping expired sailing: ${ship} on ${sailDateStr} (before today)`);
      continue;
    }

    allSailings.push({
      portal: deal.portal,
      pdfUrl: deal.pdfUrl,
      sailDateStr,
      sailDateObj: sailDate.getTime() ? sailDate : null,
      ship,
      nights,
      itinerary,
      category,
      price
    });
  }
}

console.log(`\nAggregated ${allSailings.length} active sailings!`);
console.table(allSailings.slice(0, 10));
