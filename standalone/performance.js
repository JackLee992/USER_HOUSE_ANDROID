// Rendering preferences never alter game clocks, requestAnimationFrame or physics.
export const PERFORMANCE_STORAGE_KEY = 'wanba_performance_v1';
export const PERFORMANCE_MODES = Object.freeze([
  Object.freeze({id:'eco',label:'省电',maxDpr:1,description:'降低画布精度与装饰特效，减少绘制负担。'}),
  Object.freeze({id:'normal',label:'普通',maxDpr:2,description:'平衡画面清晰度与绘制负担，适合日常游玩。'}),
  Object.freeze({id:'game',label:'游戏',maxDpr:3,description:'提高支持游戏的画布精度，保留完整装饰特效。'}),
]);
export const normalizePerformanceMode = value => PERFORMANCE_MODES.some(mode=>mode.id===value)?value:'normal';
const profile = mode => PERFORMANCE_MODES.find(item=>item.id===normalizePerformanceMode(mode));
export function createPerformanceService({storage,onChange=()=>{}}={}) {
  let mode='normal';
  try { mode=normalizePerformanceMode(storage?.getItem(PERFORMANCE_STORAGE_KEY)); } catch {}
  return Object.freeze({
    get mode(){return mode;},
    get profile(){return profile(mode);},
    pixelRatio(nativeRatio=1){
      const ratio=Number(nativeRatio);
      return Math.min(Number.isFinite(ratio)&&ratio>0?ratio:1,profile(mode).maxDpr);
    },
    setMode(value){
      const next=normalizePerformanceMode(value);
      if(next===mode)return mode;
      mode=next;
      try { storage?.setItem(PERFORMANCE_STORAGE_KEY,mode); } catch {}
      onChange(mode);return mode;
    },
  });
}
const services=new WeakMap();
const defaultWindow=()=>globalThis.window||globalThis;
const STYLE_ID='wanba-performance-style';
function mountStyles(doc){
  if(!doc?.head||doc.getElementById(STYLE_ID))return;
  const style=doc.createElement('style');style.id=STYLE_ID;
  // Only cosmetic selectors: do not disable game transitions or animation-end events.
  style.textContent=`
html[data-wanba-performance="eco"] body.wanba-standalone #wanbanXiaowu-shell,
html[data-wanba-performance="eco"] body.wanba-standalone .wb-modal-mask {backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
html[data-wanba-performance="eco"] body.wanba-standalone #wanbanXiaowu-popup .wanba-art-sprite,
html[data-wanba-performance="eco"] body.wanba-standalone #wanbanXiaowu-popup .wb-water-bottle {filter:none!important}
html[data-wanba-performance="eco"] body.wanba-standalone #wanbanXiaowu-popup :is(.wb-game-card,.wanba-game-art-icon) {box-shadow:none!important;transition:none!important}
html[data-wanba-performance="eco"] body.wanba-standalone #wanbanXiaowu-popup :is(.wb-turkey-danger-bar.critical span.on,.wb-link-time.danger,.wb-link-tile.hint,.wb-spider-countdown.danger,.wb-gcell.recycle,.wb-gcell.eaten,.wb-popstar-cell.hint,.wb-bomb-cell.boom) {animation:none!important}
html[data-wanba-performance="eco"] body.wanba-standalone #wanbanXiaowu-popup .wb-popstar-cell.hint {outline:2px solid var(--wb-gold,#c99738);outline-offset:-2px}
`;
  doc.head.append(style);
}
function applyMode(win,mode){
  const doc=win.document;
  if(doc?.documentElement)doc.documentElement.dataset.wanbaPerformance=mode;
  for(const select of doc?.querySelectorAll?.('[data-wanba-performance-picker]')||[])select.value=mode;
  for(const description of doc?.querySelectorAll?.('[data-wanba-performance-description]')||[])description.textContent=profile(mode).description;
}
export function initPerformance(win=defaultWindow()){
  if(services.has(win))return services.get(win);
  let storage;try{storage=win.localStorage;}catch{}
  const service=createPerformanceService({storage,onChange:mode=>{
    applyMode(win,mode);
    if(typeof win.CustomEvent==='function')win.dispatchEvent?.(new win.CustomEvent('wanba-performance-change',{detail:{mode}}));
  }});
  services.set(win,service);mountStyles(win.document);applyMode(win,service.mode);return service;
}
export const getPerformanceMode=(win=defaultWindow())=>initPerformance(win).mode;
export const setPerformanceMode=(value,win=defaultWindow())=>initPerformance(win).setMode(value);
export const getCanvasPixelRatio=(win=defaultWindow())=>initPerformance(win).pixelRatio(win.devicePixelRatio);
export function mountPerformancePicker(container){
  if(!container||container.querySelector('[data-wanba-performance-picker]'))return;
  const doc=container.ownerDocument,win=doc.defaultView,service=initPerformance(win);
  const section=doc.createElement('section');section.className='wb-panel';
  const title=doc.createElement('div');title.className='wb-section-title';title.textContent='性能与画质';
  const field=doc.createElement('div');field.className='wb-field';
  const label=doc.createElement('label');label.htmlFor='wanba-performance';label.textContent='性能模式';
  const select=doc.createElement('select');select.id='wanba-performance';select.className='wb-select';select.dataset.wanbaPerformancePicker='';
  for(const mode of PERFORMANCE_MODES){const option=doc.createElement('option');option.value=mode.id;option.textContent=mode.label;select.append(option);}
  select.value=service.mode;select.onchange=()=>service.setMode(select.value);
  const description=doc.createElement('p');description.className='wb-muted';description.dataset.wanbaPerformanceDescription='';description.setAttribute('role','status');description.textContent=service.profile.description;
  const note=doc.createElement('p');note.className='wb-muted';note.textContent='画布精度在下次进入游戏时生效；游戏速度和操作规则保持一致。';
  field.append(label,select,description);section.append(title,field,note);
  const appearance=container.querySelector('#wb-theme')?.closest('section');
  if(appearance)appearance.after(section);else container.append(section);
}
