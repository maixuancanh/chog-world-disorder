import {loadWorkshopSkill,resolveWorkshopSkill,workshopIdentity} from '../game/skill-workshop.js';
import {GLYPHS} from './ui-icons.js';
import {bossStatIcons} from './chog-icons.js';
import {h,restartAnim} from './ui-util.js';
import {G,on} from '../core/ctx.js';
import {BossHud} from './hud-boss.js';
import {raidRole,raidSkills} from '../game/boss-raid-rules.js';
import {objectiveFromNft} from '../game/chog-objectives.js';
import {openRaidPool} from './chog-raid-pool.js';

export function mountRaidLobby(menu,screen){
 const nft=menu._identity?.nft,objective=objectiveFromNft(nft),role=raidRole(objective);
 const detail=h('section',{class:'iw-panel chog-raid-prep iw-in iw-in--right'},h('div',{class:'chog-raid-prep__head'},nft?h('img',{src:nft.image,alt:nft.name}):h('i',{html:menu._raidIcon||'★'}),h('div',null,h('small',null,'YOUR RAID ROLE'),h('h2',{class:'iw-display'},role.name),h('b',null,nft?.name||'GUEST PRACTICE'))),h('p',null,role.description),h('small',null,'Three phases · Match the shield trait · Press F for your skill'));
 let wins=null,historyError=false,popup=null;
 const key='chog.raid.skill:'+nft?.tokenId,allSkills=[...raidSkills(Infinity),{id:'workshop',name:'WORKSHOP SKILL',wins:0}];
 const workshop=()=>{const current=nft?{...nft,...objective,contract:nft.contract||menu._identity?.config?.nft||menu.chogWallet.rewards.config?.nft}:null,progress={identity:workshopIdentity(current),wins:wins||0};return resolveWorkshopSkill(loadWorkshopSkill(localStorage,current,progress),current,progress);};
 const chosen=()=>{const saved=localStorage.getItem(key)||'trait';return saved==='workshop'?allSkills.at(-1):raidSkills(wins||0).find(s=>s.id===saved)||allSkills[0];};
 const status=h('div',{class:'chog-raid-history',role:'status'}),summary=h('div',{class:'chog-raid-choice-summary'});
 const chip=(icon,text)=>h('span',{class:'chog-raid-fact'},h('i',{'aria-hidden':'true',html:icon}),h('span',null,text));
 const skillIcon=skill=>skill.id==='rally'?GLYPHS.users:skill.id==='second-wind'?bossStatIcons[2]:role.id==='guardian'?bossStatIcons[1]:role.id==='medic'?bossStatIcons[2]:bossStatIcons[0];
 const facts=skill=>{const [effect,scope]=info(skill),parts=scope.split(' · ');return [chip(skillIcon(skill),effect),chip(GLYPHS.users,parts[0]),...(parts[1]?[chip(GLYPHS.clock,parts[1])]:[])];};
 const picker=menu._btn({id:'raid-skill-picker',label:'TRAIT POWER',sub:'CHOOSE SKILL',cls:'iw-btn--small',accept:()=>openPicker()});picker.setAttribute('aria-haspopup','dialog');
 const descriptions={breaker:['+15% DAMAGE','Self · 5s'],guardian:['−20% DAMAGE TAKEN','Allies within 12m · 5s'],medic:['+20 HP','Allies within 12m'],recruit:['NFT REQUIRED','Equip your Chog to use skills']};
 const info=skill=>skill.id==='workshop'?(()=>{const w=workshop();return [w.name+' '+(w.effect==='mend'?w.amount+' HP':Math.round(w.amount*100)+'%'),(w.target==='self'?'Self':w.radius+'m squad')+' · '+w.cooldown+'s recharge · '+w.modifier.toUpperCase()];})():skill.id==='trait'?descriptions[role.id]:skill.id==='rally'?['+15% DAMAGE','Allies within 12m · 4s']:['+35 HP','Self'];
 const close=()=>{const m=popup;if(!m)return;for(const b of m.querySelectorAll('[data-nav]'))menu._binds.delete(b);menu._closeModal();popup=null;picker.setAttribute('aria-expanded','false');picker.focus({preventScroll:true});};
 const render=()=>{const skill=chosen();picker.querySelector('.iw-btn__label').textContent=skill.name;summary.replaceChildren(...(nft||skill.id==='workshop'?facts(skill):[chip(GLYPHS.users,'NFT required')]));status.replaceChildren(chip(historyError?GLYPHS.reset:wins===null&&nft?GLYPHS.clock:GLYPHS.crown,!nft?'Guest practice':historyError?'Skills unavailable':wins===null?'Loading skills…':`${wins} ${wins===1?'boss win':'boss wins'}`));if(popup?.isConnected)renderCards();};
 const renderCards=()=>{
  const grid=popup.querySelector('.chog-raid-skill-grid');for(const b of grid.querySelectorAll('[data-nav]'))menu._binds.delete(b);grid.replaceChildren();
  for(const skill of allSkills){
   const locked=skill.id!=='workshop'&&(!nft||(wins===null&&skill.wins>0)||skill.wins>(wins||0)),selected=!locked&&chosen().id===skill.id,[effect,scope]=info(skill);
   const card=menu._btn({id:'raid-skill-'+skill.id,label:skill.name,cls:'chog-raid-skill-card',accept:()=>{if(locked)return;localStorage.setItem(key,skill.id);render();close();menu.toast(skill.name+' selected · Press F in battle');}});
   card.disabled=locked;card.classList.toggle('is-selected',selected);card.classList.toggle('is-locked',locked);card.setAttribute('aria-pressed',String(selected));
   card.prepend(h('span',{class:'chog-raid-skill-card__icon','aria-hidden':'true',html:skillIcon(skill)}));
   card.append(h('div',{class:'chog-raid-card-facts'},...facts(skill)),h('div',{class:'chog-raid-skill-card__cooldown'},chip(GLYPHS.clock,(skill.id==='workshop'?workshop().cooldown:skill.id==='second-wind'?'30':'18')+'s recharge'),h('kbd',null,'F')),h('b',{class:'chog-raid-skill-card__state'},!nft&&skill.id!=='workshop'?'NFT REQUIRED':locked?(wins===null?'CHECKING…':`WIN ${skill.wins} ${skill.wins===1?'BOSS':'BOSSES'}`):selected?'✓ SELECTED':'SELECT'));
   card.setAttribute('aria-label',skill.name+'. '+effect+'. '+scope+'. '+(locked?(!nft?'NFT required':`Unlock at ${skill.wins} boss wins`):selected?'Selected':'Select skill'));
   grid.append(card);
  }
 };
 function openPicker(){
  if(menu._modal)return;
  menu._openModal({title:'CHOOSE SKILL',text:null,buttons:[{label:'CLOSE',accept:close}]});popup=menu._modal;popup.classList.add('chog-raid-skills-modal');popup.setAttribute('role','dialog');popup.setAttribute('aria-modal','true');popup.setAttribute('aria-label','Choose boss skill');popup._onBack=close;
  popup.querySelector('.iw-modal__splat')?.remove();
  const card=popup.querySelector('.iw-modal__card'),grid=h('div',{class:'chog-raid-skill-grid'}),note=h('small',{class:'chog-raid-skill-note'},'Preset skills counter matching shields. Workshop applies its saved effect.');
  const x=menu._btn({id:'raid-skills-close',label:'×',cls:'chog-raid-skills-close',accept:close});x.setAttribute('aria-label','Close skill picker');
  card.insertBefore(grid,card.querySelector('.iw-modal__btns'));card.insertBefore(note,card.querySelector('.iw-modal__btns'));card.append(x);renderCards();picker.setAttribute('aria-expanded','true');
  const first=grid.querySelector('button[aria-pressed="true"]')||grid.querySelector('button:not(:disabled)')||x;menu._setFocus(first,{snap:true});first.focus({preventScroll:true});
  popup.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();return;}if(e.key!=='Tab')return;e.preventDefault();e.stopPropagation();const controls=[...popup.querySelectorAll('button:not(:disabled)')],i=controls.indexOf(document.activeElement),next=controls[(i+(e.shiftKey?-1:1)+controls.length)%controls.length];next?.focus({preventScroll:true});menu._setFocus(next,{snap:true});});
 }
 render();if(nft&&menu.chogWallet.rewards.token)menu.chogWallet.rewards.request('raid-profile',{tokenId:nft.tokenId}).then(p=>{if(detail.isConnected){wins=p.wins;render();}}).catch(()=>{if(detail.isConnected){historyError=true;render();}});
 detail.append(h('div',{class:'chog-raid-skills'},picker),summary,status,menu._btn({id:'raid-pool',label:'CHOG STAKE POOL',sub:'NFT stays in your wallet',cls:'iw-btn--primary',accept:()=>openRaidPool(menu)}));screen.append(detail);
}

