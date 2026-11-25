import { pino } from 'pino';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';

const LogLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']);
export const log = pino({
  level: LogLevelSchema.default('info').parse(process.env.LOG_LEVEL)
});

export const metrics = new Registry();
collectDefaultMetrics({ register: metrics });

export const wsMessages = new Counter({
  name: 'spaceflight_ws_messages_total',
  help: 'WebSocket application messages by direction',
  labelNames: ['direction'],
  registers: [metrics]
});
export const wsBytes = new Counter({
  name: 'spaceflight_ws_bytes_total',
  help: 'WebSocket payload bytes by direction',
  labelNames: ['direction'],
  registers: [metrics]
});
export const wsRejected = new Counter({
  name: 'spaceflight_ws_rejected_total',
  help: 'Rejected WebSocket messages or connections',
  labelNames: ['reason'],
  registers: [metrics]
});
export const tickDuration = new Histogram({
  name: 'spaceflight_tick_duration_seconds',
  help: 'Duration of an authoritative match tick',
  buckets: [0.0001, 0.00025, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.02, 1 / 30],
  registers: [metrics]
});

let previous = performance.eventLoopUtilization();
new Gauge({
  name: 'spaceflight_event_loop_utilization',
  help: 'Event loop utilization since the previous scrape',
  registers: [metrics],
  collect() {
    const current = performance.eventLoopUtilization();
    this.set(performance.eventLoopUtilization(current, previous).utilization);
    previous = current;
  }
});

export const activeRooms = new Gauge({
  name: 'spaceflight_rooms',
  help: 'Current rooms',
  registers: [metrics]
});
export const activePlayers = new Gauge({
  name: 'spaceflight_players',
  help: 'Current players in rooms',
  registers: [metrics]
});
