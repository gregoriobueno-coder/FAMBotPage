const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { encrypt, decrypt } = require('./crypto-helper');

const configPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(configPath)) {
  console.error('Error: config.json not found.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

const authDir = path.join(__dirname, 'auth');
if (!fs.existsSync(authDir)) {
  fs.mkdirSync(authDir, { recursive: true });
}
const credentialsPath = path.join(authDir, 'credentials.enc');

// Helper to ask questions
function askQuestion(query, isPassword = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    let isMuted = false;
    rl._writeToOutput = function _writeToOutput(stringToWrite) {
      if (isMuted) {
        if (stringToWrite === '\r\n' || stringToWrite === '\n') {
          rl.output.write(stringToWrite);
        }
      } else {
        rl.output.write(stringToWrite);
      }
    };

    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });

    if (isPassword) {
      isMuted = true;
    }
  });
}

(async () => {
  console.log(`\n==================================================`);
  console.log(`🔑 FAM Scout: Setup Encrypted Local Credentials`);
  console.log(`==================================================\n`);
  console.log(`This script will encrypt and save your credentials locally.`);
  console.log(`These credentials are used to auto-renew your sessions when they expire.\n`);

  let credentials = {};
  if (fs.existsSync(credentialsPath)) {
    try {
      const encryptedData = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      const decryptedText = decrypt(encryptedData);
      credentials = JSON.parse(decryptedText);
      console.log(`Found existing credentials on file. We will update/merge them.\n`);
    } catch (e) {
      console.warn(`Warning: Could not decrypt existing credentials file. Creating new one.`);
      credentials = {};
    }
  }

  for (const portal of config.portals) {
    // Skip disabled/ignored portals
    if (portal.name === 'cruisingpower') continue;

    console.log(`--------------------------------------------------`);
    const hasCreds = credentials[portal.name] ? ' (currently configured)' : '';
    const answer = await askQuestion(`Configure credentials for ${portal.displayName}${hasCreds}? (y/n): `);
    
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      const username = await askQuestion(`Enter Username/Email: `);
      console.log(`Enter Password (input will be visible for verification):`);
      const password = await askQuestion(`Password: `, false);
      
      if (username && password) {
        credentials[portal.name] = { username, password };
        console.log(`\n✅ Saved credentials in memory for ${portal.displayName}`);
      } else {
        console.log(`❌ Username or password cannot be empty. Skipping.`);
      }
    } else {
      console.log(`Skipped ${portal.displayName}`);
    }
  }

  if (Object.keys(credentials).length > 0) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Encrypting and writing to disk...`);
    const plainText = JSON.stringify(credentials);
    const encryptedObj = encrypt(plainText);
    fs.writeFileSync(credentialsPath, JSON.stringify(encryptedObj, null, 2), 'utf8');
    console.log(`✅ Success! Encrypted credentials saved to: ${credentialsPath}`);
  } else {
    console.log(`\nNo credentials configured. Exiting.`);
  }
})();
