import {createLoop} from '../loop.ts';
import {createInput} from '../input.ts';
import {createCanvas} from '../render/canvas.ts';
import {lerpWrapped} from '../sim/arena.ts';
import {lerpAngle} from '../sim/ship.ts';
import {World,Ship,Vector2,asteroid,pickup} from './model.ts';
import {loadAll,fetchJson,delay,ManifestSchema} from './assets.ts';
import {Lobby} from './lobby.ts';
import {mountLobby} from './lobby-dom.ts';
import {connectAudio} from './audio.ts';
import {puzzles} from './puzzles.ts';
function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error('Invalid element: ' + id);
  return found;
}

const $ = (id: string) => element(id, HTMLElement);
const {ctx} = createCanvas(element('arena', HTMLCanvasElement));
const faultSelect = element('fault', HTMLSelectElement);
const guided = element('guided', HTMLInputElement);
const input = createInput();
const lobby = new Lobby();
let audio: AudioContext | undefined;
let assets: Record<string, unknown> | undefined;
let controller: AbortController | undefined;
let loop: ReturnType<typeof createLoop> | undefined;
let generation = 0;
function progress(n: number,total: number){ctx.fillStyle='#081322';ctx.fillRect(0,0,1000,600);ctx.fillStyle='#23445d';ctx.fillRect(150,280,700,32);ctx.fillStyle='#63e8ff';ctx.fillRect(150,280,700*n/total,32);ctx.font='24px system-ui';ctx.fillText(`${Math.round(n/total*100)}% (${n}/${total})`,430,260);}
progress(0,1);
async function load(benchmark=false){controller?.abort();lobby.stop();$('lobby').hidden=true;const run=++generation;controller=new AbortController();const signal=controller.signal;const report=(n: number,total: number)=>{if(run===generation&&!signal.aborted)progress(n,total);};$('hud').textContent='';$('status').textContent='Завантаження ресурсів…';try{audio??=new AudioContext();await audio.resume();signal.throwIfAborted();const manifest=ManifestSchema.parse(await fetchJson('/lab3/manifest.json',signal));const fault=faultSelect.value;report(0,manifest.length);const first=manifest[0];if(fault==='404'&&first)first.url='/lab3/missing.png';if(fault==='json')manifest.push({id:'broken',type:'json',url:'/lab3/broken.json'});if(fault==='slow')await delay(4000,signal);if(fault==='timeout')await delay(5000,AbortSignal.any([signal,AbortSignal.timeout(700)]));if(benchmark){let t=performance.now();await loadAll(manifest,audio,signal,()=>{},true);const seq=performance.now()-t;t=performance.now();assets=await loadAll(manifest,audio,signal,report);$('output').textContent=`Sequential: ${seq.toFixed(2)} ms\nConcurrent: ${(performance.now()-t).toFixed(2)} ms (повторний прохід, кеш можливий)`;}else assets=await loadAll(manifest,audio,signal,report);if(run!==generation)return;signal.throwIfAborted();$('lobby').hidden=false;$('status').textContent='Ресурси готові';startLobby();}catch(e: unknown){if(run!==generation)return;controller.abort();const error=e instanceof Error?e:new Error(String(e));$('status').textContent=`Збій: ${error.name}: ${error.message}. Оберіть режим без збоїв та Retry.`;}}
$('load').onclick=()=>load();$('bench').onclick=()=>load(true);$('abort').onclick=()=>controller?.abort();$('puzzles').onclick=async()=>{$('output').textContent=await puzzles();};
const startLobby = mountLobby(lobby,element('lobby', HTMLFormElement),$('status'),(name,room)=>{
  const sprites = assets?.sprites;
  if (!audio || !assets || !(sprites instanceof ImageBitmap)) return;
  const world = new World();
  const findShip = () => [...world.ofKind('ship')].find(entity => entity instanceof Ship);world.spawn(new Ship());for(let i=0;i<room.asteroids;i++)world.spawn(asteroid(new Vector2(80+i*110,80+i%2*440)));world.spawn(pickup(new Vector2(750,300)));connectAudio(world,audio,assets);$('setup').hidden=true;$('controls').hidden=false;$('status').textContent=`${name} · ${room.name}`;loop=createLoop({simulate(dt){if(input.isDown('KeyF'))findShip()?.fire(world,guided.checked);world.step(dt,input.snapshot());if([...world.ofKind('asteroid')].length<room.asteroids)world.spawn(asteroid(new Vector2(30,Math.random()*600)));if(![...world.ofKind('pickup')].length)world.spawn(pickup(new Vector2(750,300)));},render(alpha,stats){ctx.fillStyle='#081322';ctx.fillRect(0,0,1000,600);ctx.fillStyle='#34516b';for(let i=0;i<90;i++)ctx.fillRect(i*173%1000,i*317%600,2,2);for(const e of world){ctx.save();ctx.translate(lerpWrapped(e.previous.x,e.position.x,alpha,1000),lerpWrapped(e.previous.y,e.position.y,alpha,600));if(e instanceof Ship)ctx.rotate(lerpAngle(e.previousAngle,e.angle,alpha));const index={ship:0,bullet:1,asteroid:2,pickup:3,particle:4}[e.kind];const size=e.radius*2.5;ctx.drawImage(sprites,index*64,0,64,64,-size/2,-size/2,size,size);ctx.restore();}const ship=findShip();$('hud').textContent=`HP: ${ship?.hp??0} | Рахунок: ${world.score} | Кадр: ${stats.frameMs.toFixed(1)} ms`;}});loop.start();});
$('leave').onclick=()=>{loop?.stop();$('hud').textContent='';$('setup').hidden=false;$('controls').hidden=true;$('lobby').hidden=false;startLobby();};
