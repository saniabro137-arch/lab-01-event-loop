import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { decodeSnapshot, encodeSnapshot } from '../codec/index.ts';
import { SnapshotSchema } from '../protocol/index.ts';
import { EntityIdSchema, SeqSchema } from '../sim/types.ts';
import { HEIGHT, WIDTH, World } from '../sim/world.ts';

const pilot = EntityIdSchema.parse(1);
const seed = fc.integer({ min: 0, max: 0xffffffff });
const commands = fc.array(fc.integer({ min: 0, max: 15 }), {
  minLength: 1,
  maxLength: 160
});

function simulate(initialSeed: number, masks: number[]) {
  const world = new World(initialSeed);
  world.spawn(pilot);

  for (const [index, mask] of masks.entries()) {
    world.step(new Map([[pilot, {
      seq: SeqSchema.parse(index + 1),
      thrust: Boolean(mask & 1),
      left: Boolean(mask & 2),
      right: Boolean(mask & 4),
      fire: Boolean(mask & 8)
    }]]));
  }

  return world.snapshot();
}

describe('Lab 07 — світ і знімки', () => {
  it('залишає корабель у межах арени для довільної серії команд', () => {
    fc.assert(fc.property(seed, commands, (initialSeed, masks) => {
      const ship = simulate(initialSeed, masks).ships[0];
      if (!ship) throw new Error('Missing pilot');
      expect(ship.x).toBeGreaterThanOrEqual(18);
      expect(ship.x).toBeLessThanOrEqual(WIDTH - 18);
      expect(ship.y).toBeGreaterThanOrEqual(18);
      expect(ship.y).toBeLessThanOrEqual(HEIGHT - 18);
    }));
  });

  it('відновлює знімок із точністю бінарного формату', () => {
    fc.assert(fc.property(seed, commands, (initialSeed, masks) => {
      const state = simulate(initialSeed, masks);
      const original = SnapshotSchema.parse({
        type: 'snapshot',
        ...state,
        time: 1800000000000,
        lastProcessedSeq: masks.length
      });
      const decoded = decodeSnapshot(encodeSnapshot(original));

      expect(decoded).toEqual({
        ...original,
        ships: original.ships.map(ship => ({
          ...ship,
          x: Math.fround(ship.x),
          y: Math.fround(ship.y),
          vx: Math.fround(ship.vx),
          vy: Math.fround(ship.vy),
          angle: Math.round(ship.angle * 1000) / 1000
        })),
        bullets: original.bullets.map(bullet => ({
          ...bullet,
          x: Math.fround(bullet.x),
          y: Math.fround(bullet.y),
          vx: Math.fround(bullet.vx),
          vy: Math.fround(bullet.vy)
        }))
      });
    }));
  });

  it('відхиляє випадкові байти або повертає валідний знімок', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 600 }), bytes => {
      let result: unknown;
      try {
        result = decodeSnapshot(bytes);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(Error);
        return;
      }
      expect(SnapshotSchema.safeParse(result).success).toBe(true);
    }), { numRuns: 300 });
  });
});
