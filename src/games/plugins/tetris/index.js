import {createClassicGame} from './classic.js';
import {createBattleGame} from './battle-controller.js';
import {isBattleState} from './battle-engine.js';
export const GAME_ID='tetris';
export const GAME_VERSION='1.1.2';
export const HOST_API_VERSION=1;
export const REQUIRED_ENV=Object.freeze(['activeGameController','addSwipe','addTapDirection','canvasThemePalette','clearProgress','controlModeLabel','currentGame','gamePaused','getHostDocument','getHostWindow','hideGamePauseOverlay','isNightTheme','nextControlMode','qs','saveProgress','scheduleFitGameSurface','setScore','settings','showGameOver','speak','tetrisTimer']);
export function createGame(env,state){
  if(isBattleState(state?.battle))return createBattleGame(env,state);
  if(Array.isArray(state?.board))return createClassicGame(env,state);
  const box=env.qs('#wb-gamebox');let child=null,dead=false;
  box.innerHTML=`<section style="height:100%;min-height:0;overflow:auto;box-sizing:border-box;display:grid;align-content:start;gap:10px;padding:24px;border-radius:16px;background:#eef2f7;color:#223247">
    <div style="font-size:12px;font-weight:700;color:#42678e">离线 AI 对战</div><strong style="font-size:27px;line-height:1.25">方块之间，见招拆招</strong><p style="margin:0 0 8px;font-size:13px;line-height:1.6">连续消行向对手发送干扰行。暂存、预览和落点提示，帮你规划下一步。对手由本机 AI 控制。</p>
    <button class="wb-btn primary" type="button" data-tetris-mode="duel" style="min-height:52px;border-radius:13px">离线 AI 对战</button><button class="wb-btn" type="button" data-tetris-mode="marathon" style="min-height:48px;border-radius:13px">马拉松</button><button class="wb-btn" type="button" data-tetris-mode="sprint" style="min-height:48px;border-radius:13px">40 行竞速</button><button class="wb-btn" type="button" data-tetris-mode="classic" style="min-height:48px;border-radius:13px">经典方块</button>
    <p style="margin:3px 0 0;color:#6b7c92;font-size:11px;line-height:1.5">经典模式保留原有规则和存档。</p></section>`;
  const buttons=[...box.querySelectorAll('[data-tetris-mode]')];for(const button of buttons)button.onclick=()=>{if(dead||child||env.gamePaused)return;child=button.dataset.tetrisMode==='classic'?createClassicGame(env,null):createBattleGame(env,null,button.dataset.tetrisMode);env.scheduleFitGameSurface?.();};
  return {save(){child?.save?.();},getState:()=>child?.getState?.()||{mode:'select'},destroy(){if(dead)return;dead=true;for(const button of buttons)button.onclick=null;child?.destroy?.();}};
}
