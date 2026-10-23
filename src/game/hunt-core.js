import {ACTIVITY_XP,matchExperience} from './chog-progression.js';
import {DROP_TIMES} from './hunt-airdrop-rules.js';
// Pure match authority; all currency uses integer milli-CHOG, never floating sums.
export const HUNT=Object.freeze({duration:300,brief:5,return:.45,dock:.65,ammo:5,stun:3,hold:2,buyAmmo:3,buyPrice:3000,maxBuys:2,dropTimes:DROP_TIMES,win:20000,lose:2000,capture:1000});
export class HuntCore {
 constructor({players,traits,objective=null,holderId,duration=HUNT.duration,roundId=globalThis.crypto.randomUUID()}){
  if(players.length!==6||new Set(players.map(p=>p.id)).size!==6)throw Error('Trait Hunt needs six unique players');
  if(!traits.length||traits.length>4||new Set(traits.map(t=>t.id)).size!==traits.length)throw Error('One to four unique target traits are required');
  this.objective=objective?structuredClone(objective):null;
  this.players=new Map(players.map(p=>[p.id,{...p,ammo:HUNT.ammo,purchases:0,stun:0,recovering:0,earned:0,activity:{},out:false,left:false,balance:p.balance??0}]));
  if(!this.players.has(holderId))throw Error('Unknown holder');if(this.players.get(holderId).canCarry===false)throw Error('Carrier requires an NFT');this.holderId=holderId;this.traits=traits;this.found=new Set();this.roundId=roundId;this.duration=duration;this.time=duration;this.elapsed=0;this.phase='briefing';this.brief=0;this.epoch=0;this.invulnerable=0;this.dropIndex=0;this.drops=new Map();this.events=[];this.opened=new Set();this.winner=null;this.result=null;
 }
 event(type,data={}){this.events.push({type,...data});}
 drain(){return this.events.splice(0);}
 role(id){return this.holderId===id?'carrier':'hunter';}
 activity(id,key){const p=this.players.get(id),rule=ACTIVITY_XP[key];if(!p||!rule)return;const count=p.activity[key]||0;if(count>=rule.cap)return;p.activity[key]=count+1;this.event('experience',{id,key,amount:rule.xp});}
 pendingBalance(id){let sum=0;for(const d of this.drops.values())if(d.openedBy===id&&d.collected===null)sum+=d.amount;return sum;}
 canContinue(id){const p=this.players.get(id);return !!p&&!p.left&&(!p.out||(p.outReason==='ammo'&&p.purchases<HUNT.maxBuys&&(p.balance+this.pendingBalance(id))>=HUNT.buyPrice));}
 active(id){const p=this.players.get(id);return this.phase==='playing'&&p&&!p.out&&!p.left&&p.stun<=0&&(p.recovering||0)<=0&&(p.roleBrief||0)<=0;}
 step(dt,{pendingShots}={}){
  dt=Math.max(0,Math.min(dt,1));if(this.phase==='finished')return;
  if(this.phase==='briefing'){this.brief+=dt;if(this.brief>=HUNT.brief+HUNT.return+HUNT.dock){this.phase='playing';this.event('play');}return;}
  if(this.phase==='ending'){this.endDelay-=dt;if(this.endDelay<=0)this.finish();return;}
  this.time=Math.max(0,this.time-dt);this.elapsed+=dt;this.invulnerable=Math.max(0,this.invulnerable-dt);for(const p of this.players.values()){p.stun=Math.max(0,p.stun-dt);p.recovering=Math.max(0,(p.recovering||0)-dt);p.roleBrief=Math.max(0,(p.roleBrief||0)-dt);}
  while(this.dropIndex<DROP_TIMES.length&&this.elapsed+1e-7>=DROP_TIMES[this.dropIndex]&&this.time>0){const at=DROP_TIMES[this.dropIndex++];this.event('drop-wave',{wave:this.dropIndex,at});}
  if(this.time<=0)this.end(null,'timeout');
  else if(pendingShots===undefined?this.elapsed>=(this.lastShotAt??-2)+1.25:!pendingShots){if([...this.players.keys()].filter(id=>this.canContinue(id)).length<=1)this.end(null,'no-opponents');else if(!this.canContinue(this.holderId))this.end(null,'no-carrier');}
 }
 shoot(id){if(!this.active(id))return false;const p=this.players.get(id);if(p.ammo<=0)return false;p.ammo--;this.lastShotAt=this.elapsed;this.event('shot',{id,ammo:p.ammo});if(!p.ammo){p.out=true;p.outReason='ammo';this.event('exhausted',{id});}return true;}
 hit(attacker,victim,epoch=this.epoch){
  if(this.phase!=='playing'||epoch!==this.epoch||attacker===victim||!this.players.has(attacker)||!this.players.has(victim))return false;
  const a=this.players.get(attacker),v=this.players.get(victim);if(a.left||v.left||v.out||a.stun>0)return false;
  if(this.role(attacker)==='carrier'&&this.role(victim)==='hunter'){if(v.stun<=0)this.activity(attacker,'stuns');v.stun=HUNT.stun;this.event('stun',{id:victim});return true;}
  if(this.role(attacker)==='hunter'&&victim===this.holderId&&this.invulnerable<=0){const old=this.holderId;v.out=true;v.outReason='captured';v.capturedBy=attacker;this.holderId=attacker;this.activity(attacker,'captures');this.award(attacker,HUNT.capture);this.epoch++;a.roleBrief=HUNT.brief+HUNT.return+HUNT.dock;this.invulnerable=a.roleBrief+HUNT.stun;this.event('capture',{id:attacker,old,found:[...this.found]});return true;}
  return false;
 }
 award(id,amount){const p=this.players.get(id);p.earned+=amount;p.balance+=amount;this.event('balance',{id,earned:p.earned,balance:p.balance});}
 canOpen(id){return this.active(id)&&this.role(id)==='carrier';}
 reveal(id,chest){
  if(!this.canOpen(id)||this.opened.has(chest.id))return false;
  if(chest.kind==='token'&&(!Number.isInteger(chest.amountMilli)||!(chest.amountMilli>=5&&chest.amountMilli<=100||chest.amountMilli===1000)))return false;
  this.opened.add(chest.id);const p=this.players.get(id);
  if(chest.kind==='token'){this.award(id,chest.amountMilli);this.activity(id,'loot');}
  const traitMatched=chest.kind==='trait'&&this.traits.some(t=>t.id===chest.trait?.id&&t.category===chest.trait.category&&t.value===chest.trait.value)&&!this.found.has(chest.trait.id);
  if(traitMatched){this.found.add(chest.trait.id);this.activity(id,'traits');}
  this.event('loot',{id,chestId:chest.id,kind:chest.kind,traitId:chest.trait?.id,traitMatched,amount:chest.amountMilli||0});
  if(this.found.size===this.traits.length)this.end(id,'traits');return true;
 }
 addDrop(id,amount){if(this.drops.has(id)||!Number.isInteger(amount)||amount<1||amount>100)return false;this.drops.set(id,{amount,collected:null});return true;}
 beginDrop(id,dropId){const d=this.drops.get(dropId);if(!this.active(id)||!d||d.collected!==null||d.openedBy)return false;d.openedBy=id;this.activity(id,'supplies');this.event('drop-opened',{id,dropId});return true;}
 finishDrop(id,dropId){const d=this.drops.get(dropId);if(!d||d.collected!==null||d.openedBy!==id||this.phase==='finished')return false;d.collected=id;this.award(id,d.amount);this.activity(id,'loot');this.event('drop-collected',{id,dropId,amount:d.amount});return true;}
 collectDrop(id,dropId){return this.beginDrop(id,dropId)&&this.finishDrop(id,dropId);}

