const axios = require('axios');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Testing Axios for Disney...');
  const statePath = path.join(__dirname, '..', 'auth', 'disney-state.json');
  if (!fs.existsSync(statePath)) {
    console.error('disney-state.json not found!');
    return;
  }

  const stateObj = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const cookieHeader = stateObj.cookies.map(c => `${c.name}=${c.value}`).join('; ');
  console.log('Cookie header:', cookieHeader);

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

    console.log(`Axios Status: ${response.status}`);
    console.log(`Response length: ${response.data.length} characters`);
    console.log('\n--- HTML Snippet ---');
    console.log(response.data.substring(0, 1000));
  } catch (e) {
    console.error('Axios failed:', e.message);
    if (e.response) {
      console.error('Axios error status:', e.response.status);
    }
  }
})();
