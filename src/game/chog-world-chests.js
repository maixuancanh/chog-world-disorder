import * as THREE from 'three';
import {fitChestCollider,releaseChestCollider} from './chest-collision.js';
import { G } from '../core/ctx.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ChogChest } from './chog-chest.js';
import { randomUnit, randomInt, createChestLoot } from './chog-chest-random.js';
import { outsideHuntSpawns } from './hunt-spawns.js';

export const TRAIT_LOOT = Object.freeze([
  {id:'mcga-cap',category:'Head',value:'MCGA',name:'MCGA Cap',model:'mcga-cap.glb'},
  {id:'btc-glasses',category:'Eyes',value:'BTC Glass',name:'BTC Glasses',model:'btc-glasses.glb'},
  {id:'yellow-143-jersey',category:'Body',value:'Yellow 143 Jersey',name:'Yellow 143 Jersey',model:'yellow-143-jersey.glb'},
  {id:'fwog',category:'Accessory',value:'Fwog',name:'Fwog',model:'fwog.glb'},
]);
export const REWARD_SECONDS = 4;
let coinSource;
let traitSources;
function loadTraits(){
  if(!traitSources){const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    traitSources=Promise.all(TRAIT_LOOT.map(async trait=>{
      const gltf=await loader.loadAsync(new URL('../../assets/chog-traits/'+trait.model,import.meta.url).href);
      gltf.scene.name='Trait reward source: '+trait.id;
      gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      return [trait.id,gltf.scene];
    })).then(entries=>new Map(entries)).catch(error=>{traitSources=null;throw error;});
  }return traitSources;
}
function loadCoin() {
  if(!coinSource)coinSource=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    .loadAsync(new URL('../../assets/chog-chest/coin.glb',import.meta.url).href)
    .then(g=>{
      // Tripo's disk is thin along X. Turn it upright facing the chest front (+Z).
      const root=new THREE.Group();g.scene.rotation.y=-Math.PI/2;root.add(g.scene);root.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(root),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
      g.scene.position.sub(center);root.scale.setScalar(.82/Math.max(size.x,size.y,size.z));return root;
    }).catch(e=>{coinSource=null;throw e;});
  return coinSource;
}

/** Visible reward lasts exactly 4 seconds, including its rise, then is removed.
 * No token/accounting side effects; gameplay authority belongs to the match host.
 */
export class ChestReward {
  constructor(parent,source){
    this.parent=parent;this.group=new THREE.Group();this.model=source.clone(true);this.materials=[];
    this.model.traverse(o=>{if(o.isMesh){
      const clone=m=>{const c=m.clone();c.transparent=true;this.materials.push(c);return c;};
      o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);
    }});
    this.baseScale=this.model.scale.clone();this.group.add(this.model);parent.add(this.group);this.elapsed=0;this.done=false;this.update(0);
  }
  update(dt){
    if(this.done)return;this.elapsed+=Math.max(0,dt);
    if(this.elapsed>=REWARD_SECONDS){this.dispose();return;}
    const t=this.elapsed,rise=Math.min(1,t/.65),e=1-(1-rise)**3;
    this.group.position.set(Math.sin(t*2.3)*.10*e,.54+1.65*e+Math.sin(t*3.2)*.10*e,Math.sin(t*1.7)*.06*e);
    this.group.rotation.set(Math.sin(t*1.9)*.12,t*1.6,Math.sin(t*2.1)*.08);
    this.model.scale.copy(this.baseScale).multiplyScalar(.12+.88*e);
    const fade=THREE.MathUtils.smoothstep(REWARD_SECONDS-t,0,.35);
    for(const m of this.materials)m.opacity=fade;
  }
  dispose(){if(this.done)return;this.done=true;this.group.removeFromParent();for(const m of this.materials)m.dispose();this.materials.length=0;}
}

