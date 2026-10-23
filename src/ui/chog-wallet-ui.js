import {huntStatIcons} from './chog-icons.js';
import {GLYPHS} from './ui-icons.js';
import {normalizeProgress} from '../game/chog-progression.js';
import {claimTen} from './chog-faucet.js';
import {ChogRewardAccount} from './chog-reward-account.js';
import { h } from './ui-util.js';
import {normalizedChogId} from '../game/chog-roster-ids.js';
import {G} from '../core/ctx.js';
import { HuntLedger, formatChog } from '../game/hunt-ledger.js';
import { TESTNET, discoverWallets, connectTestWallet, ensureTestnet, walletError, loadDeployment, getDemoWalletAssets, getChogNftProfile, claimDemoAsset } from './chog-wallet.js';

const avatar=new URL('../../assets/chog-testnet/avatar.webp',import.meta.url).href;
const guestAvatar=new URL('../../assets/chog-hunt-ui/guest-avatar.png',import.meta.url).href;
const short=a=>a?`${a.slice(0,6)}…${a.slice(-4)}`:'—';

export class ChogWalletUI {
  constructor(menu){this.menu=menu;this.epoch=0;this.busy=false;this.message='';this.provider=null;this.rewards=new ChogRewardAccount(this);}
  button(id,label,action,primary=false){
    const button=this.menu._btn({id,label,cls:`iw-btn--small chog-wallet-action ${primary?'iw-btn--primary':''}`,accept:()=>{if(!this.busy)action();}});
    button.disabled=this.busy;return button;
  }
  repaint(){
    if(this.walletModal?.isConnected)return;
    const panel=this.menu._scr?.el.querySelector('.chog-identity');if(panel)this.renderIdentity(panel);
    const locker=this.menu._scr?.el.querySelector('.chog-wallet-body');if(locker)this.renderLocker(locker);
  }
  clearBindings(panel){panel.querySelectorAll('[data-nav]').forEach(el=>this.menu._binds.delete(el));}
  status(){return h('p',{class:'chog-wallet-status',role:'status','aria-live':'polite'},this.message);}
  gameLedger(){return new HuntLedger(globalThis.localStorage,this.menu._identity?.address||'guest');}
  gameBalance(){if(this.menu._identity?.kind==='wallet')return this.rewards.token?this.rewards.balance:null;try{return this.gameLedger().balance}catch{return null;}}
  async signIn(){await this.rewards.login(this.provider,this.menu._identity.address);this.message='Signed in. Server game balance loaded.';}
  async withdraw(){
    if(this.busy)return;
    const state=this.menu._identity;if(state?.kind!=='wallet')return;
    if(!this.rewards.token){await this.run(()=>this.signIn(),false);if(!this.rewards.token)return;}
    let loaded=false;await this.run(async()=>{await this.rewards.refresh();this.rewards.config=await this.rewards.request('status');loaded=true;},false);
    if(!loaded||this.menu._identity!==state)return;
    const r=this.rewards,c=r.config;if(!c)return;
    const pending=r.pending,amount=pending?.amount??r.balance,canWithdraw=!!c.vault&&!c.error&&!r.activeRoom&&(!!pending||r.balance>0);
    const buttons=[{label:pending?'RETRY WITHDRAWAL':'WITHDRAW',cls:'iw-btn--primary',accept:()=>{if(!canWithdraw||this.busy)return;this.menu._closeModal();this.run(async progress=>{progress('Confirm withdrawal in your wallet.');const hash=await r.withdraw();progress('Withdrawal confirmed: '+TESTNET.explorer+'/tx/'+hash);this.menu.toast('Withdrawal confirmed.');},false);}},{label:'CLOSE',accept:()=>this.menu._closeModal()}];
    this.menu._openModal({title:'WITHDRAW',text:null,buttons});const modal=this.menu._modal;modal.classList.add('chog-withdraw-menu');modal.querySelector('.iw-modal__splat')?.remove();modal.setAttribute('role','dialog');modal.setAttribute('aria-label','Withdraw CHOG');
    const card=modal.querySelector('.iw-modal__card'),actions=modal.querySelector('.iw-modal__btns');
    card.insertBefore(h('div',{class:'chog-withdraw-balance'},h('small',null,pending?'RESERVED WITHDRAWAL':'AVAILABLE BALANCE'),h('div',null,h('img',{src:new URL('../../assets/chog-airdrop/coin-icon.png',import.meta.url).href,alt:'CHOG token'}),h('strong',{'data-withdraw-balance':''},formatChog(amount)),h('span',null,'CHOG'))),actions);
    card.insertBefore(h('dl',{class:'chog-withdraw-details'},h('dt',null,'To wallet'),h('dd',{title:state.address},short(state.address)),h('dt',null,'Network'),h('dd',null,'Monad testnet')),actions);
    const note=c.error?'Connection unavailable. Try again shortly.':r.activeRoom?'Finish your match before withdrawing.':!c.vault?'Withdrawals are not available yet.':!amount?'No CHOG available to withdraw.':pending?'This amount is reserved. Retry the existing withdrawal.':'Gas paid in testnet MON.';
    card.insertBefore(h('p',{class:'chog-withdraw-note',role:'status'},note),actions);
    const submit=modal.querySelector('[data-id="modal-0"]');submit.disabled=!canWithdraw;
    if(!canWithdraw)this.menu._setFocus(modal.querySelector('[data-id="modal-1"]'),{snap:true});
    const close=this.menu._btn({id:'withdraw-close',label:'×',cls:'chog-claim-close',accept:()=>this.menu._closeModal()});close.setAttribute('aria-label','Close withdrawal');card.append(close);modal._onBack=()=>this.menu._closeModal();
  }
  renderIdentity(panel){
    this.clearBindings(panel);panel.classList.add('chog-identity');
    const state=this.menu._identity;
    if(!state){
      panel.classList.add('is-entry');
      panel.replaceChildren(this.button('connect-wallet','CONNECT WALLET',()=>this.connect(),true),this.button('guest','GUEST',()=>{this.menu._identity={kind:'guest'};this.message='';this.repaint();}),this.status());return;
    }
    panel.classList.remove('is-entry');
    const guest=state.kind==='guest',nft=state.nft;
    panel.replaceChildren(h('div',{class:`chog-avatar-frame ${guest?'is-guest':'is-nft'}`},h('img',{src:guest?guestAvatar:nft?.image||avatar,alt:guest?'Guest Chog':nft?.name||'Chog'})),h('div',{class:'iw-profile__info'},
      h('div',{class:'iw-profile__name'},guest?'GUEST':nft?.name||short(state.address)),
      h('div',{class:'chog-game-balance'},h('span',null,guest?'PRACTICE BALANCE':'GAME BALANCE'),h('strong',{'data-game-balance':'',role:'status'},this.gameBalance()===null?'—':`${formatChog(this.gameBalance())} CHOG`))));
    panel.append(this.progressView(guest?null:nft));
    const actions=h('div',{class:'chog-wallet-actions'});if(!guest&&this.gameBalance()>0)actions.append(this.button('game-withdraw','WITHDRAW',()=>this.withdraw(),true));
    if(!guest){
      actions.append(this.button('profile-claim','CLAIM',()=>this.openClaims(),true),this.button('profile-watch-token','ADD TOKEN',()=>this.addToken()));
    }else actions.append(this.button('profile-connect','CONNECT WALLET',()=>this.connect()));
    actions.append(this.button('change-account',guest?'BACK':'DISCONNECT',()=>this.disconnect()));panel.append(actions);if(nft&&!guest)panel.append(this.syncStatus(nft));
    if(state.error)panel.append(h('p',{class:'chog-wallet-status'},state.error));
  }
  openClaims(){
    const state=this.menu._identity;if(state?.kind!=='wallet'||this.busy)return;
    const choose=action=>()=>{this.menu._closeModal();this.claimModal=null;action();};
    const rows=[{label:'10 CHOG',sub:'Daily wallet tokens',icon:huntStatIcons[0],accept:choose(()=>this.claimTen())},{label:state.hasClaimed?'NFT CLAIMED':'1 NFT',sub:state.hasClaimed?'Already received':'One NFT per wallet',icon:GLYPHS.star,disabled:!!state.hasClaimed,accept:choose(()=>this.claimNft())},{label:'MON TESTNET',sub:'Get gas from Monad faucet',icon:'<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" aria-hidden="true"><path d="M4 27h16M7 27V5h12v22M9 9h8v7H9zM19 12h4l4 4v8a2 2 0 0 1-4 0v-5M23 5l5 5v5"/></svg>' ,accept:choose(()=>window.open(TESTNET.faucet,'_blank','noopener,noreferrer'))},{label:'MATCH REWARDS',sub:this.rewards.unclaimed?.length?this.rewards.unclaimed.length+' completed '+(this.rewards.unclaimed.length===1?'match':'matches'):'No rewards to claim',icon:GLYPHS.crown,disabled:!this.rewards.unclaimed?.length,accept:choose(()=>this.run(async progress=>{for(const row of [...this.rewards.unclaimed])await this.rewards.claim(row.roundId);await this.rewards.refresh();progress('Match rewards claimed.');this.menu.toast('Match rewards claimed.');},false))}];
    this.menu._openModal({title:'CLAIM',text:'Choose your reward.',buttons:rows});const modal=this.claimModal=this.menu._modal;modal.classList.add('chog-claim-menu');modal.querySelector('.iw-modal__splat')?.remove();modal.setAttribute('role','dialog');modal.setAttribute('aria-label','Claim rewards');
    rows.forEach((row,i)=>{const b=modal.querySelector(`[data-id="modal-${i}"]`);b.classList.add('chog-claim-option');b.disabled=!!row.disabled;b.querySelector('.iw-btn__label').replaceChildren(h('i',{class:'chog-claim-icon',html:row.icon}),h('span',null,h('b',null,row.label),h('small',null,row.sub)));});
    const close=this.menu._btn({id:'claim-close',label:'×',cls:'chog-claim-close',accept:()=>{this.menu._closeModal();this.claimModal=null;}});close.setAttribute('aria-label','Close rewards');modal.querySelector('.iw-modal__card').append(close);modal._onBack=()=>this.menu._binds.get(close)?.accept();
  }
  syncStatus(nft){const p=this.rewards.nftProgress.get(String(nft.tokenId));let text='nft exp loading…';if(p?.error)text='nft exp sync unavailable';else if(p){text=p.onchainError?'nft exp sync unavailable':!p.registry?'nft exp saved · onchain setup pending':p.syncPending?(p.autoSyncError?'nft exp saved · auto sync waiting':'nft exp syncing automatically…'):'nft exp saved onchain';if(p.registry&&p.automaticSync===false&&p.syncPending)text='nft exp saved · auto sync upgrade pending';}return h('small',{class:'chog-exp-sync chog-profile-sync',role:'status'},text);}
  ensureNftProgress(tokenId){const r=this.rewards,key=String(tokenId);if(r.nftProgress.has(key)){r.pollProgress(key);return;}if(!r.token||r.progressLoading.has(key))return;const session=r.token;r.progressLoading.add(key);r.loadNftProgress(key).catch(e=>{if(r.token===session)r.nftProgress.set(key,{error:walletError(e)});}).finally(()=>{r.progressLoading.delete(key);this.repaint();});}
  progressView(nft){
    const guest=this.menu._identity?.kind==='guest';let p;
    if(nft){this.ensureNftProgress(nft.tokenId);p=this.rewards.nftProgress.get(String(nft.tokenId));}else p=guest?{...this.gameLedger().progress,lastExperience:this.gameLedger().data.lastExperience}:this.rewards.progress;
    const box=h('div',{class:'chog-profile-progress','data-progress-token':nft?.tokenId||'',role:'status'});
    if(!p||p.error){box.append(h('small',null,p?.error||'Loading EXP…'));return box;}
    p={...normalizeProgress(p),...p};const percent=Math.max(0,Math.min(100,p.xp/p.nextLevelXp*100));
    box.append(h('div',{class:'chog-profile-progress__head'},h('strong',{'data-nft-level':''},'LEVEL '+p.level),h('span',{'data-nft-xp':''},p.xp.toLocaleString('en-US')+' / '+p.nextLevelXp.toLocaleString('en-US')+' EXP')),h('div',{class:'chog-profile-progress__track',role:'progressbar','aria-label':nft?'NFT experience':'Player experience','aria-valuemin':'0','aria-valuemax':String(p.nextLevelXp),'aria-valuenow':String(p.xp)},h('i',{style:{width:percent+'%'}})),h('div',{class:'chog-profile-stats'},h('span',{'aria-label':p.matches+' matches'},h('i',{html:GLYPHS.gamepad}),' '+p.matches+' '+(p.matches===1?'match':'matches')),h('span',{'aria-label':p.wins+' wins'},h('i',{html:GLYPHS.crown}),' '+p.wins+' '+(p.wins===1?'win':'wins'))));
    if(p.lastExperience)box.append(h('small',{class:'chog-last-exp',title:p.lastExperience.breakdown.map(r=>`${r.label}: +${r.xp} EXP`).join(' · ')},'LAST MATCH +'+p.lastExperience.total+' EXP'));
    
    return box;
  }
  requirePlayer(){
    const state=this.menu._identity;
    if(!state||!['guest','wallet'].includes(state.kind)){this.menu.toast('Connect your wallet or choose GUEST in Profile before playing.');return false;}
    if(this.busy||this.walletModal?.isConnected){this.menu.toast('Finish signing in before playing.');return false;}
    if(state.kind==='wallet'&&(!this.rewards.token||this.rewards.account!==state.address?.toLowerCase())){this.menu.toast('Sign in with your wallet before playing.');return false;}
    return true;
  }
  async claimNft(){return this.run(async progress=>{
    const state=this.menu._identity,epoch=this.epoch;if(state?.kind!=='wallet'||!state.config)throw Error('Connect and sign in with your wallet first.');
    if(state.hasClaimed)throw Error('This wallet has already claimed its NFT.');
    const hash=await claimDemoAsset('nft',this.provider,state.address,state.config,progress);
    if(epoch!==this.epoch||state!==this.menu._identity)return;
    await this.refresh();if(epoch!==this.epoch||state!==this.menu._identity)return;
    if(!state.nft)throw Error('NFT claim confirmed. Refresh Profile to load your NFT.');
    this.menu.api?.setProfileStyle?.({...this.menu._profile().style,chogNft:state.nft.sourceTokenId||state.nft.tokenId});
    this.lastNftClaim=hash;this.message='NFT received. You can now be selected as Carrier at match start.';this.menu.toast(this.message);
  },false);}
  async claimTen(){return this.run(async progress=>{const result=await claimTen(this.rewards,progress);progress('10 testCHOG received in your wallet.');this.menu.toast('10 testCHOG received in your wallet.');this.lastFaucetClaim=result;},true);}
  async addToken(){return this.run(async()=>{const config=this.menu._identity?.config;if(!config)throw Error('Token configuration unavailable.');await ensureTestnet(this.provider);const added=await this.provider.request({method:'wallet_watchAsset',params:{type:'ERC20',options:{address:config.token,symbol:'testCHOG',decimals:18}}});if(added===false)throw Error('Token request cancelled.');this.menu.toast('Token added to wallet.');},false);}
  detach(){if(this.provider&&this.walletHandlers)for(const [event,handler] of Object.entries(this.walletHandlers))this.provider.removeListener?.(event,handler);this.walletHandlers=null;}
  watchWallet(provider,address){
    const invalidate=()=>{if(this.provider!==provider)return;this.epoch++;this.detach();this.rewards.logout();this.provider=null;this.menu._identity=null;this.busy=false;this.message='Wallet changed. Please reconnect.';if(this.walletModal?.isConnected){const modal=this.walletModal;modal.querySelector('.iw-modal__text').textContent=this.message;const buttons=modal.querySelector('.iw-modal__btns');this.clearBindings(buttons);const retry=this.menu._btn({id:'wallet-retry',label:'RECONNECT',cls:'iw-btn--primary',accept:()=>{this.menu._closeModal(true);this.walletModal=null;this.connect();}});buttons.replaceChildren(retry);this.menu._setFocus(retry,{snap:true});}this.repaint();};
    this.walletHandlers={
      // Providers can deliver the initial connect/switch notifications late.
      // Only an actual change away from the selected identity invalidates sign-in.
      accountsChanged:accounts=>{if(!Array.isArray(accounts)||accounts[0]?.toLowerCase()!==address.toLowerCase())invalidate();},
      chainChanged:chain=>{if(Number(chain)!==TESTNET.chainId)invalidate();},
      disconnect:invalidate,
    };
    for(const [event,handler] of Object.entries(this.walletHandlers))provider.on?.(event,handler);
  }
  disconnect(){this.epoch++;this.detach();this.rewards.logout();this.provider=null;this.menu._identity=null;this.nftPreview=null;this.nftProfiles=null;this.message='';this.repaint();}
  async chooseWallet(){
    const found=await discoverWallets();
    if(!found.length)throw new Error('No wallet detected. Install a compatible wallet and reload.');
    return new Promise(resolve=>{
      const menu=this.menu;
      menu._openModal({title:'CHOOSE WALLET',text:'Select a wallet to sign in.',buttons:found.map(w=>({label:w.name,accept:()=>resolve(w.provider)}))});
      const modal=this.walletModal=menu._modal;modal.classList.add('chog-wallet-picker');
      modal.querySelector('.iw-modal__splat')?.remove();
      const close=menu._btn({id:'wallet-close',label:'×',cls:'chog-wallet-close',accept:()=>{this.epoch++;this.detach();this.rewards.logout();this.provider=null;this.menu._identity=null;this.message='';menu._closeModal();this.walletModal=null;resolve(null);this.busy=false;this.repaint();}});
      close.setAttribute('aria-label','Close wallet selection');modal.querySelector('.iw-modal__card').append(close);modal._onBack=()=>menu._binds.get(close).accept();
      found.forEach((w,i)=>{const button=modal.querySelector(`[data-id="modal-${i}"]`);button.classList.add('chog-wallet-tile');button.setAttribute('aria-label',w.name);const label=button.querySelector('.iw-btn__label');label.replaceChildren(w.icon?h('img',{src:w.icon,alt:'',class:'chog-wallet-logo',referrerpolicy:'no-referrer'}):h('span',{class:'chog-wallet-logo-fallback'},w.name[0]),h('small',null,w.name));});
    });
  }
  walletProgress(message,success=false){
    const modal=this.walletModal;if(!modal?.isConnected)return;
    modal.querySelector('.iw-modal__text').textContent=message;
    if(success){const buttons=modal.querySelector('.iw-modal__btns');this.clearBindings(buttons);const ok=this.menu._btn({id:'wallet-signin-ok',label:'OK',cls:'iw-btn--primary',accept:()=>{this.menu._closeModal();this.walletModal=null;this.message='';this.menu.show('main',{wipe:false,force:true});}});buttons.replaceChildren(ok);this.menu._setFocus(ok,{snap:true});}
    else modal.querySelectorAll('.chog-wallet-tile').forEach(b=>b.disabled=true);
  }
  async connect(){
    if(this.busy)return;
    this.detach();this.nftPreview=null;this.nftProfiles=null;this.busy=true;const epoch=++this.epoch;this.message='';
    try{
      const provider=await this.chooseWallet();if(epoch!==this.epoch||!provider)return;
      this.walletProgress('Confirm the connection and sign-in request in your wallet.');
      const address=await connectTestWallet(provider);if(epoch!==this.epoch)return;
      this.provider=provider;this.menu._identity={kind:'wallet',address};
      this.watchWallet(provider,address);
      this.walletProgress('Confirm Sign in in your wallet.');
      await this.signIn();if(epoch!==this.epoch)return;
      this.walletProgress('Reading your NFT and game balance…');
      await this.refresh();if(epoch!==this.epoch)return;
      this.walletProgress('Signed in successfully. Press OK to continue.',true);
    }catch(error){if(epoch===this.epoch){this.menu._identity=null;this.detach();this.rewards.logout();this.provider=null;this.message=walletError(error);const modal=this.walletModal;if(modal){modal.querySelector('.iw-modal__text').textContent=this.message;const buttons=modal.querySelector('.iw-modal__btns');this.clearBindings(buttons);const retry=this.menu._btn({id:'wallet-retry',label:'TRY AGAIN',cls:'iw-btn--primary',accept:()=>{this.menu._closeModal(true);this.walletModal=null;this.connect();}});buttons.replaceChildren(retry);this.menu._setFocus(retry,{snap:true});}else this.menu.toast(this.message);}}
    finally{if(epoch===this.epoch){this.busy=false;if(!this.walletModal)this.repaint();}}
  }
  async refresh(){
    const state=this.menu._identity,epoch=this.epoch;
    if(state?.kind!=='wallet'||!this.provider)return;
    this.message='Reading assets from Monad testnet…';this.repaint();
    try{
      const config=await loadDeployment();
      const assets=config?await getDemoWalletAssets({address:state.address,provider:this.provider,config}):{};
      if(epoch!==this.epoch||state!==this.menu._identity)return;
      // Replace, rather than retain, prior ownership and balance on every successful read.
      Object.assign(state,{config,nft:null,tokenBalance:undefined,error:null},assets);
      const equipped=localStorage.getItem(this.nftKey());if(equipped&&state.nft?.ownedTokenIds.includes(equipped)&&state.nft.tokenId!==equipped)state.nft=await getChogNftProfile({address:state.address,tokenId:equipped,provider:this.provider,config});
      if(state.nft&&this.rewards.token)try{await this.rewards.loadNftProgress(state.nft.tokenId);}catch(e){this.rewards.nftProgress.set(String(state.nft.tokenId),{error:walletError(e)});}
      this.message=config?'Assets verified on Monad testnet.':'Demo contracts have not been deployed. Open MY NFT to set up.';
    }catch(error){if(epoch===this.epoch&&state===this.menu._identity){state.nft=null;state.tokenBalance=undefined;state.error=walletError(error);this.message=state.error;}}
    this.repaint();
  }
  async run(operation,refresh=true){
    if(this.busy)return;this.busy=true;const epoch=this.epoch;this.repaint();
    try{await operation(message=>{if(epoch===this.epoch){this.message=message;this.repaint();}});if(refresh&&epoch===this.epoch)await this.refresh();}
    catch(error){if(epoch===this.epoch){this.message=walletError(error);this.menu.toast(this.message,{kind:'error'});}}
    finally{this.busy=false;this.repaint();}
  }
  async readNft(id){const state=this.menu._identity,epoch=this.epoch;const profile=await getChogNftProfile({address:state.address,tokenId:id,provider:this.provider,config:state.config});if(epoch!==this.epoch||state!==this.menu._identity)throw Error('Wallet changed.');return profile;}
  async loadNftPreviews(ids){
    if(this.loadingNfts)return;this.loadingNfts=true;const epoch=this.epoch;
    try{for(const id of ids){if(epoch!==this.epoch)break;if(!this.nftProfiles?.has(id)){const profile=await this.readNft(id);(this.nftProfiles||=new Map()).set(id,profile);this.repaint();}}}catch(error){if(epoch===this.epoch)this.message=walletError(error);}finally{this.loadingNfts=false;}
  }
  nftKey(){const s=this.menu._identity;return 'chog.equipped:'+s?.address?.toLowerCase()+':'+s?.config?.nft?.toLowerCase();}
  async equipNft(nft){
    const state=this.menu._identity;if(!state||!nft)return;
    // Recheck ownership at the point of equipping, never trust the preview cache.
    await this.run(async()=>{const verified=await getChogNftProfile({address:state.address,tokenId:nft.tokenId,provider:this.provider,config:state.config});if(this.menu._identity!==state)return;
      if(this.rewards.token)try{await this.rewards.loadNftProgress(verified.tokenId);}catch(e){this.rewards.nftProgress.set(String(verified.tokenId),{error:walletError(e)});}if(this.menu._identity!==state)return;state.nft=verified;localStorage.setItem(this.nftKey(),verified.tokenId);this.menu.api.setProfileStyle?.({...this.menu._profile().style,chogNft:verified.sourceTokenId||verified.tokenId});this.message='';
    },false);
  }
  renderLocker(body){
    this.clearBindings(body);body.classList.add('chog-nft-armory');
    const state=this.menu._identity,nft=state?.nft,ids=nft?.ownedTokenIds||[],selected=this.nftPreview&&ids.includes(this.nftPreview.tokenId)?this.nftPreview:nft;
    const key=selected?.tokenId||'empty',enter=body._nftKey!==key;body._nftKey=key;body._selectedNft=selected;
    const title=h('h2',{class:'iw-display'},selected?.name||'YOUR CHOG');
    for(const hd of body._portraits||[])hd?.cancel?.();body._portraits=[];
    const list=h('div',{class:'iw-lgrid iw-lgrid--bust chog-nft-list',style:{'--cols':5}});
    if(nft)(this.nftProfiles||=new Map()).set(nft.tokenId,nft);if(ids.some(id=>!this.nftProfiles?.has(id)))this.loadNftPreviews(ids);
    // Ten native locker tiles per page; additional NFTs stay reachable without hiding owned assets.
    const pages=Math.max(1,Math.ceil(ids.length/10));this.nftPage=Math.min(this.nftPage||0,pages-1);
    const pageIds=ids.slice(this.nftPage*10,this.nftPage*10+10);
    for(let i=0;i<10;i++){
      const id=pageIds[i],profile=this.nftProfiles?.get(id),name=profile?.name||'CHOG #'+id;
      const art=h('span',{class:'iw-ltile__art'});
      const tile=h('button',{class:'iw-ltile iw-ltile--bust chog-nft-tile'+(id===key?' is-on':'')+(id?'':' is-empty'),type:'button','aria-label':id?name:'Empty NFT slot','aria-pressed':String(!!id&&id===key)},
        id?h('span',{class:'iw-ltile__blob chog-nft-tile__sign'},this.menu._headingSign()):null,art,
        id?h('span',{class:'iw-ltile__name'},name):h('span',{class:'chog-nft-empty',html:'<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="9"/><path d="M26 75 74 25" fill="none" stroke="currentColor" stroke-width="9"/></svg>'}),
        id?h('span',{class:'iw-ltile__eq',html:GLYPHS.check}):null);
      if(id){this.menu._bind(tile,{id:'nft-'+id,accept:()=>this.run(async()=>{const next=this.nftProfiles?.get(id)||await this.readNft(id);if(state===this.menu._identity)this.nftPreview=next;},false)});this.menu._fx(tile,{tilt:12});tile._nftProfile=profile;}else tile.disabled=true;
      list.append(tile);
    }
    const traits=h('div',{class:'chog-nft-stat-list'}),bars=[];
    for(const [i,a] of (selected?.attributes||[]).entries()){
      const percent=Math.max(0,Math.min(100,Number(a.percent)||0));
      const bar=h('span',{class:'iw-stat__bar is-up',style:{'--v':enter?'0':String(percent/100)}},h('i',{class:'iw-stat__fill'}),h('i',{class:'iw-stat__ticks'}));bars.push({bar,percent});
      traits.append(h('div',{class:'iw-stat chog-nft-stat',style:{'--i':i}},h('span',{class:'iw-stat__label'},String(a.trait_type)),h('strong',null,String(a.value)),bar,h('small',null,Number.isInteger(a.count)?`${a.count.toLocaleString('en-US')} · ${percent}%`:'')));
    }
    const detail=h('section',{class:'iw-wd iw-panel chog-nft-details'+(enter?' chog-nft-enter':'')},h('div',{class:'chog-nft-details__head'},selected?h('div',{class:'chog-avatar-frame is-nft'},h('img',{src:selected.image,alt:selected.name||'NFT'})):null,h('div',null,h('span',{class:'iw-wd__kind'},'NFT TRAITS'),title)),traits);
    const collection=this.menu._panel('iw-lpanel chog-nft-collection',h('section',{class:'iw-lsec'},h('div',{class:'iw-lsec__title'},h('span',null,'CHOOSE YOUR CHOG'),h('small',null,`${ids.length} NFT`)),list));
    if(pages>1)collection.append(h('div',{class:'chog-nft-pages'},this.button('nft-prev','◀',()=>{this.nftPage=(this.nftPage+pages-1)%pages;this.renderLocker(body);}),h('span',null,`${this.nftPage+1} / ${pages}`),this.button('nft-next','▶',()=>{this.nftPage=(this.nftPage+1)%pages;this.renderLocker(body);})));
    if(selected)collection.append(this.progressView(selected));
    if(ids.length>1){const equipped=selected?.tokenId===nft?.tokenId,button=this.button('equip-nft',equipped?'EQUIPPED':'EQUIP NFT',()=>this.equipNft(selected),true);button.disabled=this.busy||equipped;collection.append(button);}
    if(!state||state.kind!=='wallet')collection.append(this.button('nft-connect','CONNECT WALLET',()=>this.connect(),true));
    else if(!nft){collection.append(h('p',null,'No NFT in this wallet.'));if(state.config&&!state.hasClaimed)collection.append(this.button('nft-claim','CLAIM NFT',()=>this.run(progress=>claimDemoAsset('nft',this.provider,state.address,state.config,progress)),true));}
    if(this.message&&/error|failed|cancel|changed|unavailable/i.test(this.message))collection.append(this.status());
    body.replaceChildren(collection,detail);
    requestAnimationFrame(()=>{if(body.isConnected)this.renderLockerPortraits(body);});
    if(enter)requestAnimationFrame(()=>requestAnimationFrame(()=>{if(body.isConnected&&body._nftKey===key)for(const {bar,percent} of bars)bar.style.setProperty('--v',String(percent/100));}));
    // Repainting balances must not restart the turntable or its entrance.
    if(body.isConnected)this.showLockerPreview(body,selected);
  }
  renderLockerPortraits(body){
    const sc=G.game?.showcase;if(!sc?.portrait)return;
    for(const tile of body.querySelectorAll('.chog-nft-tile:not(.is-empty)')){
      const profile=tile._nftProfile;if(!profile)continue;
      const model=this.lockerModel(profile);
      const hd=sc.portrait({style:{...this.menu._profile().style,chogNft:model},color:G.teamColors?.[0]||'#843de8',kind:'body',size:224,weapon:this.menu._loadout().weapon},cv=>{
        if(!cv||!tile.isConnected)return;
        const pic=h('span',{class:'iw-ltile__pic'});pic.append(cv);tile.querySelector('.iw-ltile__art').replaceChildren(pic);tile.classList.add('has-pic');
      });body._portraits.push(hd);
    }
  }
  lockerModel(nft){return normalizedChogId(nft?.sourceTokenId)||normalizedChogId(nft?.name)||normalizedChogId(nft?.tokenId)||'varsity';}
  showLockerPreview(body,selected=body._selectedNft){
    const sc=G.game?.showcase;if(!sc)return;
    if(!selected){sc.hide();body._modelKey=null;return;}
    const exact=normalizedChogId(selected.sourceTokenId)||normalizedChogId(selected.name)||normalizedChogId(selected.tokenId),model=exact||'varsity';
    const hint=body.closest('.chog-nft-locker')?.querySelector('.iw-lspin span');if(hint)hint.textContent=exact?'DRAG TO SPIN':'CHOG PREVIEW · DRAG TO SPIN';
    if(body._modelKey===model&&sc.mode==='locker')return;
    body._modelKey=model;
    sc.showLocker({...this.menu._profile().style,chogNft:model},G.teamColors?.[0]||'#843de8',this.menu._loadout().weapon);
  }
}
