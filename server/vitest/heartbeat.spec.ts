import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHeartbeat } from '../src/heartbeat.ts';

const peer = (readyState = 1) => ({
  readyState, ping: vi.fn(), terminate: vi.fn()
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Heartbeat', () => {
  it('чекає до першого інтервалу', () => {
    const socket = peer();
    const heartbeat = startHeartbeat([socket], 100, 1);
    vi.advanceTimersByTime(99);
    expect(socket.ping).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(socket.ping).toHaveBeenCalledOnce();
    heartbeat.stop();
  });

  it('закриває з’єднання після двох пропущених pong', () => {
    const socket = peer();
    const heartbeat = startHeartbeat([socket], 100, 1);
    vi.advanceTimersByTime(200);
    expect(socket.ping).toHaveBeenCalledTimes(2);
    expect(socket.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(socket.terminate).toHaveBeenCalledOnce();
    heartbeat.stop();
  });

  it('скидає лічильник після pong', () => {
    const socket = peer();
    const heartbeat = startHeartbeat([socket], 100, 1);
    vi.advanceTimersByTime(200);
    heartbeat.pong(socket);
    vi.advanceTimersByTime(200);
    expect(socket.ping).toHaveBeenCalledTimes(4);
    expect(socket.terminate).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it('пропускає сокети, які не відкриті', () => {
    const socket = peer(0);
    const heartbeat = startHeartbeat([socket], 100, 1);
    vi.advanceTimersByTime(400);
    expect(socket.ping).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
    heartbeat.stop();
  });

  it('припиняє опитування після зупинки', () => {
    const socket = peer();
    const heartbeat = startHeartbeat([socket], 100, 1);
    heartbeat.stop();
    vi.advanceTimersByTime(400);
    expect(socket.ping).not.toHaveBeenCalled();
  });
});
