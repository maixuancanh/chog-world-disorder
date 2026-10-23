import * as THREE from 'three';
import {G} from '../core/ctx.js';
import {loadWorkshopSkill,defaultWorkshopSkill,validateWorkshopSkill,resolveWorkshopSkill,workshopIdentity,applyWorkshopSkill,workshopIncoming,workshopOutgoing} from './skill-workshop.js';
import {BotBrain} from './bots.js';
import {createObjectiveState,dailyChallenge,stepObjective} from './objective-rules.js';

export class ObjectiveRuntime {
 constructor(match,game){
  this.match=match;this.game=game;this.actors=match.actors;this.session=match.opts.huntRoom||null;this.clock=0;this.cooldowns=new Map();this.buffs=new Map();this.events=[];this.eventId=0;
  const pads=G.level.spawnPads,mid=new THREE.Vector3().addVectors(pads[0],pads[1]).multiplyScalar(.5),dx=pads[1].x-pads[0].x,dz=pads[1].z-pads[0].z,l=Math.hypot(dx,dz)||1;
  const nav=G.nav,nodes=nav?.nodes||[],chosen=[];
  const reachable=team=>{const start=nav.nearest(pads[team],1.2,true),seen=new Set(start<0?[]:[start]),queue=[...seen];for(let i=0;i<queue.length;i++){for(const e of nodes[queue[i]].nb){const n=nodes[e.to];if(e.type==='climb'||nav.valid&&!nav.valid[n.id]||seen.has(n.id)||n.zone>=0&&n.zone!==team)continue;seen.add(n.id);queue.push(n.id);}}return seen;},reach=[reachable(0),reachable(1)];
  const stations=[-1,0,1].map(k=>{const desired={x:mid.x-dz/l*k*12,z:mid.z+dx/l*k*12};let best=null,dist=Infinity;for(const n of nodes){if(nav.valid&&!nav.valid[n.id]||n.zone>=0||n.overWater||n.wet>0||!reach[0].has(n.id)||!reach[1].has(n.id)||chosen.some(p=>Math.hypot(p.x-n.x,p.z-n.z)<8))continue;const d=Math.hypot(n.x-desired.x,n.z-desired.z)+Math.abs(n.y-mid.y)*2;if(d<dist){best=n;dist=d;}}if(!best)throw Error('This map needs three safe, reachable objective stations');chosen.push(best);return {x:best.x,y:best.y,z:best.z};});
  const challenge=this.session?.room.config.challenge||dailyChallenge();
  this.core=createObjectiveState(match.mode,stations,challenge);this.core.roundId=this.session?.room.roundId||crypto.randomUUID();this.core.players=new Map();this.core.leave=id=>this.leavePlayer(id);
  for(const [i,a]of this.actors.entries()){a.huntId='hunt-'+(a.nid??i);const row=match.opts.roster?.find(p=>p.nid===a.nid),rawOwned=a.isLocal?game.menus._identity?.nft:null,owned=rawOwned?{...rawOwned,contract:rawOwned.contract||rawOwned.collection||game.menus._identity?.config?.nft||game.menus.chogWallet.rewards.config?.nft}:null;a.workshopNft=row?{...row.objectiveNft,contract:row.nftContract,tokenId:row.nftTokenId}:owned;a.workshopProgress={identity:workshopIdentity(a.workshopNft),wins:row?(row.raidWins||0):game.menus._workshopProgress?.identity===workshopIdentity(a.workshopNft)?game.menus._workshopProgress.wins||0:0};a.workshopSkill=match.mode==='trials'?defaultWorkshopSkill(a.workshopNft):row?.workshopSkill?validateWorkshopSkill(row.workshopSkill,a.workshopNft,a.workshopProgress):a.isLocal?loadWorkshopSkill(localStorage,a.workshopNft,a.workshopProgress):defaultWorkshopSkill(a.workshopNft);this.core.players.set(a.huntId,{id:a.huntId,name:a.name,team:a.team,earned:0,purchases:0,left:false,activity:{}});if(a.isBot&&(!this.session||this.session.isHost)){a.bot=new BotBrain(a,match.opts.difficulty||'normal');const normalPick=a.bot._pickPaintGoal.bind(a.bot);a.bot._pickPaintGoal=()=>{const choices=this.core.stations.filter(s=>s.owner!==a.team),s=choices[(a.slot+Math.floor(this.clock/18))%Math.max(1,choices.length)]||this.core.stations[a.slot%3];if(s){a.bot.goalTimer=3;a.bot._pathTo(new THREE.Vector3(s.x,s.y,s.z),1.2);}else normalPick();};}}
  this.local=match.local.huntId;this.markers=stations.map((s,i)=>{const mesh=new THREE.Mesh(new THREE.RingGeometry(3.65,4,48),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,opacity:.75,depthWrite:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(s.x,s.y+.08,s.z);G.scene.add(mesh);return mesh;});
  this.key=e=>{if(e.code==='KeyF'&&!e.repeat)this.activateSkill();};if(!this.session?.simulation)window.addEventListener('keydown',this.key);this.session?.bind(this);
 }
 actor(id){return this.actors.find(a=>a.huntId===id);}
 get skillLabel(){const a=this.match.local,s=resolveWorkshopSkill(a.workshopSkill,a.workshopNft,a.workshopProgress);return s.name+' '+(s.effect==='mend'?s.amount+' HP':Math.round(s.amount*100)+'% / '+s.duration+'s')+' / '+s.target+' / '+s.cooldown+'s';}
 get skillCooldown(){return Math.max(0,(this.cooldowns.get(this.local)||0)-this.clock);}
 uiState(){return {...this.core,players:[...this.core.players.values()],skillLabel:this.skillLabel,skillCooldown:this.skillCooldown,skillReady:this.skillCooldown<=0};}
 activateSkill(){const a=this.match.local;if(this.game.menus.current||this.match.paused||!a?.alive||this.match.controller?.mapHeld||(G.rig?.mapK||0)>.02)return false;if(this.session&&!this.session.isHost){this.session.command='workshop-skill';return true;}return this.ability(this.local);}
 ability(id){const a=this.actor(id);if(!a?.alive||this.core.players.get(id)?.left||this.match.state!=='playing'||this.clock<(this.cooldowns.get(id)||0))return false;const skill=applyWorkshopSkill({actor:a,actors:this.actors,recipe:a.workshopSkill,nft:a.workshopNft,progress:a.workshopProgress,clock:this.clock,buffs:this.buffs});this.cooldowns.set(id,this.clock+skill.cooldown);G.fx?.ring(a.pos,new THREE.Vector3(0,1,0),a.color,{radius:skill.radius||3,life:.8});this.events.push({type:'workshop-ability',id,radius:skill.radius||3,serial:++this.eventId});return true;}
 incoming(a,n){return workshopIncoming(a,n,this.clock,this.buffs);}
 outgoing(a,n){return workshopOutgoing(a,n,this.clock,this.buffs);}
 leavePlayer(id){const p=this.core.players.get(id);if(p)p.left=true;const a=this.actor(id);if(a){a.bot=null;a.alive=false;a.respawnTimer=Infinity;a.character.setVisible(false);}}
 beginFrame(dt){if(this.session){if(!this.session.room.go)return false;if(!this.session.isHost){this.session.replica.update(dt);this.updateMarkers();return false;}this.session.replica.hostInputs(dt);}this.clock+=dt;return true;}
 endFrame(dt){
  if(this.match.state==='playing'&&this.core.phase==='playing'){
   stepObjective(this.core,this.actors.map(a=>({x:a.pos.x,y:a.pos.y,z:a.pos.z,team:a.team,alive:a.alive,left:this.core.players.get(a.huntId)?.left})),dt);this.match.time=this.core.time;
   for(const a of this.actors)if(a.isBot&&a.alive&&a.hp<70)this.ability(a.huntId);
   if(this.core.phase==='finished'){this.finish();this.match.setState('finish');}
  }
  if(this.match.state==='finish'&&this.match.stateT>2.6)this.showResults();this.updateMarkers();
 }
 updateMarkers(){this.markers.forEach((m,i)=>{const s=this.core.stations[i];m.visible=this.core.phase!=='finished'&&(this.match.mode==='control'||i===this.core.activeStation);m.material.color.set(s.owner===null?0xffffff:G.teamHex[s.owner]);m.scale.setScalar(1+(this.match.mode==='trials'?Math.sin(this.clock*3)*.035:0));});}
 finish(){if(this.core.result)return this.core.result;const c=this.core;c.phase='finished';c.result={mode:c.mode,version:c.version,roundId:c.roundId,winner:c.winner,reason:c.reason,scores:[...c.scores],challenge:c.challenge,score:c.score,objectiveProgress:c.objectiveProgress,completed:c.completed,time:c.time,players:[...c.players.values()].map(p=>({...p,won:!p.left&&c.winner===p.team,bonus:0,total:0}))};this.match.result=c.result;return c.result;}
 async showResults(){if(this.resultsShown)return;this.resultsShown=true;const result=this.finish();if(this.session?.simulation)return;this.match.state='results';this.game.hud.setVisible(false);G.input.exitLock();
  if(this.match.mode==='trials'&&!this.session?.room.verified){try{const nft=this.game.menus._identity?.nft,key='chog.daily.record:'+String(nft?.contract||nft?.collection||'guest')+':'+String(nft?.tokenId||'guest')+':'+result.challenge.id+':v'+result.version,old=JSON.parse(localStorage.getItem(key)||'null');if(!old||old.score<result.score)localStorage.setItem(key,JSON.stringify({score:result.score,completed:result.completed,verified:false,roundId:result.roundId}));}catch{}}
  if(this.game.menus.showModeResults){this.game.menus.showModeResults(result,this);this.game.menus.show('results');}else{this.game.menus.showResults({mode:result.mode,win:result.winner===this.match.local.team,percents:result.scores,colors:G.teamHex,players:this.actors.map(a=>({name:a.name,team:a.team,weapon:a.weaponId,turf:Math.round(a.stats.turf),splats:a.stats.splats,deaths:a.stats.deaths,isSelf:a.isLocal})),mapName:this.game.mapDef.name});this.game.menus.show('results');}
 }
 async leave(){const mode=this.match.mode;await this.session?.leave();await this.game.quitToMenu();this.game.menus._lobbyKind=mode;this.game.menus.show('lobby',{force:true});}
 dispose(){window.removeEventListener('keydown',this.key);this.session?.replica?.dispose?.();for(const m of this.markers){G.scene.remove(m);m.geometry.dispose();m.material.dispose();}}
}
