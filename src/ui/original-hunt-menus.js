import { dailyChallenge } from '../game/objective-rules.js';
import { openModeChooser, openSkillWorkshop, modeName, objectivePause, objectiveResults } from './objective-mode-ui.js';
import { loadWorkshopSkill } from '../game/skill-workshop.js';
import {mountRaidLobby,adaptRaidResults} from './boss-raid-ui.js';
import {HuntRoomSession} from '../net/hunt-room.js';
// Keep the original menu renderer, focus springs, button FX and scene transitions.
// The adaptation below changes content and removes unsupported game paths.
import { Menus as OriginalMenus } from './menus.js';
import { h, colorVars, restartAnim, easeInOutCubic } from './ui-util.js';
import { GLYPHS, weaponIcon, keycap, mouseGlyph, padGlyph } from './ui-icons.js';
import { G } from '../core/ctx.js';
import { formatChog } from '../game/hunt-ledger.js';
import { HUNT_RULE_ART } from './hunt-rule-art.js';
import { WIPE } from './menu-art.js';
import { replaceSquidIcons, chogMonoIcon, huntStatIcons, bossStatIcons } from './chog-icons.js';
import { ChogWalletUI } from './chog-wallet-ui.js';
import { HUNT_WEAPONS,HUNT_WEAPON_ORDER,weaponArt,weaponMarkup } from './hunt-arsenal.js';
const PORTRAIT = new URL('../../assets/chog-hunt-ui/chog-menu.png', import.meta.url).href;
const LOGO = new URL('../../assets/chog-hunt-ui/chog-world-disorder-logo-v1.png', import.meta.url).href;
const A='#ffac28', B='#783ee8';
const TRAITS=['✚','★','●','▲'];
const traitRow=(n=0)=>h('div',{class:'chog-traits'},TRAITS.map((v,i)=>h('span',{class:i<n?'is-found':''},v)));
const remove=(el,selectors)=>el.querySelectorAll(selectors).forEach(n=>n.remove());
export class Menus extends OriginalMenus {
  constructor(root,api){super(root,api);this.el.classList.add('chog-original');this._news.maybeShow=()=>{};this._huntMap=0;this._huntTime='day';this._lobbyKind='quick';this.chogWallet=new ChogWalletUI(this);
    this.wipeEl.classList.add('chog-character-wipe');
    this.wipe.mark.querySelector('.iw-wipe__squid').replaceChildren(h('img',{
      src:new URL('../../assets/chog-hunt-ui/benja-transition.png',import.meta.url).href,
      alt:'Benja',class:'chog-transition-character',decoding:'sync',fetchpriority:'high',
    }));
    const drawFull=this.wipe._drawFull.bind(this.wipe);
    this.wipe._drawFull=r=>{
      drawFull(r);
      // Use the paint renderer's actual clock, easing and wavy leading edge.
      const p=Math.min(1,r.t/WIPE.mid);
      const base=(-.3+1.42*easeInOutCubic(p))*r.H;
      const edge=this.wipe._edge(r,r.W/2,base,r.ph[0]);
      const height=this.wipe.mark.offsetHeight;
      this.wipe.mark.style.transform=`translate3d(0,${edge-height*.45}px,0)`;
      this.wipe.mark.style.opacity=r.t<=WIPE.mid?'1':'0';
    };
  }
  _swap(name,opts){
    if(super._swap(name,opts)===false)return false;
    if(this._scr?.el){
      replaceSquidIcons(this._scr.el);
      this._scr.el.querySelectorAll('.iw-backbtn').forEach(button=>this._leaveButton(button));
      this._scr.el.querySelectorAll('.iw-wchip__icon').forEach(el=>el.innerHTML=weaponMarkup(this._loadout().weapon));
    }
  }
  _press(el){
    super._press(el);
    this._burstAt(el);
  }
  _burstAt(el){
    if(!el?.isConnected||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const now=performance.now();
    if(now-(el._chogPaintAt||0)<90)return;
    el._chogPaintAt=now;
    const r=el.getBoundingClientRect(),host=this.el;
    const mark=h('span',{class:'chog-click-paint','aria-hidden':'true',style:{left:`${r.left+r.width*.5}px`,top:`${r.top+r.height*.5}px`}});
    mark.append(h('i',{class:'chog-click-paint__ring'}));
    for(let i=0;i<7;i++){
      const angle=(i/7)*Math.PI*2-.35;
      const radius=22+(i%3)*9;
      mark.append(h('i',{class:'chog-click-paint__drop',style:{'--dx':`${Math.cos(angle)*radius}px`,'--dy':`${Math.sin(angle)*radius}px`,'--angle':`${angle}rad`,'--paint':i%2?'#b70b38':'#ed1748'}}));
    }
    host.append(mark);setTimeout(()=>mark.remove(),380);
  }
  _weapons(){return HUNT_WEAPONS;}
  _weaponOrder(){return HUNT_WEAPON_ORDER;}
  _leaveButton(button){
    if(!button)return;
    button.classList.add('chog-leave');
    button.replaceChildren(document.createTextNode('LEAVE'));
    button.setAttribute('aria-label','Leave this page');
  }
  _headingSign(){return h('img',{src:new URL('../../assets/chog-hunt-ui/chog-sign-v1.png',import.meta.url).href,alt:'',class:'chog-heading-sign'});}
  _header(title,opts){
    const header=super._header(title==='LOADOUT'?'WEAPON':title,opts);
    this._leaveButton(header.querySelector('.iw-backbtn'));
    header.querySelector('.iw-head__blob').replaceChildren(this._headingSign());
    return header;
  }
  _applyAccent(){colorVars(this.el,'a',A);colorVars(this.el,'b',B);}
  setAccent(){this._applyAccent();}
  _net(){return null;} // The original relay speaks turf/teams, not Trait Hunt.
  show(name,opts={}){
    const aliases={room:'lobby',nft:'locker',preview:'setup',mode:'lobby'};
    name=aliases[name]||name;
    if(['locker','loadout'].includes(name)&&name!==this.current){const origin=['main','lobby','online','pause'].includes(this.current)?this.current:'main';if(name==='locker')this._nftReturn=origin;else this._loadoutReturn=origin;}
    if(!['loading','title','main','online','loadout','lobby','locker','settings','howto','setup','pause','results',null].includes(name))name='main';
    if(name!=='setup'&&G.hud?.setHuntPreview)G.hud.setHuntPreview(null);
    super.show(name,opts);
    this.el.querySelectorAll('.iw-corner').forEach(n=>{if(/^v\d+\.\d+/.test(n.textContent.trim()))n.remove();});
  }
  _logo(el){
    el.querySelectorAll('.iw-corner').forEach(n=>{if(/^v\d+\.\d+/.test(n.textContent.trim()))n.remove();});
    el.querySelectorAll('.iw-main__logo,.iw-title__logoin,.iw-loading__center > .iw-in:first-child').forEach(host=>{
      host.classList.add('chog-brand');
      host.replaceChildren(h('img',{src:LOGO,alt:'CHOG WORLD DISORDER',class:'chog-brand__image',width:1774,height:887,decoding:'sync',fetchpriority:'high'}));
    });
  }
  _portraitInto(host){host.replaceChildren(h('img',{src:PORTRAIT,alt:'Chog',class:'chog-native-portrait'}));}
  setLoading(p){super.setLoading(p,'Preparing the Chog arena…');}
  _scr_loading(){
    const s=super._scr_loading();
    this._logo(s.el);
    remove(s.el,'.iw-tip,.iw-progress__pct,.iw-corner');
    s.el.querySelector('.iw-loading__bg').replaceChildren(h('img',{
      class:'chog-loading-art',src:new URL('../../assets/chog-hunt-ui/loading-arena-v1.png',import.meta.url).href,
      alt:'',width:1672,height:941,fetchpriority:'high',decoding:'async',
    }));
    const track=s.el.querySelector('.iw-progress__track');
    track.setAttribute('role','progressbar');
    track.setAttribute('aria-label','Loading the Chog arena');
    track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
    const tick=s.tick;
    s.tick=dt=>{tick?.(dt);track.setAttribute('aria-valuenow',String(Math.round(this._loading.shown*100)));};
    return s;
  }
  _scr_title(){const s=super._scr_title();this._logo(s.el);s.el.querySelector('.iw-corner--bl').textContent='CHOG · Four traits. Five minutes.';return s;}
  _retarget(el,id,label,sub,action){const b=el.querySelector(`[data-id="${id}"]`);if(!b)return null;b.querySelector('.iw-btn__label').textContent=label;const t=b.querySelector('.iw-btn__sub');if(t)t.textContent=sub||'';const binding=this._binds.get(b);binding.accept=src=>{this._sfx('ui_confirm');if(src==='mouse')this._press(b);action();};return b;}
  _scr_main(){
    const s=super._scr_main();this._logo(s.el);
    remove(s.el,'[data-id="loadout"],[data-id="locker"],[data-id="credits"],.iw-btn__live,.iw-profile__stats,.iw-kitcard__chips,.iw-profile__emblem');
    this._retarget(s.el,'play','PLAY','Quick Play · 6 players · 5 minutes',()=>{if(!this.chogWallet.requirePlayer())return;this._lobbyKind='quick';this._go('lobby');});
    this._retarget(s.el,'online','ONLINE','Create or join a private room',()=>{if(this.chogWallet.requirePlayer())this._go('online');});
    const nft=this._btn({id:'nft',label:'MY NFT',icon:GLYPHS.star,cls:'iw-btn--menu iw-in iw-in--left',tilt:-1,accept:()=>this._go('locker')});
    s.el.querySelector('[data-id="settings"]').before(nft);
    this._renderIdentity(s.el.querySelector('.iw-profile'));
    const oldKit=s.el.querySelector('.iw-kitcard'),kit=this._btn({id:'hunter-equipment',label:HUNT_WEAPONS[this._loadout().weapon].name,sub:'WEAPON · FIVE ROUNDS',icon:weaponMarkup(this._loadout().weapon),cls:'iw-btn--menu iw-btn--online chog-equipment-link',accept:()=>{this._loadoutReturn='main';this._go('loadout');}});
    oldKit.replaceWith(kit);this._fx(kit,{tilt:3});
    const raid=this._btn({id:'boss-battle',label:'BOSS BATTLE',sub:'NFT squad · Three boss phases',icon:GLYPHS.crown,cls:'iw-btn--menu iw-btn--play chog-boss-link iw-in iw-in--right',accept:()=>{if(!this.chogWallet.requirePlayer())return;this._lobbyKind='boss';this._go('lobby');}});kit.before(raid);this._fx(raid,{tilt:-2});
    const choose=this._btn({id:'choose-mode',label:'CHOOSE MODE',sub:'Trait Control · Daily Trials · Skill Workshop',icon:GLYPHS.gamepad,cls:'iw-btn--menu iw-btn--play chog-mode-link iw-in iw-in--right',accept:()=>openModeChooser(this)});raid.after(choose);this._fx(choose,{tilt:2});
    const desc=s.el.querySelector('.iw-main__desctext');const descriptions={'choose-mode':'Trait Control, Daily Trials and your NFT Skill Workshop.','boss-battle':'Six Chogs face three boss phases with their chosen skills.',play:'Find a room. Restore the target NFT before time runs out.',online:'Prepare a six-player room. One carrier, up to five hunters.',nft:'NFT EXP and progression follow the token when it changes owner.',settings:'Sound, graphics and input settings.',howto:'The rules of the hunt, capture and rewards.'};
    s.onFocus=f=>{const t=descriptions[f.dataset.id];if(t&&t!==desc.textContent){desc.textContent=t;restartAnim(desc.parentElement,'is-swap');}};
    return s;
  }
  _renderIdentity(panel){this.chogWallet.renderIdentity(panel);}
  _connectWallet(){return this.chogWallet.connect();}
  _playerNameTag(){
    const result=super._playerNameTag();
    result.tag.classList.add('chog-player-name');
    remove(result.tag,'.iw-stag__w,.iw-stag__title,.iw-stag__num,.iw-stag__lv');
    result.tag.querySelector('.iw-hub__metaglbl').textContent='YOUR PLAYER NAME';
    result.nameRow._input.setAttribute('aria-label','Your player name');
    return result;
  }
  _matchNftButton(){return this._btn({id:'match-nft',label:'MATCH NFT',sub:'Select your Chog',icon:GLYPHS.star,accept:()=>this._go('locker')});}
  _roomSlots(players=[],self){return Array.from({length:6},(_,i)=>{const p=players[i];const known=p&&['1462','0697','1070','1055'].includes(p.nft)?`https://ipfs.filebase.io/ipfs/bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e/${Number(p.nft)}.webp`:null;const image=p?.nftImage||(p&&p.id===self?this._identity?.nft?.image:null)||known;return h('span',{class:'chog-room-slot'+(p&&p.id===self?' is-you':'')+(p?'':' is-empty'),title:p?.name||'Open player slot'},image?h('img',{src:image,alt:p.name,referrerpolicy:'no-referrer',onerror:e=>{e.target.replaceWith(h('i',{html:chogMonoIcon}));}}):h('i',{html:chogMonoIcon}),p?h('b',null,p.name):null);});}
  _scr_online(){
    const s=super._scr_online();s.el.classList.add('chog-online');
    remove(s.el,'.iw-lchip,.iw-stag__title,.iw-stag__num,.iw-stag__lv');
    s.el.querySelector('.iw-head__sub').textContent='Private rooms · Up to 6 players · Trait Hunt';
    const tag=s.el.querySelector('.iw-hub__metaglbl');if(tag)tag.textContent='YOUR PLAYER NAME';
    const steps=s.el.querySelectorAll('.iw-hubstep > span');if(steps[2])steps[2].textContent='Ready for the hunt';
    const w=s.el.querySelector('[data-id="weapon"]');if(w)this._binds.get(w).accept=()=>this._gunModal('online');
    const create=s.el.querySelector('.iw-hubcard--create'),join=s.el.querySelector('.iw-hubcard--join');
    remove(create,'.iw-hubcard__blob,.iw-hubcard__drips');
    create.querySelector('.iw-hubcard__icon > i').innerHTML=chogMonoIcon;
    create.querySelector('.iw-hubcard__go').replaceChildren(h('i',{html:GLYPHS.next}));
    const codeLabel=join.querySelector('.iw-hubcard__kicker');
    if(codeLabel)codeLabel.replaceChildren(h('i',{html:GLYPHS.key}),'ROOM CODE');
    s.el.querySelectorAll('.iw-hubstep').forEach((step,i)=>{
      step.querySelector('b').replaceChildren(h('span',null,String(i+1).padStart(2,'0')));
      if(i===0)step.querySelector('i').innerHTML=chogMonoIcon;
    });

    // The same raised tiles used by the created-room ticket, with a real editable input per letter.
    const codeInputs=Array.from({length:5},(_,i)=>h('input',{class:'iw-rc__tile hunt-room-digit',type:'text',maxlength:'1',autocomplete:'off',spellcheck:'false','aria-label':`Room code character ${i+1}`,placeholder:'•',style:{'--i':i,'--tilt':`${[-4,3,-2,4,-3][i]}deg`}}));
    const codeValue=()=>codeInputs.map(n=>n.value).join('');
    const fillCode=value=>{const chars=String(value).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);codeInputs.forEach((n,i)=>n.value=chars[i]||'');codeInputs[Math.min(chars.length,4)].focus();};
    join.querySelector('.iw-code').replaceChildren(h('div',{class:'iw-rc__ticket chog-join-code'},h('span',{class:'iw-rc__back'},h('i')),h('div',{class:'iw-rc__row'},h('div',{class:'iw-rc__tiles'},codeInputs))));
    const {wChip,wIcon,wName}=this._lobbyWeaponChip();wIcon.innerHTML=weaponMarkup(this._loadout().weapon);wName.textContent=HUNT_WEAPONS[this._loadout().weapon].name;this._bind(wChip,{id:'weapon',accept:()=>this._gunModal('online')});
    remove(s.el,'.iw-hub__chips');join.append(h('div',{class:'iw-lob__you chog-join-equipment'},wChip,this._matchNftButton()));
    const enter=async code=>{if(!this.chogWallet.requirePlayer()||this._roomBusy)return;this._roomBusy=true;try{await this.huntRoom?.leave();this.huntRoom=new HuntRoomSession(this);await this.huntRoom.enter(code);this._lobbyKind='private';this._go('lobby');}catch(e){this.toast(e.message);}finally{this._roomBusy=false;}};
    this._binds.get(create).accept=()=>enter();this._binds.get(join).accept=()=>codeInputs[0].focus();
    codeInputs.forEach((input,i)=>{input.addEventListener('input',()=>{const clean=input.value.toUpperCase().replace(/[^A-Z0-9]/g,'');input.value=clean.slice(-1);if(input.value&&i<4)codeInputs[i+1].focus();});input.addEventListener('paste',e=>{e.preventDefault();fillCode(e.clipboardData.getData('text'));});input.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();if(codeValue().length===5)enter(codeValue());}else if(e.key==='Backspace'&&!input.value&&i>0)codeInputs[i-1].focus();else if(e.key==='ArrowLeft'&&i>0)codeInputs[i-1].focus();else if(e.key==='ArrowRight'&&i<4)codeInputs[i+1].focus();});});
    s.el.addEventListener('click',e=>{if(e.target.closest('.iw-join__btns')){e.stopImmediatePropagation();if(e.target.closest('.is-go')){if(codeValue().length===5)enter(codeValue());else this.toast('Enter the five-character room code.');}else navigator.clipboard.readText().then(fillCode).catch(()=>codeInputs[0].focus());}},true);
    const sub=s.el.querySelector('.iw-hubcard--create .iw-hubcard__sub');if(sub)sub.textContent='Prepare your map and NFT. Six players maximum.';
    // Retain the original code-entry/card motion, but never invoke the old relay.
    s.onKey=()=>false;s.onNav=()=>false;s.afterMount=()=>{};
    const tick=s.tick;s.tick=dt=>{tick?.(dt);remove(s.el,'.iw-lchip,.iw-stag__title,.iw-stag__num,.iw-stag__lv');};
    return s;
  }
  _scr_lobby(){
    const s=super._scr_lobby();s.destroy?.(); // Release legacy lobby listeners; keep its rendered components.
    const el=s.el;const raid=this._lobbyKind==='boss'||this.huntRoom?.room?.config?.mode==='boss'&&this._lobbyKind==='private';const objective=['control','trials'].includes(this._lobbyKind)?this._lobbyKind:null;const matchMode=objective||(raid?'boss':'hunt');const quick=this._lobbyKind!=='private';el.classList.add('chog-hunt-lobby','is-host');if(quick)el.classList.add('chog-quickplay');if(objective==='trials'){this._huntMap=Math.max(0,this._maps().findIndex(m=>m.id==='tidewater'));this._huntTime='day';}
    remove(el,'.iw-lob__modelbl,.iw-lset--pal,.iw-lset--bots,.iw-lset--diff,.iw-lob__modearrows,.iw-lob__beta,.iw-lob__bossvs,.iw-lob__team,.iw-lob__emote,.iw-lob__lchip,.iw-lob__plates,.iw-lcd,.iw-prompts,.iw-lock,.iw-btn--lobstart,.iw-rc__copied');
    el.querySelector('.iw-lob__modename').textContent=objective?modeName(objective):raid?'BOSS BATTLE':'TRAIT HUNT';
    // A stepped, bevelled dock replaces the original wavy paint band.
    const band=el.querySelector('.iw-lob__band');
    if(band){
      const edge='M0 28 H46 L72 14 H570 L598 24 H1120 L1148 10 H1544 L1576 28 H1600 V150 H0 Z';
      band.classList.add('chog-match-dock');
      band.innerHTML=`<svg viewBox="0 0 1600 150" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chog-dock-fill" x2="0" y2="1"><stop stop-color="#39234f"/><stop offset="1" stop-color="#191221"/></linearGradient></defs><path class="chog-dock__shape" d="${edge}"/><path class="chog-dock__rail" d="M80 22 H564 L592 32 H1126 L1154 18 H1536"/><path class="chog-dock__detail" d="M20 55 V128 H60 M1540 128 H1580 V55"/></svg>`;
      const mask=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 150" preserveAspectRatio="none"><path fill="white" d="${edge}"/></svg>`;
      band.style.setProperty('--chog-band-mask',`url("data:image/svg+xml,${encodeURIComponent(mask)}")`);
    }
    const count=el.querySelector('.iw-lob__count');count.replaceChildren(h('small',{class:'iw-lob__countlbl'},'PLAYERS'),h('b',null,'1'),h('small',null,'/6'));
    el.querySelector('.iw-lob__teams').replaceChildren(h('div',{class:'chog-room-pips'},this._roomSlots()));
    el.querySelector('.iw-lob__statustxt').textContent='Room draft · multiplayer connection pending';
    el.querySelector('.iw-rc__share').textContent='A room code is issued when Trait Hunt connects.';
    const len=el.querySelector('.iw-lset--len');len.replaceChildren(h('div',{class:'iw-lset__label'},h('i',{html:GLYPHS.clock}),'LENGTH'),h('b',{class:'chog-fixed'},objective==='control'?'4 MIN':objective==='trials'?`${dailyChallenge().duration/60} MIN`:raid?'4 MIN':'5 MIN'));
    const timeRow=el.querySelector('.iw-lset--time');
    const stage=el.querySelector('.iw-lstage');
    stage.replaceChildren(h('span',{class:'iw-lstage__imgs'}),h('i',{class:'iw-lstage__shade'}),h('span',{class:'iw-lstage__num'}),h('span',{class:'iw-lstage__tape'},h('span',{class:'iw-lstage__name'})),h('span',{class:'iw-lstage__time'},h('i',{class:'is-sun',html:GLYPHS.sun}),h('i',{class:'is-moon',html:GLYPHS.moon})),h('span',{class:'iw-lstage__arrows'},h('i',{class:'is-l',html:GLYPHS.back}),h('i',{class:'is-r',html:GLYPHS.next})));
    let shown='';const timers=new Set();
    const refresh=(direction=0)=>{
      const maps=this._maps(),m=maps[this._huntMap],time=this._huntTime;
      stage.querySelector('.iw-lstage__num').replaceChildren('STAGE ',h('b',null,String(this._huntMap+1).padStart(2,'0')),h('em',null,'/ '+String(maps.length).padStart(2,'0')));
      stage.querySelector('.iw-lstage__name').textContent=m.name;
      stage.dataset.time=time;
      const key=m.id+'-'+time;if(key===shown)return;const first=!shown;shown=key;
      const imgs=stage.querySelector('.iw-lstage__imgs'),old=[...imgs.children];
      const img=h('img',{class:'iw-lstage__img'+(first?'':direction?' is-slide':' is-fade'),alt:m.name+' — '+time,draggable:'false',style:{'--dir':direction<0?-1:1}});
      img.addEventListener('error',()=>img.replaceWith(h('span',{class:'iw-lstage__img iw-lstage__fb',html:m.thumb||''})),{once:true});
      img.src=new URL(`../../assets/chog-world/stages/${m.id}-${time}-sm.webp`,import.meta.url).href;imgs.append(img);
      const timer=setTimeout(()=>{old.forEach(n=>n.remove());timers.delete(timer);},first?0:520);timers.add(timer);
      if(!first){restartAnim(stage,'is-hit');restartAnim(stage.querySelector('.iw-lstage__name'),'is-in');}
    };
    const cycle=d=>{if(objective==='trials')return;this._huntMap=(this._huntMap+d+this._maps().length)%this._maps().length;refresh(d);this._previewStage();};
    this._bind(stage,{id:'hunt-map',type:'row',accept:()=>cycle(1),adjust:cycle});
    stage.querySelectorAll('.iw-lstage__arrows i').forEach((n,i)=>n.addEventListener('click',e=>{e.stopPropagation();this._setFocus(stage);cycle(i?1:-1);}));
    const time=this._seg([['day',h('span',{class:'iw-segico'},h('i',{html:GLYPHS.sun}),'DAY')],['dusk',h('span',{class:'iw-segico'},h('i',{html:GLYPHS.moon}),'DUSK')]],this._huntTime,v=>{if(objective==='trials')return;this._huntTime=v;refresh();this._previewStage();});
    timeRow.replaceChildren(h('div',{class:'iw-lset__label'},h('i',{html:GLYPHS.sun}),'TIME OF DAY'),time.el);this._bind(timeRow,{id:'hunt-time',type:'row',accept:time.cycle,adjust:time.adjust});
    el.querySelector('.iw-lset--stage .iw-lset__label').replaceChildren('STAGE');
    el.querySelector('.iw-lob__mode > i').innerHTML=chogMonoIcon;
    refresh();
    let quickName;
    if(quick){
      quickName=this._playerNameTag();el.append(quickName.tag);
      remove(el,'.iw-rc,.iw-lob__status');
      const heading=this._header(objective?modeName(objective):raid?'BOSS BATTLE':'QUICK PLAY',{back:false,sub:objective==='control'?'3 versus 3 · Three stations · First to 100':objective==='trials'?'8 beacons · Hold each ring 3s · Rascal + Mend':raid?'Six Chogs · Three phases · Four minutes':'Up to 6 players · Five minutes'});heading.classList.add('chog-quick-heading');el.querySelector('.iw-lob__top').append(heading);
    }
    const weapon=el.querySelector('.iw-lob__wchip');this._binds.get(weapon).accept=()=>this._gunModal();if(raid)mountRaidLobby(this,el);if(objective==='trials'){stage.querySelector('.iw-lstage__arrows').hidden=true;timeRow.style.pointerEvents='none';timeRow.setAttribute('aria-disabled','true');}
    const ready=el.querySelector('.iw-btn--ready');ready.classList.remove('is-hidden');ready.style.display='';ready.querySelector('.iw-btn__label').textContent=quick?(objective?'START '+modeName(objective):raid?'START BOSS':'START HUNT'):'READY?';ready.querySelector('.iw-btn__sub').textContent=quick?(objective?'Objective match · Fixed rules':this._identity?.kind==='wallet'?'Server reward match · Five bots':'Practice · Five bots · No withdrawals'):'Private room · Bots fill empty slots';this._binds.get(ready).accept=()=>{if(!this.chogWallet.requirePlayer())return;this._press(ready);if(quick){if(this._identity?.kind==='wallet'){if(!this.chogWallet.rewards.token){this.toast('Sign in with your wallet in Profile to play for testCHOG.');return;}if(this._startingReward)return;this._startingReward=true;ready.disabled=true;const room=this.huntRoom=new HuntRoomSession(this);room.enter().then(()=>room.settings(this._maps()[this._huntMap].id,this._huntTime,matchMode)).then(()=>room.start()).catch(async e=>{await room.leave();this.toast(e.message);}).finally(()=>{this._startingReward=false;ready.disabled=['queued','loading'].includes(this.huntRoom?.room?.phase);});}else this.api.startMatch({mode:matchMode,raidSkill:localStorage.getItem('chog.raid.skill:'+this._identity?.nft?.tokenId)||'trait',workshopSkill:loadWorkshopSkill(localStorage,this._identity?.nft),mapId:this._maps()[this._huntMap].id,time:this._huntTime});}else{const room=this.huntRoom;if(!room)return;const act=room.isOwner?room.settings(this._maps()[this._huntMap].id,this._huntTime,matchMode).then(()=>room.start()):room.ready();act.catch(e=>this.toast(e.message));}};
    el.querySelector('.iw-lob__you').append(this._matchNftButton());
    el.querySelector('.iw-lob__leave').addEventListener('click',e=>{e.stopImmediatePropagation();this.huntRoom?.leave();this.show('main',{back:true});},true);
    el.append(this._prompts([['Enter','A','Select'],['Esc','B','Leave']]));
    const copy=el.querySelector('.iw-rc__copy');if(!quick&&copy)this._bind(copy,{id:'copy-room-code',accept:()=>navigator.clipboard.writeText(this.huntRoom?.room?.code||'').then(()=>this.toast('Room code copied')).catch(()=>this.toast('Could not copy room code'))});
    const waiting=h('div',{class:'chog-room-wait',role:'status','aria-live':'polite'},h('b'),h('small',null,'You can leave while waiting.'));waiting.hidden=true;el.append(waiting);
    let roomSignature;const roomTick=()=>{const session=this.huntRoom,room=session?.room,pending=!!room&&!session.closed&&['queued','loading'].includes(room.phase);waiting.hidden=!pending;
     if(pending)waiting.querySelector('b').textContent=room.phase==='queued'?`Waiting for a match · Queue position ${room.simulation?.position||1}`:'Preparing your match…';
     if(quick){ready.disabled=pending||!!this._startingReward;ready.querySelector('.iw-btn__label').textContent=pending?'PLEASE WAIT':objective?'START '+modeName(objective):raid?'START BOSS':'START HUNT';return;}
     if(!room)return;const signature=JSON.stringify([room,this._huntMap,this._huntTime]);if(signature===roomSignature)return;roomSignature=signature;
     el.classList.toggle('is-host',session.isOwner);count.querySelector('b').textContent=room.players.length;
     el.querySelector('.chog-room-pips').replaceChildren(...this._roomSlots(room.players,session.id));
     el.querySelector('.iw-rc__tiles').replaceChildren(...[...room.code].map(c=>h('span',{class:'iw-rc__tile'},c)));
     el.querySelector('.iw-rc__share').textContent='Share this code · ONLINE > JOIN A ROOM';
     el.querySelector('.iw-lob__statustxt').textContent=room.phase==='loading'?'Loading players…':`${room.players.length} connected`;
     ready.querySelector('.iw-btn__label').textContent=session.isOwner?(objective?'START '+modeName(objective):raid?'START BOSS':'START HUNT'):room.players.find(p=>p.id===session.id)?.ready?'NOT READY':'READY';
     ready.disabled=room.phase!=='lobby'||session.isOwner&&room.players.some(p=>!p.ready);
     stage.style.pointerEvents=session.isOwner&&room.phase==='lobby'?'':'none';timeRow.style.pointerEvents=session.isOwner&&room.phase==='lobby'?'':'none';
     if(!session.isOwner){const index=this._maps().findIndex(m=>m.id===room.config.mapId);if(index>=0&&index!==this._huntMap||this._huntTime!==room.config.time){this._huntMap=Math.max(0,index);this._huntTime=room.config.time;refresh();}}
     else if(room.phase==='lobby'){const cfg=this._maps()[this._huntMap].id+':'+this._huntTime;if(session._settings!==cfg){session._settings=cfg;session.settings(this._maps()[this._huntMap].id,this._huntTime).catch(e=>this.toast(e.message));}}
    };
    roomTick();
    return {el,initial:stage,wrap:true,tick:roomTick,onBack:()=>{this.huntRoom?.leave();this.show('main',{back:true});},destroy:()=>{const input=quickName?.nameRow._input;if(input&&document.activeElement===input)input.blur();timers.forEach(clearTimeout);}};
  }
  _previewStage(){this.api.previewHuntMap?.(this._maps()[this._huntMap].id,this._huntTime).catch(e=>this.toast(e.message));}
  _gunModal(screen='lobby'){this._loadoutReturn=screen;this._go('loadout');}
  _scr_loadout(){
    const s=super._scr_loadout();
    s.el.classList.add('chog-armory');
    remove(s.el,'[data-id="practice"],.iw-loadout__look,.iw-wd__kits,.iw-wcard__blob,.iw-wcard__new,.iw-prompts');
    s.el.querySelector('.iw-head__sub').textContent='Five weapons. Five rounds. Make every shot count.';
    s.el.querySelector('.iw-loadout__body > .iw-seclabel').hidden=true;
    const equipActions=new Map(),renderDetail=s.onFocus;
    s.el.querySelectorAll('.iw-wcard').forEach(card=>{
      card.querySelector('.iw-wcard__icon').innerHTML=weaponMarkup(card._wid);
      const binding=this._binds.get(card);equipActions.set(card._wid,binding.accept);
      binding.accept=()=>{this._setFocus(card);renderDetail?.(card);update(card._wid);};
    });
    const rows=s.el.querySelectorAll('.iw-stat');
    rows[1].querySelector('.iw-stat__label').lastChild.textContent='ACCURACY';
    rows[4].remove();
    const detail=s.el.querySelector('.iw-wd');
    detail.append(h('div',{class:'chog-ammo-rule'},h('b',null,'5 ROUNDS'),h('span',null,'One hit captures · No refill')));
    const picture=h('img',{class:'chog-armory-hero__image',alt:''});
    const heroName=h('h2',{class:'iw-display'});
    const equip=this._btn({id:'equip-marker',label:'EQUIP WEAPON',cls:'iw-btn--primary',accept:()=>{
      if(this._loadout().weapon===shown)return;equipActions.get(shown)?.('key');
      this.toast(`${HUNT_WEAPONS[shown].name} equipped.`);update(shown);
    }});
    let shown=this._loadout().weapon;
    const hero=h('section',{class:'chog-armory-hero iw-panel iw-in iw-in--right'},
      heroName,h('div',{class:'chog-armory-hero__art'},picture),equip);
    s.el.append(hero,this._prompts([['Enter','A','Equip'],[['←','→'],'DPad','Browse'],['Esc','B','Back']]));
    const update=id=>{
      shown=id;s.el.querySelectorAll('.iw-wcard').forEach(card=>{const selected=card._wid===id;card.classList.toggle('is-selected',selected);card.setAttribute('aria-pressed',String(selected));});picture.src=weaponArt(id);heroName.textContent=HUNT_WEAPONS[id].name;
      equip.querySelector('.iw-btn__label').textContent=this._loadout().weapon===id?'EQUIPPED':'EQUIP WEAPON';equip.disabled=this._loadout().weapon===id;
      restartAnim(picture,'is-swap');
    };
    // Focus and pointer hover may move independently; only activation selects a weapon.
    s.onFocus=()=>{};
    s.onNav=()=>false;
    s.onBack=()=>this.show(this._loadoutReturn||'main',{back:true});
    update(shown);
    return s;
  }
  _scr_locker(){
    const body=h('div',{class:'iw-locker__body chog-wallet-body'});
    this.chogWallet.renderLocker(body);
    const hint=h('div',{class:'iw-lspin'},h('i',{html:GLYPHS.rotate}),h('span',null,'DRAG TO SPIN'));
    const el=h('div',{class:'iw-screen iw-locker chog-wallet-screen chog-nft-locker'},h('div',{class:'iw-scrim-left'}),this._header('MY NFT',{sub:'Choose your Chog'}),body,hint);
    // The menu UI is a sibling of the renderer, so forward turntable drags to its native inertia handler.
    el.addEventListener('pointerdown',e=>{const sc=G.game?.showcase;if(e.button!==0||sc?.mode!=='locker'||e.target.closest('button,.chog-wallet-body')||e.clientX<=(sc.ui.s?.panelR||innerWidth*.6))return;sc.drag={x:e.clientX,t:performance.now()};sc.spinVel=0;});
    return {el,afterMount:()=>this.chogWallet.showLockerPreview(body),destroy:()=>{for(const hd of body._portraits||[])hd?.cancel?.();G.game?.showcase?.hide();},onBack:()=>this.show(this._nftReturn||'main',{back:true})};
  }
  _backToMain(){this.show('main',{back:true});}
  _controlsList(mode,compact=false) {
    const keys = (...ks) => ks.map(keycap).join('');
    const rows = [
      ['Move', keys('W','A','S','D'), padGlyph('LS')],
      ['Aim', mouseGlyph('M'), padGlyph('RS')],
      ['Fire · Hold/release to charge', mouseGlyph('L'), padGlyph('RT')],
      ['Jump', keys('SPACE'), padGlyph('A')],
      ['Hold to open chest', keys('E'), padGlyph('X')],
      ['Map', keys('TAB'), padGlyph('View')],
      ['Pause', keys('ESC'), padGlyph('Start')],
    ];
    return h('div', {class:'iw-ctl'+(compact?' iw-ctl--compact':'')}, rows.map(([act,kb,pad]) =>
      h('div', {class:'iw-ctl__row'}, h('span', {class:'iw-ctl__act'}, act),
        h('span', {class:'iw-ctl__keys', html:mode==='pad'?pad:kb}))));
  }
  _scr_howto() {
    const rules = [
      ['Restore the target NFT', 'One of six players becomes the carrier. Find the exact traits of the NFT chosen at the start. Missing trait groups are skipped. Only the carrier can open trait chests.'],
      ['Catch the carrier', 'One hit eliminates the carrier. The hunter takes their role and keeps the collected traits. The captured player is out. Only the successful hunter sees the new role briefing. Both roles can open parachute supply chests.'],
      ['Five shots. One chance.', 'Everyone has five shots. Carrier hits stun hunters for three seconds. Buy three extra shots for 3 CHOG, at most twice per match.'],
      ['Finish the hunt', 'Find every target trait to win 20 CHOG; others receive 2 CHOG. If time expires, everyone receives 2 CHOG. Claim into your game balance.'],
    ];
    const cards = rules.map(([title,text],i) => h('div', {
      class:'iw-rule iw-in iw-in--pop', style:{'--tilt':`${[-1.2,1,.8,-1][i]}deg`}},
      h('div', {class:'iw-rule__art',html:HUNT_RULE_ART[i]}),
      h('div', {class:'iw-rule__num'},String(i+1)),
      h('div', {class:'iw-rule__title'},title),
      h('p', {class:'iw-rule__text'},text)));
    let mode = this._input;
    const list = h('div', {class:'iw-ctl-wrap'});
    const render = () => { list.replaceChildren(this._controlsList(mode)); restartAnim(list,'is-in'); };
    const seg = this._seg([
      ['kbm',h('span',{class:'iw-segico'},h('i',{html:GLYPHS.keyboard}),'KEYBOARD & MOUSE')],
      ['pad',h('span',{class:'iw-segico'},h('i',{html:GLYPHS.gamepad}),'CONTROLLER')],
    ],mode,v=>{mode=v;render();});
    const switcher = h('div',{class:'iw-ctl-switch'},seg.el);
    this._bind(switcher,{id:'scheme',type:'row',adjust:seg.adjust,accept:seg.cycle});
    render();
    const el = h('div',{class:'iw-screen iw-howto'},h('div',{class:'iw-scrim-full'}),
      this._header('HOW TO PLAY',{sub:'Trait Hunt · 6 players maximum · 5 minutes'}),
      h('div',{class:'iw-howto__body'},
        h('div',{class:'iw-howto__left'},h('div',{class:'iw-howto__rules'},cards)),
        this._panel('iw-howto__ctl iw-in iw-in--right',
          h('div',{class:'iw-seclabel'},h('i',{html:GLYPHS.gamepad}),'CONTROLS'),switcher,list)),
      this._prompts([[['←','→'],'DPad','Switch controls'],['Esc','B','Back']]));
    return {el,initial:switcher,onNav:dir=>{
      if(dir==='tab_prev'||dir==='tab_next'){seg.adjust(dir==='tab_next'?1:-1);return true;}
      return false;
    }};
  }
  _scr_settings(){const s=super._scr_settings();s.el.classList.add('chog-settings');const scrub=()=>{remove(s.el,'[data-id="set-colorblind"],[data-id="set-difficulty"],[data-id="set-matchLength"]');const stage=s.el.querySelector('.iw-prev__stage');if(stage&&/Colorblind-safe inks|Default bot skill|Default match length/.test(stage.textContent))stage.replaceChildren(h('div',{class:'chog-info'},h('b',null,'PLAY PREFERENCES'),h('p',null,'Camera shake · Vibration · Minimap')));const p=s.el.querySelector('.iw-prev__help');if(p&&/ink|turf|bomb|special|splats/i.test(p.textContent))p.textContent='Adjust your display, sound or control preferences.';};scrub();const obs=new MutationObserver(scrub);obs.observe(s.el,{childList:true,subtree:true});const destroy=s.destroy;s.destroy=()=>{obs.disconnect();destroy?.();};return s;}
  _scr_setup(){const role=this._huntRole||'hunter';const controls=h('div',{class:'chog-preview-controls iw-panel iw-in iw-in--down'},h('b',null,'HUD PREVIEW · SAMPLE DATA'),...['hunter','carrier'].map(v=>this._btn({id:'preview-'+v,label:v.toUpperCase(),accept:()=>{this._huntRole=v;G.hud.setHuntPreview({role:v});}})),this._btn({id:'preview-back',label:'BACK',accept:()=>this.show('main',{back:true})}));const el=h('div',{class:'iw-screen chog-preview'},controls);return{el,initial:controls.querySelector('button'),afterMount:()=>G.hud?.setHuntPreview({role}),onBack:()=>this.show('main',{back:true})};}
  _scr_pause(){
    const screen=super._scr_pause(),r=G.match?.hunt;
    const sign=screen.el.querySelector('.iw-pause__blob');if(sign){sign.className='iw-head__blob';sign.replaceChildren(this._headingSign());}
    const raid=G.match?.raid;
    if(raid){
      screen.el.querySelector('.iw-pmatch__tag').textContent='BOSS BATTLE';
      const diff=screen.el.querySelector('.iw-pmatch__diff');if(diff)diff.textContent='SIX CHOGS · ONE BOSS';
      const stats=[...screen.el.querySelectorAll('.iw-pstat')],labels=['DAMAGE','SHIELDS','SUPPORT','POWER'];
      stats.forEach((el,i)=>{el.querySelector(':scope > small').textContent=labels[i];el.querySelector('i').innerHTML=bossStatIcons[i];el.classList.add('chog-boss-stat');el.dataset.stat=labels[i].toLowerCase();});
      const refresh=()=>{const a=raid.match.local,s=raid.stats.get(raid.local)||{};const values=[Math.round(s.damage||0),s.breaks||0,Math.round((s.healing||0)+(s.blocked||0)),Math.round(a.specialFrac()*100)+'%'];stats.forEach((el,i)=>{el.querySelector('b').textContent=values[i];el.classList.toggle('is-ready',i===3&&a.specialReady());});};
      const tick=screen.tick;screen.tick=dt=>{tick?.(dt);refresh();};refresh();return screen;
    }
    if(G.match?.objective)return objectivePause(this,screen,G.match.objective);
    if(!r)return screen;
    screen.el.classList.add('chog-hunt-pause');
    const panel=screen.el.querySelector('.iw-pmatch');colorVars(panel,'ta','#ed1748');colorVars(panel,'tb','#2489ed');colorVars(panel,'self',r.core.role(r.local)==='carrier'?'#ed1748':'#2489ed');
    screen.el.querySelector('.iw-pmatch__tag').textContent='TRAIT HUNT';
    const info=screen.el.querySelector('.iw-pmatch__mode');info.querySelector('.iw-pmatch__diff')?.remove();
    info.append(h('span',{class:'iw-pmatch__diff'},`EXPERT BOTS · INDEPENDENT AI`));
    const stats=[...screen.el.querySelectorAll('.iw-pstat')],labels=['CHOG','AMMO','TRAITS','BUYS'];
    stats.forEach((el,i)=>{el.querySelector(':scope > small').textContent=labels[i];el.querySelector('i').innerHTML=huntStatIcons[i];});
    const refresh=()=>{
      const c=r.core,p=c.players.get(r.local);
      stats.forEach((el,i)=>{el.querySelector('b').textContent=[formatChog(p.earned),`${p.ammo}/5`,`${c.found.size}/${c.traits.length}`,`${p.purchases}/2`][i];el.classList.remove('is-ready');});
      screen.el.querySelector('.iw-pyou__id small').textContent=p.out?'GAME OVER':c.role(r.local)==='carrier'?'YOU ARE THE CARRIER':'YOU ARE A HUNTER';
      screen.el.querySelectorAll('.iw-roster').forEach((group,i)=>{
        group.querySelector('.iw-roster__head span').textContent=i?'HUNTERS':'CARRIER';group.querySelector('.iw-roster__head em').textContent='';
        const actors=r.actors.filter(a=>(c.role(a.huntId)==='hunter')===!!i);
        group.querySelectorAll('.iw-rrow').forEach((row,j)=>{const actor=actors[j];if(!actor)return;const state=c.players.get(actor.huntId);row.querySelector('.iw-rrow__w').replaceChildren();row.querySelector('.iw-rrow__st').textContent=state.out?(state.outReason==='captured'?'CAUGHT':'NO AMMO'):state.recovering>0?'RESPAWNING':state.stun>0?'STUN':'ACTIVE';});
      });
    };
    const tick=screen.tick;screen.tick=dt=>{tick?.(dt);refresh();};refresh();
    const quit=screen.el.querySelector('[data-id=quit]');quit.querySelector('.iw-btn__label').textContent='EXIT ROOM';this._binds.get(quit).accept=()=>this._openModal({title:'EXIT ROOM?',text:'Leave this Trait Hunt match and return to the main menu?',buttons:[{label:'KEEP PLAYING',accept:()=>this._closeModal()},{label:'EXIT ROOM',accept:()=>{this._closeModal(true);r.leave();}}]});
    return screen;
  }

  _scr_hunt_results(){
    // Start with the original result screen, retaining its title paint, entrance, footer and controls.
    const s=super._scr_results(),r=G.match.hunt,el=s.el;
    el.classList.add('chog-hunt-results');el.classList.remove('is-intro');
    remove(el,'.iw-res__cover,.iw-res__teams,.iw-xp,.iw-res__medals,.iw-res__tag,.iw-prompts');
    el.querySelector('.iw-res__title').textContent=r.core.winner===r.local?'MISSION COMPLETE':'MISSION FAILED';
    el.querySelector('.iw-res__meta').textContent=`${G.game.mapDef.name} · TRAIT HUNT${r.core.winner===null?(r.core.reason==='no-opponents'?' · NO OPPONENTS REMAIN · NO WINNER':r.core.reason==='no-carrier'?' · CARRIER ELIMINATED · NO WINNER':r.core.reason==='no-players'?' · NO PLAYERS REMAIN · NO WINNER':' · TIME EXPIRED · NO WINNER'):''}`;
    const open=el.querySelector('[data-id="rematch"]'),home=el.querySelector('[data-id="home"]');
    open.querySelector('.iw-btn__label').textContent='CLAIM';open.classList.remove('iw-btn--wide');open.classList.add('iw-btn--small','chog-wallet-action');open.querySelector('.iw-btn__icon')?.remove();open.disabled=true;
    this._binds.get(open).accept=async()=>{if(!r.resultsView||open.disabled)return;open.disabled=true;const started=await r.resultsView.play();if(started){open.hidden=true;this._sfx('ui_confirm');}else{open.disabled=false;this.toast('Could not collect match rewards. Try again.');}};
    home.querySelector('.iw-btn__label').textContent='EXIT ROOM';home.classList.remove('iw-btn--wide');home.classList.add('iw-btn--small','chog-wallet-action','iw-btn--primary');home.querySelector('.iw-btn__icon')?.remove();colorVars(home,'ta',A);this._binds.get(home).accept=()=>r.leave();
    const host=h('div',{class:'chog-hunt-reward-host'});el.prepend(host);
    return {el,initial:open,wrap:true,onBack:()=>r.leave()};
  }
  showModeResults(result,runtime){this._objectiveResult={result,runtime};this.showResults({...result,win:result.winner===runtime.match.local.team,colors:G.teamHex,percents:result.scores,players:runtime.actors.map(a=>({name:a.name,team:a.team,weapon:a.weaponId,turf:Math.round(a.stats.turf),splats:a.stats.splats,deaths:a.stats.deaths,isSelf:a.isLocal,bot:a.isBot})),mapName:runtime.game.mapDef.name});}
  _scr_results(){if(['control','trials'].includes(this._results?.mode))return objectiveResults(this,super._scr_results(),this._objectiveResult);return this._results?.mode==='boss'?adaptRaidResults(this,super._scr_results()):this._results?.mode==='hunt'?this._scr_hunt_results():this._scr_main();}
}
