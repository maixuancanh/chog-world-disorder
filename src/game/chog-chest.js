import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const ROOT = new URL('../../assets/chog-chest/', import.meta.url);
let assets;
function loadParts() {
  if (!assets) {
    const loader = new GLTFLoader();
    assets = Promise.all(['body.glb', 'lid.glb'].map(p => loader.loadAsync(new URL(p, ROOT).href)))
      .catch(error => { assets = null; throw error; });
  }
  return assets;
}
const smooth = t => t * t * t * (t * (t * 6 - 15) + 10);

/** Reusable world prop. Local origin is the bottom, +Z is the front.
 * Opening is visual only: callers decide interaction range, loot and authority.
 * Imported geometry/textures are shared; dispose only releases per-chest FX.
 */
export class ChogChest {
  static async create() {
    const parts = await loadParts();
    return new ChogChest(parts.map(p => p.scene.clone(true)));
  }
  constructor([body, lid]) {
    this.group = new THREE.Group(); this.group.name = 'Chog treasure chest';
    this.group.add(body);
    this.hinge = new THREE.Group(); this.hinge.name = 'Lid back-edge pivot';
    this.hinge.position.set(0, .96, -.80);
    lid.position.set(0, 0, .80);
    this.hinge.add(lid); this.group.add(this.hinge);
    this.group.traverse(o => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this.owned = [];
    const purple = this.own(new THREE.MeshStandardMaterial({ color: '#38214e', roughness: .85, side: THREE.DoubleSide }));
    const cream = this.own(new THREE.MeshStandardMaterial({ color: '#ffe9bb', roughness: .55 }));
    // Replace the generated orange streaks inside the body with a clean inset bowl.
    const floor = this.box(2.03, .05, 1.20, purple); floor.position.set(0, .405, 0);
    this.group.add(floor);
    for (const s of [-1, 1]) {
      const end = this.box(.065, .54, 1.24, purple); end.position.set(s * 1.005, .665, 0); this.group.add(end);
      const wall = this.box(2.05, .54, .065, purple); wall.position.set(0, .665, s * .595); this.group.add(wall);
    }
    // Cream raised lip stays on the lid and frames its recessed arched lining.
    for (const s of [-1, 1]) {
      const end = this.box(.065, .055, 1.46, cream); end.position.set(s * 1.13, -.004, .80); this.hinge.add(end);
      const rail = this.box(2.24, .055, .065, cream); rail.position.set(0, -.004, .80 + s * .73); this.hinge.add(rail);
    }
    this.fx = new THREE.Group(); this.fx.name = 'Chest opening glow'; this.group.add(this.fx);
    this.glowMat = this.own(new THREE.MeshBasicMaterial({ color: '#ffbb47', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const mouth = new THREE.Mesh(this.own(new THREE.PlaneGeometry(2.05, 1.25)), this.glowMat);
    mouth.rotation.x = -Math.PI / 2; mouth.position.y = .88; this.fx.add(mouth);
    this.rayMat = this.own(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { strength: { value: 0 }, time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv; uniform float strength; uniform float time;
        void main(){float x=abs(vUv.x-.5)*2.;float edge=1.-smoothstep(.22+.48*vUv.y,1.,x);
        float fade=pow(1.-vUv.y,1.8)*smoothstep(0.,.12,vUv.y);
        float stripe=.68+.32*sin(vUv.x*29.+time*.5);
        gl_FragColor=vec4(1.,.62,.17,edge*fade*stripe*strength*.38);}`,
    }));
    const rayGeo = this.own(new THREE.PlaneGeometry(2.1, 2.65));
    for (let i = 0; i < 3; i++) {
      const ray = new THREE.Mesh(rayGeo, this.rayMat); ray.position.set(0, 2.05, 0); ray.rotation.y = i * Math.PI / 3; this.fx.add(ray);
    }
    this.light = new THREE.PointLight('#ffb849', 0, 5, 2); this.light.position.set(0, 1.12, .08); this.fx.add(this.light);
    const positions = new Float32Array(32 * 3);
    this.sparkGeo = this.own(new THREE.BufferGeometry()); this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sparkMat = this.own(new THREE.PointsMaterial({ color: '#ffe7a0', size: .045, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks = new THREE.Points(this.sparkGeo, this.sparkMat); this.sparks.frustumCulled = false; this.fx.add(this.sparks);
    this.progress = 0; this.target = 0; this.time = 0; this.fx.visible = false; this.glowEnabled = true;
  }
  own(resource) { this.owned.push(resource); return resource; }
  box(w, h, d, material) {
    return new THREE.Mesh(this.own(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * .35)), material);
  }
  setOpen(open, { immediate = false } = {}) {
    this.target = open ? 1 : 0;
    if (immediate) this.progress = this.target;
    this.update(0);
  }
  toggle() { this.setOpen(!this.target); }
  update(dt) {
    dt = Math.max(0, Math.min(dt, .1)); this.time += dt;
    const delta = this.target - this.progress;
    this.progress += Math.sign(delta) * Math.min(Math.abs(delta), dt / .95);
    const k = smooth(this.progress);
    // Negative X lifts the front (+Z) while the rear pivot never moves.
    this.hinge.rotation.x = -THREE.MathUtils.degToRad(105) * k;
    const glow = this.glowEnabled ? THREE.MathUtils.smoothstep(k, .08, .75) : 0;
    this.fx.visible = glow > .001;
    this.glowMat.opacity = glow * .38;
    this.rayMat.uniforms.strength.value = glow;
    this.rayMat.uniforms.time.value = this.time;
    this.sparkMat.opacity = glow * .85;
    this.light.intensity = glow * (13 + Math.sin(this.time * 2.4) * 1.1);
    if (this.fx.visible) {
      const a = this.sparkGeo.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const t = (this.time * .26 + i * .618034) % 1;
        a.setXYZ(i, Math.sin(i * 14.3) * .82 + Math.sin(this.time + i) * t * .08, .92 + t * 2.0, Math.cos(i * 9.1) * .48);
      }
      a.needsUpdate = true;
    }
  }
  dispose() { this.group.removeFromParent(); for (const r of this.owned) r.dispose(); this.owned.length = 0; }
}

