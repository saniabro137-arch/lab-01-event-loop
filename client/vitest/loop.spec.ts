import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLoop } from '../src/loop.ts';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) =>
    clearTimeout(id));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('Цикл гри', () => {
  it('переносить залишок часу між кадрами', () => {
    const simulate = vi.fn();
    const render = vi.fn();
    const loop = createLoop({ step: 0.01, simulate, render });
    loop.start();
    vi.advanceTimersByTime(32);
    expect(simulate.mock.calls).toEqual([[0.01], [0.01], [0.01]]);
    expect(render.mock.lastCall?.[0]).toBeCloseTo(0.2);
    loop.stop();
  });

  it('обмежує кількість кроків за кадр до 15', () => {
    const simulate = vi.fn();
    const render = vi.fn();
    const loop = createLoop({ step: 0.001, simulate, render });
    loop.start();
    vi.advanceTimersByTime(16);
    expect(simulate).toHaveBeenCalledTimes(15);
    expect(render.mock.lastCall?.[0]).toBe(0);
    loop.stop();
  });

  it('передає реальний час кадру в режимі variable', () => {
    const simulate = vi.fn();
    const loop = createLoop({ mode: 'variable', simulate, render: vi.fn() });
    loop.start();
    vi.advanceTimersByTime(16);
    expect(simulate).toHaveBeenCalledWith(0.016);
    loop.stop();
  });

  it('припиняє рендерити після stop', () => {
    const render = vi.fn();
    const loop = createLoop({ simulate: vi.fn(), render });
    loop.start();
    vi.advanceTimersByTime(16);
    loop.stop();
    vi.advanceTimersByTime(160);
    expect(render).toHaveBeenCalledOnce();
  });
});
