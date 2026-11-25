export function connectAudio(
  world: EventTarget, context: AudioContext, assets: Record<string, unknown>
): void {
  for (const name of ['fired', 'hit', 'exploded']) {
    const buffer = assets[name];
    if (!(buffer instanceof AudioBuffer)) continue;
    world.addEventListener(name, () => {
      if (context.state !== 'running') return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = .22;
      source.connect(gain).connect(context.destination);
      source.start();
    });
  }
}
