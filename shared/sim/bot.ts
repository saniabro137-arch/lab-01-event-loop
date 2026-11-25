import type { Vector2 } from './ship.ts';
import type { CombatInput, Seq, ShipSnapshot } from './types.ts';

export function botInput(
  ship: ShipSnapshot,
  target: Vector2 | undefined,
  seq: Seq
): CombatInput {
  if (!target) {
    return { seq, thrust: false, left: false, right: false, fire: false };
  }

  const dx = target.x - ship.x;
  const dy = target.y - ship.y;
  const distance = Math.hypot(dx, dy);
  const difference = Math.atan2(dy, dx) - ship.angle;
  const turn = Math.atan2(Math.sin(difference), Math.cos(difference));

  return {
    seq,
    thrust: distance > 100 && Math.abs(turn) < Math.PI / 3,
    left: turn < -0.08,
    right: turn > 0.08,
    fire: distance > 0 && distance <= 480 && Math.abs(turn) < 0.12
  };
}
