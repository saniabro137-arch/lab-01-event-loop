import { randomBytes } from 'node:crypto';
import { STEP_MS, World } from 'space-flight-shared/world';
import { SeqSchema } from 'space-flight-shared/types';
import type { CombatInput, EntityId, Seq } from 'space-flight-shared/types';
import type { SnapshotMessage } from 'space-flight-shared/protocol';

type Publish = (id: EntityId, snapshot: SnapshotMessage) => void;

export class Match {
  readonly seed: number;
  readonly players = new Map<EntityId, {
    lastProcessedSeq: Seq;
    pending: Map<Seq, CombatInput>;
  }>();
  stats = { tick: 0, durationMs: 0, jitterMs: 0 };
  private readonly world: World;
  private readonly publish: Publish;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private target = 0;

  constructor(publish: Publish, seed = randomBytes(4).readUInt32LE()) {
    this.seed = seed;
    this.world = new World(seed);
    this.publish = publish;
  }

  addPlayer(id: EntityId) {
    if (this.players.has(id)) return;
    this.players.set(id, { lastProcessedSeq: SeqSchema.parse(0), pending: new Map() });
    this.world.spawn(id);
  }

  removePlayer(id: EntityId) {
    this.players.delete(id);
    this.world.remove(id);
    if (!this.players.size) this.stop();
  }

  receiveInput(id: EntityId, input: CombatInput) {
    const player = this.players.get(id);
    if (!player) return false;

    const { seq, thrust, left, right, fire } = input;
    if (
      seq <= player.lastProcessedSeq ||
      seq > player.lastProcessedSeq + 64 ||
      player.pending.has(seq)
    ) {
      return false;
    }

    player.pending.set(seq, { seq, thrust, left, right, fire });
    return true;
  }

  start() {
    if (this.timer !== undefined || !this.players.size) return;
    this.target = performance.now() + STEP_MS;
    this.schedule();
  }

  stop() {
    clearTimeout(this.timer);
    this.timer = undefined;
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

    const inputs = new Map<EntityId, CombatInput>();
    for (const [id, player] of this.players) {
      if (!player.pending.size) continue;
      const seq = SeqSchema.parse(Math.min(...player.pending.keys()));
      const input = player.pending.get(seq);
      if (!input) continue;
      inputs.set(id, input);
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
    if (this.timer !== undefined) this.schedule();
  }
}
