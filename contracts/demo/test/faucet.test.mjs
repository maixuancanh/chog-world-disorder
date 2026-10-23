import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import ganache from 'ganache';import {BrowserProvider,ContractFactory,Wallet,parseEther} from 'ethers';
import {RewardService} from '../../../server/rewards/service.mjs';
const artifact=JSON.parse(fs.readFileSync(new URL('../../../assets/chog-testnet/faucet.json',import.meta.url))),demo=JSON.parse(fs.readFileSync(new URL('../../../assets/chog-testnet/contracts.json',import.meta.url)));
test('funded faucet sends exactly ten existing tokens per wallet/day; authorization, rollback, pause and server registration',async()=>{
 const engine=ganache.provider({chain:{chainId:10143},logging:{quiet:true}}),rpc=new BrowserProvider(engine,undefined,{cacheTimeout:-1});rpc.pollingInterval=20;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chog-faucet-test-'));let service;
 try{
  const owner=await rpc.getSigner(0),player=await rpc.getSigner(1),other=await rpc.getSigner(2);
  const token=await new ContractFactory(demo.TestChog.abi,demo.TestChog.bytecode,owner).deploy(owner.address);await token.waitForDeployment();
  const faucet=await new ContractFactory(artifact.abi,artifact.bytecode,owner).deploy(await token.getAddress(),owner.address);await faucet.waitForDeployment();const address=await faucet.getAddress(),supply=await token.totalSupply();
  await assert.rejects(faucet.connect(player).claim.staticCall());assert.equal(await faucet.nextClaimAt(player.address),0n,'no funds must not consume eligibility');
  await(await token.transfer(address,parseEther('100'))).wait();const before=await token.balanceOf(player.address);const receipt=await(await faucet.connect(player).claim()).wait();
  assert.equal(await token.balanceOf(player.address)-before,parseEther('10'));assert.equal(await token.balanceOf(address),parseEther('90'));assert.equal(await token.totalSupply(),supply,'transfer existing tokens, never mint');
  const event=receipt.logs.map(l=>{try{return faucet.interface.parseLog(l)}catch{return null}}).find(e=>e?.name==='Claimed');assert.equal(event.args.wallet,player.address);assert.equal(event.args.amount,parseEther('10'));
  await assert.rejects(faucet.connect(player).claim.staticCall(),/revert/);await(await faucet.connect(other).claim()).wait();assert.equal(await token.balanceOf(other.address),parseEther('10'));
  await assert.rejects(faucet.connect(player).setPaused.staticCall(true));await assert.rejects(faucet.recover.staticCall(owner.address,1n));await(await faucet.setPaused(true)).wait();await assert.rejects(faucet.claim.staticCall());await assert.rejects(faucet.connect(other).recover.staticCall(other.address,1n));await(await faucet.setPaused(false)).wait();
  await engine.request({method:'evm_increaseTime',params:[86401]});await engine.request({method:'evm_mine',params:[]});await(await faucet.connect(player).claim()).wait();assert.equal(await token.balanceOf(player.address),parseEther('20'));
  service=new RewardService({dataDir:dir,provider:rpc,signer:Wallet.createRandom(),token:await token.getAddress(),operator:owner.address});
  await assert.rejects(service.configureFaucet(player.address,address),/Only/);await assert.rejects(service.configureFaucet(owner.address,await token.getAddress()),/bytecode/);
  const wrong=await new ContractFactory(artifact.abi,artifact.bytecode,owner).deploy(await token.getAddress(),other.address);await wrong.waitForDeployment();await assert.rejects(service.configureFaucet(owner.address,await wrong.getAddress()),/configuration/);
  const config=await service.configureFaucet(owner.address,address);assert.equal(config.faucet,address);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'faucet.json'))).faucet,address);assert.equal(service.account(player.address).balance,0,'wallet claim never credits game balance');
  await assert.rejects(service.configureFaucet(owner.address,await wrong.getAddress()),/already/);
 }finally{service?.close();await engine.disconnect();assert.ok(dir.startsWith(path.join(os.tmpdir(),'chog-faucet-test-')));fs.rmSync(dir,{recursive:true,force:true});}
});
test('faucet rejects deployment outside Monad testnet',async()=>{
 const engine=ganache.provider({chain:{chainId:143},logging:{quiet:true}});try{const signer=await new BrowserProvider(engine).getSigner();await assert.rejects(new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(signer.address,signer.address));}finally{await engine.disconnect();}
});
