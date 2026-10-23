import {matchExperience} from './chog-progression.js';
import {h} from '../ui/ui-util.js';
import {HuntAirdrops} from './hunt-airdrops.js';
import {botSkill} from './hunt-airdrop-rules.js';
import * as THREE from 'three';
import {G,on,emit} from '../core/ctx.js';
import {HuntCore,HUNT} from './hunt-core.js';
import {PLAYER} from '../config.js';
import {ChestReward} from './chog-world-chests.js';
import {objectiveFromNft,objectiveForModel} from './chog-objectives.js';
import {HuntMatchUI} from '../ui/hunt-match-ui.js';
import {mountMythicReward} from '../ui/mythic-reward-view.js';
import {huntSpawnPlan} from './hunt-spawns.js';

// Local six-actor authority. The legacy turf relay is deliberately not used.
export class HuntRuntime {
 constructor(match,game,sources){
  this.match=match;this.game=game;this.session=match.opts.huntRoom||null;this.world=game.worldChests;this.ledger=game.menus.chogWallet.gameLedger();
  const identity=game.menus._identity;this.rewardNft=identity?.nft?{...identity.nft}:null;this.rewardTokenId=this.rewardNft?.tokenId;
  this.actors=match.actors;this.actors.forEach((a,i)=>a.huntId='hunt-'+i);this.local=match.local.huntId;
  const objectives=new Map(this.actors.map(a=>{const row=match.opts.roster?.find(p=>p.nid===a.nid);return [a.huntId,row?.objectiveNft||(a.isLocal?objectiveFromNft(identity?.nft):null)||objectiveForModel(a.character.nftId)];}));
  const canCarry=a=>!!objectives.get(a.huntId)&&(this.session?match.opts.roster.find(p=>p.nid===a.nid)?.canCarry===true:a.isLocal?identity?.kind==='wallet'&&!!identity.nft:!a.isLocal);const carriers=this.actors.filter(canCarry);if(!carriers.length)throw Error('No eligible Carrier.');
  const initial=carriers[Math.floor(Math.random()*carriers.length)],objective=objectives.get(initial.huntId);
  this.world.resetForMatch({traits:objective.traits});
  this.core=new HuntCore({players:this.actors.map(a=>({id:a.huntId,name:a.name,canCarry:canCarry(a),balance:this.session?(match.opts.roster.find(p=>p.nid===a.nid)?.balance||0):a.isLocal?this.ledger.balance:0})),traits:objective.traits,objective,
   holderId:initial.huntId,duration:match.duration,roundId:this.session?.room.roundId||this.world.roundId});
  this.holds=new Map();this.delays=new Map();this.bots=new Map();this.rewards=[];this.skill=botSkill(this.session?.room.verified?Math.max(1,...match.opts.roster.filter(p=>!p.bot).map(p=>p.level||1)):Math.max(this.ledger.progress.level,game.profile.level||1));this.skill={...botSkill(64),level:this.skill.level,tier:'EXPERT'};this.airdrops=new HuntAirdrops(this,sources);
  this.spawnPlan=huntSpawnPlan(G.level,[...this.core.players.values()],this.core.holderId);
  this.roles();
  for(const spawn of this.spawnPlan){const a=this.actor(spawn.id);
   a.respawn({position:new THREE.Vector3(spawn.x,spawn.y,spawn.z),yaw:spawn.yaw});a.huntSpawn=new THREE.Vector3(spawn.x,spawn.y,spawn.z);}
  this.installFiniteWeapons();

  this.ui=new HuntMatchUI(this);this.session?.bind(this);G.rig.follow(match.local,true);G.rig.yaw=match.local.yaw;G.rig.pitch=-.12;
 }
 actor(id){return this.actors.find(a=>a.huntId===id);}
 respawn(a){const p=huntSpawnPlan(G.level,[...this.core.players.values()],this.core.holderId).find(p=>p.id===a.huntId);a.respawn({position:new THREE.Vector3(p.x,p.y,p.z),yaw:p.yaw});a.huntSpawn=new THREE.Vector3(p.x,p.y,p.z);this.delays.delete(a.huntId);}
 roles(){for(const a of this.actors){a.team=this.core.role(a.huntId)==='carrier'?0:1;a.color.copy(G.teamColors[a.team]);}this.holds.clear();}
 zero(a){a.intent.move.set(0,0,0);for(const k of ['jump','fire','squid','sub','special'])a.intent[k]=false;a.fireBuffer=0;}
 // Reuse the native WeaponRunner unchanged. Reserve one CHOG round at the
 // projectile boundary so charged bursts, catch-up shots and twin hands all obey the ammo limit.
 installFiniteWeapons(){
  const projectiles=G.projectiles;this.nativeFire=new Map();
  this.shotVisualOff=on('weapon:fire',e=>{if(this.session?.isHost&&this.core.players.has(e.actor?.huntId))this.session.events.push({type:'shot-visual',id:e.actor.huntId,serial:++this.session.eventId,muzzle:e.muzzle.toArray(),dir:e.dir.toArray(),weapon:e.weapon,charge:e.charge,len:e.len,hand:e.hand});});
  for(const name of ['fireShooter','fireBlaster','fireCharger','fireStream','fireTwin']){
   const original=projectiles[name],wrapped=(a,...args)=>{
    if(!this.core.shoot(a.huntId))return;
    const before=projectiles.list.length;
    const result=original.call(projectiles,a,...args);
    for(let i=before;i<projectiles.list.length;i++){
     const p=projectiles.list[i];p.huntEpoch=this.core.epoch;
     if(this.session?.isHost)this.session.events.push({type:'projectile',epoch:p.huntEpoch,id:a.huntId,serial:++this.session.eventId,packed:[0,'p',a.huntId,p.type,p.wid||0,...p.pos.toArray(),...p.vel.toArray(),p.delay||0,p.life,p.straight,p.radius,p.size,p.grav,p.drag,p.trailEvery||0,p.head?1:0,p.vis??.1,p.tail0??.8,p.tailK??1.3,p.wob??.035,p.wobF??26,p.nose??.3,p.sats??3]});
    }

    return result;
   };
   this.nativeFire.set(name,{original,wrapped});projectiles[name]=wrapped;
  }
 }
 fire(a,dt,input){
  const runner=a.weaponRunner;
  if(!this.core.active(a.huntId)){if(runner.charging||runner.burstT>0)runner.reset();return;}
  // The original ink reservoir must not impose an extra ammo economy or refill.
  const ink=a.ink;a.ink=PLAYER.inkMax;
  try{runner.update(dt,{...input,sub:false,subReleased:false});}finally{a.ink=ink;}
  if(!this.core.active(a.huntId)&&(runner.charging||runner.burstT>0))runner.reset();
 }
 environmentDeath(a){const p=this.core.players.get(a.huntId);if(p&&!p.out){p.recovering=PLAYER.respawnTime;this.holds.delete(a.huntId);this.bots.delete(a.huntId);if(!this.session||this.session.isHost)this.core.event('environment-death',{id:a.huntId,cause:'water',respawn:PLAYER.respawnTime});}}
 hit(attacker,victim,epoch=this.core.epoch){if(this.session&&!this.session.isHost)return false;if(!attacker||!victim)return false;const ok=this.core.hit(attacker.huntId,victim.huntId,epoch);
  if(ok){victim.hp=Math.max(1,PLAYER.hp-45);victim.hurtFlash=1;victim.lastAttacker=attacker;victim.lastDamage=0;victim.character.trigger('hit',1);
   const captured=this.core.players.get(victim.huntId).outReason==='captured';
   emit('damage',{victim,attacker,amount:45,source:'hunt'});emit('hit',{attacker,victim,damage:45,killed:captured,weaponId:attacker.weaponId});
   if(captured)victim.splat(attacker,'hunt-captured');
   this.handleEvents(this.core.drain());
  }return ok;}

