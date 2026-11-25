import { resolve } from 'node:path';

export function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid PORT');
  }

  const logDir = env.LOG_DIR ?? './logs';

  if (!logDir.trim()) {
    throw new Error('Invalid LOG_DIR');
  }

  return {
    port,
    host: '0.0.0.0',
    logDir: resolve(logDir),
    joinTimeout: 5000,
    pingInterval: 15000,
    maxPayload: 4096,
    rateLimit: 10,
    maxBufferedAmount: 65536
  };
}

export const config = readConfig();
