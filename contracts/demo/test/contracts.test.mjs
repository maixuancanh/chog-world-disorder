import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ganache from 'ganache';
import { BrowserProvider, ContractFactory, Contract, parseEther } from 'ethers';

test('demo bootstrap, ownership transfers and limited faucets execute on an EVM', async () => {
  const artifacts=JSON.parse(await readFile(new URL('../../../assets/chog-testnet/contracts.json',import.meta.url),'utf8'));
  const engine=ganache.provider({chain:{chainId:10143},logging:{quiet:true},wallet:{totalAccounts:3}});
  try {
    const provider=new BrowserProvider(engine),owner=await provider.getSigner(0),other=await provider.getSigner(1);
    const factory=await new ContractFactory(artifacts.DemoBootstrap.abi,artifacts.DemoBootstrap.bytecode,owner).deploy(artifacts.demoTokenURI);
    await factory.waitForDeployment();
    const nft=new Contract(await factory.nft(),artifacts.ChogDemoNFT.abi,owner);
    const token=new Contract(await factory.token(),artifacts.TestChog.abi,owner);
    assert.equal(await nft.balanceOf(owner.address),1n);
    assert.equal(await token.balanceOf(owner.address),parseEther('10000'));
    assert.equal(await token.symbol(),'testCHOG');
    const uri=await nft.tokenURI(1);
    const metadata=JSON.parse(Buffer.from(uri.split(',')[1],'base64').toString());
    assert.match(metadata.description,/unofficial/i);
    assert.match(metadata.image,/^data:image\/webp;base64,/);
    await (await nft.transferFrom(owner.address,other.address,1)).wait();
    assert.equal(await nft.ownerOf(1),other.address);
    assert.equal(await nft.balanceOf(owner.address),0n);
    assert.equal(await nft.tokenOfOwnerByIndex(other.address,0),1n);
    await assert.rejects(nft.claim.staticCall()); // one lifetime claim, even after transferring away
    await (await nft.connect(other).claim()).wait();
    assert.equal(await nft.balanceOf(other.address),2n);
    await assert.rejects(nft.connect(other).claim.staticCall());
    await (await token.connect(other).claim()).wait();
    assert.equal(await token.balanceOf(other.address),parseEther('1000'));
    await assert.rejects(token.connect(other).claim.staticCall());
    await engine.request({method:'evm_increaseTime',params:[86401]});
    await engine.request({method:'evm_mine',params:[]});
    await (await token.connect(other).claim({gasLimit:150000})).wait();
    assert.equal(await token.balanceOf(other.address),parseEther('2000'));
    await (await token.transfer(other.address,parseEther('5'))).wait();
    assert.equal(await token.balanceOf(other.address),parseEther('2005'));
  } finally {await engine.disconnect();}
});

test('bootstrap refuses a mainnet chain ID',async()=>{
  const artifacts=JSON.parse(await readFile(new URL('../../../assets/chog-testnet/contracts.json',import.meta.url),'utf8'));
  const engine=ganache.provider({chain:{chainId:143},logging:{quiet:true}});
  try {
    const signer=await new BrowserProvider(engine).getSigner();
    await assert.rejects(new ContractFactory(artifacts.DemoBootstrap.abi,artifacts.DemoBootstrap.bytecode,signer).deploy(artifacts.demoTokenURI));
  } finally {await engine.disconnect();}
});
