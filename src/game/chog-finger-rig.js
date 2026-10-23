import * as THREE from 'three';
const NAMES=['Thumb','Index','Middle','Ring','Little'];
const TURN=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// The imported hands are authored open. Extend them with real weighted phalanges,
// orient the palm against the handle, and fit bounded hinge curls to its surface.
export class NativeFingerRig {
 constructor(character,anatomy){
  this.c=character;this.hands={};this.cache=new Map();this.diagnostics=[];
  character.root.updateMatrixWorld(true);
  const kidInv=character.kid.getWorldQuaternion(new THREE.Quaternion()).invert();
  for(const side of ['Left','Right']){
   const hand=character.nativeBones[side+'Hand'],data=anatomy[side];
   const p=data.palmSource;const world=character.model.children[0].localToWorld(new THREE.Vector3(p[0],p[2],-p[1]));
   const h=this.hands[side]={bone:hand,palmLocal:hand.worldToLocal(world),restWorld:kidInv.clone().multiply(hand.getWorldQuaternion(new THREE.Quaternion())),grip:0,fingers:[]};
   for(const name of NAMES){const chain=data.chains[name],bones=chain.names.map(n=>character.nativeBones[n]),tip=character.nativeBones[chain.tip];
    if(!bones.every(Boolean)||!tip)throw new Error('Missing finger chain '+side+name);
    h.fingers.push({name,bones,tip,rest:bones.map(b=>b.quaternion.clone()),axes:bones.map(b=>new THREE.Vector3(0,0,1).applyQuaternion(character.kid.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert())),angles:[0,0,0]});
   }
  }
 }
 contactFrame(side,gun){
  gun.off.updateWorldMatrix(true,false);
  const support=side==='Left'&&!this.c.weapon.left&&gun===this.c.weapon&&gun.chogSpec?.support;
  const local=new THREE.Matrix4();
  if(support){local.makeTranslation(...support);if(['spinner','charger'].includes(this.c.weaponKind))local.multiply(new THREE.Matrix4().makeRotationZ(-Math.PI/2));}
  return gun.off.matrixWorld.clone().multiply(local);
 }
 orientHand(side,gun){
  const h=this.hands[side];gun.off.updateWorldMatrix(true,false);
  const frame=this.contactFrame(side,gun);const q=new THREE.Quaternion().setFromRotationMatrix(frame.clone().extractRotation(frame)).multiply(TURN).multiply(h.restWorld);
  const inv=h.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();h.bone.quaternion.copy(inv.multiply(q));h.bone.updateWorldMatrix(false,true);
 }
 palmWorld(side){const h=this.hands[side];return h.bone.localToWorld(h.palmLocal.clone());}
 apply(f,angles,sign){for(let i=0;i<3;i++){f.bones[i].quaternion.copy(f.rest[i]).multiply(new THREE.Quaternion().setFromAxisAngle(f.axes[i],angles[i]*sign));}f.bones[0].updateWorldMatrix(false,true);}
 fit(h,f,gun,side){
  const sign=side==='Right'?1:-1,key=side+':'+gun.chogVisual.name+':'+f.name+':'+(gun===this.c.weapon?'main':'support');
  if(this.cache.has(key))return this.cache.get(key);
  this.apply(f,[0,0,0],sign);
  const frame=this.contactFrame(side,gun);const root=f.bones[0].getWorldPosition(new THREE.Vector3()).applyMatrix4(frame.clone().invert());
  const triggerHand=side==='Right'||!!this.c.weapon.left;
  const radius=(gun.chogSpec.length<.45?.017:.022);
  const targetLocal=new THREE.Vector3(sign*radius*.8,root.y,-.012+root.y*.2);
  if(f.name==='Index'&&triggerHand){targetLocal.x=sign*.01;targetLocal.z=.035;targetLocal.y=clamp(root.y,.005,.045);}
  if(f.name==='Thumb'){targetLocal.x=sign*.014;targetLocal.y=.042;targetLocal.z=-.012;}
  const target=targetLocal.clone().applyMatrix4(frame);
  const open=f.tip.getWorldPosition(new THREE.Vector3()).distanceTo(target);
  let angles=f.name==='Thumb'?[.35,.55,.4]:f.name==='Index'?[.65,.8,.45]:[1.1,1.2,.6];
  const preferred=f.name==='Thumb'?[.45,.85,.55]:f.name==='Index'?[.65,1,.55]:[1.05,1.15,.65];
  const limits=f.name==='Thumb'?[.8,1.25,.85]:f.name==='Index'?[1.05,1.3,.8]:[1.2,1.5,.9];
  const score=()=>f.tip.getWorldPosition(new THREE.Vector3()).distanceToSquared(target)+.00015*angles.reduce((s,a,i)=>s+(a-preferred[i])**2,0);
  this.apply(f,angles,sign);let best=score();
  for(const step of [.4,.2,.1,.05])for(let pass=0;pass<2;pass++)for(let i=0;i<3;i++){
   const original=angles[i];let selected=original;
   for(const direction of [-1,1]){angles[i]=clamp(original+step*direction,0,limits[i]);this.apply(f,angles,sign);const e=score();if(e<best){best=e;selected=angles[i];}}
   angles[i]=selected;this.apply(f,angles,sign);
  }
  best=f.tip.getWorldPosition(new THREE.Vector3()).distanceToSquared(target);
  if(Math.sqrt(best)>open){angles=[0,0,0];best=open*open;}
  this.diagnostics.push({side,finger:f.name,weapon:gun.chogVisual.name,openDistance:open,gripDistance:Math.sqrt(best),angles:[...angles]});
  this.cache.set(key,[...angles]);return angles;
 }
 update(dt,state){
  for(const side of ['Left','Right']){
   const h=this.hands[side],gun=side==='Right'?this.c.weapon:this.c.weapon.left||this.c.weapon;
   const active=this.enabled!==false&&this.c.chogWeaponEnabled&&gun?.chogVisual&&(side==='Right'||this.c.weapon.left||this.c.wTwo>.2);
   h.grip+=(Number(!!active)-h.grip)*(1-Math.exp(-dt*20));
   for(const f of h.fingers){const target=active?this.fit(h,f,gun,side):[0,0,0];const angles=target.map(a=>a*h.grip);
    if(active&&f.name==='Index'&&(side==='Right'||this.c.weapon.left)){const runner=state.runner||this.c._runner(state);const since=this.c.weapon.left?runner?.sinceHand?.[side==='Right'?0:1]:this.c.lastShot;const pulse=Math.exp(-Math.max(0,since??99)*22);angles[1]=Math.min(1.5,angles[1]+pulse*.08);}
    this.apply(f,angles,side==='Right'?1:-1);
   }
  }
 }
}
