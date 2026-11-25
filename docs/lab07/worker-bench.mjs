import { writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.route('http://lab07.test/', route =>
    route.fulfill({ contentType: 'text/html', body: '<title>Lab 07 Worker benchmark</title>' })
  );
  await page.goto('http://lab07.test/');

  const results = await page.evaluate(async () => {
    function aimBatch(values) {
      let checksum = 0;
      for (let i = 0; i < values.length; i += 3) {
        const difference = Math.atan2(values[i + 1], values[i]) - values[i + 2];
        checksum += Math.atan2(Math.sin(difference), Math.cos(difference));
      }
      return checksum;
    }

    function p95(samples) {
      const sorted = [...samples].sort((a, b) => a - b);
      return Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3));
    }

    const workerCode = aimBatch.toString() + '\n' +
      'self.onmessage = ({ data }) => self.postMessage(aimBatch(new Float64Array(data)));';
    const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    const worker = new Worker(url);

    function askWorker(buffer) {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Worker timeout')), 5000);
        worker.onmessage = event => {
          clearTimeout(timeout);
          resolve(event.data);
        };
        worker.onerror = event => {
          clearTimeout(timeout);
          reject(new Error(event.message));
        };
        worker.postMessage(buffer, [buffer]);
      });
    }

    try {
      const rows = [];
      for (const decisions of [32, 32768]) {
        const values = Float64Array.from(
          { length: decisions * 3 }, (_, i) => Math.sin(i * 0.71) * 10
        );
        const main = [];
        const endToEnd = [];
        const post = [];

        for (let i = -5; i < 40; i++) {
          const buffer = values.slice().buffer;
          let start = performance.now();
          const expected = aimBatch(values);
          const mainMs = performance.now() - start;

          start = performance.now();
          const reply = askWorker(buffer);
          const postMs = performance.now() - start;
          const actual = await reply;
          const workerMs = performance.now() - start;
          if (Math.abs(expected - actual) > 1e-9) throw new Error('Worker result differs');

          if (i >= 0) {
            main.push(mainMs);
            endToEnd.push(workerMs);
            post.push(postMs);
          }
        }

        rows.push({
          decisions,
          mainP95Ms: p95(main),
          workerEndToEndP95Ms: p95(endToEnd),
          workerPostCallP95Ms: p95(post)
        });
      }
      return rows;
    } finally {
      worker.terminate();
      URL.revokeObjectURL(url);
    }
  });

  await writeFile('docs/lab07/worker-results.json', JSON.stringify({
    samplesPerSize: 40,
    transfer: 'Float64Array buffer',
    results
  }, null, 2) + '\n');
  console.table(results);
} finally {
  await browser.close();
}
