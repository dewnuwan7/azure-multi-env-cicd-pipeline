const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Failure drill only. When FAIL_AFTER_SECONDS is set, /health starts returning 500
// after that many seconds. Never set this in dev or staging.
let broken = false;
const failAfter = Number(process.env.FAIL_AFTER_SECONDS || 0);
if (failAfter > 0) {
  setTimeout(() => { broken = true; }, failAfter * 1000).unref();
}

const startedAt = Date.now();

// Status page. Its JavaScript calls /api/status and /health.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    environment: process.env.ENVIRONMENT || 'unknown',
    version: process.env.APP_VERSION || 'unknown',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date(),
  });
});

  // TEST ONLY: fail health checks in production. Remove after the test.
  if (process.env.ENVIRONMENT === 'prod') {
    return res.status(500).json({ healthy: false });
  }

app.get('/health', (req, res) => {
  if (broken) {
    return res.status(500).json({ healthy: false });
  }
  res.status(200).json({ healthy: true });
});

// Listen only when this file runs directly (npm start).
// When tests import the app, nothing listens, so the test process can exit.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`App running on port ${PORT}`);
  });
}

module.exports = app;