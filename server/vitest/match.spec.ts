import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { EntityIdSchema, SeqSchema } from 'space-flight-shared/types';
import { readConfig } from '../src/config.ts';
import { Match } from '../src/match.ts';

describe('Конфігурація сервера', () => {
  it.each([
    { raw: undefined, expected: 3000 },
    { raw: '1', expected: 1 },
    { raw: '80', expected: 80 },
    { raw: '3005', expected: 3005 },
    { raw: '65535', expected: 65535 },
    { raw: ' 4000 ', expected: 4000 }
  ])('читає PORT $raw як $expected', ({ raw, expected }) => {
    expect(readConfig({ PORT: raw }).port).toBe(expected);
  });

  it.each([
    '0', '-1', '65536', '3.5', 'NaN', 'Infinity', '', 'text'
  ])('відхиляє PORT %j поза допустимим діапазоном', raw => {
    expect(() => readConfig({ PORT: raw })).toThrow();
  });

  it.each([
    { raw: undefined, expected: './logs' },
    { raw: 'custom-logs', expected: 'custom-logs' }
  ])('визначає шлях до журналу $expected', ({ raw, expected }) => {
    expect(readConfig({ LOG_DIR: raw }).logDir).toBe(resolve(expected));
  });

  it.each(['', '   '])('відхиляє порожній LOG_DIR %j', raw => {
    expect(() => readConfig({ LOG_DIR: raw })).toThrow();
  });
});

const pilot = EntityIdSchema.parse(1);
const visitor = EntityIdSchema.parse(2);
const command = (seq: number) => ({
  seq: SeqSchema.parse(seq), thrust: true,
  left: false, right: false, fire: false
});

afterEach(() => vi.useRealTimers());

describe('Матч', () => {
  it('публікує знімок із підтвердженням команди', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const match = new Match(publish, 2026);
    match.addPlayer(pilot);
    expect(match.receiveInput(pilot, command(1))).toBe(true);
    match.start();
    vi.advanceTimersByTime(40);
    match.stop();

    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(pilot, expect.objectContaining({
      type: 'snapshot', tick: 1, lastProcessedSeq: 1
    }));
  });

  it('відхиляє дубль команди в черзі', () => {
    const match = new Match(vi.fn(), 2026);
    match.addPlayer(pilot);
    expect(match.receiveInput(pilot, command(1))).toBe(true);
    expect(match.receiveInput(pilot, command(1))).toBe(false);
  });

  it('відхиляє команду невідомого гравця', () => {
    const match = new Match(vi.fn(), 2026);
    match.addPlayer(pilot);
    expect(match.receiveInput(visitor, command(1))).toBe(false);
  });

  it('відхиляє seq, який виходить за вікно з 64 команд', () => {
    const match = new Match(vi.fn(), 2026);
    match.addPlayer(pilot);
    expect(match.receiveInput(pilot, command(64))).toBe(true);
    expect(match.receiveInput(pilot, command(65))).toBe(false);
  });

  it('обробляє команди за seq, навіть якщо вони прийшли не по порядку', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const match = new Match(publish, 2026);
    match.addPlayer(pilot);
    match.receiveInput(pilot, command(2));
    match.receiveInput(pilot, command(1));
    match.start();
    vi.advanceTimersByTime(70);
    match.stop();

    expect(publish).toHaveBeenNthCalledWith(1, pilot, expect.objectContaining({ lastProcessedSeq: 1 }));
    expect(publish).toHaveBeenNthCalledWith(2, pilot, expect.objectContaining({ lastProcessedSeq: 2 }));
    expect(match.receiveInput(pilot, command(1))).toBe(false);
  });

  it('зупиняє цикл після виходу останнього гравця', () => {
    vi.useFakeTimers();
    const publish = vi.fn();
    const match = new Match(publish, 2026);
    match.addPlayer(pilot);
    match.start();
    match.removePlayer(pilot);
    vi.advanceTimersByTime(100);
    expect(publish).not.toHaveBeenCalled();
  });
});
