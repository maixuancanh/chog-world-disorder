import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withTraitCounts} from '../../../src/ui/chog-trait-stats.js';
test('complete Genesis metadata counts reproduce supplied OpenSea examples',()=>{
 const data=JSON.parse(fs.readFileSync('../../assets/chog-testnet/genesis-trait-counts.json','utf8'));
 const attrs=[['Background','Light Purple',183,9],['Base','Origin',1869,95],['Body','Duck Float',29,1],['Tier','Common',1279,65]];
 const result=withTraitCounts(attrs.map(([trait_type,value])=>({trait_type,value})),data);
 result.forEach((r,i)=>{assert.equal(r.count,attrs[i][2]);assert.equal(r.percent,attrs[i][3]);});
 assert.equal(withTraitCounts([{trait_type:'Unknown',value:'Missing'}],data)[0].count,null);
 assert.throws(()=>withTraitCounts([],{metadataCount:70,supply:1969}));
});
