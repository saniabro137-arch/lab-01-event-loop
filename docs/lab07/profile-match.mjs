import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { chromium } from '@playwright/test';

const label = process.argv[2] ?? 'before';
if (!['before', 'after', 'trace'].includes(label)) throw new Error('Use before, after or trace');

const baseURL = 'http://127.0.0.1:3078';
const room = 'profile-' + Date.now();

function summary(samples) {
  if (!samples.length) throw new Error('No samples recorded');
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = value =>
    Number(sorted[Math.ceil(sorted.length * value) - 1].toFixed(3));
  return {
    samples: sorted.length,
    p50Ms: percentile(0.50),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99)
  };
}

async function waitForServer(server) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Profiling server exited');
    const response = await fetch(baseURL + '/health').catch(() => undefined);
    if (response?.ok) return;
    await wait(100);
  }
  throw new Error('Server did not start on port 3078');
}

async function join(page, path, name) {
  await page.goto(baseURL + path);
  await page.locator('#name').fill(name);
  await page.locator('#room').fill(room);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await page.locator('#status').getByText('Підключено', { exact: true }).waitFor();
  for (const id of ['latency', 'jitter', 'drop']) {
    await page.locator('#' + id).fill('0');
  }
}

const server = spawn(process.execPath, [
  '--cpu-prof',
  '--cpu-prof-dir=.lab07-profiles',
  '--cpu-prof-name=server-' + label + '.cpuprofile',
  'server/src/index.ts'
], {
  env: { ...process.env, PORT: '3078', LOG_DIR: '.lab07-profiles/logs' },
  stdio: 'inherit'
});
const serverExited = new Promise(resolve => {
  server.once('exit', resolve);
  server.once('error', resolve);
});

let browser;
try {
  await waitForServer(server);
  browser = await chromium.launch({
    args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding']
  });

  const [binary, json] = await Promise.all([browser.newPage(), browser.newPage()]);
  await join(binary, label === 'trace' ? '/lab05.html?profile=1' : '/lab05.html', 'ProfilerA');
  await join(json, '/lab05.html?codec=json', 'ProfilerB');

  for (const page of [binary, json]) {
    await page.locator('#netgraph').getByText(/Кораблів 2/).waitFor();
  }

  await binary.locator('#arena').focus();
  await binary.keyboard.down('KeyW');
  await binary.keyboard.down('KeyD');
  await binary.keyboard.down('Space');
  await wait(3000);

  const cdp = await binary.context().newCDPSession(binary);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');

  const events = [];
  const tracing = label === 'trace';
  if (tracing) {
    cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value));
    await cdp.send('Tracing.start', {
      categories: 'devtools.timeline,blink.user_timing,v8,disabled-by-default-v8.gc',
      transferMode: 'ReportEvents'
    });
  }

  const frames = binary.evaluate(durationMs => new Promise(resolve => {
    const intervals = [];
    let previous;
    performance.clearMeasures('lab07-frame-work');
    performance.mark('lab07-start');
    function sample(now) {
      if (previous !== undefined) intervals.push(now - previous);
      previous = now;
      if (performance.now() < start + durationMs) requestAnimationFrame(sample);
      else {
        performance.mark('lab07-end');
        performance.measure('lab07-frame-sampling', 'lab07-start', 'lab07-end');
        resolve(intervals);
      }
    }
    const start = performance.now();
    requestAnimationFrame(sample);
  }), 15000);

  const ticks = new Map();
  const deadline = performance.now() + 15000;
  while (performance.now() < deadline) {
    const response = await fetch(baseURL + '/api/stats');
    if (!response.ok) throw new Error('Cannot read /api/stats');
    const active = (await response.json()).find(item => item.room === room);
    if (active) ticks.set(active.tick, active.durationMs);
    await wait(25);
  }

  const intervals = (await frames).filter(value => value > 0);
  let traceSummary;
  if (tracing) {
    const completed = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    await completed;

    const start = events.find(event => event.name === 'lab07-start');
    const end = events.find(event =>
      event.name === 'lab07-end' && event.pid === start?.pid && event.tid === start?.tid
    );
    const majorGC = start && end ? events.filter(event =>
      event.name === 'MajorGC' && event.ph === 'X' &&
      event.pid === start.pid && event.tid === start.tid &&
      event.ts >= start.ts && event.ts <= end.ts
    ).length : null;
    const work = await binary.evaluate(() =>
      performance.getEntriesByName('lab07-frame-work').map(entry => entry.duration)
    );

    traceSummary = { frameWork: summary(work), majorGC };
    await writeFile('.lab07-profiles/browser-trace.json', JSON.stringify({ traceEvents: events }));
    console.table({ frameWork: traceSummary.frameWork });
    console.log('MajorGC у потоці гри:', majorGC ?? 'маркери вимірювання не знайдено');
  }

  const { profile } = await cdp.send('Profiler.stop');
  await writeFile('.lab07-profiles/browser-' + label + '.cpuprofile', JSON.stringify(profile));

  const result = {
    scenario: '2 clients, Binary and JSON, player holds W + D + Space',
    durationSeconds: 15,
    frameInterval: summary(intervals),
    sampledServerTick: summary([...ticks.values()]),
    ...traceSummary
  };
  await writeFile('docs/lab07/' + label + '.json', JSON.stringify(result, null, 2) + '\n');
  console.table({ frameInterval: result.frameInterval, serverTick: result.sampledServerTick });
} finally {
  try {
    await browser?.close();
  } finally {
    server.kill('SIGTERM');
    await serverExited;
  }
}
