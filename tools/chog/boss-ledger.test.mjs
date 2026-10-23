import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {RewardLedger} from '../../server/rewards/ledger.mjs';
import {RaidPoolService} from '../../server/rewards/raid-pool.mjs';
test('boss victory persists token-bound unlocks and EXP without inventing CHOG or double awards',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-boss-ledger-')),ledger=new RewardLedger(path.join(dir,'test.sqlite'));
 try{const room={code:'BOSS1',roundId:'boss-round',verified:true,config:{mode:'boss'},roster:[{wallet:'wallet',nid:0,bot:false,nftContract:'collection',nftTokenId:'2',raidStakeNonce:'7'}]};ledger.start(room);
 const activity={bossDamage:2,bossSupport:1,bossShields:1},snapshot={core:{roundId:room.roundId,phase:'finished',winner:'squad',result:{boss:{win:true},players:[{id:'hunt-0',left:false,rewardBps:8000}]}},players:[['hunt-0',{earned:0,purchases:0,activity,raidStats:{damage:500}}]]};
 ledger.observe(room,snapshot);const progress=ledger.nftProgress('collection','2');assert.equal(progress.wins,1);assert.equal(progress.totalXp,1290);assert.equal(ledger.account('wallet').balance,0);assert.equal(ledger.account('wallet').activeRoom,null);
 assert.equal(ledger.db.prepare('SELECT wins FROM nft_raid_stats').get().wins,1);ledger.observe(room,snapshot);assert.equal(ledger.nftProgress('collection','2').totalXp,1290);assert.equal(ledger.db.prepare('SELECT wins FROM nft_raid_stats').get().wins,1);
 const row=ledger.db.prepare('SELECT * FROM rounds').get();assert.equal(row.raidStakeNonce,'7');assert.equal(row.raidBps,8000);assert.equal(row.bonus,0);assert.equal(ledger.lastExperience('wallet').total,1290);
 const pool={s:{ledger},verify:async()=>{throw Error('must not reach chain');}};await assert.rejects(()=>RaidPoolService.prototype.voucher.call(pool,'wallet','invented'),/qualified/);
 }finally{ledger.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('boss defeat and a player who leaves cannot unlock victories or pool rewards',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-boss-fail-')),ledger=new RewardLedger(path.join(dir,'test.sqlite'));try{
 const room={code:'FAIL1',roundId:'lost',verified:true,config:{mode:'boss'},roster:[{wallet:'wallet',nid:0,nftContract:'collection',nftTokenId:'2'}]};ledger.start(room);ledger.observe(room,{core:{roundId:'lost',phase:'finished',result:{boss:{win:false},players:[{id:'hunt-0',left:false,rewardBps:0}]}},players:[['hunt-0',{earned:0,purchases:0,activity:{},raidStats:{damage:0}}]]});assert.equal(ledger.nftProgress('collection','2').totalXp,500);assert.equal(ledger.nftProgress('collection','2').wins,0);assert.equal(ledger.db.prepare('SELECT COUNT(*) AS n FROM nft_raid_stats').get().n,0);
 }finally{ledger.close();fs.rmSync(dir,{recursive:true,force:true});}});
