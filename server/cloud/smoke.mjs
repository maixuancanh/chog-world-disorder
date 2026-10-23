// Isolated runtime acceptance: no real wallet, ledger, rewards or chain writes.
import {createHuntRelay} from '../hunt-relay.mjs';
import {SimulationRunner} from '../rewards/runner.mjs';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {objectiveForToken} from '../../src/game/chog-objectives.js';
export async function smokeCloudWorker(){
 const economy={auth:()=> '0x0000000000000000000000000000000000000001',nftProfile:async()=>({canCarry:true,nftContract:'fixture',nftTokenId:'1',objectiveNft:objectiveForToken('1'),raidWins:0,level:1}),ledger:{account:()=>({balance:0}),start(){},observe(){},abort(){}}};
 const diagnostic=[];const browserLauncher={async launch(options){const browser=await puppeteer.launch(options);const original=browser.newPage.bind(browser);browser.newPage=async()=>{const page=await original();const ticker=setInterval(async()=>{try{const state=await Promise.race([page.evaluate(()=>({stage:document.body?.dataset?.chogBoot,text:document.body?.innerText?.slice(-300),label:document.querySelector('.iw-loading__label')?.textContent,pct:document.querySelector('.iw-progress__pct')?.textContent,bootMs:window.__inkwave?.bootMs,mode:window.__inkwave?.match?.mode,state:window.__inkwave?.match?.state})),new Promise(r=>setTimeout(()=>r({busy:true}),2000))]);let memory=null;try{memory=fs.readFileSync('/sys/fs/cgroup/memory.current','utf8').trim();}catch{}console.log('CHOG smoke boot state '+JSON.stringify({...state,memory}));}catch{}},30000);page.on('close',()=>clearInterval(ticker));page.on('console',message=>{if(message.text().startsWith('CHOG BOOT'))console.log(message.text());});page.on('pageerror',e=>{diagnostic.push(e.message);console.log('CHOG smoke page error '+e.message)});page.on('requestfailed',r=>{diagnostic.push(r.url()+' '+r.failure()?.errorText)});page.on('response',r=>{if(r.status()>=400)diagnostic.push(r.status()+' '+r.url())});return page;};return browser;}};
 const runner=new SimulationRunner({browserLauncher,relayURL:'http://127.0.0.1:8938',maxConcurrent:1,maxQueued:0,startTimeoutMs:180000});
 const server=createHuntRelay({economy,runner});await new Promise(r=>server.listen(8938,'127.0.0.1',r));
 let code,token;const request=async(action,body={})=>{const r=await fetch('http://127.0.0.1:8938/'+action,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({code,...body})});const b=await r.json();if(!r.ok)throw Error(b.error);return b;};
 try{
  const created=await request('create',{verified:true,walletSession:'fixture',name:'Cloud runtime probe',nft:'varsity',weapon:'shooter'});code=created.room.code;token=created.token;
  await request('settings',{mode:'control',mapId:'tidewater',time:'day'});await request('start');
  const started=Date.now();while(Date.now()-started<190000){const b=await request('ready',{ready:true});if(b.room.phase==='playing')break;await new Promise(r=>setTimeout(r,2000));}
  const page=runner.jobs.get(code)?.page;if(!page)throw Error('Cloud worker did not start');
  await page.waitForFunction(()=>__inkwave.match?.objective&&__inkwave.match.state==='playing',{timeout:20000});
  const before=await page.evaluate(()=>__inkwave.match.time);const wall=Date.now();
  await new Promise(r=>setTimeout(r,10000));const after=await page.evaluate(()=>__inkwave.match.time);
  const result={ok:before-after>5,bootMs:wall-started,elapsedMs:Date.now()-wall,simulationSeconds:before-after,workerErrors:runner.jobs.get(code)?.errors||[]};
  console.log('CHOG cloud worker smoke '+JSON.stringify(result));return result;
 }catch(e){console.log('CHOG smoke diagnostic '+JSON.stringify(diagnostic.slice(-12)));throw e;}finally{await runner.closeAll();await new Promise(r=>server.close(r));}
}
