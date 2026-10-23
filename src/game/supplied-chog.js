import { repairChogSkin } from './chog-skin-repair.js';
import { NativeFingerRig } from './chog-finger-rig.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { Character } from './character.js';

// Retain the supplied skeleton and mesh; repair seam weights before retargeting.
const JOINTS={Hips:'hips',Spine:'spine',Spine1:'chest',Spine2:'chest',Neck:'neck',Head:'head',
 LeftShoulder:'clavL',LeftArm:'uArmL',LeftForeArm:'fArmL',LeftHand:'handL',
 RightShoulder:'clavR',RightArm:'uArmR',RightForeArm:'fArmR',RightHand:'handR',
 LeftUpLeg:'thighL',LeftLeg:'shinL',LeftFoot:'footL',RightUpLeg:'thighR',RightLeg:'shinR',RightFoot:'footR'};
const shortName=name=>name.replace(/^mixamorig:?/,'');

export async function prepareSuppliedChog({base=false,outfit=false,modelUrl=null}={}){
 const gltf=await new GLTFLoader().loadAsync(modelUrl|| (outfit?'../assets/chog-wardrobe-fit-v1/outfit.glb?v=fit4':base?'../assets/chog-base-v2/rigged.glb':'../assets/chog-base/source.glb'));
 if(modelUrl?.includes('chog-nft-rigged-v2'))repairChogSkin(gltf.scene);
 gltf.scene.rotation.y=-Math.PI/2;gltf.scene.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(outfit?gltf.scene.getObjectByName('ChogBody'):gltf.scene),scale=1.48/(box.max.y-box.min.y);
 const model=new THREE.Group();model.add(gltf.scene);model.scale.setScalar(scale);
 model.position.set(-(box.min.x+box.max.x)*scale/2,-box.min.y*scale,-(box.min.z+box.max.z)*scale/2);
 const reference=clone(model);reference.visible=false;
 if(outfit)reference.traverse(o=>{if(['ChogJacket','ChogShorts','ChogShoeL','ChogShoeR'].includes(o.name))o.visible=false;});
 const materials=new Map();model.traverse(m=>{if(m.isMesh){
  m.userData.part=m.name;
  m.name='chogSupplied';m.castShadow=true;m.frustumCulled=false;
  if(!materials.has(m.material)){
   const material=m.material.clone();
   material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>','#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.20;');};
   material.customProgramCacheKey=()=> 'supplied-chog-fill-v1';materials.set(m.material,material);
  }m.material=materials.get(m.material);
 }});
 const fingerAnatomy=modelUrl?.includes('chog-nft-rigged-v2')?await fetch(modelUrl.replace(/-rigged\.glb.*/,'-fingers.json')).then(r=>{if(!r.ok)throw new Error('Finger anatomy unavailable');return r.json();}):null;
 return {model,reference,outfit,fingerAnatomy};
}

