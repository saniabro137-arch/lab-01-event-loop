import { ARENA } from '../sim/arena.ts';
export function createCanvas(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  const ctx: CanvasRenderingContext2D = context;
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
