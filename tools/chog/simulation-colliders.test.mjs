import test from 'node:test';import assert from 'node:assert/strict';
import {checkColliderSnapshot,generateColliderSnapshot} from './build-simulation-colliders.mjs';
import {simulationColliders} from '../../src/world/simulation-colliders.js';
test('simulation collider source fingerprint is current and all modes get isolated exact boxes',async()=>{
 const {snapshot}=await checkColliderSnapshot();assert.equal(Object.keys(snapshot.layouts).length,8);
 for(const [layout,entries]of Object.entries(snapshot.layouts))for(const mode of ['hunt','boss','control','trials']){
  const expected=entries.filter(e=>e.modes.includes(mode)).flatMap(e=>e.colliders),actual=simulationColliders(layout,mode);assert.deepEqual(actual,expected);
  if(actual.length){actual[0].simulationTestMutation=true;assert.deepEqual(simulationColliders(layout,mode),expected);}
 }
 assert.throws(()=>simulationColliders('invented','hunt'),/No verified/);assert.throws(()=>simulationColliders('tidewater','invented'),/No verified/);
});
test('baked low-quality colliders exactly match high-quality client prop definitions',async()=>{
 const {source,snapshot}=await checkColliderSnapshot(),actual=await generateColliderSnapshot(source,{quality:'high'});assert.deepEqual(actual.layouts,snapshot.layouts);
});
