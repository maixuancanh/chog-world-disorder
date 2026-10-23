import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {openRewardDatabase} from '../../server/rewards/database.mjs';
import {RewardLedger} from '../../server/rewards/ledger.mjs';

const require=createRequire(new URL('../../server/cloud/package.json',import.meta.url));
const Libsql=require('libsql');
test('remote database configuration fails closed before opening a local database',()=>{
 for(const env of [{CHOG_DATABASE_AUTH_TOKEN:'secret'},{CHOG_DATABASE_URL:'libsql://database.turso.io'},{CHOG_DATABASE_URL:'file:local.db',CHOG_DATABASE_AUTH_TOKEN:'secret'},{CHOG_DATABASE_URL:'http://database.turso.io',CHOG_DATABASE_AUTH_TOKEN:'secret'},{CHOG_DATABASE_URL:'https://user:secret@database.turso.io',CHOG_DATABASE_AUTH_TOKEN:'secret'}]){
  assert.throws(()=>openRewardDatabase('must-not-exist.sqlite',{env,loadLibsql:()=>{throw Error('Driver must not load');}}),/CHOG_DATABASE/);
 }
 assert.equal(fs.existsSync('must-not-exist.sqlite'),false);
});
test('remote database uses authenticated direct connection without embedded replica settings',()=>{
 let args;const statements=[];
 class FakeDatabase{constructor(...values){args=values;}exec(sql){statements.push(sql);}close(){}}
 const db=openRewardDatabase('unused.sqlite',{env:{CHOG_DATABASE_URL:'libsql://database.turso.io',CHOG_DATABASE_AUTH_TOKEN:'secret'},loadLibsql:()=>FakeDatabase});
 assert.ok(db instanceof FakeDatabase);assert.equal(args[0],'libsql://database.turso.io');assert.equal(args[1].authToken,'secret');assert.equal(args[1].syncUrl,undefined);assert.deepEqual(statements,['PRAGMA foreign_keys=ON;']);
});

for(const backend of ['sqlite','libsql'])test(`${backend} ledger preserves transactional accounting, rollback and restart durability`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-storage-')),file=path.join(dir,'test.sqlite');
 const open=()=>backend==='sqlite'?new RewardLedger(file,{database:openRewardDatabase(file,{env:{}})}):new RewardLedger(file,{database:new Libsql(file)});
 let ledger=open();
 try{
  ledger.account('WALLET');ledger.db.prepare('UPDATE accounts SET balance=100 WHERE wallet=?').run('wallet');
  assert.throws(()=>ledger.atomic(()=>{ledger.db.prepare('UPDATE accounts SET balance=balance-30 WHERE wallet=?').run('wallet');ledger.db.prepare('INSERT INTO accounts(wallet,balance) VALUES(?,?)').run('broken',-1);}),/CHECK/);
  assert.equal(ledger.account('wallet').balance,100);assert.equal(ledger.db.prepare('SELECT wallet FROM accounts WHERE wallet=?').get('broken'),undefined);
  const withdrawal=ledger.reserve('WALLET',40,99999999,1);assert.equal(ledger.account('wallet').balance,60);assert.equal(ledger.pending('wallet').id,withdrawal.id);
  ledger.close();ledger=open();assert.equal(ledger.account('wallet').balance,60);assert.equal(ledger.pending('wallet').id,withdrawal.id);assert.equal(ledger.outstanding(),40);
  assert.equal(ledger.settle(withdrawal.id,'expired'),true);assert.equal(ledger.settle(withdrawal.id,'expired'),false);assert.equal(ledger.account('wallet').balance,100);
  const room={code:'BOSS1',roundId:'boss-round',verified:true,config:{mode:'boss'},roster:[{wallet:'wallet',nid:0,bot:false,nftContract:'collection',nftTokenId:'2',raidStakeNonce:'7'}]};ledger.start(room);
  const snapshot={core:{roundId:room.roundId,phase:'finished',result:{boss:{win:true},players:[{id:'hunt-0',left:false,rewardBps:8000}]}},players:[['hunt-0',{earned:0,purchases:0,activity:{bossDamage:2,bossSupport:1,bossShields:1},raidStats:{damage:500}}]]};
  ledger.observe(room,snapshot);ledger.observe(room,snapshot);assert.equal(ledger.nftProgress('collection','2').totalXp,1290);assert.equal(ledger.account('wallet').balance,100);
  ledger.close();ledger=open();assert.equal(ledger.nftProgress('collection','2').wins,1);assert.equal(ledger.db.prepare('SELECT wins FROM nft_raid_stats').get().wins,1);assert.equal(ledger.account('wallet').activeRoom,null);
 }finally{ledger.close();await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});

