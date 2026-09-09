import {createSudokuModel, countSolutions, conflictCells, isComplete, maskDigits, PEERS} from './model.js';
import {sudokuLabels, formatSudokuLabel} from './labels.js';
import {sudokuStyles} from './styles.js';
import {getLocale} from '../../../../standalone/i18n.js';
import {createDemandRenderer} from '../../shared/demand-renderer.js';

export const GAME_ID = 'sudoku';
export const GAME_VERSION = '1.1.0';
export const HOST_API_VERSION = 1;

// A stable DOM board shares the demand renderer without opening a GPU context.
export function createGame(env, saved) {
  const doc=env.document,win=env.window,host=env.legacy;
  const text=sudokuLabels(getLocale(win)),fmt=(key,values={})=>formatSudokuLabel(text[key],values);
  const choice=host.choiceForState('sudoku',saved),model=createSudokuModel(saved,{blanks:choice.blanks,difficulty:choice.id});
  // Legacy puzzles may have multiple valid solutions. Never judge one against
  // the old cached solution unless uniqueness has actually been proved.
  let uniquePuzzle=false;try{uniquePuzzle=countSolutions(model.state.puzzle,2,{maxNodes:250000})===1;}catch{}
  const options={autoCheck:!!saved?.sudokuOptions?.autoCheck};
  let destroyed=false,won=false,dialogKind='',lastFocus=null,hint=null,renders=0,boardSize=0;
  const nativeImmersive=value=>{try{win.NativeBridge?.setGameImmersive?.(value)?.catch?.(()=>{});}catch{}};
  if(!doc.getElementById('wb-sudoku-product-css')){const style=doc.createElement('style');style.id='wb-sudoku-product-css';style.textContent=sudokuStyles;doc.head.append(style);}
  const portal=doc.createElement('section');portal.id='wb-sudoku-fullscreen';portal.dataset.gameVersion=GAME_VERSION;
  portal.dataset.theme=host.settings().theme||'day';portal.setAttribute('aria-label',text.title);
  const element=(tag,cls,label)=>{const el=doc.createElement(tag);if(cls)el.className=cls;if(label!=null)el.textContent=label;return el;};
  const iconPaths={
    '‹':['M15 5 8 12l7 7'],
    '⚙':['m9 3-.7 2.2-2 .9-2.1-.6-1.5 2.6 1.6 1.6-.2 2.3-1.6 1.5L4 16l2.2-.5 1.8 1.3.3 2.2 3 .6 1.2-1.9 2.3-.2 1.5 1.6 2.6-1.5-.6-2.2.9-2 2.2-.7V9.8l-2.2-.7-.9-2 .6-2.1-2.6-1.5-1.6 1.6-2.3-.2L12 3Z','M14.8 11a3.8 3.8 0 1 1-7.6 0 3.8 3.8 0 0 1 7.6 0Z'],
    '↶':['M8 4 3 9l5 5','M3 9h11a6 6 0 0 1 0 12h-3'],
    '↷':['m16 4 5 5-5 5','M21 9H10a6 6 0 0 0 0 12h3'],
    '⌫':['M9 4h12v16H9l-7-8Z','m12 9 6 6m0-6-6 6'],
    '✎':['m4 16-1 5 5-1L21 7l-4-4Z','m14 6 4 4M4 16l4 4'],
    '☼':['M8 15c-6-5-2-13 4-13s10 8 4 13l-1 3H9Z','M9 21h6M9 18h6'],
    'Ⅱ':['M8 4v16M16 4v16']
  };
  const button=(id,label,icon,action,cls='sd-tool')=>{
    const b=element('button',cls);b.type='button';b.id=id;b.setAttribute('aria-label',label);b.title=label;
    if(icon){const i=element('span','sd-icon');i.setAttribute('aria-hidden','true');const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');for(const d of iconPaths[icon]||[]){const path=doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);svg.append(path);}i.append(svg);b.append(i);}
    b.append(element('span','sd-label',label));b.onclick=action;return b;
  };
  const head=element('header','sd-head'),heading=element('div','sd-heading');
  heading.append(element('h1','',text.title),element('small','',text.subtitle));
  head.append(button('wb-sudoku-exit',text.saveExit,'‹',()=>openDialog('pause'),'sd-round'),heading,button('wb-sudoku-settings',text.settings,'⚙',()=>openDialog('settings'),'sd-round'));
  const layout=element('main','sd-layout'),boardArea=element('section','sd-board-area'),meta=element('div','sd-meta');
  const difficulty=element('strong','sd-difficulty',text.difficulty[choice.id]||choice.title),clock=element('span','sd-clock');
  clock.id='wb-sudoku-time';clock.setAttribute('aria-label',text.time);meta.append(difficulty,clock);
  const boardWrap=element('div','sd-board-wrap'),board=element('div','sd-grid');board.id='wb-sudoku-board';
  board.setAttribute('role','grid');board.setAttribute('aria-label',text.title);board.setAttribute('aria-rowcount','9');board.setAttribute('aria-colcount','9');
  const cells=Array.from({length:81},(_,i)=>{
    const cell=element('button','sd-cell');cell.type='button';cell.dataset.i=String(i);cell.dataset.sudokuCell='1';
    cell.setAttribute('role','gridcell');cell.setAttribute('aria-rowindex',String(Math.floor(i/9)+1));cell.setAttribute('aria-colindex',String(i%9+1));
    if(i%9===2||i%9===5)cell.classList.add('sd-box-right');if(Math.floor(i/9)===2||Math.floor(i/9)===5)cell.classList.add('sd-box-bottom');
    const value=element('span','sd-value'),notes=element('span','sd-notes');notes.setAttribute('aria-hidden','true');
    const marks=Array.from({length:9},()=>element('span'));notes.append(...marks);cell.append(value,notes);board.append(cell);return {cell,value,notes,marks};
  });
  board.onclick=e=>{const cell=e.target.closest('[data-sudoku-cell]');if(cell&&canEdit()){hint=null;changed(model.select(Number(cell.dataset.i)));}};
  boardWrap.append(board);const progress=element('div','sd-progress');progress.id='wb-sudoku-progress';
  progress.setAttribute('role','progressbar');progress.setAttribute('aria-label',text.filled);progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax','81');
  const progressFill=element('i');progress.append(progressFill);boardArea.append(meta,boardWrap,progress);
  const controls=element('section','sd-controls'),context=element('div','sd-context');context.id='wb-sudoku-context';context.setAttribute('role','status');context.setAttribute('aria-live','polite');
  const tools=element('div','sd-tools');
  const undo=button('wb-sudoku-undo',text.undo,'↶',()=>edit(()=>model.undo())),redo=button('wb-sudoku-redo',text.redo,'↷',()=>edit(()=>model.redo()));
  const erase=button('wb-sudoku-erase',text.erase,'⌫',()=>edit(()=>model.erase()));
  const notesButton=button('wb-sudoku-notes',text.notes,'✎',()=>edit(()=>model.setInputMode(model.state.inputMode==='note'?'pen':'note')));
  const hintButton=button('wb-sudoku-hint',text.hint,'☼',()=>{if(canEdit()){hint=model.previewHint();render();openDialog('hint');}});
  tools.append(undo,redo,erase,notesButton,hintButton,button('wb-sudoku-pause',text.pause,'Ⅱ',()=>openDialog('pause')));
  const keypad=element('div','sd-keypad');keypad.setAttribute('aria-label',text.selectNumber);
  const keys=Array.from({length:9},(_,i)=>{const b=button('wb-sudoku-number-'+(i+1),String(i+1),'',()=>edit(()=>model.chooseNumber(i+1)),'sd-number');b.dataset.n=String(i+1);const count=element('small');b.append(count);keypad.append(b);return {b,count};});
  const bottom=element('div','sd-bottom');bottom.append(button('wb-sudoku-auto-notes',text.autoNotes,'',()=>openDialog('autoNotes'),'sd-link'),button('wb-sudoku-help',text.help,'',()=>openDialog('help'),'sd-link'));
  controls.append(context,tools,keypad,bottom);layout.append(boardArea,controls);portal.append(head,layout);
  const mask=element('div','sd-mask');mask.hidden=true;const dialog=element('section','sd-dialog');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','wb-sudoku-dialog-title');
  const dialogTitle=element('h2');dialogTitle.id='wb-sudoku-dialog-title';const dialogBody=element('div','sd-dialog-body'),dialogActions=element('div','sd-dialog-actions');
  dialog.append(dialogTitle,dialogBody,dialogActions);mask.append(dialog);portal.append(mask);doc.body.append(portal);nativeImmersive(true);
  const setText=(node,value)=>{if(node.textContent!==String(value))node.textContent=String(value);};
  // UI may paint a pause sheet; game mutations are separately guarded by canEdit.
  const renderer=createDemandRenderer({window:win,document:doc,isActive:()=>!destroyed&&env.isActive(),isPaused:()=>false,render});
  function canEdit(){return !destroyed&&!won&&!dialogKind&&!env.isPaused()&&!doc.hidden&&env.isActive();}
  function save(){if(!destroyed&&!won)env.save({...model.serialize(),...host.choiceSavePatch('sudoku',choice),sudokuOptions:{...options}},true);}
  function edit(action){if(canEdit()){hint=null;changed(action());}}
  function changed(result){renderer.invalidate();save();if(result?.changed&&isComplete(model.state.grid,model.state.puzzle))complete();}
  function render(){
    if(destroyed)return;renders++;
    const s=model.state,selected=s.selected,v=s.numberFirst?s.activeNumber:(s.grid[selected]||0),conflicts=new Set(conflictCells(s.grid));
    const peers=new Set(selected>=0?PEERS[selected]:[]),hintCells=new Set(hint?.cells||[]);if(hint?.index>=0)hintCells.add(hint.index);
    for(let i=0;i<81;i++){
      const c=cells[i],value=s.grid[i],fixed=!!s.puzzle[i],notes=value?[]:maskDigits(s.notes[i]);
      c.cell.classList.toggle('fixed',fixed);c.cell.classList.toggle('selected',i===selected);c.cell.classList.toggle('peer',peers.has(i));c.cell.classList.toggle('same',!!v&&value===v);c.cell.classList.toggle('hinted',hintCells.has(i));
      const wrong=conflicts.has(i)||(options.autoCheck&&uniquePuzzle&&!fixed&&value&&value!==s.solution[i]);
      c.cell.classList.toggle('wrong',!!wrong);c.cell.setAttribute('aria-invalid',String(!!wrong));c.cell.setAttribute('aria-selected',String(i===selected));c.cell.tabIndex=i===(selected>=0?selected:0)?0:-1;
      setText(c.value,value||'');c.notes.hidden=!!value;
      for(let n=1;n<=9;n++){setText(c.marks[n-1],notes.includes(n)?n:'');c.marks[n-1].classList.toggle('matching',n===v&&notes.includes(n));}
      c.cell.setAttribute('aria-label',`${fmt('selectedCell',{row:Math.floor(i/9)+1,col:i%9+1})} · ${value||text.emptyCell}${fixed?' · '+text.fixedCell:''}${notes.length?' · '+fmt('noteList',{digits:notes.join(', ')}):''}`);
    }
    const counts=Array(10).fill(0);for(const n of s.grid)if(n)counts[n]++;
    keys.forEach(({b,count},i)=>{const remaining=Math.max(0,9-counts[i+1]);setText(count,remaining);b.classList.toggle('active',s.numberFirst&&s.activeNumber===i+1);b.classList.toggle('exhausted',remaining===0);b.setAttribute('aria-label',`${i+1} · ${fmt('countRemaining',{count:remaining})}`);b.setAttribute('aria-pressed',String(s.numberFirst&&s.activeNumber===i+1));});
    notesButton.classList.toggle('active',s.inputMode==='note');notesButton.setAttribute('aria-pressed',String(s.inputMode==='note'));notesButton.title=s.inputMode==='note'?text.notesOn:text.notesOff;
    undo.disabled=!s.history.length;redo.disabled=!s.future.length;erase.disabled=s.selected<0||!!s.puzzle[s.selected];
    const filled=s.grid.filter(Boolean).length;progress.setAttribute('aria-valuenow',String(filled));progressFill.style.width=(filled/81*100)+'%';
    setText(context,`${s.inputMode==='note'?text.noteMode:text.penMode} · ${s.numberFirst?text.selectNumber:s.selected<0?text.selectCell:fmt('selectedCell',{row:Math.floor(s.selected/9)+1,col:s.selected%9+1})}`);
    portal.dataset.inputMode=s.inputMode;portal.dataset.numberFirst=String(s.numberFirst);updateClock();measure();
  }
  function updateClock(){const seconds=Math.floor(Math.max(0,host.currentGameDurationMs())/1000);setText(clock,`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`);}
  function measure(){const r=boardWrap.getBoundingClientRect(),size=Math.floor(Math.max(90,Math.min(r.width,r.height)));if(size!==boardSize){boardSize=size;board.style.width=size+'px';board.style.height=size+'px';board.style.setProperty('--sd-cell-font',Math.max(15,Math.min(32,size/15))+'px');}}
  function closeDialog(){if(destroyed||won)return;dialogKind='';mask.hidden=true;portal.classList.remove('paused');env.setPaused(false);renderer.invalidate();save();if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});}
  function openDialog(kind){
    if(destroyed||won)return;lastFocus=doc.activeElement;dialogKind=kind;env.setPaused(true);save();mask.hidden=false;portal.classList.toggle('paused',kind==='pause');dialogBody.replaceChildren();dialogActions.replaceChildren();
    const add=(id,label,action,primary=false)=>dialogActions.append(button(id,label,'',action,'sd-dialog-button'+(primary?' primary':'')));
    const paragraph=label=>dialogBody.append(element('p','',label));
    setText(dialogTitle,({pause:text.pausedTitle,help:text.helpTitle,hint:text.hintTitle,settings:text.settings,autoNotes:text.autoNotesTitle})[kind]||text.title);
    if(kind==='pause'){paragraph(text.pausedBody);add('wb-sudoku-resume',text.resume,closeDialog,true);add('wb-sudoku-save-exit',text.saveExit,()=>{save();env.exit();});}
    else if(kind==='help'){paragraph(text.helpBody);paragraph(uniquePuzzle?text.uniquePuzzle:text.legacyNotice);add('wb-sudoku-dialog-close',text.close,closeDialog,true);}
    else if(kind==='autoNotes'){paragraph(text.autoNotesBody);add('wb-sudoku-confirm-notes',text.confirm,()=>{model.fillNotes();hint=null;closeDialog();},true);add('wb-sudoku-dialog-close',text.cancel,closeDialog);}
    else if(kind==='hint'){
      const h=hint||model.findHint(),names={'naked-single':'hintNaked','hidden-single':'hintHidden',conflict:'hintConflict',contradiction:'hintContradiction',reveal:'hintReveal',complete:'hintComplete',unavailable:'hintUnavailable'};
      paragraph(fmt(names[h.kind]||'hintUnavailable',{row:Math.floor(h.index/9)+1,col:h.index%9+1,digit:h.digit||'',unit:text[h.unit]||'',unitIndex:(h.unitIndex??0)+1}));
      if(['naked-single','hidden-single','reveal'].includes(h.kind))paragraph(fmt('hintCount',{hints:model.state.hints}));
      if(['naked-single','hidden-single','reveal'].includes(h.kind))add('wb-sudoku-apply-hint',h.kind==='reveal'?text.revealHint:text.applyHint,()=>{const r=model.applyHint(h);hint=null;closeDialog();changed(r);},true);
      add('wb-sudoku-dialog-close',text.close,closeDialog);
    }else if(kind==='settings'){
      const toggle=(id,title,detail,checked,action)=>{const label=element('label','sd-option'),copy=element('span'),input=element('input');input.type='checkbox';input.id=id;input.checked=checked;copy.append(element('strong','',title),element('small','',detail));label.append(copy,input);input.onchange=()=>{action(input.checked);save();renderer.invalidate();};dialogBody.append(label);};
      toggle('wb-sudoku-option-clean',text.autoClean,text.autoCleanDetail,model.state.autoClean,v=>model.setAutoClean(v));
      toggle('wb-sudoku-option-number-first',text.numberFirst,text.numberFirstDetail,model.state.numberFirst,v=>model.setNumberFirst(v));
      toggle('wb-sudoku-option-check',text.autoCheck,uniquePuzzle?text.autoCheckDetail:text.legacyNotice,options.autoCheck,v=>{options.autoCheck=v;});add('wb-sudoku-dialog-close',text.close,closeDialog,true);
    }
    dialogActions.querySelector('button')?.focus({preventScroll:true});
  }
  function complete(){if(destroyed||won)return;const duration=host.currentGameDurationMs(),hints=model.state.hints,score=host.scoreWithChoice('sudoku',host.sudokuScore(duration,hints),choice);won=true;env.setPaused(true);env.setScore(score);env.clear();env.speak('gameover');destroy();env.finish(text.completeTitle,fmt('completeBody',{score,hints}),{outcome:'score',score},{hints,score,difficulty:choice.title,details:{...model.state.details,hints,finalErrors:0}});}
  function keydown(e){
    if(destroyed||e.altKey)return;
    if(dialogKind){if(e.key==='Escape'){e.preventDefault();closeDialog();return;}if(e.key==='Tab'){const fs=[...dialog.querySelectorAll('button:not([disabled]),input')],first=fs[0],last=fs.at(-1);if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first?.focus();}}return;}
    if(/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)||!env.isActive())return;
    if(e.key==='Escape'){e.preventDefault();openDialog('pause');return;}if(!canEdit())return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();edit(()=>e.shiftKey?model.redo():model.undo());return;}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();edit(()=>model.redo());return;}if(e.ctrlKey||e.metaKey)return;
    if(/^[1-9]$/.test(e.key)){e.preventDefault();edit(()=>model.chooseNumber(Number(e.key)));}
    else if(['Backspace','Delete','0'].includes(e.key)){e.preventDefault();edit(()=>model.erase());}
    else if(e.key.toLowerCase()==='n'){e.preventDefault();notesButton.click();}
    else if(e.key.toLowerCase()==='h'){e.preventDefault();hintButton.click();}
    else if(e.key.startsWith('Arrow')){e.preventDefault();const s=Math.max(0,model.state.selected),r=Math.floor(s/9),c=s%9,nr=Math.max(0,Math.min(8,r+(e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0))),nc=Math.max(0,Math.min(8,c+(e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0)));model.state.selected=nr*9+nc;renderer.invalidate();save();cells[nr*9+nc].cell.focus({preventScroll:true});}
  }
  function visibility(){if(doc.hidden){openDialog('pause');save();}else{if(env.isPaused()&&!dialogKind)openDialog('pause');renderer.invalidate();}}
  function tick(){if(destroyed||doc.hidden)return;if(env.isPaused()&&!dialogKind)openDialog('pause');if(!env.isPaused())updateClock();}
  const timer=win.setInterval(tick,1000),observer=typeof win.ResizeObserver==='function'?new win.ResizeObserver(()=>renderer.invalidate()):null;
  observer?.observe(boardWrap);doc.addEventListener('keydown',keydown);doc.addEventListener('visibilitychange',visibility);win.addEventListener('resize',renderer.invalidate);
  function destroy(){if(destroyed)return;destroyed=true;win.clearInterval(timer);observer?.disconnect();renderer.destroy();doc.removeEventListener('keydown',keydown);doc.removeEventListener('visibilitychange',visibility);win.removeEventListener('resize',renderer.invalidate);nativeImmersive(false);portal.remove();}
  save();renderer.invalidate();
  // The host assigns the controller synchronously after createGame returns.
  // Settle a completed recovered board once that assignment has finished.
  Promise.resolve().then(()=>{if(!destroyed&&isComplete(model.state.grid,model.state.puzzle))complete();});
  return {save,destroy,getState:()=>({...model.serialize(),sudokuOptions:{...options},view:{renderer:'dom',sharedRuntime:'demand-v1',renders,dialog:dialogKind,boardSize,paused:env.isPaused(),locale:getLocale(win),uniquePuzzle}})};
}
