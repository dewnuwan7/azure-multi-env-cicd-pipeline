// Runs against a deployed environment after deploy. Checks that the app
// is healthy AND running the exact commit the pipeline built.
//Requires BASE_URL, EXPECTED_VERSION and EXPECTED_ENVIRONMENT to be set in the environment.
const base = process.env.BASE_URL;
const expectedVersion = process.env.EXPECTED_VERSION;
const expectedEnvironment = process.env.EXPECTED_ENVIRONMENT;

if (!base || !expectedVersion || !expectedEnvironment) {
  console.error('BASE_URL, EXPECTED_VERSION and EXPECTED_ENVIRONMENT are required');
  process.exit(1);
}

// Scale-to-zero (dev) can make the first requests slow, so retry for about a minute.
async function getJson(path, attempts = 6) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(base + path);
      if (res.ok) return await res.json();
    } catch {
      // fall through and retry
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`${path} did not become healthy after ${attempts} attempts`);
}

(async () => {
  const status = await getJson('/api/status');
  if (status.status !== 'running') throw new Error('status is not running');
  if (status.environment !== expectedEnvironment) {
    throw new Error(`environment is ${status.environment}, expected ${expectedEnvironment}`);
  }
  if (status.version !== expectedVersion) {
    throw new Error(`version is ${status.version}, expected ${expectedVersion}`);
  }

  const health = await getJson('/health');
  if (health.healthy !== true) throw new Error('/health did not report healthy');

  const page = await fetch(`${base}/`);
  const html = await page.text();
  if (page.status !== 200 || !html.includes('Application status')) {
    throw new Error('status page did not load correctly');
  }

  console.log(`integration checks passed for ${expectedVersion} in ${expectedEnvironment}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});