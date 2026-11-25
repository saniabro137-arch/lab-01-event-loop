import { VERSION, INPUT, SNAPSHOT, MAX_BATCH, MAX_PLAYERS, validInputs } from '../protocol/index.js';

// Little-endian. Header: version u8, type u8.
// Input: count u8, then [seq u32, buttons u8].
// Snapshot: tick u32, lastProcessedSeq u32, server epoch ms f64,
// ship count u8, bullet count u8. Ship: id u16, x/y/vx/vy f32,
// angle i16 (0.001 rad), thrust u8, cooldown u8, hp u8, score u32.
// Bullet: owner u16, seq u32, x/y/vx/vy f32, remaining ticks u8.
const HEADER = 20;
const SHIP = 27;
const BULLET = 23;
const MAX_BULLETS = MAX_PLAYERS * 5;
const motion = ['x', 'y', 'vx', 'vy'];

function viewOf(bytes) {
  return bytes instanceof ArrayBuffer
    ? new DataView(bytes)
    : new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function packet(type, size) {
  const view = new DataView(new ArrayBuffer(size));
  view.setUint8(0, VERSION);
  view.setUint8(1, type);
  return view;
}

function verify(view, type, size) {
  if (view.byteLength < size || view.getUint8(0) !== VERSION ||
      view.getUint8(1) !== type) throw new Error('Invalid packet header');
}

export function encodeInput(msg) {
  const view = packet(INPUT, 3 + 5 * msg.inputs.length);
  view.setUint8(2, msg.inputs.length);
  msg.inputs.forEach(({ seq, buttons }, i) => {
    view.setUint32(3 + i * 5, seq, true);
    view.setUint8(7 + i * 5, buttons);
  });
  return view.buffer;
}

export function decodeInput(bytes) {
  const view = viewOf(bytes);
  verify(view, INPUT, 3);
  const count = view.getUint8(2);
  if (!count || count > MAX_BATCH || view.byteLength !== 3 + 5 * count) {
    throw new Error('Invalid input length');
  }
  const msg = {
    type: 'input',
    inputs: Array.from({ length: count }, (_, i) => ({
      seq: view.getUint32(3 + i * 5, true),
      buttons: view.getUint8(7 + i * 5)
    }))
  };
  if (!validInputs(msg)) throw new Error('Invalid input');
  return msg;
}

export function encodeSnapshot(msg) {
  const { tick, lastProcessedSeq, time, ships, bullets } = msg;
  const view = packet(SNAPSHOT, HEADER + ships.length * SHIP + bullets.length * BULLET);
  view.setUint32(2, tick, true);
  view.setUint32(6, lastProcessedSeq, true);
  view.setFloat64(10, time, true);
  view.setUint8(18, ships.length);
  view.setUint8(19, bullets.length);
  let offset = HEADER;
  for (const ship of ships) {
    view.setUint16(offset, ship.id, true);
    motion.forEach((key, i) => view.setFloat32(offset + 2 + 4 * i, ship[key], true));
    view.setInt16(offset + 18, Math.round(ship.angle * 1000), true);
    view.setUint8(offset + 20, ship.thrust);
    view.setUint8(offset + 21, ship.cooldown);
    view.setUint8(offset + 22, ship.hp);
    view.setUint32(offset + 23, ship.score, true);
    offset += SHIP;
  }
  for (const bullet of bullets) {
    view.setUint16(offset, bullet.owner, true);
    view.setUint32(offset + 2, bullet.seq, true);
    motion.forEach((key, i) => view.setFloat32(offset + 6 + 4 * i, bullet[key], true));
    view.setUint8(offset + 22, bullet.life);
    offset += BULLET;
  }
  return view.buffer;
}

export function decodeSnapshot(bytes) {
  const view = viewOf(bytes);
  verify(view, SNAPSHOT, HEADER);
  const shipCount = view.getUint8(18);
  const bulletCount = view.getUint8(19);
  if (shipCount > MAX_PLAYERS || bulletCount > MAX_BULLETS ||
      view.byteLength !== HEADER + shipCount * SHIP + bulletCount * BULLET) {
    throw new Error('Invalid snapshot length');
  }
  let offset = HEADER;
  const readMotion = start => Object.fromEntries(
    motion.map((key, i) => [key, view.getFloat32(start + i * 4, true)])
  );
  const ships = Array.from({ length: shipCount }, () => {
    const ship = {
      id: view.getUint16(offset, true), ...readMotion(offset + 2),
      angle: view.getInt16(offset + 18, true) / 1000,
      thrust: Boolean(view.getUint8(offset + 20)),
      cooldown: view.getUint8(offset + 21),
      hp: view.getUint8(offset + 22), score: view.getUint32(offset + 23, true)
    };
    offset += SHIP;
    return ship;
  });
  const bullets = Array.from({ length: bulletCount }, () => {
    const bullet = {
      owner: view.getUint16(offset, true), seq: view.getUint32(offset + 2, true),
      ...readMotion(offset + 6), life: view.getUint8(offset + 22)
    };
    offset += BULLET;
    return bullet;
  });
  return {
    type: 'snapshot', tick: view.getUint32(2, true),
    lastProcessedSeq: view.getUint32(6, true), time: view.getFloat64(10, true),
    ships, bullets
  };
}
