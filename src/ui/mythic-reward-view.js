import {rewardProgress} from './chog-reward-progress.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { MythicRewardStage,MYTHIC_TIMING } from '../game/mythic-reward-stage.js';

/** Standalone viewer or disposable full-screen overlay in the existing game. */
export async function mountMythicReward(host,{onClose=()=>{},autoPlay=false,rewardData=null,CharacterClass=null,onOpen=null,onComplete=null}={}){
 const panel=document.createElement('section');panel.className='mythic-view'+(rewardData?' chog-reward-presentation '+(rewardData.win?'is-victory':'is-defeat'):'');panel.setAttribute('aria-label','Mythic chest reward');
 panel.innerHTML=`<div class="mythic-canvas"></div><header class="mythic-header"><button class="mythic-leave" type="button">LEAVE</button><div><span>CHOG WORLD</span><h1>MYTHIC REWARD</h1></div></header><div class="mythic-loading" role="status">Preparing your chest...</div><footer class="mythic-footer"><button class="mythic-open" type="button" disabled>OPEN CHEST</button><p class="mythic-status" aria-live="polite"></p></footer>`;
 host.append(panel);let dead=false,raf=0,stage;const assets=[],geometry=[];
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:!!rewardData});renderer.setPixelRatio(Math.min(devicePixelRatio,1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;panel.querySelector('.mythic-canvas').append(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#3966a3');scene.fog=new THREE.Fog('#739bb6',17,38);const camera=new THREE.PerspectiveCamera(39,1,.1,80);const origin=new THREE.Vector3(5.3,5.0,8.4),target=new THREE.Vector3(0,1.6,0);camera.position.copy(origin);camera.lookAt(target);
 scene.add(new THREE.HemisphereLight('#dceeff','#443967',2));const sun=new THREE.DirectionalLight('#fff0d9',3);sun.position.set(-4,8,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:1,far:25});sun.shadow.bias=-.0003;sun.shadow.normalBias=.025;scene.add(sun);const fill=new THREE.DirectionalLight('#bb98ff',1.2);fill.position.set(3,4,-4);scene.add(fill);
 const ownMat=color=>{const m=new THREE.MeshStandardMaterial({color,roughness:.78});assets.push(m);return m;},stone=ownMat('#77728b'),trim=ownMat('#aaa2ac'),leaf=ownMat('#455b62'),banner=ownMat('#65469a');
 const mesh=(g,m,p)=>{geometry.push(g);const o=new THREE.Mesh(g,m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;scene.add(o);return o;};
 const floor=mesh(new THREE.CylinderGeometry(4.9,5.3,.35,12),stone,[0,-.19,0]);
 mesh(new THREE.CylinderGeometry(5.05,5.05,.09,12),trim,[0,-.02,0]);
 // Terrace rail and soft distant foliage frame the reward without covering it.
 for(const x of [-3.6,3.6]){mesh(new THREE.BoxGeometry(.65,1.15,.65),stone,[x,.55,-2.3]);mesh(new THREE.BoxGeometry(.84,.16,.84),trim,[x,1.14,-2.3]);mesh(new THREE.CylinderGeometry(.045,.045,3.8,8),trim,[x,3.0,-2.6]);mesh(new THREE.BoxGeometry(.9,1.45,.035),banner,[x+.44,3.25,-2.6]);}
 mesh(new THREE.BoxGeometry(7.2,.15,.26),trim,[0,.72,-2.6]);mesh(new THREE.BoxGeometry(7.2,.15,.34),trim,[0,.12,-2.6]);
 for(let i=0;i<14;i++)mesh(new THREE.BoxGeometry(.10,.55,.12),stone,[-3.25+i*.5,.4,-2.6]);
 for(let i=0;i<20;i++){const x=-8+i*.84;mesh(new THREE.IcosahedronGeometry(.65+(i%3)*.11,1),leaf,[x,.4+(i%2)*.2,-4.0-(i%3)*.35]);}
 // Distant smooth blue landforms, comparable to the reward terrace in the clip.
 const hill=ownMat('#668aa1');for(let i=0;i<9;i++){const h=mesh(new THREE.SphereGeometry(2,12,8),hill,[-16+i*4.2,-1,-12-(i%2)*2]);h.scale.set(1.7,.6+(i%3)*.25,1);h.castShadow=false;}
 const cloud=ownMat('#aec7d5');for(let i=0;i<10;i++){const o=mesh(new THREE.SphereGeometry(1,12,8),cloud,[-16+i*3.9,5.0+(i%3)*.7,-17]);o.scale.set(2.5,.35,.6);o.castShadow=false;}
 if(rewardData){scene.background=null;scene.fog=null;for(const item of scene.children)if(item.isMesh)item.visible=false;renderer.setClearColor(0x000000,0);}
 const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.7,.5,1.15);composer.addPass(bloom);composer.addPass(new OutputPass());
 const status=panel.querySelector('.mythic-status'),button=panel.querySelector('.mythic-open');let last=0,paused=false,character=null,progress=null,opening=false,completed=false,ambient=0,landed=false;
 function resize(){const w=panel.clientWidth||innerWidth,h=panel.clientHeight||innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w/h<1?52:39;camera.updateProjectionMatrix();if(rewardData)camera.setViewOffset(w,h,w*.22,-h*.09,w,h);composer.setSize(w,h);}
 const ro=new ResizeObserver(resize);ro.observe(panel);resize();
 function render(){const b=stage?stage.t-MYTHIC_TIMING.burst:-10,shake=b>=0&&b<.35?(1-b/.35)*.035:0;camera.position.copy(origin).add(new THREE.Vector3(Math.sin(b*71)*shake,Math.cos(b*93)*shake,0));camera.lookAt(target);composer.render();}
 function presentation(dt=0){
  if(!stage||!rewardData)return;
  const age=stage.t-(MYTHIC_TIMING.reward+MYTHIC_TIMING.rewardSeconds),won=!!rewardData.win,k=THREE.MathUtils.clamp(age/.7,0,1),visualT=stage.t+ambient;
  if(character){
   character.root.visible=age>=0;
   if(age<0&&landed){landed=false;character.setDance(won?null:'defeat');}
   const falling=won&&age>=0&&age<.5;
   if(age>=0&&!landed&&!falling){landed=true;if(won){character.trigger('land',9);character.setDance('victory');}}
   // Original results entrance: winners drop onto the drum; losers ride up, already slumped.
   character.root.position.y=stage.top+(won?(falling?3.1*(1-(age/.5)**2):0):-.7+(1-(1-k)**3)*.7);
   const squash=won&&age>=.5?1-.12*Math.sin((age-.5)*14)*Math.exp(-(age-.5)*6):1;
   character.root.scale.set(2.3/Math.sqrt(squash),2.3*squash,2.3/Math.sqrt(squash));
   character.update(dt||1/60,{time:visualT,speed:0,localMove:{x:0,z:0},grounded:!falling,vy:falling?-24.8*age:0,aimPitch:0,firing:false,charge:0,form:'kid',ink:1,hp:1});
   character.root.rotation.y=Math.atan2(origin.x,origin.z);
   if(age>=0){
    stage.aura.material.opacity=.18+.045*Math.sin(visualT*2.8);stage.light.intensity=4.5+1.25*Math.sin(visualT*2.2);
    stage.rings.forEach(({pivot,mesh},i)=>{pivot.rotation.y=visualT*(i%2?-1.6:1.25)+i*2;pivot.position.y=stage.top+.12+(i===1?.48:0)+Math.sin(visualT*2+i)*.06;mesh.material.opacity=.55+.15*Math.sin(visualT*2.5+i);});
   }
  }
  stage.group.updateMatrixWorld(true);const v=stage.coin.getWorldPosition(new THREE.Vector3()).project(camera);
  progress?.update(stage.t,{x:(v.x*.5+.5)*panel.clientWidth,y:(.5-v.y*.5)*panel.clientHeight});
  if(stage.t>=6.4&&!completed){completed=true;onComplete?.();}
 }
 const closedText='';function sync(){if(!stage)return;const phase=stage.phase;const active=stage.playing||(paused&&stage.t>0&&stage.t<MYTHIC_TIMING.end);button.disabled=active;button.textContent=stage.t>=MYTHIC_TIMING.end?'REPLAY':'OPEN CHEST';button.style.visibility=active?'hidden':'visible';status.textContent=stage.rewardVisible?'CHOG':closedText;status.style.opacity=stage.rewardVisible?'1':'0';}
 async function start(){if(!stage||stage.playing||opening)return;opening=true;button.disabled=true;try{if(onOpen)await onOpen(rewardData);completed=false;ambient=0;landed=false;character?.setDance(rewardData?.win?null:rewardData?'defeat':null);stage.play();sync();}catch(error){status.textContent=error.message;status.style.opacity='1';}finally{opening=false;}return stage.playing;}
 button.addEventListener('click',start);
 function frame(now){if(dead)return;raf=requestAnimationFrame(frame);const dt=last?Math.min(.05,(now-last)/1000):0;if(stage&&!paused){stage.update(dt);if(stage.t>=MYTHIC_TIMING.end)ambient+=dt;sync();}last=now;presentation(paused?0:dt);render();}raf=requestAnimationFrame(frame);
 function dispose(){if(dead)return;dead=true;cancelAnimationFrame(raf);ro.disconnect();character?.dispose();progress?.dispose();stage?.dispose();for(const a of assets)a.dispose();for(const g of geometry)g.dispose();for(const pass of composer.passes)pass.dispose?.();composer.dispose();sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();panel.remove();}
 panel.querySelector('.mythic-leave').onclick=()=>{dispose();onClose();};
 try{stage=await MythicRewardStage.create();if(dead){stage.dispose();return null;}scene.add(stage.group);if(rewardData){progress=rewardProgress(panel,rewardData);if(CharacterClass){character=new CharacterClass({name:rewardData.name||'reward',color:'#843de8',weapon:rewardData.weapon||'shooter',style:{chogNft:rewardData.model||'varsity'},isLocal:false});stage.group.add(character.root);character.root.visible=false;character.setDance(rewardData.win?null:'defeat');}}panel.querySelector('.mythic-loading').remove();button.disabled=false;if(autoPlay)start();sync();}
 catch(e){panel.querySelector('.mythic-loading').textContent='Could not load reward assets. Please reload.';dispose();throw e;}
 return {stage,scene,camera,renderer,composer,character,rewardData,play:start,dispose,seek(t){paused=true;ambient=0;stage.seek(t);sync();presentation();render();},resume(){paused=false;},snapshot(){return stage.snapshot();},panel};
}
