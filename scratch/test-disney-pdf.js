const axios = require('axios');
const fs = require('fs');
const path = require('path');

(async () => {
  const statePath = path.join(__dirname, '..', 'auth', 'disney-state.json');
  const stateObj = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const cookieHeader = stateObj.cookies.map(c => `${c.name}=${c.value}`).join('; ');

  try {
    const response = await axios.get('https://agentcentral.disneytravelagents.com/benefits/list', {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
      }
    });

    const html = response.data;
    console.log('Searching for DCL/PDF links...');
    
    // Find all links
    const matches = html.match(/href="([^"]+)"/g) || [];
    const filtered = matches.filter(m => m.toLowerCase().includes('.pdf') || m.toLowerCase().includes('dcl'));
    console.log('Matches:', filtered);
  } catch (e) {
    console.error(e.message);
  }
})();
