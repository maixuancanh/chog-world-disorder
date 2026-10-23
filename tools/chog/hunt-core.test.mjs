import {test} from 'node:test';import assert from 'node:assert/strict';import{HuntCore}from '../../src/game/hunt-core.js';
const traits=Array.from({length:4},(_,i)=>({id:'t'+i})),players=Array.from({length:6},(_,i)=>({id:'p'+i,name:'P'+i,balance:10000}));
function game(){const g=new HuntCore({players,traits,holderId:'p0',roundId:crypto.randomUUID()});for(let i=0;i<612;i++)g.step(.01);return g;}
test('five second briefing and docking do not consume match clock',()=>{const g=new HuntCore({players,traits,holderId:'p0'});g.step(1);assert.equal(g.time,300);for(let i=0;i<4;i++)g.step(1);assert.equal(g.phase,'briefing');g.step(.65);assert.equal(g.phase,'briefing');g.step(.46);assert.equal(g.phase,'playing');assert.equal(g.time,300)});
test('five bullets, no refill, exact three second stun',()=>{const g=game();for(let i=0;i<5;i++)assert.ok(g.shoot('p0'));assert.equal(g.shoot('p0'),false);assert.equal(g.players.get('p0').ammo,0);assert.ok(g.hit('p0','p1'));assert.equal(g.players.get('p1').stun,3);for(let i=0;i<3;i++)g.step(1);assert.equal(g.players.get('p1').stun,0);assert.equal(g.players.get('p0').ammo,0)});
test('hunter cannot open; capture inherits traits and grants exactly 1 CHOG',()=>{const g=game();assert.equal(g.reveal('p1',{id:1,kind:'trait',trait:traits[0]}),false);assert.ok(g.reveal('p0',{id:1,kind:'trait',trait:traits[0]}));assert.ok(g.hit('p1','p0',0));assert.equal(g.holderId,'p1');assert.equal(g.players.get('p1').earned,1000);assert.equal(g.found.size,1);assert.equal(g.hit('p2','p1',0),false);assert.equal(g.players.get('p2').earned,0)});
test('two purchases max, 3 ammo for 3 CHOG, insufficient balance and duplicate purchase blocked',()=>{const g=game();for(let buy=0;buy<2;buy++){while(g.players.get('p0').ammo)g.shoot('p0');assert.ok(g.buy('p0'));assert.equal(g.players.get('p0').ammo,3);assert.equal(g.buy('p0'),false)}while(g.players.get('p0').ammo)g.shoot('p0');assert.equal(g.buy('p0'),false);assert.equal(g.players.get('p0').balance,4000)});
test('drops at configured milestones; both roles collect once and integer range enforced',()=>{const g=game();for(let i=0;i<90;i++)g.step(1);assert.equal(g.drain().filter(e=>e.type==='drop-wave').length,2);assert.equal(g.addDrop('bad',0),false);assert.ok(g.addDrop('d1',1));assert.ok(g.collectDrop('p0','d1'));assert.equal(g.collectDrop('p1','d1'),false);assert.ok(g.addDrop('d2',100));assert.ok(g.collectDrop('p1','d2'));assert.equal(g.players.get('p1').earned,100)});
test('four traits end with 20 winner / 2 loser, timeout no winner',()=>{const g=game();traits.forEach((trait,id)=>g.reveal('p0',{id,kind:'trait',trait}));g.step(1);assert.equal(g.result.players[0].bonus,20000);assert.equal(g.result.players[1].bonus,2000);const t=game();for(let i=0;i<301;i++)t.step(1);assert.equal(t.result.winner,null);assert.ok(t.result.players.every(p=>p.bonus===2000))});
test('reset builds new match state and awards are spendable in-game',()=>{const g=game();g.addDrop('d',100);g.collectDrop('p0','d');assert.equal(g.players.get('p0').balance,10100);assert.equal(game().players.get('p0').ammo,5)});

test('invalid chest payout does not mark the chest opened; finished exit cannot restart a round',()=>{const c=game();assert.equal(c.reveal('p0',{id:'bad',kind:'token',amountMilli:101}),false);assert.equal(c.opened.has('bad'),false);c.end(null,'timeout');c.finish();c.leave('p0');assert.equal(c.phase,'finished');});

test('captured carrier is eliminated and cannot buy ammo to rejoin',()=>{const c=game();assert.ok(c.hit('p1','p0'));assert.equal(c.players.get('p0').out,true);assert.equal(c.players.get('p0').outReason,'captured');for(let i=0;i<6;i++)c.step(1);assert.equal(c.buy('p0'),false);assert.equal(c.active('p0'),false);});

test('capture briefing belongs to new carrier; bystanders and match clock keep running',()=>{const c=game(),before=c.time;assert.ok(c.hit('p1','p0'));assert.equal(c.phase,'playing');assert.equal(c.active('p2'),true);assert.equal(c.active('p1'),false);c.step(1);assert.equal(c.time,before-1);for(let i=0;i<5;i++)c.step(1);assert.equal(c.active('p1'),false);c.step(.11);assert.equal(c.active('p1'),true);});


test('water recovery blocks actions temporarily without spending ammo or eliminating the carrier',()=>{
 const c=game();c.step(1);for(let i=0;i<7;i++)c.step(1);
 const id=c.holderId,p=c.players.get(id);p.ammo=3;p.recovering=5.5;
 assert.equal(c.active(id),false);assert.equal(c.shoot(id),false);
 for(let i=0;i<6;i++)c.step(1);
 assert.equal(p.ammo,3);assert.equal(p.out,false);assert.equal(c.holderId,id);assert.equal(c.active(id),true);
});


