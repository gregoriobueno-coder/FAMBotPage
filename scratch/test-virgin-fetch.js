const axios = require('axios');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Testing Axios for Virgin Voyages...');
  const statePath = path.join(__dirname, '..', 'auth', 'virgin-state.json');
  if (!fs.existsSync(statePath)) {
    console.error('virgin-state.json not found!');
    return;
  }

  const stateObj = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const cookieHeader = stateObj.cookies.map(c => `${c.name}=${c.value}`).join('; ');

  try {
    const url = 'https://www.firstmates.com/fmrates';
    const response = await axios.get(url, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
      }
    });

    console.log('Status:', response.status);
    console.log('Response length:', response.data.length);
    
    // Find PDF link
    const matches = response.data.match(/href="([^"]+)"/g) || [];
    const pdfLinks = matches.filter(m => m.toLowerCase().includes('.pdf'));
    console.log('PDF matches:', pdfLinks);
  } catch (e) {
    console.error('Axios failed:', e.message);
  }
})();
