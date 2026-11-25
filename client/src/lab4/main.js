import { RoomSocket } from './socket.js';

const $ = id => document.getElementById(id);
export const socket = new RoomSocket();
const players = new Set();

function log(text) {
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
    const rooms = await response.json();

    $('rooms').textContent = rooms.map(
      r => `${r.name} (${r.players})`
    ).join(' | ') || 'Немає кімнат';
  } catch {
    $('rooms').textContent = 'Сервер недоступний';
  }
}

socket.addEventListener('status', event => {
  $('status').textContent = event.detail;
});

socket.addEventListener('message', event => {
  const data = event.detail;

  if (data instanceof ArrayBuffer || data.type === 'snapshot' || data.type === 'pong') return;

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
  }

  renderPlayers();
  refresh();
});

$('join').onclick = async () => {
  const name = $('name').value.trim();
  const room = $('room').value.trim();

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
      codec: new URLSearchParams(location.search).get('codec')
    });
  } catch (error) {
    log(error.message);
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
  const text = $('text').value.trim();

  if (!text) return;

  if (socket.send({ type: 'chat', text })) {
    $('text').value = '';
  } else {
    log('Повідомлення не надіслано');
  }
};

refresh();
