import { socket } from '../lab4/main.ts';
import { lerpAngle } from 'space-flight-shared/ship';
import { STEP_MS, advanceBullets, combatStep } from 'space-flight-shared/world';
import { encodeInput } from 'space-flight-shared/codec';
import { FIRE, LEFT, MAX_BATCH, RIGHT, THRUST } from 'space-flight-shared/protocol';

import { SeqSchema } from 'space-flight-shared/types';
import type {
  BulletSnapshot, CombatInput, EntityId, EntitySnapshot, ShipSnapshot
} from 'space-flight-shared/types';
import type { InputMessage, SnapshotMessage } from 'space-flight-shared/protocol';

type Frame = string | ArrayBuffer;

interface Session {
  id: EntityId;
  seq: number;
  nextInput: number;
  nextPing: number;
  measuredAt: number;
  bytesIn: number;
  bytesOut: number;
  snapshots: SnapshotMessage[];
  pending: CombatInput[];
  localShip?: ShipSnapshot;
  localBullets: BulletSnapshot[];
  dx: number;
  dy: number;
  correction: number;
  maxCorrection: number;
  clockOffset?: number;
  rtt?: number;
}

function required<T extends HTMLElement>(id: string, elementType: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof elementType)) throw new Error('Invalid element: ' + id);
  return element;
}

const canvas = required('arena', HTMLCanvasElement);
const netgraph = required('netgraph', HTMLElement);
const prediction = required('prediction', HTMLInputElement);
const keys = new Set<string>();

function canvasContext(): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  return context;
}

const ctx = canvasContext();
const controls = new Set(['KeyW', 'ArrowUp', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'Space']);
const encoder = new TextEncoder();
const json = new URLSearchParams(location.search).get('codec') === 'json';
const size = (frame: Frame) => typeof frame === 'string' ? encoder.encode(frame).length : frame.byteLength;

let game: Session | undefined;
let lastFrame = performance.now();

function setting(id: string): number {
  const field = required(id, HTMLInputElement);
  return Math.max(0, Math.min(Number(field.max), Number(field.value) || 0));
}

function impair(session: Session, deliver: () => void) {
  if (Math.random() * 100 < setting('drop')) return;
  const delay = setting('latency') + (2 * Math.random() - 1) * setting('jitter');
  const run = () => {
    if (game === session && socket.joined) deliver();
  };
  if (delay > 0) setTimeout(run, delay);
  else run();
}

function send(session: Session, frame: Frame) {
  impair(session, () => {
    if (socket.sendFrame(frame)) session.bytesOut += size(frame);
  });
}

function predict(session: Session, input: CombatInput) {
  if (!session.localShip) return;
  const next = combatStep(session.localShip, input);
  session.localShip = next.ship;
  session.localBullets = advanceBullets(session.localBullets, next.bullet);
}

socket.subscribe('received', detail => {
  if (game) game.bytesIn += size(detail);
});

