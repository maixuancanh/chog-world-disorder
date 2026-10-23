import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const threeURL=new URL('../../vendor/three/build/three.module.js',import.meta.url).href;
const THREE=await import(threeURL),source=fs.readFileSync(new URL('../../src/core/simulation-renderer.js',import.meta.url),'utf8').replace("from 'three'",`from '${threeURL}'`);
const {SimulationRenderer}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('authoritative renderer creates no GPU context and preserves renderer state contract',async()=>{
 const saved=globalThis.document;let contexts=0,appended;
 globalThis.document={createElement(name){assert.equal(name,'canvas');return {getContext(){contexts++;throw Error('GPU context forbidden');}};}};
 try{
  const R=new SimulationRenderer({appendChild(canvas){appended=canvas;}},{quality:'low'}),r=R.renderer;
  assert.equal(contexts,0);assert.equal(appended.id,'game-canvas');assert.equal(r.isWebGLRenderer,false);assert.equal(r.getContext().getExtension('ANY'),null);assert.equal(r.getContext().getParameter(0),0);
  const target={width:4,height:4};r.setRenderTarget(target);assert.equal(r.getRenderTarget(),target);r.setRenderTarget(null);
  r.setClearColor(0x123456,.2);assert.equal(r.getClearColor(new THREE.Color()).getHex(),0x123456);assert.equal(r.getClearAlpha(),.2);
  r.setPixelRatio(2);r.setSize(64,32);assert.deepEqual(r.getSize(new THREE.Vector2()).toArray(),[64,32]);assert.deepEqual(r.getDrawingBufferSize(new THREE.Vector2()).toArray(),[128,64]);
  r.clear();r.compile();await r.compileAsync();r.info.reset();assert.equal(r.info.render.calls,0);assert.equal(r.capabilities.getMaxAnisotropy(),1);
  R.grade.uniforms.uHurt.value=.5;R.grade.uniforms.uHurtColor.value.set(0xffffff);assert.equal(R.grade.uniforms.uHurt.value,.5);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),mesh=new THREE.Object3D();scene.add(mesh);mesh.position.set(1,2,3);R.setScene(scene,camera);R.render();assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(mesh.matrixWorld).toArray(),[1,2,3]);
  R.applySettings({quality:'high'});R.setExtraPass({});R.setDynamicScale(.5);assert.equal(R.dynFloor(),1);assert.equal(R.dynScale,1);assert.equal(contexts,0);
 }finally{globalThis.document=saved;}
});
