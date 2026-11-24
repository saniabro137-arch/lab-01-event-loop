export function createLoop({ step = 1 / 60, simulate, render, mode = 'normal', loadMs = 0, onStats = () => {} }) {
  let running = false, handle = null, last = 0, accumulator = 0, frames = 0, totalFrames = 0, steps = 0, sampleStart = 0, frameTimes = [];
  let stats = { stepsPerSecond: 0, framesPerSecond: 0, frameMs: 0, jitterMs: 0 };
  const busyWait = (ms) => { const end = performance.now() + ms; while (performance.now() < end) { /* intentional main-thread block */ } };
  const tick = (now) => {
    if (!running) return;
    const rawMs = Math.max(0, now - last);
    const delta = Math.min(rawMs / 1000, 0.25);
    last = now;
    stats.frameMs = rawMs;
    frameTimes.push(rawMs);
    if (frameTimes.length > 120) frameTimes.shift();
    const mean = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    stats.jitterMs = Math.sqrt(frameTimes.reduce((sum, x) => sum + (x - mean) ** 2, 0) / frameTimes.length);
    if (mode === 'variable') { simulate(delta); steps++; render(1, stats); }
    else {
      accumulator += delta;
      let count = 0;
      while (accumulator >= step && count < 15) { simulate(step); accumulator -= step; steps++; count++; }
      if (count === 15) accumulator = 0;
      render(accumulator / step, stats);
    }
    frames++; totalFrames++;
    if (mode === 'block' && totalFrames % 60 === 0) busyWait(100);
    if (loadMs > 0) busyWait(loadMs);
    if (now - sampleStart >= 1000) {
      const seconds = (now - sampleStart) / 1000;
      stats = { ...stats, stepsPerSecond: steps / seconds, framesPerSecond: frames / seconds };
      onStats({ ...stats });
      frames = 0; steps = 0; sampleStart = now;
    }
    if (mode !== 'interval') handle = requestAnimationFrame(tick);
  };
  return {
    start() { if (running) return; running = true; accumulator = 0; last = performance.now(); sampleStart = last; frames = 0; totalFrames = 0; steps = 0; frameTimes = []; if (mode === 'interval') handle = setInterval(() => tick(performance.now()), 16); else handle = requestAnimationFrame(tick); },
    stop() { running = false; if (mode === 'interval') clearInterval(handle); else cancelAnimationFrame(handle); },
    getStats() { return { ...stats }; },
  };
}
