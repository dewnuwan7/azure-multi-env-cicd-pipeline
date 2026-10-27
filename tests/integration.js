// Runs against a deployed environment after deploy. Checks that the app
// is healthy AND running the exact commit the pipeline built.
// Requires BASE_URL, EXPECTED_VERSION and EXPECTED_ENVIRONMENT to be set in the environment.
const base = process.env.BASE_URL;
const expectedVersion = process.env.EXPECTED_VERSION;
const expectedEnvironment = process.env.EXPECTED_ENVIRONMENT;

if (!base || !expectedVersion || !expectedEnvironment) {
  console.error('BASE_URL, EXPECTED_VERSION and EXPECTED_ENVIRONMENT are required');
  process.exit(1);
}

// Polls until the app reports the expected commit. Dev can take a while to switch
// to a new revision, so this waits up to five minutes. If the old version is still
// answering when time runs out, the error names it.
async function waitForVersion(path, expected, maxSeconds = 300) {
  const deadline = Date.now() + maxSeconds * 1000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + path);
      if (res.ok) {
        last = await res.json();
        if (last.version === expected) return last;
      }
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`version never became ${expected}; last seen: ${last && last.version}`);
}

// Retries a request for about a minute, for endpoints that may still be warming up.
async function getJson(path, attempts = 6) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(base + path);
      if (res.ok) return await res.json();
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error(`${path} did not respond after ${attempts} attempts`);
}

(async () => {
  const status = await waitForVersion('/api/status', expectedVersion);
  if (status.status !== 'running') throw new Error('status is not running');
  if (status.environment !== expectedEnvironment) {
    throw new Error(`environment is ${status.environment}, expected ${expectedEnvironment}`);
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