const fs = require('fs');
const pdf = require('pdf-parse');
require('dotenv').config();
const { summarizePdfText } = require('./gemini-helper');

async function test() {
  console.log('Reading Virgin PDF...');
  const buf = fs.readFileSync('flyers/virgin-1785445375475.pdf');
  const d = await pdf(buf);
  console.log('Extracting text length:', d.text.length);
  const summary = await summarizePdfText(d.text);
  console.log('\n--- Gemini Summary Output ---');
  console.log(summary);
}

test().catch(console.error);
