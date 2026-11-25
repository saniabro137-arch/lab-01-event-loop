import { readFile, writeFile } from 'node:fs/promises';

const [input, output, title] = process.argv.slice(2);
if (!input || !output || !title) {
  throw new Error('Usage: node flame-chart.mjs input.cpuprofile output.svg title');
}

const profile = JSON.parse(await readFile(input, 'utf8'));
const nodes = new Map(profile.nodes.map(node => [node.id, node]));
const parents = new Map();
for (const node of profile.nodes) {
  for (const child of node.children ?? []) parents.set(child, node.id);
}

let elapsed = 0;
const samples = [];
for (const [index, id] of (profile.samples ?? []).entries()) {
  const duration = profile.timeDeltas?.[index];
  if (!Number.isFinite(duration) || duration <= 0) continue;
  const stack = [];
  for (let current = id; nodes.has(current); current = parents.get(current)) {
    const name = nodes.get(current).callFrame.functionName || '(anonymous)';
    if (name !== '(root)') stack.unshift(name);
  }
  samples.push({ start: elapsed, end: elapsed + duration, stack });
  elapsed += duration;
}
if (!samples.length) throw new Error('No samples in ' + input);

const windowUs = Math.min(250000, elapsed);
const buckets = new Map();
for (const sample of samples) {
  const leaf = sample.stack.at(-1);
  if (!leaf || leaf === '(idle)' || leaf === '(program)') continue;
  const bucket = Math.floor(sample.start / windowUs);
  buckets.set(bucket, (buckets.get(bucket) ?? 0) + sample.end - sample.start);
}

const busiest = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
const start = busiest * windowUs;
const end = Math.min(elapsed, start + windowUs);
const escape = value => String(value).replace(/[&<>"]/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]
);
const colors = ['#ffe0a1', '#ffc477', '#ffae72', '#f48e76', '#ed7590', '#e3a8dc'];
const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="360" viewBox="0 0 1000 360">',
  '<rect width="1000" height="360" fill="#fff"/>',
  '<g font-family="sans-serif" fill="#17202a">',
  '<text x="20" y="30" font-size="19">' + escape(title) + '</text>',
  '<text x="20" y="52" font-size="12">CPU stack samples · ' +
    (start / 1000).toFixed(1) + '–' + (end / 1000).toFixed(1) + ' ms from profile start</text>'
];

for (const sample of samples) {
  if (sample.end <= start || sample.start >= end) continue;
  const x = 20 + (Math.max(start, sample.start) - start) * 960 / (end - start);
  const width = (Math.min(end, sample.end) - Math.max(start, sample.start)) * 960 / (end - start);
  for (const [level, name] of sample.stack.slice(0, 14).entries()) {
    const y = 324 - level * 18;
    const fill = name === '(idle)' ? '#e3e7ec' : colors[level % colors.length];
    svg.push('<rect x="' + x.toFixed(2) + '" y="' + y +
      '" width="' + width.toFixed(2) + '" height="16" fill="' + fill +
      '"><title>' + escape(name) + '</title></rect>');
    if (width > 70) {
      svg.push('<text x="' + (x + 3).toFixed(2) + '" y="' + (y + 12) +
        '" font-size="10">' + escape(name.slice(0, Math.floor(width / 7))) + '</text>');
    }
  }
}
svg.push('</g></svg>');
await writeFile(output, svg.join('\n') + '\n');
