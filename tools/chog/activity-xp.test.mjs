import test from 'node:test';import assert from 'node:assert/strict';
import {matchExperience} from '../../src/game/chog-progression.js';
import {HuntCore} from '../../src/game/hunt-core.js';
test('different activity changes XP; capped actions cannot farm unbounded rewards',()=>{
 const idle=matchExperience(false,false,{}),active=matchExperience(false,false,{captures:1,traits:2,supplies:1,loot:1,stuns:2});assert.ok(active.total>idle.total);assert.equal(active.total,1060);
 assert.throws(()=>matchExperience(false,false,{captures:999}),/activity/);assert.equal(matchExperience(true,true,{captures:1}).total,0);
});
test('core records real actions, not repeated hits on stunned victims or repeated trait/chest events',()=>{
 const traits=Array.from({length:4},(_,i)=>({id:'t'+i})),c=new HuntCore({players:Array.from({length:6},(_,i)=>({id:'p'+i})),traits,holderId:'p0'});c.phase='playing';
 c.hit('p0','p1');c.hit('p0','p1');assert.equal(c.players.get('p0').activity.stuns,1);
 c.reveal('p0',{id:'one',kind:'trait',trait:traits[0]});c.reveal('p0',{id:'two',kind:'trait',trait:traits[0]});assert.equal(c.players.get('p0').activity.traits,1);
 c.addDrop('drop',20);c.collectDrop('p0','drop');c.collectDrop('p0','drop');assert.equal(c.players.get('p0').activity.supplies,1);assert.equal(c.players.get('p0').activity.loot,1);
 c.hit('p2','p0');assert.equal(c.players.get('p2').activity.captures,1);
});
