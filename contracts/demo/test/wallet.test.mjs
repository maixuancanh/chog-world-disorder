import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureTestnet, validateDeployment, mediaUrl, discoverWallets, walletError, pendingDeployment } from '../../../src/ui/chog-wallet.js';
test('wallet network switch adds missing Monad testnet and verifies the result',async()=>{
  const calls=[];let chain='0x1';
  const provider={request:async req=>{calls.push(req);if(req.method==='eth_chainId')return chain;if(req.method==='wallet_switchEthereumChain'){if(calls.filter(c=>c.method===req.method).length===1)throw Object.assign(new Error(),{code:4902});chain='0x279f';}}};
  await ensureTestnet(provider);
  assert.deepEqual(calls.map(c=>c.method),['eth_chainId','wallet_switchEthereumChain','wallet_addEthereumChain','wallet_switchEthereumChain','eth_chainId']);
  assert.equal(calls[2].params[0].chainId,'0x279f');
});
test('network rejection and lying provider never proceed',async()=>{
  await assert.rejects(ensureTestnet({request:async r=>{if(r.method==='eth_chainId')return '0x1';throw Object.assign(new Error('Rejected'),{code:4001});}}));
  await assert.rejects(ensureTestnet({request:async()=> '0x1'}),/Monad testnet/);
});
test('deployment imports reject mainnet, empty and identical asset addresses',()=>{
  const a='0x'+'11'.repeat(20),b='0x'+'22'.repeat(20),f='0x'+'33'.repeat(20);
  assert.equal(validateDeployment({version:1,chainId:10143,factory:f,nft:a,token:b}).chainId,10143);
  assert.throws(()=>validateDeployment({version:1,chainId:143,factory:f,nft:a,token:b}));
  assert.throws(()=>validateDeployment({version:1,chainId:10143,factory:f,nft:a,token:a}));
  assert.throws(()=>validateDeployment({version:1,chainId:10143,factory:f,nft:'0x'+'00'.repeat(20),token:b}));
});
test('approved embedded image is accepted; active or oversized media is rejected',()=>{
  assert.equal(mediaUrl('data:image/webp;base64,YWJj'),'data:image/webp;base64,YWJj');
  assert.throws(()=>mediaUrl('javascript:alert(1)'));
  assert.throws(()=>mediaUrl('data:text/html;base64,YWJj'));
  assert.throws(()=>mediaUrl('http://remote.example/image.png'));
});
test('wallet discovery deduplicates providers and supports EIP-6963 without ethereum',async()=>{
  const host=new EventTarget(),provider={request:async()=>[]};
  host.addEventListener('eip6963:requestProvider',()=>{const e=new Event('eip6963:announceProvider');e.detail={info:{uuid:'one',name:'MetaMask'},provider};host.dispatchEvent(e);});
  const found=await discoverWallets(host,0);
  assert.equal(found.length,1);assert.equal(found[0].provider,provider);
});
test('rejected signature is reported distinctly',()=>assert.match(walletError({code:4001}),/cancelled/i));

test('legacy wrapper does not duplicate an announced MetaMask',async()=>{
  const host=new EventTarget(),provider={request:async()=>[]};
  host.ethereum={isMetaMask:true,request:async()=>[]};
  host.addEventListener('eip6963:requestProvider',()=>{const e=new Event('eip6963:announceProvider');e.detail={info:{name:'MetaMask'},provider};host.dispatchEvent(e);});
  assert.equal((await discoverWallets(host,0)).length,1);
});
test('corrupt pending deployment never breaks the wallet screen',()=>{
  globalThis.localStorage={getItem:()=>'{bad json'};
  try{assert.equal(pendingDeployment(),null);}finally{delete globalThis.localStorage;}
});
