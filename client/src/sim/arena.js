export const ARENA = Object.freeze({ width: 1000, height: 600 });
export function wrap(value, size) { return ((value % size) + size) % size; }
export function wrapShip(ship, arena = ARENA) { return { ...ship, x: wrap(ship.x, arena.width), y: wrap(ship.y, arena.height) }; }
export function lerpWrapped(a, b, alpha, size) { let delta = b - a; if (delta > size / 2) delta -= size; if (delta < -size / 2) delta += size; return wrap(a + delta * alpha, size); }
