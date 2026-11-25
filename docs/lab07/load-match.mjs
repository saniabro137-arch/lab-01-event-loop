import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { decodeSnapshot, encodeInput } from 'space-flight-shared/codec';
import { FIRE, LEFT, RIGHT, THRUST } from 'space-flight-shared/protocol';
import { SeqSchema } from 'space-flight-shared/types';
import { botInput } from '../../shared/sim/bot.ts';

const baseURL = 'http://127.0.0.1:3079';
const durationMs = 5000;
const tickBudgetMs = 1000 / 30;
const clients = new Set();
const server = spawn(process.execPath, ['server/src/index.ts'], {
  env: { ...process.env, PORT: '3079', LOG_DIR: '.lab07-profiles/load-logs' },
  stdio: 'inherit'
});
const exited = new Promise(resolve => {
  server.once('exit', resolve);
  server.once('error', resolve);
});

async function request(path, options) {
  const response = await fetch(baseURL + path, {
    ...options, signal: AbortSignal.timeout(3000)
  });
  if (!response.ok) throw new Error(path + ' HTTP ' + response.status);
  return response.json();
}

async function ready() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Server exited');
    if (await request('/health').catch(() => null)) return;
    await wait(100);
  }
  throw new Error('Local server did not start');
}

function connectBot(room, name) {
  const socket = new WebSocket('ws://127.0.0.1:3079/ws');
  clients.add(socket);
  socket.binaryType = 'arraybuffer';

  const bot = { socket, id: undefined, snapshot: undefined, seq: 0, received: 0, error: undefined };
  socket.addEventListener('message', ({ data }) => {
    try {
      if (data instanceof ArrayBuffer) {
        bot.snapshot = decodeSnapshot(data);
        bot.received++;
      } else {
        const event = JSON.parse(data);
        if (event.type === 'joined') bot.id = event.game.id;
      }
    } catch (error) {
      bot.error = error;
    }
  });
  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'join', room, name, game: true, codec: 'binary' }));
  });
  return bot;
}

function sendInput(bot) {
  if (bot.error) throw bot.error;
  if (bot.socket.readyState !== WebSocket.OPEN) throw new Error('Bot socket closed');
  const ship = bot.snapshot?.ships.find(item => item.id === bot.id);
  if (!ship) return;
  const target = bot.snapshot.ships.find(item => item.id !== bot.id);
  const input = botInput(ship, target, SeqSchema.parse(++bot.seq));
  const buttons = (input.thrust ? THRUST : 0) | (input.left ? LEFT : 0) |
    (input.right ? RIGHT : 0) | (input.fire ? FIRE : 0);
  bot.socket.send(encodeInput({ type: 'input', inputs: [{ seq: input.seq, buttons }] }));
}

function p99(values) {
  assert.ok(values.length, 'No server samples collected');
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.ceil(sorted.length * 0.99) - 1].toFixed(3));
}

async function run(matchCount) {
  const names = Array.from({ length: matchCount }, (_, i) => 'load-' + matchCount + '-' + i);
  const rooms = new Set(names);
  const bots = [];

  for (const room of rooms) {
    await request('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: room })
    });
    bots.push(connectBot(room, 'BotA'), connectBot(room, 'BotB'));
  }

  for (let i = 0; i < 60 && bots.some(bot => bot.snapshot?.ships.length !== 2); i++) {
    await wait(100);
  }
  assert.ok(bots.every(bot => bot.snapshot?.ships.length === 2), 'Some bots did not join');

  let failure;
  const inputTimer = setInterval(() => {
    try {
      for (const bot of bots) sendInput(bot);
    } catch (error) {
      failure = error;
      clearInterval(inputTimer);
    }
  }, 34);

  try {
    await wait(1500);
    const initial = bots.map(bot => bot.received);
    const samples = new Map();
    const started = performance.now();

    while (performance.now() - started < durationMs) {
      if (failure) throw failure;
      for (const tick of await request('/api/stats')) {
        if (rooms.has(tick.room)) samples.set(tick.room + ':' + tick.tick, tick);
      }
      await wait(20);
    }

    const seconds = (performance.now() - started) / 1000;
    const p99TickMs = p99([...samples.values()].map(tick => tick.durationMs));
    const p99JitterMs = p99([...samples.values()].map(tick => tick.jitterMs));
    const minSnapshotsPerSecond = Number(Math.min(...bots.map(
      (bot, i) => (bot.received - initial[i]) / seconds
    )).toFixed(2));
    return {
      matches: matchCount, bots: bots.length, sampledTicks: samples.size,
      p99TickMs, p99JitterMs, minSnapshotsPerSecond,
      passed: p99TickMs < tickBudgetMs && p99JitterMs < tickBudgetMs && minSnapshotsPerSecond >= 27
    };
  } finally {
    clearInterval(inputTimer);
    for (const bot of bots) bot.socket.close();
  }
}

try {
  await ready();
  const results = [];
  for (const matches of [1, 4, 8, 16]) results.push(await run(matches));
  const maxPassingMatches = Math.max(0, ...results.filter(row => row.passed).map(row => row.matches));
  await writeFile('docs/lab07/load-results.json', JSON.stringify({
    durationMs, tickBudgetMs, minSnapshotsPerSecond: 27, maxPassingMatches, results
  }, null, 2) + '\n');
  console.table(results);
  console.log('Максимум серед перевірених рівнів:', maxPassingMatches, 'матчів');
} finally {
  for (const socket of clients) socket.close();
  server.kill('SIGTERM');
  await exited;
}
