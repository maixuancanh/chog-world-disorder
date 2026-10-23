import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {createHuntRelay} from '../../server/hunt-relay.mjs';import {SimulationRunner} from '../../server/rewards/runner.mjs';
test('relay exposes queue position, retains waiting rooms, starts next worker, aborts full/cancelled queues',async()=>{let clock=0;const locked=new Set(),aborted=[];
 const economy={auth:t=>t||'wallet',nftProfile:async()=>({canCarry:true,level:1}),ledger:{account:()=>({balance:0}),start:r=>locked.add(r.code),abort:r=>{locked.delete(r.code);aborted.push(r.code);}}};
 const runner=new SimulationRunner({relayURL:'http://fixture',executablePath:'fixture',maxConcurrent:1,maxQueued:1,browserLauncher:{async launch(){const b=new EventEmitter();b.close=async()=>b.emit('disconnected');b.newPage=async()=>({on(){},async setViewport(){},async evaluateOnNewDocument(){},async goto(){},async waitForFunction(){}});return b;}}});
 const server=createHuntRelay({economy,runner,now:()=>clock});await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const req=async(action,data={},token)=>fetch(url+'/'+action,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)}).then(r=>r.json());
 const enter=async name=>req('create',{verified:true,walletSession:name,name});
 try{const a=await enter('A'),b=await enter('B'),c=await enter('C');assert.equal((await req('start',{code:a.room.code},a.token)).room.phase,'loading');const waiting=await req('start',{code:b.room.code},b.token);assert.equal(waiting.room.phase,'queued');assert.equal(waiting.room.simulation.position,1);assert.equal(waiting.room.go,false);assert.equal((await req('capacity')).active,1);
 clock=200000;server.rooms.get(a.room.code).players.get(a.id).seen=clock;server.rooms.get(a.room.code).simulator.seen=clock;server.rooms.get(b.room.code).players.get(b.id).seen=clock;assert.equal((await req('sync',{code:b.room.code},b.token)).room.phase,'queued');assert.ok(locked.has(b.room.code));
 const more=await enter('C2');assert.match((await req('start',{code:more.room.code},more.token)).error,/queue is full/);await new Promise(r=>setImmediate(r));assert.equal(locked.has(more.room.code),false);
 await req('leave',{code:a.room.code},a.token);await new Promise(r=>setTimeout(r,10));const next=await req('sync',{code:b.room.code},b.token);assert.equal(next.room.phase,'loading');assert.notEqual(next.room.simulation.state,'queued');assert.equal(next.room.go,false);await req('leave',{code:b.room.code},b.token);assert.equal(locked.size,0);
 }finally{await runner.closeAll();await new Promise(r=>server.close(r));}
});
