const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

(async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('GEMINI_API_KEY not found in env.');
    return;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    console.log('Testing Gemini API call...');
    const result = await model.generateContent('Hello! Tell me in 5 words why cruises are great.');
    console.log('Response:', result.response.text());
  } catch (error) {
    console.error('Gemini API test failed:', error.message);
  }
})();