 buy(id){const p=this.players.get(id);if(this.phase!=='playing'||!p||p.left||!p.out||p.outReason==='captured'||p.purchases>=HUNT.maxBuys||p.balance<HUNT.buyPrice)return false;p.balance-=HUNT.buyPrice;p.ammo=HUNT.buyAmmo;p.out=false;p.outReason=null;p.stun=0;p.purchases++;this.event('ammo-bought',{id});return true;}
 leave(id){const p=this.players.get(id);if(!p||p.left)return;p.left=true;p.out=true;this.event('left',{id});if(this.phase==='finished'||this.phase==='ending')return;if(id===this.holderId){const next=[...this.players.values()].find(p=>this.canContinue(p.id));if(next){this.holderId=next.id;this.epoch++;next.roleBrief=HUNT.brief+HUNT.return+HUNT.dock;this.invulnerable=next.roleBrief+HUNT.stun;this.event('capture',{id:next.id,old:id,found:[...this.found],disconnect:true});}else this.end(null,'no-players');}}
 end(winner,reason){if(this.phase==='ending'||this.phase==='finished')return;this.winner=winner;this.reason=reason;this.phase='ending';this.endDelay=1;this.event('end',{winner,reason});}
 finish(){for(const [id,d]of this.drops)if(d.openedBy&&d.collected===null)this.finishDrop(d.openedBy,id);this.phase='finished';this.result={roundId:this.roundId,winner:this.winner,reason:this.reason,found:[...this.found],players:[...this.players.values()].map(p=>({id:p.id,name:p.name,left:p.left,activity:{...p.activity},experience:matchExperience(p.id===this.winner,p.left,p.activity),earned:p.earned,bonus:p.id===this.winner?HUNT.win:HUNT.lose,total:p.earned+(p.id===this.winner?HUNT.win:HUNT.lose)}))};this.event('results',this.result);}
}

