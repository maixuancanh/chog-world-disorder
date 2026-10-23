import {normalizeProgress,progression,matchExperience} from './chog-progression.js';
// Internal game accounting in milli-CHOG. This module never invokes a wallet.
// Browser persistence is for the local game; withdrawals require a trusted server ledger.
const valid=n=>Number.isSafeInteger(n)&&n>=0;
export const formatChog=milli=>(milli/1000).toLocaleString('en-US',{maximumFractionDigits:3});
export class HuntLedger {
 constructor(storage=globalThis.localStorage,account='guest'){
  this.storage=storage;this.account=String(account||'guest').toLowerCase();
  this.key=`chog.game.balance.v1:${this.account}`;
 }
 read(){
  const raw=this.storage.getItem(this.key);if(!raw)return {balance:0,rounds:{}};
  let data;try{data=JSON.parse(raw)}catch{throw Error('Game balance data is unreadable. No changes were saved.');}
  if(!valid(data.balance)||!data.rounds||typeof data.rounds!=='object'||Array.isArray(data.rounds))throw Error('Game balance data is invalid.');
  return data;
 }
 get data(){return this.read();}
 get balance(){return this.read().balance;}
 get progress(){return normalizeProgress(this.read().progress);}
 update(operation){
  // Read immediately before every mutation so another view cannot overwrite newer entries.
  const data=this.read(),changed=operation(data);if(!changed)return false;
  if(!valid(data.balance))throw Error('Game balance exceeds the supported range.');
  this.storage.setItem(this.key,JSON.stringify(data));return true;
 }
 round(data,id){
  if(!Object.hasOwn(data.rounds,id))Object.defineProperty(data.rounds,id,{value:{earned:0,claimed:false,buys:[]},enumerable:true,writable:true,configurable:true});
  return data.rounds[id];
 }
 creditMatch(roundId,cumulativeEarned){
  if(!roundId||!valid(cumulativeEarned))return false;
  return this.update(data=>{const r=this.round(data,roundId);if(r.claimed||cumulativeEarned<=r.earned)return false;
   data.balance+=cumulativeEarned-r.earned;r.earned=cumulativeEarned;return true;});
 }
 buyAmmo(roundId,purchase){
  if(!roundId||!Number.isInteger(purchase)||purchase<1||purchase>2)return false;
  return this.update(data=>{const r=this.round(data,roundId);if(r.claimed||r.buys.includes(purchase)||purchase!==r.buys.length+1||data.balance<3000)return false;
   data.balance-=3000;r.buys.push(purchase);return true;});
 }
 claim(result,id){
  const row=result?.players?.find(p=>p.id===id);
  if(!result?.roundId||!row||row.left||!valid(row.earned)||!valid(row.bonus)||row.total!==row.earned+row.bonus)return false;
  return this.update(data=>{const r=this.round(data,result.roundId);if(r.claimed||r.earned>row.earned)return false;
   data.balance+=row.earned-r.earned+row.bonus;r.earned=row.earned;r.claimed=true;const p=normalizeProgress(data.progress),won=result.mode==='boss'?!!row.won:result.winner===id;data.lastExperience={roundId:result.roundId,...matchExperience(won,false,row.activity||{})};data.progress=progression(p.totalXp+matchExperience(won,false,row.activity||{}).total,p.matches+1,p.wins+(won?1:0));return true;});
 }
}
