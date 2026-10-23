import { h } from './ui-util.js';
import { GLYPHS } from './ui-icons.js';
import { bossStatIcons } from './chog-icons.js';
import { TESTNET } from './chog-wallet.js';
import { objectiveFromNft } from '../game/chog-objectives.js';
import { workshopIdentity, workshopOptions, defaultWorkshopSkill, resolveWorkshopSkill, loadWorkshopSkill, saveWorkshopSkill } from '../game/skill-workshop.js';

// Reuse in-flight reads across redraws without retaining another wallet's state.
const modeReads=new WeakMap();
function modeRead(rewards,action,body){
  let cache=modeReads.get(rewards);if(!cache){cache=new Map();modeReads.set(rewards,cache);}
  const key=JSON.stringify([rewards.token,action,body]),old=cache.get(key);
  if(old&&Date.now()-old.at<1500)return old.promise;
  if(cache.size>=32)cache.clear();
  const promise=rewards.request(action,body);cache.set(key,{at:Date.now(),promise});
  promise.catch(()=>{if(cache.get(key)?.promise===promise)cache.delete(key);});return promise;
}
function syncMessage(node,message,hash){
  node.replaceChildren(document.createTextNode(message));
  if(/^0x[\da-f]{64}$/i.test(hash||''))node.append(' ',h('a',{href:TESTNET.explorer+'/tx/'+hash,target:'_blank',rel:'noopener noreferrer'},'VIEW TRANSACTION'));
}
// A modal can be replaced directly by navigation, so its polling follows its DOM lifetime.
function modalPollLifetime(modal){
  let timer=null,stopped=false;const stop=()=>{stopped=true;clearTimeout(timer);observer.disconnect();};
  const observer=new MutationObserver(()=>{if(!modal.isConnected)stop();});observer.observe(document.body,{childList:true,subtree:true});
  return {alive:()=>!stopped&&modal.isConnected,later:fn=>{clearTimeout(timer);if(!stopped)timer=setTimeout(fn,5000);},stop};
}
export const modeName=id=>id==='control'?'TRAIT CONTROL':'DAILY TRIALS';
export function openModeChooser(menu){
  const launch=mode=>{if(!menu.chogWallet.requirePlayer())return;menu._closeModal(true);menu._lobbyKind=mode;menu._go('lobby');};
  menu._openModal({title:'CHOOSE MODE',text:'Three stations. A daily challenge. Your NFT skill.',buttons:[
    {label:'TRAIT CONTROL',accept:()=>launch('control')},
    {label:'DAILY TRIALS',accept:()=>launch('trials')},
    {label:'SKILL WORKSHOP',accept:()=>{menu._closeModal(true);openSkillWorkshop(menu);}},
    {label:'BACK',accept:()=>menu._closeModal()},
  ]});menu._modal.classList.add('chog-mode-modal');menu._modal.querySelector('.iw-modal__splat').replaceChildren(menu._headingSign());
}
export function openSkillWorkshop(menu){
  const raw=menu._identity?.nft,nft=raw?{...raw,...objectiveFromNft(raw),contract:raw.contract||menu._identity?.config?.nft||menu.chogWallet.rewards.config?.nft}:null;
  const progress={identity:workshopIdentity(nft),wins:0};
  let recipe=loadWorkshopSkill(localStorage,nft,progress)||defaultWorkshopSkill(nft);
  let recipeDirty=false,saving=false,syncText=raw?'Saved locally until an onchain save is confirmed.':'Guest skills are saved on this device.',syncHash=null,syncRun=0;
  menu._openModal({title:'SKILL WORKSHOP',text:'A fixed-budget skill saved for the current NFT.',buttons:[
    {label:'SAVE SKILL',accept:async()=>{
      if(saving)return;recipeDirty=true;
      let valid;try{valid=saveWorkshopSkill(localStorage,recipe,nft,progress);localStorage.setItem('chog.raid.skill:'+raw?.tokenId,'workshop');menu._workshopProgress={...progress};}catch(e){menu.toast(e.message);return;}
      const rewards=menu.chogWallet.rewards;
      if(!raw||!rewards.token){menu.toast(raw?'Skill saved locally. Sign in to save onchain.':'Guest skill saved.');menu._closeModal();return;}
      const session=rewards.token,run=++syncRun;saving=true;syncText='Saving onchain…';syncHash=null;render();
      const active=()=>lifetime.alive()&&rewards.token===session&&run===syncRun;
      const show=data=>{const state=data.recipeSync||data;syncHash=state.transactionHash||null;syncText=state.error?'Saved locally. Onchain save pending: '+state.error:state.confirmed?'Skill saved onchain.':'Saving onchain…';render();return !!state.confirmed;};
      const poll=async()=>{if(!active())return;try{const data=await modeRead(rewards,'mode-profile',{tokenId:raw.tokenId});if(!active())return;const state=data.recipeSync||data;if(savedHash&&String(state.recipeHash||'').toLowerCase()!==savedHash.toLowerCase()){if(data.error){syncText='Saved locally. Onchain save needs retry: '+data.error;render();return;}lifetime.later(poll);return;}if(show(data))return;}catch(e){if(!active())return;syncText='Saved locally. Onchain status unavailable: '+e.message;render();}if(active())lifetime.later(poll);};
      let savedHash;
      try{const data=await rewards.request('workshop-save',{tokenId:raw.tokenId,recipe:valid});if(!active())return;savedHash=data.recipeHash;if(!show(data))lifetime.later(poll);}
      catch(e){if(active()){syncText='Saved locally. Onchain save failed: '+e.message;render();}}
      finally{saving=false;}
    }},
    {label:'LOAD SAVED',accept:()=>{recipeDirty=true;recipe=loadWorkshopSkill(localStorage,nft,progress)||defaultWorkshopSkill(nft);render();}},
    {label:'BACK',accept:()=>{menu._closeModal(true);openModeChooser(menu);}},
  ]});
  const modal=menu._modal;modal.classList.add('chog-workshop-modal');modal.querySelector('.iw-modal__splat').replaceChildren(menu._headingSign());
  const lifetime=modalPollLifetime(modal);
  const body=h('div',{class:'chog-workshop-body'});modal.querySelector('.iw-modal__btns').before(body);
  const render=()=>{
    const focusId=menu._focus?.dataset?.id;
    for(const b of body.querySelectorAll('[data-nav]'))menu._binds.delete(b);
    body.replaceChildren(h('div',{class:'iw-seclabel'},raw?`${raw.name||'CHOG'} · NFT #${raw.tokenId}`:'GUEST SKILL'));
    const options=workshopOptions(nft,progress);
    for(const [field,key,title] of [['effect','effects','EFFECT'],['target','targets','TARGET'],['modifier','modifiers','MODIFIER']]){
      const row=h('div',{class:'chog-workshop-options'},h('div',{class:'iw-seclabel'},title));
      for(const option of options[key]){
        const b=menu._btn({id:`skill-${field}-${option.id}`,label:option.name,sub:`${option.cost}/${options.budget} · ${({mend:'+18 HP',empower:'+12% · 4s',ward:'−15% · 4s',self:'Self',nearby:'Squad · 8m',steady:'18s recharge',quick:'12s · Lower power',focused:'+Power · 24s',lasting:'+2s · 22s'})[option.id]}`,icon:({heart:bossStatIcons[2],bolt:GLYPHS.star,shield:bossStatIcons[1],person:GLYPHS.users,group:GLYPHS.users,clock:GLYPHS.clock})[option.icon]||GLYPHS.star,cls:'iw-btn--small',accept:()=>{recipeDirty=true;recipe={...recipe,[field]:option.id};render();}});
        b.disabled=option.unlocked===false;b.classList.toggle('is-selected',recipe[field]===option.id);b.setAttribute('aria-label',option.name+'. '+option.description);b.title=option.description+(b.disabled?option.traitValid===false?' · Requires matching NFT trait':` · Requires ${option.requiredWins} wins`:'');row.append(b);
      }body.append(row);
    }
    const facts=h('p',{class:'iw-modal__text',role:'status'});
    try{const resolved=resolveWorkshopSkill(recipe,nft,progress);facts.textContent=`${resolved.name} · ${resolved.effect==='mend'?resolved.amount+' HP':Math.round(resolved.amount*100)+'%'} · ${resolved.target==='self'?'Self':resolved.radius+'m squad'}${resolved.duration?' · '+resolved.duration+'s':''} · ${resolved.cooldown}s cooldown · Budget ${resolved.cost}/${options.budget}`;}
    catch(e){facts.textContent=e.message;}
    body.append(facts);
    const sync=h('p',{class:'iw-modal__text',role:'status'});syncMessage(sync,syncText,syncHash);body.append(sync);
    const focused=[...body.querySelectorAll('[data-id]')].find(b=>b.dataset.id===focusId);if(focused)menu._setFocus(focused,{snap:true});
  };render();
  if(raw&&menu.chogWallet.rewards.token){
    const rewards=menu.chogWallet.rewards,session=rewards.token;
    Promise.allSettled([rewards.request('raid-profile',{tokenId:raw.tokenId}),modeRead(rewards,'mode-profile',{tokenId:raw.tokenId})]).then(([history,profile])=>{
      if(!lifetime.alive()||rewards.token!==session)return;
      progress.wins=history.status==='fulfilled'&&Number.isSafeInteger(history.value.wins)?history.value.wins:0;
      if(!recipeDirty&&!saving){
        const data=profile.status==='fulfilled'?profile.value:null;
        let loadedOnchain=false;
        if(data?.recipe){try{recipe=saveWorkshopSkill(localStorage,data.recipe,nft,progress);loadedOnchain=true;}catch{recipe=loadWorkshopSkill(localStorage,nft,progress);}}
        else recipe=loadWorkshopSkill(localStorage,nft,progress);
        const state=data?.recipeSync||data;
        if(loadedOnchain&&state?.confirmed){syncText='Skill saved onchain.';syncHash=state.transactionHash||null;}
        else if(state?.pending||data?.syncPending){syncText='Onchain skill save pending.';syncHash=state.transactionHash||null;}
        else if(state?.error){syncText='Saved locally. Onchain save failed: '+state.error;syncHash=state.transactionHash||null;}
      }
      render();
      if(history.status==='rejected')menu.toast('Win history unavailable. Default skill remains usable.');
    });
  }
}
export function objectivePause(menu,screen,r){
  const mode=r.core.mode;
  screen.el.querySelector('.iw-pmatch__tag').textContent=modeName(mode);
  const labels=mode==='control'?['RED','BLUE','STATIONS','TIME']:['SCORE','PROGRESS','TIME','SKILL'];
  const stats=[...screen.el.querySelectorAll('.iw-pstat')];
  stats.forEach((el,i)=>{el.querySelector(':scope > small').textContent=labels[i];el.querySelector(':scope > i').innerHTML=[bossStatIcons[0],bossStatIcons[1],GLYPHS.target||GLYPHS.star,GLYPHS.clock][i];});
  const refresh=()=>{const c=r.uiState(),values=mode==='control'?[Math.floor(c.scores[0]),Math.floor(c.scores[1]),c.stations.filter(s=>s.owner===r.match.local.team).length,Math.ceil(c.time)]:[c.score,c.objectiveProgress,Math.ceil(c.time),Math.ceil(c.skillCooldown||0)+'s'];stats.forEach((el,i)=>{el.querySelector('b').textContent=values[i];});};
  const tick=screen.tick;screen.tick=dt=>{tick?.(dt);refresh();};refresh();
  return screen;
}
export function objectiveResults(menu,screen,context){
  const {result:r,runtime}=context,el=screen.el;
  const won=r.mode==='trials'?r.completed:r.winner===runtime.match.local.team;
  el.querySelector('.iw-res__title').textContent=r.winner===null&&r.mode==='control'?'DRAW':won?'MISSION COMPLETE':'MISSION FAILED';
  el.querySelector('.iw-res__meta').textContent=`${modeName(r.mode)} · ${String(r.reason||'').replaceAll('-',' ').toUpperCase()}`;
  el.querySelector('.iw-res__splat')?.replaceChildren(menu._headingSign());
  el.querySelectorAll('.iw-res__cover,.iw-xp,.iw-res__medals,.iw-res__tag').forEach(n=>n.remove());
  const summary=h('div',{class:'iw-panel chog-objective-summary iw-in iw-in--up'},h('div',{class:'iw-seclabel'},r.mode==='control'?'FINAL SCORE':'DAILY CHALLENGE'),h('b',{class:'iw-display'},r.mode==='control'?`${Math.floor(r.scores[0])} — ${Math.floor(r.scores[1])}`:String(r.score||0)),h('p',null,r.mode==='trials'?`${r.completed?'Completed':'Not completed'} · ${r.challenge?.id||r.challenge?.name||''}`:'First to 100 · Three stations'));
  el.querySelector('.iw-res__head').append(summary);
  const rewards=menu.chogWallet?.rewards,tokenId=menu._identity?.nft?.tokenId,session=rewards?.token;
  let pollTimer=null,closed=false;const oldDestroy=screen.destroy;
  screen.destroy=()=>{closed=true;clearTimeout(pollTimer);oldDestroy?.call(screen);};
  if(session&&tokenId!=null&&r.roundId){
    const status=h('p',{class:'iw-modal__text',role:'status'},'Checking onchain record…');summary.append(status);
    const active=()=>!closed&&rewards.token===session;
    const poll=async()=>{
      if(!active())return;
      try{const data=await modeRead(rewards,'mode-record',{roundId:r.roundId,tokenId});if(!active())return;
        syncMessage(status,data.confirmed?'Record saved onchain.':data.error?'Onchain record pending: '+data.error:data.pending?'Saving onchain…':data.registry?'No verified onchain record for this round.':'Onchain registry unavailable.',data.transactionHash);
        if(data.confirmed||(!data.pending&&!data.error))return;
      }catch(e){if(!active())return;syncMessage(status,'Onchain status unavailable: '+e.message);}
      if(active())pollTimer=setTimeout(poll,5000);
    };void poll();
  }else summary.append(h('p',{class:'iw-modal__text'},'Local result · No onchain record.'));
  const replay=el.querySelector('[data-id="rematch"]'),home=el.querySelector('[data-id="home"]');
  replay.querySelector('.iw-btn__label').textContent='PLAY AGAIN';home.querySelector('.iw-btn__label').textContent='MAIN MENU';
  menu._binds.get(replay).accept=async()=>{menu._lobbyKind=r.mode;await runtime.leave?.();menu.show('lobby');};
  menu._binds.get(home).accept=async()=>{await runtime.leave?.();menu.show('main');};
  screen.onBack=async()=>{await runtime.leave?.();menu.show('main');};return screen;
}
