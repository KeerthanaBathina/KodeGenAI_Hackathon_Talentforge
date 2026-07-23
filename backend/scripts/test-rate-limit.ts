import http from 'http';

const targetUrl = process.argv[2] ?? 'http://localhost:3001';
const endpoint = `${targetUrl}/ping`;
const requests = 110;
const concurrency = 10;

type RequestResult = {
  index: number;
  status: number;
  retryAfter: string | null;
};

async function sendRequest(index: number): Promise<RequestResult> {
  return new Promise((resolve) => {
    const req = http.get(endpoint, (res) => {
      resolve({
        index,
        status: res.statusCode ?? 0,
        retryAfter: (res.headers['retry-after'] as string | undefined) ?? null
      });
      res.resume();
    });

    req.on('error', () => {
      resolve({ index, status: -1, retryAfter: null });
    });
  });
}

async function run() {
  console.log(`Sending ${requests} requests to ${endpoint} (concurrency: ${concurrency})`);
  const results: RequestResult[] = [];

  for (let i = 0; i < requests; i += concurrency) {
    const batch = Array.from({ length: Math.min(concurrency, requests - i) }, (_, j) =>
      sendRequest(i + j + 1)
    );
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
  }

  const ok = results.filter((result) => result.status === 200).length;
  const limited = results.filter((result) => result.status === 429).length;
  const firstLimited = results.find((result) => result.status === 429);

  console.log('\nResults:');
  console.log(`  HTTP 200: ${ok}`);
  console.log(`  HTTP 429: ${limited}`);

  if (firstLimited) {
    console.log(`  First 429 at request #${firstLimited.index}`);
    console.log(`  Retry-After: ${firstLimited.retryAfter ?? 'MISSING'}`);
  }

  if (limited > 0 && firstLimited && firstLimited.retryAfter) {
    console.log('\nPASS - Rate limiting active with Retry-After header');
    return;
  }

  if (limited === 0) {
    console.error('\nFAIL - No 429 responses received');
  } else {
    console.error('\nFAIL - 429 received but Retry-After header missing');
  }
  process.exit(1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
