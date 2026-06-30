const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Summarizes raw PDF text into a clean Markdown table of deals using Gemini 1.5 Flash
 */
async function summarizePdfText(pdfText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('[Gemini] GEMINI_API_KEY is not set. Skipping AI enhancement.');
    return '';
  }

  if (!pdfText || !pdfText.trim()) {
    return '';
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    console.log('[Gemini] Generating clean markdown table of deals...');
    
    const prompt = `
You are an expert travel agent assistant. Analyze the following raw text content extracted from a cruise line's travel advisor / FAM rates flyer.
Extract the list of active special rates / deals / sailings and format them as a clean, highly structured Markdown table.

Rules:
1. Columns must include exactly: Sail Date | Ship | Nights | Itinerary | Category | Price | Rate Basis | Deal Score | AI Insight
2. If any value is missing, use N/A.
3. Keep the table short: only select the top 10 most relevant/attractive deals (e.g. soonest sail dates or best rates) to prevent cluttering a screen.
4. Output ONLY the markdown table. Do not include any introduction, conversational response, greeting, explanation, or markdown backticks around the table itself.
5. In "Rate Basis", analyze if the price is "Per Person" (PP), "Per Cabin" (Cabin), or "Single" based on flyer annotations (default to "PP" if not specified, as standard double occupancy applies).
6. In "Deal Score", evaluate the deal value on a scale from 1 (Poor) to 10 (Exceptional) considering the brand standard, itinerary, nights, and cabin type price.
7. In "AI Insight", provide a 3-5 word summary of the unique value (e.g., "70% off retail", "Rare solo rate", "Great balcony deal").
8. If no deals or rates lists are found in the text, simply output: "No active rates lists found in document."

Raw text content:
${pdfText.substring(0, 15000)}
`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();
    return summary.trim();
  } catch (error) {
    console.error('[Gemini] Failed to generate deals summary:', error.message);
    return '';
  }
}

module.exports = { summarizePdfText };
