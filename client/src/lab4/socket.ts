import { decodeSnapshot } from 'space-flight-shared/codec';
import { parseServerJSON } from 'space-flight-shared/protocol';
import type { ClientMessage, ServerMessage } from 'space-flight-shared/protocol';

type Join = Extract<ClientMessage, { type: 'join' }>;
type JoinOptions = Pick<Join, 'game' | 'codec'>;

type SocketEvents = {
  status: string;
  message: ServerMessage;
  received: string | ArrayBuffer;
};

export class RoomSocket extends EventTarget {
  private socket: WebSocket | null;
  private queue: ClientMessage[];
  private delay: number;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: boolean;
  private joinData: Join | null;
  joined: boolean;

  subscribe<K extends keyof SocketEvents>(
    type: K, handler: (detail: SocketEvents[K]) => void
  ): void {
    this.addEventListener(type, event => {
      if (!(event instanceof CustomEvent)) return;
      // notify links each event name to the corresponding payload type.
      handler(event.detail as SocketEvents[K]);
    });
  }

  constructor() {
    super();
    this.socket = null;
    this.queue = [];
    this.delay = 500;
    this.timer = undefined;
    this.active = false;
    this.joinData = null;
    this.joined = false;
  }

  connect(name: string, room: string, options: JoinOptions = {}) {
    this.disconnect();
    this.active = true;
    this.delay = 500;
    this.joinData = { type: 'join', name, room, ...options };
    this.open();
  }

  private notify<K extends keyof SocketEvents>(type: K, detail: SocketEvents[K]) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private open() {
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
      if (this.socket !== socket || !this.joinData) return;
      socket.send(JSON.stringify(this.joinData));
    };

    socket.onmessage = event => {
      if (this.socket !== socket) return;

      const frame: unknown = event.data;
      let data: ServerMessage;
      if (typeof frame === 'string') {
        const parsed = parseServerJSON(frame);
        if (!parsed.success) {
          console.warn('Invalid server JSON');
          socket.close(4007, 'Invalid server JSON');
          return;
        }
        data = parsed.data;
      } else if (frame instanceof ArrayBuffer) {
        try {
          data = decodeSnapshot(frame);
        } catch (error: unknown) {
          console.warn('Invalid server binary packet', error);
          socket.close(4007, 'Invalid server binary packet');
          return;
        }
      } else {
        socket.close(4007, 'Unsupported frame');
        return;
      }
      this.notify('received', frame);

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

      if ([1000, 1003, 1007, 1008, 1009, 4007].includes(event.code)) {
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

  sendFrame(frame: string | ArrayBuffer) {
    if (!this.joined || this.socket?.readyState !== WebSocket.OPEN ||
        this.socket.bufferedAmount >= 65536) return false;
    this.socket.send(frame);
    return true;
  }

  send(message: ClientMessage) {
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
