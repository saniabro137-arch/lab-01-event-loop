import { randomBytes } from 'node:crypto';
import { STEP_MS, World } from 'space-flight-shared/world';

export class Match {
  constructor(publish, seed = randomBytes(4).readUInt32LE()) {
    this.seed = seed;
    this.world = new World(seed);
    this.players = new Map();
    this.publish = publish;
    this.timer = null;
    this.stats = { tick: 0, durationMs: 0, jitterMs: 0 };
  }

  addPlayer(id) {
    if (this.players.has(id)) return;
    this.players.set(id, { lastProcessedSeq: 0, pending: new Map() });
    this.world.spawn(id);
  }

  removePlayer(id) {
    this.players.delete(id);
    this.world.remove(id);
    if (!this.players.size) this.stop();
  }

  receiveInput(id, input) {
    const player = this.players.get(id);
    if (!player || !input) return false;

    const { seq, thrust, left, right, fire } = input;
    if (
      !Number.isInteger(seq) ||
      seq <= player.lastProcessedSeq ||
      seq > player.lastProcessedSeq + 64 ||
      player.pending.has(seq) ||
      ![thrust, left, right, fire].every(value => typeof value === 'boolean')
    ) {
      return false;
    }

    player.pending.set(seq, { seq, thrust, left, right, fire });
    return true;
  }

  start() {
    if (this.timer !== null || !this.players.size) return;
    this.target = performance.now() + STEP_MS;
    this.schedule();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  schedule() {
    const delay = Math.max(0, Math.ceil(this.target - performance.now()));
    this.timer = setTimeout(() => this.step(), delay);
  }

  step() {
    const started = performance.now();
    if (started < this.target) {
      this.schedule();
      return;
    }

    const inputs = new Map();
    for (const [id, player] of this.players) {
      if (!player.pending.size) continue;
      const seq = Math.min(...player.pending.keys());
      inputs.set(id, player.pending.get(seq));
      player.pending.delete(seq);
      player.lastProcessedSeq = seq;
    }

    this.world.step(inputs);
    const snapshot = this.world.snapshot();

    for (const [id, player] of this.players) {
      this.publish(id, {
        type: 'snapshot',
        time: Date.now(),
        ...snapshot,
        lastProcessedSeq: player.lastProcessedSeq
      });
    }

    this.stats = {
      tick: snapshot.tick,
      durationMs: performance.now() - started,
      jitterMs: started - this.target
    };

    this.target += STEP_MS;
    if (this.target < started - 4 * STEP_MS) {
      this.target = started + STEP_MS;
    }
    if (this.timer !== null) this.schedule();
  }
}
