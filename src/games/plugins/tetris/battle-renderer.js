import {getCanvasPixelRatio} from '../../../../standalone/performance.js';
import {cells,ghostY,SHAPES} from './battle-engine.js';

export const BLOCK_COLORS=Object.freeze(['#43c9d5','#f2ce58','#b28ce8','#669bed','#edaa58','#e47891','#73caa0','#66768b']);
export function createBattleRenderer(canvases,host,doc){
  const contexts=Object.fromEntries(Object.entries(canvases).map(([key,canvas])=>[key,canvas.getContext('2d')]));
  let dead=false,ratio=1,cell=20,side=76,tiles=[],lastKey='',drawCount=0,compact=false;
  const sizes={};
  function release(){for(const tile of tiles)tile.width=tile.height=0;tiles=[];}
  function resize(width,height,options={}){
    if(dead)return;compact=!!options.compact;const availableHeight=Math.max(compact?96:236,Math.min(1000,Number(height)||400));
    if(compact){cell=Math.max(4,Math.floor(availableHeight/20));side=Math.max(20,Math.floor(Math.min(60,(availableHeight-16)/2.4,(width-cell*10-20)/3)));}
    else {side=Math.max(44,Math.min(84,Math.floor((availableHeight-60)/4)));cell=Math.max(10,Math.floor(Math.min((Math.max(220,Number(width)||320)-84-14)/10,availableHeight/20)));}
    const wanted=getCanvasPixelRatio(host);ratio=Math.min(wanted,Math.sqrt(4000000/(cell*cell*200+side*side*(compact?5.2:4))));release();
    const dimensions={board:[cell*10,cell*20],hold:[side,side*(compact?.8:.6)],next:[side,side*(compact?2.4:1.4)],opponent:[side,side*2]};
    for(const [key,canvas]of Object.entries(canvases)){const [w,h]=dimensions[key];sizes[key]=[w,h];canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);canvas.style.width=w+'px';canvas.style.height=h+'px';contexts[key].setTransform(ratio,0,0,ratio,0,0);}
    for(const color of BLOCK_COLORS){const tile=doc.createElement('canvas');tile.width=tile.height=Math.ceil(40*ratio);const ctx=tile.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);const gradient=ctx.createLinearGradient(0,0,0,40);gradient.addColorStop(0,color);gradient.addColorStop(1,color);ctx.fillStyle=gradient;ctx.beginPath();ctx.roundRect(1,1,38,38,5);ctx.fill();ctx.fillStyle='#ffffff35';ctx.fillRect(5,4,30,3);tiles.push(tile);}
    lastKey='';
  }
  function block(ctx,value,x,y,size){if(value>0&&value<=8)ctx.drawImage(tiles[value-1],x,y,size,size);}
  function board(key,p,ghost){
    const ctx=contexts[key],[w,h]=sizes[key],s=w/10;ctx.clearRect(0,0,w,h);ctx.fillStyle='#172232';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#ffffff08';ctx.lineWidth=.6;ctx.beginPath();for(let x=1;x<10;x++){ctx.moveTo(x*s,0);ctx.lineTo(x*s,h);}for(let y=1;y<20;y++){ctx.moveTo(0,y*s);ctx.lineTo(w,y*s);}ctx.stroke();
    ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
    p.board.forEach((row,y)=>row.forEach((v,x)=>block(ctx,v,x*s,y*s,s)));
    const shape=cells(p.current);
    if(ghost&&!p.dead){const y=ghostY(p);ctx.strokeStyle=BLOCK_COLORS[p.current.type]+'99';ctx.lineWidth=Math.max(1,s*.065);shape.forEach((row,dy)=>row.forEach((v,dx)=>{if(v)ctx.strokeRect((p.current.x+dx)*s+2,(y+dy)*s+2,s-4,s-4);}));}
    if(!p.dead)shape.forEach((row,y)=>row.forEach((v,x)=>block(ctx,v,(p.current.x+x)*s,(p.current.y+y)*s,s)));
    ctx.restore();
  }
  function preview(key,types,disabled=false){
    const ctx=contexts[key],[w,h]=sizes[key];ctx.clearRect(0,0,w,h);ctx.globalAlpha=disabled?.42:1;
    types.forEach((type,i)=>{if(type===null||type===undefined)return;const shape=SHAPES[type],occupied=[];shape.forEach((row,y)=>row.forEach((v,x)=>{if(v)occupied.push({x,y,v});}));const minX=Math.min(...occupied.map(c=>c.x)),maxX=Math.max(...occupied.map(c=>c.x)),minY=Math.min(...occupied.map(c=>c.y)),maxY=Math.max(...occupied.map(c=>c.y));const slot=h/types.length,s=Math.min(w/5,slot/3),ox=(w-(maxX-minX+1)*s)/2,oy=i*slot+(slot-(maxY-minY+1)*s)/2;for(const item of occupied)block(ctx,item.v,ox+(item.x-minX)*s,oy+(item.y-minY)*s,s);});ctx.globalAlpha=1;
  }
  function draw(state,force=false){
    if(dead||!tiles.length)return false;const flashes=(state.events||[]).filter(e=>e.kind==='clear'&&state.ticks-e.tick<15);const key=state.revision+':'+(flashes.length?Math.floor(state.ticks/3):'');if(!force&&key===lastKey)return false;lastKey=key;drawCount++;
    board('board',state.players[0],true);preview('hold',[state.players[0].hold],state.players[0].holdUsed);preview('next',state.players[0].queue.slice(0,3));
    if(state.mode==='duel')board('opponent',state.players[1],false);else contexts.opponent.clearRect(0,0,...sizes.opponent);
    for(const event of flashes){if(event.player===1&&state.mode!=='duel')continue;const key=event.player?'opponent':'board',ctx=contexts[key],s=sizes[key][0]/10;ctx.fillStyle='rgba(236,251,255,'+(.32*(1-(state.ticks-event.tick)/15))+')';for(const y of event.rows)ctx.fillRect(0,y*s,s*10,s);}
    return true;
  }
  return {resize,draw,getStats:()=>({pixelRatio:ratio,cell,side,compact,spriteCount:tiles.length,drawCount,width:cell*10,height:cell*20}),destroy(){if(dead)return;dead=true;release();for(const canvas of Object.values(canvases))canvas.width=canvas.height=0;}};
}
