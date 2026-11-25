import { describe, expect, it } from 'vitest';
import { botInput } from '../sim/bot.ts';
import { EntityIdSchema, SeqSchema } from '../sim/types.ts';
import { World } from '../sim/world.ts';

const player = EntityIdSchema.parse(1);
const seq = SeqSchema.parse(9);
const ship = {
  ...new World(2026).spawn(player),
  x: 200, y: 200, angle: 0
};

describe('Команди бота', () => {
  it('без цілі зберігає seq та не натискає кнопки', () => {
    expect(botInput(ship, undefined, seq)).toEqual({
      seq, thrust: false, left: false, right: false, fire: false
    });
  });

  it('набирає хід і стріляє по цілі прямо попереду', () => {
    expect(botInput(ship, { x: 400, y: 200 }, seq)).toEqual({
      seq, thrust: true, left: false, right: false, fire: true
    });
  });

  it.each([
    { y: 100, left: true, right: false },
    { y: 300, left: false, right: true }
  ])('повертає у бік цілі з координатою y=$y', ({ y, left, right }) => {
    expect(botInput(ship, { x: 200, y }, seq)).toMatchObject({
      left, right, fire: false
    });
  });

  it('не стріляє по цілі за межами дальності', () => {
    expect(botInput(ship, { x: 800, y: 200 }, seq).fire).toBe(false);
  });

  it('обирає короткий поворот через межу ±π', () => {
    const heading = { ...ship, angle: Math.PI - 0.03 };
    expect(botInput(heading, { x: 100, y: 196 }, seq)).toMatchObject({
      left: false, right: false, fire: true
    });
  });
});
