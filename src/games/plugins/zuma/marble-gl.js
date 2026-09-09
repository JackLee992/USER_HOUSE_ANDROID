// Analytic 3D spheres + batched additive effects, without a framework or postprocessing targets.
// Two draw calls for the entire chain, projectile, trails, sparks and shockwaves.
import { createWebGLSurface } from '../../shared/webgl-surface.js';

export function createMarbleGL(canvas,onFallback=()=>{}) {
  let ready=false;
  const vertex=`attribute vec2 aPosition;attribute vec2 aLocal;attribute vec4 aRect;attribute float aSpin;
    uniform vec2 uSize;varying vec2 vLocal;varying vec4 vRect;varying float vSpin;
    void main(){vLocal=aLocal;vRect=aRect;vSpin=aSpin;gl_Position=vec4(aPosition/uSize*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);}`;
  const fragment=`precision mediump float;uniform sampler2D uAtlas;uniform float uTime;
    varying vec2 vLocal;varying vec4 vRect;varying float vSpin;
    void main(){float rr=dot(vLocal,vLocal);if(rr>1.)discard;
      vec3 n=vec3(vLocal.x,-vLocal.y,sqrt(max(0.,1.-rr)));
      // Rotate the sphere's surface in object space, independently of world-space light.
      float c=cos(vSpin),s=sin(vSpin);vec3 materialN=vec3(n.x*c+n.z*s,n.y,-n.x*s+n.z*c);
      vec2 decal=clamp(vec2(materialN.x,-materialN.y)*.455+.5,.04,.96);
      vec3 tex=texture2D(uAtlas,vRect.xy+decal*vRect.zw).rgb;
      vec3 key=normalize(vec3(-.45,.65,1.1)),fill=normalize(vec3(.9,-.2,.6));
      float diffuse=max(0.,dot(n,key)),fillLight=max(0.,dot(n,fill));
      float spec=pow(max(0.,dot(n,normalize(key+vec3(0.,0.,1.)))),44.);
      float rim=pow(1.-n.z,3.);
      vec3 lit=tex*(.43+.65*diffuse+.13*fillLight)+vec3(1.,.96,.78)*spec*.48+vec3(.14,.31,.23)*rim;
      float alpha=(1.-smoothstep(.982,1.,rr));gl_FragColor=vec4(lit*alpha,alpha);}`;
  const fxVertex=`attribute vec2 aPosition;attribute vec2 aLocal;attribute vec4 aColor;attribute vec2 aParams;
    uniform vec2 uSize;varying vec2 vLocal;varying vec4 vColor;varying vec2 vParams;
    void main(){vLocal=aLocal;vColor=aColor;vParams=aParams;gl_Position=vec4(aPosition/uSize*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);}`;
  const fxFragment=`precision mediump float;varying vec2 vLocal;varying vec4 vColor;varying vec2 vParams;
    void main(){float d=length(vLocal);if(d>1.)discard;float light;
      if(vParams.x>.5&&vParams.x<1.5){float ring=abs(d-.72);light=exp(-ring*ring*650.)+.18*exp(-ring*ring*65.);}
      else if(vParams.x>1.5){float rays=pow(abs(cos(atan(vLocal.y,vLocal.x)*4.+vParams.y*3.)),12.);light=exp(-d*d*15.)+rays*.2*(1.-d);}
      else{light=exp(-d*d*8.)+.55*exp(-d*d*60.);}
      float a=light*vColor.a;gl_FragColor=vec4(vColor.rgb*a,a*.58);}`;
  const surface=createWebGLSurface(canvas,{onFallback:()=>{ready=false;onFallback();}});
  const ballBatch=surface.createBatch({vertex,fragment,
    attributes:[['aPosition',2],['aLocal',2],['aRect',4],['aSpin',1]],
    uniforms:{uSize:'vec2',uTime:'float',uAtlas:'sampler2D'},blend:'alpha'});
  const fxBatch=surface.createBatch({vertex:fxVertex,fragment:fxFragment,
    attributes:[['aPosition',2],['aLocal',2],['aColor',4],['aParams',2]],
    uniforms:{uSize:'vec2'},blend:'additive'});
  const texture=surface.createTexture();
  let ballVertices=new Float32Array(128*54),fxVertices=new Float32Array(220*60);
  const corners=[[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]];
  return {
    get ready(){return ready&&surface.available;},
    setAtlas(image){if(!surface.available||!image)return;ready=surface.uploadTexture(texture,image);canvas.hidden=!ready;},
    draw(balls,width,height,time,atlasWidth,atlasHeight,effects=[]){
      if(!ready||!surface.available)return false;const required=balls.length*54;if(ballVertices.length<required)ballVertices=new Float32Array(required*2);let p=0;
      for(const {x,y,r,rect,spin=0}of balls){for(const [dx,dy]of corners){ballVertices[p++]=x+dx*r;ballVertices[p++]=y+dy*r;ballVertices[p++]=dx;ballVertices[p++]=dy;ballVertices[p++]=rect[0]/atlasWidth;ballVertices[p++]=rect[1]/atlasHeight;ballVertices[p++]=rect[2]/atlasWidth;ballVertices[p++]=rect[3]/atlasHeight;ballVertices[p++]=spin;}}
      if(!surface.beginFrame()||!surface.drawBatch(ballBatch,{vertices:ballVertices.subarray(0,p),count:balls.length*6,uniforms:{uSize:[width,height],uTime:time},textures:{uAtlas:texture}}))return false;
      if(effects.length){
        if(fxVertices.length<effects.length*60)fxVertices=new Float32Array(effects.length*120);p=0;
        for(const {x,y,r,kind=0,alpha=1,color=[1,.8,.4],stretch=1,angle=0,phase=0}of effects){const c=Math.cos(angle),s=Math.sin(angle);for(const [dx,dy]of corners){fxVertices[p++]=x+(dx*c*stretch-dy*s)*r;fxVertices[p++]=y+(dx*s*stretch+dy*c)*r;fxVertices[p++]=dx;fxVertices[p++]=dy;fxVertices[p++]=color[0];fxVertices[p++]=color[1];fxVertices[p++]=color[2];fxVertices[p++]=alpha;fxVertices[p++]=kind;fxVertices[p++]=phase;}}
        if(!surface.drawBatch(fxBatch,{vertices:fxVertices.subarray(0,p),count:effects.length*6,uniforms:{uSize:[width,height]}}))return false;
      }
      return true;
    },
    destroy(){ready=false;surface.destroy();},
  };
}
