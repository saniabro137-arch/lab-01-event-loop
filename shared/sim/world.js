import { createShip, integrate } from './ship.js';
import { THRUST, LEFT, RIGHT, FIRE } from '../protocol/index.js';
export { createShip, integrate, lerpAngle } from './ship.js';

export const STEP_MS = 1000 / 30;
export const WIDTH = 1000;
export const HEIGHT = 600;
export const SHOT_LIFE = 36;

export function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), seed | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function stepShip(ship, { seq, buttons }) {
  const moved = integrate(ship, {
    thrust: buttons & THRUST,
    left: Boolean(buttons & LEFT),
    right: Boolean(buttons & RIGHT)
  }, 1 / 30);
  const next = {
    ...ship, ...moved,
    x: clamp(moved.x, 18, WIDTH - 18),
    y: clamp(moved.y, 18, HEIGHT - 18),
    angle: Math.atan2(Math.sin(moved.angle), Math.cos(moved.angle)),
    cooldown: Math.max(0, ship.cooldown - 1)
  };
  let bullet;
  if ((buttons & FIRE) && !next.cooldown) {
    next.cooldown = 8;
    const dx = Math.cos(next.angle);
    const dy = Math.sin(next.angle);
    bullet = {
      owner: ship.id, seq, life: SHOT_LIFE,
      x: next.x + 20 * dx, y: next.y + 20 * dy,
      vx: dx * 580 + next.vx, vy: dy * 580 + next.vy
    };
  }
  return { ship: next, bullet };
}

export function stepBullet(bullet) {
  return {
    ...bullet, x: bullet.x + bullet.vx / 30,
    y: bullet.y + bullet.vy / 30, life: bullet.life - 1
  };
}

export class World {
  constructor(seed) {
    this.random = mulberry32(seed);
    this.ships = new Map();
    this.bullets = [];
  }

  spawn(id, score = 0) {
    const ship = {
      ...createShip(), id, score, hp: 3, cooldown: 0,
      x: 100 + this.random() * (WIDTH - 200),
      y: 100 + this.random() * (HEIGHT - 200),
      angle: this.random() * 2 * Math.PI - Math.PI
    };
    this.ships.set(id, ship);
  }

  remove(id) {
    this.ships.delete(id);
    this.bullets = this.bullets.filter(bullet => bullet.owner !== id);
  }

  step(inputs) {
    const shots = [];
    for (const [id, ship] of this.ships) {
      const input = inputs.get(id);
      const next = stepShip(ship, input ?? { seq: 0, buttons: 0 });
      this.ships.set(id, next.ship);
      if (next.bullet) shots.push(next.bullet);
    }

    this.bullets = this.bullets.map(stepBullet).concat(shots).filter(bullet => {
      if (!bullet.life || bullet.x < 0 || bullet.x > WIDTH ||
          bullet.y < 0 || bullet.y > HEIGHT) return false;

      for (const [id, ship] of this.ships) {
        if (id === bullet.owner || Math.hypot(bullet.x - ship.x, bullet.y - ship.y) >= 17) {
          continue;
        }
        if (--ship.hp === 0) {
          this.ships.get(bullet.owner).score++;
          this.spawn(id, ship.score);
        }
        return false;
      }
      return true;
    });
  }
}
