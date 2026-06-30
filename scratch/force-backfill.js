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
  console.log('Starting FORCE backfill to populate AI Deal Scores and Rate Basis...');

  const keys = Object.keys(seenDeals);
  let updatedCount = 0;

  for (const key of keys) {
    const deal = seenDeals[key];
    if (key.includes('rawbuf') || deal.portal.includes('rawbuf')) continue;

    console.log(`\nProcessing [${deal.portal}] ${deal.pdfUrl}...`);

    const cleanPortal = deal.portal.toLowerCase().replace(/[^a-z]/g, '');
    const files = fs.readdirSync(downloadsDir)
      .filter(f => {
        const cleanFile = f.toLowerCase().replace(/[^a-z]/g, '');
        return cleanFile.includes(cleanPortal.replace('onesource', ''));
      })
      .map(f => ({ name: f, time: fs.statSync(path.join(downloadsDir, f)).mtime }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      console.log(`No downloaded PDF file found for portal: ${deal.portal}`);
      continue;
    }

    const pdfPath = path.join(downloadsDir, files[0].name);
    console.log(`Using PDF file: ${pdfPath}`);

    try {
      const pdfBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(pdfBuffer);
      const pdfText = (pdfData.text || '').trim();

      // Generate Summary with retry loop
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

      if (summary) {
        deal.summary = summary;
        updatedCount++;
        console.log(`Successfully generated AI Deal Score summary.`);
      }
    } catch (e) {
      console.error(`Failed to process PDF ${pdfPath}:`, e.message);
    }
  }

  if (updatedCount > 0) {
    fs.writeFileSync(seenDealsPath, JSON.stringify(seenDeals, null, 2), 'utf8');
    console.log(`\nForce backfill completed! ${updatedCount} entries updated.`);
    
    // Compile static dashboard again with new database
    const { compileStaticDashboard } = require('../dashboard-compiler');
    compileStaticDashboard();
  }
})();
