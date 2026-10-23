import os from 'node:os';import path from 'node:path';
import {RaidPoolService} from '../../../server/rewards/raid-pool.mjs';
import {RewardLedger} from '../../../server/rewards/ledger.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import ganache from 'ganache';import {BrowserProvider,ContractFactory,Wallet,parseEther,id} from 'ethers';
const art=JSON.parse(fs.readFileSync(new URL('../../../assets/chog-testnet/raid-pool.json',import.meta.url))),demo=JSON.parse(fs.readFileSync(new URL('../../../assets/chog-testnet/contracts.json',import.meta.url)));
const TYPES={Raid:[{name:'roundId',type:'bytes32'},{name:'wallet',type:'address'},{name:'tokenId',type:'uint256'},{name:'positionNonce',type:'uint256'},{name:'rewardBps',type:'uint256'},{name:'deadline',type:'uint256'}]};
test('raid pool separates principal, requires funded rewards and verifies raid ownership/signatures',async()=>{
 const engine=ganache.provider({chain:{chainId:10143},logging:{quiet:true}}),rpc=new BrowserProvider(engine,undefined,{cacheTimeout:-1});rpc.pollingInterval=15;
 try{const owner=await rpc.getSigner(0),user=await rpc.getSigner(1),other=await rpc.getSigner(2),signer=Wallet.createRandom();
 const token=await new ContractFactory(demo.TestChog.abi,demo.TestChog.bytecode,owner).deploy(owner.address);await token.waitForDeployment();
 const nft=await new ContractFactory(demo.ChogDemoNFT.abi,demo.ChogDemoNFT.bytecode,owner).deploy(owner.address,'data:application/json;base64,e30=');await nft.waitForDeployment();await(await nft.connect(user).claim()).wait();
 const pool=await new ContractFactory(art.abi,art.bytecode,owner).deploy(await token.getAddress(),await nft.getAddress(),signer.address,owner.address);await pool.waitForDeployment();const address=await pool.getAddress();
 await(await token.transfer(user.address,parseEther('100'))).wait();await(await token.connect(user).approve(address,parseEther('100'))).wait();
 await assert.rejects(pool.connect(other).stake.staticCall(parseEther('1'),2));await(await pool.connect(user).stake(parseEther('10'),2)).wait();assert.equal(await nft.ownerOf(2),user.address,'NFT never enters custody');
 await(await token.approve(address,parseEther('100'))).wait();await(await pool.fund(parseEther('100'),1000)).wait();
 await engine.request({method:'evm_increaseTime',params:[100]});await engine.request({method:'evm_mine',params:[]});assert.ok(await pool.earned(user.address)>0n);
 const block=await rpc.getBlock('latest'),position=await pool.positions(user.address),v={roundId:id('raid-1'),wallet:user.address,tokenId:2,positionNonce:position.nonce,rewardBps:10000,deadline:block.timestamp+600};
 const domain={name:'ChogRaidPool',version:'1',chainId:10143,verifyingContract:address},sig=await signer.signTypedData(domain,TYPES,v);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-raid-service-')),ledger=new RewardLedger(path.join(dir,'ledger.sqlite'));
 try{
  const service={dir,ledger,provider:rpc,token:await token.getAddress(),assets:{nft:await nft.getAddress()},signer,operator:owner.address,network:async()=>{assert.equal((await rpc.getNetwork()).chainId,10143n);},publicStatus:()=>({ready:true}),nftXP:{resolve:async(wallet,tokenId)=>{assert.equal((await nft.ownerOf(tokenId)).toLowerCase(),wallet.toLowerCase());}}},api=new RaidPoolService(service);
  await assert.rejects(api.configure(user.address,address),/operator/);await api.configure(owner.address,address);assert.equal(await api.entry(user.address,'2'),String(position.nonce));
  const room={code:'POOL1',roundId:'service-raid',verified:true,config:{mode:'boss'},roster:[{wallet:user.address,nid:0,bot:false,nftContract:service.assets.nft,nftTokenId:'2',raidStakeNonce:String(position.nonce)}]};ledger.start(room);
  await assert.rejects(api.voucher(user.address,'service-raid'),/qualified/);
  ledger.observe(room,{core:{roundId:'service-raid',phase:'finished',winner:'squad',result:{boss:{win:true},players:[{id:'hunt-0',left:false,rewardBps:8000}]}},players:[['hunt-0',{earned:0,purchases:0,activity:{bossDamage:2},raidStats:{damage:500}}]]});
  const signed=await api.voucher(user.address,'service-raid');assert.equal(signed.voucher.rewardBps,8000);await pool.connect(user).claimRaid.staticCall(signed.voucher,signed.signature);
  await assert.rejects(api.voucher(other.address,'service-raid'),/qualified/);
 }finally{ledger.close();fs.rmSync(dir,{recursive:true,force:true});}

 await assert.rejects(pool.connect(other).claimRaid.staticCall(v,sig));await assert.rejects(pool.connect(user).claimRaid.staticCall({...v,rewardBps:0},sig));await assert.rejects(pool.connect(user).claimRaid.staticCall({...v,positionNonce:v.positionNonce+1n},sig));await assert.rejects(pool.connect(user).claimRaid.staticCall({...v,deadline:1},sig));const wrongSig=await Wallet.createRandom().signTypedData(domain,TYPES,v);await assert.rejects(pool.connect(user).claimRaid.staticCall(v,wrongSig));const before=await token.balanceOf(user.address);await(await pool.connect(user).claimRaid(v,sig)).wait();assert.ok(await token.balanceOf(user.address)>before);assert.equal(await pool.totalPrincipal(),parseEther('10'));assert.equal((await pool.nftStats(2)).wins,1n);await assert.rejects(pool.connect(user).claimRaid.staticCall(v,sig));
 await(await pool.connect(user).withdraw(parseEther('10'),{gasLimit:300000})).wait();assert.equal(await pool.totalPrincipal(),0n);assert.equal(await nft.ownerOf(2),user.address);
 await(await pool.connect(user).stake(parseEther('5'),2,{gasLimit:400000})).wait();await assert.rejects(pool.connect(user).claimRaid.staticCall({...v,roundId:id('raid-forged')},sig));await(await nft.connect(user).transferFrom(user.address,other.address,2)).wait();await assert.rejects(pool.connect(user).claimRaid.staticCall(v,sig));await(await pool.connect(user).withdraw(parseEther('5'),{gasLimit:300000})).wait();assert.equal(await token.balanceOf(user.address)>=parseEther('100'),true,'principal remains withdrawable even after NFT sale');assert.ok(await token.balanceOf(address)>=await pool.totalPrincipal());
 }finally{await engine.disconnect();}
});
