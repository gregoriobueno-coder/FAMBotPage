const fs = require('fs');
const https = require('https');
require('dotenv').config();

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  https.get(url, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log(data.models.map(m => m.name));
      } catch (e) {
        console.error('Failed to parse response:', body);
      }
    });
  }).on('error', console.error);
}

listModels().catch(console.error);
