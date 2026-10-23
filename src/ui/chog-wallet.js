import { withTraitCounts } from './chog-trait-stats.js';
// Unofficial Monad testnet demo wallet. No private keys or simulated balances.
import { BrowserProvider, Contract, ContractFactory, formatUnits, isAddress, getAddress, keccak256 } from '../../assets/chog-testnet/ethers.js';
export const TESTNET={chainId:10143,hexId:'0x279f',name:'Monad Testnet',rpc:'https://testnet-rpc.monad.xyz',explorer:'https://testnet.monadscan.com',faucet:'https://faucet.monad.xyz/'};
export const CHOG_COLLECTION='0xc96d31f8626c6d03fae5dcd3d61e3fb9f4a73763'; // mainnet reference only
const CONFIG_KEY='chog.demo.deployment.v1',PENDING_KEY='chog.demo.pending.v1',REPLICA_PENDING='chog.genesis.pending.v2';
const asset=name=>new URL('../../assets/chog-testnet/'+name,import.meta.url).href;
let artifactsPromise,traitCountsPromise;
async function traitCounts(){return traitCountsPromise||=(fetch(asset('genesis-trait-counts.json')).then(r=>{if(!r.ok)throw new Error('Genesis trait counts unavailable.');return r.json();}).catch(e=>{traitCountsPromise=null;throw e;}));}
export function getArtifacts(){return artifactsPromise||=(fetch(asset('contracts.json')).then(r=>{if(!r.ok)throw new Error('Demo contracts unavailable.');return r.json();}).catch(e=>{artifactsPromise=null;throw e;}));}
const addressOK=a=>typeof a==='string'&&isAddress(a)&&!/^0x0{40}$/i.test(a);
export function validateDeployment(value){
  if(!value||![1,2].includes(value.version)||value.chainId!==TESTNET.chainId)throw new Error('Use a Monad testnet demo deployment file.');
  if(![value.factory,value.nft,value.token].every(addressOK))throw new Error('Invalid demo contract addresses.');
  const [factory,nft,token]=[value.factory,value.nft,value.token].map(getAddress);
  if(new Set([factory,nft,token]).size!==3)throw new Error('Demo contract addresses must be different.');
  if(value.transactionHash&&!/^0x[0-9a-f]{64}$/i.test(value.transactionHash))throw new Error('Invalid transaction hash.');
  if(value.replicaTransactionHash&&!/^0x[0-9a-f]{64}$/i.test(value.replicaTransactionHash))throw new Error('Invalid replica transaction hash.');
  return {version:value.version,chainId:TESTNET.chainId,factory,nft,token,transactionHash:value.transactionHash||null, ...(value.version===2?{replicaTransactionHash:value.replicaTransactionHash||null}: {})};
}
export async function loadDeployment(){
  let saved=null;try{const raw=localStorage.getItem(CONFIG_KEY);if(raw)saved=validateDeployment(JSON.parse(raw));}catch{}
  const response=await fetch(asset('deployment.json'),{cache:'no-store'});
  if(!response.ok)throw new Error('Demo configuration unavailable.');
  const data=await response.json(),shared=data.nft?validateDeployment(data):null;
  // Promote the shared Genesis replica over stale v1 browser configuration.
  if(shared?.version===2&&saved?.version!==2)return shared;
  return saved||shared;
}
export function saveDeployment(value){const config=validateDeployment(value);localStorage.setItem(CONFIG_KEY,JSON.stringify(config));return config;}
export function pendingDeployment(){
  try{const value=JSON.parse(localStorage.getItem(PENDING_KEY));return value?.chainId===TESTNET.chainId&&/^0x[0-9a-f]{64}$/i.test(value.hash)?value:null;}
  catch{return null;}
}
export function walletError(error){
  const code=error?.code??error?.info?.error?.code;
  if(code===4001||code==='ACTION_REJECTED')return 'Wallet request cancelled. You can try again.';
  if(code===-32002)return 'A wallet request is already open. Check MetaMask.';
  if(code==='INSUFFICIENT_FUNDS')return 'Not enough testnet MON for gas. Get MON from the faucet.';
  const message=error?.reason||error?.shortMessage||error?.message||'Wallet request failed.';
  if(/insufficient funds/i.test(message))return 'Not enough testnet MON for gas. Get MON from the faucet.';
  return message.slice(0,220);
}
const discoveries=new WeakMap();
export async function discoverWallets(host=window,wait=250){
  let registry=discoveries.get(host);
  if(!registry){registry=new Map();discoveries.set(host,registry);host.addEventListener('eip6963:announceProvider',event=>{
    const d=event.detail;if(!d?.provider?.request)return;
    registry.set(d.provider,{provider:d.provider,name:String(d.info?.name||'Wallet').slice(0,60),icon:typeof d.info?.icon==='string'&&/^data:image\//i.test(d.info.icon)&&d.info.icon.length<500000?d.info.icon:null,rdns:String(d.info?.rdns||'')});
  });}
  host.dispatchEvent(new Event('eip6963:requestProvider'));
  await new Promise(resolve=>setTimeout(resolve,wait));
  for(const provider of host.ethereum?.providers||[host.ethereum])if(provider?.request&&!registry.has(provider)){
    const name=provider.isRabby?'Rabby':provider.isMetaMask?'MetaMask':'Browser wallet';
    // Some extensions expose a different legacy wrapper for the same EIP-6963 wallet.
    if(name!=='Browser wallet'&&[...registry.values()].some(w=>w.name.toLowerCase().includes(name.toLowerCase())))continue;
    registry.set(provider,{provider,name,icon:typeof provider.icon==='string'&&/^data:image\//i.test(provider.icon)&&provider.icon.length<500000?provider.icon:null});
  }
  return [...registry.values()];
}
export async function ensureTestnet(provider){
  if(Number(await provider.request({method:'eth_chainId'}))===TESTNET.chainId)return;
  try{await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:TESTNET.hexId}]});}
  catch(error){
    if((error.code??error.data?.originalError?.code)!==4902)throw error;
    await provider.request({method:'wallet_addEthereumChain',params:[{chainId:TESTNET.hexId,chainName:TESTNET.name,nativeCurrency:{name:'MON',symbol:'MON',decimals:18},rpcUrls:[TESTNET.rpc],blockExplorerUrls:[TESTNET.explorer]}]});
    await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:TESTNET.hexId}]});
  }
  if(Number(await provider.request({method:'eth_chainId'}))!==TESTNET.chainId)throw new Error('Switch your wallet to Monad testnet.');
}
export async function connectTestWallet(provider){
  const accounts=await provider.request({method:'eth_requestAccounts'});
  if(!accounts?.[0]||!isAddress(accounts[0]))throw new Error('No wallet account selected.');
  await ensureTestnet(provider);
  const active=await provider.request({method:'eth_accounts'});
  if(active?.[0]?.toLowerCase()!==accounts[0].toLowerCase())throw new Error('Wallet account changed. Please reconnect.');
  return getAddress(accounts[0]);
}
export function mediaUrl(uri){
  if(typeof uri!=='string'||uri.length>1000000)throw new Error('Invalid NFT image.');
  if(/^data:image\/(png|webp|jpeg);base64,[a-z0-9+/=]+$/i.test(uri))return uri;
  if(uri.startsWith('ipfs://'))return 'https://ipfs.filebase.io/ipfs/'+uri.slice(7).replace(/^ipfs\//,'');
  const url=new URL(uri);if(url.protocol!=='https:')throw new Error('Unsupported NFT media.');return url.href;
}
function decodeMetadata(uri){
  if(!uri.startsWith('data:application/json;base64,')||uri.length>200000)throw new Error('Invalid demo metadata.');
  const bytes=Uint8Array.from(atob(uri.split(',')[1]),c=>c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function readProvider(provider){
  if(Number(await provider.request({method:'eth_chainId'}))!==TESTNET.chainId)throw new Error('Switch your wallet to Monad testnet.');
  return new BrowserProvider(provider,'any');
}
// Solidity appends source-dependent CBOR metadata. Adding a sibling contract changes
// that trailer even when deployed executable code is identical to the v1 build.
export function executableHash(code){
  if(typeof code!=='string'||!/^0x[0-9a-f]+$/i.test(code)||code.length<6)throw new Error('Invalid contract bytecode.');
  const trailerBytes=parseInt(code.slice(-4),16)+2;
  if(trailerBytes>=2&&trailerBytes<=128&&code.length>2+trailerBytes*2)code=code.slice(0,-trailerBytes*2);
  return keccak256(code);
}
export async function verifyDeployment(config,provider){
  config=validateDeployment(config);
  const rpc=await readProvider(provider),art=await getArtifacts();
  const [nftCode,tokenCode]=await Promise.all([rpc.getCode(config.nft),rpc.getCode(config.token)]);
  if(executableHash(nftCode)!==executableHash((config.version===2?art.ChogGenesisReplica:art.ChogDemoNFT).runtime)||executableHash(tokenCode)!==executableHash(art.TestChog.runtime))throw new Error('These addresses do not match the game demo contracts.');
  const factory=new Contract(config.factory,art.DemoBootstrap.abi,rpc);
  const [nft,token]=await Promise.all([factory.nft(),factory.token()]);
  if((config.version===1&&nft.toLowerCase()!==config.nft.toLowerCase())||token.toLowerCase()!==config.token.toLowerCase())throw new Error('Demo deployment addresses do not match.');
  if(config.version===2){const replica=new Contract(config.nft,art.ChogGenesisReplica.abi,rpc);if((await replica.token()).toLowerCase()!==config.token.toLowerCase())throw new Error('Replica token link mismatch.');}
  return {config,rpc,art};
}
export async function getChogNftProfile({address,tokenId,provider,config}){
  if(!isAddress(address))throw new Error('Invalid wallet address.');
  const verified=await verifyDeployment(config,provider);
  const nft=new Contract(config.nft,verified.art.ChogDemoNFT.abi,verified.rpc);
  const count=Number(await nft.balanceOf(address));
  if(!Number.isSafeInteger(count)||count>1969)throw new Error('Invalid NFT balance.');
  if(!count)return null;
  const owned=[];
  // Small batches avoid issuing thousands of requests to a wallet at once.
  for(let i=0;i<count;i+=20)owned.push(...await Promise.all(Array.from({length:Math.min(20,count-i)},(_,n)=>nft.tokenOfOwnerByIndex(address,i+n).then(String))));
  const selected=tokenId===undefined?owned[0]:String(tokenId);
  if(!owned.includes(selected))throw new Error('This demo NFT is not owned by the connected wallet.');
  if((await nft.ownerOf(selected)).toLowerCase()!==address.toLowerCase())throw new Error('NFT ownership changed. Refresh your wallet.');
  const uri=await nft.tokenURI(selected);
  let data;
  if(config.version===2){
    const gateways=[mediaUrl(uri),mediaUrl(uri).replace('ipfs.filebase.io','ipfs.io')];let failure;
    for(const url of gateways){try{const res=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error('Genesis metadata unavailable.');data=await res.json();break;}catch(error){failure=error;}}
    if(!data)throw failure;
  }else data=decodeMetadata(uri);
  return {tokenId:selected,contract:config.nft,chainId:TESTNET.chainId,name:config.version===2?data.name:`${data.name} #${selected}`,image:mediaUrl(data.image),attributes:config.version===2?withTraitCounts(data.attributes||[],await traitCounts()):data.attributes||[],sourceTokenId:config.version===2?selected:null,metadataURI:uri,ownedTokenIds:owned,demo:true};
}
export async function getDemoWalletAssets({address,provider,config}){
  const {rpc,art}=await verifyDeployment(config,provider);
  const token=new Contract(config.token,art.TestChog.abi,rpc),nft=new Contract(config.nft,art.ChogDemoNFT.abi,rpc);
  const [balance,native,nftProfile,hasClaimed,nextClaimAt]=await Promise.all([token.balanceOf(address),rpc.getBalance(address),getChogNftProfile({address,provider,config}),nft.hasClaimed(address),token.nextClaimAt(address)]);
  return {nft:nftProfile,tokenBalance:formatUnits(balance,18),nativeBalance:formatUnits(native,18),hasClaimed,nextClaimAt:Number(nextClaimAt)};
}
export async function resumeDeployment(provider){
  const pending=pendingDeployment();if(!pending)return null;
  const rpc=await readProvider(provider),receipt=await rpc.getTransactionReceipt(pending.hash);
  if(!receipt)throw new Error('Deployment is still pending. Refresh after it confirms.');
  if(receipt.status!==1){localStorage.removeItem(PENDING_KEY);throw new Error('Deployment reverted. You can deploy again.');}
  const art=await getArtifacts(),factory=new Contract(receipt.contractAddress,art.DemoBootstrap.abi,rpc);
  const config=validateDeployment({version:1,chainId:TESTNET.chainId,factory:receipt.contractAddress,nft:await factory.nft(),token:await factory.token(),transactionHash:receipt.hash});
  await verifyDeployment(config,provider);saveDeployment(config);localStorage.removeItem(PENDING_KEY);return config;
}
export async function deployDemoAssets(provider,address,onProgress=()=>{}){
  await ensureTestnet(provider);
  if(pendingDeployment())return resumeDeployment(provider);
  if(await loadDeployment())throw new Error('Demo assets already configured. Refresh to use them.');
  const rpc=await readProvider(provider),signer=await rpc.getSigner(address),art=await getArtifacts();
  const factory=new ContractFactory(art.DemoBootstrap.abi,art.DemoBootstrap.bytecode,signer);
  const request=await factory.getDeployTransaction(art.demoTokenURI);
  const gas=await signer.estimateGas(request),fees=await rpc.getFeeData();
  const fee=fees.maxFeePerGas??fees.gasPrice;
  if(!fee)throw new Error('Could not estimate testnet gas price.');
  const gasLimit=gas*12n/10n;
  if(await rpc.getBalance(address)<gasLimit*fee)throw new Error(`Not enough testnet MON. Keep at least ${formatUnits(gasLimit*fee,18)} MON for deployment gas.`);
  // Recheck account/network immediately before requesting a wallet signature.
  const accounts=await provider.request({method:'eth_accounts'});
  if(accounts?.[0]?.toLowerCase()!==address.toLowerCase())throw new Error('Wallet account changed. Reconnect before deploying.');
  if(Number(await provider.request({method:'eth_chainId'}))!==TESTNET.chainId)throw new Error('Switch your wallet to Monad testnet.');
  onProgress('Confirm deployment in MetaMask…');
  const contract=await factory.deploy(art.demoTokenURI,{gasLimit});
  const tx=contract.deploymentTransaction();
  localStorage.setItem(PENDING_KEY,JSON.stringify({hash:tx.hash,chainId:TESTNET.chainId}));
  onProgress(`Deployment submitted: ${tx.hash.slice(0,12)}… Waiting for confirmation.`);
  const receipt=await rpc.waitForTransaction(tx.hash,1,180000);
  if(!receipt)throw new Error('Deployment pending. Use Refresh to check again.');
  return resumeDeployment(provider);
}
export async function claimDemoAsset(kind,provider,address,config,onProgress=()=>{}){
  await ensureTestnet(provider);
  const {rpc,art}=await verifyDeployment(config,provider),signer=await rpc.getSigner(address);
  const contract=new Contract(kind==='nft'?config.nft:config.token,kind==='nft'?art.ChogDemoNFT.abi:art.TestChog.abi,signer);
  const active=await provider.request({method:'eth_accounts'});
  if(active?.[0]?.toLowerCase()!==address.toLowerCase())throw new Error('Wallet account changed. Reconnect before claiming.');
  if(Number(await provider.request({method:'eth_chainId'}))!==TESTNET.chainId)throw new Error('Switch your wallet to Monad testnet.');
  onProgress('Confirm claim in MetaMask…');
  const tx=await contract.claim();onProgress('Claim submitted. Waiting for confirmation…');
  const receipt=await rpc.waitForTransaction(tx.hash,1,180000);
  if(!receipt)throw new Error('Claim pending. Refresh to check your assets.');
  if(receipt.status!==1)throw new Error('Claim reverted. Refresh and try again.');
  return receipt.hash;
}

export function pendingReplica(){try{const data=JSON.parse(localStorage.getItem(REPLICA_PENDING));return /^0x[0-9a-f]{64}$/i.test(data?.hash)?data:null;}catch{return null;}}
export async function deployGenesisReplica(provider,address,config,onProgress=()=>{}){
  await ensureTestnet(provider);
  const {rpc,art}=await verifyDeployment(config,provider);
  let pending=pendingReplica();
  if(!pending){
    if(config.version===2)throw new Error('Genesis replica already configured.');
    const signer=await rpc.getSigner(address),factory=new ContractFactory(art.ChogGenesisReplica.abi,art.ChogGenesisReplica.bytecode,signer);
    const request=await factory.getDeployTransaction(config.token),gas=await signer.estimateGas(request),gasLimit=gas*12n/10n;
    const fees=await rpc.getFeeData(),fee=fees.maxFeePerGas??fees.gasPrice;
    if(!fee||await rpc.getBalance(address)<gasLimit*fee)throw new Error('Not enough testnet MON for NFT deployment gas.');
    const active=await provider.request({method:'eth_accounts'});
    if(active?.[0]?.toLowerCase()!==address.toLowerCase()||Number(await provider.request({method:'eth_chainId'}))!==TESTNET.chainId)throw new Error('Wallet changed. Reconnect before deployment.');
    onProgress('Confirm Genesis replica deployment in MetaMask. Existing testCHOG stays unchanged.');
    const replica=await factory.deploy(config.token,{gasLimit}),tx=replica.deploymentTransaction();
    pending={hash:tx.hash,previous:config};localStorage.setItem(REPLICA_PENDING,JSON.stringify(pending));
  }
  onProgress('Genesis replica submitted. Waiting for confirmation…');
  const receipt=await rpc.waitForTransaction(pending.hash,1,180000);
  if(!receipt)throw new Error('Replica pending. Use CHECK GENESIS DEPLOYMENT to resume.');
  if(receipt.status!==1){localStorage.removeItem(REPLICA_PENDING);throw new Error('Replica deployment reverted.');}
  const next=validateDeployment({...pending.previous,version:2,nft:receipt.contractAddress,replicaTransactionHash:receipt.hash});
  await verifyDeployment(next,provider);saveDeployment(next);localStorage.removeItem(REPLICA_PENDING);return next;
}
