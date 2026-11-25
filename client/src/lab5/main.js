import { socket } from '../lab4/main.js';
import { decodeSnapshot, encodeInput } from 'space-flight-shared/codec';
import { FIRE, LEFT, MAX_BATCH, RIGHT, THRUST } from 'space-flight-shared/protocol';
import { HEIGHT, STEP_MS, WIDTH, lerpAngle, stepBullet, stepShip } from 'space-flight-shared/sim';

const $ = id => document.getElementById(id);
const canvas = $('arena');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const json = params.get('codec') === 'json';
const encoder = new TextEncoder();
const controls = {
  KeyW: THRUST, ArrowUp: THRUST, KeyA: LEFT, ArrowLeft: LEFT,
  KeyD: RIGHT, ArrowRight: RIGHT, Space: FIRE
};
const keys = new Set();
const byteLength = frame => typeof frame === 'string' ? encoder.encode(frame).length : frame.byteLength;

for (const [id, value] of Object.entries({ latency: 0, jitter: 0, drop: 0, interpolation: 120 })) {
  $(id).value = params.get(id) ?? value;
}
$('prediction').checked = params.get('prediction') !== '0';
const setting = id => Math.min(Number($(id).max), Math.max(0, Number($(id).value) || 0));

let game;
let bytesIn = 0;
let bytesOut = 0;
let measuredAt = performance.now();
let lastFrame = measuredAt;
let nextInput = measuredAt;

function impair(session, deliver) {
  if (Math.random() * 100 < setting('drop')) return;
  const lag = setting('latency') + (Math.random() * 2 - 1) * setting('jitter');
  const send = () => {
    if (game === session && socket.joined) deliver();
  };
  if (lag <= 0) send();
  else setTimeout(send, lag);
}

function send(frame) {
  impair(game, () => {
    if (socket.sendFrame(frame)) bytesOut += byteLength(frame);
  });
}

