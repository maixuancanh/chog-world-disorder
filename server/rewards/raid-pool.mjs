import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(new URL('../../contracts/demo/package.json',import.meta.url));const {Contract,getAddress,id}=require('ethers');
export const RAID_TYPES={Raid:[{name:'roundId',type:'bytes32'},{name:'wallet',type:'address'},{name:'tokenId',type:'uint256'},{name:'positionNonce',type:'uint256'},{name:'rewardBps',type:'uint256'},{name:'deadline',type:'uint256'}]};
export class RaidPoolService{
 constructor(service){this.s=service;this.file=path.join(service.dir,'raid-pool.json');this.address=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file)).address:null;this.artifact=JSON.parse(fs.readFileSync(new URL('../../assets/chog-testnet/raid-pool.json',import.meta.url)));}
 async verify(address=this.address){if(!address)throw Error('Operator must deploy and fund the raid pool');await this.s.network();const code=await this.s.provider.getCode(address),a=this.artifact;
  const mask=raw=>{let h=raw.slice(2);for(const refs of Object.values(a.immutableReferences))for(const {start,length}of refs)h=h.slice(0,start*2)+'0'.repeat(length*2)+h.slice((start+length)*2);return h.slice(0,-4-parseInt(h.slice(-4),16)*2);};
  if(code==='0x'||mask(code)!==mask(a.runtime))throw Error('Raid pool bytecode mismatch');
  const c=new Contract(address,a.abi,this.s.provider);if((await c.token()).toLowerCase()!==this.s.token.toLowerCase()||(await c.collection()).toLowerCase()!==this.s.assets.nft.toLowerCase()||(await c.raidSigner()).toLowerCase()!==this.s.signer.address.toLowerCase()||(await c.owner()).toLowerCase()!==this.s.operator.toLowerCase())throw Error('Raid pool configuration mismatch');return c;
 }
 async configure(wallet,address){if(wallet.toLowerCase()!==this.s.operator?.toLowerCase())throw Error('Only the operator can configure the raid pool');if(this.address&&getAddress(address)!==getAddress(this.address))throw Error('Raid pool already configured');await this.verify(address);this.address=getAddress(address);fs.writeFileSync(this.file,JSON.stringify({chainId:10143,address:this.address}),{mode:0o600});return this.s.publicStatus();}
 async entry(wallet,tokenId){if(!this.address||!tokenId)return null;const c=await this.verify(),p=await c.positions(wallet);return p.amount>0n&&String(p.tokenId)===String(tokenId)?String(p.nonce):null;}
 async voucher(wallet,roundId){
  const s=this.s,row=s.ledger.db.prepare('SELECT * FROM rounds WHERE roundId=? AND wallet=?').get(roundId,wallet.toLowerCase());
  if(!row||row.mode!=='boss'||!row.xpAwarded||!row.raidWon||row.leftRound||!row.nftTokenId||!row.raidStakeNonce||!row.raidBps)throw Error('No qualified staked boss victory for this round');
  await s.nftXP.resolve(wallet,row.nftTokenId);const c=await this.verify(),p=await c.positions(wallet);
  if(p.amount===0n||String(p.nonce)!==row.raidStakeNonce||String(p.tokenId)!==row.nftTokenId)throw Error('Stake position changed after this raid');
  const roundHash=id(roundId),key=require('ethers').keccak256(require('ethers').AbiCoder.defaultAbiCoder().encode(['bytes32','address'],[roundHash,wallet]));if(await c.used(key))throw Error('Raid reward already claimed');
  if(await c.earned(wallet)===0n)throw Error('No funded reward accrued yet');const block=await s.provider.getBlock('latest');
  const voucher={roundId:roundHash,wallet:getAddress(wallet),tokenId:row.nftTokenId,positionNonce:row.raidStakeNonce,rewardBps:row.raidBps,deadline:block.timestamp+600};
  return {pool:this.address,voucher,signature:await s.signer.signTypedData({name:'ChogRaidPool',version:'1',chainId:10143,verifyingContract:this.address},RAID_TYPES,voucher)};
 }
}
