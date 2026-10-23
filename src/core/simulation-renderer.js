import * as THREE from 'three';

// Authoritative simulation keeps geometry, transforms and CPU paint accounting.
// It never creates a graphics context, render buffers, shaders or a post stack.
export class SimulationRenderer {
 constructor(container,settings={}){
  this.container=container;this.settings=settings;this.scene=null;this.camera=null;
  this.touch=false;this.appleGPU=false;this.noMSAA=true;this.samples=0;this.dynScale=1;
  this.q={pixelRatio:1,msaa:0,ao:false,bloom:false};
  this.grade={uniforms:{tDiffuse:{value:null},uSat:{value:1.08},uVib:{value:.12},uContrast:{value:1.07},uShadowTint:{value:new THREE.Vector3(.975,.99,1.035)},uHighTint:{value:new THREE.Vector3(1.025,1,.972)},uLift:{value:0},uExposure:{value:1},uVignette:{value:.22},uHurt:{value:0},uHurtColor:{value:new THREE.Color(1,.2,.3)},uFlash:{value:0},uAspect:{value:1}}};
  const canvas=document.createElement('canvas');canvas.id='game-canvas';canvas.width=1;canvas.height=1;container.appendChild(canvas);
  let target=null,pixelRatio=1,alpha=1;const color=new THREE.Color(0x9fd8f0),size=new THREE.Vector2(1,1);
  const context={getExtension:()=>null,getParameter:()=>0};
  const renderInfo={calls:0,triangles:0,points:0,lines:0,frame:0};
  this.renderer={
   isWebGLRenderer:false,isSimulationRenderer:true,domElement:canvas,autoClear:true,
   outputColorSpace:THREE.SRGBColorSpace,toneMapping:THREE.NeutralToneMapping,toneMappingExposure:1,
   debug:{checkShaderErrors:false},capabilities:{getMaxAnisotropy:()=>1},
   shadowMap:{enabled:false,autoUpdate:false,needsUpdate:false,type:THREE.PCFShadowMap},xr:{enabled:false},
   info:{autoReset:false,render:renderInfo,memory:{geometries:0,textures:0},programs:[],reset(){renderInfo.calls=renderInfo.triangles=renderInfo.points=renderInfo.lines=0;renderInfo.frame++;}},
   state:{buffers:{depth:{setMask(){}}}},
   getContext:()=>context,getRenderTarget:()=>target,setRenderTarget(value){target=value;},
   getClearColor(value){return value.copy(color);},getClearAlpha:()=>alpha,
   setClearColor(value,nextAlpha=1){color.set(value);alpha=nextAlpha;},
   getPixelRatio:()=>pixelRatio,setPixelRatio(value){pixelRatio=value;},
   getSize(value){return value.copy(size);},getDrawingBufferSize(value){return value.copy(size).multiplyScalar(pixelRatio).floor();},
   setSize(width,height){size.set(width,height);canvas.width=Math.max(1,Math.floor(width*pixelRatio));canvas.height=Math.max(1,Math.floor(height*pixelRatio));},
   clear(){},compile(){},async compileAsync(){},
   render(scene,camera){scene?.updateMatrixWorld();camera?.updateMatrixWorld();},
   dispose(){},forceContextLoss(){},
  };
 }
 setScene(scene,camera){this.scene=scene;this.camera=camera;this.resize();}
 applySettings(settings){this.settings=settings;}
 setExtraPass(pass){this.extraPass=pass;}
 dynFloor(){return 1;}
 setDynamicScale(){this.dynScale=1;}
 resize(){
  // No physical framebuffer: one CSS-sized canvas is sufficient for input.
  const width=Math.max(1,globalThis.innerWidth||1),height=Math.max(1,globalThis.innerHeight||1);
  this._w=width;this._h=height;this.renderer.setSize(width,height);this.grade.uniforms.uAspect.value=width/height;
  if(this.camera){this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
 }
 render(){this.scene?.updateMatrixWorld();this.camera?.updateMatrixWorld();}
}
