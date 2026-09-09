import {getCanvasPixelRatio,getPerformanceMode} from '../../../../standalone/performance.js';
import {ARENA_RULES} from './arena-engine.js';
export const SNAKE_COLORS=Object.freeze(['#23a899','#f39b45','#8176d9','#dd687f','#4c9fc9','#95aa4d']);
export function createArenaRenderer(canvas,host,doc){
  const ctx=canvas.getContext('2d');let width=360,height=500,ratio=1,dead=false,lastDrawCalls=0;
  const sprites=new Map();
  function sprite(color,food=false){const key=color+':'+food;if(sprites.has(key))return sprites.get(key);const c=doc.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');const gradient=g.createRadialGradient(23,18,2,32,32,30);gradient.addColorStop(0,food?'#ffffff':'#d3fff0');gradient.addColorStop(.24,SNAKE_COLORS[color]);gradient.addColorStop(1,SNAKE_COLORS[color]);g.fillStyle=gradient;g.beginPath();g.arc(32,32,29,0,Math.PI*2);g.fill();if(!food){g.strokeStyle='rgba(25,55,70,.12)';g.lineWidth=2;g.stroke();}sprites.set(key,c);return c;}
  function resize(w,h){if(dead)return;width=Math.max(240,Math.min(1400,Math.round(w||360)));height=Math.max(280,Math.min(1400,Math.round(h||500)));ratio=Math.min(getCanvasPixelRatio(host),Math.sqrt(4e6/(width*height)));canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);canvas.style.width='100%';canvas.style.height='100%';}
  function draw(state){if(dead)return;lastDrawCalls=0;ctx.setTransform(ratio,0,0,ratio,0,0);ctx.fillStyle='#f1f6f7';ctx.fillRect(0,0,width,height);
    const player=state.snakes[0],scale=Math.min(width/510,height/540),vw=width/scale,vh=height/scale;
    const cameraX=Math.max(vw/2,Math.min(ARENA_RULES.width-vw/2,player.x)),cameraY=Math.max(vh/2,Math.min(ARENA_RULES.height-vh/2,player.y));
    const left=cameraX-vw/2,top=cameraY-vh/2,right=left+vw,bottom=top+vh;
    ctx.save();ctx.scale(scale,scale);ctx.translate(-left,-top);ctx.fillStyle='#d7e3e5';
    for(let y=Math.floor(top/56)*56;y<bottom;y+=56)for(let x=Math.floor(left/56)*56;x<right;x+=56){ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#b9d0d2';ctx.lineWidth=12;ctx.strokeRect(3,3,ARENA_RULES.width-6,ARENA_RULES.height-6);
    const visible=(x,y,r=25)=>x>left-r&&x<right+r&&y>top-r&&y<bottom+r;
    for(const dot of state.food){if(!visible(dot.x,dot.y))continue;const size=dot.value>1?12:7;ctx.drawImage(sprite(dot.color,true),dot.x-size,dot.y-size,size*2,size*2);lastDrawCalls++;}
    const skip=getPerformanceMode(host)==='eco'?3:2;
    for(const snake of [...state.snakes.filter(s=>s.id!=='player'),player]){
      if(!snake.alive)continue;const radius=ARENA_RULES.radius,art=sprite(snake.color);
      if(snake.boost&&getPerformanceMode(host)!=='eco'){ctx.strokeStyle=SNAKE_COLORS[snake.color]+'35';ctx.lineWidth=radius*3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(snake.x,snake.y);for(let i=0;i<snake.body.length;i+=4)ctx.lineTo(snake.body[i].x,snake.body[i].y);ctx.stroke();}
      for(let i=snake.body.length-1;i>=0;i-=skip){const p=snake.body[i];if(!visible(p.x,p.y))continue;const taper=Math.min(1,.55+(snake.body.length-i)/8),r=radius*taper;ctx.drawImage(art,p.x-r,p.y-r,r*2,r*2);lastDrawCalls++;}
      if(!visible(snake.x,snake.y))continue;ctx.drawImage(art,snake.x-radius*1.15,snake.y-radius*1.15,radius*2.3,radius*2.3);lastDrawCalls++;
      const fx=Math.cos(snake.angle),fy=Math.sin(snake.angle);
      for(const side of [-1,1]){const x=snake.x+fx*5-fy*side*5.3,y=snake.y+fy*5+fx*side*5.3;ctx.fillStyle='white';ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#18333e';ctx.beginPath();ctx.arc(x+fx*1.6,y+fy*1.6,2.3,0,Math.PI*2);ctx.fill();}
    }
    ctx.restore();const margin=Math.min(player.x,player.y,ARENA_RULES.width-player.x,ARENA_RULES.height-player.y);if(margin<100){ctx.strokeStyle='rgba(210,86,74,'+(1-margin/100)*.65+')';ctx.lineWidth=5;ctx.strokeRect(2.5,2.5,width-5,height-5);}
  }
  return {resize,draw,getStats:()=>({width,height,pixelRatio:ratio,spriteCount:sprites.size,lastDrawCalls}),destroy(){if(dead)return;dead=true;for(const c of sprites.values())c.width=c.height=0;sprites.clear();canvas.width=canvas.height=0;}};
}
