export const ARENA = Object.freeze({ width: 1000, height: 600 });
export function wrap(value: number, size: number) { return ((value % size) + size) % size; }
export function wrapShip<T extends { readonly x: number; readonly y: number }>(ship: T, arena = ARENA): T { return { ...ship, x: wrap(ship.x, arena.width), y: wrap(ship.y, arena.height) }; }
export function lerpWrapped(a: number, b: number, alpha: number, size: number) { let delta = b - a; if (delta > size / 2) delta -= size; if (delta < -size / 2) delta += size; return wrap(a + delta * alpha, size); }
