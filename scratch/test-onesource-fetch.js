const axios = require('axios');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('Testing Axios for OneSource...');
  const statePath = path.join(__dirname, '..', 'auth', 'onesource-state.json');
  if (!fs.existsSync(statePath)) {
    console.error('onesource-state.json not found!');
    return;
  }

  const stateObj = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const cookieHeader = stateObj.cookies.map(c => `${c.name}=${c.value}`).join('; ');

  try {
    const url = 'https://www.onesourcecruises.com/onesource/login';
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
    console.log('Redirects / URL:', response.request.res.responseUrl || url);
    
    // Check if the response contains table rows or username
    const hasLogin = response.data.includes('Welcome, Sign In');
    console.log('Contains "Welcome, Sign In" (indicates logged out):', hasLogin);
    
    // Print first 500 chars of HTML
    console.log(response.data.substring(0, 500));
  } catch (e) {
    console.error('Axios failed:', e.message);
  }
})();
