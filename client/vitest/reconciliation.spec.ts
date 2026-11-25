import { describe, expect, it } from 'vitest';
import { SnapshotSchema } from 'space-flight-shared/protocol';
import { EntityIdSchema, SeqSchema } from 'space-flight-shared/types';
import { combatStep, World } from 'space-flight-shared/world';
import { reconcileSnapshot } from '../src/lab5/reconciliation.ts';

const pilot = EntityIdSchema.parse(1);
const other = EntityIdSchema.parse(2);
const world = new World(2026);
const ship = world.spawn(pilot);
const snapshot = SnapshotSchema.parse({
  type: 'snapshot', ...world.snapshot(),
  lastProcessedSeq: 2, time: 1800000000000
});

const commands = [1, 2, 3].map(seq => ({
  seq: SeqSchema.parse(seq), thrust: true,
  left: false, right: false, fire: seq === 3
}));

describe('Звірка стану клієнта', () => {
  it('прибирає лише команди, підтверджені сервером', () => {
    const result = reconcileSnapshot(snapshot, pilot, commands, true);
    expect(result?.pending.map(input => input.seq)).toEqual([3]);
    expect(commands.map(input => input.seq)).toEqual([1, 2, 3]);
  });

  it('повторює непідтверджену команду і передбачає кулю', () => {
    const input = commands.at(-1);
    if (!input) throw new Error('Missing fixture');
    const expected = combatStep(ship, input);
    const result = reconcileSnapshot(snapshot, pilot, commands, true);
    expect(result?.ship).toEqual(expected.ship);
    expect(result?.bullets).toEqual([expected.bullet]);
  });

  it('показує серверний стан, коли передбачення вимкнено', () => {
    const result = reconcileSnapshot(snapshot, pilot, commands, false);
    expect(result?.ship).toEqual(ship);
    expect(result?.bullets).toEqual([]);
    expect(result?.pending.map(input => input.seq)).toEqual([3]);
  });

  it('пропускає знімок, у якому немає локального корабля', () => {
    expect(reconcileSnapshot(snapshot, other, commands, true)).toBeUndefined();
  });
});