export class BossRaidUI{
 constructor(runtime){
  this.r=runtime;this.hud=runtime.game.hud;document.body.classList.add('chog-boss-playing');this.hud.el.classList.add('chog-raid-hud');this.hud.boss?.dispose();this.hud.boss=new BossHud(this.hud);this.hud.boss._spawn(runtime.match.boss);this.hud.boss.squadTeams=teams=>{const all=teams.flatMap(t=>t.players||[]);return [{color:teams[0]?.color,players:all.slice(0,3)},{color:teams[0]?.color,players:all.slice(3,6)}];};
  this.hud.traitPlate.hidden=true;this.hud.ammoPlate.hidden=true;this.hud.el.append(this.hud.tank,this.hud.sp);this.hud.setVisible(true);
  const local=runtime.match.local;
  this.label=h('b');this.requirement=h('span');this.cooldown=h('small');this.effect=h('div',{class:'chog-raid-skill__effect'});this.feedback=h('div',{class:'chog-raid-skill__feedback',role:'status','aria-live':'polite'});this.fill=h('i');this.track=h('div',{class:'chog-raid-skill__track',role:'progressbar','aria-label':'NFT skill recharge','aria-valuemin':'0','aria-valuemax':'100'},this.fill);
  this.button=runtime.game.menus._btn({id:'raid-ability',label:'F · USE SKILL',cls:'iw-btn--primary iw-btn--small',accept:()=>runtime.useSkill()});
  this.details=h('div',{class:'chog-raid-skill__details'},this.label,this.effect,this.requirement,this.feedback,this.cooldown,this.track);
  this.panel=h('section',{class:'iw-panel chog-raid-skill is-compact'},this.button,this.details);
  this.root=h('div',{class:'chog-original chog-raid-live'},this.panel);this.hud.el.append(this.root);this.deathOff=on('splatted',({victim})=>{if(victim===runtime.match.local)this.root.hidden=true;});
 }
 notify(text){this.feedback.textContent=text;this.feedbackUntil=this.r.clock+2;restartAnim(this.panel,'is-activated');}
 update(){const r=this.r,a=r.match.local,workshop=a.raidSkill==='workshop'?r.workshopFacts?.(a):null,req=r.requirement(),deadline=(workshop?r.workshopCooldowns:r.cooldowns).get(r.local)||0,wait=Math.max(0,deadline-r.clock),playing=r.match.state==='playing';
  const ready=!r.session||r.session.room.go&&(r.session.isHost||r.session.replica?.latest),covered=!!r.game.menus.current||r.match.paused;
  this.hud.setVisible(!!ready&&!covered&&r.core.phase!=='finished');
  this.root.hidden=!ready||covered||!playing||!a.alive||(a.invuln>0&&!a.grounded)||r.core.phase==='finished'||r.match.controller?.mapHeld||(G.rig?.mapK||0)>.02;
  const skill=workshop?{name:workshop.name}:raidSkills(a.raidWins).find(s=>s.id===a.raidSkill),duration=workshop?workshop.duration:a.raidSkill==='rally'?4:a.raidSkill==='second-wind'||a.raidRole.id==='medic'?0:5,full=workshop?workshop.cooldown:a.raidSkill==='second-wind'?30:18;
  if(deadline>(this.lastDeadline||0)){this.activeUntil=deadline-full+duration;this.notify(duration?'SKILL ACTIVATED':'HEAL PULSE ACTIVATED');}this.lastDeadline=deadline;
  const active=Math.max(0,(this.activeUntil||0)-r.clock),effect=workshop?`${workshop.effect==='mend'?workshop.amount+' HP':Math.round(workshop.amount*100)+'%'} · ${workshop.target==='self'?'Self':workshop.radius+'m squad'} · ${workshop.modifier.toUpperCase()}`:a.raidSkill==='rally'?'+15% squad damage · 12m':a.raidSkill==='second-wind'?'+35 HP · Self':a.raidRole.id==='guardian'?'−20% damage taken · Squad · 12m':a.raidRole.id==='medic'?'+20 HP · Squad · 12m':'+15% damage · Self';
  const expanded=wait>0||r.clock<(this.feedbackUntil||0),fact=(icon,text)=>h('span',{class:'chog-raid-fact'},h('i',{'aria-hidden':'true',html:icon}),h('span',null,text));
  this.panel.classList.toggle('is-compact',!expanded);this.details.hidden=!expanded;this.button.hidden=expanded;this.panel.classList.toggle('is-active',active>0);
  this.label.textContent=(a.raidNft||workshop)?(skill?.name||'TRAIT POWER'):'NFT REQUIRED';
  const signature=[a.raidSkill,a.raidRole.id,Math.ceil(active),!!r.shield,req?.id,!!a.raidNft].join('|');
  if(signature!==this.detailSignature){this.detailSignature=signature;const effectIcon=a.raidSkill==='second-wind'||a.raidRole.id==='medic'?bossStatIcons[2]:a.raidRole.id==='guardian'?bossStatIcons[1]:bossStatIcons[0];
   this.effect.replaceChildren(...((a.raidNft||workshop)?[fact(effectIcon,effect),...(active>0?[fact(GLYPHS.clock,Math.ceil(active)+'s active')]:[])]:[fact(GLYPHS.users,'Equip an NFT in My NFT')]));
   this.requirement.replaceChildren(...(workshop?[fact(GLYPHS.clock,workshop.cooldown+'s cooldown')]:[fact(bossStatIcons[1],r.shield&&req?req.value:'Shield open'),...(r.shield?[fact(GLYPHS.target,'Match trait · 30m')]:[])]));
  }
  this.requirement.classList.toggle('is-open',!r.shield);this.track.hidden=!a.raidNft&&!workshop;
  const seconds=Math.ceil(wait);if(seconds!==this.shownSeconds){this.shownSeconds=seconds;this.cooldown.replaceChildren(fact(GLYPHS.clock,seconds>0?seconds+'s recharge':'Ready'));}
  this.button.disabled=!playing||!a.alive;this.button.querySelector('.iw-btn__label').textContent=(a.raidNft||workshop)?'F · '+(skill?.name||'TRAIT POWER'):'F · NFT REQUIRED';
  if(expanded&&r.game.menus._focus===this.button)r.game.menus._setFocus(null);
  this.fill.style.transform='scaleX('+Math.max(0,1-wait/full)+')';this.track.setAttribute('aria-valuenow',String(Math.round(Math.max(0,1-wait/full)*100)));
  if(r.clock>(this.feedbackUntil||0))this.feedback.textContent='';
 }