 exhaust(a){const p=this.core.players.get(a.huntId);if(!p.out){p.ammo=0;p.out=true;p.outReason='ammo';this.core.event('exhausted',{id:a.huntId});}}
 hold(a,dt,pressed){
  const id=a.huntId,e=pressed?this.nearbyChest(a):null,old=this.holds.get(id);
  if(!e){this.holds.delete(id);return;}
  const h=old?.entry===e?old:{entry:e,time:0};h.time+=dt;this.holds.set(id,h);
  if(h.time>=HUNT.hold){if(e.phase==='grounded')this.airdrops.open(a,e);else{this.authorizedOpen=true;try{this.world.open(e.id,id)}finally{this.authorizedOpen=false}}this.holds.delete(id);}
 }
 nearbyChest(a){if(!this.core.active(a.huntId))return null;const supply=this.airdrops.nearest(a.pos),map=this.core.canOpen(a.huntId)?this.world.nearest(a.pos):null;if(!map)return supply;if(!supply)return map;return a.pos.distanceToSquared(map.chest.group.position)<a.pos.distanceToSquared(supply.group.position)?map:supply;}
 canReveal(){if(this.session&&!this.session.isHost)return false;return this.core.canOpen(this.core.holderId);}
 onChestReveal(e){this.core.reveal(this.core.holderId,e);}
 buy(){
  if(this.session&&!this.session.isHost){this.session.command='buy';return true;}
  const p=this.core.players.get(this.local);p.balance=this.ledger.balance;
  if(this.core.phase!=='playing'||!p.out||p.outReason==='captured'||p.purchases>=HUNT.maxBuys||p.balance<HUNT.buyPrice)return false;
  try{if(!this.ledger.buyAmmo(this.core.roundId,p.purchases+1))return false;}catch(e){this.ui.message(e.message);return false;}
  if(!this.core.buy(this.local))throw Error('Ammo purchase state changed unexpectedly');
  const a=this.match.local;this.respawn(a);G.rig.follow(a,true);G.input.requestLock();return true;
 }
 async claim(){try{if(this.session?.room.verified){const account=this.game.menus.chogWallet.rewards;const ok=await account.claim(this.core.roundId);this.core.players.get(this.local).balance=account.balance;return ok;}const ok=this.ledger.claim(this.core.result,this.local);if(ok)this.core.players.get(this.local).balance=this.ledger.balance;return ok;}catch(e){this.ui.message(e.message);return false;}}
 async leave(){await this.session?.leave();this.core.leave(this.local);if(this.session?.room.verified)try{await this.game.menus.chogWallet.rewards.refresh();if(this.rewardTokenId)await this.game.menus.chogWallet.rewards.loadNftProgress(this.rewardTokenId);}catch{}this.game.quitToMenu();}
 navigationObstacles(){
  const solids=G.level.blocks.filter(b=>b.bodyOnly&&b.solid),key=solids.map(b=>`${b.id}:${b.center.x}:${b.center.z}`).join('|');
  if(this.navKey===key)return this.navBlocked;
  this.navKey=key;const blocked=this.navBlocked=new Set(),r=PLAYER.radius+.1;
  for(const n of G.nav.nodes)for(const b of solids){
   if(n.y+.35>b.aabbMax.y||n.y+PLAYER.height<b.aabbMin.y||n.x<b.aabbMin.x-r||n.x>b.aabbMax.x+r||n.z<b.aabbMin.z-r||n.z>b.aabbMax.z+r)continue;
   const x=n.x-b.center.x,z=n.z-b.center.z,dx=Math.max(0,Math.abs(x*b.axes[0].x+z*b.axes[0].z)-b.half.x),dz=Math.max(0,Math.abs(x*b.axes[2].x+z*b.axes[2].z)-b.half.z);
   if(Math.hypot(dx,dz)<r){blocked.add(n.id);break;}
  }return blocked;
 }
 route(a,target){
  const blocked=this.navigationObstacles(),nav=G.nav;
  const nearest=(p,start)=>{const id=nav.nearest(p,1.2,start);if(id>=0&&!blocked.has(id))return id;
   let best=-1,d=Infinity;for(const n of nav.nodes){if(blocked.has(n.id)||!nav.valid[n.id]||n.y>p.y+1.2)continue;const score=(n.x-p.x)**2+(n.z-p.z)**2+((n.y-p.y)*2.5)**2;if(score<d){d=score;best=n.id;}}return best;};
  return nav.path(nearest(a.pos,true),nearest(target,false),a.team,18000,true,{ignoreZones:true,blocked,nodeCost:n=>{
   if(!a.isBot)return 0;let cost=0;
   for(const other of this.actors){if(other===a||!other.alive)continue;const d=Math.hypot(n.x-other.pos.x,n.z-other.pos.z);
    if(other.team===a.team)cost+=Math.max(0,3-d)*.7;
    else if(this.core.role(a.huntId)==='carrier')cost+=Math.max(0,14-d)*.45;
   }return cost;
  }})||[];
 }
 bot(a,dt){
  const id=a.huntId,p=this.core.players.get(id);
  if(p.out&&!a.alive&&this.core.buy(id)){this.delays.delete(id);this.respawn(a);}
  if(!this.core.active(id)){this.zero(a);return;}
  const skill=this.skill,carrier=this.core.role(id)==='carrier',holder=this.actor(this.core.holderId),slot=this.actors.indexOf(a);
  let b=this.bots.get(id);if(!b){b={repath:0,shot:skill.reaction+slot*.11,visibleTime:0,path:[],last:a.pos.clone(),stuck:0,think:0,side:slot%2?1:-1,angle:slot*2.39996,mode:'search'};this.bots.set(id,b);}
  this.zero(a);b.think-=dt;
  const foes=this.actors.filter(e=>e.alive&&e.team!==a.team&&this.core.active(e.huntId));
  const eye=a.pos.clone().add(new THREE.Vector3(0,.9,0));
  const visible=foes.filter(e=>a.pos.distanceTo(e.pos)<skill.awareness&&G.physics.los(eye,e.pos.clone().add(new THREE.Vector3(0,.85,0)))).sort((x,y)=>a.pos.distanceToSquared(x.pos)-a.pos.distanceToSquared(y.pos));
  const enemy=carrier?visible[0]:visible.find(e=>e===holder);
  const runner=a.weaponRunner;
  // Stop an automatic volley after a shot; scarce CHOG ammo is not a turf-painting magazine.
  if(runner.streaming&&b.volleyAmmo!==undefined&&p.ammo<b.volleyAmmo){runner.reset();b.volleyAmmo=undefined;b.shot=skill.fireDelay;}
  if(runner.charging&&!enemy){runner.reset();b.volleyAmmo=undefined;}

  if(enemy){b.lastSeen=enemy.pos.clone();b.seenAge=0;}else b.seenAge=(b.seenAge||0)+dt;
  if(b.think<=0||!b.target){
   b.think=.55+slot*.037;let target=null;b.mode='search';
   if(carrier){
    const threat=visible[0],danger=threat&&a.pos.distanceTo(threat.pos)<12;
    if(danger){
     // Break line of sight using reachable cover, with several pursuers included in the risk score.
     const nodes=G.nav.nodes.filter(n=>G.nav.valid[n.id]&&Math.hypot(n.x-a.pos.x,n.z-a.pos.z)>5&&Math.hypot(n.x-a.pos.x,n.z-a.pos.z)<18);
     const ranked=nodes.filter((n,i)=>i%5===slot%5).map(n=>{const v=new THREE.Vector3(n.x,n.y,n.z),d=foes.reduce((sum,f)=>sum+Math.max(0,18-v.distanceTo(f.pos)),0),cover=G.physics.los(v.clone().add(new THREE.Vector3(0,.9,0)),threat.pos.clone().add(new THREE.Vector3(0,.9,0)))?15:0;return {v,score:d+cover+v.distanceTo(a.pos)*.25};}).sort((x,y)=>x.score-y.score);
     target=ranked.slice(0,8).find(n=>this.route(a,n.v).length>1)?.v;b.mode='evade';
    }
    if(!target){
     if(!b.chest?.active||b.chest.opened){
      b.chest=this.world.entries.filter(e=>e.active&&!e.opened).map(e=>{const v=e.chest.group.position;return {e,score:a.pos.distanceTo(v)+foes.reduce((sum,f)=>sum+Math.max(0,14-f.pos.distanceTo(v))*2,0)};}).sort((x,y)=>x.score-y.score).find(({e})=>this.route(a,e.chest.group.position).length>1)?.e;
     }
     target=b.chest?.chest.group.position;b.mode='trait-search';
    }
   }else if(enemy||b.lastSeen&&b.seenAge<9){
    const centre=enemy?.pos||b.lastSeen,range=a.weapon.kind==='charger'?13:a.weapon.kind==='blaster'?7:9;
    // Every hunter takes its own approach; never read an unseen carrier's live position.
    const angle=b.angle+Math.floor(this.core.elapsed/5)*b.side*.4;
    const flank=centre.clone().add(new THREE.Vector3(Math.sin(angle)*range,0,Math.cos(angle)*range));
    target=this.route(a,flank).length>1?flank:centre;b.mode=enemy?'engage':'track';
   }else{
    if(!b.patrol||a.pos.distanceTo(b.patrol)<2){const sites=this.world.entries.filter(e=>e.active);const index=(slot*3+Math.floor(this.core.elapsed/8)+Math.floor(b.angle*2))%sites.length;b.patrol=sites[index]?.chest.group.position.clone();}
    target=b.patrol;
   }
   const drops=this.airdrops.entries.filter(d=>d.phase==='grounded'&&!d.openedBy).map(d=>({d,dist:a.pos.distanceTo(d.group.position)})).filter(x=>x.dist<skill.lootRadius).sort((x,y)=>x.dist-y.dist);
   if(drops.length&&(!enemy||a.pos.distanceTo(enemy.pos)>14)&&(!carrier||!target)){target=drops[0].d.group.position;b.mode='supply';}
   b.target=target?.clone();b.repath=0;
  }
  const target=b.target;if(!target)return;
  const chest=this.nearbyChest(a),opening=!!chest&&a.pos.distanceTo(target)<2.6&&b.mode!=='evade'&&(!enemy||a.pos.distanceTo(enemy.pos)>11);
  this.hold(a,dt,opening);b.repath-=dt;
  if(b.repath<=0){b.repath=skill.repath+slot*.025;b.path=this.route(a,target);b.index=1;if(!b.path.length){b.chest=null;b.patrol=null;b.target=null;b.think=0;}}
  let waypoint=G.nav.nodes[b.path[b.index]];if(waypoint&&Math.hypot(waypoint.x-a.pos.x,waypoint.z-a.pos.z)<.7)waypoint=G.nav.nodes[b.path[++b.index]];
  const goal=waypoint||(a.pos.distanceTo(target)<2.6?target:null);
  if(goal&&!opening){const dx=goal.x-a.pos.x,dz=goal.z-a.pos.z,d=Math.hypot(dx,dz);if(d>.55){a.intent.move.set(dx/d,0,dz/d);a.intent.jump=goal.y>a.pos.y+.35&&a.grounded;}}
  // Local avoidance spreads hunters without changing their individual objectives.
  if(!opening){for(const other of this.actors){if(other===a||!other.alive)continue;const v=a.pos.clone().sub(other.pos);v.y=0;const d=v.length();if(d>.01&&d<2.6)a.intent.move.addScaledVector(v,(2.6-d)/d*.8);}if(a.intent.move.lengthSq()>1)a.intent.move.normalize();}
  b.dodging=false;
  for(const shot of G.projectiles.list){if(!shot.vel||shot.owner===a||shot.actor===a||shot.team===a.team||shot.delay>0)continue;
   const rel=eye.clone().sub(shot.pos),vv=shot.vel.lengthSq();if(vv<1)continue;const t=rel.dot(shot.vel)/vv;
   if(t<0||t>.65||rel.addScaledVector(shot.vel,-t).length()>1.25)continue;
   const dodge=new THREE.Vector3(-shot.vel.z,0,shot.vel.x).normalize().multiplyScalar(b.side),safe=a.pos.clone().addScaledVector(dodge,2.4),node=G.nav.nearest(safe,1.2,false),n=G.nav.nodes[node];
   if(n&&G.nav.valid[node]&&Math.hypot(n.x-safe.x,n.z-safe.z)<1.5&&Math.abs(n.y-a.pos.y)<.8){a.intent.move.copy(dodge);a.intent.jump=a.grounded&&t<.22;b.dodging=true;this.holds.delete(id);break;}
  }
  if(a.pos.distanceToSquared(b.last)<.0001&&a.intent.move.lengthSq()>.5)b.stuck+=dt;else b.stuck=0;b.last.copy(a.pos);
  if(b.stuck>.7){a.intent.jump=a.grounded;b.repath=0;const m=a.intent.move,x=m.x;m.x=-m.z;m.z=x;}if(b.stuck>2){b.patrol=null;b.chest=null;b.target=null;b.path=[];b.stuck=0;}
  if(enemy){b.visibleTime+=dt;b.shot-=dt;const aim=enemy.pos.clone().add(new THREE.Vector3(0,.85,0)),dist=eye.distanceTo(aim),lead=dist/35*skill.lead;aim.addScaledVector(enemy.vel,lead);
   const error=skill.aimError*dist;aim.x+=Math.sin(this.core.elapsed*3+slot)*error*.5;aim.z+=Math.cos(this.core.elapsed*2+slot)*error*.5;
   const v=aim.clone().sub(eye),yaw=Math.atan2(v.x,v.z),delta=Math.atan2(Math.sin(yaw-a.aimYaw),Math.cos(yaw-a.aimYaw)),turn=9;
   a.aimYaw+=Math.max(-turn*dt,Math.min(turn*dt,delta));a.aimPitch=Math.atan2(v.y,Math.hypot(v.x,v.z));a.aimPoint.copy(aim);
   const state=this.core.players.get(enemy.huntId),range=a.weapon.kind==='charger'?23:a.weapon.kind==='blaster'?10:17;
   const useful=carrier?state.stun<.2&&dist<13:this.core.invulnerable<=0;
   if(useful&&dist<range&&b.visibleTime>=skill.reaction&&Math.abs(delta)<.10&&!b.dodging){const runner=a.weaponRunner,charged=a.weapon.kind==='charger'||a.weapon.kind==='spinner';if(charged&&b.volleyAmmo===undefined)b.volleyAmmo=p.ammo;if(charged&&runner.charging)a.intent.fire=runner.charge<.92;else if(b.shot<=0&&runner.burstT<=0){a.intent.fire=true;b.shot=skill.fireDelay+slot*.035;}}
  }else{b.visibleTime=0;const m=a.intent.move;if(m.lengthSq()>.1)a.aimYaw=Math.atan2(m.x,m.z);}
 }
 update(dt){
  if(this.session){if(!this.session.room.go){this.ui.root.hidden=true;this.game.hud.setVisible(false);return;}this.ui.root.hidden=false;if(!this.session.isHost){this.session.replica.update(dt);return;}this.session.replica.hostInputs(dt);}
  if(this.clearShots){G.projectiles.clear();this.clearShots=false;}
  const previous=this.core.time;this.core.step(dt,{pendingShots:G.projectiles.list.some(p=>p.huntEpoch===this.core.epoch&&!p.ghost&&p.owner?.huntId&&p.age<p.life)});this.match.time=this.core.time;
  if(previous>60&&this.core.time<=60){this.game.hud.banner('one_minute');G.audio?.play('one_minute');this.game._playMusic('battle_final');}
  if(Math.ceil(previous)!==Math.ceil(this.core.time)&&this.core.time>0&&this.core.time<=10){this.game.hud.countdown(Math.ceil(this.core.time));G.audio?.play('final_count');}
  this.handleEvents(this.core.drain());
  for(const [id,t]of this.delays){if(t>0){this.delays.set(id,t-dt);continue;}this.delays.delete(id);const a=this.actor(id);if(a.alive)a.splat(this.actor(this.core.players.get(id).capturedBy),this.core.players.get(id).outReason==='captured'?'hunt-captured':'hunt-ammo');
   if(id===this.local){G.input.exitLock();G.rig.mode='spectate';G.rig.spectate={actor:this.actor(this.core.holderId)?.alive?this.actor(this.core.holderId):null,pos:a.pos.clone(),from:a.pos.clone()};G.rig.lookAt.copy(a.pos);}}
  this.handleEvents(this.core.drain());
  if(this.core.phase!=='finished')for(const a of this.actors){
   const state=this.core.players.get(a.huntId);if(!a.alive&&!state.out&&(state.recovering||0)<=0)this.respawn(a);
   if(a.isBot){if(this.botsFrozen)this.zero(a);else this.bot(a,dt);}if(!this.core.active(a.huntId))this.zero(a);
   a.intent.squid=a.intent.sub=a.intent.special=false;a.update(dt);
  }
  this.match.separateActors();
  if(!this.session?.simulation)this.hold(this.match.local,dt,!!G.input.down('KeyE')||this.ui.touchHold);
  if(this.core.phase==='playing'||this.core.phase==='ending')this.airdrops.update(dt);
  for(const r of this.rewards)r.reward.update(dt);this.rewards=this.rewards.filter(r=>{if(!r.reward.done)return true;r.parent.removeFromParent();return false;});
  this.ui.update(dt);
 }
 handleEvents(events){
  for(const e of events){
   if(e.type==='balance'&&e.id===this.local&&!this.session?.room.verified){try{this.ledger.creditMatch(this.core.roundId,e.earned);this.core.players.get(this.local).balance=this.ledger.balance;}catch(error){this.ui.message(error.message);}}
   if(e.type==='play'&&this.core.epoch===0){this.game.hud.banner('go','MISSION START');G.audio?.play('go_horn');}
   if(e.type==='end'){this.game.hud.banner('timesup',e.winner===this.local?'MISSION COMPLETE':'MISSION FAILED');G.audio?.play('times_up');}
   if(e.type==='environment-death'&&this.session&&!this.session.isHost){const a=this.actor(e.id);if(a?.alive)a.splat(null,'water');}
   if(e.type==='capture'){const victim=this.actor(e.old);if(victim?.alive&&this.core.players.get(e.old)?.outReason==='captured')victim.splat(this.actor(e.id),'hunt-captured');if(e.id===this.local&&!e.disconnect){this.ui.message('CARRIER CAPTURED · +1 CHOG');this.ui.coinGain(1000);}this.roles();this.bots.clear();this.clearShots=true;this.delays.set(e.old,.45);this.ui.briefing({announce:e.id===this.local});}
   if(e.type==='exhausted')this.delays.set(e.id,.45);
   if(e.type==='drop-wave')this.airdrops.spawn(e.wave);
   if(e.type==='loot'&&e.kind==='trait'&&e.traitMatched&&e.id===this.local)this.ui.flyTrait(e.traitId,this.world.entries.find(c=>c.id===e.chestId).chest.group.position);
   if(e.type==='loot'&&e.id===this.local)this.ui.message(e.kind==='empty'?'EMPTY CHEST':e.kind==='token'?`+${e.amount/1000} CHOG`:e.traitMatched?'TRAIT MATCHED · '+this.core.objective.name:'TRAIT DOES NOT MATCH');
   if(e.type==='stun')G.audio?.play('ink_hit_body',{pos:this.actor(e.id).pos});
   if(e.type==='results')this.showResults();
  }
 }
 async showResults(){
  if(this.session?.simulation||this.resultsShown)return;this.resultsShown=true;
  if(this.session?.room.verified){try{await this.game.menus.chogWallet.rewards.refresh();if(this.rewardTokenId&&String(this.game.menus._identity?.nft?.tokenId)!==String(this.rewardTokenId))await this.game.menus.chogWallet.rewards.loadNftProgress(this.rewardTokenId);}catch(e){this.ui.message('EXP refresh pending: '+e.message);}}else this.ledger.claim(this.core.result,this.local);
  if(this.disposed)return;
  G.input.exitLock();G.music?.stop?.(.5);this.ui.hidePlay();
  G.audio?.play(this.core.winner===this.local?'victory_fanfare':'defeat_jingle');
  const menu=this.game.menus;
  menu.showResults({mode:'hunt',win:this.core.winner===this.local,mapName:this.game.mapDef.name,colors:['#ffac28','#783ee8'],players:[]});
  menu.show('results',{wipe:false});
  try{const host=menu._scr.el.querySelector('.chog-hunt-reward-host');
   const row=this.core.result?.players.find(p=>p.id===this.local),xp=row?matchExperience(this.core.winner===this.local,!!row.left,row.activity||{}):{total:0,breakdown:[]};
   const rewards=menu.chogWallet.rewards,verified=!!this.session?.room.verified;
   const current=verified?(this.rewardTokenId?rewards.nftProgress.get(String(this.rewardTokenId)):rewards.progress):this.ledger.progress;
   const balance=verified?rewards.balance:this.ledger.balance;
   const data={win:this.core.winner===this.local,nft:this.rewardNft,name:this.match.local.name,model:this.match.local.character.nftId,weapon:this.match.local.weaponId,xpGain:xp.total,totalXp:current?.totalXp??xp.total,balanceBefore:Math.max(0,balance-(verified?(row?.earned||0):(row?.total||0))),balanceAfter:balance};
   const view=await mountMythicReward(host,{rewardData:data,CharacterClass:this.game.CharacterClass,onClose:()=>this.leave(),onOpen:async()=>{
     if(verified){if(!await this.claim())throw Error('Could not collect rewards. Try again.');data.balanceAfter=rewards.balance;}
   },onComplete:()=>this.ui.showRewardSummary()});if(this.disposed){view?.dispose();return;}this.resultsView=view;
   view.panel.classList.add('chog-hunt-reward-stage');menu._scr.el.querySelector('[data-id="rematch"]').disabled=false;
  }catch(error){this.ui.fallbackResults(error.message);}
 }
 dispose(){this.disposed=true;this.shotVisualOff?.();for(const [name,{original,wrapped}]of this.nativeFire)if(G.projectiles[name]===wrapped)G.projectiles[name]=original;this.resultsView?.dispose();this.ui.dispose();this.airdrops.dispose();for(const r of this.rewards){r.reward.dispose();r.parent.removeFromParent();}}
}
