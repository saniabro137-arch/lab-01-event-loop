import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import type { RoomMessage } from './room.ts';

export async function createMatchLogger(logDir: string, matchId: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(matchId)) {
    throw new Error('Invalid match ID');
  }

  await mkdir(logDir, { recursive: true });

  const file = join(logDir, `${matchId}.ndjson`);

  const input = new PassThrough({
    objectMode: true,
    highWaterMark: 16
  });

  const transform = new Transform({
    writableObjectMode: true,

    transform(event: unknown, _encoding, callback) {
      try {
        callback(null, JSON.stringify(event) + '\n');
      } catch (error) {
        callback(error instanceof Error ? error : new Error(String(error)));
      }
    }
  });

  const output = createWriteStream(file, {
    flags: 'a'
  });

  const done = pipeline(input, transform, output);
  done.catch((error: unknown) => {
    console.error('Logger error:', error);
  });

  return {
    file,

    write(event: RoomMessage) {
      return input.write({
        ...event,
        time: Date.now()
      });
    },

    input,

    async close() {
      input.end();
      await done;
    }
  };
}