// Use only the navigation graph's spawn-reachable, return-reachable nodes. Flat
// footprint + clearance samples reject ledges, water, ramps, roofs and prop tops.
export function chestLocations(level,nav,physics,count=20,random=randomUnit){
  // CHOG cannot use the original squid wall-climb. Loot goals must be reachable
  // from both bases through ordinary walk/jump/drop edges.
  if(!nav.huntWalkable){
    const flood=pad=>{const start=nav.nearest(pad,1.2,true),seen=new Set(start>=0?[start]:[]),queue=[...seen];
      for(let i=0;i<queue.length;i++)for(const edge of nav.nodes[queue[i]].nb)if(edge.type!=='climb'&&!seen.has(edge.to)){seen.add(edge.to);queue.push(edge.to);}return seen;};
    const left=flood(level.spawnPads[0]),right=flood(level.spawnPads[1]);nav.huntWalkable=new Set([...left].filter(id=>right.has(id)));
  }
  const candidates=[];const p=new THREE.Vector3();
  for(const n of nav.nodes){
    if(!nav.valid[n.id]||!nav.huntWalkable.has(n.id)||n.zone!==-1||!outsideHuntSpawns(n,level)||n.wet===2||n.overWater||n.nb.filter(e=>e.type==='walk').length<5)continue;
    let safe=true;
    for(const x of [-1.15,0,1.15])for(const z of [-1.05,0,1.05]){
      const h=level.groundHeight(n.x+x,n.z+z,n.y+.15,true);
      if(!Number.isFinite(h)||Math.abs(h-n.y)>.08||!physics.bodyFits(p.set(n.x+x,n.y+.04,n.z+z),.17,0,2.25,false)){safe=false;break;}
    }
    if(safe)candidates.push(n);
  }
  if(!candidates.length)return [];
  const selected=[];
  // Random starting point and randomized broad-spread choices across the full
  // safe surface pool. Minimum spacing keeps lids and interaction areas apart.
  let next=candidates[randomInt(0,candidates.length-1,random)];
  while(selected.length<count&&next){
    selected.push({x:next.x,y:next.y,z:next.z,nodeId:next.id});
    const ranked=candidates.map(n=>({n,d:Math.min(...selected.map(p=>(p.x-n.x)**2+(p.z-n.z)**2))})).filter(v=>v.d>=16).sort((a,b)=>b.d-a.d);
    const pool=ranked.slice(0,Math.max(1,Math.ceil(ranked.length*.3)));
    next=pool.length?pool[randomInt(0,pool.length-1,random)].n:null;
  }
  return selected;
}

