import * as THREE from 'three';
import {G,on,emit} from '../core/ctx.js';
import {BotBrain} from './bots.js';
import {objectiveFromNft,objectiveForModel} from './chog-objectives.js';
import {raidRole,raidRequirements,raidSkills,raidActivity,raidRewardBps} from './boss-raid-rules.js';
import {matchExperience,progression} from './chog-progression.js';
import {BossRaidUI} from '../ui/boss-raid-ui.js';
import {workshopIdentity,defaultWorkshopSkill,validateWorkshopSkill,resolveWorkshopSkill,applyWorkshopSkill,workshopIncoming,workshopOutgoing} from './skill-workshop.js';

export class BossRaidRuntime{
 constructor(match,game){
  this.match=match;this.game=game;this.session=match.opts.huntRoom||null;this.actors=match.actors;this.ledger=game.menus.chogWallet.gameLedger();this.clock=0;this.stats=new Map();this.cooldowns=new Map();this.workshopCooldowns=new Map();this.buffs=new Map();this.events=[];this.eventId=0;
  const mine=game.menus._identity?.nft;this.rewardNft=mine?{...mine}:null;
  for(const [i,a]of this.actors.entries()){
   a.huntId='hunt-'+(a.nid??i);const row=match.opts.roster?.find(p=>p.nid===a.nid);
   a.raidNft=row?.objectiveNft||(a.isLocal?objectiveFromNft(mine):null)||(!a.isLocal?objectiveForModel(a.character.nftId):null);
   if(a.isBot)a.name=a.raidNft?.name||'CHOG';
   a.raidRole=raidRole(a.raidNft);a.raidWins=row?.raidWins||0;a.raidSkill=raidSkills(a.raidWins).some(s=>s.id===row?.raidSkill)?row.raidSkill:'trait';
   a.workshopNft=row?{...a.raidNft,contract:row.nftContract,tokenId:row.nftTokenId}:a.isLocal?{...a.raidNft,contract:mine?.contract,tokenId:mine?.tokenId}:null;
   a.workshopProgress={identity:workshopIdentity(a.workshopNft),wins:a.raidWins};
   const selected=row?.workshopSkill||(a.isLocal?match.opts.workshopSkill:null);
   try{a.workshopSkill=validateWorkshopSkill(selected,a.workshopNft,a.workshopProgress);}catch{a.workshopSkill=defaultWorkshopSkill(a.workshopNft);}
   if((row?.raidSkill||(a.isLocal?match.opts.raidSkill:null))==='workshop')a.raidSkill='workshop';
   this.stats.set(a.huntId,{damage:0,healing:0,blocked:0,breaks:0});
   if(a.isBot&&(!this.session||this.session.isHost))a.bot=new BotBrain(a,match.opts.difficulty||'normal');
  }
  this.local=match.local.huntId;this.requirements=raidRequirements(this.actors.map(a=>a.raidNft));this.phase=0;
  this.core={roundId:this.session?.room.roundId||crypto.randomUUID(),phase:'playing',players:new Map(this.actors.map(a=>[a.huntId,{id:a.huntId,name:a.name,earned:0,purchases:0,left:false,activity:{}}])),leave:id=>this.leavePlayer(id)};
  if(this.session&&!this.session.isHost){match.boss.sim=false;match.boss.brain=null;match.follower=true;}
  this.hitOff=on('boss:hit',e=>{if(e.predicted||!e.attacker?.huntId||!e.damage||this.session&&!this.session.isHost)return;const s=this.stats.get(e.attacker.huntId);if(s)s.damage+=e.damage;});
  this.skillKey=e=>{if(e.code!=='KeyF'||e.repeat||this.game.menus.current||this.match.state!=='playing')return;this.useSkill();};
  if(!this.session?.simulation)window.addEventListener('keydown',this.skillKey);
  this.ui=new BossRaidUI(this);this.session?.bind(this);
 }
 useSkill(){
  const a=this.match.local;if(this.game.menus.current||this.match.paused||!a.alive||this.match.controller?.mapHeld||(G.rig?.mapK||0)>.02)return;
  if(!a.raidNft&&a.raidSkill!=='workshop'){this.ui.notify('NFT required · Equip your Chog in My NFT');return;}
  const wait=((a.raidSkill==='workshop'?this.workshopCooldowns:this.cooldowns).get(this.local)||0)-this.clock;if(wait>0){this.ui.notify('Skill recharging · '+Math.ceil(wait)+'s');return;}
  if(this.session&&!this.session.isHost){this.session.command='raid-skill';this.ui.notify('Activating…');}else this.ability(this.local);
 }
 actor(id){return this.actors.find(a=>a.huntId===id);}
 beginFrame(dt){
  if(this.session){if(!this.session.room.go)return false;if(!this.session.isHost){this.session.replica.update(dt);return false;}this.session.replica.hostInputs(dt);}
  this.clock+=dt;
  const phase=this.match.boss.phase||1;if(phase!==this.phase){this.phase=phase;this.shield=true;}
  if(this.match.state==='playing'){
   for(const a of this.actors)if(a.isBot&&!this.botsFrozen&&a.pos.distanceTo(this.match.boss.pos)<30)this.ability(a.huntId);
  }
  if(this.botsFrozen)for(const a of this.actors)if(a.isBot){a.bot=null;a.intent.move.set(0,0,0);a.intent.fire=false;}
  return true;
 }
 endFrame(dt){for(const a of this.actors){const p=this.core.players.get(a.huntId);p.activity=raidActivity(this.stats.get(a.huntId));p.raidStats={...this.stats.get(a.huntId)};}this.ui.update(dt);}
 requirement(){return this.requirements[(this.match.boss.phase||1)-1];}
 ability(id){
  if(this.actor(id)?.raidSkill==='workshop')return this.workshopAbility(id);
  const a=this.actor(id),p=this.core.players.get(id);if(!a?.alive||p?.left||!a.raidNft||this.match.state!=='playing'||this.clock<(this.cooldowns.get(id)||0))return false;
  const unlocked=raidSkills(a.raidWins);if(!unlocked.some(s=>s.id===a.raidSkill))return false;
  this.cooldowns.set(id,this.clock+(a.raidSkill==='second-wind'?30:18));
  const stats=this.stats.get(id),near=this.actors.filter(b=>b.alive&&b.pos.distanceTo(a.pos)<=12);
  const role=a.raidRole.id;
  if(a.raidSkill==='second-wind'){const gain=Math.min(35,100-a.hp);a.hp+=gain;stats.healing+=gain;}
  else if(a.raidSkill==='rally'){for(const b of near)this.buffs.set(b.huntId,{...this.buffs.get(b.huntId),power:this.clock+4});}
  else if(role==='breaker')this.buffs.set(id,{...this.buffs.get(id),power:this.clock+5});
  else if(role==='guardian'){for(const b of near)this.buffs.set(b.huntId,{...this.buffs.get(b.huntId),guard:this.clock+5,guardian:id});}
  else if(role==='medic'){for(const b of near){const gain=Math.min(20,100-b.hp);b.hp+=gain;stats.healing+=gain;}}
  const req=this.requirement();if(this.shield&&req&&a.raidNft.traits.some(t=>t.id===req.id)&&a.pos.distanceTo(this.match.boss.pos)<=30){this.shield=false;stats.breaks++;this.match.boss.model.flash(1,true);}
  G.fx?.ring(a.pos,new THREE.Vector3(0,1,0),a.color,{radius:a.raidSkill==='rally'||role==='medic'||role==='guardian'?12:3,life:.8});
  G.fx?.burst(a.pos.clone().add(new THREE.Vector3(0,.7,0)),new THREE.Vector3(0,1,0),a.color,{count:20,speed:3,size:.12});
  this.events.push({type:'raid-ability',id,serial:++this.eventId});this.events=this.events.slice(-80);return true;
 }
 workshopFacts(a=this.match.local){return resolveWorkshopSkill(a.workshopSkill,a.workshopNft,a.workshopProgress);}
 workshopAbility(id){
  const a=this.actor(id),p=this.core.players.get(id);if(!a?.alive||p?.left||a.raidSkill!=='workshop'||this.match.state!=='playing'||this.clock<(this.workshopCooldowns.get(id)||0))return false;
  let skill;try{skill=applyWorkshopSkill({actor:a,actors:this.actors,recipe:a.workshopSkill,nft:a.workshopNft,progress:a.workshopProgress,clock:this.clock,buffs:this.buffs,stats:this.stats});}catch{return false;}
  if(!skill)return false;this.workshopCooldowns.set(id,this.clock+skill.cooldown);
  G.fx?.ring(a.pos,new THREE.Vector3(0,1,0),a.color,{radius:skill.radius||3,life:.8});
  this.events.push({type:'workshop-ability',id,serial:++this.eventId});this.events=this.events.slice(-80);return true;
 }
 incoming(a,amount){amount=workshopIncoming(a,amount,this.clock,this.buffs,this.stats);const buff=this.buffs.get(a.huntId);if(buff?.guard>this.clock){const blocked=amount*.2;const stats=this.stats.get(buff.guardian);if(stats)stats.blocked+=blocked;return amount-blocked;}return amount;}
 outgoing(a,damage){return workshopOutgoing(a,damage,this.clock,this.buffs)*(this.shield ? .65:1)*(this.buffs.get(a?.huntId)?.power>this.clock?1.15:1);}
 leavePlayer(id){const p=this.core.players.get(id);if(p)p.left=true;const a=this.actor(id);if(a){a.bot=null;a.alive=false;a.respawnTimer=Infinity;a.character.setVisible(false);}}
 finish(){
  if(this.core.result)return this.core.result;
  const win=!!this.match.boss.dead;this.core.phase='finished';this.core.winner=win?'squad':null;
  this.core.result={mode:'boss',roundId:this.core.roundId,winner:this.core.winner,boss:{win,maxHp:this.match.boss.maxHp,hp:this.match.boss.hp,phase:this.match.boss.phase},players:this.actors.map(a=>{const p=this.core.players.get(a.huntId),stats=this.stats.get(a.huntId),activity=raidActivity(stats);p.activity=activity;p.raidStats=stats;return {...p,won:win&&!p.left,bonus:0,total:0,experience:matchExperience(win,p.left,activity),raidStats:stats,rewardBps:win?raidRewardBps(stats,this.match.boss.maxHp):0};})};return this.core.result;
 }
 async showResults(){
  if(this.resultsShown||this.session?.simulation){this.finish();return;}this.resultsShown=true;
  const result=this.finish(),row=result.players.find(p=>p.id===this.local);
  if(this.session?.room.verified){try{await new Promise(resolve=>setTimeout(resolve,300));await this.game.menus.chogWallet.rewards.refresh();}catch{}}
  else this.ledger.claim(result,this.local);
  if(this.disposed)return;
  this.match.state='results';this.game.hud.setVisible(false);this.ui.root.hidden=true;G.input.exitLock();
  const xp=row.experience.total,rewards=this.game.menus.chogWallet.rewards,nftProgress=rewards.nftProgress.get(String(this.rewardNft?.tokenId));
  const progress=this.session?.room.verified?(Number.isSafeInteger(nftProgress?.totalXp)?nftProgress:rewards.progress):this.ledger.progress,before=progression(Math.max(0,(progress?.totalXp||xp)-xp));
  const top=[...this.actors].sort((a,b)=>(this.stats.get(b.huntId).damage-this.stats.get(a.huntId).damage)).slice(0,4);
  this.game.showcase.showResults(0,result.boss.win,G.teamColors[0],top.map(a=>({weapon:a.weaponId,style:{chogNft:a.character.nftId},name:a.name})));
  this.game.menus.showResults({mode:'boss',win:result.boss.win,boss:{name:'HULLBREAKER',defeated:result.boss.win,time:this.match.duration-this.match.time,hpLeft:this.match.boss.hp/this.match.boss.maxHp,phase:this.match.boss.phase},colors:G.teamHex,players:this.actors.map(a=>({name:a.name,team:0,weapon:a.weaponId,damage:Math.round(this.stats.get(a.huntId).damage),weakHits:a.stats.weakHits||0,turf:0,splats:0,deaths:a.stats.deaths||0,isSelf:a.isLocal,bot:a.isBot})),xp:{gained:xp,levelBefore:before.level,levelAfter:progress?.level||1,xpBefore:before.xp,xpAfter:progress?.xp||0,xpToNextBefore:before.nextLevelXp,xpToNextAfter:progress?.nextLevelXp||1150},mapName:this.game.mapDef.name,raid:row});
  this.game.menus.show('results');G.audio?.play(result.boss.win?'victory_fanfare':'defeat_jingle');
 }
 async leave(){await this.session?.leave();await this.game.quitToMenu();this.game.menus._lobbyKind='boss';this.game.menus.show('lobby',{force:true});}
 dispose(){this.disposed=true;window.removeEventListener('keydown',this.skillKey);this.session?.replica?.dispose?.();this.hitOff?.();this.ui.dispose();}
}
