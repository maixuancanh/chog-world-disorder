import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const MYTHIC_TIMING=Object.freeze({charge:.45,burst:1.65,reward:2.05,rewardSeconds:3,end:7.8});
const clamp=THREE.MathUtils.clamp;
const ease=t=>1-(1-clamp(t,0,1))**3;
const ramp=(a,b,t)=>THREE.MathUtils.smoothstep(t,a,b);
const V=THREE.Vector3;
let cached;
async function sources(){
 if(!cached){const l=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);cached=Promise.all(['platform','chest','fragments'].map(n=>l.loadAsync(new URL(`../../assets/chog-mythic/${n}.glb`,import.meta.url).href))).then(async parts=>{
  const coin=await l.loadAsync(new URL('../../assets/chog-chest/coin.glb',import.meta.url).href);return [...parts,coin];
 }).catch(e=>{cached=null;throw e;});}return cached;
}
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.12,'rgba(255,245,255,.95)');g.addColorStop(.34,'rgba(238,106,255,.6)');g.addColorStop(1,'rgba(174,54,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);}
// Transparent center preserves the coin relief while its perimeter emits light.
function coinHaloTexture(){
 const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d'),image=x.createImageData(512,512);
 // A Gaussian tail reaches near-zero well before the sprite boundary. Unlike
 // linear gradient stops, this has no visible outer circle or abrupt cutoff.
 for(let y=0;y<512;y++)for(let px=0;px<512;px++){
  const r=Math.hypot((px-255.5)/256,(y-255.5)/256),inner=ramp(.12,.28,r),edge=1-ramp(.78,.99,r);
  const alpha=.78*Math.exp(-Math.pow((r-.30)/.205,2))*inner*edge,index=(y*512+px)*4;
  image.data[index]=255;image.data[index+1]=218;image.data[index+2]=155;image.data[index+3]=Math.round(255*alpha);
 }x.putImageData(image,0,0);return new THREE.CanvasTexture(c);
}
/** Seekable visual-only reward sequence. It cannot mint, transfer or award loot. */
export class MythicRewardStage {
 static async create(){return new MythicRewardStage(await sources());}
 constructor([platform,chest,fragments,coin]){
  this.group=new THREE.Group();this.group.name='Mythic victory reward';this.owned=[];this.materials=[];this.t=0;this.playing=false;this.disposed=false;
  const instance=g=>{const s=g.scene.clone(true);s.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;const copy=mat=>{const c=mat.clone();this.materials.push(c);c.roughness=Math.min(c.roughness??.4,.35);return c;};m.material=Array.isArray(m.material)?m.material.map(copy):copy(m.material);}});return s;};
  this.platform=instance(platform);this.platform.scale.y=.74;this.group.add(this.platform);this.platform.updateMatrixWorld(true);
  const ray=new THREE.Raycaster(new V(0,10,0),new V(0,-1,0));this.top=ray.intersectObject(this.platform,true)[0]?.point.y??1.17;
  this.chest=instance(chest);this.chest.position.y=this.top+.015;this.group.add(this.chest);
  this.fragments=instance(fragments);this.fragments.position.y=this.top+.015;this.group.add(this.fragments);this.pieces=[];
  this.fragments.traverse(o=>{if(o.name.startsWith('fragment_')){const rest=o.position.clone(),i=this.pieces.length,angle=Math.atan2(rest.z,rest.x);this.pieces.push({mesh:o,rest,q:o.quaternion.clone(),velocity:new V(Math.cos(angle)*(1.8+(i%4)*.23),3.1+(i%5)*.42,Math.sin(angle)*(1.8+(i%3)*.25)),spin:new V((i%3-1)*2.1,.9+(i%4)*.4,(i%2?1:-1)*1.8)});}});
  this.coin=new THREE.Group();const coinMesh=instance(coin);coinMesh.rotation.y=-Math.PI/2;this.coin.add(coinMesh);this.coin.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(this.coin),size=box.getSize(new V()),center=box.getCenter(new V());coinMesh.position.sub(center);this.coin.scale.setScalar(.92/Math.max(size.x,size.y,size.z));this.coinBaseScale=this.coin.scale.x;this.group.add(this.coin);
  this.fx=new THREE.Group();this.group.add(this.fx);this.texture=this.own(glowTexture());
  const sprite=(color,size)=>{const m=this.own(new THREE.SpriteMaterial({map:this.texture,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));const s=new THREE.Sprite(m);s.scale.setScalar(size);this.fx.add(s);return s;};
  this.core=sprite('#ffffff',1);this.flash=sprite('#ffffff',1);this.aura=sprite('#d483ff',2.5);
  this.coinHalo=new THREE.Sprite(this.own(new THREE.SpriteMaterial({map:this.own(coinHaloTexture()),color:new THREE.Color('#fff0ba').multiplyScalar(2.1),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})));this.coinHalo.name='Coin radiant halo';this.fx.add(this.coinHalo);
  this.coinLight=new THREE.PointLight('#ffbd4b',0,3.5,2);this.fx.add(this.coinLight);
  this.core.position.y=this.flash.position.y=this.top+.8;
  this.light=new THREE.PointLight('#d76aff',0,11,1.6);this.light.position.set(0,this.top+1,0);this.fx.add(this.light);
  this.rings=[];
  for(let i=0;i<3;i++){const m=this.own(new THREE.MeshBasicMaterial({color:new THREE.Color(i===1?'#e275ff':'#ffcc62').multiplyScalar(3),transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}));const mesh=new THREE.Mesh(this.own(new THREE.TorusGeometry(1.22-i*.17,.012,6,128,Math.PI*(1.55+i*.08))),m);const pivot=new THREE.Group();pivot.add(mesh);mesh.rotation.x=Math.PI/2;this.fx.add(pivot);this.rings.push({pivot,mesh});}
  this.shock=new THREE.Mesh(this.own(new THREE.TorusGeometry(1,.023,6,96)),this.own(new THREE.MeshBasicMaterial({color:'#f2a4ff',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})));this.shock.rotation.x=Math.PI/2;this.shock.position.y=this.top+.04;this.fx.add(this.shock);
  this.bolts=[];for(let i=0;i<12;i++){const pos=new Float32Array(33*2*3),g=this.own(new THREE.BufferGeometry());g.setAttribute('position',new THREE.BufferAttribute(pos,3));const indices=[];for(let j=0;j<32;j++){const n=j*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}g.setIndex(indices);const mat=this.own(new THREE.MeshBasicMaterial({color:new THREE.Color(i%3?'#ed43ff':'#fca6ff').multiplyScalar(4),transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false}));const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;this.fx.add(mesh);this.bolts.push(mesh);}
  this.particleCount=180;const geometry=this.own(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.particleCount*3),3));const colors=new Float32Array(this.particleCount*3);for(let i=0;i<this.particleCount;i++){const c=new THREE.Color(i%3?'#e18bff':'#ffd477');c.toArray(colors,i*3);}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));this.particles=new THREE.Points(geometry,this.own(new THREE.PointsMaterial({map:this.texture,vertexColors:true,size:.10,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})));this.particles.frustumCulled=false;this.fx.add(this.particles);this.seek(0);
 }
 own(o){this.owned.push(o);return o;}
 play(){this.t=0;this.playing=true;this.seek(0);}
 update(dt){if(this.playing){this.seek(this.t+Math.max(0,Math.min(dt,.1)));if(this.t>=MYTHIC_TIMING.end)this.playing=false;}}
 seek(t){
  if(this.disposed)return;this.t=Math.max(0,t);const T=MYTHIC_TIMING,c=ramp(T.charge,T.burst,t),b=t-T.burst,r=t-T.reward,charge=t>=T.charge&&b<0,burst=b>=0,fade=1-ramp(2.1,2.8,b);
  this.phase=t<T.charge?'ready':charge?'charging':b<.35?'burst':r<T.rewardSeconds?'reward':'complete';
  this.chest.visible=!burst;this.chest.position.set(charge?Math.sin(t*91)*.018*c:0,this.top+.015+(charge?Math.sin(t*62)*.025*c:0),charge?Math.cos(t*77)*.012*c:0);this.chest.rotation.set(charge?Math.sin(t*53)*.045*c:0,charge?Math.sin(t*38)*.025*c:0,charge?Math.sin(t*65)*.043*c:0);
  this.fragments.visible=burst&&fade>0;
  for(const p of this.pieces){const d=Math.max(0,b);p.mesh.position.copy(p.rest).addScaledVector(p.velocity,d);p.mesh.position.y-=2.9*d*d;p.mesh.rotation.set(p.spin.x*d,p.spin.y*d,p.spin.z*d);p.mesh.scale.setScalar(.98*fade);if(!burst){p.mesh.position.copy(p.rest);p.mesh.quaternion.copy(p.q);p.mesh.scale.setScalar(1);}}
  this.rewardVisible=r>=0&&r<T.rewardSeconds;this.coin.visible=this.rewardVisible;const rise=ease(r/.65),rf=1-ramp(T.rewardSeconds-.35,T.rewardSeconds,r);this.coin.position.set(Math.sin(r*2)*.055,this.top+.30+rise*1.38+Math.sin(r*3.2)*.065*rise,0);this.coin.rotation.set(0,r*2.6,.06*Math.sin(r*2));this.coin.scale.setScalar(this.coinBaseScale*(.05+.95*rise)*Math.max(0,rf));
  const haloPulse=.92+.08*Math.sin(r*3.8);this.coinHalo.visible=this.rewardVisible;this.coinHalo.position.copy(this.coin.position);this.coinHalo.scale.setScalar(3.0*(.1+.9*rise)*haloPulse);this.coinHalo.material.opacity=this.rewardVisible?rise*rf*.88:0;this.coinLight.position.copy(this.coin.position);this.coinLight.intensity=this.rewardVisible?4.5*rise*rf*haloPulse:0;
  const flash=b>=0?Math.exp(-b*17):0,energy=charge?c:burst?Math.exp(-b*1.1):0;
  this.core.material.opacity=charge?c*.8:Math.exp(-Math.max(b,0)*4)*Number(burst);this.core.scale.setScalar(.15+energy*.65);
  this.flash.material.color.setRGB(4,4,4);this.flash.material.opacity=flash;this.flash.scale.setScalar(3.5+Math.max(b,0)*13);this.flash.visible=b>=0&&b<.48;
  this.aura.position.y=this.top+1.3;this.aura.material.opacity=this.rewardVisible?.22*rf:energy*.12;this.light.intensity=charge?c*24:burst?(flash*95+Math.exp(-b*1.1)*13):0;
  this.shock.visible=b>=0&&b<.7;this.shock.scale.setScalar(.2+Math.max(0,b)*5);this.shock.material.opacity=(1-ramp(0,.7,b))*.8;
  for(let i=0;i<this.rings.length;i++){const {pivot,mesh}=this.rings[i],k=this.rewardVisible?rf:0;pivot.position.y=this.top+.12+(i===1?.48:0)+Math.sin(r*2+i)*.045;pivot.rotation.set((i-1)*.12,t*(i%2?-1.6:1.25)+i*2,Math.sin(t+i)*.08);mesh.material.opacity=k*.8;}
  for(let i=0;i<this.bolts.length;i++){const mesh=this.bolts[i],a=mesh.geometry.attributes.position;let strength=0;
   if(charge&&i<5)strength=c*(.65+.35*Math.sin(t*31+i)**2);
   if(burst&&b<2.5&&i<6)strength=(1-ramp(.65,2.5,b))*(.55+.45*Math.sin(t*19+i)**2);
   mesh.visible=strength>.01;mesh.material.opacity=strength*.9;if(!mesh.visible)continue;
   for(let j=0;j<=32;j++){const u=j/32;let x,y,z;
    if(charge){const angle=i*Math.PI/4+u*3.8+t*.5,rad=.88+.16*Math.sin(u*17+i);x=Math.cos(angle)*rad;y=this.top+.1+u*1.7;z=Math.sin(angle)*rad;}
    else{const angle=i*1.7+u*2.8+t*.25,rad=.12+u*(1.7+b*.6);x=Math.cos(angle)*rad;y=this.top+.1+Math.sin(u*Math.PI)*(.7+(i%3)*.65)+u*.35;z=Math.sin(angle)*rad;}
    const jag=Math.sin(j*2.8+i+t*26)*.055*Math.sin(u*Math.PI),w=(.018+.016*Math.sin(u*Math.PI))*strength;a.setXYZ(j*2,x-w+jag,y,z);a.setXYZ(j*2+1,x+w+jag,y+.006,z+.009);
   }a.needsUpdate=true;
  }
  const pa=this.particles.geometry.attributes.position;this.particles.visible=charge||b>=0&&b<4.3;this.particles.material.opacity=charge?c*.7:Math.max(0,1-b/4.3);
  for(let i=0;i<this.particleCount;i++){const angle=i*2.399963,d=Math.max(0,b),speed=.8+(i%13)/10;let x,y,z;if(charge){const rad=.9+(i%7)*.08,up=(t*.9+i*.618)%1;x=Math.cos(angle+t*2)*rad*(1-up*.4);z=Math.sin(angle+t*2)*rad*(1-up*.4);y=this.top+up*2.2;}else{x=Math.cos(angle)*speed*d;z=Math.sin(angle)*speed*d;y=this.top+.6+(1.2+i%5*.4)*d-.48*d*d;}pa.setXYZ(i,x,y,z);}pa.needsUpdate=true;
 }
 snapshot(){return{time:this.t,phase:this.phase,pieces:this.pieces.length,fragmentsVisible:this.fragments.visible,chestVisible:this.chest.visible,rewardVisible:this.coin.visible,rewardAge:this.t-MYTHIC_TIMING.reward,platformTop:this.top};}
 dispose(){if(this.disposed)return;this.disposed=true;this.group.removeFromParent();for(const m of this.materials)m.dispose();for(const r of this.owned)r.dispose();}
}
