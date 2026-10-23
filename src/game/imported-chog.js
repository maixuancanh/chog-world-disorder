import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { Character } from './character.js';
import { BONE_INDEX, BONE_NAMES, getRestPositions } from './character-geo.js';

export async function prepareImportedChog(){
 const useHeat=new URLSearchParams(location.search).get('weights')!=='analytic';
 const heat=useHeat?await fetch('../assets/chog-import/heat-weights.json').then(r=>{if(!r.ok)throw new Error('Cannot load Chog weights');return r.json();}):null;
 const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('../assets/chog-import/source.glb');
 let parts=[];gltf.scene.updateMatrixWorld(true);
 gltf.scene.traverse(m=>{if(m.isMesh){const g=m.geometry.clone();g.applyMatrix4(m.matrixWorld);g.rotateY(-Math.PI/2);g.computeBoundingBox();parts.push({geometry:g,material:m.material});}});
 const box=new THREE.Box3();for(const p of parts)box.union(p.geometry.boundingBox);
 const scale=1.48/(box.max.y-box.min.y),cx=(box.min.x+box.max.x)/2,cz=(box.min.z+box.max.z)/2;
 await MeshoptSimplifier.ready;
 const split=[],reference=new THREE.Group();reference.name='ChogSourceReference';reference.visible=false;
 for(const p of parts){
  p.geometry.translate(-cx,-box.min.y,-cz);p.geometry.scale(scale,scale,scale);
  const raw=new THREE.Mesh(p.geometry,p.material);raw.castShadow=true;reference.add(raw);
  const g=p.geometry,a=g.attributes.position,head=[],body=[],ix=g.index.array;
  for(let i=0;i<ix.length;i+=3){const target=Math.min(a.getY(ix[i]),a.getY(ix[i+1]),a.getY(ix[i+2]))>=.995?head:body;target.push(ix[i],ix[i+1],ix[i+2]);}
  split.push({...p,indices:new Uint32Array(head),keepDetail:true},{...p,indices:new Uint32Array(body),keepDetail:false});
 }
 parts=split;
 for(const p of parts){
  const g=p.geometry,pa=g.attributes.position;
  // Preserve the UV atlas; simplify topology before doing any skinning work.
  const pos=new Float32Array(pa.count*3);for(let i=0;i<pa.count;i++){pos[i*3]=pa.getX(i);pos[i*3+1]=pa.getY(i);pos[i*3+2]=pa.getZ(i);}
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const index=p.indices;
  const uv=g.attributes.uv,attrs=new Float32Array(pa.count*2);
  for(let i=0;i<pa.count;i++){attrs[i*2]=uv.getX(i);attrs[i*2+1]=uv.getY(i);}
  const small=p.keepDetail?index:MeshoptSimplifier.simplifyWithAttributes(index,pos,3,attrs,2,[.5,.5],null,Math.min(index.length,180000),.003)[0];
  const remap=new Map(),old=[];const ids=Uint32Array.from(small,i=>{if(!remap.has(i)){remap.set(i,old.length);old.push(i);}return remap.get(i);});
  const compact=new THREE.BufferGeometry();for(const [name,a] of Object.entries(g.attributes)){const arr=new Float32Array(old.length*a.itemSize);old.forEach((v,i)=>{for(let k=0;k<a.itemSize;k++)arr[i*a.itemSize+k]=a.getComponent(v,k);});compact.setAttribute(name,new THREE.BufferAttribute(arr,a.itemSize));}
  compact.setIndex(new THREE.BufferAttribute(ids,1));p.geometry=compact;
  p.inverses=bindGeometry(compact);
  if(!p.keepDetail&&heat){
   if(heat.vertices!==compact.attributes.position.count||heat.missing)throw new Error('Chog skin weights do not match this mesh');
   const positionBytes=new Uint8Array(compact.attributes.position.array.buffer),indexBytes=new Uint8Array(compact.index.array.buffer),bytes=new Uint8Array(positionBytes.length+indexBytes.length);
   bytes.set(positionBytes);bytes.set(indexBytes,positionBytes.length);
   const digest=await crypto.subtle.digest('SHA-256',bytes),fingerprint=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
   if(fingerprint!==heat.fingerprint)throw new Error('Chog mesh changed; rebuild its Blender weights');
   compact.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(heat.indices.map(i=>BONE_INDEX[heat.names[i]]),4));
   compact.setAttribute('skinWeight',new THREE.Float32BufferAttribute(heat.weights,4));
   // Both sides of the head/body partition share exactly the head transform.
   // Leave a transition below the partition so the neck cannot open a crack.
   const w=compact.attributes.skinWeight,id=compact.attributes.skinIndex,pos=compact.attributes.position;
   for(let i=0;i<pos.count;i++){
    const blend=THREE.MathUtils.smoothstep(pos.getY(i),.95,.985);if(!blend)continue;
    const values=new Map([[BONE_INDEX.head,blend]]);
    for(let k=0;k<4;k++){const bone=id.getComponent(i,k);values.set(bone,(values.get(bone)||0)+w.getComponent(i,k)*(1-blend));}
    const rank=[...values].sort((a,b)=>b[1]-a[1]).slice(0,4),total=rank.reduce((s,v)=>s+v[1],0);
    for(let k=0;k<4;k++){id.setComponent(i,k,rank[k]?.[0]??0);w.setComponent(i,k,(rank[k]?.[1]??0)/total);}
   }
  }
  stabilizeCollar(compact);
  delete p.indices;
 }
 const gameMaterials=new Map();
 for(const p of parts){
  if(!gameMaterials.has(p.material)){
   const material=p.material.clone();
   // Local diffuse fill, like the game's stylized cloth shading. Keep the
   // source textures, normals and scene exposure; the reference stays untouched.
   material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.20;');
   };
   material.customProgramCacheKey=()=> 'chog-diffuse-fill-v1';gameMaterials.set(p.material,material);
  }
  p.material=gameMaterials.get(p.material);
 }
 parts.reference=reference;return parts;
}
function stabilizeCollar(g){
 const p=g.attributes.position,id=g.attributes.skinIndex,w=g.attributes.skinWeight,smooth=THREE.MathUtils.smoothstep;
 for(let i=0;i<p.count;i++){
  const y=p.getY(i),radius=Math.hypot(p.getX(i),p.getZ(i)+.01);
  const blend=(1-smooth(radius,.115,.145))*smooth(y,.90,.935)*(1-smooth(y,1.018,1.04));
  if(!blend)continue;
  const weights=new Map([[BONE_INDEX.chest,blend]]);
  for(let k=0;k<4;k++){const bone=id.getComponent(i,k);weights.set(bone,(weights.get(bone)||0)+w.getComponent(i,k)*(1-blend));}
  const ranked=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=ranked.reduce((sum,v)=>sum+v[1],0);
  for(let k=0;k<4;k++){id.setComponent(i,k,ranked[k]?.[0]??0);w.setComponent(i,k,(ranked[k]?.[1]??0)/total);}
 }
}
function bindGeometry(g){
 const rest=getRestPositions({hair:0,hat:0,brows:0}),V=(x,y,z=0)=>new THREE.Vector3(x,y,z);
 const source=Object.fromEntries(['hips','spine','chest','neck','head'].map(n=>[n,rest[n].clone()]));
 for(const [s,k] of [['L',1],['R',-1]])Object.assign(source,{['uArm'+s]:V(k*.145,.945),['fArm'+s]:V(k*.220,.775),['hand'+s]:V(k*.282,.602),['thigh'+s]:V(k*.092,.625),['shin'+s]:V(k*.110,.345),['foot'+s]:V(k*.119,.085)});
 const links=[['hips','spine'],['spine','chest'],['chest','neck'],['neck','head'],['head',null]];
 for(const s of ['L','R'])links.push(['uArm'+s,'fArm'+s],['fArm'+s,'hand'+s],['hand'+s,null],['thigh'+s,'shin'+s],['shin'+s,'foot'+s],['foot'+s,null]);
 const segs=links.map(([name,next])=>{
  const a=source[name],b=next?source[next]:a.clone().add(name==='head'?V(0,.36):name.startsWith('hand')?V(Math.sign(a.x)*.025,-.075):V(0,-.035,.09));
  const v=b.clone().sub(a),q=new THREE.Quaternion();if(next)q.setFromUnitVectors(v.clone().normalize(),rest[next].clone().sub(rest[name]).normalize());
  return {name,a,b,v,len:v.lengthSq(),q};
 });
 // Bind in the source A-pose. Do not bake a weighted deformation into vertices.
 const inverses=BONE_NAMES.map(name=>{
  const seg=segs.find(s=>s.name===name);
  if(!seg)return new THREE.Matrix4().makeTranslation(...rest[name].toArray()).invert();
  let q=seg.q.clone().invert();
  if(name.startsWith('hand'))q=segs.find(s=>s.name==='fArm'+name.slice(-1)).q.clone().invert();
  return new THREE.Matrix4().compose(seg.a,q,new THREE.Vector3(1,1,1)).invert();
 });
 const p=g.attributes.position,ids=new Uint16Array(p.count*4),ws=new Float32Array(p.count*4);
 const smooth=THREE.MathUtils.smoothstep;
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),side=x>=0?'L':'R',ax=Math.abs(x),weights=new Map();
  const add=(name,w)=>{if(w>0)weights.set(name,(weights.get(name)||0)+w);};
  if(y>=.995)add('head',1);
  else {
   // The torso/arm boundary follows the armpit gap; a hand cannot acquire leg weights.
   const edge=Math.min(.205,.120+Math.max(0,.94-y)*.255);
   let arm=smooth(ax,edge-.045,edge+.045)*smooth(y,.40,.46)*(1-smooth(y,.96,1.005));
   // Below the armpit the source sleeve is separated from the jacket by air.
   // Its inner edge must stay on the arm rather than following the abdomen.
   arm=Math.max(arm,smooth(ax,.16,.19)*(1-smooth(y,.74,.86))*smooth(y,.40,.46));
   const hand=1-smooth(y,.545,.655),upper=smooth(y,.69,.86);
   add('hand'+side,arm*hand);add('fArm'+side,arm*(1-hand)*(1-upper));add('uArm'+side,arm*(1-hand)*upper);
   const body=1-arm;
    // Keep the continuous crotch bridge on the pelvis. A sign(x) split here tears
    // neighbouring triangles apart as the two thighs move in opposite directions.
    const bridge=(1-smooth(ax,.025,.075))*smooth(y,.52,.58);
    const pelvis=Math.max(smooth(y,.57,.665),bridge),foot=1-smooth(y,.115,.175),thigh=smooth(y,.31,.40);
    const left=smooth(x,-.035,.035);
    const torso=smooth(y,.63,.735),chest=smooth(y,.79,.90),neck=smooth(y,.98,.995);
    const trunk=body*pelvis*torso;
    add('hips',body*pelvis*(1-torso));
    add('spine',trunk*(1-chest));add('chest',trunk*chest*(1-neck));add('head',trunk*chest*neck);
    for(const [s,share] of [['L',left],['R',1-left]]){
     const leg=body*(1-pelvis)*share;
     add('foot'+s,leg*foot);
     add('shin'+s,leg*(1-foot)*(1-thigh));add('thigh'+s,leg*(1-foot)*thigh);
    }
  }
  const ranked=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=ranked.reduce((a,b)=>a+b[1],0);
  ranked.forEach(([name,w],k)=>{ids[i*4+k]=BONE_INDEX[name];ws[i*4+k]=w/total;});
 }
 g.setAttribute('skinIndex',new THREE.BufferAttribute(ids,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(ws,4));g.computeBoundingSphere();
 return inverses;
}

