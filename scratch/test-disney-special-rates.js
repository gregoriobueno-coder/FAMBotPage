const axios = require('axios');
const fs = require('fs');
const path = require('path');

(async () => {
  const statePath = path.join(__dirname, '..', 'auth', 'disney-state.json');
  const stateObj = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const cookieHeader = stateObj.cookies.map(c => `${c.name}=${c.value}`).join('; ');

  try {
    const url = 'https://www.disneytravelagents.com/dclspecialrates';
    console.log(`Fetching: ${url}`);
    const response = await axios.get(url, {
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache'
      },
      maxRedirects: 5
    });

    console.log('Status:', response.status);
    console.log('Headers:', response.headers);
    console.log('Data length:', response.data.length);
  } catch (e) {
    console.error(e.message);
  }
})();
