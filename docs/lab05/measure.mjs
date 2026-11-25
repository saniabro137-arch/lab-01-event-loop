import { sample, stateHash } from '../../shared/test/fixtures.js';
import { encodeInput, decodeInput, encodeSnapshot, decodeSnapshot } from '../../shared/codec/index.js';

const snapshot = sample();
const input = {
  type: 'input',
  inputs: Array.from({ length: 8 }, (_, i) => ({ seq: 993 + i, buttons: i % 16 }))
};
const utf8 = new TextEncoder();
const text = new TextDecoder();
console.log('State hash:', stateHash(snapshot), '| Ships:', snapshot.ships.length,
  '| Bullets:', snapshot.bullets.length);
for (const [label, encode, decode, send] of [
  ['JSON', msg => utf8.encode(JSON.stringify(msg)), bytes => JSON.parse(text.decode(bytes)),
    msg => utf8.encode(JSON.stringify(msg))],
  ['Binary', encodeSnapshot, decodeSnapshot, encodeInput]
]) {
  for (let i = 0; i < 2000; i++) decode(encode(snapshot));
  const start = performance.now();
  for (let i = 0; i < 30000; i++) decode(encode(snapshot));
  const micros = (performance.now() - start) / 30;
  const down = encode(snapshot).byteLength;
  const up = send(input).byteLength;
  console.log(label, down, (down * 30 / 1000).toFixed(2),
    (up * 30 / 1000).toFixed(2), micros.toFixed(2));
}
console.log('Binary input round trip:', decodeInput(encodeInput(input)).inputs.length);
