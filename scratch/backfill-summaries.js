const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { summarizePdfText } = require('../gemini-helper');
require('dotenv').config();

(async () => {
  const dataDir = path.join(__dirname, '..', 'data');
  const seenDealsPath = path.join(dataDir, 'seen_deals.json');
  const downloadsDir = path.join(__dirname, '..', 'downloads');

  if (!fs.existsSync(seenDealsPath)) {
    console.error('seen_deals.json not found!');
    return;
  }

  const seenDeals = JSON.parse(fs.readFileSync(seenDealsPath, 'utf8'));
  console.log('Starting backfill for existing deals database...');

  const keys = Object.keys(seenDeals);
  let updatedCount = 0;

  for (const key of keys) {
    const deal = seenDeals[key];
    
    // Skip raw buffer duplicate entries
    if (key.includes('rawbuf') || deal.portal.includes('rawbuf')) continue;

    // Check if we need to backfill
    if (!deal.summary || !deal.title) {
      console.log(`\nBackfilling summary for [${deal.portal}] ${deal.pdfUrl}...`);
      
      // Alphanumeric clean match to handle brand dash differences (e.g. princesscruises vs princess-cruises)
      const cleanPortal = deal.portal.toLowerCase().replace(/[^a-z]/g, '');
      const files = fs.readdirSync(downloadsDir)
        .filter(f => {
          const cleanFile = f.toLowerCase().replace(/[^a-z]/g, '');
          return cleanFile.includes(cleanPortal.replace('onesource', ''));
        })
        .map(f => ({ name: f, time: fs.statSync(path.join(downloadsDir, f)).mtime }))
        .sort((a, b) => b.time - a.time);

      if (files.length === 0) {
        console.log(`No downloaded PDF file found for portal: ${deal.portal} (Clean: ${cleanPortal})`);
        continue;
      }

      const pdfPath = path.join(downloadsDir, files[0].name);
      console.log(`Using PDF file: ${pdfPath}`);

      try {
        const pdfBuffer = fs.readFileSync(pdfPath);
        const pdfData = await pdfParse(pdfBuffer);
        const pdfText = (pdfData.text || '').trim();

        // 1. Generate Title
        let title = deal.title || '';
        if (!title) {
          if (deal.portal === 'disney') title = 'Disney Cruise Line Special Rates';
          else if (deal.portal === 'virgin') title = 'Virgin Voyages First Mate Rates';
          else {
            const firstLine = pdfText.split('\n')[0].trim();
            title = firstLine.substring(0, 50) || `${deal.portal.replace('onesource-', '')} Flyer`;
          }
        }

        // 2. Generate Summary (with retry for 503 demand errors)
        let summary = '';
        let retries = 3;
        while (retries > 0) {
          try {
            summary = await summarizePdfText(pdfText);
            break;
          } catch (apiErr) {
            if (apiErr.message.includes('503') || apiErr.message.includes('demand')) {
              console.log(`[Gemini] High demand 503, retrying in 3 seconds... (Retries left: ${retries - 1})`);
              retries--;
              await new Promise(resolve => setTimeout(resolve, 3000));
            } else {
              throw apiErr;
            }
          }
        }

        deal.title = title;
        deal.summary = summary;
        updatedCount++;
        console.log(`Successfully backfilled deal: ${title}`);
      } catch (e) {
        console.error(`Failed to process PDF ${pdfPath}:`, e.message);
      }
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(seenDealsPath, JSON.stringify(seenDeals, null, 2), 'utf8');
    console.log(`\nDatabase backfill completed! ${updatedCount} entries updated.`);
  } else {
    console.log('\nNo entries needed backfilling.');
  }
})();
