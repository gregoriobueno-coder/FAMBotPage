const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const PORT = process.env.MOCK_PORT || 3001;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// Mock databases
let tableDeals = [
  { ship: 'Royal Explorer', date: 'Nov 12, 2026', rate: '$350' },
  { ship: 'Celebrity Beyond', date: 'Dec 05, 2026', rate: '$420' }
];

let pdfDealText = 'Cruise FAM Deals: Disney Dream Jan 15-22, 2027 ($800)';

// Helper to generate minimal valid PDF bytes
function generateMockPdf(dealText) {
  // Strip parentheses to prevent syntax issues in PDF literal strings
  const safeText = dealText.replace(/[()]/g, '');
  const streamContent = `BT\r\n/F1 12 Tf\r\n72 712 Td\r\n(${safeText}) Tj\r\nET`;
  const streamLength = Buffer.byteLength(streamContent);
  
  const header = `%PDF-1.4\r\n`;
  const obj1 = `1 0 obj\r\n<</Type /Catalog /Pages 2 0 R>>\r\nendobj\r\n`;
  const obj2 = `2 0 obj\r\n<</Type /Pages /Kids [3 0 R] /Count 1>>\r\nendobj\r\n`;
  const obj3 = `3 0 obj\r\n<</Type /Page /Parent 2 0 R /Resources <</Font <</F1 <</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>>>>> /MediaBox [0 0 612 792] /Contents 4 0 R>>\r\nendobj\r\n`;
  const obj4 = `4 0 obj\r\n<</Length ${streamLength}>>\r\nstream\r\n${streamContent}\r\nendstream\r\nendobj\r\n`;
  
  const offset1 = header.length;
  const offset2 = offset1 + obj1.length;
  const offset3 = offset2 + obj2.length;
  const offset4 = offset3 + obj3.length;
  
  const body = header + obj1 + obj2 + obj3 + obj4;
  const startxref = body.length;
  
  const pad = (num) => String(num).padStart(10, '0');
  
  // Pad the file to >1KB to prevent pdfjs-dist / pdf-parse bugs on very small files
  const padding = '% ' + ' '.repeat(1000) + '\r\n';
  
  const xref = `xref\r\n` +
               `0 5\r\n` +
               `0000000000 65535 f \r\n` +
               `${pad(offset1)} 00000 n \r\n` +
               `${pad(offset2)} 00000 n \r\n` +
               `${pad(offset3)} 00000 n \r\n` +
               `${pad(offset4)} 00000 n \r\n` +
               `trailer\r\n` +
               `<</Size 5 /Root 1 0 R>>\r\n` +
               `startxref\r\n` +
               `${startxref}\r\n` +
               padding +
               `%%EOF\r\n`;
  
  return Buffer.from(body + xref, 'binary');
}

// Middleware to check authentication
function checkAuth(req, res, next) {
  if (req.cookies.session_id === 'agent-mock-12345') {
    next();
  } else {
    res.redirect('/login');
  }
}

// Routes
app.get('/login', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Mock Partner Portal Login</title>
        <style>
          body { font-family: sans-serif; background: #f0f2f5; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); width: 300px; }
          h2 { margin-top: 0; color: #1a73e8; }
          input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
          button { width: 100%; padding: 10px; background: #1a73e8; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; }
          button:hover { background: #1557b0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Agent Portal Login</h2>
          <form method="POST" action="/login">
            <input type="text" name="username" placeholder="Username" required />
            <input type="password" name="password" placeholder="Password" required />
            <button type="submit" id="submit-btn">Login</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

app.post('/login', (req, res) => {
  // Accept any password for mock verification
  res.cookie('session_id', 'agent-mock-12345', { httpOnly: true });
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  res.clearCookie('session_id');
  res.send('Logged out successfully.');
});

// HTML Table Dashboard
app.get('/dashboard', checkAuth, (req, res) => {
  let rows = tableDeals.map(deal => `
    <tr>
      <td class="ship">${deal.ship}</td>
      <td class="date">${deal.date}</td>
      <td class="rate">${deal.rate}</td>
    </tr>
  `).join('');

  res.send(`
    <html>
      <head>
        <title>Mock Agent Dashboard</title>
        <style>
          body { font-family: sans-serif; padding: 40px; background: #fafafa; }
          h2 { color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; background: white; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
          th, td { padding: 12px 15px; border-bottom: 1px solid #eee; text-align: left; }
          th { background-color: #f4f6f8; font-weight: bold; }
          .logout-btn { float: right; padding: 8px 15px; background: #e06666; color: white; text-decoration: none; border-radius: 4px; }
        </style>
      </head>
      <body>
        <a href="/logout" class="logout-btn">Logout</a>
        <h2>Princess/Holland/Cunard FAM & Agent Rates</h2>
        <table>
          <thead>
            <tr>
              <th>Ship Name</th>
              <th>Sailing Date</th>
              <th>Agent Rate</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </body>
    </html>
  `);
});

// PDF-based Dashboard
app.get('/pdf-dashboard', checkAuth, (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Mock Disney benefits</title>
        <style>
          body { font-family: sans-serif; padding: 40px; background: #fafafa; }
          .pdf-link { display: inline-block; padding: 10px 20px; background: #ff9900; color: white; text-decoration: none; border-radius: 4px; font-weight: bold; }
          .logout-link { float: right; padding: 8px 15px; background: #e06666; color: white; text-decoration: none; border-radius: 4px; }
        </style>
      </head>
      <body>
        <a href="/logout" class="logout-link">Logout</a>
        <h2>Disney Cruise Line Benefits & FAM Opportunities</h2>
        <p>Current travel agent offerings can be found in our official rates PDF document:</p>
        <a href="/downloads/rates.pdf" class="pdf-link">Download FAM Rates Document (PDF)</a>
      </body>
    </html>
  `);
});

// Serve the dynamic mock PDF
app.get('/downloads/rates.pdf', checkAuth, (req, res) => {
  const pdfBuffer = generateMockPdf(pdfDealText);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="rates.pdf"');
  res.send(pdfBuffer);
});

// API endpoint to dynamically add new deals for testing
app.post('/api/add-deal', (req, res) => {
  const { type, ship, date, rate, pdfText } = req.body;

  if (type === 'table') {
    tableDeals.push({ ship, date, rate });
    console.log(`[Mock Server] Added table deal: ${ship}`);
    return res.status(200).json({ status: 'success', deals: tableDeals });
  } else if (type === 'pdf') {
    pdfDealText = pdfText;
    console.log(`[Mock Server] Updated PDF deal content: ${pdfText}`);
    return res.status(200).json({ status: 'success', pdfText: pdfDealText });
  }
  
  res.status(400).json({ status: 'error', message: 'Invalid type' });
});

// Start the server
const server = app.listen(PORT, () => {
  console.log(`Mock partner portal server running on http://localhost:${PORT}`);
});

// Support graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Mock server closed.');
  });
});
