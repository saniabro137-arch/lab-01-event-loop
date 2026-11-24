import { ARENA } from '../sim/arena.js';
export function drawScene(ctx, ship, stars, time) {
  ctx.fillStyle = '#071224'; ctx.fillRect(0, 0, ARENA.width, ARENA.height);
  ctx.strokeStyle = 'rgba(94,146,204,.10)'; ctx.lineWidth = 1;
  for (let x = 0; x <= ARENA.width; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ARENA.height); ctx.stroke(); }
  for (let y = 0; y <= ARENA.height; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA.width, y); ctx.stroke(); }
  for (const star of stars) { ctx.globalAlpha = .35 + .45 * (1 + Math.sin(time / 750 + star.phase)) / 2; ctx.fillStyle = '#c6e7ff'; ctx.fillRect(star.x, star.y, star.size, star.size); }
  ctx.globalAlpha = 1;
  // Ghost copies make wrapping visually seamless near arena boundaries.
  for (const dx of [-ARENA.width, 0, ARENA.width]) for (const dy of [-ARENA.height, 0, ARENA.height]) drawShip(ctx, { ...ship, x: ship.x + dx, y: ship.y + dy });
}
export function drawShip(ctx, ship) {
  ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle);
  ctx.shadowColor = '#55d6ff'; ctx.shadowBlur = 17; ctx.strokeStyle = '#69e3ff'; ctx.fillStyle = '#123451'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(24, 0); ctx.lineTo(-16, -14); ctx.lineTo(-10, 0); ctx.lineTo(-16, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;
  if (ship.thrust) { ctx.fillStyle = '#ffad5c'; ctx.beginPath(); ctx.moveTo(-13, -7); ctx.lineTo(-27 - Math.random() * 12, 0); ctx.lineTo(-13, 7); ctx.fill(); }
  ctx.restore();
}
