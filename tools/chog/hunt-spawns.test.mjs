import {test} from 'node:test';
import assert from 'node:assert/strict';
import {huntSpawnPlan,outsideHuntSpawns} from '../../src/game/hunt-spawns.js';
const level={spawnBarrier:4.2,spawnPads:[{x:0,y:2.4,z:-42},{x:0,y:2.4,z:42}]},players=Array.from({length:6},(_,i)=>({id:'p'+i}));
test('one carrier at one base and all five hunters at the opposite base for every holder',()=>{
 for(const holder of players){const plan=huntSpawnPlan(level,players,holder.id),carrier=plan.find(p=>p.id===holder.id),hunters=plan.filter(p=>p.id!==holder.id);
  assert.equal(carrier.z,-42);assert.equal(carrier.side,0);assert.equal(hunters.length,5);
  for(const p of hunters){assert.equal(p.side,1);assert.ok(Math.hypot(p.x,p.z-42)<1.401);assert.equal(p.y,2.4);assert.ok(Math.cos(p.yaw)<-.99);}
  for(const a of hunters)for(const b of hunters)if(a!==b)assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>.76);
 }
});
test('exclude both full spawn areas plus the chest footprint at every elevation',()=>{
 for(const pad of level.spawnPads){assert.equal(outsideHuntSpawns(pad,level),false);assert.equal(outsideHuntSpawns({...pad,x:6.9,y:100},level),false);assert.equal(outsideHuntSpawns({...pad,x:7.01},level),false);}
 assert.equal(outsideHuntSpawns({x:0,y:0,z:0},level),true);
});

test('loot stays well beyond spawn exits, including low ground beneath a base',()=>{
 for(const pad of level.spawnPads){assert.equal(outsideHuntSpawns({...pad,x:14.9,y:-10},level),false);assert.equal(outsideHuntSpawns({...pad,x:15.01},level),true);}
});
