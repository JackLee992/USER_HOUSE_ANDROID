// Analytic 3D spheres + batched additive effects, without a framework or postprocessing targets.
// Two draw calls for the entire chain, projectile, trails, sparks and shockwaves.
export function createMarbleGL(canvas,onFallback=()=>{}) {
  let gl,ballProgram,fxProgram,ballBuffer,fxBuffer,texture,lost=false,ready=false;
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
  const onLost=event=>{event.preventDefault();lost=true;ready=false;canvas.hidden=true;onFallback();};canvas.addEventListener('webglcontextlost',onLost);
  function program(vsSource,fsSource){
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){gl.deleteShader(s);throw Error('Shader unavailable');}return s;};
    let vs,fs,p;try{vs=compile(gl.VERTEX_SHADER,vsSource);fs=compile(gl.FRAGMENT_SHADER,fsSource);p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('WebGL link unavailable');return p;}catch(error){if(p)gl.deleteProgram(p);throw error;}finally{if(vs)gl.deleteShader(vs);if(fs)gl.deleteShader(fs);}
  }
  try{
    gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});if(!gl)throw Error('WebGL unavailable');
    ballProgram=program(vertex,fragment);fxProgram=program(fxVertex,fxFragment);ballBuffer=gl.createBuffer();fxBuffer=gl.createBuffer();
    texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.enable(gl.BLEND);gl.clearColor(0,0,0,0);
  }catch{if(gl){if(texture)gl.deleteTexture(texture);if(ballBuffer)gl.deleteBuffer(ballBuffer);if(fxBuffer)gl.deleteBuffer(fxBuffer);if(ballProgram)gl.deleteProgram(ballProgram);if(fxProgram)gl.deleteProgram(fxProgram);gl.getExtension('WEBGL_lose_context')?.loseContext();}lost=true;canvas.hidden=true;onFallback();}
  const loc=(p,n)=>!lost&&p&&gl.getUniformLocation(p,n),ballSize=loc(ballProgram,'uSize'),ballTime=loc(ballProgram,'uTime'),fxSize=loc(fxProgram,'uSize');
  let ballVertices=new Float32Array(128*54),fxVertices=new Float32Array(220*60);
  const corners=[[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]];
  function attributes(p,fields,stride){let offset=0;for(const [name,size]of fields){const a=gl.getAttribLocation(p,name);if(a>=0){gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,stride*4,offset*4);}offset+=size;}}
  return {
    get ready(){return ready&&!lost;},
    setAtlas(image){if(lost||!image)return;try{gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);ready=gl.getError()===gl.NO_ERROR;canvas.hidden=!ready;}catch{ready=false;canvas.hidden=true;onFallback();}},
    draw(balls,width,height,time,atlasWidth,atlasHeight,effects=[]){
      if(!ready||lost)return false;const required=balls.length*54;if(ballVertices.length<required)ballVertices=new Float32Array(required*2);let p=0;
      for(const {x,y,r,rect,spin=0}of balls){for(const [dx,dy]of corners){ballVertices[p++]=x+dx*r;ballVertices[p++]=y+dy*r;ballVertices[p++]=dx;ballVertices[p++]=dy;ballVertices[p++]=rect[0]/atlasWidth;ballVertices[p++]=rect[1]/atlasHeight;ballVertices[p++]=rect[2]/atlasWidth;ballVertices[p++]=rect[3]/atlasHeight;ballVertices[p++]=spin;}}
      gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(ballProgram);gl.uniform2f(ballSize,width,height);gl.uniform1f(ballTime,time);gl.bindBuffer(gl.ARRAY_BUFFER,ballBuffer);attributes(ballProgram,[['aPosition',2],['aLocal',2],['aRect',4],['aSpin',1]],9);gl.bufferData(gl.ARRAY_BUFFER,ballVertices.subarray(0,p),gl.DYNAMIC_DRAW);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.TRIANGLES,0,balls.length*6);
      if(effects.length){
        if(fxVertices.length<effects.length*60)fxVertices=new Float32Array(effects.length*120);p=0;
        for(const {x,y,r,kind=0,alpha=1,color=[1,.8,.4],stretch=1,angle=0,phase=0}of effects){const c=Math.cos(angle),s=Math.sin(angle);for(const [dx,dy]of corners){fxVertices[p++]=x+(dx*c*stretch-dy*s)*r;fxVertices[p++]=y+(dx*s*stretch+dy*c)*r;fxVertices[p++]=dx;fxVertices[p++]=dy;fxVertices[p++]=color[0];fxVertices[p++]=color[1];fxVertices[p++]=color[2];fxVertices[p++]=alpha;fxVertices[p++]=kind;fxVertices[p++]=phase;}}
        gl.useProgram(fxProgram);gl.uniform2f(fxSize,width,height);gl.bindBuffer(gl.ARRAY_BUFFER,fxBuffer);attributes(fxProgram,[['aPosition',2],['aLocal',2],['aColor',4],['aParams',2]],10);gl.bufferData(gl.ARRAY_BUFFER,fxVertices.subarray(0,p),gl.DYNAMIC_DRAW);gl.blendFunc(gl.ONE,gl.ONE);gl.drawArrays(gl.TRIANGLES,0,effects.length*6);
      }
      return true;
    },
    destroy(){canvas.removeEventListener('webglcontextlost',onLost);if(gl&&!lost){gl.deleteTexture(texture);gl.deleteBuffer(ballBuffer);gl.deleteBuffer(fxBuffer);gl.deleteProgram(ballProgram);gl.deleteProgram(fxProgram);gl.getExtension('WEBGL_lose_context')?.loseContext();}ready=false;lost=true;},
  };
}
