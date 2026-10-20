// Runs against a deployed environment. Requires BASE_URL, for example https://<app-fqdn>.
const base = process.env.BASE_URL;
if (!base) {
  console.error('BASE_URL is not set');
  process.exit(1);
}

(async () => {
  const health = await fetch(`${base}/health`);
  if (health.status !== 200) {
    throw new Error(`/health returned ${health.status}`);
  }

  const status = await (await fetch(`${base}/api/status`)).json();
  if (status.status !== 'running') {
    throw new Error('unexpected body from /api/status');
  }

  const page = await fetch(`${base}/`);
  if (page.status !== 200) {
    throw new Error(`/ returned ${page.status}`);
  }

  console.log(`e2e passed against ${base}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});