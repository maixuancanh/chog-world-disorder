import test from 'node:test';import assert from 'node:assert/strict';
import {CONTROL,createObjectiveState,stepObjective,dailyChallenge,validateObjectiveResult} from '../../src/game/objective-rules.js';
import {createHuntRelay} from '../../server/hunt-relay.mjs';import {RewardLedger} from '../../server/rewards/ledger.mjs';
const stations=[{x:0,y:0,z:0},{x:20,y:0,z:0},{x:40,y:0,z:0}],actor=(team,x=0)=>({team,x,y:0,z:0,alive:true});
test('Control capture, contest, recapture, target and explicit timeout tie',()=>{
 const c=createObjectiveState('control',stations);stepObjective(c,[actor(0)],4);assert.equal(c.stations[0].owner,0);const score=c.scores[0];stepObjective(c,[actor(0),actor(1)],3);assert.equal(c.scores[0],score);assert.equal(c.stations[0].contested,true);
 stepObjective(c,[actor(1)],4);assert.equal(c.stations[0].owner,null);stepObjective(c,[actor(1)],4);assert.equal(c.stations[0].owner,1);
 c.scores[1]=99.9;stepObjective(c,[actor(1)],1);assert.equal(c.winner,1);assert.equal(c.reason,'target');const t=createObjectiveState('control',stations);stepObjective(t,[],240);assert.equal(t.reason,'tie');assert.equal(t.winner,null);
});
test('Daily fixed seed, beacon hold reset, completion score and validation',()=>{
 const d=dailyChallenge('2026-10-23');assert.deepEqual(d,dailyChallenge('2026-10-23'));assert.notEqual(d.seed,dailyChallenge('2026-10-24').seed);assert.ok(d.duration>=120&&d.duration<=180);
 const c=createObjectiveState('trials',stations,d);const here=()=>actor(0,c.stations[c.activeStation].x);stepObjective(c,[here()],2);stepObjective(c,[actor(0,100)],1);assert.equal(c.hold,0);for(let i=0;i<8;i++)stepObjective(c,[here()],3);assert.equal(c.completed,true);assert.equal(c.score,800+Math.floor(c.time)*2);
 const result={...c,players:[{id:'hunt-0'}]};assert.equal(validateObjectiveResult(result,{mode:'trials',challenge:d}),result);assert.throws(()=>validateObjectiveResult({...result,score:9999},{mode:'trials',challenge:d}),/score|Score/);assert.throws(()=>validateObjectiveResult(result,{mode:'control'}),/mismatch/);
 const f=createObjectiveState('trials',stations,d);stepObjective(f,[],d.duration);assert.equal(f.completed,false);assert.equal(f.reason,'timeout');assert.equal(f.score,0);
});
test('verified objective settlement is idempotent, NFT-bound and cannot credit Hunt or Boss rewards',()=>{
 const ledger=new RewardLedger(':memory:'),d=dailyChallenge('2026-10-23'),p={wallet:'wallet',nid:0,team:0,nftContract:'0x'+'1'.repeat(40),nftTokenId:'42'},room={code:'TEST',verified:true,roundId:'daily-round',roster:[p],config:{mode:'trials',challenge:d}};ledger.start(room);
 const c=createObjectiveState('trials',stations,d);for(let i=0;i<8;i++)stepObjective(c,[actor(0,c.stations[c.activeStation].x)],3);
 const row={id:'hunt-0',team:0,earned:0,purchases:0,left:false},result={...c,roundId:room.roundId,players:[row]},snapshot={core:{...c,roundId:room.roundId,result},players:[['hunt-0',row]]};
 try{assert.equal(ledger.observe(room,snapshot),true);assert.equal(ledger.observe(room,snapshot),false);assert.equal(ledger.account('wallet').balance,0);assert.equal(ledger.account('wallet').activeRoom,null);assert.equal(ledger.dailyRecords(p.nftContract,'42')[0].score,c.score);assert.equal(ledger.dailyRecords(p.nftContract,'43').length,0);assert.equal(ledger.db.prepare('SELECT mode,raidBps,xpGain FROM rounds').get().mode,'trials');assert.equal(ledger.db.prepare('SELECT COUNT(*) AS n FROM nft_raid_stats').get().n,0);assert.throws(()=>ledger.observe(room,{...snapshot,players:[['hunt-0',{...row,earned:20000}]]}),/cannot mint/);assert.throws(()=>ledger.observe(room,{...snapshot,core:{...snapshot.core,mode:'boss'}}),/mode mismatch/);}finally{ledger.close();}
});
test('relay supports objective modes, solo Daily seeded by server and workshop tamper rejection',async()=>{
 let timestamp=Date.UTC(2026,9,23);const server=createHuntRelay({now:()=>timestamp});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,req=(action,b={},token)=>fetch(base+'/'+action,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(b)}).then(r=>r.json());
 try{const h=await req('create',{identity:'guest'}),code=h.room.code;await req('settings',{code,mode:'trials'},h.token);const started=await req('start',{code},h.token);assert.equal(started.room.roster.length,1);assert.equal(started.room.roster[0].weapon,'shooter');assert.deepEqual(started.room.config.challenge,dailyChallenge('2026-10-23'));
 const k=await req('create',{identity:'guest',workshopSkill:{version:1,identity:'guest',effect:'empower',target:'self',modifier:'steady'}});await req('settings',{code:k.room.code,mode:'control'},k.token);assert.match((await req('start',{code:k.room.code},k.token)).error,/locked/);
 const control=await req('create',{identity:'guest'});await req('settings',{code:control.room.code,mode:'control'},control.token);const game=await req('start',{code:control.room.code},control.token);assert.equal(game.room.roster.filter(p=>p.team===0).length,3);assert.equal(game.room.roster.filter(p=>p.team===1).length,3);
 }finally{await new Promise(r=>server.close(r));}
});
