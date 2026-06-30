const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

(async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Let's try gemini-pro which is highly compatible
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    console.log('Testing with gemini-pro...');
    const result = await model.generateContent('Say hello in 1 word.');
    console.log('Success! Response:', result.response.text());
  } catch (error) {
    console.error('Test failed:', error.message);
  }
})();
