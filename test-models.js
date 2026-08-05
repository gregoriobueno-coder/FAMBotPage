const fs = require('fs');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  const models = [
    'gemini-2.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-2.0-flash'
  ];

  for (const m of models) {
    try {
      console.log(`Testing model: ${m}...`);
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent('Hi');
      console.log(`  Success! Response: ${result.response.text().trim()}`);
    } catch (err) {
      console.log(`  Failed: ${err.message}`);
    }
  }
}

testModels().catch(console.error);
