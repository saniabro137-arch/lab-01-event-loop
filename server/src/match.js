import { randomBytes } from 'node:crypto';
import { STEP_MS, World } from 'space-flight-shared/sim';
import { MAX_PLAYERS } from 'space-flight-shared/protocol';
import { encodeSnapshot } from 'space-flight-shared/codec';

export class Match {
  constructor() {
    this.seed = randomBytes(4).readUInt32LE();
    this.world = new World(this.seed);
    this.players = new Map();
    this.tick = 0;
    this.stats = { tick: 0, durationMs: 0, jitterMs: 0 };
  }

  join(socket, codec) {
    if (this.players.size >= MAX_PLAYERS) return null;
    let id = 1;
    while ([...this.players.values()].some(player => player.id === id)) id++;
    this.players.set(socket, { id, codec, seq: 0, queue: new Map(), readyAt: null });
    this.world.spawn(id);
    if (this.players.size === 1) {
      this.target = performance.now() + STEP_MS;
      this.schedule();
    }
    return { id, seed: this.seed };
  }

  leave(socket) {
    const player = this.players.get(socket);
    if (!player) return;
    this.players.delete(socket);
    this.world.remove(player.id);
    if (!this.players.size) clearTimeout(this.timer);
  }

  receive(socket, inputs) {
    const player = this.players.get(socket);
    if (!player) return;
    for (const { seq, buttons } of inputs) {
      if (seq > player.seq && seq <= player.seq + 64 && !player.queue.has(seq)) {
        player.queue.set(seq, { seq, buttons });
        player.readyAt ??= this.tick + 3;
      }
    }
  }

  schedule() {
    this.timer = setTimeout(() => this.step(), Math.max(0, this.target - performance.now()));
  }

  step() {
    const start = performance.now();
    if (start < this.target) return this.schedule();
    this.tick++;
    const inputs = new Map();
    for (const player of this.players.values()) {
      if (player.readyAt === null || this.tick < player.readyAt || !player.queue.size) continue;
      const seq = Math.min(...player.queue.keys());
      inputs.set(player.id, player.queue.get(seq));
      player.queue.delete(seq);
      player.seq = seq;
    }
    this.world.step(inputs);
    const snapshot = {
      type: 'snapshot', tick: this.tick, time: Date.now(),
      ships: [...this.world.ships.values()], bullets: this.world.bullets
    };
    for (const [socket, player] of this.players) {
      if (socket.readyState !== 1 || socket.bufferedAmount >= 65536) continue;
      const message = { ...snapshot, lastProcessedSeq: player.seq };
      socket.send(player.codec === 'json' ? JSON.stringify(message) : encodeSnapshot(message));
    }
    this.stats = {
      tick: this.tick, durationMs: performance.now() - start,
      jitterMs: start - this.target
    };
    this.target += STEP_MS;
    // Bound catch-up after a long event-loop stall.
    if (this.target < start - 4 * STEP_MS) this.target = start + STEP_MS;
    this.schedule();
  }
}
