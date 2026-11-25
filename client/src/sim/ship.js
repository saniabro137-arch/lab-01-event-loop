export function createShip() { return { x: 500, y: 300, vx: 0, vy: 0, angle: -Math.PI / 2, thrust: false }; }
const ACCEL = 260;
const TURN = 3.4;
const DRAG = 0.38;
const MAX_SPEED = 440;
// Pure: returns a new object; no DOM, canvas or timers.
export function integrate(ship, input, dt) {
  const turn = Number(input.right) - Number(input.left);
  const angle = ship.angle + turn * TURN * dt;
  const thrust = Boolean(input.thrust);
  let vx = ship.vx + (thrust ? Math.cos(angle) * ACCEL * dt : 0);
  let vy = ship.vy + (thrust ? Math.sin(angle) * ACCEL * dt : 0);
  const drag = Math.exp(-(input.brake ? 4 : DRAG) * dt);
  vx *= drag; vy *= drag;
  const speed = Math.hypot(vx, vy);
  if (speed > MAX_SPEED) { vx *= MAX_SPEED / speed; vy *= MAX_SPEED / speed; }
  return { x: ship.x + vx * dt, y: ship.y + vy * dt, vx, vy, angle, thrust };
}
export function lerpAngle(a, b, alpha) { const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + delta * alpha; }
