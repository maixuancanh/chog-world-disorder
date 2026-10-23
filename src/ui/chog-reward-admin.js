import {Contract,ContractFactory} from '../../assets/chog-testnet/ethers.js';
import {h} from './ui-util.js';
import {TESTNET} from './chog-wallet.js';

// Operator controls belong exclusively to the lightweight testCHOG setup page.
export class ChogRewardAdmin {
 constructor(wallet,panel){this.wallet=wallet;this.panel=panel;}
 async refresh(){const r=this.wallet.rewards;r.config=await r.request('status');this.render();}
 async deploy(){const r=this.wallet.rewards;r.config=await r.request('status');if(r.account!==r.config.operator?.toLowerCase())throw Error('Connect the operator wallet to deploy the reward vault');
  const artifact=await fetch(new URL('../../assets/chog-testnet/reward-vault.json',import.meta.url)).then(r=>r.json()),signer=await r.signer();
  const vault=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(r.config.token,r.config.signer,signer.address);
  localStorage.setItem('chog.reward.deploy',vault.deploymentTransaction().hash);await vault.waitForDeployment();r.config=await r.request('configure',{vault:await vault.getAddress()});localStorage.removeItem('chog.reward.deploy');return r.config;
 }
 async resumeDeploy(){const r=this.wallet.rewards,hash=localStorage.getItem('chog.reward.deploy');if(!hash)throw Error('No pending reward deployment');const signer=await r.signer(),receipt=await signer.provider.getTransactionReceipt(hash);if(!receipt||receipt.status!==1||!receipt.contractAddress)throw Error('Reward deployment not yet confirmed');r.config=await r.request('configure',{vault:receipt.contractAddress});localStorage.removeItem('chog.reward.deploy');return r.config;}
 async fund(){const r=this.wallet.rewards;r.config=await r.request('status');if(r.account!==r.config.operator?.toLowerCase())throw Error('Connect the operator wallet to fund the reward vault');if(!r.config.vault)throw Error('Deploy the reward vault first');const signer=await r.signer(),token=new Contract(r.config.token,['function transfer(address,uint256) returns(bool)'],signer),tx=await token.transfer(r.config.vault,1000n*10n**18n);await tx.wait(2);return tx.hash;}
 render(){const w=this.wallet,r=w.rewards,c=r.config,p=this.panel;w.clearBindings(p);
  const connected=w.menu._identity?.kind==='wallet',operator=!!r.token&&r.account===c?.operator?.toLowerCase();
  p.replaceChildren(h('span',{class:'chog-wallet-kicker'},'OPERATOR · MONAD TESTNET'),h('h2',{class:'iw-display'},'GAME REWARD TREASURY'),h('p',{class:'chog-wallet-muted'},'Deploy the game payout vault and supply testCHOG for player withdrawals. These controls are only on this setup page.'));
  if(c){const list=h('dl',{class:'chog-admin-addresses'});for(const [label,value]of [['Operator wallet',c.operator||'Unavailable'],['testCHOG token',c.token],['Reward signer',c.signer],['Reward vault',c.vault||'Not deployed']])list.append(h('dt',null,label),h('dd',null,value));p.append(list);if(c.error)p.append(h('p',{class:'chog-wallet-status'},c.error));}
  const actions=h('div',{class:'chog-wallet-actions'});
  actions.append(w.button('reward-admin-refresh','REFRESH TREASURY',()=>w.run(()=>this.refresh(),false)));
  if(!connected)actions.append(w.button('reward-admin-connect','CONNECT OPERATOR WALLET',()=>w.connect(),true));
  else if(!r.token)actions.append(w.button('reward-admin-login','SIGN IN',()=>w.run(()=>w.signIn(),false),true));
  else if(c&&!operator)p.append(h('p',{class:'chog-wallet-muted'},'Connected wallet is not the operator. Switch to the operator wallet shown above.'));
  if(operator){
   if(!c.vault)actions.append(w.button('reward-admin-deploy',localStorage.getItem('chog.reward.deploy')?'CHECK DEPLOYMENT':'DEPLOY REWARD VAULT',()=>w.run(async progress=>{progress('Confirm the Monad testnet vault deployment in your wallet…');if(localStorage.getItem('chog.reward.deploy'))await this.resumeDeploy();else await this.deploy();progress('Reward vault deployed and registered. You can now fund the treasury.');},false),true));
   else actions.append(w.button('reward-admin-fund','FUND 1,000 testCHOG',()=>w.menu._openModal({title:'FUND REWARD VAULT',text:`Transfer 1,000 testCHOG to ${c.vault} on Monad testnet. Gas is paid in testnet MON.`,buttons:[{label:'CONFIRM FUNDING',accept:()=>{w.menu._closeModal();w.run(async progress=>{progress('Confirm the 1,000 testCHOG transfer in your wallet…');const hash=await this.fund();progress('Treasury funded: '+TESTNET.explorer+'/tx/'+hash);},false);}},{label:'CANCEL',accept:()=>w.menu._closeModal()}]}),true));
  }
  p.append(actions,w.status());
 }
}
