import * as THREE from 'three';

// Collision-only oriented boxes use the native character controller. No render
// geometry or paint faces are added; interaction rays still reach the chest.
export function fitChestCollider(level,object,previous=null,{ignore=null,rebuild=true}={}){
 object.updateWorldMatrix(true,true);
 const localBox=new THREE.Box3(),inverse=object.matrixWorld.clone().invert(),matrix=new THREE.Matrix4(),point=new THREE.Vector3();
 const visit=node=>{
  if(node===ignore)return;
  if(node.isMesh){
   const geometry=node.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
   const box=geometry.boundingBox;matrix.multiplyMatrices(inverse,node.matrixWorld);
   for(let i=0;i<8;i++){point.set(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z).applyMatrix4(matrix);localBox.expandByPoint(point);}
  }
  for(const child of node.children)visit(child);
 };visit(object);
 if(localBox.isEmpty())throw Error('Chest has no collision geometry');
 const scale=object.getWorldScale(new THREE.Vector3()),center=localBox.getCenter(new THREE.Vector3()).applyMatrix4(object.matrixWorld),size=localBox.getSize(new THREE.Vector3()).multiply(scale);
 const rotation=new THREE.Euler().setFromQuaternion(object.getWorldQuaternion(new THREE.Quaternion()),'YXZ');
 // Let Level calculate the OBB axes and broadphase bounds exactly as map props.
 level._addBlock({kind:'obox',center:center.toArray(),size:size.toArray(),rotY:THREE.MathUtils.radToDeg(rotation.y),hidden:true,paint:false,noNav:true,tag:'chog-chest'});
 const built=level.blocks.pop();let block=previous;
 if(block){const id=block.id;Object.assign(block,built);block.id=id;}
 else {block=built;block.id=level.blocks.length;level.blocks.push(block);}
 block.bodyOnly=true;block.solid=true;
 if(rebuild)level._buildHash();
 return block;
}
export function releaseChestCollider(block){if(block)block.solid=false;}
