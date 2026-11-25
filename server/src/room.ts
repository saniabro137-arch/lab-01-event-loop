import { EventEmitter } from 'node:events';
import type { WebSocket } from 'ws';
import type { EntityId } from 'space-flight-shared/types';
import type { CodecSchema } from 'space-flight-shared/protocol';
import type { z } from 'zod';
import type { Match } from './match.ts';

export type Codec = z.infer<typeof CodecSchema>;
export type Presence = { name: string; room: string };
export type Chat = Presence & { text: string; time: number };
export type RoomMessage =
  | ({ type: 'join' | 'leave' } & Presence)
  | ({ type: 'chat' } & Chat);

type RoomEvents = {
  join: [Presence];
  leave: [Presence];
  chat: [Chat];
  empty: [];
  error: [Error];
};

export class Room extends EventEmitter<RoomEvents> {
  readonly name: string;
  readonly players = new Map<WebSocket, string>();
  readonly gameSockets = new Map<EntityId, { socket: WebSocket; codec: Codec }>();
  match?: Match;

  constructor(name: string) {
    super();
    this.name = name;
    this.on('error', error => console.error('Room', this.name, error.message));
  }

  join(socket: WebSocket, name: string): void {
    this.players.set(socket, name);
    this.emit('join', { name, room: this.name });
  }

  leave(socket: WebSocket): void {
    const name = this.players.get(socket);
    if (name === undefined) return;
    this.players.delete(socket);
    this.emit('leave', { name, room: this.name });
    if (this.players.size === 0) this.emit('empty');
  }

  chat(socket: WebSocket, text: string): void {
    const name = this.players.get(socket);
    if (name === undefined) return;
    this.emit('chat', { name, room: this.name, text, time: Date.now() });
  }

  get size(): number {
    return this.players.size;
  }
}
