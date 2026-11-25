import test from 'node:test';import assert from 'node:assert/strict';import {Vector2,Entity,Ship,World,asteroid,pickup,ttl,overlaps} from '../src/lab2/model.js';
test('pure vectors and unique IDs',()=>{const v=new Vector2(1,2);assert.deepEqual(v.add(new Vector2(2,3)),new Vector2(3,5));assert.equal(v.x,1);assert.notEqual(new Entity('a').id,new Entity('a').id);});
test('TTL and sweep',()=>{const w=new World();const e=w.spawn(new Entity('bullet'));e.components.push(ttl(.1));w.step(.2);assert.equal(w.entities.size,0);});
test('fire and this',()=>{const w=new World(),s=w.spawn(new Ship());const f=s.fire;assert.throws(()=>f(w),TypeError);assert.equal(s.fire(w).owner,s.id);});
test('collision and score',()=>{const w=new World();const a=w.spawn(asteroid(new Vector2(100,100),new Vector2()));a.hp=1;w.spawn(new Entity('bullet',a.position));w.step(1/60);assert.equal(w.score,100);assert.equal([...w.ofKind('asteroid')].length,0);});
test('pickup and respawn',()=>{const w=new World(),s=w.spawn(new Ship());s.damage(50);w.spawn(pickup(s.position));w.step(1/60);assert.equal(s.hp,75);w.destroy(s);for(let i=0;i<120;i++)w.step(1/60);assert.equal([...w.ofKind('ship')][0].hp,100);});
test('wrap collision',()=>assert.ok(overlaps(new Entity('a',new Vector2(2,0)),new Entity('b',new Vector2(998,0)))));
