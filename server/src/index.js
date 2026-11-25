import { replay } from './replay.js';
import { setupWebSocket } from './websocket.js';
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';
import { Room } from './room.js';

const rooms = new Map();
const clientDir = fileURLToPath(
  new URL('../../client/dist/', import.meta.url)
);
const root = resolve(clientDir);

export function getRoom(name) {
  if (!rooms.has(name)) {
    const room = new Room(name);
    rooms.set(name, room);
    room.once('empty', () => rooms.delete(name));
  }
  return rooms.get(name);
}

function json(res, status, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length
  });
  res.end(body);
}

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav'
};

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      req.url.split('?')[0]
    );

    if (
      pathname.includes('..') ||
      pathname.includes('\\') ||
      pathname.includes('\0')
    ) {
      return json(res, 403, { error: 'Forbidden' });
    }

    if (req.method === 'GET' && pathname === '/health') {
      return json(res, 200, {
        status: 'ok',
        uptime: process.uptime()
      });
    }

    if (
      req.method === 'GET' &&
      pathname.startsWith('/api/replay/')
    ) {
      const matchId = pathname.slice('/api/replay/'.length);
      return await replay(matchId, res);
    }

    if (req.method === 'GET' && pathname === '/api/stats') {
      return json(res, 200, [...rooms.values()]
        .filter(room => room.match?.players.size)
        .map(room => ({ room: room.name, ...room.match.stats })));
    }

    if (pathname === '/api/rooms') {
      if (req.method === 'GET') {
        return json(res, 200, [...rooms.values()].map(room => ({
          name: room.name,
          players: room.size
        })));
      }

      if (req.method === 'POST') {
        const chunks = [];
        let size = 0;

        for await (const chunk of req) {
          size += chunk.length;
          if (size > 4096) {
            return json(res, 413, {
              error: 'Payload too large'
            });
          }
          chunks.push(chunk);
        }

        let data;
        try {
          data = JSON.parse(Buffer.concat(chunks).toString());
        } catch {
          return json(res, 400, { error: 'Invalid JSON' });
        }

        if (
          typeof data?.name !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,32}$/.test(data.name)
        ) {
          return json(res, 400, {
            error: 'Invalid room name'
          });
        }

        if (rooms.has(data.name)) {
          return json(res, 409, {
            error: 'Room already exists'
          });
        }

        const room = getRoom(data.name);
        return json(res, 201, {
          name: room.name,
          players: room.size
        });
      }

      return json(res, 405, {
        error: 'Method not allowed'
      });
    }

    if (req.method !== 'GET') {
      return json(res, 405, {
        error: 'Method not allowed'
      });
    }

    const file = resolve(
      root,
      '.' + (pathname === '/' ? '/index.html' : pathname)
    );

    if (!file.startsWith(root + sep)) {
      return json(res, 403, { error: 'Forbidden' });
    }

    const info = await stat(file).catch(() => null);

    if (!info?.isFile()) {
      return json(res, 404, { error: 'Not found' });
    }

    res.writeHead(200, {
      'Content-Type': mime[extname(file)] ??
        'application/octet-stream',
      'Content-Length': info.size
    });

    await pipeline(createReadStream(file), res);
  } catch (error) {
    if (!res.headersSent) {
      json(res, error instanceof URIError ? 400 : 500, {
        error: 'Request failed'
      });
    } else {
      res.destroy();
    }
  }
});

const wss = setupWebSocket(server, rooms);

server.listen(config.port, config.host, () => {
  console.log(`Server running on port ${config.port}`);
});

let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log('Graceful shutdown started');

  const httpClosed = new Promise(resolve => {
    server.close(resolve);
  });

  const wsClosed = new Promise(resolve => {
    wss.close(resolve);
  });

  for (const socket of wss.clients) {
    socket.close(1001, 'Server shutdown');
  }

  const timer = setTimeout(() => {
    for (const socket of wss.clients) {
      socket.terminate();
    }
  }, 2000);

  try {
    await wsClosed;
    clearTimeout(timer);

    await wss.flushLogs();
    await httpClosed;

    console.log('Logs flushed successfully');
    console.log('Server stopped');
    process.exitCode = 0;
  } catch (error) {
    console.error('Shutdown error:', error);
    process.exitCode = 1;
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

export { server, rooms };
