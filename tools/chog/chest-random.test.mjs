import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomInt,tokenRoll,createChestLoot} from '../../src/game/chog-chest-random.js';
test('inclusive count bounds and token boundaries',()=>{
 assert.equal(randomInt(12,20,()=>0),12);assert.equal(randomInt(12,20,()=>.999999),20);
 assert.deepEqual(tokenRoll(()=>.009999),{amount:1,amountMilli:1000,jackpot:true});
 let values=[.01,0];assert.equal(tokenRoll(()=>values.shift()).amount,.005);
 values=[.01,.999999];assert.equal(tokenRoll(()=>values.shift()).amount,.1);
});
test('jackpot threshold covers exactly one percent of uniform unit interval',()=>{
 let jackpots=0;for(let i=0;i<10000;i++){let first=true;const r=tokenRoll(()=>{if(first){first=false;return (i+.5)/10000;}return .5;});if(r.jackpot)jackpots++;else assert.ok(r.amountMilli>=5&&r.amountMilli<=100);}
 assert.equal(jackpots,100);
});
test('all supported chest counts have four distinct traits and bounded random rewards',()=>{
 const traits=['a','b','c','d'].map(id=>({id}));
 for(let count=12;count<=20;count++)for(let round=0;round<50;round++){
  const loot=createChestLoot(traits,count);assert.equal(loot.length,count);
  assert.equal(new Set(loot.filter(x=>x.kind==='trait').map(x=>x.trait.id)).size,4);
  for(const e of loot)if(e.kind==='token')assert.ok(e.jackpot?e.amountMilli===1000:e.amountMilli>=5&&e.amountMilli<=100);
 }
});
