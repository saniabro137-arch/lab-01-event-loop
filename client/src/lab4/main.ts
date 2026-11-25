import { RoomSocket } from './socket.ts';
import { CodecSchema, RoomListSchema } from 'space-flight-shared/protocol';

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error('Missing element: ' + id);
  return element;
}

function input(id: string): HTMLInputElement {
  const element = $(id);
  if (!(element instanceof HTMLInputElement)) throw new Error('Expected input: ' + id);
  return element;
}
export const socket = new RoomSocket();
const players = new Set<string>();

function log(text: string) {
  const line = document.createElement('div');
  line.textContent = text;
  $('messages').append(line);
  $('messages').scrollTop = $('messages').scrollHeight;
}

function renderPlayers() {
  $('players').textContent =
    [...players].join(', ') || 'Немає гравців';
}

async function refresh() {
  try {
    const response = await fetch('/api/rooms');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const value: unknown = await response.json();
    const rooms = RoomListSchema.parse(value);

    $('rooms').textContent = rooms.map(
      r => `${r.name} (${r.players})`
    ).join(' | ') || 'Немає кімнат';
  } catch {
    $('rooms').textContent = 'Сервер недоступний';
  }
}

socket.subscribe('status', status => {
  $('status').textContent = status;
});

socket.subscribe('message', data => {
  switch (data.type) {
    case 'joined':
      players.clear();
      for (const name of data.players ?? []) {
        players.add(name);
      }
      log(`Вхід до кімнати ${data.room}`);
      break;

    case 'join':
      players.add(data.name);
      log(`${data.name} приєднався`);
      break;

    case 'leave':
      players.delete(data.name);
      log(`${data.name} залишив кімнату`);
      break;

    case 'chat':
      log(`${data.name}: ${data.text}`);
      break;
    case 'shutdown':
      log('Сервер завершує роботу.');
      return;

    case 'snapshot':
    case 'pong':
      return;
    default: {
      const unexpected: never = data;
      return unexpected;
    }
  }

  renderPlayers();
  void refresh();
});

$('join').onclick = async () => {
  const name = input('name').value.trim();
  const room = input('room').value.trim();

  if (!name || !room) {
    log("Введіть ім'я та кімнату");
    return;
  }

  try {
    const response = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: room })
    });

    if (!response.ok && response.status !== 409) {
      throw new Error('HTTP ' + response.status);
    }

    players.clear();
    renderPlayers();
    socket.connect(name, room, {
      game: Boolean($('arena')),
      codec: CodecSchema.safeParse(new URLSearchParams(location.search).get('codec')).data
    });
  } catch (error) {
    log(error instanceof Error ? error.message : String(error));
  }
};

$('leave').onclick = () => {
  socket.disconnect();
  players.clear();
  renderPlayers();
  setTimeout(refresh, 300);
};

$('refresh').onclick = refresh;

$('chat').onsubmit = event => {
  event.preventDefault();
  const text = input('text').value.trim();

  if (!text) return;

  if (socket.send({ type: 'chat', text })) {
    input('text').value = '';
  } else {
    log('Повідомлення не надіслано');
  }
};

void refresh();
