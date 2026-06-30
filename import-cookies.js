const fs = require('fs');
const path = require('path');

const portalName = process.argv[2];
const rawFile = process.argv[3] || 'cookies.json';

const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('Error: config.json not found.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (!portalName) {
  console.log('Usage: node import-cookies.js <portal_name> [path_to_raw_cookies_json]');
  console.log('Available portals:', config.portals.map(p => p.name).join(', '));
  process.exit(1);
}

const portal = config.portals.find(p => p.name === portalName);
if (!portal) {
  console.error(`Error: Portal "${portalName}" not found in config.json.`);
  process.exit(1);
}

const rawFilePath = path.resolve(rawFile);
if (!fs.existsSync(rawFilePath)) {
  console.error(`Error: File not found at ${rawFilePath}`);
  console.log(`Please make sure you have exported your cookies to a file in this folder.`);
  process.exit(1);
}

try {
  const rawCookies = JSON.parse(fs.readFileSync(rawFilePath, 'utf8'));
  const cookiesList = Array.isArray(rawCookies) ? rawCookies : (rawCookies.cookies || []);
  
  if (!Array.isArray(cookiesList)) {
    throw new Error('Cookies file must contain a JSON array or a Playwright cookies export.');
  }

  const mappedCookies = cookiesList.map(c => {
    let sameSite = 'Lax';
    if (c.sameSite) {
      const ss = c.sameSite.toLowerCase();
      if (ss === 'no_restriction' || ss === 'none') sameSite = 'None';
      else if (ss === 'lax') sameSite = 'Lax';
      else if (ss === 'strict') sameSite = 'Strict';
    }
    
    return {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expirationDate || c.expires || -1,
      httpOnly: c.httpOnly || false,
      secure: c.secure || false,
      sameSite: sameSite
    };
  });

  const stateObj = {
    cookies: mappedCookies,
    origins: []
  };

  const authDir = path.join(__dirname, 'auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  const destPath = path.join(authDir, `${portalName}-state.json`);
  fs.writeFileSync(destPath, JSON.stringify(stateObj, null, 2), 'utf8');

  console.log(`\n==================================================`);
  console.log(`✅ Success! Imported cookies for: ${portal.displayName}`);
  console.log(`Saved session state to: ${destPath}`);
  console.log(`==================================================\n`);
} catch (error) {
  console.error('Failed to import cookies:', error.message);
}
