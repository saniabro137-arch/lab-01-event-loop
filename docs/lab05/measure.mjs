import assert from 'node:assert/strict';
import { World } from 'space-flight-shared/world';
import {
  encodeInput, decodeInput, encodeSnapshot, decodeSnapshot
} from 'space-flight-shared/codec';

const world = new World(2026);
for (let id = 1; id <= 4; id++) world.spawn(id);

for (let seq = 1; seq <= 120; seq++) {
  const inputs = new Map();
  for (let id = 1; id <= 4; id++) {
    inputs.set(id, {
      seq, thrust: true, left: id % 2 === 0,
      right: id % 2 !== 0, fire: true
    });
  }
  world.step(inputs);
}

const snapshot = {
  type: 'snapshot', ...world.snapshot(),
  lastProcessedSeq: 118, time: 1800000000000
};
const input = {
  type: 'input',
  inputs: Array.from({ length: 8 }, (_, i) => ({
    seq: 113 + i, buttons: 1 | 8
  }))
};

const text = new TextEncoder();
const decoder = new TextDecoder();
const encodeJSON = value => text.encode(JSON.stringify(value));
const decodeJSON = bytes => JSON.parse(decoder.decode(bytes));

assert.deepEqual(decodeInput(encodeInput(input)), input);
const binary = decodeSnapshot(encodeSnapshot(snapshot));
assert.equal(binary.ships.length, 4);
assert.equal(binary.bullets.length, snapshot.bullets.length);
assert.equal(binary.lastProcessedSeq, snapshot.lastProcessedSeq);
binary.ships.forEach((ship, i) => {
  assert.ok(Math.abs(ship.angle - snapshot.ships[i].angle) <= 0.0005);
});

const rows = [];
for (const [codec, encode, decode, encodeCommand] of [
  ['JSON', encodeJSON, decodeJSON, encodeJSON],
  ['Binary', encodeSnapshot, decodeSnapshot, encodeInput]
]) {
  const snapshotBytes = encode(snapshot).byteLength;
  const inputBytes = encodeCommand(input).byteLength;

  for (let i = 0; i < 2000; i++) decode(encode(snapshot));
  const start = performance.now();
  for (let i = 0; i < 30000; i++) decode(encode(snapshot));

  rows.push({
    codec, snapshotBytes,
    downKBps: (snapshotBytes * 30 / 1000).toFixed(2),
    upKBps: (inputBytes * 30 / 1000).toFixed(2),
    encodeDecodeMicros: ((performance.now() - start) / 30).toFixed(2)
  });
}

console.log(`Кораблів: ${snapshot.ships.length}, активних куль: ${snapshot.bullets.length}`);
console.table(rows);
