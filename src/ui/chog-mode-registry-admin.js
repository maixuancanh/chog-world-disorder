import {ContractFactory} from '../../assets/chog-testnet/ethers.js';
import {h} from './ui-util.js';
import {TESTNET} from './chog-wallet.js';
let artifact;
async function modeRegistryArtifact(){
 if(!artifact)artifact=fetch(new URL('../../assets/chog-testnet/mode-registry.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Mode registry contract unavailable');return r.json();}).catch(e=>{artifact=null;throw e;});
 return artifact;
}
export class ChogModeRegistryAdmin {
 constructor(wallet,panel){this.wallet=wallet;this.panel=panel;}
 async deploy(){
  const r=this.wallet.rewards,c=await r.request('status');
  if(r.account!==c.operator?.toLowerCase())throw Error('Connect the operator wallet');
  if(c.modeRegistry)throw Error('Mode registry already configured');
  const signer=await r.signer(),key='chog.mode-registry.deploy:'+c.nft.toLowerCase(),pending=localStorage.getItem(key);let address;
  if(pending){const receipt=await signer.provider.getTransactionReceipt(pending);if(!receipt)throw Error('Deployment pending. Check again after confirmation');if(receipt.status!==1){localStorage.removeItem(key);throw Error('Deployment failed. Retry deployment');}address=receipt.contractAddress;}
  else{const a=await modeRegistryArtifact(),contract=await new ContractFactory(a.abi,a.bytecode,signer).deploy(c.nft,c.signer,c.operator);localStorage.setItem(key,contract.deploymentTransaction().hash);await contract.waitForDeployment();address=await contract.getAddress();}
  r.config=await r.request('configure-mode-registry',{registry:address});localStorage.removeItem(key);return address;
 }
 render(){
  const w=this.wallet,r=w.rewards,c=r.config,p=this.panel;w.clearBindings(p);
  p.replaceChildren(h('span',{class:'chog-wallet-kicker'},'OPERATOR · MONAD TESTNET'),h('h2',{class:'iw-display'},'MODE RECORDS & SKILLS'),h('p',null,'Verified Trait Control results, Daily Trials records and NFT workshop recipes are saved by the server. The shared auto-sync gas wallet pays testnet gas.'));
  const list=h('dl',{class:'chog-admin-addresses'});
  for(const [label,value]of [['NFT collection',c?.nft||'Loading...'],['Auto-sync gas wallet',c?.signer||'Loading...'],['Mode registry',c?.modeRegistry||'Not deployed']])list.append(h('dt',null,label),h('dd',null,value));p.append(list);
  if(/^0x[\da-f]{40}$/i.test(c?.modeRegistry||''))p.append(h('p',null,h('a',{href:TESTNET.explorer+'/address/'+c.modeRegistry,target:'_blank',rel:'noopener noreferrer'},'VIEW MODE REGISTRY')));
  const actions=h('div',{class:'chog-wallet-actions'},w.button('mode-admin-refresh','REFRESH MODE REGISTRY',()=>w.run(async()=>{r.config=await r.request('status');},false)));
  if(r.token&&r.account===c?.operator?.toLowerCase()&&!c?.modeRegistry){
   const pending=c?.nft&&localStorage.getItem('chog.mode-registry.deploy:'+c.nft.toLowerCase());
   actions.append(w.button('mode-admin-deploy',pending?'CHECK MODE DEPLOYMENT':'DEPLOY MODE REGISTRY',()=>w.run(async progress=>{progress(pending?'Checking mode registry deployment.':'Confirm mode registry deployment in your wallet.');await this.deploy();progress('Mode registry configured. The server will save verified records and recipes automatically.');},false),true));
  }
  p.append(actions);
 }
}
