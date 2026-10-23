import {Contract,ContractFactory} from '../../assets/chog-testnet/ethers.js';
import {faucetArtifact,verifiedFaucet} from './chog-faucet.js';
import {h} from './ui-util.js';
import {TESTNET} from './chog-wallet.js';

// Only imported by testnet.html. No operator controls in the game bundle.
export class ChogFaucetAdmin {
 constructor(wallet,panel){this.wallet=wallet;this.panel=panel;}
 async refresh(){const r=this.wallet.rewards;r.config=await r.request('status');this.render();}
 async deploy(){
  const r=this.wallet.rewards,c=await r.request('status');if(r.account!==c.operator?.toLowerCase())throw Error('Connect the operator wallet.');if(c.faucet)throw Error('Faucet already deployed.');
  const signer=await r.signer(),pending=localStorage.getItem('chog.faucet.deploy');let address;
  if(pending){const receipt=await signer.provider.getTransactionReceipt(pending);if(!receipt)throw Error('Deployment pending. Check again after confirmation.');if(receipt.status!==1){localStorage.removeItem('chog.faucet.deploy');throw Error('Deployment failed. You can retry.');}address=receipt.contractAddress;}
  else{const a=await faucetArtifact(),f=await new ContractFactory(a.abi,a.bytecode,signer).deploy(c.token,signer.address);localStorage.setItem('chog.faucet.deploy',f.deploymentTransaction().hash);await f.waitForDeployment();address=await f.getAddress();}
  r.config=await r.request('configure-faucet',{faucet:address});localStorage.removeItem('chog.faucet.deploy');this.render();return address;
 }
 async fund(){
  const r=this.wallet.rewards,c=await r.request('status');if(r.account!==c.operator?.toLowerCase())throw Error('Connect the operator wallet.');const signer=await r.signer();await verifiedFaucet(c,signer);
  const token=new Contract(c.token,['function transfer(address,uint256) returns(bool)'],signer),tx=await token.transfer(c.faucet,1000n*10n**18n),receipt=await tx.wait(2);if(receipt?.status!==1)throw Error('Funding failed.');return receipt.hash;
 }
 render(){
  const w=this.wallet,r=w.rewards,c=r.config,p=this.panel;w.clearBindings(p);const operator=!!r.token&&r.account===c?.operator?.toLowerCase();
  p.replaceChildren(h('span',{class:'chog-wallet-kicker'},'OPERATOR · MONAD TESTNET'),h('h2',{class:'iw-display'},'10 CHOG WALLET FAUCET'),h('p',null,'Each wallet can receive 10 existing testCHOG every 24 hours. Separate from the game reward balance and treasury. Fund 1,000 testCHOG for 100 claims.'));
  const list=h('dl',{class:'chog-admin-addresses'});for(const [label,value]of [['Token',c?.token||'Loading…'],['Faucet',c?.faucet||'Not deployed']])list.append(h('dt',null,label),h('dd',null,value));p.append(list);
  const actions=h('div',{class:'chog-wallet-actions'},w.button('faucet-admin-refresh','REFRESH FAUCET',()=>w.run(()=>this.refresh(),false)));
  if(operator&&!c.faucet)actions.append(w.button('faucet-admin-deploy',localStorage.getItem('chog.faucet.deploy')?'CHECK FAUCET DEPLOYMENT':'DEPLOY 10 CHOG FAUCET',()=>w.run(async progress=>{progress('Confirm faucet deployment in your wallet.');await this.deploy();progress('Faucet deployed and registered. Fund it to enable claims.');},false),true));
  if(operator&&c.faucet)actions.append(w.button('faucet-admin-fund','FUND FAUCET · 1,000 testCHOG',()=>w.menu._openModal({title:'FUND 10 CHOG FAUCET',text:`Transfer 1,000 testCHOG to ${c.faucet} on Monad testnet. This funds 100 claims. Gas is paid in testnet MON.`,buttons:[{label:'CONFIRM FUNDING',accept:()=>{w.menu._closeModal();w.run(async progress=>{progress('Confirm the faucet funding transfer in your wallet.');const hash=await this.fund();progress('Faucet funded: '+TESTNET.explorer+'/tx/'+hash);},false);}},{label:'CANCEL',accept:()=>w.menu._closeModal()}]}),true));
  p.append(actions,w.status());
 }
}
