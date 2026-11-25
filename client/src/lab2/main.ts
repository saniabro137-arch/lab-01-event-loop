import {createLoop} from '../loop.ts';
import {createInput} from '../input.ts';
import {createCanvas} from '../render/canvas.ts';
import {lerpWrapped} from '../sim/arena.ts';
import {lerpAngle} from '../sim/ship.ts';
import {World,Ship,Entity,Vector2,asteroid,pickup} from './model.ts';
function element<T extends HTMLElement>(id: string, kind: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof kind)) throw new Error('Invalid element: ' + id);
  return found;
}

const $ = (id: string) => element(id, HTMLElement);
const { ctx } = createCanvas(element('arena', HTMLCanvasElement));
const guided = element('guided', HTMLInputElement);
const input = createInput();
let world = new World();
const findShip = () => [...world.ofKind('ship')].find(entity => entity instanceof Ship);
function reset(){world=new World();world.spawn(new Ship());for(let i=0;i<6;i++)world.spawn(asteroid(new Vector2(80+i*150,80+(i%2)*440),new Vector2(25+i*4,20-i*6)));world.spawn(pickup(new Vector2(750,300)));}
reset();$('reset').onclick=reset;
const fire=()=>{const ship=findShip();ship?.fire(world,guided.checked);};
const loop=createLoop({simulate(dt){if(input.justPressed('KeyR'))reset();if(input.isDown('KeyF'))fire();world.step(dt,input.snapshot());if([...world.ofKind('asteroid')].length<4)world.spawn(asteroid(new Vector2(30,30+Math.random()*540)));if(![...world.ofKind('pickup')].length)world.spawn(pickup(new Vector2(100+Math.random()*800,100+Math.random()*400)));},render(alpha,stats){ctx.fillStyle='#081322';ctx.fillRect(0,0,1000,600);ctx.fillStyle='#34516b';for(let i=0;i<90;i++)ctx.fillRect(i*173%1000,i*317%600,2,2);for(const e of world){ctx.save();ctx.translate(lerpWrapped(e.previous.x,e.position.x,alpha,1000),lerpWrapped(e.previous.y,e.position.y,alpha,600));ctx.strokeStyle=e.kind==='ship'?'#63e8ff':e.kind==='pickup'?'#61ef99':e.kind==='asteroid'?'#aeb9ce':'#ffcf70';ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=2;ctx.beginPath();if(e instanceof Ship){ctx.rotate(lerpAngle(e.previousAngle,e.angle,alpha));ctx.moveTo(19,0);ctx.lineTo(-12,-11);ctx.lineTo(-6,0);ctx.lineTo(-12,11);ctx.closePath();ctx.stroke();}else{ctx.arc(0,0,e.radius,0,Math.PI*2);if(['bullet','particle','pickup'].includes(e.kind))ctx.fill();else ctx.stroke();}ctx.restore();}const ship=findShip();$('hp').textContent=String(ship?.hp??0);$('score').textContent=String(world.score);$('respawn').textContent=world.respawn?`Респаун: ${world.respawn.toFixed(1)} с`:'';$('ms').textContent=stats.frameMs.toFixed(1);},onStats(s){$('fps').textContent=s.framesPerSecond.toFixed(1);$('sps').textContent=s.stepsPerSecond.toFixed(1);}});loop.start();
$('demo').onclick=()=>{const ship=findShip();if(!ship)return;const detached=ship.fire;let error;try{Reflect.apply(detached, undefined, [world]);}catch(e){error=e instanceof Error ? e.name : 'Unknown error';}const result={detached:error,shipPrototype:Object.getPrototypeOf(ship)===Ship.prototype,parentPrototype:Object.getPrototypeOf(Ship.prototype)===Entity.prototype,bound:typeof ship.fire.bind(ship)};console.log(result);$('output').textContent=JSON.stringify(result,null,2);};
