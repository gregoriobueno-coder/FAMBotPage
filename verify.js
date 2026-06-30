const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const mockPort = 3001;
const mockServerUrl = `http://localhost:${mockPort}`;

// Backup original config.json and seen_deals.json if they exist
const configPath = path.join(__dirname, 'config.json');
const originalConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : null;

const seenDealsPath = path.join(__dirname, 'data', 'seen_deals.json');
const originalSeenDeals = fs.existsSync(seenDealsPath) ? fs.readFileSync(seenDealsPath, 'utf8') : null;

// Temporary test config
const testConfig = {
  portals: [
    {
      name: "mock-table",
      displayName: "Mock Table Portal",
      loginUrl: `${mockServerUrl}/login`,
      url: `${mockServerUrl}/dashboard`,
      type: "table",
      selectors: {
        checkLoggedIn: "a[href='/logout']",
        tableRow: "table tbody tr",
        shipCell: ".ship",
        dateCell: ".date",
        rateCell: ".rate"
      }
    },
    {
      name: "mock-pdf",
      displayName: "Mock PDF Portal",
      loginUrl: `${mockServerUrl}/login`,
      url: `${mockServerUrl}/pdf-dashboard`,
      type: "pdf",
      selectors: {
        checkLoggedIn: "a[href='/logout']",
        pdfLink: ".pdf-link"
      }
    }
  ]
};

// Programmatically create mock auth state so test requires no human interaction
const mockAuthState = {
  cookies: [
    {
      name: "session_id",
      value: "agent-mock-12345",
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax"
    }
  ],
  origins: []
};

// Main test harness
(async () => {
  console.log('=== STARTING FAM SCOUT INTEGRATION TEST ===\n');

  // 1. Write test config
  console.log('Writing test configuration...');
  fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2), 'utf8');

  // 2. Ensure auth dir exists and write mock auth state files
  const authDir = path.join(__dirname, 'auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });
  
  console.log('Injecting mock auth state session tokens...');
  fs.writeFileSync(path.join(authDir, 'mock-table-state.json'), JSON.stringify(mockAuthState, null, 2));
  fs.writeFileSync(path.join(authDir, 'mock-pdf-state.json'), JSON.stringify(mockAuthState, null, 2));

  // 3. Clear existing seen deals for clean run
  if (fs.existsSync(seenDealsPath)) {
    fs.unlinkSync(seenDealsPath);
  }

  // 4. Start the mock server
  console.log('Starting mock portal server...');
  const mockServerProcess = spawn('node', ['mock-server.js'], {
    env: { ...process.env, MOCK_PORT: mockPort.toString() }
  });

  // Log mock server output to console
  mockServerProcess.stdout.on('data', (data) => {
    console.log(`[Mock Server Output]: ${data.toString().trim()}`);
  });

  mockServerProcess.stderr.on('data', (data) => {
    console.error(`[Mock Server Error]: ${data.toString().trim()}`);
  });

  // Wait 1.5s for server to start
  await new Promise(resolve => setTimeout(resolve, 1500));

  try {
    // 5. Run initial scout scan (should discover initial deals: 2 table deals, 1 PDF deal)
    console.log('\nRunning INITIAL Scout Scan (establishing baseline of seen deals)...');
    await runCommand('node', ['scout.js']);

    // 6. Verify seen_deals.json contains original items
    const parsedSeen1 = JSON.parse(fs.readFileSync(seenDealsPath, 'utf8'));
    const initialCount = Object.keys(parsedSeen1).length;
    console.log(`\nInitial scan completed. Database contains ${initialCount} tracked item entries.`);

    // 7. Inject new deals into the mock server
    console.log('\nInjecting 1 new table deal and updating PDF content on the mock server...');
    
    // Add table deal
    await axios.post(`${mockServerUrl}/api/add-deal`, {
      type: 'table',
      ship: 'Norwegian Sky',
      date: 'Jan 20-27, 2027',
      rate: '$299'
    });

    // Add PDF deal
    await axios.post(`${mockServerUrl}/api/add-deal`, {
      type: 'pdf',
      pdfText: 'Cruise FAM Deals: Disney Magic Feb 10, 2027 ($750) and Disney Dream Jan 15-22, 2027 ($800)'
    });

    // 8. Run second scout scan (should only trigger alerts for the 2 newly added deals)
    console.log('\nRunning SECOND Scout Scan (monitoring for additions)...');
    await runCommand('node', ['scout.js']);

    const parsedSeen2 = JSON.parse(fs.readFileSync(seenDealsPath, 'utf8'));
    const finalCount = Object.keys(parsedSeen2).length;
    console.log(`\nSecond scan completed. Database contains ${finalCount} tracked item entries.`);
    
    // Assertions
    if (finalCount > initialCount) {
      console.log('\n==================================================');
      console.log('🎉 SUCCESS: FAM Scout successfully detected new deals');
      console.log(`   Baseline count: ${initialCount}`);
      console.log(`   New count: ${finalCount}`);
      console.log('==================================================');
    } else {
      throw new Error('FAIL: No new deals were detected in the second scan.');
    }

  } catch (error) {
    console.error('\n❌ INTEGRATION TEST FAILED:', error.message);
  } finally {
    // 9. Clean up and restore files
    console.log('\nCleaning up mock files and restoring configurations...');
    
    // Stop server
    mockServerProcess.kill();
    
    // Clean up injected auth states
    try {
      fs.unlinkSync(path.join(authDir, 'mock-table-state.json'));
      fs.unlinkSync(path.join(authDir, 'mock-pdf-state.json'));
    } catch (e) {}

    // Restore original configs
    if (originalConfig) {
      fs.writeFileSync(configPath, originalConfig, 'utf8');
    }
    if (originalSeenDeals) {
      fs.writeFileSync(seenDealsPath, originalSeenDeals, 'utf8');
    } else {
      try {
        fs.unlinkSync(seenDealsPath);
      } catch (e) {}
    }

    console.log('Integration test sequence finished.\n');
  }
})();

// Helper to spawn process and wait for completion
function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command ${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}
