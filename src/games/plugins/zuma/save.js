import {getZumaLevel} from './engine.js';

// game.zuma 1.0.0's 900×620 six-cubic path, sampled 55 times per segment.
// This value is locked to that released renderer, not the new six-course map.
// The compatibility test recalculates it using the retained legacy path helper.
export const LEGACY_ZUMA_PATH_LENGTH = 3170.6653705873855;
export const LEGACY_ZUMA_SPACING = 17 * 1.86;
export const LEGACY_ZUMA_HEAD_LIMIT = LEGACY_ZUMA_PATH_LENGTH - 180;
const ENTRY_MARGIN = 28;
export const LEGACY_ZUMA_MAX_BALLS = Math.floor((LEGACY_ZUMA_HEAD_LIMIT-ENTRY_MARGIN)/LEGACY_ZUMA_SPACING)+1;
const clone = value => JSON.parse(JSON.stringify(value));
const number = (value,fallback=0) => Number.isFinite(Number(value))?Number(value):fallback;
const integer = value => Math.max(0,Math.floor(number(value)));
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

/** New code reads its complete snapshot, including a draining death animation.
 * Unwrapped saves still use the engine's legacy migration. */
export function readZumaSave(saved) {
  return saved?.zumaClassic?.schema===2&&Array.isArray(saved.zumaClassic.chain)
    ? clone(saved.zumaClassic)
    : saved;
}

/**
 * Keep the host save-schema-1 contract usable by the released endless Zuma.
 * New rounds are lossless in zumaClassic. A rollback gets only an approximate,
 * safely fitted legacy chain; its later save naturally replaces this envelope.
 */
export function writeZumaSave(engineSnapshot) {
  if(engineSnapshot?.schema!==2||!Array.isArray(engineSnapshot.chain))throw new TypeError('Expected a Zuma classic schema-2 snapshot');
  const classic=clone(engineSnapshot),level=getZumaLevel(classic.levelIndex,classic.layout);
  const visible=classic.chain
    .filter(ball=>Number.isFinite(ball.s)&&ball.s>=0&&Number.isInteger(ball.color)&&ball.color>=0&&ball.color<6)
    .sort((a,b)=>a.s-b.s)
    .slice(-LEGACY_ZUMA_MAX_BALLS);
  const chain=visible.map(ball=>({color:ball.color,s:clamp(ball.s/level.path.length*LEGACY_ZUMA_PATH_LENGTH,ENTRY_MARGIN,LEGACY_ZUMA_HEAD_LIMIT)}));
  // Fit from the head backwards. Each lower bound reserves one old-sized slot;
  // thus the fallback cannot overlap or put an overfull chain directly in the pit.
  for(let i=chain.length-1;i>=0;i--){
    const minimum=ENTRY_MARGIN+i*LEGACY_ZUMA_SPACING;
    const maximum=i===chain.length-1?LEGACY_ZUMA_HEAD_LIMIT:chain[i+1].s-LEGACY_ZUMA_SPACING;
    chain[i].s=clamp(chain[i].s,minimum,maximum);
  }
  const details={shots:0,misses:0,cleared:0,maxCombo:0,dangerCount:0,bombUsed:0,slowUsed:0,rainbowUsed:0,totalBallsGenerated:chain.length,maxSpeed:0,clearAllCount:0,...classic.details};
  details.totalBallsGenerated=Math.max(chain.length,integer(details.totalBallsGenerated));
  return {
    schema:1,chain,score:integer(classic.score),current:clamp(integer(classic.current),0,5),next:clamp(integer(classic.next),0,5),
    tools:{bomb:3,slow:3,rainbow:3},slowRemaining:clamp(number(classic.effects?.slow),0,30)*1000,
    spawnProgress:0,aim:number(classic.aim,-Math.PI/2),resolution:null,details,
    seen:{dangerActive:0,speedMark:0,spawnMark:Math.floor(details.totalBallsGenerated/50)},
    zumaClassic:classic,
  };
}
