interface Peer {
  readonly readyState: number;
  ping(): void;
  terminate(): void;
}

export function startHeartbeat<T extends Peer>(
  peers: Iterable<T>, intervalMs: number, openState: number
) {
  const missedPongs = new WeakMap<T, number>();

  const timer = setInterval(() => {
    for (const peer of peers) {
      if (peer.readyState !== openState) continue;
      const missed = missedPongs.get(peer) ?? 0;
      if (missed >= 2) peer.terminate();
      else {
        missedPongs.set(peer, missed + 1);
        peer.ping();
      }
    }
  }, intervalMs);

  return {
    pong(peer: T): void {
      missedPongs.set(peer, 0);
    },
    stop(): void {
      clearInterval(timer);
    }
  };
}
