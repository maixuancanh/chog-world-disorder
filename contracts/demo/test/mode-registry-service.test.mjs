import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import ganache from 'ganache';import {BrowserProvider,ContractFactory,Wallet} from 'ethers';
import {RewardService} from '../../../server/rewards/service.mjs';import {defaultWorkshopSkill,workshopIdentity} from '../../../src/game/skill-workshop.js';import {createObjectiveState,dailyChallenge,stepObjective} from '../../../src/game/objective-rules.js';
const artifact=JSON.parse(fs.readFileSync(new URL('../../../assets/chog-testnet/mode-registry.json',import.meta.url))),demo=JSON.parse(fs.readFileSync(new URL('../../../assets/chog-testnet/contracts.json',import.meta.url))),progression=JSON.parse(fs.readFileSync(new URL('../../../assets/chog-testnet/progression.json',import.meta.url)));
test('mode service queues real signed results and recipes, verifies receipts, survives duplicate wake and rejects ownership/tampering',async()=>{
 const engine=ganache.provider({chain:{chainId:10143},logging:{quiet:true}}),rpc=new BrowserProvider(engine,undefined,{cacheTimeout:-1});rpc.pollingInterval=20;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-mode-service-'));let service;const mine=setInterval(()=>engine.request({method:'evm_mine',params:[]}).catch(()=>{}),80);
 try{
  const owner=await rpc.getSigner(0),buyer=await rpc.getSigner(1),authority=Wallet.createRandom();
  const nft=await new ContractFactory(demo.ChogDemoNFT.abi,demo.ChogDemoNFT.bytecode,owner).deploy(owner.address,demo.demoTokenURI);await nft.waitForDeployment();const collection=await nft.getAddress();
  const registry=await new ContractFactory(artifact.abi,artifact.bytecode,owner).deploy(collection,authority.address,owner.address);await registry.waitForDeployment();
  service=new RewardService({dataDir:dir,provider:rpc,signer:authority,operator:owner.address});service.assets.nft=collection;
  await assert.rejects(service.modeRegistry.configure(buyer.address,await registry.getAddress()),/operator/);await assert.rejects(service.modeRegistry.configure(owner.address,collection),/bytecode/);await service.modeRegistry.configure(owner.address,await registry.getAddress());
  const n=await service.nftProfile(owner.address,'1'),raw={...n.objectiveNft,contract:collection,tokenId:'1'},recipe={...defaultWorkshopSkill(raw),modifier:'quick'};
  await assert.rejects(service.modeRegistry.saveWorkshop(buyer.address,'1',recipe),/owned/);await assert.rejects(service.modeRegistry.saveWorkshop(owner.address,'1',{...recipe,amount:999}),/Unexpected/);
  const queued=await service.modeRegistry.saveWorkshop(owner.address,'1',recipe);assert.equal(queued.pending,true);assert.equal(queued.confirmed,false);
  await service.modeRegistry.syncPending();assert.equal((await registry.recipes(1)).version,0n);assert.ok(service.modeRegistry.lastError); // no signer gas, stays durable
  // An expired unsent intent must be replaced even when the requested choices are identical.
  const expired=service.ledger.db.prepare("SELECT * FROM mode_chain_jobs WHERE kind='recipe'").get(),expiredPayload=JSON.parse(expired.payload);expiredPayload.expires=1;
  service.ledger.db.prepare('UPDATE mode_chain_jobs SET payload=? WHERE jobId=?').run(JSON.stringify(expiredPayload),expired.jobId);
  const renewed=await service.modeRegistry.saveWorkshop(owner.address,'1',recipe);assert.equal(renewed.pending,true);
  assert.equal(service.ledger.db.prepare('SELECT status FROM mode_chain_jobs WHERE jobId=?').get(expired.jobId).status,'superseded');
  assert.equal(service.ledger.db.prepare("SELECT count(*) AS n FROM mode_chain_jobs WHERE kind='recipe' AND status='queued'").get().n,1);
  assert.equal(service.ledger.db.prepare("SELECT count(*) AS n FROM mode_chain_jobs WHERE kind='recipe'").get().n,2);
  await(await owner.sendTransaction({to:authority.address,value:10n**18n})).wait();await Promise.all([service.modeRegistry.syncPending(),service.modeRegistry.syncPending()]);
  let profile=await service.modeRegistry.profile(owner.address,'1');assert.equal(profile.recipeSync.confirmed,true);assert.equal(profile.recipe.modifier,'quick');assert.equal(profile.recipe.identity,workshopIdentity(raw));assert.ok(profile.recipeSync.transactionHash);assert.equal((await registry.recipes(1)).version,1n);
  const same=await service.modeRegistry.saveWorkshop(owner.address,'1',recipe);assert.equal(same.confirmed,true);await service.modeRegistry.syncPending();assert.equal((await registry.recipes(1)).version,1n);
  const stations=[{x:0,y:0,z:0},{x:20,y:0,z:0},{x:40,y:0,z:0}];
  for(const mode of ['control','trials']){
   const challenge=dailyChallenge('2026-10-23'),room={verified:true,code:mode,roundId:'real-'+mode,config:{mode,challenge:mode==='trials'?challenge:null},roster:[{nid:0,team:0,wallet:owner.address,...n}]};service.ledger.start(room);
   const core=createObjectiveState(mode,stations,challenge);
   if(mode==='control'){core.scores=[75,20];core.time=0;core.phase='finished';core.winner=0;core.reason='timeout';}
   else for(let i=0;i<8;i++)stepObjective(core,[{team:0,x:core.stations[core.activeStation].x,y:0,z:0,alive:true}],3);
   const player={id:'hunt-0',team:0,name:'Tester',earned:0,purchases:0,left:false},result={...core,roundId:room.roundId,players:[player]};service.ledger.observe(room,{core:{...core,roundId:room.roundId,result},players:[['hunt-0',player]]});
   await service.modeRegistry.syncPending();const status=await service.modeRegistry.record(owner.address,room.roundId,'1');assert.equal(status.confirmed,true);assert.ok(status.transactionHash);assert.equal((await registry.stats(1,mode==='control'?1:2)).matches,1n);
  }
  await service.modeRegistry.syncPending();assert.equal((await registry.stats(1,1)).matches,1n);assert.equal(service.ledger.account(owner.address).balance,0);
  await assert.rejects(service.modeRegistry.record(buyer.address,'real-control','1'),/verified/);await assert.rejects(service.handle('workshop-save',{tokenId:'1',recipe},{headers:{}}),/Sign in/);
  await(await nft.transferFrom(owner.address,buyer.address,1)).wait();await assert.rejects(service.modeRegistry.profile(owner.address,'1'),/owned/);profile=await service.modeRegistry.profile(buyer.address,'1');assert.equal(profile.stats.control.matches,1);assert.equal(profile.recipeSync.confirmed,true);assert.equal(profile.recipe.modifier,'quick');
  const next=await service.modeRegistry.saveWorkshop(buyer.address,'1',defaultWorkshopSkill(raw));assert.equal(next.pending,true);await service.modeRegistry.syncPending();assert.equal((await registry.recipes(1)).version,2n);assert.equal((await service.modeRegistry.profile(buyer.address,'1')).recipe.modifier,'steady');
  // A returning owner must be able to restore A after an intervening owner stored B.
  await(await nft.connect(buyer).transferFrom(buyer.address,owner.address,1)).wait();
  const restored=await service.modeRegistry.saveWorkshop(owner.address,'1',recipe);assert.equal(restored.pending,true);assert.equal(restored.confirmed,false);
  await service.modeRegistry.syncPending();assert.equal((await registry.recipes(1)).version,3n);assert.equal((await service.modeRegistry.profile(owner.address,'1')).recipe.modifier,'quick');
  // Keeping the same choices still checkpoints newly earned mastery.
  service.ledger.db.prepare('INSERT INTO nft_raid_stats(collection,tokenId,wins,damage) VALUES(?,?,4,0) ON CONFLICT(collection,tokenId) DO UPDATE SET wins=4').run(collection.toLowerCase(),'1');
  const mastered=await service.modeRegistry.saveWorkshop(owner.address,'1',recipe);assert.equal(mastered.pending,true);await service.modeRegistry.syncPending();
  assert.equal((await registry.recipes(1)).version,4n);assert.equal((await registry.recipes(1)).mastery,4n);
  const unchanged=await service.modeRegistry.saveWorkshop(owner.address,'1',recipe);assert.equal(unchanged.confirmed,true);await service.modeRegistry.syncPending();assert.equal((await registry.recipes(1)).version,4n);
  // Actual XP -> Mode -> XP broadcasts share one EOA; the cached XP NonceManager must refresh.
  const xp=await new ContractFactory(progression.abi,progression.bytecode,owner).deploy(collection,authority.address,owner.address);await xp.waitForDeployment();await service.nftXP.configure(owner.address,await xp.getAddress());
  const nonceBefore=await rpc.getTransactionCount(authority.address);
  service.ledger.db.prepare('UPDATE nft_progress SET totalXp=1400,matches=1,wins=1 WHERE collection=? AND tokenId=?').run(collection.toLowerCase(),'1');
  await service.nftXP.syncPending();assert.equal((await xp.stats(1)).totalXp,1400n);assert.ok(service.nftXP.relayer);assert.equal(await rpc.getTransactionCount(authority.address),nonceBefore+1);
  const interleaved=await service.modeRegistry.saveWorkshop(owner.address,'1',defaultWorkshopSkill(raw));assert.equal(interleaved.pending,true);await service.modeRegistry.syncPending();assert.equal((await registry.recipes(1)).version,5n);assert.equal(await rpc.getTransactionCount(authority.address),nonceBefore+2);
  service.ledger.db.prepare('UPDATE nft_progress SET totalXp=2800,matches=2,wins=2 WHERE collection=? AND tokenId=?').run(collection.toLowerCase(),'1');
  await service.nftXP.syncPending();assert.equal((await xp.stats(1)).totalXp,2800n);assert.equal((await xp.stats(1)).matches,2n);assert.equal(await rpc.getTransactionCount(authority.address),nonceBefore+3);assert.equal(service.nftXP.lastError,null);
 }finally{clearInterval(mine);service?.close();await engine.disconnect();assert.ok(dir.startsWith(path.join(os.tmpdir(),'chog-mode-service-')));fs.rmSync(dir,{recursive:true,force:true});}
});
