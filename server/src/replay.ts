import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { config } from './config.ts';
import type { ServerResponse } from 'node:http';

export async function replay(matchId: string, res: ServerResponse) {
  if (!/^[a-zA-Z0-9_-]+$/.test(matchId)) {
    res.writeHead(400);
    res.end('Invalid match ID');
    return;
  }

  const file = join(config.logDir, `${matchId}.ndjson`);
  const info = await stat(file).catch(() => null);

  if (!info?.isFile()) {
    res.writeHead(404);
    res.end('Replay not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Content-Length': info.size,
    'Content-Disposition': `attachment; filename="${matchId}.ndjson"`
  });

  if (info.size === 0) {
    res.end();
    return;
  }

  await pipeline(
    createReadStream(file, {
      highWaterMark: 65536,
      end: info.size - 1
    }),
    res
  );
}
