import * as THREE from 'three';
import {G} from '../core/ctx.js';
import {h, colorVars} from './ui-util.js';
import {HUNT} from '../game/hunt-core.js';
import {formatChog} from '../game/hunt-ledger.js';
const art=name=>new URL('../../assets/chog-briefing-ui/v1/'+name,import.meta.url).href;
const icon=trait=>trait.icon?new URL('../../assets/chog-traits/icons/'+trait.icon+'.png',import.meta.url).href:trait.portrait?new URL('../../assets/chog-testnet/objective-portraits/'+trait.portrait+'.webp',import.meta.url).href:trait.image;
const portrait=id=>new URL('../../assets/chog-briefing-ui/portraits/'+id+'.png',import.meta.url).href;
const stunArt=new URL('../../assets/chog-status-ui/stun-v1.png',import.meta.url).href;
const coinArt=new URL('../../assets/chog-airdrop/coin-icon.png',import.meta.url).href;
export class HuntMatchUI {
 constructor(runtime){
  this.r=runtime;this.core=runtime.core;this.pending=new Set();this.flights=[];this.labels=new Map();this.touchHold=false;
  this.root=h('div',{class:'hunt-ui','aria-label':'Trait Hunt HUD'});document.body.append(this.root);
  this.hud=runtime.game.hud;this.menu=runtime.game.menus;this.hud.beginHuntRuntime();
  this.inventory=this.hud.traitPlate;this.inventory.replaceChildren();this.inventory.classList.add('chog-hunt-trait-inventory');this.slots=new Map();
  this.syncObjective();
  this.holdRing=h('div',{class:'hunt-hold',role:'progressbar','aria-label':'Opening chest','aria-valuemin':0,'aria-valuemax':100},h('b',null,'E'),h('span',null,'HOLD TO OPEN'));this.root.append(this.holdRing);
  this.holdButton=h('button',{class:'hunt-touch-open',type:'button'},'HOLD · OPEN');
  this.holdButton.onpointerdown=e=>{e.preventDefault();this.touchHold=true;this.holdButton.setPointerCapture(e.pointerId);};
  for(const type of ['pointerup','pointercancel','lostpointercapture'])this.holdButton.addEventListener(type,()=>this.touchHold=false);
  this.root.append(this.holdButton);
  this.buyButton=this.menu._btn({id:'hunt-buy-ammo',label:'BUY 3 AMMO',sub:'3 CHOG · Game balance',cls:'iw-btn--primary iw-btn--wide',accept:()=>{if(!this.r.buy())this.message('Not enough game balance, or purchase limit reached.');}});
  this.exitButton=this.menu._btn({id:'hunt-exit-room',label:'EXIT ROOM',cls:'iw-btn--small chog-wallet-action iw-btn--primary',accept:()=>this.r.leave()});
  colorVars(this.exitButton,'a','#ffac28');
  this.outBalance=h('p',{class:'chog-hunt-out-balance'});
  this.briefing();
 }
 syncObjective(){
  const signature=JSON.stringify([this.core.objective,this.core.traits]);if(signature===this.objectiveSignature)return;
  this.objectiveSignature=signature;this.inventory.replaceChildren();this.slots.clear();
  const name=this.core.objective?.name||'CHOG';this.inventory.dataset.objective=name;this.inventory.setAttribute('aria-label','Restore '+name);
  this.inventory.append(h('small',{class:'chog-hunt-objective-label'},name));
  for(const trait of this.core.traits){const slot=h('div',{class:'chog-hunt-trait-slot',title:trait.category+' · '+trait.value},h('small',null,trait.category),h('img',{src:icon(trait),alt:trait.name}),h('small',null,trait.value),h('b',{class:'chog-hunt-trait-tick'},'✓'));this.inventory.append(slot);this.slots.set(trait.id,slot);}
 }
 briefing({announce=true}={}){
  this.noticeTime=announce?0:HUNT.brief+HUNT.return+HUNT.dock;
  this.intro?.remove();this.intro=null;this.introReturning=false;this.board?.remove();const carrier=this.core.role(this.r.local)==='carrier',target=this.r.actor(this.core.holderId);
  this.board=h('section',{class:'hunt-board '+(carrier?'is-carrier':''),'aria-label':carrier?'You are the target':'Wanted target'},h('img',{class:'hunt-board-bg',src:art('board.png'),alt:''}),h('h1',{class:'hunt-board-title'},carrier?'YOU ARE\nTHE TARGET':'WANTED'));
  if(carrier){this.board.append(h('h2',{class:'hunt-board-objective'},`${this.core.objective?.name||'CHOG'} · FIND ${this.core.traits.length} TRAITS`));
   const traits=h('div',{class:'hunt-board-traits'});for(const t of this.core.traits)traits.append(h('div',{class:'hunt-board-trait'},h('img',{src:icon(t),alt:t.name}),h('span',null,t.value),h('b',null,this.core.found.has(t.id)?'✓':'')));this.board.append(traits);
  }else this.board.append(h('div',{class:'hunt-board-portrait'},h('img',{src:portrait(target.character.nftId||'varsity'),alt:target.name}),h('img',{class:'hunt-image-border',src:art('image-frame.png'),alt:''})),h('strong',{class:'hunt-board-name'},target.name),h('span',{class:'hunt-board-nft'},target.character.nftId==='varsity'?'CHOG VARSITY':`CHOG #${Number(target.character.nftId)}`));
  if(carrier&&announce){
   this.intro=h('div',{class:'hunt-trait-intro','aria-label':`Target traits for ${this.core.objective?.name||'CHOG'}`});
   for(const t of this.core.traits)this.intro.append(h('div',{class:'hunt-intro-card'},h('img',{src:icon(t),alt:t.name}),h('span',null,t.value)));
   this.root.append(this.intro);this.board.classList.add('has-trait-intro');
  }
  this.board.classList.toggle('is-docked',!announce);this.board.hidden=this.core.players.get(this.r.local).out;this.root.append(this.board);this.pending.clear();for(const f of this.flights.filter(f=>f.trait)){f.anim.cancel();f.node.remove();}this.flights=this.flights.filter(f=>!f.trait);
 }
 project(pos,offset=0){const camera=G.rig?.gameCam||G.camera,p=pos.clone();p.y+=offset;p.project(camera);if(p.z< -1||p.z>1)return null;return {x:(p.x*.5+.5)*innerWidth,y:(-.5*p.y+.5)*innerHeight};}
 position(el,pos,offset=0){const p=this.project(pos,offset);el.style.display=p?'':'none';if(p)el.style.transform=`translate(${p.x}px,${p.y}px) translate(-50%,-100%)`;return p;}
 message(text){this.hud.feed({text,color:'#ffac28',kind:'info'});}
 flyCoin(pos,amount){
  const from=this.project(pos),pill=this.hud.turfEl,rect=pill.getBoundingClientRect();if(!from)return;
  const node=h('img',{class:'hunt-flying-trait hunt-flying-coin',src:coinArt,alt:''});document.body.append(node);
  const anim=node.animate([{transform:`translate(${from.x-32}px,${from.y-32}px) scale(1.1)`,opacity:1},{transform:`translate(${(from.x+rect.x)/2}px,${Math.min(from.y,rect.y)-70}px) scale(.8)`,offset:.5},{transform:`translate(${rect.x+rect.width*.5-32}px,${rect.y-20}px) scale(.35)`,opacity:.5}],{duration:650,easing:'cubic-bezier(.35,.05,.6,1)',fill:'forwards'});
  const flight={node,anim};this.flights.push(flight);anim.onfinish=()=>{node.remove();this.flights=this.flights.filter(f=>f!==flight);this.coinGain(amount);};
 }
 coinGain(amount){
  const pill=this.hud.turfEl;pill.animate([{filter:'brightness(2.5)',scale:'1.25'},{filter:'brightness(1)',scale:'1'}],{duration:500,easing:'ease-out'});
  const rect=pill.getBoundingClientRect(),gain=h('b',{class:'hunt-coin-gain'},`+${formatChog(amount)} CHOG`);gain.style.left=rect.x+'px';gain.style.top=(rect.bottom+8)+'px';document.body.append(gain);
  const anim=gain.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(-25px)',opacity:0}],{duration:1100,easing:'ease-out'});const flight={node:gain,anim};this.flights.push(flight);anim.onfinish=()=>{gain.remove();this.flights=this.flights.filter(f=>f!==flight);};G.audio?.play('ui_confirm',{volume:.5,pitch:1.35});
 }
 flyTrait(id,pos){
  const from=this.project(pos,1.1),slot=this.slots.get(id);if(!from||!slot)return;this.inventory.hidden=false;const rect=slot.getBoundingClientRect();
  const node=h('img',{class:'hunt-flying-trait',src:icon(this.core.traits.find(t=>t.id===id)),alt:''});document.body.append(node);this.pending.add(id);
  const dx=rect.x+rect.width/2,dy=rect.y+rect.height/2,anim=node.animate([{transform:`translate(${from.x-42}px,${from.y-42}px) scale(1)`},{transform:`translate(${(from.x+dx)/2-42}px,${Math.min(from.y,dy)-130}px) scale(1.2)`,offset:.45},{transform:`translate(${dx-42}px,${dy-42}px) scale(.65)`}],{duration:850,easing:'cubic-bezier(.25,.7,.2,1)',fill:'forwards'});
  const flight={node,anim,trait:true};this.flights.push(flight);anim.onfinish=()=>{node.remove();this.pending.delete(id);slot.animate([{filter:'brightness(3)',boxShadow:'0 0 35px #ffcb71'},{filter:'brightness(1)',boxShadow:'0 0 0 transparent'}],{duration:650});this.flights=this.flights.filter(f=>f!==flight);};
 }
 hidePlay(){this.root.classList.add('is-results');this.hud.hideSplatted(true);this.hud.setVisible(false);}
 fallbackResults(error){this.message(error);this.showRewardSummary();}
 showRewardSummary(){
  if(this.rewardSummary?.isConnected)return;
  const screen=this.menu._scr?.el,row=this.core.result?.players.find(p=>p.id===this.r.local);
  if(!screen||!row)return;
  if(this.r.resultsView?.rewardData){const button=screen.querySelector('[data-id=rematch]');if(button)button.hidden=true;this.rewardSummary={isConnected:true,remove(){}};return;}
  const amount=h('strong',null,'0 CHOG'),detail=h('small',null,`Match coins: ${formatChog(row.earned)} · Bonus: ${formatChog(row.bonus)}`);
  this.rewardSummary=h('section',{class:'chog-result-reward','aria-label':'Match reward','aria-live':'polite'},amount,detail);
  screen.append(this.rewardSummary);
  const button=screen.querySelector('[data-id=rematch]');
  if(button){button.hidden=false;button.disabled=false;button.querySelector('.iw-btn__label').textContent='CLAIM';
   this.menu._binds.get(button).accept=async()=>{
    if(button.disabled)return;button.disabled=true;
    if(await this.r.claim()){button.querySelector('.iw-btn__label').textContent='CLAIMED';this.countup=null;amount.textContent=`${formatChog(row.total)} CHOG`;detail.textContent='Added to your game balance';}
    else button.disabled=false;
   };
  }
  this.countup={node:amount,time:0,total:row.total};
 }
 update(dt){
  const c=this.core,p=c.players.get(this.r.local),carrier=c.role(this.r.local)==='carrier';
  if(c.phase!=='finished')this.hud.updateRuntime(dt,this.r);
  this.noticeTime+=dt;
  if(this.intro&&this.noticeTime>=HUNT.brief&&!this.introReturning){
   this.introReturning=true;
   const targets=[...this.board.querySelectorAll('.hunt-board-trait')];
   [...this.intro.children].forEach((card,i)=>{const from=card.getBoundingClientRect(),to=targets[i].getBoundingClientRect();
    card.animate([{transform:'translate(0,0) scale(1)'},{transform:`translate(${to.x-from.x}px,${to.y-from.y}px) scale(${to.width/from.width},${to.height/from.height})`}],{duration:450,easing:'cubic-bezier(.25,.7,.2,1)',fill:'forwards'});
   });
  }
  if(this.intro&&this.noticeTime>=HUNT.brief+HUNT.return){this.intro.remove();this.intro=null;this.board.classList.remove('has-trait-intro');}
  const dockAt=HUNT.brief+(carrier?HUNT.return:0),column=carrier&&this.noticeTime>=dockAt+HUNT.dock;
  this.board.classList.toggle('is-docked',this.noticeTime>=dockAt);this.board.classList.toggle('is-inventory',column);this.board.hidden=p.out;
  this.inventory.classList.toggle('is-trait-column',carrier);
  this.inventory.classList.toggle('is-column-ready',column);

  this.inventory.hidden=!carrier||!column;for(const [id,slot]of this.slots)slot.classList.toggle('is-found',c.found.has(id)&&!this.pending.has(id));
  const out=p.out&&(c.phase==='playing'||c.phase==='briefing');
  if(out&&!this.showingOut){this.showingOut=true;const native=this.hud.showSplatted({by:this.r.actor(p.capturedBy)?.name||null,byColor:'#ed1748',attacker:this.r.actor(p.capturedBy)||null,hunt:true});if(p.outReason==='captured'){native.el.querySelector('.iw-spl__by').textContent='CAPTURED · GAME OVER';native.num.textContent='×';native.el.querySelector('.iw-spl__ring small').textContent='OUT';}native.el.classList.toggle('is-captured',p.outReason==='captured');const card=native.el.querySelector('.iw-spl__card');card.querySelector('.iw-spl__splat')?.remove();card.querySelector('.iw-spl__ring')?.remove();native.hint.remove();card.append(this.outBalance,h('div',{class:'chog-hunt-out-actions chog-original'},this.buyButton,this.exitButton));}
  else if(!out&&this.showingOut){this.showingOut=false;this.hud.hideSplatted();}
  this.buyButton.hidden=p.outReason==='captured';this.buyButton.disabled=p.outReason==='captured'||p.purchases>=2||p.balance<3000;this.buyButton.querySelector('.iw-btn__label').textContent=p.purchases>=2?'PURCHASES LOCKED':'BUY 3 AMMO';
  this.outBalance.hidden=p.outReason==='captured';this.outBalance.textContent=`This match: ${formatChog(p.earned)} CHOG · Available balance: ${formatChog(p.balance)} CHOG · Ammo purchases: ${p.purchases}/2`;
  const recovering=!out&&!this.r.match.local.alive&&(p.recovering||0)>0;
  if(recovering&&!this.showingRecovery){this.showingRecovery=true;if(!this.hud._splatted||this.hud._splatted.el.classList.contains('chog-hunt-exhausted'))this.hud.showSplatted({attacker:null,cause:'water',byColor:'#6fd0ff',respawn:p.recovering});}
  else if(!recovering&&this.showingRecovery){this.showingRecovery=false;if(!out)this.hud.hideSplatted();}
  const entry=this.r.nearbyChest(this.r.match.local),hold=this.r.holds.get(this.r.local);
  this.holdRing.hidden=!entry;this.holdButton.hidden=!entry;
  if(entry){this.position(this.holdRing,entry.group?.position||entry.chest.group.position,1.5);const progress=Math.min(1,(hold?.time||0)/HUNT.hold);this.holdRing.style.setProperty('--progress',`${progress*360}deg`);this.holdRing.setAttribute('aria-valuenow',String(Math.round(progress*100)));}
  for(const a of this.r.actors){let label=this.labels.get(a.huntId);const stun=c.players.get(a.huntId).stun;
   if(stun>0){if(!label){label=h('div',{class:'hunt-stun'},h('img',{src:stunArt,alt:'STUN'}),h('span',null,h('i')));this.root.append(label);this.labels.set(a.huntId,label);}label.hidden=false;this.position(label,a.pos,2.15);label.querySelector('i').style.width=`${100*stun/HUNT.stun}%`;}
   else if(label)label.hidden=true;
  }
  if(this.r.resultsView?.stage.t>=6.4&&!this.rewardSummary)this.showRewardSummary();
  if(this.countup){const up=this.countup;up.time=Math.min(1.2,up.time+dt);up.node.textContent=`${formatChog(Math.round(up.total*(1-(1-up.time/1.2)**3)))} CHOG`;}
 }
 dispose(){this.hud.endHuntRuntime();this.inventory.classList.remove('chog-hunt-trait-inventory','is-trait-column','is-column-ready');this.menu._binds.delete(this.buyButton);this.menu._binds.delete(this.exitButton);this.intro?.remove();this.rewardSummary?.remove();this.root.remove();for(const f of this.flights){f.anim.cancel();f.node.remove();}}
}
