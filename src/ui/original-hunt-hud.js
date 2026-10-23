import * as THREE from 'three';
import { HUD as OriginalHUD } from './hud.js';
import { h, colorVars, restartAnim } from './ui-util.js';
import { G } from '../core/ctx.js';
import { chogSvgIcon, chogDeathIcon, huntStatIcons, replaceSquidIcons } from './chog-icons.js';
import { weaponMarkup } from './hunt-arsenal.js';
import { formatChog } from '../game/hunt-ledger.js';
import {setPlayerAvatar} from './chog-player-avatar.js';
import {resolveWorkshopSkill} from '../game/skill-workshop.js';
import {GLYPHS} from './ui-icons.js';
import {bossStatIcons} from './chog-icons.js';
const portrait=new URL('../../assets/chog-hunt-ui/chog-menu.png',import.meta.url).href;
export class HUD extends OriginalHUD {
  constructor(root,opts){
    super(root,opts);this.el.classList.add('chog-original-hud');this.overLayer.classList.add('chog-original-hud');
    for(const n of [this.sp,this.subBadge,this.turfEl,this.tank,this.subChip,this.denyEl,this.tpops,this.statusEl,this.poisonVig,this.zo,...this.zc,this.jnote,this.mapLegend,this.mapCursor,this.mapJumpLine,...this.beacons])n?.remove();
    this.boss?.dispose();
    // Keep the native badge layers (outline/fill/glint), rings and animation hooks.
    // Only change the path silhouette; no decorative image frame is attached.
    for(const group of this.squads){group.lastElementChild.remove();for(const card of group.children){
      const shape=card.querySelector('.iw-sq__shape');
      for(const path of shape.querySelectorAll('.o,.f'))path.setAttribute('d','M14 5 H46 L59 18 V48 L49 59 H6 V18 Z');
      shape.querySelector('.g')?.remove();
    }}

    this.traitPlate=h('div',{class:'iw-panel chog-native-traits iw-in iw-in--up'});
    this.ammoPlate=h('div',{class:'iw-panel chog-native-ammo iw-in iw-in--right'});
    this.el.append(this.traitPlate,this.ammoPlate);
    colorVars(this.el,'self','#ffac28');colorVars(this.el,'enemy','#783ee8');
    this._buildReticle('shooter');this.mapLabel.replaceChildren(h('span',null,'MAP PREVIEW'));this.mapLabel.hidden=true;
    replaceSquidIcons(this.el);replaceSquidIcons(this.overLayer);
    this.killEl.querySelector('.iw-kill__splat').innerHTML=chogSvgIcon;
  }
  feed(opts={}){
    const previous=this.feedEl.firstElementChild;
    super.feed(opts);
    const item=this.feedEl.firstElementChild;
    if(item&&item!==previous){const text=opts.text||'',icon=opts.kind==='death'?chogDeathIcon:/TRAIT/i.test(text)?huntStatIcons[2]:/CHOG|COIN|TOKEN/i.test(text)?huntStatIcons[0]:/AMMO|SHOT/i.test(text)?huntStatIcons[1]:/CHEST|SUPPLY|DROP/i.test(text)?'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 14V9q12-10 24 0v5zM4 15h24v13H4zM13 12h6v8h-6z"/></svg>':chogSvgIcon;item.querySelector('.iw-feed__icon').innerHTML=icon;}
  }
  showSplatted(opts={}){
    const water=opts.cause==='water'&&!opts.hunt;
    const result=super.showSplatted(water?{...opts,by:'the sea',attacker:null}:opts),el=this._splatted?.el;
    el?.querySelector('.iw-spl__splat')?.replaceChildren();
    if(opts.hunt)el?.querySelectorAll('.iw-spl__w,.iw-spl__name,.iw-spl__wn').forEach(node=>node.remove());
    if(water&&el){
      el.classList.add('chog-water-recovery');
      el.querySelector('.iw-spl__w')?.remove();
      el.querySelector('.iw-spl__wn')?.remove();
      el.querySelector('.iw-spl__splat').append(h('img',{
        src:new URL('../../assets/chog-hunt-ui/chog-sign-v1.png',import.meta.url).href,
        alt:'',class:'chog-heading-sign'
      }));
    }
    return result;
  }
  // Trait Hunt owns capture notices, briefings and rewards. Legacy kill/assist,
  // revenge, streak, wipeout and team lineup cards have no role in this mode.
  _callout(){}
  _killCard(){}
  _lineup(){}
  _onSplatted({victim}={}){if(victim===G.match?.local)this._clearDamageDirs();}
  damage(amount=.3,color,angle=null){super.damage(amount,'#ed1748',angle);}
  setHuntPreview(value){this.preview=value;this.setVisible(!!value);if(value)this.update(0,{hunt:{...value,time:204,traits:2,ammo:3,token:'PREVIEW',players:[true,true,true,true,false,false]}});}
  beginHuntRuntime(){
    document.body.classList.add('chog-hunt-playing');this._runtimeRole=null;this._ammoWeapon=null;this.preview=null;this.el.classList.add('chog-hunt-live');this.ammoPlate.hidden=true;
    // Restore the original orb and turf pill, changing their meaning to shots and CHOG.
    this.el.append(this.sp,this.turfEl);this.sp.querySelector('.iw-sp__ready').hidden=true;
    this.turfEl.querySelector('small').textContent='CHOG';
    this.turfEl.querySelector('i').innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="25" fill="#ffac28" stroke="#fff1cd" stroke-width="5"/><circle cx="32" cy="32" r="18" fill="none" stroke="#b86418" stroke-width="3"/><path d="M38 21H28a11 11 0 0 0 0 22h10" fill="none" stroke="#fff1cd" stroke-width="6" stroke-linecap="round"/></svg>';
    this.setVisible(true);
  }
  updateRuntime(dt,r){
    const c=r.core,a=r.match.local,p=c.players.get(r.local),carrier=c.role(r.local)==='carrier';
    this._t+=dt;this._updTimer(c.time);
    this._updCrosshair({weapon:a.weaponId,charge:a.weaponRunner.charge,crosshair:{spread:8,onTarget:r.match.controller?.onTarget?'enemy':null,inRange:true},hp:1,ink:1},dt);
    this.xh.hidden=!a.alive;this.el.classList.toggle('is-spectating',!a.alive);
    this._updPrompt(!a.alive?null:carrier?`Restore ${c.objective?.name||'CHOG'} · Find ${c.traits.length} traits · Hold [E] to open a chest`:'Catch the carrier · Hold [E] for supply chests');
    this.spLiquid.style.transform=`translateY(${100-p.ammo/5*92-4}px)`;
    this.spPct.textContent=`${p.ammo} / 5`;this.sp.classList.toggle('is-ready',false);
    if(this._ammoWeapon!==a.weaponId){this._ammoWeapon=a.weaponId;this.spIcon.innerHTML=weaponMarkup(a.weaponId);}
    this.turfNum.textContent=formatChog(p.earned);
    super._updSquads([0,1].map(group=>({players:r.actors.slice(group*3,group*3+3).map(actor=>{const state=c.players.get(actor.huntId);return {name:actor.name,weapon:actor.weaponId,alive:actor.alive&&!state.out,respawn:state.out?0:state.recovering||0,isSelf:actor.isLocal,specialReady:false};})})));
    const icons=this.squads.flatMap(g=>[...g.children]);
    icons.forEach((el,i)=>{const actor=r.actors[i],state=c.players.get(actor.huntId),key=actor.character.nftId;
      const oldDead=el.classList.contains('is-dead'),oldRole=el.dataset.role;
      const color=c.role(actor.huntId)==='carrier'?'#ed1748':'#2489ed';colorVars(el,'tc',color);
      if(state.out&&!oldDead)el.animate([{transform:'scale(1.4) rotate(-14deg)'},{transform:'scale(.92) rotate(4deg)',offset:.5},{transform:'scale(1)'}],{duration:420,easing:'cubic-bezier(.34,1.6,.64,1)'});
      if(oldRole&&oldRole!==c.role(actor.huntId)&&!state.out){el.querySelector('.iw-sq__badge').animate([{filter:'brightness(2)',scale:1.2},{filter:'brightness(1)',scale:1}],{duration:600});}

      el.classList.toggle('is-dead',state.out||!actor.alive);el.classList.toggle('is-eliminated',state.out);el.classList.toggle('is-recovering',!actor.alive&&!state.out);el.classList.toggle('is-self',actor.isLocal);
      const role=c.role(actor.huntId)==='carrier'?'CARRIER':'HUNTER',status=state.out?(state.outReason==='captured'?'CAUGHT':'NO AMMO'):state.stun>0?'STUN':role;
      if(el._huntAmmo!==undefined&&state.ammo<el._huntAmmo)el._shotUntil=this._t+.22;el._huntAmmo=state.ammo;
      const action=state.out?'out':!actor.alive?'respawning':state.stun>0?'stunned':actor.weaponRunner.charging?'charging':r.holds.has(actor.huntId)?'opening':(actor.lastFire<.2||this._t<(el._shotUntil||0))?'firing':'idle';
      if(el.dataset.action!==action){el.dataset.action=action;if(action==='firing')el.querySelector('.iw-sq__badge').animate([{filter:'brightness(1.7)',scale:1.1},{filter:'brightness(1)',scale:1}],{duration:200});}
      el.classList.remove('is-ready','is-readyflash');
      el.dataset.role=role.toLowerCase();el.dataset.status=status;el.setAttribute('aria-label',`${actor.name} · ${role} · ${state.out?'GAME OVER: '+status:status}`);
      let name=el.querySelector('.chog-sq-name'),tag=el.querySelector('.chog-sq-status');if(!name){name=h('small',{class:'chog-sq-name'});tag=h('b',{class:'chog-sq-status'});el.append(name,tag);}name.textContent=actor.name;tag.textContent=role;tag.hidden=state.out;

      if(el.dataset.nft!==key||!el.querySelector('.iw-sq__w img')){el.dataset.nft=key;el.querySelector('.iw-sq__w').replaceChildren(h('img',{src:new URL('../../assets/chog-briefing-ui/portraits/'+key+'.png',import.meta.url).href,alt:actor.name}));}
    });
    const markers=[],v=new THREE.Vector3();
    for(const actor of r.actors){if(actor===a||!actor.alive||actor.pos.distanceTo(a.pos)>50)continue;
     actor.character.getHeadPosition(v);v.y+=.32;v.project(G.camera);
     if(v.z>1||Math.abs(v.x)>1.05||Math.abs(v.y)>1.05)continue;
     markers.push({x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight,name:actor.name,color:c.role(actor.huntId)==='carrier'?'#ed1748':'#2489ed',onScreen:true,dist:actor.pos.distanceTo(a.pos)});
    }
    this._updMarkers(markers);this._updSplatJump(r.match.controller?.jumpQueue);
    const mm=G.game.minimap;mm.setViewerTeam(a.team);mm.update(dt);
    const deaths=G.game._deathPool();this._deaths=deaths.filter(d=>d.team!==0);
    for(const d of deaths){if(!d.on)continue;d.ally=d.team===a.team;v.set(d.x,d.y+.95,d.z);const dist=v.distanceTo(G.camera.position);v.project(G.camera);d.vis=v.z<1&&Math.abs(v.x)<1.08&&Math.abs(v.y)<1.08;d.sx=(v.x*.5+.5)*innerWidth;d.sy=(-v.y*.5+.5)*innerHeight;d.sc=THREE.MathUtils.clamp(1.12-dist/60,.56,1);const point={};mm.toCanvas(d.x,d.z,point);d.mx=point.x/mm.w;d.my=point.y/mm.h;}
    this._updDeaths(deaths);
    const players=r.actors.filter(o=>o.alive&&o.huntId!==c.holderId).map(o=>{const q={};mm.toCanvas(o.pos.x,o.pos.z,q);return {x:q.x/mm.w,y:q.y/mm.h,team:o.team,isSelf:o.isLocal,alive:true,color:G.teamHex[o.team],yaw:-o.yaw+(mm.flip?Math.PI:0)};});
    this.mapLabel.lastChild.textContent='MAP';this._updMap({canvas:mm.canvas,expanded:false,players},dt);
    this._updDamageDirs(dt);
  }
  endHuntRuntime(){document.body.classList.remove('chog-hunt-playing','chog-pause-cover');this.el.classList.remove('chog-hunt-live');this.sp.remove();this.turfEl.remove();this.hideSplatted(true);this.setVisible(false);}
  _updSpecial(frame,dt){
    super._updSpecial(frame,dt);
    if(!G.match?.raid)return;
    const weapon=G.match.local.weaponId;
    if(this._bossOrbWeapon!==weapon||!this.spIcon.querySelector('img.chog-weapon-icon')){this._bossOrbWeapon=weapon;this.spIcon.innerHTML=weaponMarkup(weapon);this.spIcon.querySelector('img').alt='Equipped CHOG weapon';}
  }
  updateRaidRoster(r){
    this.squads.flatMap(g=>[...g.children]).forEach((el,i)=>{
      const a=r.actors[i];if(!a)return;const key=a.character.nftId||'varsity';
      colorVars(el,'tc',a.isLocal?'#ed1748':'#2489ed');
      el.classList.toggle('is-dead',!a.alive);el.classList.toggle('is-recovering',!a.alive);el.classList.toggle('is-self',a.isLocal);
      el.dataset.role=a.raidRole.id;el.dataset.status=a.alive?'ACTIVE':'RESPAWNING';
      let name=el.querySelector('.chog-sq-name'),tag=el.querySelector('.chog-sq-status');
      if(!name){name=h('small',{class:'chog-sq-name'});tag=h('b',{class:'chog-sq-status'});el.append(name,tag);}
      name.textContent=a.name;tag.textContent=a.raidRole.id==='recruit'?'CHOG':a.raidRole.name;tag.hidden=!a.alive;
      const image=el.querySelector('.iw-sq__w img');if(!image||el.dataset.nft!==key){el.dataset.nft=key;el.querySelector('.iw-sq__w').replaceChildren(h('img',{src:new URL('../../assets/chog-briefing-ui/portraits/'+key+'.png',import.meta.url).href,alt:a.name}));}
    });
  }
  updateObjective(r,dt,frame){
    const c=r.uiState(),m=r.match;
    this.traitPlate.hidden=true;this.ammoPlate.hidden=true;
    const points=(frame?.markers||[]).slice();
    for(const [i,s]of c.stations.entries()){
      if(c.mode==='trials'&&i!==c.activeStation)continue;
      const v=new THREE.Vector3(s.x,s.y+1.8,s.z).project(G.camera);
      if(v.z<1&&Math.abs(v.x)<1.05&&Math.abs(v.y)<1.05)points.push({x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight,name:s.id+(s.contested?' · CONTESTED':s.owner===null?' · CAPTURE':' · HOLD'),color:s.owner===null?'#ffac28':G.teamHex[s.owner],onScreen:true,dist:m.local.pos.distanceTo(new THREE.Vector3(s.x,s.y,s.z))});
    }
    frame={...frame,markers:points};
    super.update(dt,{...frame,time:c.time,prompt:c.mode==='control'?`TRAIT CONTROL · ${Math.floor(c.scores[0])} : ${Math.floor(c.scores[1])} · Hold the three stations`:`BEACON ${c.stations[c.activeStation]?.id||'A'} · Hold ${Math.ceil(Math.max(0,(c.challenge?.holdSeconds||3)-(c.hold||0)))}s · ${c.objectiveProgress||0}/${c.challenge?.target||8} secured · ${c.score||0} points`});
    // Native Quick Play badges, motion and nameplates with the same NFT art.
    this.squads.forEach((group,team)=>[...group.children].forEach((el,index)=>{
      const actor=m.actors.filter(a=>a.team===team)[index];if(!actor)return;
      const key=actor.character.nftId||'varsity';
      let name=el.querySelector('.chog-sq-name'),tag=el.querySelector('.chog-sq-status');
      if(!name){name=h('small',{class:'chog-sq-name'});tag=h('b',{class:'chog-sq-status'});el.append(name,tag);}
      name.textContent=actor.name;tag.textContent=actor.alive?'ACTIVE':'RESPAWNING';tag.hidden=!actor.alive;
      el.classList.toggle('is-recovering',!actor.alive);el.classList.remove('is-eliminated');el.dataset.role='player';
      setPlayerAvatar(el.querySelector('.iw-sq__w'),actor,m);
    }));
    if(!this.objectiveSkill){
      const menu=r.game.menus;
      this.objectiveSkillButton=menu._btn({id:'objective-ability',label:'F · SKILL',cls:'iw-btn--primary iw-btn--small',accept:()=>r.activateSkill()});
      this.objectiveSkillTrack=h('div',{class:'chog-raid-skill__track',role:'progressbar','aria-label':'Skill recharge','aria-valuemin':'0','aria-valuemax':'100'},h('i'));
      this.objectiveSkillDetails=h('div',{class:'chog-raid-skill__details'},h('b'),h('div',{class:'chog-raid-skill__effect'}),h('small'),this.objectiveSkillTrack);
      this.objectiveSkill=h('section',{class:'iw-panel chog-raid-skill chog-objective-skill is-compact'},this.objectiveSkillButton,this.objectiveSkillDetails);this.el.append(this.objectiveSkill);
    }
    r.game.menus._binds.get(this.objectiveSkillButton).accept=()=>r.activateSkill();
    const hidden=m.paused||!m.local.alive||m.state!=='playing'||c.phase==='finished'||m.controller?.mapHeld||!!r.game.menus.current||(G.rig?.mapK||0)>.02;
    this.objectiveSkill.hidden=hidden;
    const wait=Math.max(0,c.skillCooldown||0),expanded=wait>0;
    this.objectiveSkill.classList.toggle('is-compact',!expanded);this.objectiveSkillDetails.hidden=!expanded;this.objectiveSkillButton.hidden=expanded;
    const a=m.local,skill=resolveWorkshopSkill(a.workshopSkill,a.workshopNft,a.workshopProgress),fact=(icon,text)=>h('span',{class:'chog-raid-fact'},h('i',{'aria-hidden':'true',html:icon}),h('span',null,text));
    this.objectiveSkillButton.querySelector('.iw-btn__label').textContent='F · '+skill.name;
    this.objectiveSkillDetails.querySelector('b').textContent=skill.name;
    const signature=[skill.effect,skill.amount,skill.target,skill.duration].join('|');
    if(this._objectiveFacts!==signature){this._objectiveFacts=signature;this.objectiveSkillDetails.querySelector('.chog-raid-skill__effect').replaceChildren(fact(skill.effect==='mend'?bossStatIcons[2]:skill.effect==='ward'?bossStatIcons[1]:bossStatIcons[0],skill.effect==='mend'?skill.amount+' HP':Math.round(skill.amount*100)+'%'),fact(GLYPHS.users,skill.target==='self'?'Self':skill.radius+'m squad'),...(skill.duration?[fact(GLYPHS.clock,skill.duration+'s')]:[]));}
    this.objectiveSkillDetails.querySelector('small').textContent=Math.ceil(wait)+'s recharge';
    const pct=Math.max(0,Math.min(100,(1-wait/skill.cooldown)*100));this.objectiveSkillTrack.firstChild.style.width=pct+'%';this.objectiveSkillTrack.setAttribute('aria-valuenow',String(Math.round(pct)));
    if(expanded&&r.game.menus._focus===this.objectiveSkillButton){r.game.menus._focus=null;this.objectiveSkillButton.classList.remove('is-focus');}
  }
  update(dt,frame){
    if(G.match?.objective){this.updateObjective(G.match.objective,dt,frame);return;}
    if(this.objectiveSkill)this.objectiveSkill.hidden=true;
    if(G.match?.raid){super.update(dt,{...frame,markers:(frame?.markers||[]).map(m=>({...m,color:'#2489ed'}))});this.updateRaidRoster(G.match.raid);return;}
    const f=frame?.hunt||(this.preview?{...this.preview,time:204,traits:2,ammo:3,token:'PREVIEW',players:[true,true,true,true,false,false]}:null);
    if(!f)return;
    this._t+=dt;this._updTimer(f.time);this._updPrompt(f.role==='carrier'?'Find the four traits. Open nearby chests with [E].':'Catch the carrier. One hit captures.');
    const signature=JSON.stringify([f.role,f.traits,f.ammo,f.token,f.players]);
    if(signature!==this.huntSignature){
      this.huntSignature=signature;
      this.traitPlate.replaceChildren(h('small',null,'TRAITS'),...['✚','★','●','▲'].map((c,i)=>h('span',{class:i<f.traits?'is-found':''},c)),h('b',null,`${f.traits}/4`));
      this.ammoPlate.replaceChildren(h('small',null,'ROUNDS'),h('b',{class:'iw-display'},`${f.ammo} / 5`),h('div',{class:'chog-bullets'},Array.from({length:5},(_,i)=>h('i',{class:i<f.ammo?'is-loaded':''}))));
      this.ammoPlate.hidden=f.role!=='hunter';this.xh.hidden=f.role!=='hunter';
      const icons=this.squads.flatMap(g=>[...g.children]);
      icons.forEach((el,i)=>{el.style.setProperty('--tc',i===0?'#783ee8':'#ffac28');el.classList.toggle('is-dead',!f.players[i]);el.querySelector('.iw-sq__w').replaceChildren(h('img',{src:portrait,alt:`Player ${i+1}`}));});
      restartAnim(this.traitPlate,'iw-in');
    }
    const map=G.game?.mapDef;
    if(map?.id!==this.huntMap&&map?.thumb){this.huntMap=map.id;this.terrainImage=h('img',{src:'data:image/svg+xml,'+encodeURIComponent(map.thumb),alt:map.name,width:344,height:160,class:'chog-native-map'});}
    if(this.terrainImage)this._updMap({canvas:this.terrainImage,expanded:false,players:[]},dt);
  }
}
