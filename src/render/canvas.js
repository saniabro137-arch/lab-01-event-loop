import { ARENA } from '../sim/arena.js';
export function createCanvas(canvas) {
  const ctx = canvas.getContext('2d');
  let width = 1, height = 1, dpr = 1;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width); height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / ARENA.width, 0, 0, canvas.height / ARENA.height, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();
  return { ctx, resize, dispose: () => window.removeEventListener('resize', resize) };
}