export class ImportedChog extends Character{
 _tierParts(){return [];}
 constructor(opts,parts){
  super({...opts,style:{hair:0,hat:0}});
  this.imported=[];this.skinBones=this.skeleton.bones.map(b=>{const target=new THREE.Bone();target.name=b.name;target.matrixAutoUpdate=false;this.kid.add(target);return target;});
  this._skinMatrix=new THREE.Matrix4();this._skinInverse=new THREE.Matrix4();this._skinElbow=new THREE.Vector3();this._skinRest=getRestPositions({hair:0,hat:0,brows:0});
  for(const p of parts){const m=new THREE.SkinnedMesh(p.geometry,p.material);m.name=p.keepDetail?'chogImportedHead':'chogImportedBody';m.bind(new THREE.Skeleton(this.skinBones,p.inverses),new THREE.Matrix4());m.frustumCulled=false;m.castShadow=true;this.kid.add(m);this.imported.push(m);}
  this.sourceReference=parts.reference;this.root.add(this.sourceReference);
  this.tank.group.visible=false;this.chogWeapon=true;this.syncSkin();
 }
 syncSkin(){
  this.root.updateMatrixWorld(true);this._skinInverse.copy(this.kid.matrixWorld).invert();
  const corrected=new Map(),rest=this._skinRest;
  for(const s of ['L','R']){
   const shoulder=this.bones['uArm'+s].getWorldPosition(new THREE.Vector3()),elbow=this.bones['fArm'+s].getWorldPosition(new THREE.Vector3()),wrist=this.bones['hand'+s].getWorldPosition(new THREE.Vector3());
   const upperLength=Math.hypot(.220-.145,.775-.945),lowerLength=Math.hypot(.282-.220,.602-.775);
   this._skinElbow.copy(elbow).sub(shoulder).multiplyScalar(upperLength/rest['fArm'+s].distanceTo(rest['uArm'+s])).add(shoulder);
   corrected.set('fArm'+s,this._skinElbow.clone());
   corrected.set('hand'+s,wrist.sub(elbow).multiplyScalar(lowerLength/rest['hand'+s].distanceTo(rest['fArm'+s])).add(this._skinElbow));
  }
  this.skinBones.forEach((b,i)=>{
   this._skinMatrix.copy(this.skeleton.bones[i].matrixWorld);
   if(corrected.has(b.name))this._skinMatrix.setPosition(corrected.get(b.name));
   b.matrix.multiplyMatrices(this._skinInverse,this._skinMatrix);b.matrixWorldNeedsUpdate=true;
  });
  this.kid.updateMatrixWorld(true);
 }
 setChogWeapon(v){this.chogWeapon=v;}
 update(dt,s){super.update(dt,s);this.syncSkin();this.tank.group.visible=false;if(this.weapon)this.weapon.pivot.visible=this.chogWeapon;}
}