window.addEventListener('keydown', event => {
  if (!controls.has(event.code) || document.activeElement !== canvas) return;
  event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => keys.clear());

socket.subscribe('status', () => {
  if (socket.joined) return;
  game = undefined;
  keys.clear();
  netgraph.textContent = 'Очікуємо підключення';
});

function reconcile(session: Session, snapshot: SnapshotMessage, measure = true) {
  const authoritative = snapshot.ships.find(ship => ship.id === session.id);
  if (!authoritative) return;

  const previous = session.localShip;
  session.pending = session.pending.filter(input => input.seq > snapshot.lastProcessedSeq);
  session.localShip = authoritative;
  session.localBullets = snapshot.bullets.filter(bullet => bullet.owner === session.id);

  if (!prediction.checked) return;
  for (const input of session.pending) {
    predict(session, input);
  }

  if (previous && measure) {
    const dx = previous.x - session.localShip.x;
    const dy = previous.y - session.localShip.y;
    session.correction = Math.hypot(dx, dy);
    session.maxCorrection = Math.max(session.maxCorrection, session.correction);
    session.dx += dx;
    session.dy += dy;
  }
}

prediction.onchange = () => {
  const session = game;
  const latest = session?.snapshots.at(-1);
  if (!session || !latest) return;
  Object.assign(session, { dx: 0, dy: 0, correction: 0, maxCorrection: 0 });
  reconcile(session, latest, false);
  canvas.focus();
};

socket.subscribe('message', detail => {
  if (detail.type === 'joined' && detail.game) {
    const now = performance.now();
    game = {
      id: detail.game.id, seq: 0, nextInput: now,
      nextPing: now, measuredAt: now, bytesIn: 0, bytesOut: 0,
      snapshots: [], pending: [], localBullets: [], dx: 0, dy: 0,
      correction: 0, maxCorrection: 0
    };
    canvas.focus();
    return;
  }

  const session = game;
  if (!session || (detail.type !== 'snapshot' && detail.type !== 'pong')) return;

  impair(session, () => {
    if (detail.type === 'pong') {
      const now = Date.now();
      session.rtt = now - detail.sent;
      session.clockOffset = detail.time - (detail.sent + now) / 2;
      return;
    }

    const latest = session.snapshots.at(-1);
    if (latest && detail.tick <= latest.tick) return;
    session.clockOffset ??= detail.time - Date.now() + setting('latency');
    session.snapshots.push(detail);
    if (session.snapshots.length > 48) session.snapshots.shift();
    reconcile(session, detail);
  });
});

function sendInput(session: Session) {
  if (session.pending.length < 64) {
    const input: CombatInput = {
      seq: SeqSchema.parse(++session.seq),
      thrust: keys.has('KeyW') || keys.has('ArrowUp'),
      left: keys.has('KeyA') || keys.has('ArrowLeft'),
      right: keys.has('KeyD') || keys.has('ArrowRight'),
      fire: keys.has('Space')
    };
    session.pending.push(input);
    if (prediction.checked) predict(session, input);
  }
  const inputs = session.pending.slice(-MAX_BATCH).map(input => ({
    seq: input.seq,
    buttons: (input.thrust ? THRUST : 0) |
      (input.left ? LEFT : 0) |
      (input.right ? RIGHT : 0) |
      (input.fire ? FIRE : 0)
  }));
  const message: InputMessage = { type: 'input', inputs };
  send(session, json ? JSON.stringify(message) : encodeInput(message));
}

function interpolate<T extends EntitySnapshot>(entity: T, next: T, ratio: number): T {
  const position = {
    x: entity.x + (next.x - entity.x) * ratio,
    y: entity.y + (next.y - entity.y) * ratio
  };
  switch (entity.kind) {
    case 'ship':
      if (next.kind !== 'ship') return entity;
      return { ...entity, ...position, angle: lerpAngle(entity.angle, next.angle, ratio) };
    case 'bullet':
      return { ...entity, ...position };
    default: {
      const unexpected: never = entity;
      return unexpected;
    }
  }
}

function remoteEntities<T extends EntitySnapshot>(
  session: Session,
  select: (snapshot: SnapshotMessage) => readonly T[],
  key: (entity: T) => string | number,
  isOwn: (entity: T) => boolean
): T[] {
  const time = Date.now() + (session.clockOffset ?? 0) - setting('interpolation');
  const frames = session.snapshots;
  const index = frames.findIndex(snapshot => snapshot.time > time);
  if (index <= 0) {
    const snapshot = index === 0 ? frames[0] : frames.at(-1);
    return snapshot ? select(snapshot).filter(entity => !isOwn(entity)) : [];
  }

  const a = frames[index - 1];
  const b = frames[index];
  if (!a || !b) return [];
  const ratio = (time - a.time) / (b.time - a.time);

  const nextById = new Map(select(b).map(entity => [key(entity), entity]));
  return select(a).filter(entity => !isOwn(entity)).map(entity => {
    const next = nextById.get(key(entity));
    return next ? interpolate(entity, next, ratio) : entity;
  });
}

function drawShip(ship: ShipSnapshot, own: boolean, dx = 0, dy = 0) {
  ctx.save();
  ctx.translate(ship.x + dx, ship.y + dy);
  ctx.rotate(ship.angle);
  ctx.strokeStyle = own ? '#63e8ff' : '#ffab73';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(-13, -11);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-13, 11);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#e3f3ff';
  ctx.font = '15px monospace';
  ctx.fillText(`#${ship.id} · HP ${ship.hp} · ${ship.score}`,
    Math.max(4, Math.min(canvas.width - 140, ship.x + dx - 40)),
    Math.max(16, ship.y + dy - 23));
}

function updateNetgraph(session: Session, now: number) {
  const seconds = (now - session.measuredAt) / 1000;
  if (seconds < 1) return;

  const latest = session.snapshots.at(-1);
  const age = latest ? Math.max(0, Math.round(Date.now() + (session.clockOffset ?? 0) - latest.time)) : '—';
  netgraph.textContent =
    `${json ? 'JSON' : 'Binary'} · RTT ${session.rtt ?? '—'} мс · Вік знімка ${age} мс · Тик ${latest?.tick ?? '—'} · Кораблів ${latest?.ships.length ?? 0}\n` +
    `↓ ${Math.round(session.bytesIn / seconds)} Б/с · ↑ ${Math.round(session.bytesOut / seconds)} Б/с · Черга ${session.pending.length}\n` +
    `Поправка ${session.correction.toFixed(3)} px · Макс. ${session.maxCorrection.toFixed(3)} px · Інтерполяція ${setting('interpolation')} мс`;

  session.bytesIn = 0;
  session.bytesOut = 0;
  session.measuredAt = now;
}

function frame(now: number) {
  const elapsed = now - lastFrame;
  lastFrame = now;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (game && socket.joined) {
    if (now >= game.nextPing) {
      game.nextPing = now + 1000;
      send(game, JSON.stringify({ type: 'ping', sent: Date.now() }));
    }

    if (game.localShip && now >= game.nextInput) {
      sendInput(game);
      game.nextInput += STEP_MS;
      if (game.nextInput < now - STEP_MS) game.nextInput = now + STEP_MS;
    }

    if (game.localShip) {
      // The visual error decays by about 95% over 100 ms.
      const decay = Math.exp(-elapsed / (100 / 3));
      game.dx *= decay;
      game.dy *= decay;
      const active = game;
      const ships = remoteEntities(active, snapshot => snapshot.ships,
        ship => ship.id, ship => ship.id === active.id);
      for (const ship of ships) drawShip(ship, false);
      const bullets = remoteEntities(active, snapshot => snapshot.bullets,
        bullet => `${bullet.owner}:${bullet.seq}`, bullet => bullet.owner === active.id);
      for (const bullet of bullets.concat(game.localBullets)) {
        ctx.fillStyle = bullet.owner === game.id ? '#63e8ff' : '#ffab73';
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
      drawShip(game.localShip, true, game.dx, game.dy);
    }

    updateNetgraph(game, now);
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
