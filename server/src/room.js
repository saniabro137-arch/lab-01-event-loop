import { EventEmitter } from 'node:events';

export class Room extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.players = new Map();

    this.on('error', error => {
      console.error(`[${this.name}]`, error.message);
    });
  }

  join(socket, name) {
    this.players.set(socket, name);
    this.emit('join', { name, room: this.name });
  }

  leave(socket) {
    if (!this.players.has(socket)) return;

    const name = this.players.get(socket);
    this.players.delete(socket);
    this.emit('leave', { name, room: this.name });

    if (this.players.size === 0) {
      this.emit('empty');
    }
  }

  chat(socket, text) {
    if (!this.players.has(socket)) return;

    this.emit('chat', {
      name: this.players.get(socket),
      room: this.name,
      text,
      time: Date.now()
    });
  }

  get size() {
    return this.players.size;
  }
}
