import test from 'node:test';import assert from 'node:assert/strict';
import {assertHuntIdentity} from '../../src/game/hunt-policy.js';
import {createHuntRelay} from '../../server/hunt-relay.mjs';
test('launch requires an explicit Guest choice or a completed matching wallet sign-in',()=>{
 for(const identity of [null,undefined,{}, {kind:'other'}])assert.throws(()=>assertHuntIdentity(identity),/GUEST/);
 assert.equal(assertHuntIdentity({kind:'guest'}),true);
 const identity={kind:'wallet',address:'0xAbC'};assert.throws(()=>assertHuntIdentity(identity),/Sign in/);
 assert.throws(()=>assertHuntIdentity(identity,{session:'valid',account:'0xother'}),/Sign in/);
 assert.throws(()=>assertHuntIdentity(identity,{session:'valid',account:'0xabc',pending:true}),/Finish/);
 assert.equal(assertHuntIdentity(identity,{session:'valid',account:'0xabc'}),true);
});
test('room relay rejects anonymous entry and ignores forged Guest NFT eligibility',async()=>{
 const s=createHuntRelay();await new Promise(r=>s.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+s.address().port;
 const call=async(action,data={},token)=>{const r=await fetch(url+'/'+action,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});return r.json();};
 try{assert.match((await call('create')).error,/GUEST/);const host=await call('create',{identity:'guest',canCarry:true,nft:'1462'}),code=host.room.code;assert.match((await call('join',{code})).error,/GUEST/);const room=(await call('start',{code},host.token)).room;assert.equal(room.roster[0].canCarry,false);assert.ok(room.roster.filter(p=>p.bot).every(p=>p.canCarry===true));}finally{await new Promise(r=>s.close(r));}
});