window.addEventListener('keydown', event => {
  if (!controls[event.code] || /^(INPUT|BUTTON)$/.test(event.target.tagName)) return;
  event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

socket.addEventListener('status', () => {
  if (!socket.joined) {
    game = undefined;
    keys.clear();
  }
});

function advance(ship, bullets, input) {
  const next = stepShip(ship, input);
  const moved = bullets.map(stepBullet).filter(bullet => bullet.life &&
    bullet.x >= 0 && bullet.x <= WIDTH && bullet.y >= 0 && bullet.y <= HEIGHT);
  if (next.bullet && next.bullet.x >= 0 && next.bullet.x <= WIDTH &&
      next.bullet.y >= 0 && next.bullet.y <= HEIGHT) moved.push(next.bullet);
  return [next.ship, moved];
}

function reconcile(snapshot) {
  const previous = game.snapshots.at(-1);
  if (previous && snapshot.tick <= previous.tick) return;
  const ship = snapshot.ships.find(ship => ship.id === game.id);
  if (!ship) return;
  game.snapshots.push(snapshot);
  if (game.snapshots.length > 48) game.snapshots.shift();
  game.arrived = performance.now();
  game.offset ??= snapshot.time - Date.now();
  game.pending = game.pending.filter(input => input.seq > snapshot.lastProcessedSeq);
  const before = game.ship;
  rebuild(snapshot);
  if (before && $('prediction').checked) {
    const dx = before.x - game.ship.x;
    const dy = before.y - game.ship.y;
    game.correction = Math.hypot(dx, dy);
    game.maxCorrection = Math.max(game.maxCorrection, game.correction);
    game.dx += dx;
    game.dy += dy;
    game.smoothing = 100;
  }
}

function rebuild(snapshot) {
  game.ship = snapshot.ships.find(ship => ship.id === game.id);
  game.bullets = snapshot.bullets.filter(bullet => bullet.owner === game.id);
  if ($('prediction').checked) {
    for (const input of game.pending) {
      [game.ship, game.bullets] = advance(game.ship, game.bullets, input);
    }
  }
}

$('prediction').onchange = () => {
  const snapshot = game?.snapshots.at(-1);
  if (!snapshot) return;
  rebuild(snapshot);
  Object.assign(game, { dx: 0, dy: 0, smoothing: 0, correction: 0, maxCorrection: 0 });
};

socket.addEventListener('received', event => {
  bytesIn += byteLength(event.detail);
});

socket.addEventListener('message', ({ detail }) => {
  if (detail.type === 'joined' && detail.game) {
    game = {
      ...detail.game, seq: 0, pending: [], snapshots: [], bullets: [],
      dx: 0, dy: 0, smoothing: 0, correction: 0, maxCorrection: 0,
      rtt: null, bestRtt: Infinity, lastPing: -Infinity
    };
    nextInput = performance.now();
    canvas.focus();
    return;
  }
  if (!game) return;
  if (detail instanceof ArrayBuffer || detail.type === 'snapshot') {
    impair(game, () => reconcile(detail instanceof ArrayBuffer ? decodeSnapshot(detail) : detail));
  } else if (detail.type === 'pong') {
    impair(game, () => {
      game.rtt = Date.now() - detail.sent;
      if (game.rtt < game.bestRtt) {
        game.bestRtt = game.rtt;
        game.offset = detail.time - (detail.sent + game.rtt / 2);
      }
    });
  }
});

function tick() {
  if (!game.ship) return;
  // Bound the pending window while the connection is stalled.
  if (game.pending.length < 64) {
    const buttons = [...keys].reduce((mask, key) => mask | controls[key], 0);
    const input = { seq: ++game.seq, buttons };
    game.pending.push(input);
    if ($('prediction').checked) {
      [game.ship, game.bullets] = advance(game.ship, game.bullets, input);
    }
  }
  const recent = game.pending.slice(-MAX_BATCH);
  if (!recent.length) return;
  const msg = { type: 'input', inputs: recent };
  send(json ? JSON.stringify(msg) : encodeInput(msg));
}

function interpolate(a, b, alpha) {
  return {
    ...a, x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha,
    angle: a.angle === undefined ? undefined : lerpAngle(a.angle, b.angle, alpha)
  };
}

function remoteEntities(time, field, key, owned) {
  const frames = game.snapshots;
  const i = frames.findIndex(frame => frame.time > time);
  if (i <= 0) return (i === 0 ? frames[0] : frames.at(-1))[field].filter(entity => !owned(entity));
  const a = frames[i - 1];
  const b = frames[i];
  const ratio = (time - a.time) / (b.time - a.time);
  const next = new Map(b[field].map(entity => [key(entity), entity]));
  return a[field].filter(entity => !owned(entity)).map(entity => {
    const target = next.get(key(entity));
    return target ? interpolate(entity, target, ratio) : entity;
  });
}

function drawShip(ship, own) {
  const x = ship.x + (own ? game.dx : 0);
  const y = ship.y + (own ? game.dy : 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ship.angle);
  ctx.strokeStyle = own ? '#63e8ff' : '#fba670';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-13, 12);
  ctx.lineTo(-8, 0);
  ctx.lineTo(-13, -12);
  ctx.closePath();
  ctx.stroke();
  if (ship.thrust) {
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.lineTo(-24, 0);
    ctx.lineTo(-13, 4);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#d5e9ff';
  ctx.font = '15px monospace';
  ctx.fillText(`#${ship.id} · HP ${ship.hp} · ${ship.score}`, x - 40, y - 25);
}

function render(now) {
  const elapsed = now - lastFrame;
  lastFrame = now;
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#294563';
  for (let x = 20; x < WIDTH; x += 40) {
    for (let y = 20; y < HEIGHT; y += 40) ctx.fillRect(x, y, 2, 2);
  }
  if (game && socket.joined) {
    if (now - game.lastPing > 1000) {
      game.lastPing = now;
      send(JSON.stringify({ type: 'ping', sent: Date.now() }));
    }
    if (now >= nextInput) {
      tick();
      nextInput += STEP_MS;
      if (now - nextInput > STEP_MS) nextInput = now + STEP_MS;
    }
    const snapshot = game.snapshots.at(-1);
    if (snapshot) {
      if (game.smoothing > 0) {
        const remaining = Math.max(0, game.smoothing - elapsed);
        game.dx *= remaining / game.smoothing;
        game.dy *= remaining / game.smoothing;
        game.smoothing = remaining;
      }
      const time = Date.now() + game.offset - setting('interpolation');
      for (const ship of remoteEntities(time, 'ships', ship => ship.id, ship => ship.id === game.id)) {
        drawShip(ship, false);
      }
      const remote = remoteEntities(time, 'bullets', b => `${b.owner}:${b.seq}`, b => b.owner === game.id);
      for (const bullet of remote.concat(game.bullets)) {
        ctx.fillStyle = bullet.owner === game.id ? '#63e8ff' : '#fba670';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
      drawShip(game.ship, true);
    }
  }
  if (now - measuredAt >= 1000) {
    const span = (now - measuredAt) / 1000;
    const snapshot = game?.snapshots.at(-1);
    const age = snapshot ? Math.max(0, Math.round(Date.now() + game.offset - snapshot.time)) : '—';
    $('netgraph').textContent = `${json ? 'JSON' : 'Binary'} · RTT ${game?.rtt ?? '—'} мс · Знімок ${age} мс · Інтерполяція ${setting('interpolation')} мс\n↓ ${Math.round(bytesIn / span)} Б/с · ↑ ${Math.round(bytesOut / span)} Б/с · Черга ${game?.pending.length ?? 0} · Поправка ${game?.correction.toFixed(3) ?? '—'} px · Макс. ${game?.maxCorrection.toFixed(3) ?? '—'} px`;
    measuredAt = now;
    bytesIn = bytesOut = 0;
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
