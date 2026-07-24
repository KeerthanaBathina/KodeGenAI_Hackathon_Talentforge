import http from 'node:http';
import https from 'node:https';

const BACKEND_URL = process.env['BACKEND_URL'];
const POLL_INTERVAL_MS = 500;
const DURATION_MS = 60_000;
const HEALTH_PATH = '/health';

if (!BACKEND_URL) {
  console.error('BACKEND_URL environment variable is required.');
  process.exit(1);
}

const results: Array<{ ts: string; status: number; ok: boolean }> = [];

function poll(url: string): Promise<number> {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(`${url}${HEALTH_PATH}`, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });

    req.on('error', () => resolve(0));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(0);
    });
  });
}

async function main(): Promise<void> {
  const startTime = Date.now();
  console.log(`Polling ${BACKEND_URL}${HEALTH_PATH} every ${POLL_INTERVAL_MS}ms for ${DURATION_MS / 1000}s`);
  console.log('Run the deployment now to validate zero downtime.\n');

  while (Date.now() - startTime < DURATION_MS) {
    const status = await poll(BACKEND_URL);
    const ok = status >= 200 && status < 300;
    const ts = new Date().toISOString();
    results.push({ ts, status, ok });

    if (!ok) {
      console.error(`  ${ts}  FAIL ${status === 0 ? 'CONN_ERR' : status}`);
    } else {
      process.stdout.write('.');
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  console.log('\n\n--- Results ---');
  const total = results.length;
  const passed = results.filter((result) => result.ok).length;
  const failed = total - passed;
  const successRate = ((passed / total) * 100).toFixed(1);

  console.log(`Total polls:  ${total}`);
  console.log(`Successful:   ${passed} (${successRate}%)`);
  console.log(`Failed:       ${failed}`);

  if (failed > 0) {
    console.error('FAIL: Downtime detected during deployment.');
    for (const result of results.filter((entry) => !entry.ok)) {
      console.error(`  ${result.ts}  ${result.status}`);
    }
    process.exit(1);
  }

  console.log('PASS: Zero downtime confirmed with 100% health-check success.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
