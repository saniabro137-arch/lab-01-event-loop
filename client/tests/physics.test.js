import test from 'node:test';
import assert from 'node:assert/strict';
import { createShip, integrate, lerpAngle } from '../src/sim/ship.js';
import { wrap, lerpWrapped } from '../src/sim/arena.js';
test('integrate is pure and deterministic', () => { const ship = createShip(); const input = { thrust:true, left:false, right:false, brake:false }; const a = integrate(ship,input,1/60); const b = integrate(ship,input,1/60); assert.deepEqual(a,b); assert.deepEqual(ship,createShip()); assert.ok(a.y < ship.y); });
test('wrap and wrap interpolation', () => { assert.equal(wrap(-5,100),95); assert.equal(wrap(105,100),5); assert.equal(lerpWrapped(98,2,.5,100),0); });
test('shortest angle interpolation', () => { const result = lerpAngle(Math.PI - .1,-Math.PI + .1,.5); assert.ok(Math.abs(Math.abs(result)-Math.PI)<.001); });
