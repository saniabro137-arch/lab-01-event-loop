import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { World } from '../sim/world.ts';
import { EntityIdSchema, SeqSchema } from '../sim/types.ts';
import type { CombatInput, EntityId } from '../sim/types.ts';
import { decodeInput, decodeSnapshot, encodeInput } from '../codec/index.ts';
import { InputMessageSchema, parseClientJSON, parseClientMessage } from '../protocol/index.ts';

interface BaselineState {
  spawn(id: number): unknown;
  step(inputs: Map<EntityId, CombatInput>): void;
  snapshot(): unknown;
}

void test('World matches Lab 05 on each of 1000 ticks', async () => {
  const read = (path: string) =>
    execFileSync('git', ['show', 'lab-05:' + path], { encoding: 'utf8' });
  const url = (source: string) =>
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64');

  const oldShip = url(read('shared/sim/ship.js'));
  const oldWorld = read('shared/sim/world.js').replace("'./ship.js'", "'" + oldShip + "'");
  const baseline: BaselineState = new (await import(url(oldWorld))).World(2026);
  const world = new World(2026);
  const ids = [1, 2, 3, 4].map(id => EntityIdSchema.parse(id));

  for (const id of ids) {
    baseline.spawn(id);
    world.spawn(id);
  }

  for (let tick = 1; tick <= 1000; tick++) {
    const inputs = new Map<EntityId, CombatInput>();
    for (const id of ids) {
      const left = (tick + id * 3) % 60 < 30;
      inputs.set(id, {
        seq: SeqSchema.parse(tick),
        thrust: (tick + id) % 13 !== 0,
        left,
        right: !left,
        fire: (tick + id) % 4 !== 0
      });
    }

    baseline.step(inputs);
    world.step(inputs);
    const state = world.snapshot();

    assert.deepEqual({
      tick: state.tick,
      ships: state.ships.map(({ kind: _kind, ...ship }) => ship),
      bullets: state.bullets.map(({ kind: _kind, ...bullet }) => bullet)
    }, baseline.snapshot(), 'Tick ' + tick);
  }
});

void test('JSON and DataView validate incoming packets', () => {
  assert.equal(parseClientJSON('{broken').success, false);
  assert.equal(parseClientMessage({ type: 'chat', text: '   ' }).success, false);

  const input = InputMessageSchema.parse({
    type: 'input',
    inputs: [{ seq: 1, buttons: 9 }]
  });
  const bytes = new Uint8Array(encodeInput(input));
  assert.deepEqual(decodeInput(bytes), input);
  assert.throws(() => decodeInput(bytes.slice(0, -1)));
  bytes[0] = 255;
  assert.throws(() => decodeInput(bytes));
  assert.throws(() => decodeSnapshot(new ArrayBuffer(0)));
});
