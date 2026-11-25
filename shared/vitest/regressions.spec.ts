import { describe, expect, it } from 'vitest';
import { decodeSnapshot, encodeSnapshot } from '../codec/index.ts';
import { parseClientJSON, parseServerJSON, SnapshotSchema } from '../protocol/index.ts';
import { lerpAngle } from '../sim/ship.ts';
import { EntityIdSchema, SeqSchema } from '../sim/types.ts';
import { World } from '../sim/world.ts';

const first = EntityIdSchema.parse(1);
const second = EntityIdSchema.parse(2);

function duel() {
  const world = new World(2026);
  Object.assign(world.spawn(first), { x: 100, y: 300, angle: 0 });
  Object.assign(world.spawn(second), { x: 145, y: 300 });
  return world;
}

function step(world: World, tick: number, fire = false) {
  world.step(new Map([[first, {
    seq: SeqSchema.parse(tick),
    thrust: false,
    left: false,
    right: false,
    fire
  }]]));
}

describe('Зіткнення і респаун', () => {
  it('зменшує HP цілі після влучання і прибирає кулю', () => {
    const world = duel();
    step(world, 1, true);
    expect(world.snapshot().bullets).toHaveLength(1);
    step(world, 2);
    const state = world.snapshot();
    expect(state.ships.find(ship => ship.id === second)?.hp).toBe(2);
    expect(state.bullets).toHaveLength(0);
  });

  it('після третього влучання дає очко стрільцю й відновлює ціль', () => {
    const world = duel();
    for (let tick = 1; tick <= 18; tick++) {
      step(world, tick, tick === 1 || tick === 9 || tick === 17);
    }
    const state = world.snapshot();
    expect(state.ships.find(ship => ship.id === first)?.score).toBe(1);
    expect(state.ships.find(ship => ship.id === second)?.hp).toBe(3);
  });

  it('прибирає корабель і його кулі після виходу з матчу', () => {
    const world = duel();
    step(world, 1, true);
    world.remove(first);
    const state = world.snapshot();
    expect(state.ships.map(ship => ship.id)).toEqual([second]);
    expect(state.bullets).toHaveLength(0);
  });

  it('інтерполює кут коротким шляхом через межу ±π', () => {
    const midpoint = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(midpoint)).toBeCloseTo(Math.PI);
  });
});

describe('Межі протоколу', () => {
  it.each([
    '{"type":"join","name":"Pilot","room":"Alpha","codec":"binary"}',
    '{"type":"chat","text":"Привіт"}',
    '{"type":"leave"}',
    '{"type":"ping","sent":0}'
  ])('приймає валідне клієнтське повідомлення %s', text => {
    expect(parseClientJSON(text).success).toBe(true);
  });

  it.each([
    '{broken',
    'null',
    '{"type":"unknown"}',
    '{"type":"chat","text":"   "}',
    '{"type":"join","name":"Pilot","room":"bad room"}',
    '{"type":"ping","sent":-1}',
    '{"type":"input","inputs":[{"seq":1,"buttons":0},{"seq":1,"buttons":0}]}'
  ])('відхиляє некоректне клієнтське повідомлення %s', text => {
    expect(parseClientJSON(text).success).toBe(false);
  });

  it('перевіряє серверні повідомлення обох видів', () => {
    expect(parseServerJSON('{"type":"pong","sent":0,"time":1000}').success).toBe(true);
    expect(parseServerJSON('{"type":"pong","sent":"0","time":1000}').success).toBe(false);
    expect(parseServerJSON('{broken').success).toBe(false);
  });

  it('відхиляє знімок із недопустимим прапорцем тяги', () => {
    const original = SnapshotSchema.parse({
      type: 'snapshot',
      ...duel().snapshot(),
      lastProcessedSeq: 0,
      time: 1800000000000
    });
    const wire = encodeSnapshot(original);
    const bytes = new DataView(wire);
    const firstShipOffset = 20;
    const thrustOffset = 20;
    bytes.setUint8(firstShipOffset + thrustOffset, 2);
    expect(() => decodeSnapshot(wire)).toThrow(/thrust/i);
  });
});