test('last combatant ends without a winner, but affordable ammo and water recovery still count',()=>{
 const c=game();for(const p of c.players.values())if(p.id!=='p0'){p.out=true;p.outReason='captured';}
 c.step(.1);assert.equal(c.phase,'ending');assert.equal(c.reason,'no-opponents');assert.equal(c.winner,null);
 const d=game();for(const p of d.players.values())if(p.id!=='p0'){p.out=true;p.outReason='ammo';p.balance=0;}
 const buyer=d.players.get('p1');buyer.balance=3000;d.step(.1);assert.equal(d.phase,'playing');assert.ok(d.buy('p1'));
 buyer.out=true;buyer.outReason='ammo';buyer.balance=0;d.step(.1);assert.equal(d.phase,'ending');
 const e=game();for(const p of e.players.values())if(!['p0','p1'].includes(p.id)){p.out=true;p.outReason='captured';}
 e.players.get('p1').recovering=5;e.step(.1);assert.equal(e.phase,'playing');
});


test('a final bullet gets its flight window before the last-player check',()=>{
 const c=game();for(const p of c.players.values())if(!['p0','p1'].includes(p.id)){p.out=true;p.outReason='captured';}
 const p=c.players.get('p1');p.balance=0;p.ammo=1;assert.ok(c.shoot('p1'));c.step(.5);assert.equal(c.phase,'playing');
 c.step(.8);assert.equal(c.phase,'ending');assert.equal(c.reason,'no-opponents');
});


test('a carrier with no ammo and no purchase left cannot leave hunters without a target',()=>{
 const c=game(),p=c.players.get(c.holderId);p.out=true;p.outReason='ammo';p.ammo=0;p.balance=0;c.step(.1);
 assert.equal(c.phase,'ending');assert.equal(c.reason,'no-carrier');assert.equal(c.winner,null);
});


test('pending chest coins can keep an ammo buyer in the match until the flight settles',()=>{
 const c=game();for(const p of c.players.values())if(p.id!=='p0'){p.out=true;p.outReason='captured';}
 const p=c.players.get('p1');Object.assign(p,{out:false,outReason:null,balance:2950,ammo:1});
 c.addDrop('pending',60);assert.ok(c.beginDrop('p1','pending'));c.shoot('p1');c.step(1);c.step(.5);
 assert.equal(c.phase,'playing');assert.equal(c.buy('p1'),false);
 c.finishDrop('p1','pending');assert.ok(c.buy('p1'));assert.equal(p.balance,10);
});

test('carrier departure keeps an affordable replacement instead of ending no-players',()=>{
 const c=game();for(const p of c.players.values())if(p.id!=='p0'){p.out=true;p.outReason='ammo';p.balance=0;}
 for(const id of ['p1','p2'])c.players.get(id).balance=3000;
 c.leave('p0');assert.equal(c.phase,'playing');assert.equal(c.holderId,'p1');assert.ok(c.buy('p1'));
});

test('a slow final projectile can resolve after the fallback flight window',()=>{
 const c=game();for(const p of c.players.values())if(!['p0','p1'].includes(p.id)){p.out=true;p.outReason='captured';}
 const p=c.players.get('p1');p.balance=0;p.ammo=1;c.shoot('p1');c.step(1,{pendingShots:true});c.step(1,{pendingShots:true});
 assert.equal(c.phase,'playing');assert.ok(c.hit('p1','p0'));assert.equal(c.holderId,'p1');
 c.step(.01,{pendingShots:false});assert.equal(c.phase,'ending');
});


test('stun, water respawn and capture briefing are temporary and cannot cause mission failure',()=>{
 for(const status of [{stun:3},{recovering:5.5},{roleBrief:6.1}]){
  const c=game();for(const p of c.players.values())if(!['p0','p1'].includes(p.id)){p.out=true;p.outReason='captured';}
  Object.assign(c.players.get('p0'),status);Object.assign(c.players.get('p1'),status);
  c.step(.1,{pendingShots:false});assert.equal(c.phase,'playing');
 }
});

test('ammo purchase thresholds cannot keep an ineligible last opponent alive',()=>{
 for(const [balance,purchases,keepsPlaying] of [[2999,0,false],[3000,0,true],[3000,1,true],[3000,2,false],[9000,2,false]]){
  const c=game();for(const p of c.players.values())if(p.id!=='p0'){p.out=true;p.outReason='captured';}
  Object.assign(c.players.get('p1'),{out:true,outReason:'ammo',balance,purchases});
  c.step(.1,{pendingShots:false});assert.equal(c.phase,keepsPlaying?'playing':'ending');
 }
});

test('a trait victory stays final and pays one winner even if everyone leaves during ending',()=>{
 const c=game();traits.forEach((trait,id)=>c.reveal('p0',{id,kind:'trait',trait}));
 for(const id of c.players.keys())c.leave(id);c.end(null,'no-opponents');c.step(1);
 assert.equal(c.result.winner,'p0');assert.equal(c.result.reason,'traits');assert.equal(c.result.players.filter(p=>p.bonus===20000).length,1);
});


test('NFT gates only the initial Carrier draw; a Hunter without an NFT still inherits on capture',()=>{
 const c=game();c.players.get('p1').canCarry=false;assert.ok(c.hit('p1','p0'));assert.equal(c.holderId,'p1');assert.equal(c.players.get('p1').earned,1000);assert.equal(c.players.get('p0').outReason,'captured');
 const players=Array.from({length:6},(_,i)=>({id:'n'+i,canCarry:i!==0}));assert.throws(()=>new HuntCore({players,traits,holderId:'n0'}),/NFT/);
});
