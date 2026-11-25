export class RoomSocket extends EventTarget {
  constructor() {
    super();
    this.socket = null;
    this.queue = [];
    this.delay = 500;
    this.timer = null;
    this.active = false;
    this.joinData = null;
    this.joined = false;
  }

  connect(name, room, options = {}) {
    this.disconnect();
    this.active = true;
    this.delay = 500;
    this.joinData = { type: 'join', name, room, ...options };
    this.open();
  }

  notify(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  open() {
    if (!this.active) return;

    const protocol =
      location.protocol === 'https:' ? 'wss:' : 'ws:';

    const socket = new WebSocket(
      `${protocol}//${location.host}/ws`
    );

    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.joined = false;

    this.notify('status', 'Підключення...');

    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify(this.joinData));
    };

    socket.onmessage = event => {
      if (this.socket !== socket) return;

      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      this.notify('received', event.data);

      if (data.type === 'joined') {
        this.joined = true;
        this.delay = 500;
        this.notify('status', 'Підключено');

        for (const message of this.queue.splice(0)) {
          socket.send(JSON.stringify(message));
        }
      }

      this.notify('message', data);
    };

    socket.onerror = () => {
      this.notify('status', 'Помилка WebSocket');
    };

    socket.onclose = event => {
      if (this.socket !== socket) return;

      this.joined = false;

      if ([1000, 1003, 1007, 1008, 1009].includes(event.code)) {
        this.active = false;
        this.notify('status', `З'єднання закрито: ${event.code}`);
        return;
      }

      if (!this.active) return;

      this.notify(
        'status',
        `Повторне підключення через ${this.delay} мс`
      );

      this.timer = setTimeout(() => this.open(), this.delay);
      this.delay = Math.min(this.delay * 2, 10000);
    };
  }

  sendFrame(frame) {
    if (!this.joined || this.socket?.readyState !== WebSocket.OPEN ||
        this.socket.bufferedAmount >= 65536) return false;
    this.socket.send(frame);
    return true;
  }

  send(message) {
    if (!this.active) return false;

    if (
      this.joined &&
      this.socket?.readyState === WebSocket.OPEN
    ) {
      this.socket.send(JSON.stringify(message));
      return true;
    }

    if (this.queue.length >= 10) return false;

    this.queue.push(message);
    return true;
  }

  disconnect() {
    this.active = false;
    this.joined = false;

    clearTimeout(this.timer);

    const socket = this.socket;
    this.socket = null;

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'leave' }));
      socket.close(1000);
    } else if (socket?.readyState === WebSocket.CONNECTING) {
      socket.close();
    }

    this.queue = [];
    this.notify('status', 'Відключено');
  }
}
