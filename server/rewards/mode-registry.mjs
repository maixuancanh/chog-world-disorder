import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {randomUUID} from 'node:crypto';
import {validateWorkshopSkill,workshopIdentity} from '../../src/game/skill-workshop.js';
import {validateObjectiveResult} from '../../src/game/objective-rules.js';
const require=createRequire(new URL('../../contracts/demo/package.json',import.meta.url));
const {Contract,getAddress,id,ZeroHash,AbiCoder,keccak256}=require('ethers'),coder=AbiCoder.defaultAbiCoder();
export const RESULT_TYPES={Result:[{name:'roundId',type:'bytes32'},{name:'tokenId',type:'uint256'},{name:'mode',type:'uint8'},{name:'won',type:'bool'},{name:'score',type:'uint256'},{name:'challengeId',type:'bytes32'},{name:'ruleVersion',type:'uint256'},{name:'epoch',type:'uint256'}]};
export const RECIPE_TYPES={Recipe:[{name:'tokenId',type:'uint256'},{name:'wallet',type:'address'},{name:'recipeHash',type:'bytes32'},{name:'choicesHash',type:'bytes32'},{name:'mastery',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'},{name:'epoch',type:'uint256'}]};
const effects=['','mend','empower','ward'],targets=['','self','nearby'],modifiers=['','steady','quick','focused','lasting'];
export function encodeRecipe(recipe){const choices=coder.encode(['uint8','uint8','uint8','uint8'],[effects.indexOf(recipe.effect),targets.indexOf(recipe.target),modifiers.indexOf(recipe.modifier),recipe.version]);return {choices,recipeHash:keccak256(choices)};}
export function decodeRecipe(choices,nft){const [effect,target,modifier,version]=coder.decode(['uint8','uint8','uint8','uint8'],choices);return {version:Number(version),identity:workshopIdentity(nft),effect:effects[Number(effect)],target:targets[Number(target)],modifier:modifiers[Number(modifier)]};}
export class ModeRegistryService{
 constructor(service){this.s=service;this.file=path.join(service.dir,'mode-registry.json');this.artifact=JSON.parse(fs.readFileSync(new URL('../../assets/chog-testnet/mode-registry.json',import.meta.url)));this.refreshConfig();this.lastError=null;
  service.ledger.db.exec(`CREATE TABLE IF NOT EXISTS mode_chain_jobs(jobId TEXT PRIMARY KEY,kind TEXT NOT NULL,wallet TEXT NOT NULL,tokenId TEXT NOT NULL,payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',registry TEXT,tx TEXT,error TEXT,created INTEGER NOT NULL);
   CREATE INDEX IF NOT EXISTS mode_chain_pending ON mode_chain_jobs(status,created);`);
 }
 refreshConfig(){this.address=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')).registry:null;return this.address;}
 async verify(address=this.refreshConfig()){
  const s=this.s;await s.network();if(!address)throw Error('Mode registry is not deployed');
  const code=await s.provider.getCode(address),a=this.artifact,mask=raw=>{let h=raw.slice(2);for(const refs of Object.values(a.immutableReferences))for(const {start,length}of refs)h=h.slice(0,start*2)+'0'.repeat(length*2)+h.slice((start+length)*2);return h.slice(0,-4-parseInt(h.slice(-4),16)*2);};
  if(code==='0x'||mask(code)!==mask(a.runtime))throw Error('Mode registry bytecode mismatch');
  const c=new Contract(address,a.abi,s.provider);if((await c.collection()).toLowerCase()!==s.assets.nft.toLowerCase()||(await c.serverSigner()).toLowerCase()!==s.signer.address.toLowerCase()||(await c.owner()).toLowerCase()!==s.operator.toLowerCase())throw Error('Mode registry configuration mismatch');return c;
 }
 async configure(wallet,address){await this.s.network();if(wallet.toLowerCase()!==this.s.operator.toLowerCase())throw Error('Only the operator can configure the mode registry');address=getAddress(address);if(this.refreshConfig()&&getAddress(this.address)!==address)throw Error('Mode registry already configured');await this.verify(address);fs.writeFileSync(this.file,JSON.stringify({chainId:10143,registry:address},null,2),{mode:0o600});this.address=address;this.wake();return this.s.publicStatus();}
 start(){if(this.timer)return;this.running=true;this.timer=setInterval(()=>this.wake(),15000);this.timer.unref?.();this.wake();}
 stop(){this.running=false;clearInterval(this.timer);clearTimeout(this.wakeTimer);this.timer=null;}
 wake(){if(!this.running||this.wakeTimer)return;this.wakeTimer=setTimeout(()=>{this.wakeTimer=null;this.syncPending();},500);this.wakeTimer.unref?.();}
 syncPending(){if(this.syncing)return this.syncing;const run=()=>this.syncAll();this.syncing=(this.s.serializeChain?this.s.serializeChain(run):run()).catch(e=>{this.lastError=e.shortMessage||e.message;}).finally(()=>{this.syncing=null;});return this.syncing;}
 queueResults(){
  const db=this.s.ledger.db,rows=db.prepare("SELECT r.*,o.result FROM rounds r JOIN objective_results o ON o.roundId=r.roundId WHERE r.mode IN ('control','trials') AND r.nftCollection IS NOT NULL AND r.bonus IS NOT NULL").all();
  for(const row of rows){const result=JSON.parse(row.result),player=result.players.find(p=>p.id===row.actor);if(!player||player.left||row.nftCollection.toLowerCase()!==this.s.assets.nft.toLowerCase())continue;
   validateObjectiveResult(result,{mode:row.mode,challenge:result.challenge});
   const data={roundId:id(row.roundId),tokenId:row.nftTokenId,mode:row.mode==='control'?1:2,won:result.winner===player.team,score:row.mode==='control'?Math.floor(result.scores[player.team]):result.score,challengeId:row.mode==='trials'?id(result.challenge.id):ZeroHash,ruleVersion:result.version};
   db.prepare('INSERT OR IGNORE INTO mode_chain_jobs(jobId,kind,wallet,tokenId,payload,created) VALUES(?,?,?,?,?,?)').run('result:'+row.roundId+':'+row.nftTokenId,'result',row.wallet,row.nftTokenId,JSON.stringify(data),this.s.now());
  }
 }
 async saveWorkshop(wallet,tokenId,recipe){const s=this.s,n=await s.nftXP.resolve(wallet,tokenId);if(!n)throw Error('Equip an owned NFT');const profile=await s.nftProfile(wallet,n.tokenId),nft={...profile.objectiveNft,contract:n.collection,tokenId:n.tokenId},mastery=profile.raidWins||0,valid=validateWorkshopSkill(recipe,nft,{identity:workshopIdentity(nft),wins:mastery}),encoded=encodeRecipe(valid),db=s.ledger.db;
  const c=await this.verify(),stored=await c.recipes(n.tokenId);const previous=db.prepare("SELECT * FROM mode_chain_jobs WHERE kind='recipe' AND tokenId=? AND wallet=? ORDER BY created DESC,rowid DESC LIMIT 1").get(n.tokenId,wallet.toLowerCase());
  if(previous&&['queued','submitted'].includes(previous.status)){const old=JSON.parse(previous.payload);if(old.recipeHash===encoded.recipeHash&&old.mastery>=mastery&&(previous.tx||old.expires>Math.floor(s.now()/1000))){this.wake();return this.jobStatus(previous);}}
  if(stored.version>0n&&stored.recipeHash===encoded.recipeHash&&stored.mastery>=BigInt(mastery))return {registry:this.address,pending:false,confirmed:true,recipeHash:encoded.recipeHash,transactionHash:previous&&JSON.parse(previous.payload).recipeHash===encoded.recipeHash&&previous.status==='confirmed'?previous.tx:null,error:null};
  const jobId='recipe:'+randomUUID(),payload={...encoded,recipe:valid,mastery,wallet:getAddress(wallet),tokenId:n.tokenId,expires:Math.floor(s.now()/1000)+1200};
  // Supersede only unsent jobs. A submitted transaction is always reconciled first.
  db.prepare("UPDATE mode_chain_jobs SET status='superseded' WHERE kind='recipe' AND tokenId=? AND wallet=? AND status='queued' AND tx IS NULL").run(n.tokenId,wallet.toLowerCase());
  db.prepare('INSERT INTO mode_chain_jobs(jobId,kind,wallet,tokenId,payload,created) VALUES(?,?,?,?,?,?)').run(jobId,'recipe',wallet.toLowerCase(),n.tokenId,JSON.stringify(payload),s.now());this.wake();return this.jobStatus(db.prepare('SELECT * FROM mode_chain_jobs WHERE jobId=?').get(jobId));
 }
 jobStatus(job){const p=job?JSON.parse(job.payload):{};return {registry:job?.registry||this.refreshConfig(),pending:!!job&&['queued','submitted'].includes(job.status),confirmed:job?.status==='confirmed',recipeHash:p.recipeHash||null,transactionHash:job?.tx||null,error:job?.error||null};}
 async record(wallet,roundId,tokenId){const row=this.s.ledger.db.prepare('SELECT * FROM rounds WHERE roundId=? AND wallet=?').get(roundId,wallet.toLowerCase());if(!row||!['control','trials'].includes(row.mode)||row.nftTokenId!==String(tokenId))throw Error('No verified NFT result for this account');this.queueResults();this.wake();const job=this.s.ledger.db.prepare('SELECT * FROM mode_chain_jobs WHERE jobId=?').get('result:'+roundId+':'+row.nftTokenId);return {...this.jobStatus(job),error:job?.error||(!job?'This result is not eligible for an onchain record':null)};}
 async profile(wallet,tokenId){const n=await this.s.nftXP.resolve(wallet,tokenId);if(!n)throw Error('Equip an owned NFT');const c=await this.verify(),db=this.s.ledger.db,job=db.prepare("SELECT * FROM mode_chain_jobs WHERE kind='recipe' AND tokenId=? AND wallet=? AND status!='superseded' ORDER BY created DESC,rowid DESC LIMIT 1").get(n.tokenId,wallet.toLowerCase());
  const [control,trials,stored]=await Promise.all([c.stats(n.tokenId,1),c.stats(n.tokenId,2),c.recipes(n.tokenId)]),pending=this.jobStatus(job);let recipe=null,recipeSync=pending;
  if(job&&['queued','submitted'].includes(job.status))recipe=JSON.parse(job.payload).recipe;
  else if(stored.version>0n){recipe=decodeRecipe(stored.choices,{contract:n.collection,tokenId:n.tokenId});recipeSync={registry:this.address,confirmed:true,pending:false,recipeHash:stored.recipeHash,transactionHash:job&&JSON.parse(job.payload).recipeHash===stored.recipeHash?job.tx:null,error:null};}
  const stats=x=>({matches:Number(x.matches),wins:Number(x.wins),totalScore:String(x.totalScore)});
  return {registry:this.address,stats:{control:stats(control),trials:stats(trials)},recipe,mastery:Number(stored.mastery),recipeHash:recipeSync.recipeHash,transactionHash:recipeSync.transactionHash,recipeSync,syncPending:recipeSync.pending,error:this.lastError};
 }
 async confirm(job,receipt,c){if(receipt.status!==1||receipt.to?.toLowerCase()!==this.address.toLowerCase())throw Error('Mode registry transaction reverted');const p=JSON.parse(job.payload),name=job.kind==='result'?'ResultRecorded':'RecipeSaved',event=receipt.logs.filter(l=>l.address.toLowerCase()===this.address.toLowerCase()).map(l=>{try{return c.interface.parseLog(l);}catch{return null;}}).find(e=>e?.name===name&&String(e.args.tokenId)===job.tokenId&&(job.kind==='result'?e.args.roundId===p.roundId:e.args.recipeHash===p.recipeHash));if(!event)throw Error('Missing matching mode registry receipt');this.s.ledger.db.prepare("UPDATE mode_chain_jobs SET status='confirmed',error=NULL,registry=? WHERE jobId=?").run(this.address,job.jobId);}
 async syncAll(){if(!this.refreshConfig())return;const c=await this.verify(),s=this.s,db=s.ledger.db;this.queueResults();this.lastError=null;
  for(const job of db.prepare("SELECT * FROM mode_chain_jobs WHERE status IN ('queued','submitted') ORDER BY CASE kind WHEN 'result' THEN 0 ELSE 1 END,created,rowid LIMIT 20").all()){
   try{
    if(job.tx){const receipt=await s.provider.getTransactionReceipt(job.tx);if(!receipt){const tx=await s.provider.getTransaction(job.tx);if(!tx&&s.now()-job.created>300000)db.prepare("UPDATE mode_chain_jobs SET tx=NULL,status='queued',error='Dropped transaction; retrying' WHERE jobId=?").run(job.jobId);return;}if(await receipt.confirmations()<2)return;await this.confirm(job,receipt,c);continue;}
    const p=JSON.parse(job.payload),epoch=await c.signerEpoch(),domain={name:'ChogModeRegistry',version:'1',chainId:10143,verifyingContract:this.address};let tx;
    if(job.kind==='result'){
     const key=keccak256(coder.encode(['bytes32','uint256'],[p.roundId,p.tokenId]));if(await c.recorded(key)){db.prepare("UPDATE mode_chain_jobs SET status='confirmed',registry=?,error=NULL WHERE jobId=?").run(this.address,job.jobId);continue;}
     const v={...p,epoch},signature=await s.signer.signTypedData(domain,RESULT_TYPES,v);tx=await c.connect(s.signer.connect(s.provider)).recordResult(v.roundId,v.tokenId,v.mode,v.won,v.score,v.challengeId,v.ruleVersion,v.epoch,signature);
    }else{
     if(Math.floor(s.now()/1000)>=p.expires)throw Error('Workshop save expired. Save the skill again.');await s.nftXP.resolve(job.wallet,job.tokenId);
     const current=await c.recipes(job.tokenId),nonce=await c.recipeNonce(job.tokenId),v={tokenId:job.tokenId,wallet:p.wallet,recipeHash:p.recipeHash,choicesHash:p.recipeHash,mastery:Math.max(p.mastery,Number(current.mastery)),nonce,deadline:p.expires,epoch},signature=await s.signer.signTypedData(domain,RECIPE_TYPES,v);
     tx=await c.connect(s.signer.connect(s.provider)).saveRecipe(v.tokenId,v.wallet,v.recipeHash,p.choices,v.mastery,v.nonce,v.deadline,v.epoch,signature);
    }
    db.prepare("UPDATE mode_chain_jobs SET tx=?,registry=?,status='submitted',error=NULL WHERE jobId=?").run(tx.hash,this.address,job.jobId);
    const receipt=await tx.wait(2,60000);if(receipt)await this.confirm({...job,tx:tx.hash},receipt,c);
   }catch(e){const error=e.shortMessage||e.message;db.prepare('UPDATE mode_chain_jobs SET error=? WHERE jobId=?').run(error,job.jobId);if(/not owned|expired|Invalid|mismatch|revert/i.test(error))db.prepare("UPDATE mode_chain_jobs SET status='failed' WHERE jobId=?").run(job.jobId);this.lastError=error;if(/insufficient funds|network|timeout|nonce/i.test(error))break;}
  }
 }
}
