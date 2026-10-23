import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HuntLedger} from '../../src/game/hunt-ledger.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)}};
test('accounts start at zero; wallet and guest balances remain separate',()=>{
 const s=memory(),guest=new HuntLedger(s,'guest'),a=new HuntLedger(s,'0xABC');
 assert.equal(a.balance,0);assert.equal(guest.balance,0);
 a.creditMatch('round-1',3100);assert.equal(new HuntLedger(s,'0xabc').balance,3100);assert.equal(guest.balance,0);
});
test('loot can pay for ammo immediately; result claim only settles unpaid earnings and bonus',()=>{
 const l=new HuntLedger(memory(),'guest');l.creditMatch('r',1000);l.creditMatch('r',3200);
 assert.equal(l.balance,3200);assert.ok(l.buyAmmo('r',1));assert.equal(l.balance,200);
 assert.equal(l.buyAmmo('r',1),false);
 const result={roundId:'r',players:[{id:'me',earned:3200,bonus:20000,total:23200,left:false}]};
 assert.ok(l.claim(result,'me'));assert.equal(l.balance,20200);assert.equal(l.claim(result,'me'),false);
});
test('catch-up claim, reloading, and duplicate credits cannot mint twice',()=>{
 const s=memory(),a=new HuntLedger(s,'guest');a.creditMatch('r',100);
 const b=new HuntLedger(s,'guest');assert.ok(b.claim({roundId:'r',players:[{id:'me',earned:500,bonus:2000,total:2500}]},'me'));
 assert.equal(a.creditMatch('r',500),false);assert.equal(a.balance,2500);
});
test('reject invalid values, insufficient funds, excessive purchases and departed player claims',()=>{
 const l=new HuntLedger(memory(),'guest');assert.equal(l.creditMatch('r',NaN),false);assert.equal(l.creditMatch('r',-.1),false);
 assert.equal(l.buyAmmo('r',1),false);l.creditMatch('r',10000);
 assert.equal(l.buyAmmo('r',3),false);assert.ok(l.buyAmmo('r',1));assert.ok(l.buyAmmo('r',2));assert.equal(l.balance,4000);
 assert.equal(l.claim({roundId:'x',players:[{id:'me',left:true,earned:5,bonus:2000,total:2005}]},'me'),false);
});
test('a storage failure never reports a successful credit or debit',()=>{
 const l=new HuntLedger({getItem:()=>null,setItem:()=>{throw Error('full')}},'guest');
 assert.throws(()=>l.creditMatch('r',1000),/full/);assert.equal(l.balance,0);
});

test('completed claims grow player level once, without seeding or resetting token balance',()=>{const l=new HuntLedger(memory(),'guest');assert.equal(l.progress.level,1);const result={roundId:'win',winner:'me',players:[{id:'me',earned:0,bonus:20000,total:20000}]};assert.ok(l.claim(result,'me'));assert.equal(l.progress.level,2);assert.equal(l.progress.xp,50);assert.equal(l.balance,20000);assert.equal(l.claim(result,'me'),false);assert.equal(l.progress.matches,1);});
