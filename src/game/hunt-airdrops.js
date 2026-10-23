import * as THREE from 'three';
import {fitChestCollider,releaseChestCollider} from './chest-collision.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {chestLocations} from './chog-world-chests.js';
import {dropPose,dropRoll} from './hunt-airdrop-rules.js';
import {G} from '../core/ctx.js';
let cached;
export function prepareAirdrops(){
 if(!cached){const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);cached=Promise.all(['chest','parachute','fragments'].map(n=>loader.loadAsync(new URL('../../assets/chog-airdrop/'+n+'.glb',import.meta.url).href))).then(models=>models.map(m=>m.scene)).catch(e=>{cached=null;throw e;});}
 return cached;
}
const V=THREE.Vector3;
export class HuntAirdrops {
 constructor(runtime,sources){this.r=runtime;this.sources=sources;this.entries=[];this.disposed=false;this.waves=[];}
 spawn(wave,layout=null){
  if(this.disposed||this.waves.includes(wave))return;this.waves.push(wave);
  const amounts=layout?layout.map(e=>e.amount):dropRoll(),sites=layout?layout.map(e=>e.point):chestLocations(G.level,G.nav,G.physics,80).filter(p=>this.r.world.entries.every(e=>!e.active||Math.hypot(e.point.x-p.x,e.point.z-p.z)>2.7)&&this.entries.every(e=>e.phase==='done'||Math.hypot(e.point.x-p.x,e.point.z-p.z)>3));
  if(sites.length<amounts.length)throw Error('Not enough safe supply chest landing sites');
  amounts.forEach((amount,i)=>{
   const point=sites[i],group=new THREE.Group(),chest=this.sources[0].clone(true),parachute=this.sources[1].clone(true),id=`drop-${wave}-${i}`;
   group.name=id;chest.name='Supply chest';parachute.name='Supply parachute';group.add(chest,parachute);group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});G.scene.add(group);
   const entry={id,point,group,chest,parachute,amount,phase:'falling',age:0,seed:layout?layout[i].seed:Math.random()*6.28,openAge:0,pieces:[],materials:[],active:true};
   this.r.core.addDrop(id,amount);this.entries.push(entry);this.pose(entry);
  });
  this.r.ui.message(`SUPPLY DROP · ${amounts.length} CHESTS`);
 }
 pose(e){const p=dropPose(e.age,e.seed);e.group.position.set(e.point.x+p.x,e.point.y+p.y+.025,e.point.z+p.z);e.group.rotation.set(p.pitch,0,p.roll);e.parachute.visible=p.parachute;
  if(p.landed&&e.phase==='falling'){e.phase='grounded';e.collider=fitChestCollider(G.level,e.chest);G.fx?.spawnFlash(e.group.position,new THREE.Color('#ffb32d'));G.audio?.play('step_dry',{pos:e.group.position,volume:.6,pitch:.7});}}
 nearest(pos,radius=2.5){let found=null,distance=radius;for(const e of this.entries){if(e.phase!=='grounded'||Math.abs(pos.y-e.point.y)>1.2)continue;const d=Math.hypot(pos.x-e.point.x,pos.z-e.point.z);
  if(d<distance&&G.physics.los(pos.clone().add(new V(0,.8,0)),e.group.position.clone().add(new V(0,.5,0)))){found=e;distance=d;}}return found;}
 open(actor,e,visualOnly=false){
  if(e.phase!=='grounded'||!visualOnly&&!this.r.core.beginDrop(actor.huntId,e.id))return false;e.phase='opening';e.opener=actor.huntId;e.openAge=0;releaseChestCollider(e.collider);e.chest.visible=false;e.parachute.visible=false;
  const fragments=this.sources[2].clone(true);e.fragments=fragments;e.group.add(fragments);const roots=fragments.children;
  roots.forEach((mesh,i)=>{const rest=mesh.position.clone(),angle=Math.atan2(rest.z,rest.x),speed=1.5+(i%4)*.2;e.pieces.push({mesh,rest,rot:mesh.quaternion.clone(),velocity:new V(Math.cos(angle)*speed,2.7+(i%3)*.3,Math.sin(angle)*speed),spin:new V((i%3-1)*2,(i%2?1:-1)*3,2)});});
  fragments.traverse(m=>{if(m.isMesh){const clone=mat=>{const c=mat.clone();c.transparent=false;e.materials.push(c);return c;};m.material=Array.isArray(m.material)?m.material.map(clone):clone(m.material);}});
  e.coin=this.r.world.coinSource.clone(true);e.coin.position.set(0,.85,0);e.group.add(e.coin);e.coinScale=e.coin.scale.clone();
  e.halo=new THREE.PointLight('#ffcf76',3.5,4,2);e.halo.name='Supply coin warm glow';e.group.add(e.halo);
  const flashPos=e.group.position.clone().add(new V(0,.55,0));G.fx?.burst(flashPos,new V(0,1,0),new THREE.Color('#ffca57'),{count:22,speed:3,size:.08});G.audio?.play('splat_big',{pos:e.group.position,volume:.65});
  return true;
 }
 update(dt){
  if(this.disposed)return;
  for(const e of this.entries){
   if(e.phase==='falling'){e.age+=dt;this.pose(e);continue;}
   if(e.phase!=='opening'&&e.phase!=='flying')continue;e.openAge+=dt;
   if(e.phase==='opening'){
    const t=e.openAge;
    for(const p of e.pieces){p.mesh.position.copy(p.rest).addScaledVector(p.velocity,t);p.mesh.position.y=Math.max(.02,p.rest.y+p.velocity.y*t-4.9*t*t);p.mesh.rotation.set(p.spin.x*t,p.spin.y*t,p.spin.z*t);}
    for(const m of e.materials){if(t>.6&&!m.transparent){m.transparent=true;m.depthWrite=false;m.needsUpdate=true;}m.opacity=Math.max(0,1-(t-.6)/.7);}
    e.coin.position.y=.85+.65*Math.min(1,t/.35)+Math.sin(t*4)*.08;e.coin.rotation.y=t*4;e.coin.scale.copy(e.coinScale).multiplyScalar(Math.min(1,t/.2));
    e.halo.position.copy(e.coin.position);e.halo.intensity=Math.min(1,t/.2)*3.5;
    if(t>=2){e.coin.visible=false;e.halo.visible=false;e.fragments.visible=false;e.phase='flying';
     if(e.opener===this.r.local)this.r.ui.flyCoin(e.group.position.clone().add(new V(0,1.5,0)),e.amount);
    }
   }
   if(e.openAge>=2.65){this.r.core.finishDrop(e.opener,e.id);e.phase='done';e.active=false;e.group.removeFromParent();for(const m of e.materials)m.dispose();e.materials=[];e.halo.dispose();}
  }
 }
 dispose(){this.disposed=true;for(const e of this.entries){releaseChestCollider(e.collider);e.group.removeFromParent();for(const m of e.materials)m.dispose();if(e.phase!=='done')e.halo?.dispose();}this.entries=[];}
}
