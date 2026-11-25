import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

export async function createMatchLogger(logDir, matchId) {
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

    transform(event, encoding, callback) {
      try {
        callback(null, JSON.stringify(event) + '\n');
      } catch (error) {
        callback(error);
      }
    }
  });

  const output = createWriteStream(file, {
    flags: 'a'
  });

  const done = pipeline(input, transform, output);
  done.catch(error => {
    console.error('Logger error:', error.message);
  });

  return {
    file,

    write(event) {
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
