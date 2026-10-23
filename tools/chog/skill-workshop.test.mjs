import test from 'node:test';
import assert from 'node:assert/strict';
import {workshopIdentity,workshopOptions,defaultWorkshopSkill,validateWorkshopSkill,resolveWorkshopSkill,loadWorkshopSkill,saveWorkshopSkill,applyWorkshopSkill,workshopIncoming,workshopOutgoing} from '../../src/game/skill-workshop.js';
import {objectiveForModel} from '../../src/game/chog-objectives.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const nft={...objectiveForModel('1462'),contract:'0x'+'ab'.repeat(20),tokenId:'1'};
const progress={identity:workshopIdentity(nft),wins:3};
const recipe=(patch={})=>({...defaultWorkshopSkill(nft),...patch});
test('guest has a validated usable heal with explicit fixed facts',()=>{
 const r=defaultWorkshopSkill(null),facts=resolveWorkshopSkill(r,null);assert.equal(r.identity,'guest');assert.equal(facts.amount,18);assert.equal(facts.cooldown,18);assert.equal(facts.cost,2);
});
test('every fresh NFT role has real burst versus frequency choices while advanced recipes remain locked',()=>{
 const roles=new Set();
 for(let id=1;id<=100;id++){
  const fresh={...objectiveForModel(String(id)),contract:nft.contract,tokenId:String(id)},options=workshopOptions(fresh,{identity:workshopIdentity(fresh),wins:0});roles.add(options.role);
  const valid=[];for(const effect of options.effects)for(const target of options.targets)for(const modifier of options.modifiers){try{valid.push(resolveWorkshopSkill({...defaultWorkshopSkill(fresh),effect:effect.id,target:target.id,modifier:modifier.id},fresh));}catch{}}
  assert.ok(valid.length>=2,'Fresh '+options.role+' must have multiple valid recipes');
  const steady=valid.find(s=>s.effect==='mend'&&s.modifier==='steady'),quick=valid.find(s=>s.effect==='mend'&&s.modifier==='quick');assert.equal(steady.amount/steady.cooldown,quick.amount/quick.cooldown);assert.ok(quick.amount<steady.amount&&quick.cooldown<steady.cooldown);
  assert.equal(options.targets.find(o=>o.id==='nearby').unlocked,false);for(const id of ['lasting','focused'])assert.equal(options.modifiers.find(o=>o.id===id).unlocked,false);
  if(options.role==='breaker')assert.ok(valid.some(s=>s.effect==='empower'));if(options.role==='guardian')assert.ok(valid.some(s=>s.effect==='ward'));
 }
 assert.ok(['breaker','guardian','medic'].every(role=>roles.has(role)));
});
test('identity canonicalizes collection and token; per NFT storage cannot leak selections',()=>{
 assert.equal(workshopIdentity({...nft,contract:nft.contract.toUpperCase().replace('0X','0x'),tokenId:'001'}),workshopIdentity(nft));
 assert.notEqual(workshopIdentity({...nft,contract:'0x'+'cd'.repeat(20)}),workshopIdentity(nft));
 const rows=new Map(),storage={getItem:k=>rows.get(k),setItem:(k,v)=>rows.set(k,v)};
 const saved=saveWorkshopSkill(storage,recipe({modifier:'focused'}),nft,progress);assert.deepEqual(loadWorkshopSkill(storage,nft,progress),saved);
 assert.deepEqual(loadWorkshopSkill(storage,{...nft,tokenId:2},progress),defaultWorkshopSkill({...nft,tokenId:2}));
 assert.deepEqual(loadWorkshopSkill(storage,nft,{identity:progress.identity,wins:0}),defaultWorkshopSkill(nft));
});
test('unlock counts require exact identity and options require real trait role',()=>{
 assert.throws(()=>validateWorkshopSkill(recipe({target:'nearby'}),nft,{wins:999}));
 assert.throws(()=>validateWorkshopSkill(recipe({modifier:'focused'}),nft,{identity:progress.identity+':wrong',wins:999}));
 const options=workshopOptions(nft,progress);for(const e of options.effects.filter(e=>e.role&& !e.traitValid))assert.throws(()=>validateWorkshopSkill(recipe({effect:e.id}),nft,progress));
 assert.doesNotThrow(()=>validateWorkshopSkill(recipe({target:'nearby'}),nft,progress));
});
test('tampered stats, extra fields, versions, identity, arbitrary and overbudget combinations reject',()=>{
 for(const patch of [{amount:999},{cooldown:0},{version:2},{identity:'guest'},{effect:'execute'},{target:'world'},{modifier:'free'},{target:'nearby',modifier:'focused'},{modifier:'lasting'}])assert.throws(()=>validateWorkshopSkill(recipe(patch),nft,progress));
 assert.throws(()=>validateWorkshopSkill(Object.assign(Object.create({}),recipe()),nft,progress));
});
const pos=x=>({distanceTo:other=>Math.abs(x-other.x),x});
test('mend changes HP with cap, squad excludes enemies and out of range, dead actors cannot cast',()=>{
 const actor={huntId:'a',alive:true,hp:90,pos:pos(0),team:0},ally={huntId:'b',alive:true,hp:50,pos:pos(3),team:0},enemy={huntId:'c',alive:true,hp:50,pos:pos(3),team:1},far={huntId:'d',alive:true,hp:50,pos:pos(9),team:0},stats=new Map([['a',{healing:0}]]);
 const result=applyWorkshopSkill({actor,actors:[actor,ally,enemy,far],recipe:recipe({target:'nearby'}),nft,progress,clock:1,buffs:new Map(),stats});assert.equal(result.radius,8);assert.equal(actor.hp,100);assert.equal(ally.hp,68);assert.equal(enemy.hp,50);assert.equal(far.hp,50);assert.equal(stats.get('a').healing,28);
 actor.alive=false;assert.equal(applyWorkshopSkill({actor,actors:[actor],recipe:recipe(),nft,progress,clock:2,buffs:new Map(),stats}),false);
});
test('trait-valid damage and guard buffs change actual damage then expire without altering raid buffs',()=>{
 for(const effect of ['empower','ward']){
  let source;for(let i=1;i<100;i++){const candidate={...objectiveForModel(String(i)),contract:nft.contract,tokenId:'1'};if(workshopOptions(candidate,progress).effects.find(e=>e.id===effect).unlocked){source=candidate;break;}}
  assert.ok(source);const actor={huntId:'a',alive:true,hp:100,pos:pos(0),team:0},buffs=new Map([['a',{power:12,guard:12}]]),stats=new Map([['a',{blocked:0}]]);
  applyWorkshopSkill({actor,actors:[actor],recipe:recipe({effect,modifier:'lasting'}),nft:source,progress,clock:1,buffs,stats});assert.equal(buffs.get('a').power,12);
  if(effect==='empower'){assert.equal(workshopOutgoing(actor,100,2,buffs),112.00000000000001);assert.equal(workshopOutgoing(actor,100,7,buffs),100);}
  else {assert.equal(workshopIncoming(actor,100,2,buffs,stats),85);assert.equal(stats.get('a').blocked,15);assert.equal(workshopIncoming(actor,100,7,buffs,stats),100);}
 }
});
test('Boss F selected workshop heals once per cooldown; old damage/guard and raid selections remain available',()=>{
 // Execute the actual runtime class with rendering dependencies stubbed. No browser or three package required.
 const source=readFileSync(new URL('../../src/game/boss-raid-runtime.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export class BossRaidRuntime','class BossRaidRuntime');
 const context=vm.createContext({workshopIdentity,defaultWorkshopSkill,validateWorkshopSkill,resolveWorkshopSkill,applyWorkshopSkill,workshopIncoming,workshopOutgoing,G:{},THREE:{Vector3:class{} }});
 vm.runInContext(source+'\nglobalThis.Runtime=BossRaidRuntime;',context);
 const r=Object.create(context.Runtime.prototype),a={huntId:'a',alive:true,hp:60,pos:pos(0),team:0,raidSkill:'workshop',workshopSkill:recipe(),workshopNft:nft,workshopProgress:progress};
 Object.assign(r,{actors:[a],match:{state:'playing',local:a},core:{players:new Map([['a',{left:false}]])},clock:0,buffs:new Map(),stats:new Map([['a',{healing:0,blocked:0}]]),workshopCooldowns:new Map(),events:[],eventId:0,shield:true});
 assert.equal(r.ability('a'),true);assert.equal(a.hp,78);assert.equal(r.workshopCooldowns.get('a'),18);assert.equal(r.ability('a'),false);assert.equal(a.hp,78);r.clock=18;assert.equal(r.ability('a'),true);assert.equal(a.hp,96);
 r.buffs.set('a',{power:30,guard:30,guardian:'a'});assert.equal(r.outgoing(a,100),74.75);assert.equal(r.incoming(a,100),80);assert.equal(r.stats.get('a').blocked,20);
 a.raidSkill='trait';a.raidNft=null;assert.equal(r.ability('a'),false);assert.equal(r.events[0].type,'workshop-ability');
});
