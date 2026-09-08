export function wordGuessFixture() {
  return ['风筝','算盘','竹笛','雨伞','茶杯'].map((word,index)=>({
    word,type:index===0?'传统物件 <img src=x onerror=alert(1)>':'日常物件',length:word.length,
    clues:['它和日常生活有关','人们很久以前就在使用','可以拿在手里','各有不同的用途','想一想它的名字'],
    interactions:{start:'第一条线索',clue:['再想一想','换一个角度','已经很接近','最后一条线索'],guess:['还没有猜中'],win:'答对了',reveal:'揭晓题目'},
  }));
}
class Element {
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.dataset={};this.style={};this.children=[];this.value='';this._text='';this._html='';}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this.children.length?this.children.map(child=>child.textContent).join(''):this._text;}
  set innerHTML(value){this._html=String(value);this.children=[];this._text='';}
  get innerHTML(){return this._html;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];this._text='';}
  remove(){this.removed=true;}
}
export async function wordGuessHarness(createGame,savedState){
  const nodes=new Map(),writes=[],events=[];let paused=false,bankReads=0;
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector);};
  const doc={createElement:tag=>new Element(tag),createTextNode:value=>({textContent:String(value)})};
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const env={settings:()=>({}),qs:node,getHostDocument:()=>doc,displayCharName:()=> '电脑',selectedWordGuessRoleName:()=>'',wordGuessBankSource:()=> 'default',
    defaultWordGuessBank:async()=>{bankReads++;return wordGuessFixture();},wordGuessBank:()=>[],selectWordGuessRounds:(bank,count)=>bank.slice(0,count),
    normalizeWordGuessRoundData:structuredClone,currentGame:'wordguess',get gamePaused(){return paused;},
    saveProgress:(id,state)=>{if(id!=='wordguess')throw Error('Wrong save key');writes.push(structuredClone(state));},
    clearProgress:id=>events.push(['clear',id]),scores:()=>({wordguess:0}),setScore:(...args)=>events.push(['score',...args]),
    addTaWin:id=>events.push(['taWin',id]),showGameOver:(...args)=>events.push(['finish',...args]),
    speak(){},speakText(){},toast:text=>events.push(['toast',text]),esc:escape,modalMaskClass:()=> 'wb-modal-mask',appendModalMask:mask=>events.push(['modal',mask.id]),
  };
  await createGame(env,savedState?structuredClone(savedState):null);
  return {node,writes,events,paused:value=>{paused=value;},bankReads:()=>bankReads,
    snapshot:()=>structuredClone(writes.at(-1)),
    fields:()=>Object.fromEntries(node('#wb-word-meta').children.map(item=>[item.dataset.wordStat,{label:item.children[0].textContent,value:item.children[2].textContent,preserved:Object.hasOwn(item.children[2].dataset,'i18nSkip')}]))};
}
