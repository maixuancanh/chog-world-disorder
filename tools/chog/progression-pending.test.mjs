import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {RewardLedger} from '../../server/rewards/ledger.mjs';
import {NFTProgression} from '../../server/rewards/progression.mjs';

test('pending EXP sync migrates from disk and survives restart without local files',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-pending-')),file=path.join(dir,'ledger.sqlite'),pendingFile=path.join(dir,'progression-pending.json');
 const pending={hash:'0xold',registry:'0xregistry',tokenId:'2',submittedAt:123};fs.writeFileSync(pendingFile,JSON.stringify(pending));
 let ledger=new RewardLedger(file),progress=new NFTProgression({dir,ledger});
 try{
  assert.deepEqual(progress.readPending(),pending);assert.equal(fs.existsSync(pendingFile),false);
  ledger.close();ledger=new RewardLedger(file);progress=new NFTProgression({dir,ledger});assert.deepEqual(progress.readPending(),pending);
  const next={...pending,hash:'0xnew'};progress.savePending(next);progress.clearPending(pending.hash);assert.deepEqual(progress.readPending(),next);
  // A stale legacy file must never replace newer database state or resurrect it.
  fs.writeFileSync(pendingFile,JSON.stringify(pending));progress=new NFTProgression({dir,ledger});assert.deepEqual(progress.readPending(),next);assert.equal(fs.existsSync(pendingFile),false);
  progress.clearPending(next.hash);assert.equal(progress.readPending(),null);
  ledger.close();ledger=new RewardLedger(file);progress=new NFTProgression({dir,ledger});assert.equal(progress.readPending(),null);
 }finally{ledger.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('unconfirmed remote EXP transaction keeps durable pending identity without rebroadcast',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-pending-wait-')),ledger=new RewardLedger(':memory:');
 const service={dir,ledger,provider:{getTransactionReceipt:async()=>null,getTransaction:async()=>({hash:'0xpending'})}},progress=new NFTProgression(service);
 try{progress.address='registry';progress.verify=async()=>({automaticSync:true});const pending={hash:'0xpending',registry:'registry',tokenId:'3',submittedAt:Date.now()};progress.savePending(pending);await progress.syncAll();assert.deepEqual(progress.readPending(),pending);}finally{ledger.close();fs.rmSync(dir,{recursive:true,force:true});}
});
