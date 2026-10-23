import {hudMarkup} from './hunt-menus.js';
export class HUD{
 constructor(root){this.el=document.createElement('div');this.el.className='hunt-live-hud';this.el.hidden=true;root.append(this.el);}
 setVisible(on){this.el.hidden=!on;}update(dt,frame){if(frame?.hunt)this.el.innerHTML=hudMarkup(frame.hunt);else this.el.hidden=true;}
 setPractice(){}setAccent(){}setInputMode(){}setPaused(){}feed(){}banner(){}countdown(){}hideSplatted(){}splatted(){}hit(){}damage(){}setMinimap(){}setPrompt(){}judge(){return Promise.resolve();}dispose(){this.el.remove();}
}
