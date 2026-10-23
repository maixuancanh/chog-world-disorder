import { Character } from './character.js';
import { getChogGeometry, makeChogMaterials } from './chog-geometry.js';

// Appearance adapter only. Foot plants, IK, stance, head stabilisation, arm swing,
// weapon handling and jump/land all remain Character's original implementation.
export class ChogCharacter extends Character {
  constructor(opts={}) {
    super({...opts,style:{...opts.style,hair:0,hat:0},name:opts.name||'Chog'});
    this.root.name='chog:'+this.name;
    this.tank.group.visible=false;
    this.chogWeapon=true;
  }
  _tierParts() {
    const g=getChogGeometry();
    if(!this.mats.chogBody){
      const m=makeChogMaterials();Object.assign(this.mats,m);
      this._ownMats.push(m.chogBody,m.chogHead,m.chogFace,m.chogOutline);
    }
    return [
      {key:'chogBody',geo:g.body,mat:'chogBody',shadow:true},
      {key:'chogHead',geo:g.head,mat:'chogHead',shadow:true},
      {key:'chogFace',geo:g.face,mat:'chogFace',shadow:false},
      {key:'chogBodyOutline',geo:g.bodyOutline,mat:'chogOutline',shadow:false},
      {key:'chogHeadOutline',geo:g.headOutline,mat:'chogOutline',shadow:false},
    ];
  }
  _tierSet(t){
    const set=super._tierSet(t);
    // Curved face decals and toon outlines must not shadow themselves at millimetre offsets.
    for(const mesh of set.list)mesh.receiveShadow=false;
    return set;
  }
  update(dt,state){
    super.update(dt,state);
    this.tank.group.visible=false;
    if(this.weapon){this.weapon.pivot.visible=this.chogWeapon&&!this.weaponHidden; if(this.weapon.left)this.weapon.left.pivot.visible=this.chogWeapon&&!this.weaponHidden;}
  }
  setChogWeapon(visible){this.chogWeapon=!!visible;}
  dispose(){this.mats.gradient?.dispose();super.dispose();}
}
