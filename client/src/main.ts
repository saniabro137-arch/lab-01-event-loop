import './style.css';
import { createLoop } from './loop.ts';
import { createInput } from './input.ts';
import { createShip, integrate, lerpAngle } from './sim/ship.ts';
import { ARENA, wrapShip, lerpWrapped } from './sim/arena.ts';
import { createCanvas } from './render/canvas.ts';
import { drawScene } from './render/draw.ts';

import type { LoopStats } from './loop.ts';

function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const result = document.getElementById(id);
  if (!(result instanceof kind)) throw new Error('Invalid element: ' + id);
  return result;
}

const canvas = createCanvas(element('arena', HTMLCanvasElement));
const input = createInput();
const $ = (id: string) => element(id, HTMLElement);
const measure = element('measure', HTMLButtonElement);
const modeSelect = element('mode', HTMLSelectElement);
const loadSelect = element('load', HTMLSelectElement);

interface Measurement extends LoopStats {
  x: number;
  y: number;
  elapsed: number;
}

const stars = Array.from({ length: 95 }, (_, i) => ({ x: (i * 173.71) % ARENA.width, y: (i * 317.13) % ARENA.height, size: i % 7 === 0 ? 2 : 1, phase: i * .72 }));
let previous = createShip();
let current = createShip();
let loop: ReturnType<typeof createLoop> | undefined;
let measurements: Measurement[] = [];
let measuring = false;
let measureStarted = 0;
let lastReport = '';
function reset() { previous = createShip(); current = createShip(); }
function startLoop() {
  loop?.stop(); reset();
  measurements = []; measuring = false; measure.disabled = false;
  const mode = modeSelect.value;
  if (mode !== 'normal' && mode !== 'variable' && mode !== 'block' && mode !== 'interval') {
    throw new Error('Unknown loop mode: ' + mode);
  }
  const loadMs = mode === 'variable' ? Number(loadSelect.value) : 0;
  loop = createLoop({
    mode, loadMs,
    simulate(dt) {
      if (input.justPressed('KeyR')) reset();
      previous = { ...current };
      current = wrapShip(integrate(current, input.snapshot(), dt));
    },
    render(alpha, stats) {
      const ship = { ...current,
        x: lerpWrapped(previous.x, current.x, alpha, ARENA.width),
        y: lerpWrapped(previous.y, current.y, alpha, ARENA.height),
        angle: lerpAngle(previous.angle, current.angle, alpha),
      };
      drawScene(canvas.ctx, ship, stars, performance.now());
      $('ms').textContent = stats.frameMs.toFixed(1);
      $('jitter').textContent = stats.jitterMs.toFixed(1);
    },
    onStats(stats) {
      $('sps').textContent = stats.stepsPerSecond.toFixed(1);
      $('fps').textContent = stats.framesPerSecond.toFixed(1);
      if (measuring) {
        measurements.push({ ...stats, x: current.x, y: current.y, elapsed: (performance.now() - measureStarted) / 1000 });
        if (performance.now() - measureStarted >= 10000) finishMeasurement();
      }
    },
  });
  loop.start();
  $('message').textContent = `Режим: ${(modeSelect.selectedOptions[0]?.text ?? modeSelect.value)}.`;
}
function finishMeasurement() {
  measuring = false; measure.disabled = false;
  const last = measurements.at(-1);
  if (!last) return;
  const avg = (key: keyof LoopStats) => measurements.reduce((s, v) => s + v[key], 0) / measurements.length;
  const max = (key: keyof LoopStats) => Math.max(...measurements.map((v) => v[key]));
  lastReport = `Режим: ${(modeSelect.selectedOptions[0]?.text ?? modeSelect.value)}
Навантаження: ${(loadSelect.selectedOptions[0]?.text ?? loadSelect.value)}
Тривалість: ${last.elapsed.toFixed(2)} с (${measurements.length} вибірок)
Середні steps/s: ${avg('stepsPerSecond').toFixed(2)}
Середні frames/s: ${avg('framesPerSecond').toFixed(2)}
Середній час кадру: ${avg('frameMs').toFixed(2)} мс
Макс. час кадру (вибірки): ${max('frameMs').toFixed(2)} мс
Середній jitter (σ): ${avg('jitterMs').toFixed(2)} мс
Позиція корабля: x=${last.x.toFixed(2)}, y=${last.y.toFixed(2)}
Дата: ${new Date().toLocaleString('uk-UA')}`;
  $('result').textContent = lastReport;
  $('message').textContent = 'Вимірювання завершено. Скопіюй числа до README.';
}
$('mode').addEventListener('change', startLoop);
$('load').addEventListener('change', startLoop);
$('restart').addEventListener('click', reset);
$('measure').addEventListener('click', () => { measurements = []; measuring = true; measureStarted = performance.now(); measure.disabled = true; $('result').textContent = 'Збір даних протягом 10 секунд…'; });
$('copy').addEventListener('click', async () => { if (lastReport) { await navigator.clipboard.writeText(lastReport); $('message').textContent = 'Результат скопійовано.'; } });
startLoop();
