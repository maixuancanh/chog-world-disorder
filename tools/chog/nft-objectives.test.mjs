import test from 'node:test';
import assert from 'node:assert/strict';
import {HuntCore} from '../../src/game/hunt-core.js';
import {createChestLoot} from '../../src/game/chog-chest-random.js';
import {objectiveForToken,objectiveForModel,objectiveFromNft} from '../../src/game/chog-objectives.js';
const players=Array.from({length:6},(_,i)=>({id:'p'+i,canCarry:i===0,balance:10000}));
function start(objective){const c=new HuntCore({players,holderId:'p0',traits:objective.traits,objective});for(let i=0;i<7;i++)c.step(1);return c;}
test('token URI offset selects actual NFT traits, not the artwork number',()=>{
 const a=objectiveForToken('1'),b=objectiveForToken('2');
 assert.equal(a.name,'CHOG #1462');assert.equal(b.name,'CHOG #1463');
 assert.deepEqual(a.traits.map(t=>t.value),['MCGA','BTC Glass','Yellow 143 Jersey','Fwog']);
 assert.deepEqual(b.traits.map(t=>t.value),['Chog Cap','Modern VR','Mon Hoodie']);
 assert.equal(objectiveForModel('0697').name,'CHOG #697');
 assert.equal(objectiveForToken('0'),null);assert.equal(objectiveForModel('varsity'),null);
});
test('missing traits reduce objectives; absent values never become targets',()=>{
 const a=objectiveFromNft({name:'CHOG test',image:'https://example.com/nft.png',attributes:[{trait_type:'Body',value:'Blue Tee'},{trait_type:'Head',value:'None'}]});
 assert.equal(a.traits.length,1);assert.equal(a.traits[0].value,'Blue Tee');
 assert.equal(objectiveFromNft({attributes:[]}),null);
});
test('all Genesis NFTs have a genuine nonempty objective and safe card art',()=>{
 for(let i=1;i<=1969;i++){const o=objectiveForToken(String(i));assert.ok(o);assert.ok(o.traits.length>=1&&o.traits.length<=4);assert.equal(new Set(o.traits.map(t=>t.category)).size,o.traits.length);assert.ok(o.traits.every(t=>t.image&&t.value));}
});
test('each target appears in chest manifest and exact category/value is required',()=>{
 const o=objectiveForToken('2'),c=start(o),loot=createChestLoot(o.traits,12,()=>.4);
 for(const t of o.traits)assert.equal(loot.filter(e=>e.trait?.id===t.id).length,1);
 c.reveal('p0',{id:'fake',kind:'trait',trait:{...o.traits[0],value:'Wrong Hat'}});assert.equal(c.found.size,0);
 for(const [i,trait]of o.traits.entries())c.reveal('p0',{id:'real'+i,kind:'trait',trait});
 assert.equal(c.phase,'ending');assert.equal(c.winner,'p0');
});
test('nonholder capture inherits fixed NFT objective and progress and can complete it',()=>{
 const o=objectiveForModel('0697'),c=start(o);c.reveal('p0',{id:1,kind:'trait',trait:o.traits[0]});
 assert.ok(c.hit('p1','p0'));assert.equal(c.holderId,'p1');assert.equal(c.objective.name,'CHOG #697');assert.equal(c.found.size,1);
 for(let i=0;i<10;i++)c.step(1);
 c.reveal('p1',{id:2,kind:'trait',trait:o.traits[1]});assert.equal(c.winner,'p1');assert.equal(c.phase,'ending');
});

test('special 1:1 NFTs use their real Base and Tier instead of invented clothes',()=>{
 const o=objectiveForToken('561');assert.equal(o.name,'CHOG #53 — Blaze');
 assert.deepEqual(o.traits.map(t=>[t.category,t.value]),[['Base','1:1'],['Tier','Legendary']]);
});

test('verified wallet profile derives objectives after ownership resolution',async()=>{
 const {RewardService}=await import('../../server/rewards/service.mjs');
 const calls=[],service={assets:{version:2},nftXP:{resolve:async(wallet,tokenId)=>{calls.push([wallet,tokenId]);return {collection:'collection',tokenId:'2'};}},ledger:{nftProgress:()=>({level:7})}};
 const p=await RewardService.prototype.nftProfile.call(service,'wallet','2');
 assert.deepEqual(calls,[['wallet','2']]);assert.equal(p.objectiveNft.name,'CHOG #1463');assert.equal(p.objectiveNft.tokenId,'2');assert.equal(p.level,7);
 service.nftXP.resolve=async()=>{throw Error('NFT ownership changed');};
 await assert.rejects(()=>RewardService.prototype.nftProfile.call(service,'wallet','2'),/ownership changed/);
});
