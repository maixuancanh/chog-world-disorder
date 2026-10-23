import {RaidPoolAdmin} from './chog-raid-pool-admin.js';
import {ChogProgressionAdmin} from './chog-progression-admin.js';
import {ChogModeRegistryAdmin} from './chog-mode-registry-admin.js';
// Lightweight operator page shares wallet authentication, without loading WebGL.
import {h} from './ui-util.js';
import {ChogWalletUI} from './chog-wallet-ui.js';
import {ChogRewardAdmin} from './chog-reward-admin.js';
import {ChogFaucetAdmin} from './chog-faucet-admin.js';
const root=document.getElementById('wallet-setup');
const menu={_identity:null,_binds:new Map(),_scr:{el:root},
 _btn({id,label,cls,accept}){const b=h('button',{type:'button',class:cls,'data-id':id,'data-nav':'1',onclick:accept},h('span',{class:'iw-btn__label'},label));this._binds.set(b,{accept});return b;},
 _setFocus(b){b.focus();},toast(message){wallet.message=message;wallet.repaint();},show(){wallet.repaint();},
 _openModal({title,text,buttons}){this._closeModal();const card=h('div',{class:'iw-modal__card'},h('h2',null,title),h('p',{class:'iw-modal__text'},text),h('div',{class:'iw-modal__btns wallet-picker'},buttons.map((b,i)=>this._btn({id:'modal-'+i,label:b.label,accept:b.accept}))));this._modal=h('dialog',null,card);this._modal.addEventListener('cancel',e=>{e.preventDefault();if(this._modal._onBack)this._modal._onBack();else buttons.at(-1)?.accept();});root.append(this._modal);this._modal.showModal();},
 _closeModal(){if(this._modal){this._modal.querySelectorAll('[data-nav]').forEach(b=>this._binds.delete(b));this._modal.close();this._modal.remove();this._modal=null;}}
};
const wallet=new ChogWalletUI(menu),admin=new ChogRewardAdmin(wallet,root.querySelector('.chog-reward-admin')),faucet=new ChogFaucetAdmin(wallet,root.querySelector('.chog-faucet-admin'));
const progression=new ChogProgressionAdmin(wallet,root.querySelector('.chog-progression-admin'));
const raidPanel=h('section',{class:'chog-wallet-card chog-raid-pool-admin',style:{marginTop:'28px'}});root.append(raidPanel);const raidAdmin=new RaidPoolAdmin(wallet,raidPanel);
const modePanel=h('section',{class:'chog-wallet-card chog-mode-registry-admin',style:{marginTop:'28px'}});root.append(modePanel);const modeAdmin=new ChogModeRegistryAdmin(wallet,modePanel);
const assets=root.querySelector('.chog-wallet-body');
wallet.repaint=()=>{if(wallet.walletModal?.isConnected)return;wallet.clearBindings(assets);const s=menu._identity;assets.replaceChildren(h('section',{class:'chog-wallet-card'},h('h2',null,'OPERATOR WALLET'),h('p',null,s?.address||'Connect the original testCHOG deployment wallet.'),h('div',{class:'chog-wallet-actions'},s?wallet.button('admin-disconnect','DISCONNECT',()=>wallet.disconnect()):wallet.button('admin-connect','CONNECT WALLET',()=>wallet.connect(),true)),wallet.status()));admin.render();faucet.render();progression.render();raidAdmin.render();modeAdmin.render();};
wallet.repaint();admin.refresh().then(()=>{faucet.render();progression.render();raidAdmin.render();modeAdmin.render();}).catch(e=>{wallet.message=e.message;wallet.repaint();});
