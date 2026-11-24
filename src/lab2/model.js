import { integrate } from '../sim/ship.js';
import { ARENA, wrap } from '../sim/arena.js';
export class Vector2 {
  constructor(x=0,y=0){this.x=x;this.y=y;}
  add(v){return new Vector2(this.x+v.x,this.y+v.y);}
  sub(v){return new Vector2(this.x-v.x,this.y-v.y);}
  scale(k){return new Vector2(this.x*k,this.y*k);}
  get length(){return Math.hypot(this.x,this.y);}
  normalized(){return this.scale(this.length ? 1/this.length : 0);}
}
export class Entity {
  static #id=0;
  constructor(kind,position=new Vector2(),velocity=new Vector2(),radius=10){Object.assign(this,{id:++Entity.#id,kind,position,previous:position,velocity,radius,dead:false,components:[]});}
  update(dt,world){for(const component of this.components) component(this,dt,world);this.position=this.position.add(this.velocity.scale(dt));}
}
export class Ship extends Entity {
  #hp=100;
  get hp(){return this.#hp;}
  constructor(position=new Vector2(500,300)){super('ship',position,new Vector2(),15);this.angle=-Math.PI/2;this.previousAngle=this.angle;this.cooldown=0;}
  damage(n){this.#hp=Math.max(0,Math.min(100,this.#hp-n));}
  update(dt,world){this.previousAngle=this.angle;const s=integrate({x:this.position.x,y:this.position.y,vx:this.velocity.x,vy:this.velocity.y,angle:this.angle},world.input,dt);this.position=new Vector2(s.x,s.y);this.velocity=new Vector2(s.vx,s.vy);this.angle=s.angle;this.cooldown=Math.max(0,this.cooldown-dt);}
  fire(world, guided=false){if(this.dead||this.cooldown>0)return;this.cooldown=.18;const dir=new Vector2(Math.cos(this.angle),Math.sin(this.angle));const b=new Entity('bullet',this.position.add(dir.scale(22)),this.velocity.add(dir.scale(420)),4);b.owner=this.id;b.components.push(ttl(1.8));if(guided)b.components.push(homing);world.spawn(b);return b;}
}
export const ttl=seconds=>(entity,dt,world)=>{entity.life=(entity.life??seconds)-dt;if(entity.life<=0)world.despawn(entity.id);};
export function delta(a,b){let x=b.x-a.x,y=b.y-a.y;x-=Math.round(x/ARENA.width)*ARENA.width;y-=Math.round(y/ARENA.height)*ARENA.height;return new Vector2(x,y);}
export function homing(e,dt,w){let best=null,d=Infinity;for(const a of w.ofKind('asteroid')){const v=delta(e.position,a.position);if(v.length<d){best=v;d=v.length;}}if(best)e.velocity=e.velocity.scale(Math.exp(-4*dt)).add(best.normalized().scale(420*(1-Math.exp(-4*dt))));}
export function pickup(position){const e=new Entity('pickup',position,new Vector2(),12);e.collect=ship=>ship.damage(-25);return e;}
export function asteroid(position,velocity=new Vector2(35,20)){const e=new Entity('asteroid',position,velocity,24);e.hp=2;return e;}
export function overlaps(a,b){return delta(a.position,b.position).length<=a.radius+b.radius;}
export function collisions(w){const all=[...w];for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];if(a.dead||b.dead||!overlaps(a,b))continue;const bullet=a.kind==='bullet'?a:b.kind==='bullet'?b:null;const other=bullet===a?b:a;if(bullet&&other.id!==bullet.owner&&['ship','asteroid'].includes(other.kind)){w.despawn(bullet.id);if(other.kind==='ship'){other.damage(25);if(!other.hp)w.destroy(other);}else if(--other.hp<=0){w.score+=100;w.destroy(other);}continue;}const ship=a.kind==='ship'?a:b.kind==='ship'?b:null;const target=ship===a?b:a;if(ship&&target.kind==='pickup'){target.collect(ship);w.despawn(target.id);w.score+=25;}if(ship&&target.kind==='asteroid'){ship.damage(25);w.destroy(target);if(!ship.hp)w.destroy(ship);}}}
export class World {
  entities=new Map();dead=new Set();score=0;input={};respawn=0;
  spawn(e){this.entities.set(e.id,e);return e;}
  despawn(id){const e=this.entities.get(id);if(e){e.dead=true;this.dead.add(id);}}
  *[Symbol.iterator](){yield* this.entities.values();}
  *ofKind(kind){for(const e of this)if(!e.dead&&e.kind===kind)yield e;}
  destroy(e){if(e.dead)return;this.despawn(e.id);if(e.kind==='ship')this.respawn=2;for(let i=0;i<18;i++){const angle=i*Math.PI/9;const p=new Entity('particle',e.position,new Vector2(Math.cos(angle)*100,Math.sin(angle)*100),2);p.components.push(ttl(.5));this.spawn(p);}}
  step(dt,input={}){this.input=input;const waiting=this.respawn>0;for(const e of [...this])if(!e.dead){e.previous=e.position;e.update(dt,this);e.position=new Vector2(wrap(e.position.x,ARENA.width),wrap(e.position.y,ARENA.height));}collisions(this);for(const id of this.dead)this.entities.delete(id);this.dead.clear();if(waiting){this.respawn=Math.max(0,this.respawn-dt);if(this.respawn<1e-9){this.respawn=0;this.spawn(new Ship());}}}
}
