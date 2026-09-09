import {createClassicGame} from './classic.js';
import {createArenaGame} from './arena-controller.js';
import {isArenaState} from './arena-engine.js';
export const GAME_ID='snake';
export const GAME_VERSION='1.1.0';
export const HOST_API_VERSION=1;
export const REQUIRED_ENV=Object.freeze(['activeGameController','addSwipe','addTapDirection','canvasThemePalette','clearProgress','controlModeLabel','currentGame','gamePaused','getHostDocument','getHostWindow','isNightTheme','nextControlMode','qs','qsa','saveProgress','scheduleFitGameSurface','setScore','settings','showGameOver','snakeTimer','speak']);
export function createGame(env,state){
  if(isArenaState(state?.arena))return createArenaGame(env,state);
  if(Array.isArray(state?.snake)&&state.snake.length)return createClassicGame(env,state);
  const box=env.qs('#wb-gamebox');let child=null,dead=false;
  box.innerHTML=`<section style="width:100%;height:100%;min-height:0;overflow:auto;display:grid;align-content:start;gap:12px;padding:24px;box-sizing:border-box;background:#f1f6f7;border-radius:18px;color:#203b45">
    <div style="font-size:12px;color:#397971;font-weight:700">离线 AI 竞技场</div><strong style="font-size:27px;line-height:1.25">小蛇，也能成为第一</strong>
    <p style="font-size:13px;line-height:1.65;margin:0 0 8px">吃彩点变长，巧妙走位，让对手撞上你的身体。所有对手均由本机 AI 控制。</p>
    <button type="button" class="wb-btn primary" data-snake-mode="endless" style="min-height:54px;border-radius:14px">无尽竞技</button>
    <button type="button" class="wb-btn" data-snake-mode="timed" style="min-height:54px;border-radius:14px">限时挑战 · 3 分钟</button>
    <button type="button" class="wb-btn" data-snake-mode="classic" style="min-height:48px;border-radius:14px">经典方格</button>
    <p style="font-size:11px;line-height:1.6;color:#658087;margin:3px 0 0">竞技模式：左手摇杆，右手长按加速。经典模式保留原有规则和存档。</p>
  </section>`;
  const buttons=[...box.querySelectorAll('[data-snake-mode]')];for(const button of buttons)button.onclick=()=>{if(dead||child||env.gamePaused)return;child=button.dataset.snakeMode==='classic'?createClassicGame(env,null):createArenaGame(env,null,button.dataset.snakeMode);env.scheduleFitGameSurface?.();};
  return {save(){child?.save?.();},getState:()=>child?.getState?.()||{mode:'select'},destroy(){if(dead)return;dead=true;for(const button of buttons)button.onclick=null;child?.destroy?.();}};
}
