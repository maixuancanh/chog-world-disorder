import {Contract,ContractFactory,parseUnits} from '../../assets/chog-testnet/ethers.js';
import {h} from './ui-util.js';
import {raidPoolArtifact,verifiedRaidPool} from './chog-raid-pool.js';
export class RaidPoolAdmin{
 constructor(wallet,panel){this.wallet=wallet;this.panel=panel;}
 render(){const w=this.wallet,r=w.rewards,c=r.config,p=this.panel;p.replaceChildren(h('h2',null,'BOSS RAID POOL'),h('p',null,c?.raidPool||'Deploy the pool, then fund a fixed reward campaign. NFT stays in its owner’s wallet.'));
  if(!r.token||r.account!==c?.operator?.toLowerCase())return;
  const actions=h('div',{class:'chog-wallet-actions'});
  if(!c.raidPool)actions.append(w.button('deploy-raid-pool','DEPLOY RAID POOL',()=>w.run(async status=>{const signer=await r.signer(),a=await raidPoolArtifact(),pending=localStorage.getItem('chog.raid.deploy');let address;
   if(pending){const receipt=await signer.provider.getTransactionReceipt(pending);if(!receipt)throw Error('Deployment pending. Refresh after confirmation.');if(receipt.status!==1){localStorage.removeItem('chog.raid.deploy');throw Error('Deployment reverted.');}address=receipt.contractAddress;}
   else{status('Confirm pool deployment in your wallet.');const pool=await new ContractFactory(a.abi,a.bytecode,signer).deploy(c.token,c.nft,c.signer,c.operator);localStorage.setItem('chog.raid.deploy',pool.deploymentTransaction().hash);await pool.waitForDeployment();address=await pool.getAddress();}
   r.config=await r.request('configure-raid-pool',{pool:address});localStorage.removeItem('chog.raid.deploy');status('Pool deployed. Fund rewards to open the campaign.');this.render();},false),true));
  else{const amount=h('input',{class:'chog-token-input',type:'text',inputmode:'decimal',placeholder:'Reward budget in CHOG','aria-label':'Raid reward budget'}),days=h('input',{class:'chog-token-input',type:'number',min:1,max:365,value:7,'aria-label':'Campaign duration in days'});p.append(amount,days);actions.append(w.button('fund-raid-pool','FUND CAMPAIGN',()=>w.run(async status=>{const n=parseUnits(amount.value.trim(),18),duration=Number(days.value)*86400;if(n<=0n||!Number.isSafeInteger(duration)||duration<86400||duration>365*86400)throw Error('Enter a positive budget and 1–365 whole days.');const signer=await r.signer(),pool=await verifiedRaidPool(c,signer),token=new Contract(c.token,['function approve(address,uint256) returns(bool)'],signer);status('Confirm campaign funding approval.');await(await token.approve(c.raidPool,n)).wait(2);status('Confirm funding transfer.');await(await pool.fund(n,duration)).wait(2);status('Raid reward campaign funded.');},false),true));}
  p.append(actions);
 }
}
