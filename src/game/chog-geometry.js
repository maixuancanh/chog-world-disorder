// Chog appearance for the unmodified Inkwave skeleton. All coordinates are in kid space.
// Pelvis and legs share one surface; arm surfaces overlap the shoulder inside the torso.
// Keeping arms out of the torso SDF prevents hands touching hips in rest from creating skin webs.
import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONE_INDEX, getRestPositions } from './character-geo.js';

const PURPLE = new THREE.Color('#7040da'), PINK = new THREE.Color('#ff91bc');
const BLACK = '#23142d', CREAM = '#fff3ce';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
let cached;

function sphereDistance(x, y, z, s) {
  const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2];
  const a = dx / s.r[0], b = dy / s.r[1], c = dz / s.r[2];
  const k0 = Math.hypot(a, b, c), k1 = Math.hypot(a / s.r[0], b / s.r[1], c / s.r[2]);
  return k1 > 1e-8 ? k0 * (k0 - 1) / k1 : -Math.min(...s.r);
}
function distance(x, y, z, s) {
  if (s.c) return sphereDistance(x, y, z, s);
  const dx = x - s.a[0], dy = y - s.a[1], dz = z - s.a[2];
  const t = clamp((dx * s.v[0] + dy * s.v[1] + dz * s.v[2]) / s.len2, 0, 1);
  return Math.hypot(dx - t * s.v[0], dy - t * s.v[1], dz - t * s.v[2]) - (s.r0 + (s.r1 - s.r0) * t);
}
function capsule(a, b, r0, r1, bone, next) {
  a = a.toArray(); b = b.toArray();
  const v = b.map((q, i) => q - a[i]);
  return { a, b, v, len2: v.reduce((n, q) => n + q*q, 0), r0, r1, bone, next };
}
function softMin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h*h*k*0.25;
}

function bodyGeometry(rest) {
  const parts = [
    { c: [0, .79, -.008], r: [.103, .192, .088], bone: 'spine' },
    { c: [0, .655, -.004], r: [.112, .100, .092], bone: 'hips' },
    { c: [0, .925, -.012], r: [.139, .056, .083], bone: 'chest' },
    capsule(rest.chest, rest.head, .060, .057, 'chest', 'neck'),
  ];
  const arms=[];
  for (const side of ['L', 'R']) {
    const arm=[];
    arm.push(capsule(rest['uArm'+side], rest['fArm'+side], .043, .035, 'uArm'+side, 'fArm'+side));
    arm.push(capsule(rest['fArm'+side], rest['hand'+side], .035, .031, 'fArm'+side, 'hand'+side));
    parts.push(capsule(rest['thigh'+side], rest['shin'+side], .066, .050, 'thigh'+side, 'shin'+side));
    parts.push(capsule(rest['shin'+side], rest['foot'+side], .050, .037, 'shin'+side, 'foot'+side));
    const hand = rest['hand'+side], foot = rest['foot'+side];
    arm.push({ c: [hand.x, hand.y-.036, hand.z+.010], r: [.047, .065, .046], bone: 'hand'+side, pink: true });
    arms.push(implicitGeometry(arm,60,.32,.725,hand.x));
    parts.push({ c: [foot.x, .060, foot.z+.046], r: [.065, .054, .105], bone: 'foot'+side, pink: true });
  }
  const surfaces=[implicitGeometry(parts,88,.61,.555,0),...arms];
  const result=mergeGeometries(surfaces,false);surfaces.forEach(g=>g.dispose());return result;
}
function implicitGeometry(parts,res,half,cy,cx){
  const mc = new MarchingCubes(res, undefined, false, false, 42000); mc.isolation = 0;
  for (let z = 0; z < res; z++) for (let y = 0; y < res; y++) for (let x = 0; x < res; x++) {
    const wx = (x/res*2-1)*half+cx, wy = (y/res*2-1)*half+cy, wz = (z/res*2-1)*half;
    let d = 9;
    for (const p of parts) d = softMin(d, distance(wx, wy, wz, p), .014);
    mc.field[x+y*res+z*res*res] = -d;
  }
  mc.update();
  if (mc.count >= 42000*3) throw new Error('Chog body surface exceeded geometry budget');
  const geo = new THREE.BufferGeometry();
  const positions = mc.geometry.attributes.position.array.slice(0, mc.count*3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = positions[i]*half+cx; positions[i+1] = positions[i+1]*half+cy; positions[i+2] *= half;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const si = [], sw = [], colors = [], c = new THREE.Color();
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i+1], z = positions[i+2];
    const ds = parts.map(p => distance(x,y,z,p)), min = Math.min(...ds), weights = new Map();
    let pink = 0, sum = 0;
    const add = (b,w) => weights.set(b, (weights.get(b)||0)+w);
    parts.forEach((p,j) => {
      const w = Math.exp(-Math.max(0,ds[j]-min)*105); sum += w;
      if (p.pink) pink += w;
      if (p.next) {
        const t = clamp(((x-p.a[0])*p.v[0]+(y-p.a[1])*p.v[1]+(z-p.a[2])*p.v[2])/p.len2,0,1);
        const mix = smooth(.72,1,t)*.5; add(p.bone,w*(1-mix)); add(p.next,w*mix);
      } else add(p.bone,w);
    });
    const w4 = [...weights].sort((a,b)=>b[1]-a[1]).slice(0,4), total = w4.reduce((n,p)=>n+p[1],0);
    for (let k=0;k<4;k++) { si.push(w4[k]?BONE_INDEX[w4[k][0]]:0); sw.push(w4[k]?w4[k][1]/total:0); }
    c.copy(PURPLE).lerp(PINK, smooth(.18,.72,pink/sum)); colors.push(c.r,c.g,c.b);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si,4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw,4));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const welded = mergeVertices(geo, .0001); welded.computeVertexNormals(); welded.computeBoundingSphere();
  mc.geometry.dispose(); geo.dispose();
  return welded;
}

