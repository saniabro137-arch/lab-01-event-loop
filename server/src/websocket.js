import { createMatchLogger } from './logger.js';
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
      socket.send(JSON.stringify(data));
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

      if (++count > 10) {
        return socket.close(1008, 'Rate limit');
      }

      if (binary) {
        return socket.close(1003, 'Text required');
      }

      let msg;

      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return socket.close(1007, 'Invalid JSON');
      }

      if (!msg || typeof msg !== 'object' ||
          Array.isArray(msg)) {
        return socket.close(1008, 'Invalid message');
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
        configureRoom(room);
        clearTimeout(joinTimer);

        room.join(socket, msg.name.trim());

        send(socket, {
          type: 'joined',
          room: room.name,
          players: [...room.players.values()]
        });

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

        room.leave(socket);
        room = null;
        socket.close(1000, 'Left room');

      } else {
        socket.close(1008, 'Unknown type');
      }
    });

    socket.on('close', () => {
      clearTimeout(joinTimer);
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
