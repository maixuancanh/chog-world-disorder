import test from 'node:test';import assert from 'node:assert/strict';
import {RewardLedger} from '../../server/rewards/ledger.mjs';
const make=()=>({code:'CACHE',roundId:'round',verified:true,config:{mode:'hunt'},roster:[{wallet:'alice',nid:0},{wallet:'bob',nid:1}]});
const snapshot=(alice=0,bob=0,phase='playing')=>({core:{roundId:'round',phase,winner:'hunt-0',result:{players:[{id:'hunt-0',left:false},{id:'hunt-1',left:false}]}},players:[['hunt-0',{earned:alice,purchases:0}],['hunt-1',{earned:bob,purchases:0}]]});
function counted(ledger){const raw=ledger.db,counts={calls:0};ledger.db={exec(...args){counts.calls++;return raw.exec(...args);},prepare(...args){counts.calls++;return raw.prepare(...args);},close(){raw.close();}};return counts;}
test('unchanged playing accounting avoids SQL; changed rewards and finish persist immediately',()=>{
 const l=new RewardLedger(':memory:'),room=make();try{l.start(room);const counts=counted(l);l.observe(room,snapshot());assert.ok(counts.calls>0);counts.calls=0;
  for(let i=0;i<20;i++)l.observe(room,snapshot());assert.equal(counts.calls,0);
  l.observe(room,snapshot(25));assert.ok(counts.calls>0);assert.equal(l.account('alice').balance,25);counts.calls=0;l.observe(room,snapshot(25));assert.equal(counts.calls,0);
  l.observe(room,snapshot(25,0,'finished'));assert.equal(l.account('alice').matches,1);assert.equal(l.account('bob').matches,1);assert.equal(l.account('alice').activeRoom,null);
 }finally{l.close();}
});
test('failed multi-actor transaction never advances cache and malformed unchanged snapshots reject',()=>{
 const l=new RewardLedger(':memory:'),room=make();try{l.start(room);l.observe(room,snapshot());const counts=counted(l);
  // Second actor passes integer validation but would overspend; Alice's update rolls back.
  const fail=snapshot(25);fail.players[1][1].purchases=1;assert.throws(()=>l.observe(room,fail),/CHECK/);assert.equal(l.account('alice').balance,0);
  counts.calls=0;l.observe(room,snapshot(25));assert.ok(counts.calls>0);assert.equal(l.account('alice').balance,25);
  const missing=snapshot(25);missing.players.pop();assert.throws(()=>l.observe(room,missing),/Missing/);
  for(const earned of [NaN,-1,1.5,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>l.observe(room,snapshot(earned)),/Invalid/);
  assert.throws(()=>l.observe(room,snapshot(24)),/Invalid/);assert.equal(l.account('alice').balance,25);
 }finally{l.close();}
});