export class WorldChests {
  static async create(options){
    const system=new WorldChests(options);
    try{await system.build();return system;}catch(e){system.dispose();throw e;}
  }
  constructor({scene,level,nav,physics,stageId,onReveal=()=>{}}){
    this.scene=scene;this.level=level;this.nav=nav;this.physics=physics;this.stageId=stageId;this.onReveal=onReveal;
    this.group=new THREE.Group();this.group.name='Chog map chests';this.entries=[];this.disposed=false;
    this.collectedTraits=new Set();this.tokenFinds=0;this.scene.add(this.group);
    this._a=new THREE.Vector3();this._b=new THREE.Vector3();
  }
  async build(){
    const points=chestLocations(this.level,this.nav,this.physics,20);
    if(points.length<20)throw new Error(`Only ${points.length} safe chest sites on ${this.stageId}; need 20`);
    const [coin,traits]=await Promise.all([loadCoin(),loadTraits()]);
    const models=await Promise.all(points.map(()=>ChogChest.create()));
    this.coinSource=coin;this.traitSources=traits;
    if(this.disposed){models.forEach(m=>m.dispose());return;}
    for(let i=0;i<points.length;i++){
      const chest=models[i],p=points[i];chest.group.scale.setScalar(.62);chest.group.position.set(p.x,p.y+.01,p.z);
      chest.group.rotation.y=Math.atan2(-p.x,-p.z);chest.glowEnabled=false;
      chest.group.userData.chestId=i;this.group.add(chest.group);
      this.entries.push({id:i,chest,point:p,kind:'empty',opened:false,elapsed:0,reward:null,revealed:false});
    }
    this.resetForMatch();
  }
  resetForMatch({random=randomUnit,traits=TRAIT_LOOT}={}){
    if(this.disposed)return;
    for(const e of this.entries)releaseChestCollider(e.collider);
    const count=randomInt(12,20,random);
    const points=chestLocations(this.level,this.nav,this.physics,count,random);
    if(points.length<count)throw new Error('Insufficient safe chest locations');
    const loot=createChestLoot(traits,count,random);this.targetTraits=traits;
    this.collectedTraits.clear();this.tokenFinds=0;this.tokenTotalMilli=0;
    this.roundId=crypto.randomUUID();this.count=count;
    for(let i=0;i<this.entries.length;i++){
      const e=this.entries[i];e.reward?.dispose();e.reward=null;e.opened=false;e.revealed=false;e.elapsed=0;
      e.active=i<count;e.chest.glowEnabled=false;e.chest.setOpen(false,{immediate:true});e.chest.group.visible=e.active;
      delete e.trait;delete e.amount;delete e.amountMilli;delete e.jackpot;
      if(!e.active){e.kind='empty';continue;}
      Object.assign(e,loot[i]);e.point=points[i];
      e.chest.group.position.set(e.point.x,e.point.y+.01,e.point.z);
      e.chest.group.rotation.y=random()*Math.PI*2;
      e.collider=fitChestCollider(this.level,e.chest.group,e.collider,{ignore:e.chest.fx,rebuild:false});
    }
    this.level._buildHash();
  }
  nearest(position,radius=2.5){
    let best=null,distance=radius;
    for(const e of this.entries){if(!e.active||e.opened)continue;const p=e.chest.group.position;
      const d=Math.hypot(position.x-p.x,position.z-p.z);
      if(d>=distance||Math.abs(position.y-p.y)>1.2)continue;
      this._a.copy(position);this._a.y+=.8;this._b.copy(p);this._b.y+=.55;
      if(!this.physics.los(this._a,this._b))continue;best=e;distance=d;
    }return best;
  }
  interact(actor){
    if(!actor?.alive)return false;const entry=this.nearest(actor.pos);
    return entry?this.open(entry.id):false;
  }
  open(id,actorId=null){
    if(G.match?.hunt&&(!G.match.hunt.authorizedOpen||!G.match.hunt.core.canOpen(actorId)))return false;
    const e=this.entries.find(e=>e.id===id);if(!e||!e.active||e.opened||this.disposed)return false;
    e.opened=true;e.chest.glowEnabled=e.kind!=='empty';e.chest.setOpen(true);return true;
  }
  reveal(e){
    const hunt=G.match?.hunt;if(hunt&&!hunt.canReveal())return;
    e.revealed=true;
    hunt?.onChestReveal(e);
    if(e.kind==='token'){e.reward=new ChestReward(e.chest.group,this.coinSource);this.tokenFinds++;this.tokenTotalMilli+=e.amountMilli;}
    if(e.kind==='trait'){
      if(!hunt){e.reward=new ChestReward(e.chest.group,this.traitSources.get(e.trait.id));
      e.reward.group.name='Chest trait: '+e.trait.id;}
      this.collectedTraits.add(e.trait.id);
    }
    this.onReveal({chestId:e.id,kind:e.kind,trait:e.trait||null,stageId:this.stageId,roundId:this.roundId,amount:e.amount||0,jackpot:!!e.jackpot,traitsFound:this.collectedTraits.size,complete:this.collectedTraits.size===this.targetTraits.length,visualOnly:true});
  }
  update(dt,camera){
    if(this.disposed)return;
    for(const e of this.entries){
      if(!e.active)continue;
      if(camera)e.chest.group.visible=camera.position.distanceToSquared(e.chest.group.position)<75*75;
      if(!e.opened)continue;
      e.chest.update(dt);
      // Delay the reward until the lid gives it enough room to leave the chest.
      if(!e.revealed&&e.chest.progress>=.62)this.reveal(e);
      if(e.revealed){e.elapsed+=dt;e.reward?.update(dt);if(e.elapsed>=REWARD_SECONDS){e.chest.glowEnabled=false;e.chest.update(0);}}
    }
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;
    for(const e of this.entries){releaseChestCollider(e.collider);e.reward?.dispose();e.chest.dispose();}this.entries.length=0;this.group.removeFromParent();
  }
}
