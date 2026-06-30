const { webkit, firefox } = require('playwright');

(async () => {
  console.log('Testing WebKit for Disney...');
  try {
    const browser = await webkit.launch({ headless: true });
    const page = await browser.newPage();
    const response = await page.goto('https://agentcentral.disneytravelagents.com/benefits/list');
    console.log(`WebKit Status: ${response.status()}`);
    await browser.close();
  } catch (e) {
    console.error('WebKit failed:', e.message);
  }

  console.log('Testing Firefox for Disney...');
  try {
    const browser = await firefox.launch({ headless: true });
    const page = await browser.newPage();
    const response = await page.goto('https://agentcentral.disneytravelagents.com/benefits/list');
    console.log(`Firefox Status: ${response.status()}`);
    await browser.close();
  } catch (e) {
    console.error('Firefox failed:', e.message);
  }
})();
