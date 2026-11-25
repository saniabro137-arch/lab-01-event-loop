import { createMatchLogger } from './logger.js';
import { Match } from './match.js';
import { decodeInput, encodeSnapshot } from 'space-flight-shared/codec';
import { FIRE, LEFT, RIGHT, THRUST, validInputs } from 'space-flight-shared/protocol';
import { config } from './config.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';

export function setupWebSocket(server, rooms) {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 4096
  });

  const configured = new WeakSet();
  const pendingLogs = new Set();
  const loggers = new Set();

  wss.flushLogs = async () => {
    await Promise.all([...pendingLogs]);
    await Promise.all([...loggers].map(close => close()));
  };

  function send(socket, data) {
    if (
      socket.readyState === WebSocket.OPEN &&
      socket.bufferedAmount < 65536
    ) {
      socket.send(data instanceof ArrayBuffer ? data : JSON.stringify(data));
    }
  }

  function configureRoom(room) {
    if (configured.has(room)) return;
    configured.add(room);

    const logger = createMatchLogger(
      config.logDir,
      randomUUID()
    );

    let queue = logger.then(() => {});
    let closing;

    const closeLog = () => {
      if (!closing) {
        closing = queue.then(async () => {
          const log = await logger;
          await log.close();
        });
      }
      return closing;
    };

    loggers.add(closeLog);

    function record(event) {
      queue = queue.then(async () => {
        const log = await logger;
        if (!log.write(event)) {
          await once(log.input, 'drain');
        }
      });

      queue.catch(error => {
        console.error('Log error:', error.message);
      });
    }

    room.on('empty', () => {
      const task = closeLog();
      pendingLogs.add(task);
      task.then(() => {
        pendingLogs.delete(task);
        loggers.delete(closeLog);
      }, error => {
        console.error('Log close:', error.message);
      });
    });

    for (const type of ['join', 'leave', 'chat']) {
      room.on(type, data => {
        record({ type, ...data });
        for (const socket of room.players.keys()) {
          send(socket, { type, ...data });
        }
      });
    }

    room.on('empty', () => {
      if (rooms.get(room.name) === room) {
        rooms.delete(room.name);
      }
    });
  }

  wss.on('connection', socket => {
    let room = null;
    let gameId = null;
    let codec = 'binary';
    let inputTokens = 24;
    let lastInputAt = performance.now();

    function leaveGame() {
      if (gameId === null) return;
      room.gameSockets.delete(gameId);
      room.match.removePlayer(gameId);
      gameId = null;
    }
    let count = 0;
    let windowStart = Date.now();

    socket.missedPongs = 0;

    const joinTimer = setTimeout(() => {
      if (!room) socket.close(1008, 'Join timeout');
    }, 5000);

    socket.on('pong', () => {
      socket.missedPongs = 0;
    });

    socket.on('error', error => {
      console.error('WebSocket:', error.message);
    });

    socket.on('message', (raw, binary) => {
      if (socket.readyState !== WebSocket.OPEN) return;

      if (Date.now() - windowStart >= 1000) {
        count = 0;
        windowStart = Date.now();
      }

      let msg;

      try {
        msg = binary ? decodeInput(raw) : JSON.parse(raw.toString());
      } catch {
        return socket.close(1007, 'Invalid JSON');
      }

      if (!msg || typeof msg !== 'object' ||
          Array.isArray(msg)) {
        return socket.close(1008, 'Invalid message');
      }

      if (msg.type === 'input' && gameId !== null) {
        const now = performance.now();
        inputTokens = Math.min(24, inputTokens + (now - lastInputAt) * 0.045);
        lastInputAt = now;
        if (inputTokens < 1) return socket.close(1008, 'Input rate limit');
        inputTokens--;
        if (binary !== (codec === 'binary') || !validInputs(msg)) {
          return socket.close(1008, 'Invalid game input');
        }

        for (const { seq, buttons } of msg.inputs) {
          room.match.receiveInput(gameId, {
            seq,
            thrust: Boolean(buttons & THRUST),
            left: Boolean(buttons & LEFT),
            right: Boolean(buttons & RIGHT),
            fire: Boolean(buttons & FIRE)
          });
        }
        return;
      }

      if (++count > 10) return socket.close(1008, 'Rate limit');

      if (msg.type === 'ping' && gameId !== null && Number.isFinite(msg.sent)) {
        send(socket, { type: 'pong', sent: msg.sent, time: Date.now() });
        return;
      }

      if (msg.type === 'join') {
        if (
          room ||
          typeof msg.name !== 'string' ||
          typeof msg.room !== 'string' ||
          !msg.name.trim() ||
          msg.name.length > 32 ||
          !rooms.has(msg.room)
        ) {
          return socket.close(1008, 'Invalid join');
        }

        room = rooms.get(msg.room);
        if (msg.game === true) {
          codec = msg.codec === 'json' ? 'json' : 'binary';
          if (!room.match) {
            const gameSockets = new Map();
            room.gameSockets = gameSockets;
            room.match = new Match((id, snapshot) => {
              const peer = gameSockets.get(id);
              if (peer) send(peer.socket, peer.codec === 'json' ? snapshot : encodeSnapshot(snapshot));
            });
          }

          if (room.gameSockets.size >= 4) {
            room = null;
            return socket.close(1008, 'Match full');
          }

          gameId = 1;
          while (room.gameSockets.has(gameId)) gameId++;
          room.gameSockets.set(gameId, { socket, codec });
          room.match.addPlayer(gameId);
        }
        configureRoom(room);
        clearTimeout(joinTimer);

        room.join(socket, msg.name.trim());

        send(socket, {
          type: 'joined',
          room: room.name,
          players: [...room.players.values()],
          game: gameId === null ? undefined : { id: gameId, seed: room.match.seed }
        });
        if (gameId !== null) room.match.start();

      } else if (msg.type === 'chat') {
        if (
          !room ||
          typeof msg.text !== 'string' ||
          !msg.text.trim() ||
          msg.text.length > 500
        ) {
          return socket.close(1008, 'Invalid chat');
        }

        room.chat(socket, msg.text.trim());

      } else if (msg.type === 'leave') {
        if (!room) {
          return socket.close(1008, 'Not joined');
        }

        leaveGame();
        room.leave(socket);
        room = null;
        socket.close(1000, 'Left room');

      } else {
        socket.close(1008, 'Unknown type');
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);
      leaveGame();
      if (room) room.leave(socket);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;

      if (socket.missedPongs >= 2) {
        socket.terminate();
        continue;
      }

      socket.missedPongs++;
      socket.ping();
    }
  }, 15000);

  wss.on('error', error => {
    console.error('WSS:', error.message);
  });

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  return wss;
}
