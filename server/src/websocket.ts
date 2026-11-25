import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { decodeInput, encodeSnapshot } from 'space-flight-shared/codec';
import { FIRE, LEFT, MAX_PLAYERS, RIGHT, THRUST, parseClientJSON } from 'space-flight-shared/protocol';
import type { ClientMessage } from 'space-flight-shared/protocol';
import { EntityIdSchema } from 'space-flight-shared/types';
import type { EntityId } from 'space-flight-shared/types';
import { createMatchLogger } from './logger.ts';
import { Match } from './match.ts';
import { config } from './config.ts';
import type { Codec, Room, RoomMessage } from './room.ts';

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function setupWebSocket(server: Server, rooms: Map<string, Room>) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: config.maxPayload });
  const configured = new WeakSet<Room>();
  const pendingLogs = new Set<Promise<void>>();
  const loggers = new Set<() => Promise<void>>();
  const missedPongs = new WeakMap<WebSocket, number>();

  function send(socket: WebSocket, data: object): void {
    if (socket.readyState === WebSocket.OPEN &&
        socket.bufferedAmount < config.maxBufferedAmount) {
      socket.send(data instanceof ArrayBuffer ? data : JSON.stringify(data));
    }
  }

  function configureRoom(room: Room): void {
    if (configured.has(room)) return;
    configured.add(room);

    const logger = createMatchLogger(config.logDir, randomUUID());
    let queue = logger.then(() => {});
    let closing: Promise<void> | undefined;
    const closeLog = () => closing ??= queue.then(async () => {
      const log = await logger;
      await log.close();
    });
    loggers.add(closeLog);

    function relay(event: RoomMessage): void {
      queue = queue.then(async () => {
        const log = await logger;
        if (!log.write(event)) await once(log.input, 'drain');
      });
      queue.catch((error: unknown) => console.error('Log error:', errorText(error)));
      for (const peer of room.players.keys()) send(peer, event);
    }

    room.on('join', event => relay({ type: 'join', ...event }));
    room.on('leave', event => relay({ type: 'leave', ...event }));
    room.on('chat', event => relay({ type: 'chat', ...event }));
    room.on('empty', () => {
      const task = closeLog();
      pendingLogs.add(task);
      task.then(() => {
        pendingLogs.delete(task);
        loggers.delete(closeLog);
      }, (error: unknown) => console.error('Log close:', errorText(error)));
      if (rooms.get(room.name) === room) rooms.delete(room.name);
    });
  }

  wss.on('connection', socket => {
    let room: Room | undefined;
    let gameId: EntityId | undefined;
    let codec: Codec = 'binary';
    let inputTokens = 24;
    let lastInputAt = performance.now();
    let count = 0;
    let windowStart = Date.now();
    const joinTimer = setTimeout(() => {
      if (!room) socket.close(1008, 'Join timeout');
    }, config.joinTimeout);

    function leaveGame(): void {
      if (!room || gameId === undefined) return;
      room.gameSockets.delete(gameId);
      room.match?.removePlayer(gameId);
      gameId = undefined;
    }

    socket.on('pong', () => missedPongs.set(socket, 0));
    socket.on('error', error => console.error('WebSocket:', error.message));

    socket.on('message', (raw, binary) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const payload = Array.isArray(raw) ? Buffer.concat(raw) :
        raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;

      let msg: ClientMessage;
      if (binary) {
        try {
          msg = decodeInput(payload);
        } catch (error: unknown) {
          console.warn('Invalid binary packet:', errorText(error));
          return socket.close(1007, 'Invalid binary packet');
        }
      } else {
        const parsed = parseClientJSON(payload.toString('utf8'));
        if (!parsed.success) {
          console.warn('Invalid client message:', parsed.error.issues[0]?.code);
          return socket.close(1007, 'Invalid client message');
        }
        msg = parsed.data;
      }

      if (msg.type !== 'input') {
        if (Date.now() - windowStart >= 1000) {
          count = 0;
          windowStart = Date.now();
        }
        if (++count > config.rateLimit) return socket.close(1008, 'Rate limit');
      }

      switch (msg.type) {
        case 'input': {
          const match = room?.match;
          if (!match || gameId === undefined || binary !== (codec === 'binary')) {
            return socket.close(1008, 'Invalid game input');
          }
          const now = performance.now();
          inputTokens = Math.min(24, inputTokens + (now - lastInputAt) * 0.045);
          lastInputAt = now;
          if (inputTokens < 1) return socket.close(1008, 'Input rate limit');
          inputTokens--;

          for (const { seq, buttons } of msg.inputs) {
            match.receiveInput(gameId, {
              seq,
              thrust: Boolean(buttons & THRUST),
              left: Boolean(buttons & LEFT),
              right: Boolean(buttons & RIGHT),
              fire: Boolean(buttons & FIRE)
            });
          }
          return;
        }
        case 'join': {
          const selected = rooms.get(msg.room);
          if (room || !selected) return socket.close(1008, 'Invalid join');
          let game: { id: EntityId; seed: number } | undefined;
          if (msg.game === true) {
            if (selected.gameSockets.size >= MAX_PLAYERS) {
              return socket.close(1008, 'Match full');
            }
            codec = msg.codec ?? 'binary';
            const match = selected.match ??= new Match((id, snapshot) => {
              const peer = selected.gameSockets.get(id);
              if (peer) send(peer.socket, peer.codec === 'json' ? snapshot : encodeSnapshot(snapshot));
            });
            let id = EntityIdSchema.parse(1);
            while (selected.gameSockets.has(id)) id = EntityIdSchema.parse(id + 1);
            selected.gameSockets.set(id, { socket, codec });
            match.addPlayer(id);
            gameId = id;
            game = { id, seed: match.seed };
          }
          room = selected;
          configureRoom(selected);
          clearTimeout(joinTimer);
          selected.join(socket, msg.name);
          send(socket, {
            type: 'joined', room: selected.name,
            players: [...selected.players.values()], game
          });
          if (game) selected.match?.start();
          return;
        }
        case 'ping':
          if (gameId === undefined) return socket.close(1008, 'Not in game');
          send(socket, { type: 'pong', sent: msg.sent, time: Date.now() });
          return;
        case 'chat':
          if (!room) return socket.close(1008, 'Not joined');
          room.chat(socket, msg.text);
          return;
        case 'leave':
          if (!room) return socket.close(1008, 'Not joined');
          leaveGame();
          room.leave(socket);
          room = undefined;
          socket.close(1000, 'Left room');
          return;
        default: {
          const unexpected: never = msg;
          return unexpected;
        }
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);
      leaveGame();
      room?.leave(socket);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const missed = missedPongs.get(socket) ?? 0;
      if (missed >= 2) socket.terminate();
      else {
        missedPongs.set(socket, missed + 1);
        socket.ping();
      }
    }
  }, config.pingInterval);

  wss.on('error', error => console.error('WSS:', error.message));
  wss.on('close', () => clearInterval(heartbeat));

  return Object.assign(wss, {
    async flushLogs() {
      await Promise.all(pendingLogs);
      await Promise.all([...loggers].map(close => close()));
    }
  });
}