function tint(geo, color) {
  const c = new THREE.Color(color), n = geo.attributes.position.count, colors = new Float32Array(n*3);
  for (let i=0;i<n;i++) { colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(colors,3));
  geo.deleteAttribute('uv');
  return geo.index ? geo.toNonIndexed() : geo;
}
// Tessellate curved decals before projection; boundary-only triangles would cut through the skull.
function subdivide(geometry,levels=3){
  let src=geometry.index?geometry.toNonIndexed():geometry;
  for(let k=0;k<levels;k++){
    const p=src.attributes.position,pts=[];
    for(let i=0;i<p.count;i+=3){
      const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);
      const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);
      for(const v of [a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca])pts.push(v.x,v.y,v.z);
    }
    const next=new THREE.BufferGeometry();next.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
    if(src!==geometry)src.dispose();src=next;
  }
  src.computeVertexNormals();return src;
}
function headGeometry(rest) {
  const geos=[], center=new THREE.Vector3(0,rest.head.y+.135,rest.head.z);
  function ellipsoid(p,r,col,segments=28) {
    const g=new THREE.SphereGeometry(1,segments,20); g.scale(...r); g.translate(p[0]+center.x,p[1]+center.y,p[2]+center.z); geos.push(tint(g,col));
  }
  // A rounded skull and a tapered, double-curved quill shell, not a constant-depth extrusion.
  ellipsoid([0,0,0],[.246,.234,.182],'#6834ca',32);
  const silhouette=[[-.10,-.20],[-.25,-.19],[-.215,-.13],[-.355,-.11],[-.265,-.035],[-.365,.040],[-.25,.105],[-.285,.255],[-.145,.185],[0,.365],[.115,.185],[.295,.255],[.25,.105],[.365,.040],[.265,-.035],[.355,-.11],[.215,-.13],[.25,-.19],[.10,-.20],[0,-.235]];
  const outline=[];
  silhouette.forEach((p,i)=>{const q=silhouette[(i+1)%silhouette.length];for(let j=0;j<3;j++)outline.push([p[0]+(q[0]-p[0])*j/3,p[1]+(q[1]-p[1])*j/3]);});
  const pos=[],indices=[],N=outline.length,rings=7;
  for(const side of [1,-1])for(let r=0;r<=rings;r++){
    const t=r/rings,depth=(side===1?.13:-.25)*Math.sqrt(Math.max(0,1-t*t))-.045;
    for(const [x,y] of outline)pos.push(center.x+x*t,center.y+y*t,center.z+depth);
  }
  for(let side=0;side<2;side++)for(let r=0;r<rings;r++)for(let i=0;i<N;i++){
    const a=side*(rings+1)*N+r*N+i,b=side*(rings+1)*N+r*N+(i+1)%N,c=a+N,d=b+N;
    if(side===0)indices.push(a,b,c,b,d,c);else indices.push(a,c,b,b,c,d);
  }
  const crown=new THREE.BufferGeometry();crown.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));crown.setIndex(indices);crown.computeVertexNormals();geos.push(tint(crown,'#6d36d0'));
  const faceStart=geos.length;
  const faceZ=(x,y,off=0)=>.008+.182*Math.sqrt(Math.max(.015,1-(x/.250)**2-(y/.238)**2))+off;
  function patch(shape,col,off=.002,levels=2){
    const base=new THREE.ShapeGeometry(shape,18),g=subdivide(base,levels),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setXYZ(i,x+center.x,y+center.y,center.z+faceZ(x,y,off));}
    g.computeVertexNormals();geos.push(tint(g,col));base.dispose();
  }
  function oval(x,y,rx,ry,col,off){const s=new THREE.Shape();s.absellipse(x,y,rx,ry,0,Math.PI*2,false,0);patch(s,col,off,1);}
  // Cream face and features follow the actual rounded surface, including in profile.
  const f=new THREE.Shape();
  f.moveTo(-.222,.012); f.bezierCurveTo(-.247,-.07,-.208,-.163,-.105,-.18);
  f.bezierCurveTo(-.04,-.197,.04,-.197,.105,-.18); f.bezierCurveTo(.208,-.163,.247,-.07,.222,.012);
  f.lineTo(.198,.082);f.lineTo(.142,.076);f.lineTo(.154,.119);f.lineTo(.053,.102);f.lineTo(0,.079);f.lineTo(-.053,.102);f.lineTo(-.154,.119);f.lineTo(-.142,.076);f.lineTo(-.198,.082);f.closePath();
  patch(f,CREAM,.002,3);
  for(const side of [-1,1]){
    oval(side*.100,.002,.063,.082,BLACK,.005);
    oval(side*.100,.002,.058,.077,'#fffdf5',.007);
    oval(side*.096,-.001,.043,.068,BLACK,.009);
    oval(side*.096-.012,.028,.014,.021,'#ffffff',.011);
    oval(side*.096+.005,-.023,.007,.008,'#ffffff',.011);
    oval(side*.169,-.089,.047,.038,'#ff4c9b',.012);
  }
  const n=new THREE.Shape();n.moveTo(-.024,-.056);n.quadraticCurveTo(0,-.043,.024,-.056);n.quadraticCurveTo(.02,-.068,0,-.079);n.quadraticCurveTo(-.02,-.068,-.024,-.056);
  patch(n,'#ef72aa',.010);
  const mouthCurve=new THREE.CatmullRomCurve3([[-.071,-.108],[-.04,-.124],[0,-.129],[.04,-.124],[.071,-.108]].map(([x,y])=>new THREE.Vector3(x,y,faceZ(x,y,.009)).add(center)));
  geos.push(tint(new THREE.TubeGeometry(mouthCurve,20,.003,6,false),BLACK));
  const head=mergeGeometries(geos.slice(0,faceStart),false),face=mergeGeometries(geos.slice(faceStart),false);
  for(const geo of [head,face]){
    const count=geo.attributes.position.count,ids=new Uint16Array(count*4),weights=new Float32Array(count*4);
    for(let i=0;i<count;i++){ids[i*4]=BONE_INDEX.head;weights[i*4]=1;}
    geo.setAttribute('skinIndex',new THREE.BufferAttribute(ids,4));geo.setAttribute('skinWeight',new THREE.BufferAttribute(weights,4));geo.computeBoundingSphere();
  }
  geos.forEach(g=>g.dispose());return {head,face};
}
function outline(geo,thickness){
  const g=geo.clone(),p=g.attributes.position,n=g.attributes.normal;
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)+n.getX(i)*thickness,p.getY(i)+n.getY(i)*thickness,p.getZ(i)+n.getZ(i)*thickness);
  g.computeBoundingSphere();return g;
}
export function getChogGeometry(){
  if(cached)return cached;
  const rest=getRestPositions({hair:0,hat:0,brows:0});
  const body=bodyGeometry(rest),{head,face}=headGeometry(rest);
  cached={body,head,face,bodyOutline:outline(body,.0027),headOutline:outline(head,.0028)};
  return cached;
}
export function makeChogMaterials(){
  const gradient=new THREE.DataTexture(new Uint8Array([85,85,85,255,165,165,165,255,235,235,235,255,255,255,255,255]),4,1,THREE.RGBAFormat);
  gradient.minFilter=THREE.NearestFilter;gradient.magFilter=THREE.NearestFilter;gradient.needsUpdate=true;
  const body=new THREE.MeshToonMaterial({vertexColors:true,gradientMap:gradient});
  const head=new THREE.MeshToonMaterial({vertexColors:true,gradientMap:gradient});
  const face=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  const ink=new THREE.MeshBasicMaterial({color:'#26133e',side:THREE.BackSide});
  return {chogBody:body,chogHead:head,chogFace:face,chogOutline:ink,gradient};
}
