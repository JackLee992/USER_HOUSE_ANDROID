// Capability restrictions are applied on every settings read, including old backups.
export const STANDALONE_THEMES = Object.freeze([
  ['day', '梦幻掌机'], ['arcade', '晴日信箱'], ['spring', '春野物语'],
  ['mono', '黑白像素'], ['night', '霓虹游戏舱'], ['cyber', '赛博街机'], ['card', '红黑牌剧场'],
]);

export function constrainStandaloneSettings(raw = {}) {
  const next = { ...raw };
  Object.assign(next, {
    companion:false, floatingBallEnabled:false, petDesktopEnabled:false,
    petDesktopTalk:false, petAutoDailyLog:false, messageNotify:false,
    theaterEnabled:false, autoLog:false, intimacyMode:false, injectChat:false,
    injectUserDesc:false, injectCharDesc:false, lazyWorldInject:false,
    worldAutoMountMode:'', selectedWorldEntries:[], selectedWorldPresetName:'',
    apiUrl:'', apiKey:'', apiModel:'', avatarUrl:'', customFonts:[], selectedFont:'',
    charName:'电脑', userName:'玩家', userPersona:'', charPersona:'', worldView:'',
    manualCharPersona:'', charDescriptionSnapshot:'', summaryId:'', summarySnapshot:null,
    specialLanguageEnabled:false, breakLimitPrompt:'',
  });
  if (!STANDALONE_THEMES.some(([id]) => id === next.theme)) next.theme = 'day';
  if (!['single', 'double', 'settings'].includes(next.lastTab)) next.lastTab = 'single';
  next.rememberWindow = next.rememberWindow !== false;
  return next;
}
