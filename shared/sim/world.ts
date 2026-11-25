import { createShip, integrate } from './ship.ts';
import type { FlightInput } from './ship.ts';
import { TickSchema } from './types.ts';
import type {
  BulletSnapshot, CombatInput, EntityId, ShipSnapshot, WorldSnapshot
} from './types.ts';

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const STEP_MS = 1000 / TICK_RATE;
export const WIDTH = 1000;
export const HEIGHT = 600;

export function mulberry32(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const idle = { thrust: false, left: false, right: false };
const clamp = (value: number, max: number) => Math.max(18, Math.min(max - 18, value));

export function stepShip(ship: ShipSnapshot, input: FlightInput = idle): ShipSnapshot {
  const moved = integrate(ship, input, DT);

  return {
    ...ship,
    ...moved,
    x: clamp(moved.x, WIDTH),
    y: clamp(moved.y, HEIGHT),
    angle: Math.atan2(Math.sin(moved.angle), Math.cos(moved.angle))
  };
}

export function combatStep(
  ship: ShipSnapshot,
  input?: CombatInput
): { ship: ShipSnapshot; bullet?: BulletSnapshot } {
  const next = stepShip(ship, input);
  next.cooldown = Math.max(0, ship.cooldown - 1);
  if (!input?.fire || next.cooldown > 0) return { ship: next };

  next.cooldown = 8;
  const dx = Math.cos(next.angle);
  const dy = Math.sin(next.angle);
  return {
    ship: next,
    bullet: {
      kind: 'bullet', owner: ship.id, seq: input.seq, life: 36,
      x: next.x + 20 * dx, y: next.y + 20 * dy,
      vx: next.vx + 580 * dx, vy: next.vy + 580 * dy
    }
  };
}

export function advanceBullets(bullets: readonly BulletSnapshot[], shot?: BulletSnapshot): BulletSnapshot[] {
  const moved = bullets.map(bullet => ({
    ...bullet,
    x: bullet.x + bullet.vx * DT,
    y: bullet.y + bullet.vy * DT,
    life: bullet.life - 1
  }));
  if (shot) moved.push(shot);
  return moved.filter(bullet => bullet.life > 0 &&
    bullet.x >= 0 && bullet.x <= WIDTH &&
    bullet.y >= 0 && bullet.y <= HEIGHT);
}

export class World {
  private readonly random: () => number;
  private tick = 0;
  private readonly ships = new Map<EntityId, ShipSnapshot>();
  private bullets: BulletSnapshot[] = [];

  constructor(seed: number) {
    this.random = mulberry32(seed);
  }

  spawn(id: EntityId, score = 0): ShipSnapshot {
    const ship: ShipSnapshot = {
      ...createShip(),
      kind: 'ship', id, score, hp: 3, cooldown: 0,
      x: 100 + this.random() * (WIDTH - 200),
      y: 100 + this.random() * (HEIGHT - 200),
      angle: this.random() * 2 * Math.PI - Math.PI
    };

    this.ships.set(id, ship);
    return ship;
  }

  remove(id: EntityId): void {
    this.ships.delete(id);
    this.bullets = this.bullets.filter(bullet => bullet.owner !== id);
  }

  step(inputs: ReadonlyMap<EntityId, CombatInput>): void {
    const shots: BulletSnapshot[] = [];
    for (const [id, ship] of this.ships) {
      const next = combatStep(ship, inputs.get(id));
      this.ships.set(id, next.ship);
      if (next.bullet) shots.push(next.bullet);
    }

    this.bullets = advanceBullets(this.bullets).concat(shots.filter(shot =>
      shot.x >= 0 && shot.x <= WIDTH && shot.y >= 0 && shot.y <= HEIGHT
    )).filter(bullet => {
      for (const [id, ship] of this.ships) {
        if (id === bullet.owner || Math.hypot(bullet.x - ship.x, bullet.y - ship.y) >= 17) continue;
        if (--ship.hp === 0) {
          const owner = this.ships.get(bullet.owner);
          if (!owner) throw new Error('Bullet owner is missing from the world');
          owner.score++;
          this.spawn(id, ship.score);
        }
        return false;
      }
      return true;
    });
    this.tick++;
  }

  snapshot(): WorldSnapshot {
    return {
      tick: TickSchema.parse(this.tick),
      bullets: this.bullets.map(bullet => ({ ...bullet })),
      ships: [...this.ships.values()].map(ship => ({ ...ship }))
    };
  }
}
