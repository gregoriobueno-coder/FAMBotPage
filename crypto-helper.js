const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey() {
  let hexKey = process.env.CREDENTIALS_KEY;
  if (!hexKey) {
    // Generate a secure random 32-byte key
    const newKey = crypto.randomBytes(32).toString('hex');
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      fs.appendFileSync(envPath, `\n# Encryption key for local credentials\nCREDENTIALS_KEY=${newKey}\n`);
    }
    process.env.CREDENTIALS_KEY = newKey;
    hexKey = newKey;
    console.log('Generated new CREDENTIALS_KEY and saved it to .env');
  }
  return Buffer.from(hexKey, 'hex');
}

/**
 * Encrypts a string using AES-256-GCM.
 * @param {string} text Plain text to encrypt.
 * @returns {object} Encrypted metadata containing iv, content, and tag.
 */
function encrypt(text) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    content: encrypted,
    tag: tag.toString('hex')
  };
}

/**
 * Decrypts an encrypted object metadata back into plain text.
 * @param {object} encryptedObj The object with iv, content, and tag.
 * @returns {string} Decrypted plain text.
 */
function decrypt(encryptedObj) {
  const key = getKey();
  const iv = Buffer.from(encryptedObj.iv, 'hex');
  const tag = Buffer.from(encryptedObj.tag, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(encryptedObj.content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Injects basic stealth properties into a Playwright Page instance to bypass bot blockers.
 * @param {object} page Playwright page instance.
 */
async function applyStealth(page) {
  await page.addInitScript(() => {
    // Hide WebDriver indicator
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
    // Fake Chrome runtime properties
    window.chrome = {
      runtime: {}
    };
    
    // Fake permissions API query
    const originalQuery = navigator.permissions.query;
    navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
  });
}

module.exports = { encrypt, decrypt, applyStealth };
