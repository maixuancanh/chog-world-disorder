import {Contract,formatUnits,parseUnits} from '../../assets/chog-testnet/ethers.js';
import {executableCode} from './chog-faucet.js';
import {h} from './ui-util.js';
let artifact;
export async function raidPoolArtifact(){return artifact||=fetch(new URL('../../assets/chog-testnet/raid-pool.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('Raid pool artifact unavailable');return r.json();});}
export async function verifiedRaidPool(config,signer){
 if(!config.raidPool)throw Error('Raid pool is awaiting operator deployment and funding.');
 const a=await raidPoolArtifact(),code=await signer.provider.getCode(config.raidPool);
 if(Number((await signer.provider.getNetwork()).chainId)!==10143||code==='0x'||executableCode(code,a)!==executableCode(a.runtime,a))throw Error('Raid pool verification failed.');
 const pool=new Contract(config.raidPool,a.abi,signer);
 if((await pool.token()).toLowerCase()!==config.token.toLowerCase()||(await pool.collection()).toLowerCase()!==config.nft.toLowerCase()||(await pool.raidSigner()).toLowerCase()!==config.signer.toLowerCase())throw Error('Raid pool token, NFT or signer mismatch.');return pool;
}
export async function openRaidPool(menu,roundId){
 const ui=menu.chogWallet,r=ui.rewards,nft=menu._identity?.nft;
 menu._openModal({title:'CHOG RAID POOL',text:'Stake CHOG · Keep your NFT · Earn from funded boss rewards',buttons:[{label:'CLOSE',accept:()=>menu._closeModal()}]});
 const modal=menu._modal;modal.classList.add('chog-raid-pool-modal');modal.querySelector('.iw-modal__splat')?.remove();
 const body=h('div',{class:'chog-raid-pool-body'}),message=h('p',{class:'chog-wallet-status',role:'status'},'Loading pool…');modal.querySelector('.iw-modal__card').append(body,message);
 if(!r.token){message.textContent='Connect your wallet and equip an NFT to stake. Guest boss practice is available without a deposit.';return;}
 let busy=false;
 const run=async fn=>{if(busy)return;busy=true;const buttons=[...body.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);try{await fn();await render();}catch(e){message.textContent=e.shortMessage||e.message;}finally{busy=false;buttons.forEach(([b,disabled])=>{if(body.contains(b))b.disabled=disabled;});}};
 const send=async(method,...args)=>{const gas=await method.estimateGas(...args);return (await method(...args,{gasLimit:gas*125n/100n+50000n})).wait(2);};
 const button=(id,label,fn)=>menu._btn({id,label,cls:'iw-btn--small',accept:()=>run(fn)});
 async function render(){
  const config=await r.request('status');if(!modal.isConnected)return;
  if(!config.raidPool){message.textContent='Pool not deployed yet. The operator must deploy it and fund rewards before staking opens.';return;}
  const signer=await r.signer(),pool=await verifiedRaidPool(config,signer),token=new Contract(config.token,['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)','function approve(address,uint256) returns(bool)'],signer);
  const [p,total,reserve,rate,finish,earned,balance,block,history]=await Promise.all([pool.positions(signer.address),pool.totalPrincipal(),pool.rewardReserve(),pool.rewardRate(),pool.periodFinish(),pool.earned(signer.address),token.balanceOf(signer.address),signer.provider.getBlock('latest'),nft?r.request('raid-profile',{tokenId:nft.tokenId}):Promise.resolve({rounds:[]})]);
  if(!modal.isConnected)return;body.replaceChildren();const format=n=>Number(formatUnits(n,18)).toLocaleString('en-US',{maximumFractionDigits:4});
  const active=BigInt(block.timestamp)<finish&&reserve>0n,apr=active&&total>0n?Number(rate*31536000n*10000n/total)/100:null;
  const row=(label,value)=>h('div',{class:'chog-raid-pool-row'},h('span',null,label),h('b',null,value));
  body.append(row('WALLET',format(balance)+' CHOG'),row('YOUR STAKE',format(p.amount)+' CHOG'),row('FUNDED REWARDS',format(reserve)+' CHOG'),row('ACCRUED · BEFORE RAID SCORE',format(earned)+' CHOG'),row('EST. INCENTIVE APR',apr===null?'—':apr.toLocaleString('en-US',{maximumFractionDigits:2})+'%'));
  const input=h('input',{type:'text',inputmode:'decimal',placeholder:'CHOG amount','aria-label':'CHOG stake amount',class:'chog-token-input'});
  body.append(input,h('div',{class:'chog-raid-pool-actions'},button('raid-stake','STAKE',async()=>{if(!nft)throw Error('Equip an owned NFT to stake. You can still withdraw existing principal.');const amount=parseUnits(input.value.trim(),18);if(amount<=0n)throw Error('Enter a positive CHOG amount.');if(await token.allowance(signer.address,config.raidPool)<amount){message.textContent='Confirm CHOG approval in your wallet.';await(await token.approve(config.raidPool,amount)).wait(2);}message.textContent='Confirm CHOG stake in your wallet.';await send(pool.stake,amount,nft.tokenId);}),button('raid-unstake','WITHDRAW STAKE',async()=>{if(p.amount===0n)throw Error('No principal to withdraw.');message.textContent='Confirm principal withdrawal in your wallet.';await send(pool.withdraw,p.amount);})));
  const available=nft&&(roundId||history.rounds?.[0]?.roundId);
  if(available)body.append(button('raid-pool-claim','CLAIM RAID REWARD',async()=>{const claim=await r.request('raid-voucher',{roundId:available});if(claim.pool.toLowerCase()!==config.raidPool.toLowerCase())throw Error('Pool changed. Refresh before claiming.');message.textContent='Confirm your boss reward claim in your wallet.';await send(pool.claimRaid,claim.voucher,claim.signature);}));
  message.textContent='APR changes with total stake and campaign funding. Actual raid rewards depend on your contribution. This is a funded incentive campaign, not external yield.';
 }
 try{await render();}catch(e){message.textContent=e.shortMessage||e.message;}
}
