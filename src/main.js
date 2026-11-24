import './style.css';
import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { createShip, integrate, lerpAngle } from './sim/ship.js';
import { ARENA, wrapShip, lerpWrapped } from './sim/arena.js';
import { createCanvas } from './render/canvas.js';
import { drawScene } from './render/draw.js';

const canvas = createCanvas(document.querySelector('#arena'));
const input = createInput();
const $ = (id) => document.getElementById(id);
const stars = Array.from({ length: 95 }, (_, i) => ({ x: (i * 173.71) % ARENA.width, y: (i * 317.13) % ARENA.height, size: i % 7 === 0 ? 2 : 1, phase: i * .72 }));
let previous = createShip();
let current = createShip();
let loop;
let measurements = [];
let measuring = false;
let measureStarted = 0;
let lastReport = '';
function reset() { previous = createShip(); current = createShip(); }
function startLoop() {
  loop?.stop(); reset();
  measurements = []; measuring = false; $('measure').disabled = false;
  const mode = $('mode').value;
  const loadMs = mode === 'variable' ? Number($('load').value) : 0;
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
  $('message').textContent = `Режим: ${$('mode').selectedOptions[0].text}.`;
}
function finishMeasurement() {
  measuring = false; $('measure').disabled = false;
  if (!measurements.length) return;
  const avg = (key) => measurements.reduce((s, v) => s + v[key], 0) / measurements.length;
  const max = (key) => Math.max(...measurements.map((v) => v[key]));
  const last = measurements.at(-1);
  lastReport = `Режим: ${$('mode').selectedOptions[0].text}
Навантаження: ${$('load').selectedOptions[0].text}
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
$('measure').addEventListener('click', () => { measurements = []; measuring = true; measureStarted = performance.now(); $('measure').disabled = true; $('result').textContent = 'Збір даних протягом 10 секунд…'; });
$('copy').addEventListener('click', async () => { if (lastReport) { await navigator.clipboard.writeText(lastReport); $('message').textContent = 'Результат скопійовано.'; } });
startLoop();
