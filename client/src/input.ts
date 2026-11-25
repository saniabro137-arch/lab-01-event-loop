export function createInput(target: Window = window) {
  const down = new Set<string>();
  const pressed = new Set<string>();
  const handled = new Set(['ArrowUp','ArrowLeft','ArrowRight','Space']);
  const keydown = (event: KeyboardEvent) => { if (handled.has(event.code)) event.preventDefault(); if (!down.has(event.code)) pressed.add(event.code); down.add(event.code); };
  const keyup = (event: KeyboardEvent) => { if (handled.has(event.code)) event.preventDefault(); down.delete(event.code); };
  const blur = () => { down.clear(); pressed.clear(); };
  target.addEventListener('keydown', keydown);
  target.addEventListener('keyup', keyup);
  target.addEventListener('blur', blur);
  return {
    isDown: (code: string) => down.has(code),
    justPressed: (code: string) => { const found = pressed.has(code); pressed.delete(code); return found; },
    snapshot: () => ({ thrust: down.has('KeyW') || down.has('ArrowUp'), left: down.has('KeyA') || down.has('ArrowLeft'), right: down.has('KeyD') || down.has('ArrowRight'), brake: down.has('Space') }),
    dispose: () => { target.removeEventListener('keydown', keydown); target.removeEventListener('keyup', keyup); target.removeEventListener('blur', blur); },
  };
}
