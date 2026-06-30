const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { summarizePdfText } = require('../gemini-helper');
require('dotenv').config();

(async () => {
  const downloadsDir = path.join(__dirname, '..', 'downloads');
  if (!fs.existsSync(downloadsDir)) {
    console.error('Downloads directory does not exist!');
    return;
  }
  const files = fs.readdirSync(downloadsDir).filter(f => f.startsWith('onesource-cunard') && f.endsWith('.pdf'));
  if (files.length === 0) {
    console.log('No Cunard PDFs found in downloads.');
    return;
  }
  
  const pdfPath = path.join(downloadsDir, files[0]);
  console.log(`Loading PDF: ${pdfPath}`);
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfData = await pdfParse(pdfBuffer);
  const text = pdfData.text;
  
  console.log('Running Gemini Summarization...');
  const summary = await summarizePdfText(text);
  console.log('\n--- AI Summary Result ---');
  console.log(summary);
})();
