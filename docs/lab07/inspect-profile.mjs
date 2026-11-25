import { readFile } from 'node:fs/promises';

const paths = process.argv.slice(2);
if (!paths.length) throw new Error('Pass at least one .cpuprofile path');

for (const path of paths) {
  const profile = JSON.parse(await readFile(path, 'utf8'));
  const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
  const functions = new Map();
  let sampledUs = 0;
  let idleUs = 0;
  let gcUs = 0;

  for (const [index, id] of (profile.samples ?? []).entries()) {
    const frame = nodes.get(id);
    const duration = profile.timeDeltas?.[index];
    if (!frame || !Number.isFinite(duration) || duration <= 0) continue;

    sampledUs += duration;
    const name = frame.functionName || '(anonymous)';

    if (name === '(idle)') {
      idleUs += duration;
      continue;
    }
    if (name === '(garbage collector)') {
      gcUs += duration;
      continue;
    }

    const url = frame.url;
    if (!url) continue;
    const file = url.replace(/^(?:file:\/\/)?[^]*?\/node_modules\//, 'node_modules/')
      .replace(/^(?:file:\/\/)?[^]*?\/(client|server|shared)\//, '$1/')
      .replace(/^https?:\/\/[^/]+/, '');
    const line = frame.lineNumber >= 0 ? frame.lineNumber + 1 : 0;
    const key = name + ' — ' + file + ':' + line;
    functions.set(key, (functions.get(key) ?? 0) + duration);
  }

  console.log('\n' + path);
  console.table({
    sampledMs: Number((sampledUs / 1000).toFixed(2)),
    idleMs: Number((idleUs / 1000).toFixed(2)),
    gcSampledMs: Number((gcUs / 1000).toFixed(2))
  });
  console.table([...functions.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([location, us]) => ({
      location,
      selfMs: Number((us / 1000).toFixed(2))
    })));
}
