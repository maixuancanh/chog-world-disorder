import * as THREE from 'three';
import {G} from '../core/ctx.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const kinds=new Set(['shooter','twins','spinner','charger','blaster']);
const base=new URL('../../assets/chog-weapons-v1/',import.meta.url);
let manifestPromise;
const cache=new Map(),ready=new Map();
function asset(kind){
 if(!cache.has(kind))cache.set(kind,(async()=>{
  const manifest=await (manifestPromise??=fetch(new URL('manifest.json',base)).then(r=>{if(!r.ok)throw new Error('Weapon manifest '+r.status);return r.json();}));
  const gltf=G.renderer?.isSimulationRenderer?{scene:new THREE.Group()}:await new GLTFLoader().loadAsync(new URL(kind+'.glb',base).href);
  gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.frustumCulled=false;}});
  const loaded={model:gltf.scene,spec:manifest[kind]};ready.set(kind,loaded);return loaded;
 })());
 return cache.get(kind);
}
export const hasChogWeapon=kind=>kinds.has(kind);
export async function prepareChogWeapons(){await Promise.all([...kinds].map(asset));}
export function installChogWeapon(w,kind){
 if(!kinds.has(kind))return;
 const install=({model,spec})=>{
  w.chogShells=w.off.children.filter(o=>o!==w.muzzle);
  const visual=model.clone(true);visual.name='chog-weapon-'+kind;w.off.add(visual);
  w.chogVisual=visual;w.chogSpec=spec;w.chogPort=0;
  w.chogMuzzles=spec.muzzles.map(p=>new THREE.Vector3(...p));
  w.def={...w.def,muzzle:w.chogMuzzles[0].clone()};
  if(spec.support&&w.def.gripL){const target=new THREE.Vector3(...spec.support);w.def={...w.def,handL:{...w.def.handL,pos:w.def.handL.pos.clone().add(target).sub(w.def.gripL.pos)}};}
  w.muzzle.position.copy(w.chogMuzzles[0]);
  hideChogShell(w);
 };
 // Portraits render synchronously: install preloaded geometry before the first pose is solved.
 if(ready.has(kind)){install(ready.get(kind));return;}
 return asset(kind).then(install).catch(error=>{w.chogError=String(error);console.error('CHOG weapon load failed',kind,error);});
}
export function hideChogShell(w){for(let x=w;x;x=x.left)if(x.chogVisual){for(const o of x.chogShells)o.visible=false;x.chogVisual.visible=true;}}
export function nextChogBarrel(w){
 if(!w?.chogMuzzles||w.chogMuzzles.length<2)return;
 const index=w.chogShotCount||0;w.chogPort=index%w.chogMuzzles.length;w.chogShotCount=index+1;
 w.muzzle.position.copy(w.chogMuzzles[w.chogPort]);w.def.muzzle.copy(w.muzzle.position);
}
