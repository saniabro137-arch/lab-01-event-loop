import type { Lobby, LobbyRoom } from './lobby.ts';

export function mountLobby(
  lobby: Lobby, form: HTMLFormElement, status: HTMLElement,
  onJoin: (name: string, room: LobbyRoom) => void
): () => void {
  const select = form.elements.namedItem('room');
  const player = form.elements.namedItem('player');
  if (!(select instanceof HTMLSelectElement) || !(player instanceof HTMLInputElement)) {
    throw new Error('Missing lobby controls');
  }

  let rooms: LobbyRoom[] = [];
  form.addEventListener('submit', event => {
    event.preventDefault();
    const room = rooms.find(item => item.id === select.value);
    if (!room) return;
    lobby.stop();
    onJoin(player.value.trim(), room);
  });

  return () => lobby.start(items => {
    const old = select.value;
    rooms = items;
    select.replaceChildren(...rooms.map(room => new Option(room.name, room.id)));
    if (rooms.some(room => room.id === old)) select.value = old;
    status.textContent = 'Кімнати оновлено';
  }, message => {
    status.textContent = message;
  });
}
