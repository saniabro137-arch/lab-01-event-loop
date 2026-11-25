import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeInput, decodeSnapshot, encodeInput, encodeSnapshot } from '../codec/index.js';
import { validInputs } from '../protocol/index.js';
import { sample, stateHash } from './fixtures.js';

test('seeded simulation produces the same state over 1,000 ticks', () => {
  assert.equal(stateHash(sample()), stateHash(sample()));
});

test('input round trip checks little-endian, version, length and button mask', () => {
  const input = { type: 'input', inputs: [{ seq: 0x01020304, buttons: 9 }] };
  const bytes = new Uint8Array(encodeInput(input));
  assert.deepEqual([...bytes], [1, 1, 1, 4, 3, 2, 1, 9]);
  const padded = new Uint8Array([0, ...bytes, 0]);
  assert.deepEqual(decodeInput(padded.subarray(1, -1)), input);
  assert.throws(() => decodeInput(bytes.subarray(0, -1)));
  bytes[7] = 255;
  assert.throws(() => decodeInput(bytes));
  bytes[0]++;
  assert.throws(() => decodeInput(bytes));
  assert.equal(validInputs({ inputs: [{ seq: 2, buttons: 1 }, { seq: 1, buttons: 2 }] }), false);
});

test('snapshot round trip preserves state within wire precision', () => {
  const snapshot = sample();
  // Ensure the test exercises bullet records even if the fixture has no surviving bullet.
  snapshot.bullets.push({ owner: 1, seq: 997, x: 83.13, y: 76, vx: 128, vy: 23, life: 14 });
  const decoded = decodeSnapshot(encodeSnapshot(snapshot));
  for (const field of ['type', 'tick', 'time', 'lastProcessedSeq']) {
    assert.equal(decoded[field], snapshot[field]);
  }
  for (const field of ['ships', 'bullets']) {
    assert.equal(decoded[field].length, snapshot[field].length);
    for (const [i, record] of snapshot[field].entries()) {
      for (const [key, value] of Object.entries(record)) {
        const wire = decoded[field][i][key];
        if (key === 'angle') assert.ok(Math.abs(wire - value) <= 0.0005);
        else if (['x', 'y', 'vx', 'vy'].includes(key)) assert.equal(wire, Math.fround(value));
        else assert.equal(wire, value);
      }
    }
  }
  assert.throws(() => decodeSnapshot(encodeSnapshot(snapshot).slice(0, -1)));
});
