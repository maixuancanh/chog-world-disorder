import {h} from './ui-util.js';
import {progression} from '../game/chog-progression.js';
import {formatChog} from '../game/hunt-ledger.js';
const coin=new URL('../../assets/chog-airdrop/coin-icon.png',import.meta.url).href;
const fallback=new URL('../../assets/chog-hunt-ui/chog-head-icon-v1.png',import.meta.url).href;
const clamp=t=>Math.max(0,Math.min(1,t));
export function rewardProgress(panel,data){
 const before=Math.max(0,data.totalXp-data.xpGain),start=progression(before);
 const image=h('img',{src:data.nft?.image||fallback,alt:data.nft?.name||'Chog',class:data.nft?'':'is-guest-icon'});
 const level=h('b',{class:'chog-reward-level'},'LEVEL '+start.level),card=h('div',{class:'chog-reward-nft'},image,level);
 const value=h('strong',{'data-reward-balance':''},formatChog(data.balanceBefore));
 const balance=h('div',{class:'chog-reward-balance'},h('img',{src:coin,alt:'CHOG token'}),value,h('b',null,'CHOG'));
 const fill=h('i'),numbers=h('span'),exp=h('div',{class:'chog-reward-exp'},h('div',null,h('b',null,'EXP'),numbers),h('div',{class:'chog-reward-exp__track',role:'progressbar','aria-label':'Match experience'},fill),h('small',null,'+'+data.xpGain+' EXP'));
 const label=h('b',{class:'chog-reward-levelup'},'LEVEL UP!');
 const sheet=h('aside',{class:'chog-reward-sheet'},card,h('h2',null,data.nft?.name||data.name||'YOUR CHOG'),balance,exp,label);
 const flights=h('div',{class:'chog-reward-flights','aria-hidden':'true'});panel.append(sheet,flights);
 const particles=Array.from({length:42},(_,i)=>{const token=i<24,node=token?h('img',{src:coin,alt:''}):h('b',null,'✦');node.className='chog-reward-particle '+(token?'is-coin':'is-exp');flights.append(node);return {node,token,i:token?i:i-24};});
 const sparkles=h('div',{class:'chog-reward-sparkles','aria-hidden':'true'},Array.from({length:14},(_,i)=>h('i',{style:{'--i':i}})));card.append(sparkles);
 return {update(t,source){
   // Coins scatter just before the large coin disappears, then converge on their counters.
   const age=t-4.35,f=clamp((age-.35)/1.25),ease=1-(1-f)**3;
   const p=progression(Math.round(before+data.xpGain*ease));
   value.textContent=formatChog(Math.round(data.balanceBefore+(data.balanceAfter-data.balanceBefore)*ease));
   numbers.textContent=p.xp.toLocaleString('en-US')+' / '+p.nextLevelXp.toLocaleString('en-US');fill.style.width=(p.xp/p.nextLevelXp*100)+'%';
   exp.querySelector('[role=progressbar]').setAttribute('aria-valuenow',p.xp);exp.querySelector('[role=progressbar]').setAttribute('aria-valuemax',p.nextLevelXp);
   level.textContent='LEVEL '+p.level;const up=p.level>start.level;sheet.classList.toggle('is-level-up',up);label.hidden=!up;
   const parent=panel.getBoundingClientRect(),targets={coin:balance.getBoundingClientRect(),exp:exp.getBoundingClientRect()};
   for(const particle of particles){const {node,token,i}=particle,flight=clamp((age-i*.034)/(.78+(i%4)*.045)),visible=age>=i*.034&&flight<1;node.hidden=!visible;if(!visible)continue;
     const r=token?targets.coin:targets.exp,tx=r.left-parent.left+r.width*.45,ty=r.top-parent.top+r.height*.5;
     const sx=source.x+Math.sin(i*2.4)*38,sy=source.y+Math.cos(i*1.7)*35;
     const x=sx+(tx-sx)*flight,y=sy+(ty-sy)*flight-Math.sin(flight*Math.PI)*(80+i%5*12),scale=1.1-flight*.55;
     node.style.transform=`translate3d(${x}px,${y}px,0) rotate(${flight*(token?540:180)}deg) scale(${scale})`;node.style.opacity=String(Math.min(1,flight*8));
   }
   balance.classList.toggle('is-collecting',age>.3&&age<1.7);exp.classList.toggle('is-collecting',age>.3&&age<1.7);
 },dispose(){sheet.remove();flights.remove();}};
}
