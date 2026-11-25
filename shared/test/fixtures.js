import { World } from '../sim/world.js';

export function sample() {
  const world = new World(2026);
  for (let id = 1; id <= 4; id++) world.spawn(id);
  for (let seq = 1; seq <= 1000; seq++) {
    const inputs = new Map();
    for (let id = 1; id <= 4; id++) {
      inputs.set(id, { seq, buttons: 1 | (Math.floor(seq / (15 + id)) % 2 ? 2 : 4) |
        (seq % 43 < 25 ? 8 : 0) });
    }
    world.step(inputs);
  }
  return {
    type: 'snapshot', tick: 1000, lastProcessedSeq: 998, time: 1800000000000,
    ships: [...world.ships.values()], bullets: world.bullets
  };
}

export function stateHash(snapshot) {
  // Round coordinates before hashing to ignore last-bit differences in trig implementations.
  const text = JSON.stringify(snapshot, (_key, value) =>
    typeof value === 'number' && !Number.isInteger(value) ? Number(value.toFixed(7)) : value
  );
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
