import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import test from 'node:test';import assert from 'node:assert/strict';import {RewardLedger} from '../../server/rewards/ledger.mjs';
const collection='0x0000000000000000000000000000000000000001';
const make=(roundId='one',wallet='alice',tokenId='1')=>({code:roundId,roundId,verified:true,roster:[{nid:0,wallet,nftContract:collection,nftTokenId:tokenId}]});
const finish=(room,{won=true,left=false}={})=>({core:{roundId:room.roundId,phase:'finished',winner:won?'hunt-0':null,result:{players:[{id:'hunt-0',left}]}},players:[['hunt-0',{earned:0,purchases:0}]]});
test('XP auto settles once at verified finish, without reward claim; NFT retains progression for its next owner',()=>{
 const l=new RewardLedger(':memory:');try{const room=make();l.start(room);l.observe(room,finish(room));assert.equal(l.account('alice').xp,50);assert.equal(l.account('alice').level,2);assert.equal(l.account('alice').matches,1);assert.equal(l.nftProgress(collection,'1').totalXp,1200);l.observe(room,finish(room));l.claim('alice','one');assert.equal(l.nftProgress(collection,'1').totalXp,1200);assert.equal(l.account('alice').matches,1);
 const next=make('two','bob');l.start(next);l.observe(next,finish(next,{won:false}));assert.equal(l.nftProgress(collection,'1').totalXp,1700);assert.equal(l.nftProgress(collection,'1').matches,2);assert.equal(l.nftProgress(collection,'2').totalXp,0);
 }finally{l.close();}
});
test('leave earns no XP; NFT cannot participate in concurrent rounds and unlocks on abort',()=>{
 const l=new RewardLedger(':memory:');try{const a=make();l.start(a);assert.throws(()=>l.start(make('two','bob')),/NFT.*active/i);l.abort(a);const b=make('three','bob');l.start(b);l.observe(b,finish(b,{left:true}));assert.equal(l.nftProgress(collection,'1').totalXp,0);assert.equal(l.account('bob').matches,0);l.claim('bob','three');assert.equal(l.account('bob').matches,0);l.start(make('four','charlie'));}finally{l.close();}
});

test('migration preserves legacy account EXP without inventing NFT history; persisted NFT EXP survives reopening',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-exp-migrate-')),file=path.join(dir,'ledger.sqlite');let l;
 try{const old=new DatabaseSync(file);old.exec(`CREATE TABLE accounts(wallet TEXT PRIMARY KEY,balance INTEGER NOT NULL DEFAULT 0,activeRoom TEXT,level INTEGER DEFAULT 1,xp INTEGER DEFAULT 0,matches INTEGER DEFAULT 0,wins INTEGER DEFAULT 0);CREATE TABLE rounds(roundId TEXT,wallet TEXT,actor TEXT,earned INTEGER DEFAULT 0,spent INTEGER DEFAULT 0,bonus INTEGER,claimed INTEGER DEFAULT 0,PRIMARY KEY(roundId,wallet));INSERT INTO accounts VALUES('alice',0,NULL,2,50,1,1);INSERT INTO rounds VALUES('old','alice','hunt-0',0,0,20000,1);INSERT INTO rounds VALUES('pending','alice','hunt-0',0,0,2000,0);`);old.close();
 l=new RewardLedger(file);l.settleProgress('alice');assert.equal(l.account('alice').xp,550);assert.equal(l.account('alice').matches,2);assert.equal(l.nftProgress(collection,'1').totalXp,0);l.settleProgress('alice');assert.equal(l.account('alice').xp,550);
 const r=make('fresh');l.start(r);const snapshot=finish(r);snapshot.players[0][1].activity={captures:1,traits:2};l.observe(r,snapshot);assert.equal(l.nftProgress(collection,'1').totalXp,1700);l.close();l=new RewardLedger(file);assert.equal(l.nftProgress(collection,'1').totalXp,1700);assert.equal(l.nftProgress(collection,'1').level,2);l.settleProgress('alice');assert.equal(l.nftProgress(collection,'1').totalXp,1700);
 }finally{l?.close();assert.ok(dir.startsWith(path.join(os.tmpdir(),'chog-exp-migrate-')));fs.rmSync(dir,{recursive:true,force:true});}
});

test('invalid activity snapshot rolls back all balance and EXP mutations',()=>{
 const l=new RewardLedger(':memory:');try{const r=make();l.start(r);const snapshot=finish(r);snapshot.players[0][1].earned=10;snapshot.players[0][1].activity={traits:5};assert.throws(()=>l.observe(r,snapshot),/activity/);assert.equal(l.account('alice').balance,0);assert.equal(l.account('alice').matches,0);assert.equal(l.nftProgress(collection,'1').totalXp,0);snapshot.players[0][1].activity={traits:2};l.observe(r,snapshot);assert.equal(l.nftProgress(collection,'1').totalXp,1500);}finally{l.close();}
});
