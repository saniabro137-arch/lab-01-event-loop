import { resolve } from 'node:path';
import { z } from 'zod';

const EnvironmentSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().refine(value => value.trim().length > 0).default('./logs')
});

export function readConfig(env: unknown = process.env) {
  const { PORT, LOG_DIR } = EnvironmentSchema.parse(env);

  return {
    port: PORT,
    host: '0.0.0.0',
    logDir: resolve(LOG_DIR),
    joinTimeout: 5000,
    pingInterval: 15000,
    maxPayload: 4096,
    rateLimit: 10,
    maxBufferedAmount: 65536
  };
}

export const config = readConfig();
