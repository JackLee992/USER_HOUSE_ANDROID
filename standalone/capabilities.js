// Capability restrictions are applied on every settings read, including old backups.
// Legacy theme ids in old backups normalize to the single app design.
export const STANDALONE_THEMES = Object.freeze([['day', '玩吧']]);

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
  next.theme = 'day';
  if (!['single', 'double', 'my', 'settings'].includes(next.lastTab)) next.lastTab = 'single';
  next.rememberWindow = next.rememberWindow !== false;
  return next;
}
