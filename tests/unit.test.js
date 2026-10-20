const { test } = require('node:test');
const assert = require('node:assert');
const app = require('../src/app');

// Start the app on a random free port so tests never clash with a running server.
function start() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

test('/health returns 200 by default', async () => {
  const server = await start();
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/health`);
  server.close();
  assert.strictEqual(res.status, 200);
});

test('/api/status reports running, with a version and uptime', async () => {
  const server = await start();
  const { port } = server.address();
  const body = await (await fetch(`http://localhost:${port}/api/status`)).json();
  server.close();
  assert.strictEqual(body.status, 'running');
  assert.ok('version' in body);
  assert.ok('uptimeSeconds' in body);
});

test('/ serves the status page', async () => {
  const server = await start();
  const { port } = server.address();
  const res = await fetch(`http://localhost:${port}/`);
  const html = await res.text();
  server.close();
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(html, /Application status/);
});