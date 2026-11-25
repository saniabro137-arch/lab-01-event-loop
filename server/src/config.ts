import { resolve } from 'node:path';
import { z } from 'zod';

const OriginSchema = z.string().refine(value => {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}, 'Expected an HTTP(S) origin without a trailing slash');

const EnvironmentSchema = z.object({
  ALLOWED_ORIGINS: z.string().default('').transform(value =>
    value.split(',').map(item => item.trim()).filter(Boolean)
  ).pipe(z.array(OriginSchema)),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).max(1024).default(64),
  MAX_ROOMS: z.coerce.number().int().min(1).max(10000).default(128),
  MAX_ROOM_PLAYERS: z.coerce.number().int().min(1).max(64).default(16),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().refine(value => value.trim().length > 0).default('./logs')
});

export function readConfig(env: unknown = process.env) {
  const { PORT, LOG_DIR, ALLOWED_ORIGINS, MAX_CONNECTIONS_PER_IP, MAX_ROOMS, MAX_ROOM_PLAYERS } = EnvironmentSchema.parse(env);

  return {
    port: PORT,
    allowedOrigins: new Set(ALLOWED_ORIGINS),
    maxConnectionsPerIp: MAX_CONNECTIONS_PER_IP,
    maxRooms: MAX_ROOMS,
    maxRoomPlayers: MAX_ROOM_PLAYERS,
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
