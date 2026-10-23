import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract} from 'ethers';
test('Genesis replica preserves mainnet token URI mapping and keeps existing testCHOG',async()=>{
 const a=JSON.parse(fs.readFileSync('../../assets/chog-testnet/contracts.json','utf8'));
 assert.ok(a.ChogGenesisReplica,'Replica artifact required');
 const source=JSON.parse(fs.readFileSync('../../assets/chog-testnet/genesis-source.json','utf8'));
 assert.equal(source.verifiedTokenCount,1969);
 const engine=ganache.provider({chain:{chainId:10143},logging:{quiet:true}});
 try{
  const rpc=new BrowserProvider(engine),signer=await rpc.getSigner(),other=await rpc.getSigner(1);
  const old=await new ContractFactory(a.DemoBootstrap.abi,a.DemoBootstrap.bytecode,signer).deploy(a.demoTokenURI);await old.waitForDeployment();
  const token=await old.token(),nft=await new ContractFactory(a.ChogGenesisReplica.abi,a.ChogGenesisReplica.bytecode,signer).deploy(token);await nft.waitForDeployment();
  assert.equal(await nft.token(),token);assert.equal(await nft.ownerOf(1),signer.address);
  for(let id=1;id<=1969;id++)assert.equal(await nft.sourceTokenURI(id),source.tokenURIs[id]);
  assert.equal(await nft.tokenURI(1),source.tokenURIs[1]);
  await assert.rejects(nft.tokenURI(2));
  await(await nft.connect(other).claim()).wait();assert.equal(await nft.tokenURI(2),source.tokenURIs[2]);
  await(await nft.transferFrom(signer.address,other.address,1)).wait();
  assert.equal(await nft.balanceOf(other.address),2n);await assert.rejects(nft.claim.staticCall());
  const t=new Contract(token,a.TestChog.abi,rpc);assert.equal(await t.balanceOf(signer.address),10000n*10n**18n);
 }finally{await engine.disconnect();}
});