 dispose(){this.deathOff?.();document.body.classList.remove('chog-boss-playing','chog-pause-cover');this.hud.el.classList.remove('chog-raid-hud','is-boss');this.hud.overLayer.classList.remove('is-boss');this.r.game.menus._binds.delete(this.button);this.root.remove();this.hud.boss?.dispose();this.hud.boss={on:false,update(){},dispose(){},timesUp(){return false;},prompt(v){return v;}};this.hud.tank.remove();this.hud.sp.remove();}
}
export function adaptRaidResults(menu,screen){
 const runtime=G.match?.raid;if(!runtime)return screen;
 screen.el.classList.add('chog-raid-results');
 const back=screen.el.querySelector('[data-id=home],[data-id=leave]'),rematch=screen.el.querySelector('[data-id=rematch]');
 if(rematch){rematch.querySelector('.iw-btn__label').textContent='RAID AGAIN';menu._binds.get(rematch).accept=()=>runtime.leave();}
 if(back)menu._binds.get(back).accept=()=>runtime.leave();
 const sign=new URL('../../assets/chog-hunt-ui/chog-sign-v1.png',import.meta.url).href;
 for(const node of screen.el.querySelectorAll('.iw-res__splat,.iw-medal__burst')){node.replaceChildren(h('img',{src:sign,alt:'',class:'chog-raid-result-sign'}));node.setAttribute('aria-hidden','true');}
 if(runtime.session?.room.verified&&runtime.rewardNft){screen.el.querySelector('.iw-res__btns').prepend(menu._btn({id:'raid-claim-pool',label:'CLAIM POOL REWARD',cls:'iw-btn--wide iw-in iw-in--pop',accept:()=>openRaidPool(menu,runtime.core.roundId)}));}
 return screen;
}