export class SuppliedChog extends Character{
 _tierParts(){return [];}
 constructor(opts,{model,reference,outfit,fingerAnatomy}){
  super({...opts,style:{hair:0,hat:0}});this.model=model;this.kid.add(model);this.sourceReference=reference;this.root.add(reference);
  this.imported=[];this.nativeBones={};model.traverse(o=>{if(o.isSkinnedMesh)this.imported.push(o);if(o.isBone)this.nativeBones[shortName(o.name)]=o;});
  this.outfitSlots=outfit?{jacket:true,shorts:true,shoes:true}:null;
  this.garments={jacket:[],shorts:[],shoes:[]};
  if(outfit){
   for(const m of this.imported){
    const part=m.userData.part;
    if(part==='ChogBody')this.outfitBody=m;
    else this.garments[part==='ChogJacket'?'jacket':part==='ChogShorts'?'shorts':'shoes'].push(m);
   }
   this.outfitBody.geometry=this.outfitBody.geometry.clone();
   this.fullBodyIndex=new Uint32Array(this.outfitBody.geometry.index.array);this.bodyCoverage=[];
   const p=this.outfitBody.geometry.attributes.position;
   for(let i=0;i<this.fullBodyIndex.length;i+=3){
    const ids=this.fullBodyIndex.slice(i,i+3),y=ids.reduce((s,id)=>s+p.getY(id),0)/3,side=Math.abs(ids.reduce((s,id)=>s+p.getZ(id),0)/3);
    let mask=0;
    if(y>.635&&y<.995&&!(y>.955&&side<.06))mask|=1;
    if(y>.44&&y<.69&&side<.21)mask|=2;
    if(y<.205)mask|=4;
    this.bodyCoverage.push(mask);
   }
   this.setOutfitSlot('jacket',true);
  }
  // Settle the controller before recording torso and non-limb motion offsets.
  for(let i=0;i<120;i++)super.update(1/60,{time:i/60,speed:0,localMove:{x:0,z:0},grounded:true,vy:0,aimPitch:0,firing:false,charge:0,rolling:false,form:'kid',ink:1,lowInk:false,special:0,invuln:false,hp:1});
  this.root.updateMatrixWorld(true);
  this._kidInvQ=this.kid.getWorldQuaternion(new THREE.Quaternion()).invert();
  this._kidInvM=this.kid.matrixWorld.clone().invert();
  this.retarget=[];
  model.traverse(b=>{if(!b.isBone)return;const name=JOINTS[shortName(b.name)];if(!name)return;
   const driver=this.bones[name];
   this.retarget.push({bone:b,driver,restQ:this._kidInvQ.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())),driverInv:this._kidInvQ.clone().multiply(driver.getWorldQuaternion(new THREE.Quaternion())).invert()});
  });
  const ends={LeftArm:'LeftForeArm',LeftForeArm:'LeftHand',RightArm:'RightForeArm',RightForeArm:'RightHand',LeftUpLeg:'LeftLeg',LeftLeg:'LeftFoot',RightUpLeg:'RightLeg',RightLeg:'RightFoot'};
  for(const entry of this.retarget){const end=ends[shortName(entry.bone.name)];if(!end)continue;
   entry.endDriver=this.bones[JOINTS[end]];
   entry.restDirection=this.nativeBones[end].getWorldPosition(new THREE.Vector3()).sub(entry.bone.getWorldPosition(new THREE.Vector3())).applyQuaternion(this._kidInvQ).normalize();
  }
  for(const side of ['Left','Right']){
   const entry=this.retarget.find(e=>e.bone===this.nativeBones[side+'Hand']);
   entry.handDirection=true;entry.endDriver=entry.driver;entry.driver=this.bones[JOINTS[side+'ForeArm']];
   entry.restDirection=entry.bone.getWorldPosition(new THREE.Vector3()).sub(this.nativeBones[side+'ForeArm'].getWorldPosition(new THREE.Vector3())).applyQuaternion(this._kidInvQ).normalize();
  }
  for(const entry of this.retarget){if(!entry.endDriver)continue;
   const driverRest=entry.handDirection?this.rest[entry.endDriver.name].clone().sub(this.rest[entry.driver.name]).normalize():this.rest[JOINTS[ends[shortName(entry.bone.name)]]].clone().sub(this.rest[JOINTS[shortName(entry.bone.name)]]).normalize();
   entry.axisMap=new THREE.Quaternion().setFromUnitVectors(entry.restDirection,driverRest);
  }
  this.supportShoulderRest=this.nativeBones.LeftShoulder.position.clone();
  this.hipsRest=this.nativeBones.Hips.getWorldPosition(new THREE.Vector3()).applyMatrix4(this._kidInvM);
  this.driverHipsRest=this.bones.hips.getWorldPosition(new THREE.Vector3()).applyMatrix4(this._kidInvM);
  const legLength=(a,b,c)=>a.getWorldPosition(new THREE.Vector3()).distanceTo(b.getWorldPosition(new THREE.Vector3()))+b.getWorldPosition(new THREE.Vector3()).distanceTo(c.getWorldPosition(new THREE.Vector3()));
  this.legScale=legLength(this.nativeBones.LeftUpLeg,this.nativeBones.LeftLeg,this.nativeBones.LeftFoot)/legLength(this.bones.thighL,this.bones.shinL,this.bones.footL);
  this._q=new THREE.Quaternion();this._parentInvQ=new THREE.Quaternion();this._kidQ=new THREE.Quaternion();this._position=new THREE.Vector3();
  if(fingerAnatomy)this.fingerRig=new NativeFingerRig(this,fingerAnatomy);
  this.squidRoot.removeFromParent();this.squidRoot.visible=false;this.root.name='chog:'+this.name;
  this.tank.group.removeFromParent();this.tank.group.visible=false;this.bomb?.group.removeFromParent();if(this.weapon)this.weapon.pivot.visible=false;
 }
 setSub(kind){super.setSub(kind);this.bomb?.group.removeFromParent();}
 setChogWeapon(enabled=true){this.chogWeaponEnabled=enabled;this.weaponHidden=!enabled;if(this.weapon)this.weapon.pivot.visible=enabled;}
 setOutfitSlot(slot,enabled){
  if(!this.outfitSlots||!Object.hasOwn(this.outfitSlots,slot))return;
  this.outfitSlots[slot]=enabled;for(const m of this.garments[slot])m.visible=enabled;
  const active=(this.outfitSlots.jacket?1:0)|(this.outfitSlots.shorts?2:0)|(this.outfitSlots.shoes?4:0),indices=[];
  for(let i=0;i<this.bodyCoverage.length;i++)if(!(this.bodyCoverage[i]&active))indices.push(this.fullBodyIndex[i*3],this.fullBodyIndex[i*3+1],this.fullBodyIndex[i*3+2]);
  this.outfitBody.geometry.setIndex(new THREE.Uint32BufferAttribute(indices,1));
 }
 syncNativeRig(){
  this.nativeBones.LeftShoulder.position.copy(this.supportShoulderRest);
  this.root.updateMatrixWorld(true);this.kid.getWorldQuaternion(this._kidQ);this._kidInvQ.copy(this._kidQ).invert();this._kidInvM.copy(this.kid.matrixWorld).invert();
  this._position.copy(this.bones.hips.getWorldPosition(new THREE.Vector3())).applyMatrix4(this._kidInvM).sub(this.driverHipsRest).multiplyScalar(this.legScale).add(this.hipsRest).applyMatrix4(this.kid.matrixWorld);
  this.nativeBones.Hips.position.copy(this.nativeBones.Hips.parent.worldToLocal(this._position));
  for(const entry of this.retarget){
   entry.driver.getWorldQuaternion(this._q);this._q.premultiply(this._kidInvQ).multiply(entry.driverInv).multiply(entry.restQ).premultiply(this._kidQ);
   if(entry.axisMap){
    // Map the full driver frame, including axial twist. A direction-only rotation
    // discards the IK bend plane and twists adjacent skin influences apart.
    entry.driver.getWorldQuaternion(this._q);this._q.multiply(entry.axisMap).multiply(entry.restQ);
   }
   entry.bone.parent.getWorldQuaternion(this._parentInvQ).invert();entry.bone.quaternion.copy(this._parentInvQ.multiply(this._q));entry.bone.updateMatrix();entry.bone.updateWorldMatrix(false,false);
  }
  this.model.updateMatrixWorld(true);
  if(this.chogWeaponEnabled&&this.weapon){
   for(const [gun,side,driver] of [[this.weapon,'RightHand',this.bones.handR],[this.weapon.left,'LeftHand',this.bones.handL]]){
    if(!gun)continue;const hand=this.nativeBones[side];
    driver.updateWorldMatrix(true,false);gun.pivot.updateWorldMatrix(true,false);
    gun.chogDriverLocal=gun.pivot.matrix.clone();
    const held=gun.pivot.matrixWorld.clone();
    let delta;
    if(this.fingerRig&&gun.chogVisual){this.fingerRig.orientHand(side==='RightHand'?'Right':'Left',gun);gun.off.updateWorldMatrix(true,false);delta=this.fingerRig.palmWorld(side==='RightHand'?'Right':'Left').sub(gun.off.getWorldPosition(new THREE.Vector3()));}
    else delta=hand.getWorldPosition(new THREE.Vector3()).sub(driver.getWorldPosition(new THREE.Vector3()));
    held.elements[12]+=delta.x;held.elements[13]+=delta.y;held.elements[14]+=delta.z;
    gun.pivot.parent.updateWorldMatrix(true,false);
    const local=new THREE.Matrix4().copy(gun.pivot.parent.matrixWorld).invert().multiply(held);
    local.decompose(gun.pivot.position,gun.pivot.quaternion,gun.pivot.scale);
   }
  }
  if(this.chogWeaponEnabled&&this.weapon?.chogSpec?.support&&!this.weapon.left&&this.wTwo>.2)this.fitSupportHand(this.weapon);
 }
 fitSupportHand(gun){
  // Fit the weapon inside the reach of BOTH arms instead of dragging a clavicle.
  const targets={};
  for(const side of ['Left','Right']){
   const upper=this.nativeBones[side+'Arm'],lower=this.nativeBones[side+'ForeArm'],hand=this.nativeBones[side+'Hand'];
   const a=upper.getWorldPosition(new THREE.Vector3()),b=lower.getWorldPosition(new THREE.Vector3()),c=hand.getWorldPosition(new THREE.Vector3());
   if(this.fingerRig)this.fingerRig.orientHand(side,gun);
   const palmOffset=this.fingerRig?this.fingerRig.palmWorld(side).sub(hand.getWorldPosition(new THREE.Vector3())):new THREE.Vector3();
   gun.off.updateWorldMatrix(true,false);
   const grip=side==='Left'?new THREE.Vector3(...gun.chogSpec.support).applyMatrix4(gun.off.matrixWorld):gun.off.getWorldPosition(new THREE.Vector3());
   targets[side]={a,b,c,l1:a.distanceTo(b),l2:b.distanceTo(c),target:grip.sub(palmOffset)};
  }
  const shift=new THREE.Vector3();
  for(let pass=0;pass<6;pass++)for(const side of ['Left','Right']){
   const t=targets[side],delta=t.target.clone().add(shift).sub(t.a),d=delta.length(),reach=t.l1+t.l2-.012;
   if(d>reach)shift.addScaledVector(delta,(reach-d)/d);
  }
  if(shift.lengthSq()>1e-10){
   const world=gun.pivot.getWorldPosition(new THREE.Vector3()).add(shift);
   gun.pivot.position.copy(gun.pivot.parent.worldToLocal(world));gun.pivot.updateWorldMatrix(false,true);
  }
  for(const side of ['Right','Left']){
   const {a,b,l1,l2,target}=targets[side];target.add(shift);
   const axis=target.clone().sub(a);let d=axis.length();axis.normalize();
   d=Math.max(Math.abs(l1-l2)+.001,Math.min(d,l1+l2-.001));target.copy(a).addScaledVector(axis,d);
   // Preserve the animation's elbow plane, preventing an elbow flipping into the chest.
   const pole=b.clone().sub(a);pole.addScaledVector(axis,-pole.dot(axis));
   if(pole.lengthSq()<1e-6){pole.set(side==='Left'?.35:-.35,-.35,-.3).applyQuaternion(this._kidQ);pole.addScaledVector(axis,-pole.dot(axis));}pole.normalize();
   const along=(l1*l1-l2*l2+d*d)/(2*d),height=Math.sqrt(Math.max(0,l1*l1-along*along));
   const elbow=a.clone().addScaledVector(axis,along).addScaledVector(pole,height);
   const turn=(bone,child,point)=>{const pos=bone.getWorldPosition(new THREE.Vector3()),old=child.getWorldPosition(new THREE.Vector3()).sub(pos).normalize(),next=point.clone().sub(pos).normalize();const q=new THREE.Quaternion().setFromUnitVectors(old,next).multiply(bone.getWorldQuaternion(new THREE.Quaternion()));const inv=bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();bone.quaternion.copy(inv.multiply(q));bone.updateWorldMatrix(false,true);};
   const upper=this.nativeBones[side+'Arm'],lower=this.nativeBones[side+'ForeArm'],hand=this.nativeBones[side+'Hand'];
   turn(upper,lower,elbow);turn(lower,hand,target);if(this.fingerRig)this.fingerRig.orientHand(side,gun);
  }
  this.model.updateMatrixWorld(true);
 }
 update(dt,state){
  for(let gun=this.weapon;gun;gun=gun.left)if(gun.chogDriverLocal)gun.chogDriverLocal.decompose(gun.pivot.position,gun.pivot.quaternion,gun.pivot.scale);
  super.update(dt,{...state,form:'kid'});this.squidRoot.visible=false;this.kid.visible=true;this.syncNativeRig();this.fingerRig?.update(dt,state);this.tank.group.visible=false;
  for(let gun=this.weapon;gun;gun=gun.left)gun.pivot.visible=!!this.chogWeaponEnabled;
 }
}
