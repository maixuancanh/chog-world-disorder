// Repair upper-body skin weights once per loaded template, before cloning actors.
// Smooth along welded mesh edges, including UV seams; never change the mesh shape.
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
export function repairChogSkin(scene){
 scene.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;
  const g=mesh.geometry,p=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight,index=g.index;
  if(!index||!si||!sw)return;
  const names=mesh.skeleton.bones.map(b=>b.name.replace(/^mixamorig:?/,''));
  const chest=names.indexOf('Spine2')>=0?names.indexOf('Spine2'):names.indexOf('Spine1');
  if(chest<0)return;
  const limb=names.map(n=>/^(Left|Right)(Shoulder|Arm|ForeArm|Hand)/.test(n));
  const ids=new Int32Array(p.count).fill(-1),nodes=[],weld=new Map();
  for(let i=0;i<p.count;i++){
   const y=p.getY(i);if(y<.64||y>1.015)continue;
   const key=[p.getX(i),y,p.getZ(i)].map(n=>Math.round(n*100000)).join(',');
   let id=weld.get(key);if(id===undefined){id=nodes.length;weld.set(key,id);nodes.push({vertices:[],edges:new Set(),weights:new Map(),y,side:Math.abs(p.getZ(i))});}
   ids[i]=id;const node=nodes[id];node.vertices.push(i);
   for(let j=0;j<4;j++){const bone=si.getComponent(i,j),w=sw.getComponent(i,j);node.weights.set(bone,(node.weights.get(bone)||0)+w);}
  }
  for(const n of nodes){
   for(const [bone,w]of n.weights)n.weights.set(bone,w/n.vertices.length);
   // A-pose sleeves move outward as they descend. Interior torso vertices
   // must not retain residual arm weights from nearest-surface transfer.
   const center=.132+Math.max(0,.934-n.y)*.5;
   const allowed=smooth(center-.115,center-.075,n.side);
   const fade=smooth(.64,.70,n.y)*(1-smooth(.965,1.015,n.y));let removed=0;
   for(const [bone,w]of n.weights)if(limb[bone]){const take=w*(1-allowed)*fade;n.weights.set(bone,w-take);removed+=take;}
   n.weights.set(chest,(n.weights.get(chest)||0)+removed);
  }
  for(let i=0;i<index.count;i+=3)for(let e=0;e<3;e++){
   const a=ids[index.getX(i+e)],b=ids[index.getX(i+(e+1)%3)];
   if(a>=0&&b>=0&&a!==b){nodes[a].edges.add(b);nodes[b].edges.add(a);}
  }
  for(let pass=0;pass<12;pass++){
   const next=nodes.map(n=>{
    const blend=.45*smooth(.64,.69,n.y)*(1-smooth(.965,1.015,n.y));
    if(!n.edges.size||blend===0)return n.weights;
    const w=new Map([...n.weights].map(([b,v])=>[b,v*(1-blend)]));
    for(const id of n.edges)for(const [b,v]of nodes[id].weights)w.set(b,(w.get(b)||0)+v*blend/n.edges.size);
    return w;
   });nodes.forEach((n,i)=>n.weights=next[i]);
  }
  for(const n of nodes){const ranked=[...n.weights].filter(([,v])=>v>1e-7).sort((a,b)=>b[1]-a[1]).slice(0,4),total=ranked.reduce((s,[,v])=>s+v,0);
   if(!total)continue;
   for(const i of n.vertices)for(let j=0;j<4;j++){si.setComponent(i,j,ranked[j]?.[0]||0);sw.setComponent(i,j,(ranked[j]?.[1]||0)/total);}
  }
  si.needsUpdate=true;sw.needsUpdate=true;
 });
}
