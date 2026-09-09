import { getRequestHeaders } from '../core/sillytavern.js';
import { constrainStandaloneSettings, STANDALONE_THEMES } from '../../standalone/capabilities.js';
import { APP_VERSION, normalizeAppInfo, readWebCapabilities } from '../../standalone/app-info.js';
import { standaloneLicenses } from '../../standalone/licenses.js';
import { gameRules as localizedGameRules, mountLanguagePicker } from '../../standalone/i18n.js';
import { mountPerformancePicker } from '../../standalone/performance.js';
import { EXTENSION_VERSION } from '../core/metadata.js';
import { DEFAULT_LINES, PROMPT_TEMPLATES } from './wanban-prompts.js';
import { gamePlugin } from '../games/plugins/registry.js';
import { validCadetProgress } from '../games/space-cadet.js';
import { validMatch3Progress } from '../games/match3.js';
import { captureStorage, gameContentMetadata, requireCompatibleSave } from '../../standalone/content-state.js';
import { gameArtworkIconHTML } from '../../standalone/game-art.js';

// Runtime migrated from 益智小游戏/玩伴小屋V1.0.1.json.
// Keep this file behavior-compatible with the original script; split new code into src/* modules when extending.
let runtimeStarted = false;
let runtimeApi = null;
let activePromptTemplates = PROMPT_TEMPLATES;

function clonePromptTemplates() {
  return JSON.parse(JSON.stringify(PROMPT_TEMPLATES));
}

function setPromptSection(root, path, lines) {
  const parts = path.split('.').map(x => x.trim()).filter(Boolean);
  if (!parts.length) return;
  let target = root;
  while (parts.length > 1) {
    const key = parts.shift();
    target[key] = target[key] || {};
    target = target[key];
  }
  const key = parts[0];
  const value = lines.map(x => x.trim()).filter(Boolean);
  target[key] = path.indexOf('systems.') === 0 ? value.join('\n').trim() : value;
}

function parsePromptText(text) {
  const root = clonePromptTemplates();
  let section = '';
  let lines = [];
  const flush = () => {
    if (!section) return;
    setPromptSection(root, section, lines);
    lines = [];
  };
  String(text || '').replace(/\r\n/g, '\n').split('\n').forEach(line => {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) {
      flush();
      section = match[1];
      return;
    }
    if (section) lines.push(line);
  });
  flush();
  return root;
}

async function loadPromptTextTemplates() {
  try {
    const url = new URL('./wanban-prompts.txt', import.meta.url);
    const res = await fetch(url.href, { cache: 'no-store' });
    if (!res.ok) return;
    activePromptTemplates = parsePromptText(await res.text());
  } catch (e) {
    console.warn('[玩伴小屋] prompt txt load failed, using JS fallback:', e);
  }
}

function promptTemplates() {
  return activePromptTemplates || PROMPT_TEMPLATES;
}

export async function initWanbanXiaowu(options = {}) {
  if (runtimeStarted) return runtimeApi;
  runtimeStarted = true;
  const standalone = options.standalone === true;
  const standaloneAppInfo = options.appInfo || normalizeAppInfo(null, globalThis.navigator?.userAgent || '');
  const contentState = options.contentState || null;
  let startupBlocked = options.startupBlocked === true;
  let roundContent = null;
  const storageWriteErrors = new Map();
  const contentForGame = id => gameContentMetadata(id, contentState, gamePlugin(id).GAME_VERSION);
  if (!standalone) await loadPromptTextTemplates();

  const SCRIPT_ID = 'wanbanXiaowu';
  const POPUP_ID = SCRIPT_ID + '-popup';
  const SHELL_ID = SCRIPT_ID + '-shell';
  const MENU_ID = SCRIPT_ID + '-menu-item';
  const FLOAT_ID = SCRIPT_ID + '-float-ball';
  const PET_FLOAT_ID = SCRIPT_ID + '-pet-float';
  const STYLE_ID = SCRIPT_ID + '-css';
  const STORAGE_SETTINGS = SCRIPT_ID + '_settings_v1';
  const STORAGE_SCORES = SCRIPT_ID + '_scores_v1';
  const STORAGE_LINES = SCRIPT_ID + '_lines_v1';
  const STORAGE_ROLE_LINES = SCRIPT_ID + '_roleLines_v1';
  const STORAGE_THEATERS = SCRIPT_ID + '_theaters_v1';
  const STORAGE_LINE_PRESET_SELECTION = SCRIPT_ID + '_linePresetSelection_v1';
  const STORAGE_API_PRESETS = SCRIPT_ID + '_apiPresets_v1';
  const STORAGE_WORLD_PRESETS = SCRIPT_ID + '_worldPresets_v1';
  const STORAGE_SUMMARIES = SCRIPT_ID + '_summaries_v1';
  const STORAGE_SUMMARY_REQ = SCRIPT_ID + '_summaryReq_v1';
  const STORAGE_PROGRESS = SCRIPT_ID + '_progress_v1';
  const STORAGE_SUDOKU_STATE = SCRIPT_ID + '_sudokuState_v1';
  const STORAGE_RECORDS = SCRIPT_ID + '_records_v1';
  const STORAGE_PET_TEST = SCRIPT_ID + '_petTest_v1';
  const STORAGE_PET_FULL = SCRIPT_ID + '_petFull_v1';
  const STORAGE_WORD_GUESS_BANK = SCRIPT_ID + '_wordGuessBank_v1';
  const STORAGE_WORD_GUESS_BANK_SOURCE = SCRIPT_ID + '_wordGuessBankSource_v1';
  const STORAGE_WORD_GUESS_BANK_FILTER = SCRIPT_ID + '_wordGuessBankFilter_v1';
  const WORD_GUESS_DEFAULT_BANK_URL = new URL('./wanban-wordguess-bank.txt', import.meta.url).href;
  const EXTENSION_UPDATE_FALLBACKS = ['/USER_HOUSE', '/wanban-xiaowu'];
  const EXTENSION_UPDATE_REPOSITORY = 'https://github.com/JackLee992/USER_HOUSE';
  const EXTENSION_UPDATE_BRANCH = 'main';
  let updateCheckStarted = false;
  let updateState = { checking:false, updating:false, checked:false, available:false, updated:false, error:'', data:null };
  const FLAG = SCRIPT_ID + '_Loaded_v2_0_4';
  const MENU_SELECTORS = [
    '#extensionsMenu',
    '#extensionMenuItems',
    '.extensions_block',
    '#extension_settings',
    '#extensionsMenuList',
    '.extension_menu',
    '#rm_extensions_block'
  ];

  let currentTab = 'single';
  let currentGame = null;
  let activeGameController = null;
  let snakeTimer = null;
  let tetrisTimer = null;
  let watermelonTimer = null;
  let jumpTimer = null;
  let screwTimer = null;
  let touchStart = null;
  let gameStarted = false;
  let gamePaused = true;
  let gameStartAt = 0;
  let gameAccumulatedMs = 0;
  let gameActiveStartedAt = 0;
  let gamePetRewardNextMs = 30 * 60 * 1000;
  let gameDurationRewardTimer = null;
  let randomLineTimer = null;
  let linkLinkTimer = null;
  let shuerteTimer = null;
  let lastDialogueAt = 0;
  let singleDialogueQueue = null;
  let singleDialogueTimer = null;
  let firstMoverAwaitingUserAction = false;
  let currentRoundRecord = false;
  let currentRoundLineEvents = [];
  let currentRoundTheaterInfo = null;
  let progressSaveTimers = {};
  let progressSaveCache = {};
  let defaultWordGuessBankCache = null;
  let theaterCache = safeObject(loadJSON(STORAGE_THEATERS, {}));
  let lastMenuOpenAt = 0;
  let floatingBallResizeBound = false;
  let petDesktopResizeBound = false;
  let petIdleTimer = null;
  let petSadTimer = null;
  let petAnimationTimer = null;
  let petStateReturnTimer = null;
  let petReturnHouseOnRender = false;
  let petStoryTapLockedUntil = 0;
  let petStoryTypeTimer = 0;
  const petStoryPageCache = new Map();
  let petDesktopPokeLockedUntil = 0;
  const petOnlineSessionStartedAt = Date.now();
  let petAutoDailyLogRunning = {};
  let lineGenerationBusy = false;
  let lineGenerationStatus = '当前状态：空闲';
  let lineGenerationKind = '';
  let batchLineGenerationCancel = false;
  let lineGenerationFailures = {};
  let theaterGenerationFailures = {};
  let batchGenerationDebug = [];
  let mainSwipeAnimation = '';

  const GAME_ICON_BASE = new URL('../../assets/game-icons/', import.meta.url).href;
  const PET_ASSET_BASE = new URL('../../assets/pets/', import.meta.url).href;
  const FOX_ASSET_BASE = PET_ASSET_BASE + 'fox/';
  const FOX_HOUSE_DAY_URL = PET_ASSET_BASE + 'scene/house-day.png';
  const APP_ICON_URL = GAME_ICON_BASE + 'wanban.png';
  const PET_BUTTON_URL = GAME_ICON_BASE + 'pet.png';
  const HEART_CHALLENGE_URL = GAME_ICON_BASE + 'card-zhen.png';
  const FARM_BUTTON_URL = GAME_ICON_BASE + 'farm.png';
  const OLDMAID_CARD_URL = GAME_ICON_BASE + 'oldmaid-card.jpg';
  const OLDMAID_BACK_URL = GAME_ICON_BASE + 'oldmaid-back.jpg';
  const SPIDER_BACK_URL = GAME_ICON_BASE + 'spider-card.png';
  const MEMORY_CARD_URL = GAME_ICON_BASE + 'memory-card.jpg';
  const PLANK_STAND_URL = GAME_ICON_BASE + 'plank-stand.png';
  const PLANK_WALK_URL = GAME_ICON_BASE + 'plank-walk.png';
  const JUMP_STAND_URL = GAME_ICON_BASE + 'jump-stand.png';
  const JUMP_DOWN_URL = GAME_ICON_BASE + 'jump-down.png';
  const FIRST_MOVER_GAMES = ['ludo', 'tictactoe', 'gomoku', 'territory', 'oldmaid', 'reversi', 'bombnumber', 'connect4d', 'draughts'];
  const GAME_META = {
    tetris: { id: 'tetris', name: '俄罗斯方块', mode: 'single', unit: '分', icon: '▦', iconImage: GAME_ICON_BASE + 'tetris.png' },
    snake: { id: 'snake', name: '贪吃蛇', mode: 'single', unit: '分', icon: '●', iconImage: GAME_ICON_BASE + 'snake.jpg' },
    game2048: { id: 'game2048', name: '2048', mode: 'single', unit: '分', icon: '2048', iconImage: GAME_ICON_BASE + 'game2048.png' },
    watermelon: { id: 'watermelon', name: '合成大西瓜', mode: 'single', unit: '分', icon: '瓜', iconImage: GAME_ICON_BASE + 'watermelon.png' },
    memory: { id: 'memory', name: '翻牌记忆', mode: 'single', unit: '分', icon: '◇', iconImage: GAME_ICON_BASE + 'memory.png' },
    jump: { id: 'jump', name: '跳一跳', mode: 'single', unit: '分', icon: '跳', iconImage: GAME_ICON_BASE + 'jump.jpg' },
    plank: { id: 'plank', name: '搭木板', mode: 'single', unit: '分', icon: '板', iconImage: GAME_ICON_BASE + 'plank.jpg' },
    sudoku: { id: 'sudoku', name: '数独', mode: 'single', unit: '分', icon: '9', iconImage: GAME_ICON_BASE + 'sudoku.jpg' },
    minesweeper: { id: 'minesweeper', name: '扫雷', mode: 'single', unit: '分', icon: '雷', iconImage: GAME_ICON_BASE + 'minesweeper.png' },
    uyangle: { id: 'uyangle', name: 'U了个U', mode: 'single', unit: '分', icon: 'U', iconImage: GAME_ICON_BASE + 'sheep.png' },
    screw: { id: 'screw', name: '拧螺丝', mode: 'single', unit: '分', icon: '螺', iconImage: GAME_ICON_BASE + 'screw.png' },
    popstar: { id: 'popstar', name: '消灭星星', mode: 'single', unit: '分', icon: '星', iconImage: GAME_ICON_BASE + 'star.png' },
    paopao: { id: 'paopao', name: '泡泡龙', mode: 'single', unit: '分', icon: '泡', iconImage: GAME_ICON_BASE + 'paoapao.png' },
    game1010: { id: 'game1010', name: '1010!', mode: 'single', unit: '分', icon: '1010', iconImage: GAME_ICON_BASE + '1010.png' },
    turkey: { id: 'turkey', name: '土耳其方块', mode: 'single', unit: '分', icon: '土', iconImage: GAME_ICON_BASE + 'turkey.png' },
    spider: { id: 'spider', name: '无尽蜘蛛纸牌', mode: 'single', unit: '分', icon: '蛛', iconImage: GAME_ICON_BASE + 'spider.png' },
    linklink: { id: 'linklink', name: '连连看', mode: 'single', unit: '分', icon: '连', iconImage: GAME_ICON_BASE + 'lian.png' },
    shuerte: { id: 'shuerte', name: '舒尔特方格', mode: 'single', unit: '分', icon: '舒', iconImage: GAME_ICON_BASE + 'shuerte.png' },
    pinball: { id: 'pinball', name: '三维弹球', mode: 'single', unit: '分', icon: '◉', iconImage: GAME_ICON_BASE + 'pinball.png' },
    match3: { id: 'match3', name: '消消乐', mode: 'single', unit: '分', icon: '◆', iconImage: GAME_ICON_BASE + 'match3.png' },
    freecell: { id: 'freecell', name: '空当接龙', mode: 'single', unit: '分', icon: '♠', iconImage: GAME_ICON_BASE + 'freecell.png' },
    zuma: { id: 'zuma', name: '祖玛', mode: 'single', unit: '分', icon: '珠', iconImage: GAME_ICON_BASE + 'zuma.png' },
    watersort: { id: 'watersort', name: '倒瓶子', mode: 'single', unit: '分', icon: '瓶', iconImage: GAME_ICON_BASE + 'watersort.png' },
    ludo: { id: 'ludo', name: '双人飞行棋', mode: 'double', unit: '胜', icon: '✈', iconImage: GAME_ICON_BASE + 'ludo.jpg' },
    guessnumber: { id: 'guessnumber', name: '猜数字', mode: 'double', unit: '胜', icon: '1234', iconImage: GAME_ICON_BASE + 'guessnumber.jpg' },
    wordguess: { id: 'wordguess', name: '我说你猜', mode: 'double', unit: '胜', icon: '谜', iconImage: GAME_ICON_BASE + 'wordguess.jpg' },
    tictactoe: { id: 'tictactoe', name: '井字棋', mode: 'double', unit: '胜', icon: '×○', iconImage: GAME_ICON_BASE + 'tictactoe.jpg' },
    gomoku: { id: 'gomoku', name: '五子棋', mode: 'double', unit: '胜', icon: '五', iconImage: GAME_ICON_BASE + 'gomoku.jpg' },
    territory: { id: 'territory', name: '电子围地盘', mode: 'double', unit: '胜', icon: '□', iconImage: GAME_ICON_BASE + 'territory.jpg' },
    oldmaid: { id: 'oldmaid', name: '抽鬼牌', mode: 'double', unit: '胜', icon: '鬼', iconImage: GAME_ICON_BASE + 'oldmaid.jpg' },
    reversi: { id: 'reversi', name: '翻转棋', mode: 'double', unit: '胜', icon: '●○', iconImage: GAME_ICON_BASE + 'reversi.jpg' },
    bombnumber: { id: 'bombnumber', name: '数字炸弹', mode: 'double', unit: '胜', icon: '爆', iconImage: GAME_ICON_BASE + 'bombnumber.jpg' },
    connect4d: { id: 'connect4d', name: '立体四子棋', mode: 'double', unit: '胜', icon: '4D', iconImage: GAME_ICON_BASE + 'connect4d.jpg' },
    draughts: { id: 'draughts', name: '跳棋', mode: 'double', unit: '胜', icon: '跳', iconImage: GAME_ICON_BASE + 'draughts.png' },
    blackjack: { id: 'blackjack', name: '21点', mode: 'double', unit: '胜', icon: '21', iconImage: GAME_ICON_BASE + '21p.png' },
    westernchess: { id: 'westernchess', name: '国际象棋', mode: 'double', unit: '胜', icon: '♛', iconImage: GAME_ICON_BASE + 'western_chess.png' },
    chinesechess: { id: 'chinesechess', name: '中国象棋', mode: 'double', unit: '胜', icon: '象', iconImage: GAME_ICON_BASE + 'chinese_chess.png' }
  };

  const DEFAULT_SETTINGS = {
    companion: false,
    theme: 'day',
    avatarUrl: '',
    apiUrl: '',
    apiKey: '',
    apiModel: 'gpt-4o-mini',
    charPersona: '',
    userPersona: '',
    worldView: '',
    lazyWorldInject: false,
    userDescSource: 'manual',
    worldAutoMountMode: '',
    injectUserDesc: true,
    injectCharDesc: true,
    charDescMode: 'auto',
    manualCharPersona: '',
    injectChat: false,
    specialLanguageEnabled: false,
    specialLanguage: '粤语',
    intimacyMode: false,
    breakLimitPrompt: '',
    summaryId: '',
    selectedWorldEntries: [],
    selectedWorldPresetName: '',
    charName: '{{char}}',
    userName: '{{user}}',
    rememberWindow: standalone,
    floatingBallEnabled: false,
    floatingBallX: 18,
    floatingBallY: 180,
    petDesktopEnabled: false,
    petDesktopX: 78,
    petDesktopY: 240,
    petDesktopState: 'normal',
    petDesktopTalk: false,
    petAutoDailyLog: false,
    petBallRecord: 0,
    petInteractCount: 0,
    petForm: 'baby',
    messageNotify: false,
    messageNotifyTag: 'content',
    theaterEnabled: false,
    autoLog: false,
    companionDock: 'end',
    companionDockPc: 'right',
    companionDockMobile: 'bottom',
	    batchLinePromptOverride: '',
	    batchTheaterPromptOverride: '',
	    batchAttempts: 1,
	    batchLinesApiChoice: 'default',
	    batchTheaterApiChoice: 'default',
	    customFonts: [],
	    selectedFont: '',
	    lastTab: 'single',
	    lastGame: ''
	  };

  const GAME_RULES = {
    tetris: '控制方块左右移动、旋转和下落，凑满一整行即可消除得分。方块堆到顶部时游戏结束。',
    snake: '用方向键或手机方向按钮控制蛇吃食物。每吃一次会变长，后期速度会更快；撞墙或撞到自己就结束。',
    game2048: '上下左右滑动数字块，相同数字相撞会合并。正常版为4×4，爽玩版为6×6且最终分数减半；数字可继续合成到65536。',
    watermelon: '选择落点投放水果，相同水果碰到会合成更大的水果。水果堆超过顶部警戒线时结束。',
    memory: '翻开两张牌，图案相同就配对成功。全部配对完成后按步数和分数结算。',
    jump: '按住蓄力，松开跳跃。落到下一个平台得分，越靠近中心越好；没落上平台就结束。',
    plank: '长按屏幕或空格生成木板，松开后木板会倒下成为桥。木板必须刚好搭到下一根柱子上，太短或太长都会掉下去。',
    sudoku: '每局会先选择难度。简单空30-35格；中等空43-48格；困难空53-58格。点击空格后输入1-9，可擦除、求助；填满但不正确时会高亮错误。',
    minesweeper: '每局会先选择难度：简单9×9、10雷；中等12×12、25雷；困难16×16、50雷。下方按钮可在“翻开”和“插旗”之间切换；数字格周围旗数等于数字时会按正式扫雷规则翻开周围未插旗格，旗插错会直接失败。',
    shuerte: '每局会先选择难度：简单4×4、中等5×5、困难6×6，并可选择“盲点”模式。数字会随机打散在方格里，点击1开始计时，并按1、2、3……一路点到最后一个数字。普通模式点对后数字会变淡；盲点模式点对后不变色，难度更高且有少量倍率加成。点错会扣分并出现红色反馈；下方道具可以提示下一个数字、短暂聚焦目标所在行列或重排未点击数字。完成全部数字后按难度基础分、连击、速度和道具使用结算。',
    uyangle: '三消叠牌小游戏。普通模式可通关；无尽模式会在剩余牌较少时自动追加下一批牌层，失败时统计已消除数量。点击没有被上层遮挡的卡牌放入下方7格槽，同图标凑满3张会消除；槽位超过7格且没有消除时失败。',
    screw: '每局会选择普通模式或无尽模式，并保证每种颜色螺丝数量为3的倍数、工具盒数量正确。顶部同时出现3个随机颜色工具盒，点击可见螺丝后，同色螺丝进入对应工具盒；非当前盒颜色会进入5格临时托盘。任意工具盒收满3颗会自动打包并刷新下一个颜色。上层面板会遮挡下层螺丝；板件剩一个螺丝时会悬挂摆动，失去全部螺丝后受重力下落。普通模式清空全部面板即可过关，无尽模式会在快结束时续上下一批。',
    popstar: '10×10彩色星星棋盘。点击2个及以上上下左右相连的同色星星即可消除，得分为消除数量×消除数量×5，8/12/16个以上大块会有额外奖励。困难模式每关有步数限制，消除、打乱、单消都会消耗1步；简单模式没有步数限制，可以一直消到没有可消除组合。无可消除组合或困难模式步数用完时本关结算，剩余10个以内有少量奖励；如果无可消除组合且还剩步数，会按未用步数奖励。累计分数达到当前关目标就进入下一关，否则游戏结束。',
    paopao: '交错网格泡泡射击。按住或拖动瞄准，松开发射；泡泡会在左右墙反弹，撞到天花板或现有泡泡后吸附到最近空槽。3个及以上同色相连会消除，不再连着顶部的泡泡会掉落得分。初始每发射10次顶部压下一行，每下压3行后间隔减少1次，最低固定为5次；场上只剩5个以内会立刻补压一行。任意泡泡越过红色警戒线即结束。每局有5个炸弹，炸弹会消除落点周围3格泡泡。',
    pinball: '完整 Space Cadet 球台：长按约3秒蓄力，松手发射；左右触控按钮或方向键控制挡板，空格发射。击中任务靶后上左侧坡道接受任务，利用虫洞、超空间和燃料通道得分晋级。连续震台会 TILT。可放大画面、切换高清／经典显示。三球用尽结算；同页返回可继续完整球局，刷新后只保留分数、常规球数和军衔，从新球开始。',
    match3: '经典闯关、破冰挑战、无限休闲三种玩法，切换时保存各自进度。交换三连，四连造清线、五连造彩虹、L/T造爆弹；特效互换可组合。过关获得本局星币，可用小锤和重排。失败可重试，返回或刷新保留本局奖励，结束或重开后清零。无效交换不扣步。',
    freecell: '经典空当接龙：52张牌分为8列，4个空当可暂存单牌，4个收牌区按同花色A至K递增。列内按红黑交替递减，可移动长度受空当和空列限制。点击源牌再点击目标；桌面双击或手机快速双点露出的牌送入收牌区。安全归档按钮收取当前安全牌，随步归档开关在移动后连续收牌；撤销可恢复整步。全部收齐获胜。',
    zuma: '按住棋盘瞄准、拖动调整方向，松手发射；点青蛙或换球按钮交换当前珠和下一颗。相邻3颗以上同色珠消除，同色断口吸回并可触发连锁，异色断口等待后链追上。消除和金币填满金色祖玛槽后停止生成，清空余珠通关。6座原创神庙循环提高难度，每局3条生命；消除标记珠触发爆炸、减速、倒退、精准瞄准，穿隙命中与连续成功消除可获得奖励。支持全屏横竖自适应、暂停与续玩。',
    watersort: '点击一个非空瓶子，再点击目标瓶子，将源瓶顶部连续同色的水一次倒入目标瓶。目标瓶必须为空，或顶部颜色相同，并且仍有容量；每瓶最多4层。所有非空瓶都装满4层同色水即可进入下一关，关卡无限生成。颜色会从3种逐步增加到最多10种，第9关起初始空瓶由2只减为1只，反向打乱深度也会逐步提高并继续验证解序列。撤回会逐关补充，提示每2关补充，额外空瓶每5关补充；可随时点击结算结束本局。',
    game1010: '10×10方块拼图。拖动底部3个候补方块放入棋盘，方块不可旋转；任意行或列填满会同时消除且不会下落。3个方块全部放完后刷新新一批。每局有3次重新生成和3次小锤子，死局且道具耗尽时结束。',
    turkey: '8列10行的竖屏无尽横向滑块消除游戏。拖动不同长度的横向方块左右移动，补满整行后消除并触发重力和连锁；每次有效移动后底部加入新行，方块被推到顶部外则游戏结束。道具包含云雷、星尘收集器和小锤粉碎机。',
    spider: '经典蜘蛛纸牌的无尽模式。开局可选择简单或困难：简单模式全部使用黑桃同一花色，困难模式保持黑桃与红桃两种花色。卡牌可按点数递减叠放，但只有同花色严格递减的连续牌组能整体移动；同花色K到A完整序列会自动收起。牌库无限，每次发牌后会按完成牌组数给出步数限制，倒计时归零会强制发牌。存在空列时必须先填满才能发牌。任意牌列超过30张且无法靠收牌降回安全高度时游戏结束。',
    linklink: '限时配对消除。点击两个相同图案，若它们之间存在最多两次转弯的横竖连接路径即可消除；连接线可以从棋盘外侧一格绕行，但不能穿过图块或石块。连续成功配对每满3次会小幅加时，并显示连击提示。共12关，逐步加入下落、上移、左右靠拢、集中、分散和障碍物。每关清空棋盘并达成目标分后自动进入下一关。',
    blackjack: '双人21点挑战。每一小局使用一副完整52张牌重新洗牌，开局先猜红黑抽判定牌决定本局谁先行动，然后你和Char轮流决定要牌或停牌，尽量接近21点但不能爆牌。每关双方积分从0开始竞速，先达到目标分者赢下本关；玩家连胜8关即完整通关。失败时有5次免费复活机会。',
    westernchess: '标准8×8国际象棋。你执白棋先手，{{char}}执黑棋后手。点击自己的棋子会显示合法落点，再点合法格移动；棋盘以青绿色保留你的最近一步、金色保留{{char}}的最近一步，起点较浅、终点带边框。棋盘上方显示{{char}}吃掉的白棋，下方显示你吃掉的黑棋。王车易位和兵升变为后已实现，不做吃过路兵。将死获胜，逼和、50回合无吃子无兵动、三次重复的简化循环检测会判平。顶部只有反悔按钮，没有其他道具。',
    chinesechess: '标准9×10中国象棋。你执红棋先手，{{char}}执黑棋后手。点击己方棋子高亮合法落点，再点合法格移动或吃子；棋盘以青绿色圆圈保留你的最近一步、金色圆圈保留{{char}}的最近一步，起点为较淡虚线、终点为实线。棋盘上方显示{{char}}吃掉的红棋，下方显示你吃掉的黑棋。实现车、马、相/象、仕/士、帅/将、炮、兵/卒的基础规则，包含马腿、象眼、九宫、过河兵、炮架和将帅照面限制。将死或轮到一方无合法走法时判负；顶部只有反悔按钮，没有其他道具。',
    tictactoe: '你和{{char}}轮流落子，谁先连成横、竖或斜向三格谁赢。棋盘下满无人连线则平局。',
    gomoku: '进入时可选择普通模式或无尽模式。普通模式任意方向先连成五子获胜；无尽模式双方各30颗棋子，连五后回收自己的五子并吃掉对方一子，直到一方棋子被吃完或双方无可用棋子。',
    territory: '在点阵之间画边，规则类似围方格。谁画下一个小方格的第4条边，谁就占领该格并继续行动。所有边画完后，占领格子多的一方获胜。',
    oldmaid: '双方手牌会先自动消去对子。你从{{char}}手里抽牌，{{char}}再从你手里抽牌，抽到能配对的牌就丢掉。最后谁手里留下鬼牌谁输。',
    ludo: '掷到6点可以让停机坪的棋子起飞。棋子沿路线前进，落到对方棋子所在格会把对方撞回家。飞行区按棋盘数字从12飞到20、从22飞到30。四枚棋子全部到达终点的一方获胜。',
    guessnumber: '{{char}}想好一个四位不重复数字。你每次输入四位数，系统只提示“数字对几个、位置对几个”，猜中完整顺序获胜。',
    wordguess: '{{char}}按题目给出描述，你可以猜答案、要求下一条描述，或揭晓答案。猜中题数更多的一方获胜。',
    reversi: '8×8棋盘，双方轮流落子。新棋子和己方棋子夹住的对方棋子会被翻转。无合法落子时跳过，棋盘结束后你的格子数更多则胜。',
    bombnumber: '1-100数字方格中藏着一个炸弹数字。双方轮流点击当前可选范围内的数字，点到炸弹的人失败；点到其他数字会缩小安全范围。',
    connect4d: '双方轮流在7×7棋盘上选择横向位置投放棋子，棋子会从上方虚线落到该列最低空位。横向、纵向或斜向连成四个同色棋子即可获胜。',
    draughts: '跳棋规则。你在下方红色营地，{{char}}在上方蓝色营地，轮流移动。每回合可走到相邻空位，或沿六个方向隔着任意距离的一颗棋子跳到镜像空位；被跳过的棋子可以是自己或对方，也可以连续跳。先让自己的10颗棋子全部进入对方营地的一方获胜。'
  };

  const GAME_CHOICES = {
    shuerte: [
      { id:'easy', title:'简单', sub:'4×4', multiplier:1, size:4, base:20, noFade:false },
      { id:'easy_blind', title:'简单·盲点', sub:'盲点｜不变色｜+8%', multiplier:1.08, size:4, base:20, noFade:true },
      { id:'medium', title:'中等', sub:'5×5', multiplier:1, size:5, base:35, noFade:false },
      { id:'medium_blind', title:'中等·盲点', sub:'盲点｜不变色｜+10%', multiplier:1.10, size:5, base:35, noFade:true },
      { id:'hard', title:'困难', sub:'6×6', multiplier:1, size:6, base:55, noFade:false },
      { id:'hard_blind', title:'困难·盲点', sub:'盲点｜不变色｜+12%', multiplier:1.12, size:6, base:55, noFade:true }
    ],
    minesweeper: [
      { id:'easy', title:'简单', sub:'9×9，10雷', multiplier:0.7, width:9, height:9, mines:10 },
      { id:'medium', title:'中等', sub:'12×12，25雷', multiplier:1, width:12, height:12, mines:25 },
      { id:'hard', title:'困难', sub:'16×16，50雷', multiplier:1.45, width:16, height:16, mines:50 }
    ],
    uyangle: [
      { id:'easy', title:'普通模式', sub:'可通关的正常关卡', multiplier:1, cards:144, compact:false },
      { id:'endless', title:'无尽模式', sub:'一直玩就会一直爽！', multiplier:1.55, cards:210, compact:true, endless:true }
    ],
    popstar: [
      { id:'easy', title:'简单模式', sub:'我想爽玩消消乐', multiplier:1, limitedMoves:false },
      { id:'hard', title:'困难模式', sub:'我想要步数限制', multiplier:2, limitedMoves:true }
    ],
    spider: [
      { id:'easy', title:'简单', sub:'单花色，全部黑桃', multiplier:1, suits:1 },
      { id:'hard', title:'困难', sub:'双花色，黑桃与红桃', multiplier:1, suits:2 }
    ],
    sudoku: [
      { id:'easy', title:'简单', sub:'空30-35个', multiplier:1, blanks:[30,35] },
      { id:'medium', title:'中等', sub:'空43-48个', multiplier:1.25, blanks:[43,48] },
      { id:'hard', title:'困难', sub:'空53-58个', multiplier:1.55, blanks:[53,58] }
    ],
    game2048: [
      { id:'normal', title:'正常版', sub:'4×4，标准计分', multiplier:1, size:4 },
      { id:'fun', title:'爽玩版', sub:'6×6，更容易，分数减半', multiplier:0.5, size:6 }
    ],
    gomoku: [
      { id:'normal', title:'普通模式', sub:'可通关的正常关卡', multiplier:1 },
      { id:'endless', title:'无尽模式', sub:'一直玩就会一直爽！', multiplier:1 }
    ],
    screw: [
      { id:'normal', title:'普通模式', sub:'可通关的正常关卡', multiplier:1 },
      { id:'endless', title:'无尽模式', sub:'一直玩就会一直爽！', multiplier:1 }
    ],
    draughts: [
      { id:'fool', title:'傻瓜模式', sub:'自动跳到合适的点', multiplier:1 },
      { id:'master', title:'大师模式', sub:'自由思考每一步连跳', multiplier:1 }
    ]
  };

  function choiceForState(game, state) {
    const list = GAME_CHOICES[game] || [];
    let id = state?.choice || state?.difficulty || state?.gomokuMode || list[0]?.id;
    if (game === 'uyangle' && id === 'hard') id = 'endless';
    if (game === 'spider' && !state?.choice && !state?.difficulty && Array.isArray(state?.cols)) id = 'hard';
    if (game === 'minesweeper' && !state?.difficulty && Array.isArray(state?.cells)) {
      if (state.cells.length === 16 * 16) id = 'hard';
      else if (state.cells.length === 12 * 12) id = 'medium';
      else if (state.cells.length === 9 * 9) id = 'easy';
    }
    return list.find(x => x.id === id) || list[0] || { id:'normal', title:'普通', sub:'', multiplier:1 };
  }
  function choiceStateKey(game) { return game === 'gomoku' ? 'gomokuMode' : 'difficulty'; }
  function choiceSavePatch(game, choice) {
    const key = choiceStateKey(game);
    return { choice:choice.id, [key]:choice.id };
  }
  function scoreWithChoice(game, rawScore, stateOrChoice) {
    const choice = stateOrChoice && stateOrChoice.multiplier ? stateOrChoice : choiceForState(game, stateOrChoice || {});
    return Math.max(0, Math.round((Number(rawScore) || 0) * Number(choice?.multiplier || 1)));
  }

  const EVENT_DESCRIPTIONS = {
    tetris: { start:'俄罗斯方块开局，玩家准备开始下落方块。', move:'玩家左右移动方块，调整落点。', rotate:'玩家旋转当前方块。', soft_drop:'玩家主动加速下落。', line_1:'俄罗斯方块消除1行。', line_2:'俄罗斯方块一次消除2行。', line_3:'俄罗斯方块一次消除3行。', line_4:'俄罗斯方块一次消除4行。', danger:'方块堆叠接近顶部，局面危险。', score_500:'俄罗斯方块本局分数达到500分。', score_1500:'俄罗斯方块本局分数达到1500分。', score_2000_plus:'俄罗斯方块本局分数达到2000分以上，之后每隔500分触发一次；角色对不同分数的惊讶、兴奋和投入程度应逐渐递增。', record:'单人游戏刷新历史最高分。', gameover:'俄罗斯方块方块堆到顶部，本局结束。', random:'观看俄罗斯方块时的碎碎念。' },
    snake: { start:'贪吃蛇开局。', turn:'贪吃蛇转向。', close_call:'蛇头接近墙体或自身，差点失败。', speed_up:'贪吃蛇吃到更多食物后速度提高；分数越高，蛇移动越快，对话可以提到速度越来越快、反应时间变短、转向更紧张。', eat_1:'贪吃蛇吃到第1个食物。', eat_5:'贪吃蛇累计吃到5个食物，蛇身变长，速度开始更有压力。', eat_10:'贪吃蛇累计吃到10个食物，分数升高，蛇速明显更快。', eat_20:'贪吃蛇累计吃到20个食物，高分阶段蛇速很快，路线和反应都更紧张。', record:'单人游戏刷新历史最高分。', gameover:'贪吃蛇撞墙或撞到自己，本局结束。', random:'观看贪吃蛇时的碎碎念。' },
    game2048: { start:'2048开局。', move:'玩家滑动并移动数字块。', stuck:'棋盘空位很少，局面拥挤。', tile_64:'棋盘首次合成64数字块。', tile_128:'棋盘首次合成128数字块。', tile_256:'棋盘首次合成256数字块。', tile_512:'棋盘首次合成512数字块。', tile_1024:'棋盘首次合成1024数字块；从1024开始角色应明显惊讶。', tile_2048:'棋盘首次合成2048数字块；角色比1024更惊讶、更兴奋。', tile_big:'棋盘合成了超过2048的特别大的数字；不要说具体合成到多少。', record:'单人游戏刷新历史最高分。', gameover:'2048棋盘刚被数字块占满。', random:'观看2048时的碎碎念。' },
    watermelon: { start:'合成大西瓜开局。', aim:'玩家长按瞄准水果落点。', drop_edge:'水果贴近边缘落下。', merge_2:'合成到较小水果。', merge_4:'合成到中级水果。', merge_6:'合成到偏大的水果。', merge_7:'合成到接近大西瓜的大水果。', near_top:'水果堆接近顶部警戒线。', watermelon:'成功合成大西瓜。', record:'单人游戏刷新历史最高分。', gameover:'水果堆快要超过顶部警戒线。', random:'观看合成大西瓜时的碎碎念。' },
    memory: { start:'翻牌记忆开局，4×4牌面扣住。', first_flip:'玩家翻开本局第一张牌。', match:'玩家翻开的两张牌成功配对并消除。', miss:'玩家翻开的两张牌没有配对。', combo:'玩家连续成功配对。', half:'玩家已经完成一半配对。', record:'玩家以更少步数或更高分刷新记录。', gameover:'翻牌记忆只剩最后一对牌未配对。', random:'观看翻牌记忆时的碎碎念。' },
    jump: { start:'跳一跳开局，玩家站在第一个平台上。', charge:'玩家按住屏幕开始蓄力。', jump:'玩家松手起跳。', perfect:'玩家落在平台中心附近。', land:'玩家成功落到下一个平台。', score_10:'跳一跳达到10分。', score_20:'跳一跳达到20分。', score_30:'跳一跳达到30分。', score_40:'跳一跳达到40分。', score_50_plus:'跳一跳达到50分，且50分以上每10分触发一次。', record:'跳一跳刷新历史最高分。', gameover:'玩家松手时就能判断本次不会落上平台，起跳前触发。', random:'观看跳一跳时的碎碎念。' },
    plank: { start:'搭木板开局，玩家站在第一根柱子上。', perfect:'木板长度刚好落在柱子中心附近。', perfect_streak:'玩家连续3次以上完美搭到中心附近。', score_10:'搭木板达到10分。', score_20:'搭木板达到20分。', score_30:'搭木板达到30分。', score_40:'搭木板达到40分。', score_50_plus:'搭木板达到50分，且50分以上每10分触发一次。', record:'搭木板刷新历史最高分。', gameover:'玩家松手时木板已经确定太长或太短。', random:'观看搭木板时的碎碎念。' },
    sudoku: { start:'数独开局，玩家开始解唯一解题目。', first_fill:'玩家填入第一个数字。', erase:'玩家擦除一个已填数字。', hint:'玩家请求一次求助。', many_hints:'玩家求助超过5次。', row_done:'玩家填好一整行。', col_done:'玩家填好一整列。', nearly_done:'数独快要填完。', conflict:'玩家填入的数字在同一行、同一列或同一宫里造成重复。', complete_error:'玩家全部填完但仍有错误格，需要继续修改。', gameover:'数独只剩最后一个空格，或只剩一个错误格需要修改。', random:'观看数独时的碎碎念。' },
    minesweeper: { start:'扫雷开局，16×16棋盘里藏着50个雷。', number:'玩家翻开安全格并出现数字。', flag:'玩家进行插旗或问号标记。', chord:'玩家点击已翻开的数字格，周围标记数量符合数字，成功试探并翻开新格。', big_open:'一次翻开超过5个安全格。', half:'安全格已经翻开一半。', last_5:'按剩余雷数和插旗数计算，显示只剩最后5个雷以内。', record:'扫雷刷新历史最高分。', gameover:'玩家踩到雷，本局失败。', random:'观看扫雷时的待机碎碎念。' },
    shuerte: { start:'舒尔特方格开局，玩家需要按升序寻找随机数字。', first:'玩家点中数字1，计时开始。', combo:'玩家达成5连击或更高连击。', half:'已经按顺序点完一半数字。', last:'只剩最后5个以内数字。', wrong:'玩家点到非目标数字。', hint:'玩家使用提示，高亮下一个目标数字。', focus:'玩家使用聚焦，突出目标所在行列。', shuffle:'玩家使用重排，打散剩余未点击数字。', record:'舒尔特方格刷新历史最高分。', gameover:'玩家点完最后一个数字，挑战完成。', random:'观看舒尔特方格时的待机碎碎念。' },
    uyangle: { start:'U了个U开局。这是一个三消叠牌小游戏，玩家点击未被遮挡的卡牌放入7格槽，同图标3张会消除。', match:'玩家累计每完成3次三消时触发一次普通三消语录；如果同一步触发危险、最后10张、失败或完成等特殊事件，则优先特殊事件。', shuffle:'玩家使用打乱，重新随机排列剩余牌面。', moveout:'玩家使用移出，把槽内一张卡牌移到上方暂存区。', danger:'下方槽位已经占满6个以上，距离失败很近。', last_10:'场上剩余最后10张以内卡牌。', record:'U了个U刷新历史最高分。', gameover:'下方7格槽已满，玩家再放入一张卡牌后没有形成三消，槽位溢出导致失败。', random:'观看U了个U三消叠牌时的碎碎念。' },
    screw: { start:'拧螺丝开局，玩家需要按颜色盒子收集螺丝并清空玻璃面板。', match:'玩家完成一次三颗同色螺丝打包；每次打包后有30%概率触发。', add_box:'玩家点击增加盒子按钮，本局盒子上限增加但最终分数降低。', progress_50:'拧螺丝进度首次达到50%。', progress_80:'拧螺丝进度首次达到80%。', tray_4:'5个候补槽已经填满，下一颗不能进盒的螺丝会导致失败。', record:'拧螺丝刷新历史最高分。', gameover:'候补槽已满后又点击了无法直接进入工具盒的螺丝，拧螺丝失败。', random:'观看拧螺丝时的碎碎念。' },
    popstar: { start:'消灭星星开局，10×10彩色星星棋盘已生成。', first_clear:'当前关第一次消除星星。', small_clear:'玩家只消除了2个星星。', high_clear:'玩家一次消除4个及以上星星，获得较高分数。', level_clear:'玩家通过当前关。', record:'消灭星星刷新历史最高分。', cheat:'玩家使用打乱或单消道具。', target_met:'玩家当前累计分数首次达到本关通关分数。', gameover:'消灭星星没有可消除组合且分数未达到本关目标。', random:'观看消灭星星时的碎碎念。' },
    paopao: { start:'泡泡龙开局，顶部已有5行泡泡，玩家准备瞄准发射。', aim:'玩家按住并拖动，虚线轨迹正在根据墙壁反弹预测落点。', clear:'玩家成功消除同色泡泡。', clear_5:'玩家一次性消除超过5个泡泡。', drop:'失去顶部连接的泡泡悬空掉落。', danger:'泡泡群快要接近红色警戒线。', score_1000:'泡泡龙本局分数每增加1000分时触发。', bomb:'玩家使用炸弹泡泡，炸掉落点周围3格泡泡。', record:'泡泡龙刷新历史最高分。', gameover:'泡泡越过红色警戒线，泡泡龙本局结束。', random:'观看泡泡龙时的待机碎碎念。' },
    zuma: { start:'祖玛无尽模式开局，青蛙准备向持续移动的珠链发射彩珠。', resume:'继续祖玛无尽模式存档。', shoot:'玩家从青蛙口中发射普通彩珠。', swap:'玩家交换当前珠和下一颗珠。', clear:'玩家消除3到4颗同色珠，彩珠播放爆裂淡出后珠链开始回退。', clear_5:'玩家一次消除5颗以上同色珠，彩珠播放爆裂淡出后珠链开始回退。', chain:'珠链平滑回退接合后再次形成同色三消，继续播放爆裂和回退连锁。', miss:'玩家发射的珠子没有击中珠链。', danger:'珠链前端已经接近终点洞口。', bomb:'炸弹命中但只清除少量珠子。', bomb_big:'炸弹命中并清除5颗珠子。', slow:'玩家使用减速道具，珠链减速8秒。', rainbow:'彩虹珠命中后变为目标颜色。', spawn_pressure:'珠链入口累计生成的珠子跨过新的50颗节点。', clear_all:'玩家清空整条珠链获得600分，入口仍会继续生成新珠子。', speed_up:'祖玛动态速度跨过新的阶段。', record:'祖玛刷新历史最高分。', gameover:'珠链进入终点洞口，祖玛无尽模式结束。', random:'观看祖玛时的待机碎碎念。' },
    watersort: { start:'倒瓶子无尽模式开局，彩色水层已经按可解顺序打乱。', resume:'继续倒瓶子无尽模式存档。', pour:'玩家把顶部水层倒入空瓶。', merge:'玩家把水倒到顶部同色的目标瓶。', streak:'玩家连续3步以上合并同色水。', invalid:'玩家选择了颜色不匹配或已满的目标瓶。', undo:'玩家使用撤回道具。', hint:'玩家使用提示并高亮一对建议瓶子。', extra:'玩家增加一个额外空瓶。', reset:'玩家重置当前关。', perfect:'玩家未使用道具完成当前关。', level_clear:'玩家把当前关所有非空瓶整理成满瓶单色。', level_up:'倒瓶子进入下一关并增加颜色、减少空瓶或加深打乱。', settle:'玩家主动结算倒瓶子无尽模式。', record:'倒瓶子刷新历史最高分。', random:'观看倒瓶子时的待机碎碎念。' },
    game1010: { start:'1010!开局，10×10棋盘为空，底部出现3个不可旋转方块。', place:'玩家成功放置一个候补方块。', clear:'玩家消除了一行或一列，30%概率触发。', clear_3:'玩家一次性消除超过3行/列。', score_1000:'1010!本局分数每增加1000分时触发。', tool:'玩家使用重新生成或小锤子道具。', low_space:'棋盘剩余空格少于5个，局面接近死局。', record:'1010!刷新历史最高分。', gameover:'没有任何剩余候补方块可以放入棋盘，且道具已经用完，1010!结束。', random:'观看1010!方块拼图时的碎碎念。' },
    turkey: { start:'土耳其方块开局，底部四行横向方块已经出现。', first_clear:'玩家第一次消除完整横行。', clear_2:'玩家同时消除2行。', clear_3:'玩家同时消除3行及以上。', chain_3:'同一次移动连锁达到第3轮。', combo_5:'连续5次普通移动都产生消除。', score_1000:'土耳其方块分数首次达到1000。', score_5000:'土耳其方块分数首次达到5000。', record:'土耳其方块刷新历史最高分。', top_3:'当前最高方块进入顶部3行。', top_row:'顶行已经被占用。', no_clear_8:'连续8次普通移动没有消除。', thunder:'玩家使用云雷道具。', stardust:'玩家使用星尘收集器。', hammer:'玩家使用小锤粉碎机。', danger_tool:'顶部危险时使用道具并成功存活。', gameover:'方块被推到棋盘顶部之外，土耳其方块结束。', random:'观看土耳其方块时的待机碎碎念。' },
    spider: { start:'无尽蜘蛛纸牌开局，十列牌堆已按所选单花色或双花色难度发好。', complete_spade:'玩家收起一副完整黑桃K到A。', complete_heart:'玩家收起一副完整红桃K到A。', chain_3:'同一次结算连续收起三副以上完整牌组。', collection_10:'已完成牌组收藏区累计达到10副的倍数。', empty_col:'玩家清空一整列，获得整理空间。', auto_3:'玩家尝试发牌或步数倒计时归零时存在空列，需要先填满空列。', deal:'新的一排牌主动或强制发到十列底部。', undo:'玩家使用撤销道具回到上一步。', eliminate:'玩家使用消除道具移除一摞同花色连续牌组。', danger:'任意牌列达到30张临界高度。', bad_deal:'连续发牌后没有明显可移动组合，局面很倒霉。', clear_table:'十列牌堆全部清空，即将重新发牌继续无尽模式。', record:'无尽蜘蛛纸牌刷新历史最高分。', gameover:'牌列超过安全高度，无尽蜘蛛纸牌本局结束。', random:'观看无尽蜘蛛纸牌时的待机碎碎念。' },
    linklink: { start:'连连看新关卡开始，棋盘已经生成。', straight:'零转弯连线成功。', two_turn:'两转弯连线成功。', outside:'连接线从棋盘外侧绕行成功。', combo_5:'连连看达到5连击。', combo_10:'连连看达到10连击。', combo_20:'连连看达到20连击。', wrong:'点击了无法连接的一对。', hint:'玩家使用提示道具。', shuffle:'玩家使用洗牌道具。', dead_shuffle:'棋盘死局并自动洗牌。', freeze:'玩家使用冻结时间。', magic:'玩家使用魔法消除。', time_30:'连连看剩余30秒。', fast_clear:'剩余一半以上时间通关。', level_clear:'连连看完成普通关卡。', gameover:'连连看倒计时结束。', record:'连连看刷新历史最高分。', random:'观看连连看时的待机碎碎念。' },
    chinesechess: { start:'中国象棋开局，红黑双方在楚河汉界两侧摆好。', user_capture:'玩家吃掉{{char}}一枚棋子。', char_capture:'{{char}}吃掉玩家一枚棋子。', user_check:'玩家将军。', char_check:'{{char}}将军，玩家帅位受威胁。', cannon:'一方用炮隔子打吃。', horse:'一方用马走出关键一步。', river:'兵卒过河后开始横向施压。', face:'将帅照面被规则拦住。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', char_next:'{{char}}下一步棋，每隔3-5轮随机触发。', user_win:'玩家将死{{char}}获胜。', user_lose:'{{char}}将死玩家，玩家失败。', draw:'中国象棋平局。', random:'和user玩中国象棋时的碎碎念。' },
    westernchess: { start:'国际象棋开局，白棋和黑棋按标准阵型摆好。', char_first:'{{char}}先观察棋盘，等待玩家白棋开局。', char_second:'玩家执白棋先手。', user_capture:'玩家吃掉{{char}}一枚棋子。', char_capture:'{{char}}吃掉玩家一枚棋子。', user_check:'玩家将军。', char_check:'{{char}}将军，玩家国王受威胁。', castle:'一方完成王车易位。', promotion:'兵走到底线并自动升变为后。', queen_trade:'双方后均被交换或被吃掉。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', char_next:'{{char}}下一步棋，每隔3-5轮随机触发。', user_win:'玩家将死{{char}}获胜。', user_lose:'{{char}}将死玩家，玩家失败。', draw:'国际象棋平局。', random:'和user玩国际象棋时的碎碎念。' },
    blackjack: { start:'21点新关卡开始，双方重新发牌对决。', player_blackjack:'玩家开局获得Blackjack。', char_blackjack:'Char开局获得Blackjack。', player_21:'玩家抽牌后刚好21点。', char_21:'Char抽牌后刚好21点。', player_bust:'玩家爆牌。', char_bust:'Char爆牌。', risky_hit:'玩家19点仍选择要牌。', player_win:'玩家赢下本轮。', char_win:'Char赢下本轮。', win5:'玩家达成五连胜。', close_score:'双方比分非常接近。', hint:'玩家使用提示。', peek:'玩家使用偷看。', undo:'玩家使用反悔。', protect:'护牌生效。', gameover:'21点挑战失败。', record:'21点刷新历史最高总分。', random:'观看21点时的待机碎碎念。' },
    tictactoe: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', user_center:'玩家占据中心格。', user_corner:'玩家占据角落格。', ai_block:'{{char}}阻挡了玩家即将连线的一步。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', char_next:'{{char}}下一子，每隔3-5轮随机触发。', user_win:'玩家在井字棋获胜。', user_lose:'{{char}}在井字棋获胜，玩家失败。', draw:'井字棋平局。', random:'和user玩井字棋时的碎碎念。' },
    gomoku: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', user_three:'玩家形成三连或强威胁。', user_open_three:'玩家下出三连且两边都没有被遮挡，明显准备进攻。', user_blocked_four:'玩家下出四连但有一边被遮挡，仍然是强进攻。', user_open_four:'玩家下出四连且两边都没有被遮挡，{{char}}知道自己这把基本必输了。', ai_block:'{{char}}阻挡玩家形成强威胁。', ai_threat:'{{char}}形成强威胁，玩家需要防守。', user_capture:'五子棋无尽模式，玩家吃掉{{char}}一颗棋子并用自己的棋子替换该位置。', char_capture:'五子棋无尽模式，{{char}}吃掉玩家一颗棋子并用自己的棋子替换该位置。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', char_next:'{{char}}下一子，每隔3-5轮随机触发。', user_win:'玩家五子连线获胜。', user_lose:'{{char}}五子连线获胜，玩家失败。', draw:'五子棋平局。', random:'和user玩五子棋时的碎碎念。' },
    territory: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', edge:'玩家画下一条边。', no_safe_edge:'场面没有普通边了，之后每条边都可能送分。', capture:'玩家围住某个方格最后一条边并占领得分。', chain:'玩家连续占领多个方格。', ta_capture:'{{char}}围住某个方格并占领得分。', user_turn:'{{char}}的回合结束，轮到玩家。', danger:'玩家选择可能送给{{char}}得分机会的边。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', char_next:'{{char}}下一子，每隔3-5轮随机触发。', user_win:'所有边画完后玩家得分更高。', user_lose:'所有边画完后{{char}}得分更高。', draw:'所有边画完后双方平分。', random:'和user玩电子围地盘时的碎碎念。' },
    oldmaid: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', draw:'玩家从{{char}}手里随机抽走一张牌。', pair:'玩家抽牌后凑成对子并消去。', ta_draw:'{{char}}从玩家手里随机抽走一张牌。', ta_pair:'{{char}}抽牌后凑成对子并消去。', joker:'鬼牌在双方之间转移。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', user_win:'玩家先清空手牌，没有留下鬼牌。', user_lose:'玩家最后留下鬼牌，{{char}}获胜。', random:'和user玩抽鬼牌时的碎碎念。' },
    ludo: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', roll_6:'玩家掷出6点。', no_move:'玩家本回合没有可移动棋子。', user_takeoff:'玩家掷出可起飞点数，玩家飞机起飞。', char_takeoff:'{{char}}掷出可起飞点数，{{char}}飞机起飞。', user_capture:'玩家把{{char}}的棋子撞回家，{{char}}会懊恼或不甘。', char_capture:'{{char}}把玩家的棋子撞回家，{{char}}会得意或调侃。', user_flight:'玩家棋子落到飞行区并完成飞行。', char_flight:'{{char}}棋子落到飞行区并完成飞行，{{char}}可以得瑟或炫耀。', near_finish:'玩家棋子接近终点。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', user_win:'玩家率先到达终点获胜。', user_lose:'{{char}}率先到达终点，玩家失败。', random:'和user玩双人飞行棋时的碎碎念。' },
    guessnumber: { start:'角色想好一个四位数。', guess:'用户提交了一次四位数猜测。', miss:'本次猜测几乎没有命中。', close:'本次猜测数字或位置命中较多。', very_close:'本次猜测非常接近答案。', many_tries:'用户已经尝试多次仍未猜中。', user_win:'用户猜中完整四位数。', random:'猜测间隙的随机角色互动。' },
    wordguess: { random:'猜词间隙的随机角色互动。', user_win:'我说你猜中，玩家猜中第3题时触发；{{char}}知道这一把user已经赢定了。', user_lose:'我说你猜中，玩家第3次没猜中或揭晓答案时触发；{{char}}知道这一把自己已经赢定，user已经输了。' }
    ,reversi: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', corner:'玩家占据角落。', char_big_flip:'{{char}}一次翻转玩家超过5个棋子。', user_big_flip:'玩家一次翻转{{char}}超过5个棋子。', char_double:'棋盘上{{char}}棋子数量超过user的一倍。', user_double:'棋盘上user棋子数量超过{{char}}的一倍。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', char_next:'{{char}}下一子，每隔3-5轮随机触发。', user_win:'翻转棋只剩最后一个空位时，玩家棋子数领先，基本确认玩家会获胜。', user_lose:'翻转棋只剩最后一个空位时，{{char}}棋子数领先，玩家基本会失败。', draw:'翻转棋只剩最后一个空位时，双方棋子数相同，局面接近平局。', random:'和user玩翻转棋时的碎碎念。' }
    ,bombnumber: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', range_100_80:'可选范围还剩80到100个数字，氛围轻松。', range_80_60:'可选范围还剩60到80个数字，仍然稍微轻松。', range_60_40:'可选范围还剩40到60个数字，开始有点紧张。', range_40_20:'可选范围还剩20到40个数字，开始认真，可能想诈一下玩家。', range_20_0:'可选范围小于20个数字，马上就要炸了。', doomed:'可选范围只剩1个安全选择，局面像已经结束。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', user_win:'玩家没有点中炸弹，{{char}}点中炸弹失败。', user_lose:'玩家点中炸弹失败。', random:'和user玩数字炸弹时的碎碎念。' }
    ,connect4d: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', user_three:'玩家形成三连或强威胁。', user_open_four:'玩家已经形成四连获胜。', ai_block:'{{char}}阻挡玩家的威胁。', ai_threat:'{{char}}形成强威胁。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', char_next:'{{char}}下一子，每隔3-5轮随机触发。', user_win:'玩家在7×7棋盘横向、纵向或斜向连成四子。', user_lose:'{{char}}在7×7棋盘横向、纵向或斜向连成四子。', draw:'棋盘填满无人连成四子。', random:'和user玩立体四子棋时的碎碎念。' }
    ,draughts: { char_first:'{{char}}先手。', char_second:'{{char}}后手。', user_move:'玩家走跳棋；每个玩家回合有50%概率触发，若同回合有特殊语录则优先特殊语录。', char_move:'{{char}}走跳棋；每个角色回合有50%概率触发，若同回合有特殊语录则优先特殊语录。', cheat_success:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，并且本次耍赖成功；{{char}}纵容user撤回这一步。', cheat_fail:'玩家撒娇卖萌耍赖，请求{{char}}让自己撤销上一步，但本次耍赖失败；{{char}}面对user撒娇仍表示这次不允许撤回。', user_home:'玩家红棋进入{{char}}上方蓝色营地。', char_home:'{{char}}蓝棋进入玩家下方红色营地。', user_win:'玩家10颗红棋全部进入{{char}}营地，玩家获胜。', user_lose:'{{char}}10颗蓝棋全部进入玩家营地，玩家失败。', random:'和user玩跳棋时的碎碎念。' }
  };
  function getHostWindow() {
    try { return (window.parent && window.parent !== window) ? window.parent : window; }
    catch(e) { return window; }
  }
  function getHostDocument() {
    try { const w = getHostWindow(); return w.document || document; }
    catch(e) { return document; }
  }
  function getHostJQ() {
    try { const w = getHostWindow(); return w.$ || w.jQuery || (typeof $ !== 'undefined' ? $ : (typeof jQuery !== 'undefined' ? jQuery : null)); }
    catch(e) { return (typeof $ !== 'undefined' ? $ : (typeof jQuery !== 'undefined' ? jQuery : null)); }
  }
  function qs(s, root) { return (root || getHostDocument()).querySelector(s); }
  function qsa(s, root) { return Array.from((root || getHostDocument()).querySelectorAll(s)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function loadJSON(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e) { return fallback; } }
  function saveJSON(key, value) { try { const raw = JSON.stringify(value); localStorage.setItem(key, raw); if (localStorage.getItem(key) !== raw) throw Error('存档写入未完成'); storageWriteErrors.delete(key); return true; } catch(e) { storageWriteErrors.set(key, e); return false; } }
  function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function safeObject(v) { return isPlainObject(v) ? v : {}; }
  function safeArray(v) { return Array.isArray(v) ? v : []; }
  function settings() { const loaded = Object.assign({}, DEFAULT_SETTINGS, safeObject(loadJSON(STORAGE_SETTINGS, {}))); return standalone ? constrainStandaloneSettings(loaded) : loaded; }
  function setSettings(next) { const merged = Object.assign(settings(), next); saveJSON(STORAGE_SETTINGS, standalone ? constrainStandaloneSettings(merged) : merged); }
  function extensionUpdateHeaders() {
    try { return getRequestHeaders(); }
    catch(e) { return { 'Content-Type': 'application/json' }; }
  }
  function extensionUpdateCandidates() {
    const out = [];
    const add = name => {
      name = String(name || '').trim();
      if (!name) return;
      if (!name.startsWith('/')) name = '/' + name;
      if (!out.includes(name)) out.push(name);
    };
    try {
      const raw = decodeURIComponent(String(import.meta.url || '')).replace(/\\/g, '/');
      const match = raw.match(/(?:^|\/)public\/scripts\/extensions\/third-party\/([^/]+)/i)
        || raw.match(/(?:^|\/)public\/scripts\/extensions\/([^/]+)/i)
        || raw.match(/(?:^|\/)scripts\/extensions\/third-party\/([^/]+)/i)
        || raw.match(/(?:^|\/)scripts\/extensions\/([^/]+)/i)
        || raw.match(/(?:^|\/)third-party\/([^/]+)/i);
      if (match) add(match[1]);
    } catch(e) {}
    // A renamed installation must update its own directory, not another copy.
    if (!out.length) EXTENSION_UPDATE_FALLBACKS.forEach(add);
    return out;
  }
  async function requestExtensionApi(endpoint, installation, extra) {
    const extensionName = installation.extensionName;
    const res = await fetch('/api/extensions/' + endpoint, {
      method:'POST',
      headers:extensionUpdateHeaders(),
      body:JSON.stringify(Object.assign({ extensionName, global:!!installation.global }, extra)),
    });
    if (!res.ok) {
      const error = new Error((await res.text()).slice(0, 240) || res.statusText || endpoint + ' failed');
      error.status = res.status; throw error;
    }
    if (res.status === 204) return null;
    const data = await res.json();
    if (data && !Array.isArray(data)) Object.assign(data, { extensionName, global:!!installation.global });
    return data;
  }
  function normalizeGitRemoteUrl(url) {
    let raw = String(url || '').trim();
    if (!raw) return '';
    const ssh = raw.match(/^git@([^:]+):(.+)$/);
    if (ssh) raw = 'https://' + ssh[1] + '/' + ssh[2];
    raw = raw.replace(/\/$/, '').replace(/\.git(?:[#?].*)?$/, '');
    return raw;
  }
  function remoteManifestUrl(data) {
    if (normalizeGitRemoteUrl(data && data.remoteUrl).toLowerCase() !== EXTENSION_UPDATE_REPOSITORY.toLowerCase()) return '';
    return 'https://raw.githubusercontent.com/JackLee992/USER_HOUSE/' + EXTENSION_UPDATE_BRANCH + '/manifest.json';
  }
  function validateExtensionUpdateSource(data) {
    if (!data || typeof data.isUpToDate !== 'boolean' || !data.currentCommitHash || !data.currentBranchName || !data.remoteUrl) {
      throw new Error('此安装没有可更新的 Git 仓库信息，请从酒馆扩展管理检查安装状态。');
    }
    if (!remoteManifestUrl(data)) throw new Error('当前安装来源不是 ' + EXTENSION_UPDATE_REPOSITORY + '，无法通过本按钮更新其他仓库。');
    return data;
  }
  async function readInstalledExtensionVersion() {
    let discovered = null;
    try {
      const response = await fetch('/api/extensions/discover', { headers:extensionUpdateHeaders(), cache:'no-store' });
      if (response.ok) { const entries = await response.json(); if (Array.isArray(entries)) discovered = entries; }
    } catch(e) {}
    let lastError = null;
    for (const name of extensionUpdateCandidates()) {
      const folder = name.replace(/^\/+/, '');
      const known = discovered && discovered.find(item => item.name === 'third-party/' + folder);
      const scopes = known ? [known.type === 'global'] : [false, true];
      for (const global of scopes) {
        try { return validateExtensionUpdateSource(await requestExtensionApi('version', { extensionName:folder, global })); }
        catch(e) { lastError = e; if (e.status !== 404) throw e; }
      }
    }
    throw lastError || new Error('酒馆未找到当前扩展目录。');
  }
  async function fetchRemoteExtensionVersion(data) {
    const url = remoteManifestUrl(data);
    if (!url) return '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, { cache:'no-store', signal:controller.signal });
      if (!res.ok) throw new Error('remote manifest failed');
      const manifest = await res.json();
      return String(manifest && manifest.version ? manifest.version : '').trim();
    } finally { clearTimeout(timer); }
  }
  function updatePanelHTML() {
    const data = updateState.data || {};
    const remote = data.remoteVersion ? ('V' + data.remoteVersion + '（当前 V' + EXTENSION_VERSION + '）') : (data.currentBranchName || (data.currentCommitHash ? data.currentCommitHash.slice(0, 7) : '') || '远端更新');
    let status = updateState.checked ? '当前已更新至最新版本' : '正在检查更新...';
    let cls = 'idle';
    if (updateState.checking) { status = '正在检查更新...'; cls = 'busy'; }
    else if (updateState.updating) { status = '正在更新插件，请稍候...'; cls = 'busy'; }
    else if (updateState.error) { status = updateState.error; cls = 'error'; }
    else if (updateState.updated) { status = '文件已更新，刷新页面后生效；存档和设置保留。'; cls = 'done'; }
    else if (updateState.available) { status = data.switchRequired ? '可切换至主分支并更新：' + remote : '发现新版本：' + remote; cls = 'available'; }
    else if (updateState.checked) { status = '当前已更新至最新版本'; cls = 'ok'; }
    const busyAttr = (updateState.checking || updateState.updating) ? 'disabled' : '';
    return '<div class="wb-panel wb-update-panel ' + cls + '" id="wb-update-panel">'
      + '<div class="wb-update-row"><span title="' + esc(status) + '">' + esc(status) + '</span>'
      + '<button class="wb-btn wb-update-icon" id="wb-check-update" title="检查更新" aria-label="检查更新" ' + busyAttr + '><i class="fa-solid fa-rotate-right"></i></button>'
      + (updateState.available ? '<button class="wb-btn primary wb-update-icon" id="wb-run-update" title="更新插件" aria-label="更新插件" ' + (updateState.updating ? 'disabled' : '') + '><i class="fa-solid fa-download"></i></button>' : '')
      + (updateState.updated ? '<button class="wb-btn primary" id="wb-reload-update" ' + busyAttr + '>刷新生效</button>' : '')
      + '</div><div class="wb-muted" style="font-size:11px;margin-top:4px;overflow-wrap:anywhere">更新源：JackLee992/USER_HOUSE · main' + (updateState.error ? '<br>' + esc(updateState.error) : '') + '</div></div>';
  }
  function syncUpdateNoticeClass() {
    qsa('.wb-tab[data-tab="settings"]').forEach(btn => btn.classList.toggle('update-available', !!updateState.available));
  }
  function bindUpdatePanelEvents() {
    const check = qs('#wb-check-update'); if (check) check.onclick = () => checkExtensionUpdate(true);
    const run = qs('#wb-run-update'); if (run) run.onclick = runExtensionUpdate;
    const reload = qs('#wb-reload-update'); if (reload) reload.onclick = () => { saveBeforeExtensionUpdate(); getHostWindow().location.reload(); };
    syncUpdateNoticeClass();
  }
  function refreshUpdatePanel() {
    const panel = qs('#wb-update-panel');
    if (panel) {
      panel.outerHTML = updatePanelHTML();
      bindUpdatePanelEvents();
    } else syncUpdateNoticeClass();
  }
  async function checkExtensionUpdate(manual) {
    if (updateState.checking || updateState.updating) return updateState.data;
    updateState = Object.assign({}, updateState, { checking:true, checked:false, error:'' });
    refreshUpdatePanel();
    try {
      const data = await readInstalledExtensionVersion();
      data.switchRequired = data.currentBranchName !== EXTENSION_UPDATE_BRANCH;
      if (data.isUpToDate === false || data.switchRequired) {
        try { data.remoteVersion = await fetchRemoteExtensionVersion(data); } catch(e) { data.remoteVersion = ''; }
      }
      updateState = { checking:false, updating:false, checked:true, available:data.isUpToDate === false || data.switchRequired, updated:updateState.updated, error:'', data };
      if (manual) toast(updateState.available ? ('检测到可用更新' + (data && data.remoteVersion ? '：V' + data.remoteVersion : '')) : '已经是最新版本');
      return data;
    } catch(e) {
      updateState = Object.assign({}, updateState, { checking:false, checked:true, available:false, error:'检查更新失败：' + (e && e.message ? e.message : e) });
      if (manual) toast(updateState.error);
      return null;
    } finally {
      refreshUpdatePanel();
    }
  }
  function saveBeforeExtensionUpdate() {
    activeGameController?.save?.();
    flushAllProgressSaves();
    flushSettingsProgress();
  }
  async function runExtensionUpdate() {
    if (updateState.updating || updateState.checking) return;
    updateState = Object.assign({}, updateState, { updating:true, error:'' });
    refreshUpdatePanel();
    try {
      saveBeforeExtensionUpdate();
      const before = await readInstalledExtensionVersion();
      if (before.currentBranchName !== EXTENSION_UPDATE_BRANCH) {
        const branches = await requestExtensionApi('branches', before);
        if (!Array.isArray(branches) || !branches.some(branch => branch.name === 'origin/' + EXTENSION_UPDATE_BRANCH)) throw new Error('远端主分支不存在，尚未更改安装。');
        await requestExtensionApi('switch', before, { branch:'origin/' + EXTENSION_UPDATE_BRANCH });
      }
      await requestExtensionApi('update', before);
      // SillyTavern's update response reports the status BEFORE its pull.
      // Verify the actual installed branch and commit with a fresh version call.
      const data = validateExtensionUpdateSource(await requestExtensionApi('version', before));
      if (data.currentBranchName !== EXTENSION_UPDATE_BRANCH || data.isUpToDate !== true) throw new Error('更新后校验未通过，请重试；尚未确认文件已是主分支最新版。');
      const changed = before.currentCommitHash !== data.currentCommitHash || before.currentBranchName !== data.currentBranchName;
      updateState = { checking:false, updating:false, checked:true, available:false, updated:changed || updateState.updated, error:'', data };
      toast(updateState.updated ? '更新完成，点击“刷新生效”；无需卸载，存档和设置保留。' : '已经是主分支最新版本');
    } catch(e) {
      updateState = Object.assign({}, updateState, { updating:false, error:'更新失败：' + (e && e.message ? e.message : e) });
      toast(updateState.error);
    } finally {
      refreshUpdatePanel();
    }
  }
  function scheduleInitialUpdateCheck() {
    if (updateCheckStarted) return;
    updateCheckStarted = true;
    setTimeout(() => checkExtensionUpdate(false), 1800);
  }
  function companionDockSide(cfg) {
    cfg = cfg || settings();
    if (cfg.companionDock === 'start' || cfg.companionDock === 'end') return cfg.companionDock;
    if (cfg.companionDockPc === 'left' || cfg.companionDockMobile === 'top') return 'start';
    return 'end';
  }
  function saveWindowState(tab, game) {
    const cfg = settings();
    if (!cfg.rememberWindow) return;
    const nextTab = tab || currentTab || cfg.lastTab || 'single';
    const nextGame = game || '';
    setSettings({ lastTab: nextTab, lastGame: nextGame });
  }
  function restoreWindowState() {
    const cfg = settings();
    if (!cfg.rememberWindow) {
      currentTab = 'single';
      currentGame = null;
      return;
    }
    const tab = GAME_META[cfg.lastGame] ? GAME_META[cfg.lastGame].mode : cfg.lastTab;
    currentTab = (tab === 'double' || (!standalone && tab === 'intimacy') || tab === 'settings' || tab === 'single') ? tab : 'single';
    currentGame = GAME_META[cfg.lastGame] ? cfg.lastGame : null;
  }
  function scores() {
    const loaded = safeObject(loadJSON(STORAGE_SCORES, {}));
    const base = { tetris: 0, snake: 0, game2048: 0, watermelon: 0, memory: 0, jump: 0, plank: 0, sudoku: 0, minesweeper: 0, shuerte: 0, uyangle: 0, screw: 0, popstar: 0, paopao: 0, zuma: 0, watersort: 0, game1010: 0, turkey: 0, spider: 0, ludo: { user: 0, ta: 0 }, guessnumber: { user: 0, ta: 0 }, wordguess: { user: 0, ta: 0 }, tictactoe: { user: 0, ta: 0 }, gomoku: { user: 0, ta: 0 }, territory: { user: 0, ta: 0 }, oldmaid: { user: 0, ta: 0 }, reversi: { user: 0, ta: 0 }, bombnumber: { user: 0, ta: 0 }, connect4d: { user: 0, ta: 0 }, draughts: { user: 0, ta: 0 }, westernchess: { user: 0, ta: 0 }, chinesechess: { user: 0, ta: 0 } };
    ['ludo','guessnumber','wordguess','tictactoe','gomoku','territory','oldmaid','reversi','bombnumber','connect4d','draughts','westernchess','chinesechess'].forEach(k => { if (typeof loaded[k] === 'number') loaded[k] = { user: loaded[k], ta: 0 }; });
    return Object.assign(base, loaded);
  }
  function lines() { return Object.assign({}, DEFAULT_LINES, safeObject(loadJSON(STORAGE_LINES, {}))); }
  function saveLines(v) { saveJSON(STORAGE_LINES, v); }
  function roleLines() { return safeObject(loadJSON(STORAGE_ROLE_LINES, {})); }
  function saveRoleLines(v) { saveJSON(STORAGE_ROLE_LINES, v); }
  function linePresetSelection() { return safeObject(loadJSON(STORAGE_LINE_PRESET_SELECTION, {})); }
  function saveLinePresetSelection(v) { saveJSON(STORAGE_LINE_PRESET_SELECTION, v); }
  function normalizePresetName(name) { return String(name || '默认语录').trim().slice(0, 24) || '默认语录'; }
  function roleLineScopeForName(game, name) { return String(name || companionName()).trim() + '::' + game; }
  function roleLineScope(game) { return roleLineScopeForName(game, companionName()); }
  function currentLinePreset(game) { const sel = linePresetSelection(); return normalizePresetName(sel[roleLineScope(game)] || companionName()); }
  function activeGameRoleName(game) { const id = game || currentGame; return id && GAME_META[id] ? normalizePresetName(currentLinePreset(id)) : companionName(); }
  function setCurrentLinePreset(game, name) { const sel = linePresetSelection(); sel[roleLineScope(game)] = normalizePresetName(name); saveLinePresetSelection(sel); }
  function roleLineSet(game, preset) { const all = roleLines(); const name = normalizePresetName(preset || currentLinePreset(game)); const scope = all[roleLineScope(game)] || {}; const direct = scope[name]; if (direct) return direct; const roleScope = all[roleLineScopeForName(game, name)] || {}; return roleScope[name] || Object.keys(roleScope).map(k => roleScope[k]).find(v => validLineSet(game, v)) || null; }
  function roleLineSetForName(game, roleName, preset) { const all = roleLines(); const scope = all[roleLineScopeForName(game, roleName)] || {}; return scope[normalizePresetName(preset || roleName)] || null; }
	  function activeLineSet(game) { return Object.assign({}, DEFAULT_LINES[game] || {}, lines()[game] || {}, roleLineSet(game) || {}); }
  function presetNamesForGame(game) { const scope = roleLines()[roleLineScope(game)] || {}; const names = Object.keys(scope).filter(Boolean).concat(roleNamesForLineStorage()); const current = normalizePresetName(companionName()); if (!names.includes(current)) names.unshift(current); return Array.from(new Set(names.map(normalizePresetName).filter(Boolean))); }
  function saveRoleLineSet(game, preset, data) { const all = roleLines(); const scopeKey = roleLineScope(game); if (!all[scopeKey]) all[scopeKey] = {}; all[scopeKey][normalizePresetName(preset)] = data; saveRoleLines(all); }
  function saveRoleLineSetForName(game, roleName, preset, data) { const all = roleLines(); const scopeKey = roleLineScopeForName(game, roleName); if (!all[scopeKey]) all[scopeKey] = {}; all[scopeKey][normalizePresetName(preset || roleName)] = data; saveRoleLines(all); }
  function saveTheaterCache() { saveJSON(STORAGE_THEATERS, theaterCache || {}); }
  function roleNamesForLineStorage() { const names = [companionName()]; worldPresets().forEach(x => { if (x && x.name) names.push(x.name); }); Object.keys(roleLines()).forEach(k => { const name = String(k).split('::')[0]; if (name) names.push(name); }); return Array.from(new Set(names.map(normalizePresetName).filter(Boolean))); }
  function validLineSet(game, set) {
    if (!set || typeof set !== 'object' || Array.isArray(set)) return false;
    const keys = Object.keys(DEFAULT_LINES[game] || {});
    return !!keys.length && keys.every(k => Array.isArray(set[k]) && set[k].some(v => String(v || '').trim()));
  }
  function roleLineStorageStatus(game, roleName) {
    const failKey = normalizePresetName(roleName || companionName()) + '::' + game;
    if (lineGenerationFailures[failKey]) return '失败';
    const scope = roleLines()[roleLineScopeForName(game, roleName)] || {};
    const vals = Object.keys(scope).map(k => scope[k]).filter(v => v != null);
    if (vals.some(v => validLineSet(game, v))) return '已有';
    return vals.length ? '失败' : '未生成';
  }
  function roleHasLineStorage(game, roleName) { return roleLineStorageStatus(game, roleName) === '已有'; }
  function storedLineSetForRoleGame(game, roleName) { const scope = roleLines()[roleLineScopeForName(game, roleName)] || {}; const preset = normalizePresetName(roleName); if (validLineSet(game, scope[preset])) return scope[preset]; return Object.keys(scope).map(k => scope[k]).find(v => validLineSet(game, v)) || null; }
  function theaterCacheKeyForName(roleName, game, outcome, special) { return normalizePresetName(roleName || companionName()) + '::' + game + '::' + (outcome || 'score') + '::' + (special || 'normal'); }
  function roleTheaterStorageStatus(game, roleName) {
    const failKey = normalizePresetName(roleName || companionName()) + '::' + game;
    if (theaterGenerationFailures[failKey]) return '失败';
    const jobs = theaterJobsForGame(game);
    const ok = jobs.length && jobs.every(([outcome, special]) => {
      const arr = theaterCache[theaterCacheKeyForName(roleName, game, outcome, special === 'normal' ? '' : special)];
      return Array.isArray(arr) && arr.some(v => String(v || '').trim());
    });
    return ok ? '已有' : '未生成';
  }
  function formatStoredTheaters(game, roleName) {
    const role = normalizePresetName(roleName || companionName());
    const failKey = role + '::' + game;
    if (theaterGenerationFailures[failKey]) return '失败：' + theaterGenerationFailures[failKey];
    const jobs = theaterJobsForGame(game);
    return jobs.map(([outcome, special]) => {
      const key = theaterCacheKeyForName(role, game, outcome, special === 'normal' ? '' : special);
      const arr = theaterCache[key];
      const title = theaterPackKey(outcome, special);
      if (!Array.isArray(arr) || !arr.length) return '【' + title + '】\n未生成';
      return '【' + title + '】\n' + arr.map((x,i) => (i + 1) + '. ' + textSegments(x).join(' / ').slice(0, 180)).join('\n');
    }).join('\n\n');
  }
  function formatStoredLineSet(game, set) {
    if (!set) return '当前角色和游戏还没有完整可用的语录。';
    return Object.keys(DEFAULT_LINES[game] || set).map(k => {
      const arr = Array.isArray(set[k]) ? set[k] : [];
      return '【' + k + '】\n' + (arr.length ? arr.join('\n') : '未存储');
    }).join('\n\n');
  }
  function apiPresets() { return safeArray(loadJSON(STORAGE_API_PRESETS, [])); }
  function saveApiPresets(v) { saveJSON(STORAGE_API_PRESETS, v); }
  function apiConfigFromPresetIndex(index) {
    const idx = parseInt(index, 10);
    const pr = apiPresets()[idx];
    return pr ? Object.assign({}, settings(), { apiUrl:pr.apiUrl || '', apiKey:pr.apiKey || '', apiModel:pr.apiModel || '' }) : settings();
  }
  function apiFieldsFromPresetIndex(index) {
    const idx = parseInt(index, 10);
    const pr = apiPresets()[idx];
    const cfg = pr || settings();
    return { apiUrl:cfg.apiUrl || '', apiKey:cfg.apiKey || '', apiModel:cfg.apiModel || '' };
  }
  function worldPresets() { return safeArray(loadJSON(STORAGE_WORLD_PRESETS, [])); }
  function saveWorldPresets(v) { saveJSON(STORAGE_WORLD_PRESETS, v); }
  function worldPresetForRole(roleName) {
    const name = normalizePresetName(roleName || companionName());
    return worldPresets().find(x => normalizePresetName(x && x.name) === name) || null;
  }
  function rolePromptConfig(roleName, baseCfg, extra) {
    const role = normalizePresetName(roleName || companionName());
    const pr = worldPresetForRole(role);
    const cfg = Object.assign({}, baseCfg || settings(), pr || {}, extra || {});
    cfg.charName = role;
    return cfg;
  }
  function applyRoleToAllGames(roleName) {
    const role = normalizePresetName(roleName || companionName());
    Object.keys(GAME_META).forEach(game => setCurrentLinePreset(game, role));
  }
  function summaries() { return safeArray(loadJSON(STORAGE_SUMMARIES, [])); }
  function saveSummaries(v) { saveJSON(STORAGE_SUMMARIES, v); }
  function summaryReq() { return localStorage.getItem(STORAGE_SUMMARY_REQ) || ''; }
  function saveSummaryReq(v) { try { localStorage.setItem(STORAGE_SUMMARY_REQ, String(v || '')); } catch(e) {} }
  const PROGRESS_SAVE_DELAY = 700;
  function progress() { return safeObject(loadJSON(STORAGE_PROGRESS, {})); }
  function clearSudokuStateSnapshot() { try { localStorage.removeItem(STORAGE_SUDOKU_STATE); } catch(e) {} }
  function isValidSudokuPuzzle(puz, sol) {
    return Array.isArray(puz) && Array.isArray(sol) && puz.length === 81 && sol.length === 81
      && puz.filter(Boolean).length >= 17
      && sol.every(n => Number.isInteger(n) && n >= 1 && n <= 9)
      && puz.every((n, i) => !n || n === sol[i]);
  }
  function isValidSudokuProgressState(state) {
    if (!state || !isValidSudokuPuzzle(state.puzzle, state.solution) || !Array.isArray(state.grid) || state.grid.length !== 81) return false;
    return state.grid.every((n, i) => {
      if (state.puzzle[i]) return n === state.puzzle[i];
      return n === 0 || (Number.isInteger(n) && n >= 1 && n <= 9);
    });
  }
  function buildProgressEntry(game, state) {
    const prev = progressSaveCache[game] || progress()[game] || {};
    const startedAt = (state && state.startedAt) || prev.startedAt || gameStartAt || Date.now();
    const extra = game === currentGame ? { lineEvents: currentRoundLineEvents.slice(-120) } : {};
    const durationMs = game === currentGame ? currentGameDurationMs() : (state && state.durationMs) || prev.durationMs || 0;
    const petRewardNextMs = game === currentGame ? gamePetRewardNextMs : (state && state.petRewardNextMs) || prev.petRewardNextMs || nextPetGameRewardThreshold(durationMs);
    return Object.assign({ savedAt: Date.now(), startedAt }, extra, state || {}, { durationMs, petRewardNextMs, _content: game === currentGame && roundContent ? roundContent : prev._content || contentForGame(game) });
  }
  function flushProgressSave(game) {
    if (!game || !progressSaveCache[game]) return;
    if (progressSaveTimers[game]) {
      clearTimeout(progressSaveTimers[game]);
      delete progressSaveTimers[game];
    }
    const p = progress();
    p[game] = progressSaveCache[game];
    if (saveJSON(STORAGE_PROGRESS, p)) delete progressSaveCache[game];
  }
  function flushAllProgressSaves() { Object.keys(progressSaveCache).forEach(flushProgressSave); }
  function gameProgress(game) { flushProgressSave(game); const p = progress()[game]; return p && p.savedAt ? p : null; }
  function currentGameDurationMs() {
    const active = isGameOnlineActive() && gameActiveStartedAt ? Math.max(0, Date.now() - gameActiveStartedAt) : 0;
    return Math.max(0, (gameAccumulatedMs || 0) + active);
  }
  function isGameSurfaceVisible() {
    const doc = getHostDocument();
    const shell = qs('#' + SHELL_ID, doc);
    return !!(shell && shell.classList.contains('wb-shell-visible') && shell.style.display !== 'none' && !doc.hidden);
  }
  function isGameOnlineActive() {
    return !!(gameStarted && !gamePaused && currentGame && isGameSurfaceVisible());
  }
  function nextPetGameRewardThreshold(durationMs) {
    const step = 10 * 60 * 1000, first = 30 * 60 * 1000;
    return Math.max(first, (Math.floor(Math.max(0, Number(durationMs || 0)) / step) + 1) * step);
  }
  function petApplyTimedGameGrowth() {
    let state = applyPetVisitAndDecay(petTestState());
    if (state.ended) return;
    const today = todayKey();
    const day = Object.assign({ feed:0, pet:0, poke:0, outing:0, play:0 }, state.days[today] || {});
    const beforeGrowth = Number(state.growth || 0);
    state.growth = Math.min(petStageCap(state.stage), beforeGrowth + 3);
    const added = Math.max(0, Number(state.growth || 0) - beforeGrowth);
    if (added > 0) {
      day.growth = Number(day.growth || 0) + added;
      day.playTime = Number(day.playTime || 0) + added;
      day.snapshot = petSnapshotData(state);
      state.days = Object.assign({}, state.days || {}, { [today]:day });
      state.lastDecayAt = Date.now();
      savePetTestState(updatePetPendingStories(state, petTestInfoCache || { side_story:[] }));
      toast('玩得很开心！成长值+3');
    }
  }
  function applyTimedGameRewards(durationMs) {
    if (standalone) return;
    while (durationMs >= gamePetRewardNextMs) {
      petApplyTimedGameGrowth();
      gamePetRewardNextMs += 10 * 60 * 1000;
    }
  }
  function startGameDurationRewardTimer() {
    if (standalone) return;
    if (gameDurationRewardTimer) clearInterval(gameDurationRewardTimer);
    gameDurationRewardTimer = setInterval(() => {
      if (gameStarted && !gamePaused && currentGame) commitGameActiveDuration(true);
    }, 30000);
  }
  function clearGameDurationRewardTimer() {
    if (gameDurationRewardTimer) clearInterval(gameDurationRewardTimer);
    gameDurationRewardTimer = null;
  }
  function commitGameActiveDuration(updateStored, forceActive) {
    if ((forceActive || isGameOnlineActive()) && gameActiveStartedAt) {
      gameAccumulatedMs += Math.max(0, Date.now() - gameActiveStartedAt);
      gameActiveStartedAt = Date.now();
      applyTimedGameRewards(gameAccumulatedMs || 0);
    } else if (gameStarted && !gamePaused) {
      gameActiveStartedAt = isGameSurfaceVisible() ? Date.now() : 0;
    }
    if (updateStored && currentGame && gameStarted) {
      flushProgressSave(currentGame);
      const p = progress();
      if (p[currentGame]) {
        p[currentGame].durationMs = Math.max(Number(p[currentGame].durationMs || 0), gameAccumulatedMs || 0);
        p[currentGame].petRewardNextMs = gamePetRewardNextMs;
        saveJSON(STORAGE_PROGRESS, p);
      }
    }
  }
  function saveProgress(game, state, options) {
    progressSaveCache[game] = buildProgressEntry(game, state);
    if (options && options.immediate) {
      flushProgressSave(game);
      return;
    }
    if (!progressSaveTimers[game]) {
      progressSaveTimers[game] = setTimeout(() => flushProgressSave(game), PROGRESS_SAVE_DELAY);
    }
  }
  function clearProgress(game) {
    if (progressSaveTimers[game]) {
      clearTimeout(progressSaveTimers[game]);
      delete progressSaveTimers[game];
    }
    delete progressSaveCache[game];
    if (game === 'sudoku') clearSudokuStateSnapshot();
    const p = progress();
    delete p[game];
    saveJSON(STORAGE_PROGRESS, p);
  }
  function wordGuessBank(roleName) {
    const raw = loadJSON(STORAGE_WORD_GUESS_BANK, []);
    if (Array.isArray(raw)) return raw;
    const role = normalizePresetName(roleName || companionName());
    const arr = raw && raw[role];
    return Array.isArray(arr) ? arr : [];
  }
  function saveWordGuessBank(arr, roleName) {
    const raw = loadJSON(STORAGE_WORD_GUESS_BANK, {});
    const store = Array.isArray(raw) ? {} : (raw || {});
    store[normalizePresetName(roleName || companionName())] = Array.isArray(arr) ? arr : [];
    saveJSON(STORAGE_WORD_GUESS_BANK, store);
  }
  function wordGuessBankSource() {
    if (standalone) return 'default';
    const v = localStorage.getItem(STORAGE_WORD_GUESS_BANK_SOURCE);
    return v === 'default' ? 'default' : 'role';
  }
  function saveWordGuessBankSource(v) {
    localStorage.setItem(STORAGE_WORD_GUESS_BANK_SOURCE, v === 'default' ? 'default' : 'role');
  }
  function wordGuessBankFilter() {
    return localStorage.getItem(STORAGE_WORD_GUESS_BANK_FILTER) || '';
  }
  function saveWordGuessBankFilter(v) {
    localStorage.setItem(STORAGE_WORD_GUESS_BANK_FILTER, String(v || '').trim());
  }
  function selectedWordGuessRoleName() {
    const select = qs('#wb-line-preset-select');
    if (select && select.value && select.value.indexOf('world::') === 0) {
      const pr = worldPresets()[parseInt(select.value.slice(7), 10)];
      if (pr && pr.name) return normalizePresetName(pr.name);
    }
    if (select && select.value) return normalizePresetName(select.value.replace(/^line::/, ''));
    return normalizePresetName(currentLinePreset('wordguess') || companionName());
  }
  async function defaultWordGuessBank() {
    if (defaultWordGuessBankCache) return defaultWordGuessBankCache.slice();
    try {
      const res = await fetch(WORD_GUESS_DEFAULT_BANK_URL, { cache:'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = parseGeneratedJson(await res.text());
      const arr = (Array.isArray(data) ? data : (Array.isArray(data?.word_bank) ? data.word_bank : []))
        .map(normalizeWordGuessRoundData).filter(Boolean);
      if (arr.length) {
        defaultWordGuessBankCache = arr;
        return arr.slice();
      }
    } catch(e) {
      console.warn('[玩伴小屋] default wordguess bank txt load failed:', e);
    }
    defaultWordGuessBankCache = [
      { word:'漏刻', type:'旧时代计时器具', length:2, clues:['它和时间有关，但不依赖钟表。','它把流逝变成一种能被看见的秩序。','它常借助水的变化来标记时辰。','如果角色总是冷静地等你，它会像一种不催促的陪伴。','古代用滴水来计时的器具就是它。'] },
      { word:'榫卯', type:'传统建筑结构', length:2, clues:['它和连接有关，却不靠显眼的外物。','它讲究咬合、分寸和彼此成全。','木构之间不用钉子也能牢牢相扣。','如果你和角色的关系是嘴上不说却彼此卡准位置，它很合适。','中国传统木作中凸凹相接的结构就是它。'] },
      { word:'潮汐', type:'自然现象', length:2, clues:['它和来去有关，也和某种遥远牵引有关。','它看似重复，却每次都有细微差别。','它受月亮和引力影响，让海水涨落。','如果角色总被你一句话牵动情绪，这种规律会很像。','海水周期性上涨和退落的现象就是它。'] }
    ].map(normalizeWordGuessRoundData).filter(Boolean);
    return defaultWordGuessBankCache.slice();
  }
  function filterWordGuessBank(bank, filterText) {
    const arr = Array.isArray(bank) ? bank.filter(Boolean) : [];
    const text = String(filterText || '').trim();
    if (!text) return arr;
    const range = text.match(/^\s*(\d+)\s*(?:-|~|到|至|,|，)\s*(\d+)\s*$/);
    if (range) {
      const a = Math.max(1, parseInt(range[1], 10));
      const b = Math.max(1, parseInt(range[2], 10));
      return arr.slice(Math.min(a, b) - 1, Math.max(a, b));
    }
    const first = text.match(/^前\s*(\d+)\s*(?:条|题)?$/);
    if (first) return arr.slice(0, Math.max(1, parseInt(first[1], 10)));
    const keys = text.split(/[\s,，、;；|]+/).map(x => x.trim()).filter(Boolean);
    if (!keys.length) return arr;
    const matched = arr.filter(item => {
      const hay = [item.word, item.type].concat(item.clues || []).join(' ');
      return keys.some(k => hay.indexOf(k) >= 0);
    });
    return matched.length ? matched : arr;
  }
  function selectWordGuessRounds(bank, count, filterText) {
    return shuffleArray(filterWordGuessBank(bank, filterText).slice()).slice(0, Math.max(1, count || 5));
  }
  function hasPlayableProgress(game, state) {
    if (!state) return false;
    if (game === 'sudoku') return isValidSudokuProgressState(state);
    if (game === 'linklink') return !!(state.board && state.board.length && state.timeLeft > 0);
    if (game === 'wordguess') return !!(state.completed || state.clueIndex || state.revealed || (state.guesses && state.guesses.length));
    if (game === 'guessnumber') return !!(state.tries || (state.history && state.history.length));
    if (game === 'oldmaid') return !!(state.pending || state.phase !== 'user_pick' || state.turn !== 'user' || (state.log && state.log.length));
    if (game === 'ludo') return !!(state.rolled || state.dice || String(state.turn || 'red') !== 'red' || (state.red || []).some(x => x !== -1) || (state.blue || []).some(x => x !== -1));
    if (game === 'draughts') return !!((state.details && state.details.rounds) || String(state.turn || 'red') !== 'red');
    if (game === 'tictactoe' || game === 'gomoku') return Array.isArray(state.b) && state.b.some(Boolean);
    if (game === 'territory') return !!(state.userScore || state.taScore || String(state.turn || 'user') !== 'user' || (state.h || []).some(row => row.some(Boolean)) || (state.v || []).some(row => row.some(Boolean)));
    if (game === 'watermelon') return !!(state.score || (state.balls && state.balls.length));
    if (game === 'memory') return !!(state.moves || (state.done && state.done.length) || (state.open && state.open.length));
    if (game === 'uyangle') return !!(state.tiles && state.tiles.some(t => !t.gone)) || !!(state.tray && state.tray.length) || !!(state.hold && state.hold.length);
    if (game === 'screw') return !!(state.panels && state.panels.some(p => !p.gone)) || !!(state.tray && state.tray.length);
    if (game === 'popstar') return !!state.score || Number(state.level || 1) > 1 || !!(state.board && state.board.some(row => row && row.some(Boolean)));
    if (game === 'paopao') return !!state.score || !!state.shots || !!(state.bubbles && state.bubbles.length); 
    if (game === 'pinball') return validCadetProgress(state);
    if (game === 'match3') return validMatch3Progress(state);
    if (game === 'freecell') return !!(state.columns && state.columns.length === 8);
    if (game === 'zuma') return !!state.score || !!(state.details && (state.details.shots || state.details.totalBallsGenerated)) || !!(state.chain && state.chain.length);
    if (game === 'watersort') return !!state.score || Number(state.level || 1) > 1 || !!state.moves || !!(state.bottles && state.bottles.length);
    if (game === 'game1010') return !!state.score || !!(state.grid && state.grid.some(row => row && row.some(Boolean))) || !!(state.pieces && state.pieces.some(p => p && !p.used));
    if (game === 'turkey') return !!state.score || !!state.moves || !!(state.blocks && state.blocks.length);
    if (game === 'blackjack') return !!(state.level && (state.round || state.total || state.userScore || state.charScore || (state.user && state.user.length) || (state.char && state.char.length)));
    if (game === 'minesweeper') return !!state.started || !!(state.cells && state.cells.some(c => c && (c.open || c.mark)));
    if (game === 'shuerte') return !!state.started || Number(state.next || 1) > 1;
    if (game === 'snake') return !!state.score;
    if (game === 'game2048') return !!state.score || (Array.isArray(state.board) && state.board.filter(Boolean).length > 2);
    if (game === 'jump') return !!state.score;
    if (game === 'tetris') return !!state.score || (Array.isArray(state.board) && state.board.some(row => row.some(Boolean)));
    return true;
  }
  function records() { const all = safeObject(loadJSON(STORAGE_RECORDS, {})); let changed = false; Object.keys(all || {}).forEach(game => { if (!Array.isArray(all[game])) { all[game] = []; changed = true; return; } (all[game] || []).forEach((r, i) => { if (!r.id) { r.id = 'rec_legacy_' + game + '_' + (r.savedAt || Date.now()) + '_' + i; changed = true; } if (r.log == null) { r.log = ''; changed = true; } }); }); if (changed) saveJSON(STORAGE_RECORDS, all); return all || {}; }
  function saveRecords(v) { saveJSON(STORAGE_RECORDS, v); }
  function companionName() { if (standalone) return '电脑'; const cfg = settings(); const ctx = getHostContext(); const char = ctx && ctx.characters && ctx.characterId >= 0 ? ctx.characters[ctx.characterId] : (ctx && ctx.character ? ctx.character : null); const charData = char?.data || char || {}; return (cfg.charName && cfg.charName !== '{{char}}') ? cfg.charName : (charData.name || ctx?.name2 || '{{char}}'); }
  function displayCharNameForGame(game) { return standalone ? '电脑' : settings().companion ? activeGameRoleName(game) : 'TA'; }
  function displayCharName() { return displayCharNameForGame(currentGame); }
  function displayCharTextForGame(text, game) {
    const name = displayCharNameForGame(game);
    let out = String(text || '').replace(/{{char}}/g, name);
    if (standalone) out = out.replace(/TA/g, '电脑');
    [companionName(), activeGameRoleName(game)].filter(Boolean).forEach(n => { out = out.replace(new RegExp(String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), name); });
    return out;
  }
  function displayCharText(text) { return displayCharTextForGame(text, currentGame); }
  function preventLongPressSelection(el) {
    if (!el) return;
    const stop = e => e.preventDefault();
    ['selectstart','contextmenu','dragstart'].forEach(type => el.addEventListener(type, stop));
    el.onselectstart = () => false;
    el.oncontextmenu = () => false;
    el.ondragstart = () => false;
  }
  function roleGameStats(game, roleName) {
    const who = roleName || companionName();
    const arr = (records()[game] || []).filter(r => (r.companion || '') === who);
    const wins = arr.filter(r => resultOutcome(r.result) === 'user_win').length;
    const total = arr.filter(r => ['user_win','ta_win','draw'].includes(resultOutcome(r.result))).length;
    return { wins, total, records: arr };
  }
  function guessNumberBestTries(roleName) {
    const stats = roleGameStats('guessnumber', roleName);
    const vals = stats.records.filter(r => resultOutcome(r.result) === 'user_win').map(guessNumberTries).map(x => parseInt(x, 10)).filter(Boolean);
    return vals.length ? Math.min(...vals) : 0;
  }
  function sudokuScore(durationMs, hints) {
    const seconds = Math.max(0, Math.round((durationMs || 0) / 1000));
    return Math.max(0, 3000 - seconds * 3 - Math.max(0, hints || 0) * 250);
  }
  function shuerteFinalScore(durationMs, size, baseScore, correct, wrong, maxCombo, toolsUsed) {
    const total = Math.max(1, size * size);
    const seconds = Math.max(1, Math.round((durationMs || 0) / 1000));
    const clearRate = Math.max(0, Math.min(1, (correct || 0) / total));
    const base = Math.round((baseScore || 20) * (correct || 0));
    const comboBonus = Math.floor((maxCombo || 0) / 5) * (size * 18);
    const ideal = Math.max(10, total * (size === 4 ? 1.25 : size === 5 ? 1.45 : 1.7));
    const speedBonus = clearRate >= 1 ? Math.max(0, Math.round((ideal * 3 - seconds) * size * 3)) : 0;
    const penalty = (wrong || 0) * (size === 4 ? 15 : size === 5 ? 25 : 40) + (toolsUsed || 0) * 30;
    return Math.max(0, base + comboBonus + speedBonus - penalty);
  }
  function minesweeperScore(durationMs, won, correctFlags, openedSafe) {
    const seconds = Math.max(0, Math.round((durationMs || 0) / 1000));
    if (won) return Math.max(1200, 6500 - seconds * 8);
    return Math.max(0, Math.min(1200, (correctFlags || 0) * 18 + Math.floor((openedSafe || 0) * 1.5)));
  }
  function sudokuBestScore() {
    const stored = Number(scores().sudoku || 0);
    const vals = (records().sudoku || []).map(r => {
      if (r?.result && typeof r.result === 'object' && r.result.outcome === 'score') return Number(r.result.score || 0);
      return sudokuScore(Number(r?.durationMs || 0), extractNumber(r?.scoreText || '', /求助\s*(\d+)\s*次/, 0));
    }).filter(n => n > 0);
    return Math.max(stored, vals.length ? Math.max(...vals) : 0);
  }
  function memoryBestMoves() {
    const sc = scores();
    const direct = parseInt(sc.memoryBestMoves, 10);
    if (direct > 0) return direct;
    const score = Number(sc.memory || 0);
    const derived = score ? Math.round((1840 - score) / 25) : 0;
    return derived >= 8 && derived <= 200 ? derived : 0;
  }
  function saveMemoryBestMoves(moves) {
    const n = parseInt(moves, 10);
    if (!n) return;
    const sc = scores();
    const old = parseInt(sc.memoryBestMoves, 10);
    if (!old || n < old) { sc.memoryBestMoves = n; saveJSON(STORAGE_SCORES, sc); }
  }
  function wordGuessBestCompanion() {
    const groups = new Map();
    (records().wordguess || []).forEach(r => {
      const name = String(r.companion || '').trim();
      if (!name || name === 'TA') return;
      const hits = parseInt(wordGuessHits(r), 10) || 0;
      const cur = groups.get(name) || { name, best: 0, total: 0, wins: 0, games: 0, last: 0 };
      cur.best = Math.max(cur.best, hits);
      cur.total += hits;
      cur.wins += resultOutcome(r.result) === 'user_win' ? 1 : 0;
      cur.games++;
      cur.last = Math.max(cur.last, Number(r.savedAt || 0));
      groups.set(name, cur);
    });
    const sorted = Array.from(groups.values()).sort((a,b) => b.best - a.best || b.wins - a.wins || b.total - a.total || b.last - a.last);
    return sorted[0]?.name || '';
  }
  function scoreDisplay(game) { const g = GAME_META[game] || {}; const sc = scores()[game]; if (game === 'sudoku') return '最高：' + sudokuBestScore() + '分'; if (g.mode === 'double') { const st = roleGameStats(game); return '胜率：' + st.wins + '/' + st.total; } return '最高：' + ((sc || 0) + (g.unit || '分')); }
  function cardScoreDisplay(game) { const g = GAME_META[game] || {}; const sc = scores()[game]; if (game === 'memory') { const best = memoryBestMoves(); return '最短次数：' + (best ? best + '次' : '无'); } if (game === 'wordguess') { const name = wordGuessBestCompanion(); return '最默契：' + (name || '无'); } if (game === 'guessnumber') { const best = guessNumberBestTries(); return '最小次数：' + (best ? best + '次' : '无'); } if (game === 'sudoku') return '当前最高分：' + sudokuBestScore() + '分'; if (g.mode === 'double') { const st = roleGameStats(game); return '胜率：' + st.wins + '/' + st.total; } return '当前最高分：' + ((sc || 0) + (g.unit || '分')); }
  function gameIconHTML(g) {
    if (standalone) { const artwork = gameArtworkIconHTML(g.id); if (artwork) return artwork; }
    const fallback = '<span>' + esc(g.icon || '') + '</span>';
    if (!g.iconImage) return '<div class="wb-game-icon">' + fallback + '</div>';
    return '<div class="wb-game-icon has-image"><img src="' + esc(g.iconImage) + '" alt="" loading="lazy" decoding="async" onerror="this.style.display=&#39;none&#39;;this.nextElementSibling.style.display=&#39;grid&#39;;this.parentNode.classList.remove(&#39;has-image&#39;);">' + fallback + '</div>';
  }
  function inferResult(game, title, scoreText) { const t = String((title || '') + ' ' + (scoreText || '')); const g = GAME_META[game] || {}; if (g.mode === 'double') { if (/你赢|1胜/.test(t) && !/平局/.test(t)) return 'user_win'; if (/TA获胜|失败|0胜/.test(t) && !/平局/.test(t)) return 'ta_win'; if (/平局/.test(t)) return 'draw'; return 'finished'; } const m = t.match(/(\d+)\s*分/); return { outcome: 'score', score: m ? parseInt(m[1], 10) : 0 }; }
  function recordGameResult(game, title, scoreText, explicitResult, meta) {
    commitGameActiveDuration(false);
    const all = records(); const g = GAME_META[game] || { name: game, mode: 'single' }; const result = explicitResult || inferResult(game, title, scoreText);
    const item = { id:'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), playedAt: new Date().toLocaleString(), savedAt: Date.now(), durationMs: currentGameDurationMs(), game: g.name, result, scoreText: displayCharTextForGame(scoreText || '', game), companion: displayCharNameForGame(game), details: meta && meta.details ? meta.details : null, log: '' };
    item.gameId = game; item._content = roundContent || contentForGame(game);
    if (game === 'match3' && meta) item.details = Object.assign({}, item.details || {}, ...['level','mode','stars','coins'].filter(key => meta[key] !== undefined).map(key => ({[key]:meta[key]})));
    if (!all[game]) all[game] = []; all[game].unshift(item); all[game] = all[game].slice(0, 100); saveRecords(all); petApplyGameReward(g, result, item.durationMs, currentRoundRecord); return item;
  }
  function formatDuration(ms) { const sec = Math.max(0, Math.round((ms || 0) / 1000)); const m = Math.floor(sec / 60), s = sec % 60; return (m ? m + '分' : '') + s + '秒'; }
  function formatRecordTime(r) {
    const d = new Date(Number(r?.savedAt || 0) || r?.playedAt || Date.now());
    if (Number.isNaN(d.getTime())) return String(r?.playedAt || '').replace(/^20(\d{2})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}:\d{2}).*$/, '$1/$2/$3 $4');
    return String(d.getFullYear()).slice(-2) + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function formatRecordResult(r) { if (!r) return '已完成'; if (typeof r === 'string') return ({ user_win:'你赢', ta_win: displayCharName() + '赢', draw:'平局', finished:'已完成' }[r] || r); if (typeof r === 'object' && r.outcome === 'score') return '得分：' + (r.score || 0); return displayCharText(r); }
  function formatRecordResultForPrompt(r) { return resultOutcome(r) === 'ta_win' ? '{{char}}赢' : formatRecordResult(r).replace(/TA/g, '{{char}}'); }
  function recordScoreDisplay(r) {
    const score = String(r?.scoreText || '').trim();
    if (!score) return '';
    if (r?.result && typeof r.result === 'object' && r.result.outcome === 'score') return '';
    const result = formatRecordResult(r?.result).replace(/\s+/g, '');
    const normalizedScore = score.replace(/\s+/g, '').replace(/^本局[：:]/, '').replace(/^本局分数[：:]/, '得分：');
    return result && normalizedScore === result ? '' : score;
  }
  function singleRecordPoints(r) {
    if (r?.result && typeof r.result === 'object' && r.result.outcome === 'score') return (r.result.score || 0) + '分';
    const m = String(r?.scoreText || '').match(/(\d+)\s*分/);
    return (m ? parseInt(m[1], 10) : 0) + '分';
  }
  function sudokuRecordPoints(r) {
    const resultScore = r?.result && typeof r.result === 'object' && r.result.outcome === 'score' ? Number(r.result.score || 0) : 0;
    if (resultScore) return resultScore + '分';
    const hints = extractNumber(r?.scoreText || '', /求助\s*(\d+)\s*次/, 0);
    return sudokuScore(Number(r?.durationMs || 0), hints) + '分';
  }
  function userOutcomeText(result) {
    const out = resultOutcome(result);
    if (out === 'user_win') return '胜';
    if (out === 'ta_win') return '负';
    if (out === 'draw') return '平';
    return '已完成';
  }
  function extractNumber(text, re, fallback) {
    const m = String(text || '').match(re);
    return m ? parseInt(m[1], 10) : fallback;
  }
  function territoryUserCells(r) {
    const txt = String(r?.scoreText || '');
    return extractNumber(txt, /你\s*(\d+)\s*格/, 0) + '格';
  }
  function guessNumberTries(r) {
    return String(extractNumber(r?.scoreText || '', /(?:用了|猜数次数[：:])\s*(\d+)\s*次/, 0));
  }
  function wordGuessHits(r) {
    return extractNumber(r?.scoreText || '', /你猜中\s*(\d+)\s*题/, 0) + '题';
  }
  function minesweeperOutcomeText(r) { return r && r.details && r.details.won ? '胜' : '负'; }
  function isRoundCountGame(game) { return ['tictactoe','gomoku','territory','ludo','reversi','bombnumber','connect4d','draughts','westernchess','chinesechess'].includes(game); }
  function isCheatGame(game) { return ['tictactoe','gomoku','territory','oldmaid','ludo','reversi','bombnumber','connect4d','draughts','westernchess','chinesechess'].includes(game); }
  function recordRoundCount(r) { return String(extractNumber(r?.scoreText || '', /回合数[：:]\s*(\d+)/, 0)); }
	  function recordCompanionDisplay(r) { return r && r.companion ? r.companion : (settings().companion ? companionName() : 'TA'); }
  function recordTableHeaders(game) {
    if (game === 'territory') return ['时间','用时','胜负','回合数','格子数','陪伴者','日志','操作'];
    if (game === 'reversi') return ['时间','用时','胜负','回合数','格子数','陪伴者','日志','操作'];
    if (game === 'guessnumber') return ['时间','用时','胜负','猜几次','陪伴者','日志','操作'];
    if (game === 'sudoku') return ['时间','用时','分数','求助次数','陪伴者','日志','操作'];
    if (game === 'minesweeper') return ['时间','用时','胜负','分数','排对雷','陪伴者','日志','操作'];
    if (game === 'shuerte') return ['时间','用时','分数','尺寸','错误','最高连击','陪伴者','日志','操作'];
    if (game === 'uyangle') return ['时间','用时','分数','打乱次数','移出次数','陪伴者','日志','操作'];
    if (game === 'popstar') return ['时间','用时','分数','模式','关卡','剩余','陪伴者','日志','操作'];
    if (game === 'paopao') return ['时间','用时','分数','发射','下压','陪伴者','日志','操作'];
    if (game === 'zuma') return ['时间','用时','分数','消除','最高连锁','陪伴者','日志','操作'];
    if (game === 'watersort') return ['时间','用时','总分','关卡','总步数','陪伴者','日志','操作'];
    if (game === 'game1010') return ['时间','用时','分数','消除','放置','陪伴者','日志','操作'];
    if (game === 'turkey') return ['时间','用时','分数','消除','移动','陪伴者','日志','操作'];
    if (game === 'spider') return ['时间','用时','分数','完成','发牌','陪伴者','日志','操作'];
    if (game === 'linklink') return ['时间','用时','总分','关卡','最高连击','陪伴者','日志','操作'];
    if (game === 'blackjack') return ['时间','用时','胜负','总分','关卡','最高连胜','陪伴者','日志','操作'];
    if (game === 'wordguess') return ['时间','用时','猜中题数','陪伴者','日志','操作'];
    if (isRoundCountGame(game)) return ['时间','用时','胜负','回合数','陪伴者','日志','操作'];
    if ((GAME_META[game] || {}).mode === 'double') return ['时间','用时','胜负','陪伴者','日志','操作'];
    return ['时间','用时','结果','陪伴者','日志','操作'];
  }
  function recordDisplayCells(game, r) {
    const base = [formatRecordTime(r), formatDuration(r.durationMs)];
    if (game === 'territory') return base.concat([userOutcomeText(r.result), recordRoundCount(r), territoryUserCells(r), recordCompanionDisplay(r)]);
    if (game === 'reversi') return base.concat([userOutcomeText(r.result), recordRoundCount(r), territoryUserCells(r), recordCompanionDisplay(r)]);
    if (game === 'guessnumber') return base.concat([userOutcomeText(r.result), guessNumberTries(r), recordCompanionDisplay(r)]);
    if (game === 'sudoku') return base.concat([sudokuRecordPoints(r), String(extractNumber(r?.scoreText || '', /求助\s*(\d+)\s*次/, 0)), recordCompanionDisplay(r)]);
    if (game === 'minesweeper') return base.concat([minesweeperOutcomeText(r), singleRecordPoints(r), String(extractNumber(r?.scoreText || '', /排对\s*(\d+)\s*个雷/, 0)), recordCompanionDisplay(r)]);
    if (game === 'shuerte') return base.concat([singleRecordPoints(r), String(r?.details?.size || extractNumber(r?.scoreText || '', /(\d+)×\d+/, 0)), String(r?.details?.wrong || extractNumber(r?.scoreText || '', /错误\s*(\d+)\s*次/, 0)), String(r?.details?.maxCombo || 0), recordCompanionDisplay(r)]);
    if (game === 'uyangle') return base.concat([singleRecordPoints(r), String(extractNumber(r?.scoreText || '', /打乱\s*(\d+)\s*次/, 0)), String(extractNumber(r?.scoreText || '', /移出\s*(\d+)\s*次/, 0)), recordCompanionDisplay(r)]);
    if (game === 'popstar') return base.concat([singleRecordPoints(r), String((r?.choice || r?.difficulty || r?.details?.mode) === 'hard' ? '困难模式' : '简单模式'), String(r?.details?.level || extractNumber(r?.scoreText || '', /第\s*(\d+)\s*关/, 1)), String(r?.details?.remainingAtEnd ?? extractNumber(r?.scoreText || '', /剩余\s*(\d+)\s*个/, 0)), recordCompanionDisplay(r)]);
    if (game === 'paopao') return base.concat([singleRecordPoints(r), String(r?.details?.shots || extractNumber(r?.scoreText || '', /发射\s*(\d+)\s*次/, 0)), String(r?.details?.pushes || extractNumber(r?.scoreText || '', /下压\s*(\d+)\s*行/, 0)), recordCompanionDisplay(r)]);
    if (game === 'zuma') return base.concat([singleRecordPoints(r), String(r?.details?.cleared || extractNumber(r?.scoreText || '', /消除\s*(\d+)\s*颗/, 0)), String(r?.details?.maxCombo || 0), recordCompanionDisplay(r)]);
    if (game === 'watersort') return base.concat([singleRecordPoints(r), String(r?.details?.level || extractNumber(r?.scoreText || '', /(\d+)\s*关/, 1)), String(r?.details?.totalMoves || 0), recordCompanionDisplay(r)]);
    if (game === 'game1010') return base.concat([singleRecordPoints(r), String(r?.details?.clearedLines || extractNumber(r?.scoreText || '', /消除\s*(\d+)\s*行列/, 0)), String(r?.details?.placements || extractNumber(r?.scoreText || '', /放置\s*(\d+)\s*块/, 0)), recordCompanionDisplay(r)]);
    if (game === 'turkey') return base.concat([singleRecordPoints(r), String(r?.details?.clearedLines || 0), String(r?.details?.moves || 0), recordCompanionDisplay(r)]);
    if (game === 'spider') return base.concat([singleRecordPoints(r), String(r?.details?.completed ?? extractNumber(r?.scoreText || '', /完成\s*(\d+)\s*副/, 0)), String(r?.details?.deals || 0), recordCompanionDisplay(r)]);
    if (game === 'linklink') return base.concat([singleRecordPoints(r), String(r?.details?.level || extractNumber(r?.scoreText || '', /第\s*(\d+)\s*关/, 1)), String(r?.details?.maxCombo || 0), recordCompanionDisplay(r)]);
    if (game === 'blackjack') return base.concat([userOutcomeText(r.result), singleRecordPoints(r), String(r?.details?.level || extractNumber(r?.scoreText || '', /第\s*(\d+)\s*关/, 1)), String(r?.details?.maxStreak || 0), recordCompanionDisplay(r)]);
    if (game === 'wordguess') return base.concat([wordGuessHits(r), recordCompanionDisplay(r)]);
    if (isRoundCountGame(game)) return base.concat([userOutcomeText(r.result), recordRoundCount(r), recordCompanionDisplay(r)]);
    if ((GAME_META[game] || {}).mode === 'double') return base.concat([userOutcomeText(r.result), recordCompanionDisplay(r)]);
    return base.concat([singleRecordPoints(r), recordCompanionDisplay(r)]);
  }
  function gameLogSituation(game, rec) {
    const cells = recordDisplayCells(game, rec);
    const headers = recordTableHeaders(game).filter(h => h !== '日志' && h !== '操作');
    return headers.map((h, i) => h + '：' + (cells[i] || '')).join('，');
  }
  function gameLogFieldRules(game, roleName) {
    const role = roleName || displayCharNameForGame(game);
    if (game === 'territory' || game === 'reversi') return '字段说明：胜负是user的胜负；回合数表示本局双方行动总数；格子数只表示user占领的格子数，不包含' + role + '的格子。';
    if (game === 'draughts') return '字段说明：胜负是user的胜负；回合数表示本局双方行动总数；耍赖反悔次数表示user本局点击“耍赖”撤销操作的次数。';
    if (game === 'westernchess') return '字段说明：胜负是user的胜负；回合数表示双方完整行动总数；吃子数表示user本局吃掉的棋子数量；耍赖反悔次数表示user点击“耍赖”撤销操作的次数。';
    if (game === 'chinesechess') return '字段说明：胜负是user的胜负；回合数表示双方完整行动总数；吃子数表示user本局吃掉的棋子数量；反悔次数表示user点击“反悔”撤销操作的次数。';
    if (isRoundCountGame(game)) return '字段说明：胜负是user的胜负；回合数表示本局双方行动总数。';
    if (game === 'guessnumber') return '字段说明：胜负是user的胜负；猜几次只表示user猜了几次。';
    if (game === 'sudoku') return '字段说明：分数由用时和求助次数共同计算，用时越短、求助越少，分数越高；求助次数只表示user本局点击提示/修改的次数。';
    if (game === 'minesweeper') return '字段说明：胜负是user的扫雷结果；排对雷表示插旗位置确实是雷的数量；成功时用时越短分数越高，失败时按已排对雷和已翻开安全格给少量分。';
    if (game === 'shuerte') return '字段说明：舒尔特方格是按顺序寻找数字的专注力游戏；尺寸表示本局选择的4×4、5×5或6×6关卡；错误是点到非目标数字次数；最高连击表示连续正确点击的最大次数。';
    if (game === 'uyangle') return '字段说明：U了个U是三消叠牌小游戏；分数由用时和打乱次数共同计算，用时越短、打乱越少，分数越高。';
    if (game === 'screw') return '字段说明：拧螺丝是颜色盒子收集和玻璃层级解谜；普通模式分数由用时、候补槽压力和增加盒子次数共同计算；无尽模式失败时按当前盒子数量结算倍率，盒子越少倍率越高。';
    if (game === 'popstar') return '字段说明：消灭星星是10×10连通消除游戏；一次消除n个星星得分n×n×5，并对8个以上大块追加奖励；困难模式每关有步数限制，消除和使用道具都会消耗步数；简单模式没有步数限制，可以一直消到没有可消除组合；结算时累计分数达到关卡目标进入下一关。';
    if (game === 'paopao') return '字段说明：泡泡龙是交错网格射击生存游戏；发射表示本局射出的泡泡数量；下压表示顶部新增行并整体下移的次数，下压间隔会从10发逐步缩短到5发。';
    if (game === 'zuma') return '字段说明：祖玛神庙冒险包含关卡、生命、三连消除、同色吸回连锁、连续命中、穿隙奖励与四种标记珠能力。消除为累计清除彩珠，最高连锁为连续命中纪录。';
    if (game === 'watersort') return '字段说明：倒瓶子是无限关卡颜色水层排序解谜；关卡表示主动结算时所在关卡；总步数是全部已完成关卡和当前关累计的有效倒水次数。颜色最多10种，第9关起只有1个初始空瓶，题面始终保留经过验证的解序列。';
    if (game === 'game1010') return '字段说明：1010!是10×10方块拼图；放置表示成功落下的候补方块数量，消除表示累计清掉的行/列数量。';
    if (game === 'turkey') return '字段说明：土耳其方块是8×10横向滑块无尽消除游戏；消除表示累计清掉的完整横行数量；移动表示普通有效拖动次数。';
    if (game === 'spider') return '字段说明：无尽蜘蛛纸牌是十列整理游戏；完成表示收起的同花色K到A完整牌组数量；发牌表示主动或自动向十列新增一排牌的次数。';
    if (game === 'wordguess') return '字段说明：猜中题数只表示user猜中的题数。';
    if ((GAME_META[game] || {}).mode === 'double') return '字段说明：胜负是user的胜负，胜表示user赢，负表示' + role + '赢。';
    return '字段说明：结果是user本局获得的分数。';
  }
  function countMapText(obj, label) {
    const keys = Object.keys(obj || {}).filter(k => Number(obj[k]) || obj[k] === 0).sort((a,b) => Number(a) - Number(b));
    return keys.length ? keys.map(k => label + k + '：' + (obj[k] || 0) + '次').join('，') : '无';
  }
  function finalCountText(obj, label) {
    const keys = Object.keys(obj || {}).filter(k => Number(obj[k]) || obj[k] === 0).sort((a,b) => Number(a) - Number(b));
    return keys.length ? keys.map(k => label + k + '：' + (obj[k] || 0) + '个').join('，') : '无';
  }
  function gameLogDetailText(game, rec) {
    const d = rec && rec.details;
    if (!d) return '无额外细节数据。';
    const cheatText = isCheatGame(game) ? '耍赖反悔次数：' + (d.cheatUsed || 0) + '次。\n' : '';
    if (game === 'tetris') return [
      '消除次数说明：line1/line2/line3/line4分别表示一次性消除1/2/3/4行的次数。',
      'line1：' + (d.lineClears?.['1'] || 0) + '次，line2：' + (d.lineClears?.['2'] || 0) + '次，line3：' + (d.lineClears?.['3'] || 0) + '次，line4：' + (d.lineClears?.['4'] || 0) + '次。',
      '救场次数：' + (d.rescues || 0) + '次；救场表示堆叠高度曾达到棋盘2/3以上，之后降到1/3以下。'
    ].join('\n');
    if (game === 'snake') return [
      '果子数：' + (d.fruits || 0) + '个。',
      '最大转弯次数：' + (d.maxTurnsBetweenFruits || 0) + '次；表示从吃到一个果子到吃下一个果子之间最多转向次数。',
      '擦着果子过的数量：' + (d.nearFoodPasses || 0) + '次；表示蛇头在距离果子2格以内经过但没有吃到。',
      '死亡原因：' + (d.deathReason || '未知') + '。'
    ].join('\n');
    if (game === 'game2048') return [
      '合成次数：' + countMapText(d.mergeCounts, '数字'),
      '危机解除次数：' + (d.crisisResolves || 0) + '次；表示棋盘曾经占满或接近占满，之后又空出明显空间。',
      '结算棋盘数字个数：' + finalCountText(d.finalCounts, '数字')
    ].join('\n');
    if (game === 'watermelon') return [
      '水果编号说明：0到8从小水果到最终大西瓜，编号越大水果越大。',
      '合成次数：' + countMapText(d.mergeCounts, '水果'),
      '快到警戒线又解决危机次数：' + (d.crisisResolves || 0) + '次。',
      '结算水果个数：' + finalCountText(d.finalCounts, '水果')
    ].join('\n');
    if (game === 'memory') return '翻牌一次就消除的牌数：' + (d.firstTryPairs || 0) + '对；翻牌3次及以上才消除的牌数：' + (d.threePlusTryPairs || 0) + '对；翻牌最多那张牌的次数：' + (d.maxFlipsForOneCard || 0) + '次。';
    if (game === 'uyangle') return '消除次数：' + (d.matches || 0) + '次；打乱次数：' + (d.shuffles || 0) + '次；移出次数：' + (d.moveouts || 0) + '次；是否触发过7格满槽：' + (d.fullTraySurvived ? '是' : '否') + '；是否用完3次移出：' + ((d.moveouts || 0) >= 3 ? '是' : '否') + '；是否连续打乱两次：' + (d.badLuck ? '是' : '否') + '。';
    if (game === 'jump' || game === 'plank') return '完美次数：' + (d.perfects || 0) + '次；差点掉下去次数：' + (d.nearMisses || 0) + '次。';
    if (game === 'sudoku') return '分数：' + sudokuRecordPoints(rec) + '；提示次数：' + (d.hints || 0) + '次；修改次数：' + (d.edits || 0) + '次；修改最多的格子修改次数：' + (d.maxEditsOneCell || 0) + '次；全部完成后错误次数：' + (d.finalErrors || 0) + '格。';
    if (game === 'minesweeper') return '结果：' + (d.won ? '成功' : '失败') + '；插旗数量：' + (d.flags || 0) + '；排对的雷：' + (d.correctFlags || 0) + '个；未插旗扫雷数量：' + (d.unflaggedMines || 0) + '个；踩雷时已开格子：' + (d.openedAtBlast || d.openedSafe || 0) + '格；犹豫次数：' + (d.hesitations || 0) + '次；数字试探成功次数：' + (d.chordSuccesses || 0) + '次；不确定试探成功次数：' + (d.riskyChordSuccesses || 0) + '次。';
    if (game === 'shuerte') return '尺寸：' + (d.size || 0) + '×' + (d.size || 0) + (d.noFade ? '（盲点）' : '') + '；最终分数：' + (d.score || singleRecordPoints(rec)) + '分；用时：' + ((d.durationMs || 0) / 1000).toFixed(2) + '秒；正确点击：' + (d.correct || 0) + '次；错误点击：' + (d.wrong || 0) + '次；最高连击：' + (d.maxCombo || 0) + '；提示/聚焦/重排：' + (d.hintUsed || 0) + '/' + (d.focusUsed || 0) + '/' + (d.shuffleUsed || 0) + '次；平均反应：' + ((d.avgReactionMs || 0) / 1000).toFixed(2) + '秒。';
    if (game === 'screw') return (d.endless ? '模式：无尽模式；收纳盒子：' + (d.matches || Math.floor((d.packed || 0) / 3) || 0) + '个；结算盒子数：' + (d.endlessBoxCount || (3 + (d.addBoxUses || 0))) + '个；基础分：' + (d.endlessBaseScore == null ? '未记录' : d.endlessBaseScore) + '；结算倍率：×' + (d.endlessScoreMultiplier || '未记录') + '；' : '结果：' + (d.completed ? '成功' : '失败') + '；最终进度：' + (d.progress || 0) + '%；打包次数：' + (d.matches || Math.floor((d.packed || 0) / 3) || 0) + '次；') + '候补槽最大占用：' + (d.maxTray || 0) + '格；候补槽填满5个次数：' + (d.trayFullCount || d.trayFourCount || 0) + '次；使用增加盒子次数：' + (d.addBoxUses || 0) + '次；被遮挡螺丝点击次数：' + (d.blocked || 0) + '次；掉落玻璃数量：' + (d.fallen || 0) + '块。';
    if (game === 'popstar') return '模式：' + (d.mode === 'easy' ? '简单模式' : d.mode === 'hard' ? '困难模式' : '未记录') + '；最终关卡：第' + (d.level || 1) + '关；最终分数：' + (d.score || 0) + '分；消除星星总数：' + (d.removedTotal || 0) + '个；高分方块统计：5个' + (d.highClears?.['5'] || 0) + '次，6个' + (d.highClears?.['6'] || 0) + '次，7个' + (d.highClears?.['7'] || 0) + '次，8个及以上' + (d.highClears?.['8plus'] || 0) + '次；大块额外奖励：' + (d.bigBonusTotal || 0) + '分；余步奖励：' + (d.unusedMoveBonusTotal || 0) + '分；命悬一线次数：' + (d.clutchCount || 0) + '次；连消高分次数：' + (d.highComboCount || 0) + '次；连续高分消除最大次数：' + (d.maxHighStreak || 0) + '次；使用打乱：' + (d.shuffleUsed || 0) + '次；使用单消：' + (d.singleUsed || 0) + '次；剩余方块统计：' + finalCountText(d.remainingCounts, '剩余') + '；竟然全部消除：' + (d.clearAllCount || 0) + '次。';
    if (game === 'paopao') return '最终分数：' + (d.score || singleRecordPoints(rec)) + '分；发射：' + (d.shots || 0) + '次；下压：' + (d.pushes || 0) + '行；主动消除：' + (d.cleared || 0) + '个；悬空掉落：' + (d.dropTotal || 0) + '个；接近警戒线：' + (d.dangerCount || 0) + '次；炸弹使用：' + (d.bombUsed || 0) + '次；炸弹低收益：' + (d.bombBad ? '是' : '否') + '；连续高分最大次数：' + (d.maxHighStreak || 0) + '次；竟然全部消除：' + (d.clearAllCount || 0) + '次。';
    if (game === 'zuma') return '最终分数：' + (d.score || singleRecordPoints(rec)) + '分；发射：' + (d.shots || 0) + '次；射失：' + (d.misses || 0) + '次；消除彩珠：' + (d.cleared || 0) + '颗；累计生成彩珠：' + (d.totalBallsGenerated || 0) + '颗；清空珠链：' + (d.clearAllCount || 0) + '次；最高速度：' + (d.maxSpeed || 0) + '；最高连锁：×' + (d.maxCombo || 0) + '；接近洞口：' + (d.dangerCount || 0) + '次；炸弹/减速/彩虹：' + (d.bombUsed || 0) + '/' + (d.slowUsed || 0) + '/' + (d.rainbowUsed || 0) + '次。';
    if (game === 'watersort') return '最终总分：' + (d.score || singleRecordPoints(rec)) + '分；到达关卡：第' + (d.level || 1) + '关；完成关卡：' + (d.levelsCleared || 0) + '关；有效倒水：' + (d.totalMoves || 0) + '步；同色合并：' + (d.sameColorPours || 0) + '次；最高连续高效合并：' + (d.maxEfficientStreak || 0) + '；最高颜色数：' + (d.maxColors || d.colorCount || 0) + '色；单空瓶通关：' + (d.oneEmptyLevels || 0) + '关；无道具完美关：' + (d.perfectLevels || 0) + '关；提示/撤回/加空瓶/重置：' + (d.hintsUsed || 0) + '/' + (d.undosUsed || 0) + '/' + (d.extraUsed || 0) + '/' + (d.resets || 0) + '次。';
    if (game === 'game1010') return '最终分数：' + (d.score || singleRecordPoints(rec)) + '分；放置：' + (d.placements || 0) + '块；累计消除：' + (d.clearedLines || 0) + '行列；最大单次消除：' + (d.maxClear || 0) + '行列；低空格险情：' + (d.lowSpaceCount || 0) + '次；重新生成：' + (d.regenUsed || 0) + '次；小锤子：' + (d.hammerUsed || 0) + '次；本轮用道具后失败：' + (d.toolExhaustLose ? '是' : '否') + '。';
    if (game === 'turkey') return '最终分数：' + (d.score || singleRecordPoints(rec)) + '分；累计消除：' + (d.clearedLines || 0) + '行；有效移动：' + (d.moves || 0) + '次；最大同时消除：' + (d.maxClear || 0) + '行；最大连锁：' + (d.maxChain || 0) + '轮；最大连续回合连击：' + (d.maxCombo || 0) + '；云雷/星尘/粉碎机：' + (d.thunderUsed || 0) + '/' + (d.stardustUsed || 0) + '/' + (d.hammerUsed || 0) + '次；无道具达到3000：' + (d.noTool3000 ? '是' : '否') + '。';
    if (game === 'spider') return '模式：' + (d.mode === 'easy' ? '简单' : '困难') + '；最终分数：' + (d.score || singleRecordPoints(rec)) + '分；完成牌组：' + (d.completed || 0) + '副；黑桃：' + (d.spades || 0) + '副；红桃：' + (d.hearts || 0) + '副；最大连锁：' + (d.maxChain || 0) + '副；发牌次数：' + (d.deals || 0) + '次；有效移动：' + (d.moves || 0) + '次；撤销：' + (d.undo || 0) + '次；消除：' + (d.eliminate || 0) + '次；清空列次数：' + (d.emptyCols || 0) + '次；同屏最多空列：' + (d.maxEmptyCols || 0) + '列；命悬一线次数：' + (d.clutch || 0) + '次；糟糕发牌连续/累计记录：' + (d.badDeals || 0) + '/' + (d.badDealsTotal || 0) + '次；游戏时间灯：' + (rec.durationMs >= 20*60000 ? '长时间游玩' : rec.durationMs >= 10*60000 ? '中等时长' : '短时游玩') + '。';
    if (game === 'linklink') return '最终总分：' + (d.score || singleRecordPoints(rec)) + '分；到达关卡：第' + (d.level || 1) + '关；最高连击：' + (d.maxCombo || 0) + '；连击加时：' + (d.comboTimeBonus || 0) + '秒（' + (d.comboTimeAwards || 0) + '次，规则：每3连击+2秒）；提示/洗牌/冻结/魔法：' + (d.hintUsed || 0) + '/' + (d.shuffleUsed || 0) + '/' + (d.freezeUsed || 0) + '/' + (d.magicUsed || 0) + '次；自动死局洗牌：' + (d.deadShuffles || 0) + '次；最快通关：' + (d.fastClear ? '是' : '否') + '；最后一秒：' + (d.lastSecond ? '是' : '否') + '。';
    if (game === 'blackjack') return '最终总分：' + (d.score || singleRecordPoints(rec)) + '分；到达关卡：第' + (d.level || 1) + '关；胜/负/平：' + (d.wins || 0) + '/' + (d.losses || 0) + '/' + (d.ties || 0) + '；Blackjack：' + (d.blackjacks || 0) + '次；玩家爆牌：' + (d.busts || 0) + '次；Char爆牌：' + (d.charBusts || 0) + '次；最高连胜：' + (d.maxStreak || 0) + '；提示/偷看/反悔/护牌：' + (d.hintUsed || 0) + '/' + (d.peekUsed || 0) + '/' + (d.undoUsed || 0) + '/' + (d.protectUsed || 0) + '次；复活：' + (d.reviveUsed || 0) + '次；先手：user ' + (d.orderUserFirst || 0) + '次 / Char ' + (d.orderCharFirst || 0) + '次。';
    if (game === 'ludo') return cheatText + 'user让' + (rec.companion || '{{char}}') + '回家次数：' + (d.userCaptures || 0) + '次；' + (rec.companion || '{{char}}') + '让user回家次数：' + (d.charCaptures || 0) + '次；user飞行次数：' + (d.userFlights || 0) + '次；' + (rec.companion || '{{char}}') + '飞行次数：' + (d.charFlights || 0) + '次；user连续投中6最大次数：' + (d.userMaxSixStreak || 0) + '次；' + (rec.companion || '{{char}}') + '连续投中6最大次数：' + (d.charMaxSixStreak || 0) + '次；结算时输家停机坪棋子：' + (d.loserHangar || 0) + '个，路上棋子：' + (d.loserOnBoard || 0) + '个。';
    if (game === 'guessnumber') return '每次猜测：\n' + ((d.guesses || []).map((x,i) => (i+1) + '. 猜“' + x.guess + '”：数字对' + x.nums + '个，位置对' + x.pos + '个').join('\n') || '无');
    if (game === 'wordguess') return '每题记录：\n' + ((d.rounds || []).map((r,i) => (i+1) + '. 题目：' + r.word + '；5条提示：' + (r.clues || []).join(' / ') + '；user猜过：' + ((r.guesses || []).join('、') || '无') + '；第几条提示猜中：' + (r.winClueIndex || '未猜中')).join('\n') || '无');
    if (game === 'gomoku' && (d.endless || d.gomokuMode === 'endless')) return cheatText + '模式：无尽模式；回合数：' + (d.rounds || 0) + '；user吃掉' + (rec.companion || '{{char}}') + '棋子：' + (d.userCaptures || 0) + '颗；' + (rec.companion || '{{char}}') + '吃掉user棋子：' + (d.charCaptures || 0) + '颗；user回收五子：' + (d.userRecycles || 0) + '次；' + (rec.companion || '{{char}}') + '回收五子：' + (d.charRecycles || 0) + '次。';
    if (game === 'chinesechess') return cheatText + '回合数：' + (d.rounds || 0) + '；user吃子：' + (d.userCaptures || 0) + '枚；' + (rec.companion || '{{char}}') + '吃子：' + (d.charCaptures || 0) + '枚；user将军：' + (d.userChecks || 0) + '次；' + (rec.companion || '{{char}}') + '将军：' + (d.charChecks || 0) + '次；炮打：' + (d.cannonHits || 0) + '次；兵卒过河：' + (d.riverCross || 0) + '次；将帅照面拦截：' + (d.faceBlocks || 0) + '次；结局原因：' + (d.endReason || '未知') + '。';
    if (game === 'westernchess') return cheatText + '回合数：' + (d.rounds || 0) + '；user吃子：' + (d.userCaptures || 0) + '枚；' + (rec.companion || '{{char}}') + '吃子：' + (d.charCaptures || 0) + '枚；user将军：' + (d.userChecks || 0) + '次；' + (rec.companion || '{{char}}') + '将军：' + (d.charChecks || 0) + '次；王车易位：' + (d.castles || 0) + '次；升变：' + (d.promotions || 0) + '次；结局原因：' + (d.endReason || '未知') + '。';
    if (['tictactoe','gomoku','connect4d'].includes(game)) return cheatText + '模式：' + (game === 'gomoku' ? '普通模式；' : '') + '回合数：' + (d.rounds || 0) + '；user堵对方二连/三连/四连次数：' + [2,3,4].map(n => n + '连' + (d.userBlocks?.[n] || 0) + '次').join('，') + '；' + (rec.companion || '{{char}}') + '堵user二连/三连/四连次数：' + [2,3,4].map(n => n + '连' + (d.charBlocks?.[n] || 0) + '次').join('，') + '。';
    if (game === 'territory') return cheatText + '每回合占领地盘数量：\n' + ((d.turnGains || []).map((x,i) => (i+1) + '. ' + (x.side === 'user' ? 'user' : (rec.companion || '{{char}}')) + '占领' + x.gain + '格').join('\n') || '无');
    if (game === 'oldmaid') return cheatText + '每一轮鬼牌在谁手里：\n' + ((d.jokerOwners || []).map((x,i) => (i+1) + '. ' + x).join('\n') || '无');
    if (game === 'reversi') return cheatText + '每一轮双方棋子数量：\n' + ((d.counts || []).map((x,i) => (i+1) + '. user ' + x.user + ' / ' + (rec.companion || '{{char}}') + ' ' + x.ta).join('\n') || '无');
    if (game === 'bombnumber') return cheatText + '每次选择和范围：\n' + ((d.picks || []).map((x,i) => (i+1) + '. ' + (x.side === 'user' ? 'user' : (rec.companion || '{{char}}')) + '选' + x.n + '，选完范围：' + x.low + '-' + x.high + '，剩余' + x.remaining + '个').join('\n') || '无') + '\n最终是否出现只剩一个格子没得选：' + (d.finalDoomed ? '是' : '否') + '。';
    if (game === 'draughts') return cheatText + '回合数：' + (d.rounds || 0) + '；user进' + (rec.companion || '{{char}}') + '营地棋子：' + (d.userHomeCount || 0) + '个；' + (rec.companion || '{{char}}') + '进user营地棋子：' + (d.charHomeCount || 0) + '个；user最长单步跳跃：' + (d.userMaxJump || 0) + '跳；' + (rec.companion || '{{char}}') + '最长单步跳跃：' + (d.charMaxJump || 0) + '跳；是否出现user一口气从自己家跳到' + (rec.companion || '{{char}}') + '家：' + (d.shock ? '是' : '否') + '；结算时user未回家棋子：' + (d.userNotHomeAtEnd || 0) + '个；' + (rec.companion || '{{char}}') + '未回家棋子：' + (d.charNotHomeAtEnd || 0) + '个。';
    return cheatText + JSON.stringify(d);
  }
  function textSegments(value) {
    const flatten = input => Array.isArray(input) ? input.flatMap(flatten) : String(input || '').split(/\n{2,}|\r?\n/);
    const parts = flatten(value).map(x => String(x || '').trim()).filter(Boolean);
    return parts.length ? parts : [''];
  }
  function textSegmentsHTML(value) {
    return textSegments(value).map(x => '<p class="wb-text-seg">' + esc(x) + '</p>').join('');
  }
  function inlineMarkdownHTML(text) {
    let html = esc(text);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    return html;
  }
  const markdownCache = new Map();
  function markdownTextHTML(text) {
    const raw = displayCharText(text || '');
    if (markdownCache.has(raw)) return markdownCache.get(raw);
    const lines = raw.split(/\r?\n/);
    const out = [];
    let inList = false;
    let inCode = false;
    let code = [];
    const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
    const closeCode = () => { if (inCode) { out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); code = []; inCode = false; } };
    lines.forEach(line => {
      const trimmed = line.trim();
      if (/^```/.test(trimmed)) {
        if (inCode) closeCode();
        else { closeList(); inCode = true; code = []; }
        return;
      }
      if (inCode) { code.push(line); return; }
      if (!trimmed) { closeList(); return; }
      const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (h) { closeList(); out.push('<h' + Math.min(6, h[1].length) + '>' + inlineMarkdownHTML(h[2]) + '</h' + Math.min(6, h[1].length) + '>'); return; }
      const li = trimmed.match(/^[-*]\s+(.+)$/);
      if (li) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>' + inlineMarkdownHTML(li[1]) + '</li>'); return; }
      closeList();
      out.push('<p class="wb-text-seg">' + inlineMarkdownHTML(trimmed) + '</p>');
    });
    closeList();
    closeCode();
    const html = out.join('');
    markdownCache.set(raw, html);
    if (markdownCache.size > 120) markdownCache.delete(markdownCache.keys().next().value);
    return html;
  }
	  function normalizeTheaterItem(item) {
	    if (Array.isArray(item)) return textSegments(item);
	    if (item && typeof item === 'object') {
	      const parts = item.segments || item.paragraphs || item.parts || item.text;
	      return Array.isArray(parts) ? textSegments(parts) : textSegments(parts || JSON.stringify(item));
	    }
	    return textSegments(item);
	  }
	  function normalizeTheaterText(item) { return normalizeTheaterItem(item).join('\n'); }
	  function recordFavoriteTheaterText(r) {
	    if (!r || !r.favoriteTheater) return '';
	    const t = r.favoriteTheater;
	    return normalizeTheaterText(t.text || t.lines || t);
	  }
	  function updateRecord(game, id, patch) { const all = records(); const arr = all[game] || []; const idx = arr.findIndex(r => r.id === id); if (idx < 0) return null; arr[idx] = Object.assign({}, arr[idx], patch || {}); all[game] = arr; saveRecords(all); return arr[idx]; }
  function deleteRecord(game, id) { const all = records(); all[game] = (all[game] || []).filter(r => r.id !== id); saveRecords(all); }
  function recentGameLogs(game, companion) {
    const who = companion || companionName();
    return (records()[game] || [])
      .filter(r => r.log && (r.companion || '') === who)
      .slice(0, 5)
      .map((r,i) => '日志' + (i + 1) + '（同角色：' + who + '）：' + r.log)
      .join('\n');
  }
  function lineEventLogText(events) {
    const arr = Array.isArray(events) ? events : [];
    if (!arr.length) return '无';
    return arr.slice(-120).map((item, i) => {
      const event = item.event || 'custom';
      const desc = item.desc || '无解释';
      const text = item.text || '';
      return (i + 1) + '. ' + event + '：' + desc + (text ? '\n   内容：' + text : '');
    }).join('\n');
  }
  function recordLineTrigger(game, event, text) {
    if (!game) return;
    const desc = (EVENT_DESCRIPTIONS[game] && EVENT_DESCRIPTIONS[game][event]) || (event === 'custom' ? '自定义角色语录。' : '未配置解释的角色语录触发。');
    currentRoundLineEvents.push({ event, desc, text:String(text || '').trim(), at:Date.now() });
    if (currentRoundLineEvents.length > 120) currentRoundLineEvents = currentRoundLineEvents.slice(-120);
  }
  function resultOutcome(result) { return typeof result === 'string' ? result : (result && result.outcome) || 'finished'; }
  function doubleStreak(game, outcome, companion) {
    const who = companion || companionName();
    const arr = records()[game] || [];
    let n = 0;
    for (const r of arr) {
      if ((r.companion || '') !== who) continue;
      if (resultOutcome(r.result) === outcome) n++;
      else break;
    }
    return n;
  }
  function parseScoreNumber(text) { const m = String(text || '').match(/(\d+)\s*分/); return m ? parseInt(m[1], 10) : 0; }
  function gameTheaterConditionRules(game, roleName) {
    const g = GAME_META[game] || {};
    const role = roleName || displayCharNameForGame(game);
    if (g.mode !== 'double') {
      if (game === 'plank') return [
        'record：刷新当前游戏历史记录。',
        'super_good：超完美小剧场。搭木板连续5次以上perfect，表现角色对user手感的惊讶。',
        'plank_regret：遗憾小剧场。桥只差非常少一点点就能搭上。',
        'plank_tease：嘲笑小剧场。桥差得非常多，可以让角色调侃user是不是不小心手抖了。',
        'super_bad：超级菜小剧场。15秒以内失败，并且分数低于3分。',
        'long_run：单局持续20分钟以上。',
        '如果同一局同时满足多个特殊小剧场，会在满足条件的类型里等概率随机选择一个。'
      ].join('\n');
      if (game === 'sudoku') return [
        'record：刷新当前游戏最短完成时长记录。',
        'super_good：超厉害小剧场。求助少于5次，并且5分钟内完成。',
        'scholar：谁是学霸小剧场。数独里' + role + '帮助你超过5次，表现user一直找TA求助的情感。',
        'independent：超独立小剧场。数独一次求助都没有就完成。',
        'long_run：单局持续20分钟以上。',
        '如果同一局同时满足多个特殊小剧场，会在满足条件的类型里等概率随机选择一个。'
      ].join('\n');
      if (game === 'shuerte') return [
        'record：刷新当前游戏历史最高分。',
        'super_good：超厉害小剧场。零错误完成舒尔特方格且平均每格反应少于1.2秒。',
        'shuerte_focus：专注小剧场。5×5或6×6零错误完成，平均每格反应少于1.8秒，但未达到super_good的1.2秒以内。',
        'shuerte_regret：遗憾小剧场。只差最后3格以内时出现连续错误。',
        'long_run：单局持续20分钟以上。',
        '如果同一局同时满足多个特殊小剧场，会在满足条件的类型里等概率随机选择一个。'
      ].join('\n');
      if (game === 'minesweeper') return [
        'bad_luck：倒霉小剧场。前三次翻开就踩到雷。',
        'minesweeper_regret：遗憾小剧场。最后10个以内的雷时踩雷失败。',
        'normal：普通小剧场。失败情况下的小剧场，需要说明这局虽然失败但已经排查了多少。',
        'super_good：超厉害小剧场。成功扫雷且不触发其他特殊小剧场。',
        'record：破纪录小剧场。刷新当前游戏历史最高分。',
        'mine_lucky：超幸运小剧场。超过5次在不确定雷的情况下试探成功并胜利。',
        '如果同一局同时满足多个特殊小剧场，会在满足条件的类型里等概率随机选择一个。'
      ].join('\n');
      if (game === 'uyangle') return [
        'super_good：超厉害小剧场。不使用打乱和移出，直接完成U了个U并获得胜利。',
        'uyangle_clutch：命悬一线小剧场。触发过7个槽位填满，并且3次移出全部用完。',
        'bad_luck：超倒霉小剧场。连续打乱两次，表现为打乱了也不能通过，只能再打乱。',
        'long_run：超长时间小剧场。单局持续20分钟以上。',
        'normal：普通小剧场。完成或失败后的普通互动。',
        '如果同一局同时满足多个特殊小剧场，会在满足条件的类型里等概率随机选择一个。'
      ].join('\n');
      if (game === 'screw') return [
        'super_good：超级厉害小剧场。不增加盒子/槽位并完成拧螺丝。',
        'screw_regret：遗憾小剧场。拧螺丝达到80%进度以上后失败。',
        'record：破纪录小剧场。刷新当前游戏历史最高分。',
        'long_run：单局持续20分钟以上。',
        'screw_success：成功小剧场。拧螺丝完成且未命中其他特殊小剧场时触发。',
        'screw_fail：失败小剧场。拧螺丝失败且未命中其他特殊小剧场时触发。',
        '如果同一局同时满足多个特殊小剧场，会在满足条件的类型里等概率随机选择一个。'
      ].join('\n');
      if (game === 'popstar') return [
        'super_good：超厉害小剧场。消灭星星里连续3次消除4个以上方块，表现角色对user连续高分连消的惊讶和兴奋。',
        'super_bad：超菜小剧场。消灭星星在4关以内失败，适合轻松调侃、安慰和复盘。',
        'popstar_clutch：命悬一线小剧场。消除最后一个可消除组合后分数才刚好达标过关，重点写险些失败、最后一手救回来的紧张感。',
        'popstar_godmove：神之一手小剧场。剩余20个以内方块时使用打乱或单消道具，并最终通关，重点写残局靠道具救活。',
        'popstar_clear_all：竟然全部消除。消灭星星结算时本关剩余0个星星，重点写棋盘被清得干干净净。',
        'record：破纪录小剧场。刷新当前游戏历史最高分。',
        'normal：普通小剧场。没有命中特殊条件时，根据最终关卡、分数和剩余星星自然复盘。'
      ].join('\n');
      if (game === 'paopao') return [
        'record：破纪录小剧场。刷新当前游戏历史最高分。',
        'paopao_clutch：命悬一线小剧场。泡泡龙超过5次接近红色警戒线，重点写红线压迫感和user把局面撑住的紧张。',
        'paopao_drop：泡泡掉下来啦小剧场。泡泡累计5次以上悬空掉落，重点写切断根部后一串泡泡掉下来的爽感。',
        'super_good：超厉害小剧场。泡泡龙连续3次以上单次得分超过50分，表现角色对user连续高收益射击的惊喜。',
        'paopao_bomb_fail：不明所以小剧场。user使用炸弹工具但是只消除了4个以内泡泡，可以轻松调侃这颗炸弹像是在放烟花。',
        'paopao_clear_all：竟然全部消除。泡泡龙某次射击后把场上所有泡泡全部清空，重点写满屏泡泡掉光/消光后的爽感。',
        'normal：普通小剧场。没有命中特殊条件时，根据分数、下压次数、消除和掉落自然复盘。'
      ].join('\n');
      if (game === 'zuma') return [
        'zuma_chain_master：连锁大师小剧场。祖玛单次射击触发3轮以上连锁。',
        'zuma_clutch：洞口救险小剧场。珠链至少3次逼近终点洞口，重点写即将进洞时的紧张。',
        'zuma_sharpshooter：神射手小剧场。至少发射30次且射失不超过1次。',
        'zuma_toolbox：道具大师小剧场。同一局使用过炸弹、减速和彩虹三种道具。',
        'zuma_endurance：无尽坚守小剧场。玩家在一局中累计坚守到珠链生成150颗。',
        'normal：普通小剧场。根据累计生成和消除珠数、最高速度、射击、射失、连锁和道具使用自然复盘。'
      ].join('\n');
      if (game === 'watersort') return [
        'watersort_perfect：完美整理小剧场。至少6关没有使用提示、撤回、空瓶或重置。',
        'watersort_efficient：一气呵成小剧场。连续5步以上把水倒到顶部同色的瓶子里。',
        'watersort_no_hint：不看答案小剧场。完成至少10关且整局没有使用提示。',
        'watersort_extra_save：多瓶救场小剧场。使用额外空瓶后仍完成至少10关。',
        'watersort_endurance：无尽整理小剧场。一局完成至少20关。',
        'normal：普通小剧场。根据到达关卡、颜色数、单空瓶关、总步数、完美关和道具使用自然复盘。'
      ].join('\n');
      if (game === 'game1010') return [
        'record：破纪录小剧场。刷新当前游戏历史最高分。',
        'game1010_strategy：运筹帷幄小剧场。1010!一次消除超过4行/列，重点写user提前规划空位、一块落下后行列同时清空。',
        'game1010_bad_luck：倒霉小剧场。1010!已经不能放置时，user这一轮使用重新生成或小锤子救场，但用完后仍然输了。',
        'game1010_clutch：命悬一线小剧场。1010!超过3次剩5个以下空格，重点写棋盘几乎堵死但又被user续住。',
        'normal：普通小剧场。没有命中特殊条件时，根据分数、消除行列、放置数量和道具使用自然复盘。'
      ].join('\n');
      if (game === 'turkey') return [
        'super_good：超厉害小剧场。同一轮检测中同时消除至少4行。',
        'turkey_hot：手感正热。连续5次普通移动都产生消除。',
        'turkey_endure：毅力小剧场。单局完成100次有效移动。',
        'turkey_minimal：极简主义。不使用任何道具达到3000分。',
        'turkey_clutch：绝地反击。顶部危险时靠消除或道具成功续住。',
        'turkey_clear_all：竟然全部消除。消除后棋盘只剩1行或0行，系统刷新成3行继续游戏。',
        'bad_luck：超级倒霉。连续5个新行中至少4行没有长度1且占用不少。',
        'turkey_tools：工具齐全。同一局使用过三种不同道具。',
        'record：破纪录小剧场。刷新当前游戏历史最高分。'
      ].join('\n');
      if (game === 'linklink') return [
        'link_fast_combo：超快小剧场。达到20连击。',
        'link_time_rich：时间富翁。剩余时间超过本关初始时间一半时通关。',
        'link_last_second：最后一秒。剩余时间不超过1秒时通关。',
        'bad_luck：超级倒霉。同一关触发3次自动死局洗牌。',
        'link_master：连连看大师。完成第12关。',
        'record：破纪录小剧场。刷新当前游戏历史最高分。',
        'normal：普通小剧场。根据关卡、总分、最高连击和道具使用自然复盘。'
      ].join('\n');
      if (game === 'spider') return [
        'spider_chain_master：连锁大师。同一次结算收起至少5副完整牌。',
        'spider_four_empty：四面通风。同一时刻至少有4个空列。',
        'spider_clear_table：牌桌清空。清空全部十列后继续无尽发牌。',
        'super_good：超厉害小剧场。单局完成50副牌。',
        'spider_clutch：命悬一线。任意一列达到30张后仍继续整理。',
        'bad_luck：超级倒霉。连续三次发牌都属于无可移动发牌。',
        'record：破纪录小剧场。刷新当前游戏历史最高分。',
        'normal：普通小剧场。根据黑桃/红桃收集数量、发牌次数、连续收集数量和游戏时间自然复盘。'
      ].join('\n');
      return [
        'record：刷新当前游戏历史记录。',
        'super_good：超级厉害小剧场。2048合成超过2048的特别大数字；俄罗斯方块消除10行以上；合成大西瓜合成2个最终西瓜；贪吃蛇达到200分以上。',
        'scholar：谁是学霸小剧场。数独里' + role + '帮助你超过5次，表现user一直找TA求助的情感。',
        'independent：超独立小剧场。数独一次求助都没有就完成。',
        'super_bad：超级菜小剧场。15秒以内失败，并且分数很低：俄罗斯方块低于200分、贪吃蛇低于30分、跳一跳低于3分、合成大西瓜低于120分、2048低于128分。',
        'long_run：单局持续20分钟以上。',
        '如果同一局同时满足多个特殊小剧场，会在满足条件的类型里等概率随机选择一个。'
      ].join('\n');
    }
    if (game === 'westernchess') return [
      'cheat_win：耍赖小剧场。user三次耍赖/悔棋都用掉了，但最后还是赢了，重点写' + role + '纵容user悔棋后的反应。',
      'chess_material：子力优势小剧场。user获胜且吃子价值明显领先，重点写从中盘吃子滚成胜势。',
      'chess_checkstorm：连续将军小剧场。user本局至少3次将军，重点写王被一步步逼进网里。',
      'chess_castle：王车易位小剧场。本局出现王车易位，重点写国王转移、安全感和随后攻防变化。',
      'chess_promotion：升变小剧场。本局有兵升变为后，重点写小兵一路走到底线后的反转。',
      'chess_stalemate：逼和平局小剧场。国际象棋因逼和、50回合或三次重复进入平局。',
      'win_streak3：user在同一角色同一游戏连续赢三场。',
      'lose_streak3：' + role + '在同一角色同一游戏连续赢三场。',
      'normal：普通小剧场。根据将军、吃子、王车易位、升变和胜负自然复盘。'
    ].join('\n');
    if (game === 'chinesechess') return [
      'cheat_win：耍赖小剧场。user三次反悔都用掉了，但最后还是赢了，重点写' + role + '纵容user悔棋后的反应。',
      'chinese_material：子力优势小剧场。user获胜且吃子价值明显领先，重点写从中盘吃子滚成胜势。',
      'chinese_checkstorm：连续将军小剧场。user本局至少3次将军，重点写帅/将被一步步逼进网里。',
      'chinese_cannon：炮打小剧场。本局出现炮隔子打吃，重点写炮架、隔山打牛和局面突然打开。',
      'chinese_river：过河兵小剧场。本局有兵卒过河，重点写小兵过河后横向施压、越走越危险。',
      'chinese_stalemate：困毙/平局小剧场。中国象棋因困毙或长回合未吃子进入结算。',
      'win_streak3：user在同一角色同一游戏连续赢三场。',
      'lose_streak3：' + role + '在同一角色同一游戏连续赢三场。',
      'normal：普通小剧场。根据将军、吃子、炮打、过河兵、反悔和胜负自然复盘。'
    ].join('\n');
    if (game === 'blackjack') return [
      'bj_blackjack：天生21。user获得Blackjack。',
      'bj_exact21：21正好。user使用3张或更多牌组成21点。',
      'bj_six：六牌奇迹。手牌达到6张且没有爆牌。',
      'bj_peek_win：一眼看穿。使用偷看后赢下这一轮。',
      'bad_luck：超级倒霉。user连续3轮爆牌。',
      'bj_char_bust：Char也有今天。Char连续3轮爆牌。',
      'bj_win5：停不下来。连续击败Char 5轮。',
      'bj_tiebreak：决胜赢家。在决胜局击败Char。',
      'bj_peek_bust：偷看是不对的。一局使用偷看后仍然爆牌。',
      'record：破纪录小剧场。刷新当前游戏历史最高分。'
    ].join('\n');
    if (game === 'ludo') return [
      'cheat_win：耍赖小剧场。user三次耍赖/悔棋都用掉了，但最后还是赢了，重点写' + role + '纵容user后的反应。',
      'flight_show：特殊小剧场。飞行棋里user本局完成超过3次飞行，必须写user多次利用飞行区拉开距离，' + role + '惊讶、不服、得瑟被压回去或认真复盘飞行过程。',
      'lucky：运气超好小剧场。user连续投到6或靠骰运明显获得优势。',
      'stomp：实力悬殊小剧场。' + role + '赢得很轻松，user还有棋子没有起飞。',
      'close_win：险胜小剧场。user获胜时' + role + '只差一枚棋子到终点。',
      'close_lose：惜败小剧场。user失败时自己只差一枚棋子到终点。',
      'win_streak3：user在同一角色同一游戏连续赢三场。',
      'lose_streak3：' + role + '在同一角色同一游戏连续赢三场。'
    ].join('\n');
    if (game === 'bombnumber') return [
      'cheat_win：耍赖小剧场。user三次耍赖/悔棋都用掉了，但最后还是赢了，重点写' + role + '纵容user后的反应。',
      'bad_luck：数字炸弹超倒霉小剧场。user在还有80个以上可选数字时点中炸弹失败。',
      'bomb_lucky：数字炸弹超幸运小剧场。user一次缩小50个以上数字且没有爆炸。',
      'fated：数字炸弹命中注定小剧场。user最后剩1个数字没得选。',
      'rage：数字炸弹气急败坏小剧场。' + role + '最后剩1个数字没得选。'
    ].join('\n');
    if (game === 'reversi') return [
      'cheat_win：耍赖小剧场。user三次耍赖/悔棋都用掉了，但最后还是赢了，重点写' + role + '纵容user后的反应。',
      'win_streak3：user在同一角色同一游戏连续赢三场。',
      'lose_streak3：' + role + '在同一角色同一游戏连续赢三场。',
      'reversi_user_sweep：完胜小剧场。user占据棋盘55个以上的棋子并获胜。',
      'reversi_char_sweep：完败小剧场。' + role + '占据棋盘55个以上的棋子并获胜。',
      'reversi_close_win：险胜小剧场。user的棋子不超过2个胜过' + role + '。',
      'reversi_close_lose：险败小剧场。' + role + '的棋子不超过2个胜过user，可以带一点小侥幸。',
      'reversi_comeback：逆转小剧场。user从远远少于' + role + '（user棋子是' + role + '一半以下）到一次突然翻转超过7个并最终获胜。'
    ].join('\n');
    if (game === 'connect4d') return [
      'cheat_win：耍赖小剧场。user三次耍赖/悔棋都用掉了，但最后还是赢了，重点写' + role + '纵容user后的反应。',
      'win_streak3：user在同一角色同一游戏连续赢三场。',
      'lose_streak3：' + role + '在同一角色同一游戏连续赢三场。',
      'balanced：势均力敌小剧场。棋盘填满但是平局。'
    ].join('\n');
    if (game === 'draughts') return [
      'cheat_win：耍赖小剧场。user三次耍赖/悔棋都用掉了，但最后还是赢了，重点写' + role + '纵容user后的反应。',
      'super_good：超厉害小剧场。user赢，并且' + role + '还有5个以上棋子没进user家。',
      'super_bad：超级菜小剧场。' + role + '赢，并且user还有5个以上棋子没进' + role + '家。',
      'shock：震惊小剧场。user一次性把一颗棋子从自己家跳到' + role + '家。',
      'normal：普通小剧场。按胜负生成对应互动。'
    ].join('\n');
    if (game === 'gomoku') return [
      'cheat_win：耍赖小剧场。user三次耍赖/悔棋都用掉了，但最后还是赢了，重点写' + role + '纵容user后的反应。',
      'win_streak3：user在同一角色同一游戏连续赢三场。',
      'lose_streak3：' + role + '在同一角色同一游戏连续赢三场。',
      'gomoku_normal_user_win：普通模式小剧场。普通五子棋里user五子连线获胜。',
      'gomoku_normal_char_win：普通模式小剧场。普通五子棋里' + role + '五子连线获胜。',
      'gomoku_endless_user_capture：无尽模式吃子小剧场。无尽五子棋里user吃掉' + role + '的棋子更多，或最终靠吃子优势获胜。',
      'gomoku_endless_char_capture：无尽模式吃子小剧场。无尽五子棋里' + role + '吃掉user的棋子更多，或最终靠吃子优势获胜。',
      'close_win：险胜。user在无尽模式只比' + role + '多吃不超过2颗棋子而获胜。',
      'close_lose：惜败。' + role + '在无尽模式只比user多吃不超过2颗棋子而获胜。'
    ].join('\n');
    return [
      'cheat_win：耍赖小剧场。user三次耍赖/悔棋都用掉了，但最后还是赢了，重点写' + role + '纵容user后的反应。',
      'win_streak3：user在同一角色同一游戏连续赢三场。',
      'lose_streak3：' + role + '在同一角色同一游戏连续赢三场。',
      'lucky：运气超好。猜数字5次内猜中；飞行棋连续摇到2次6并获胜；我说你猜第一条直接猜中；抽鬼牌user3回合内获胜。',
      'stomp：实力悬殊。双人飞行棋' + role + '获胜且user一个飞机都没回去；围地盘' + role + '比user多10格以上；抽鬼牌' + role + '3回合内获胜。',
      'close_lose：惜败。user差一点输给' + role + '，包括井字棋最后一步输、围地盘差2格以内、飞行棋' + role + '赢时user也只差一个棋子。',
      'close_win：险胜。user惊险获胜，包括井字棋最后一步赢、围地盘差2格以内、飞行棋user赢时' + role + '也只差一个棋子。',
      'soulmate：我说你猜5道全部猜中。'
      ,'bad_luck：数字炸弹超倒霉小剧场。user在还有80个以上可选数字时点中炸弹失败。'
      ,'bomb_lucky：数字炸弹超幸运小剧场。user一次缩小50个以上数字且没有爆炸。'
      ,'fated：数字炸弹命中注定小剧场。user最后剩1个数字没得选。'
      ,'rage：数字炸弹气急败坏小剧场。' + role + '最后剩1个数字没得选。'
    ].join('\n');
  }
  function theaterConditionForSpecial(game, special, roleName) {
    if (!special) return '普通小剧场：未命中特殊小剧场条件。';
    const rules = gameTheaterConditionRules(game, roleName).split('\n');
    return rules.find(x => x.indexOf(special + '：') === 0) || (theaterTitleForSpecial(special) + '：命中该特殊小剧场条件。');
  }
  function singleSpecialTheater(game, scoreText, meta, durationMs) {
    const score = parseScoreNumber(scoreText);
    meta = meta || {};
    const candidates = [];
    if ((game === 'game2048' && (meta.maxTile || 0) >= 4096) || (game === 'tetris' && (meta.lines || 0) >= 10) || (game === 'watermelon' && (meta.finalWatermelons || 0) >= 2) || (game === 'snake' && score >= 200)) candidates.push('super_good');
    if (game === 'plank' && (meta.perfectStreak || 0) >= 5) candidates.push('super_good');
    if (game === 'plank' && meta.nearMiss) candidates.push('plank_regret');
    if (game === 'plank' && meta.farMiss) candidates.push('plank_tease');
    if (game === 'sudoku' && (meta.hints || 0) > 5) candidates.push('scholar');
    if (game === 'sudoku' && (meta.hints || 0) === 0) candidates.push('independent');
    if (game === 'sudoku' && (meta.hints || 0) < 5 && durationMs <= 300000) candidates.push('super_good');
    if (game === 'shuerte' && meta.perfectFast) candidates.push('super_good');
    if (game === 'shuerte' && meta.focusRun) candidates.push('shuerte_focus');
    if (game === 'shuerte' && meta.regret) candidates.push('shuerte_regret');
    if (game === 'shuerte') {
      if (currentRoundRecord) candidates.push('record');
      if (durationMs >= 1200000) candidates.push('long_run');
      return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : '';
    }
    if (game === 'minesweeper' && meta.badLuck) candidates.push('bad_luck');
    if (game === 'minesweeper' && meta.regret) candidates.push('minesweeper_regret');
    if (game === 'minesweeper' && meta.won && (meta.riskyChordSuccesses || 0) > 5) candidates.push('mine_lucky');
    if (game === 'minesweeper') {
      if (currentRoundRecord) candidates.push('record');
      if (!candidates.length && meta.won) candidates.push('super_good');
      return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : '';
    }
    if (game === 'uyangle' && meta.completed && (meta.shuffles || 0) === 0 && (meta.moveouts || 0) === 0) candidates.push('super_good');
    if (game === 'uyangle' && meta.fullTraySurvived && (meta.usedAllMoveouts || (meta.moveouts || 0) >= 3)) candidates.push('uyangle_clutch');
    if (game === 'uyangle' && meta.badLuck) candidates.push('bad_luck');
    if (game === 'screw' && meta.completed && (meta.addBoxUses || 0) === 0) candidates.push('super_good');
    if (game === 'screw' && !meta.completed && (meta.progress || 0) >= 80) candidates.push('screw_regret');
    if (game === 'popstar' && meta.completed && (meta.maxHighStreak || meta.details?.maxHighStreak || 0) >= 3) candidates.push('super_good');
    if (game === 'popstar' && !meta.completed && (meta.level || meta.details?.level || 1) <= 4) candidates.push('super_bad');
    if (game === 'popstar' && meta.clutch) candidates.push('popstar_clutch');
    if (game === 'popstar' && meta.godMove) candidates.push('popstar_godmove');
    if (game === 'popstar' && (meta.amazingClear || meta.details?.amazingClear || meta.clearAllCount || meta.details?.clearAllCount || meta.remainingAtEnd === 0 || meta.details?.remainingAtEnd === 0)) candidates.push('popstar_clear_all');
    if (game === 'paopao' && (meta.maxHighStreak || meta.details?.maxHighStreak || 0) >= 3) candidates.push('super_good');
    if (game === 'paopao' && (meta.dangerCount || meta.details?.dangerCount || 0) > 5) candidates.push('paopao_clutch');
    if (game === 'paopao' && (meta.dropTotal || meta.details?.dropTotal || 0) >= 5) candidates.push('paopao_drop');
    if (game === 'paopao' && (meta.bombBad || meta.details?.bombBad)) candidates.push('paopao_bomb_fail');
    if (game === 'paopao' && (meta.amazingClear || meta.details?.amazingClear || meta.clearAllCount || meta.details?.clearAllCount)) candidates.push('paopao_clear_all');
    if (game === 'zuma') {
      const d = meta.details || meta;
      if ((d.maxCombo || meta.maxCombo || 0) >= 3) candidates.push('zuma_chain_master');
      if ((d.dangerCount || 0) >= 3) candidates.push('zuma_clutch');
      if ((d.shots || 0) >= 30 && (d.misses || 0) <= 1) candidates.push('zuma_sharpshooter');
      if ((d.bombUsed || 0) > 0 && (d.slowUsed || 0) > 0 && (d.rainbowUsed || 0) > 0) candidates.push('zuma_toolbox');
      if ((d.totalBallsGenerated || 0) >= 150) candidates.push('zuma_endurance');
    }
    if (game === 'watersort') {
      const d = meta.details || meta;
      if ((d.perfectLevels || 0) >= 6) candidates.push('watersort_perfect');
      if ((d.maxEfficientStreak || 0) >= 5) candidates.push('watersort_efficient');
      if ((d.levelsCleared || 0) >= 10 && (d.hintsUsed || 0) === 0) candidates.push('watersort_no_hint');
      if ((d.levelsCleared || 0) >= 10 && (d.extraUsed || 0) > 0) candidates.push('watersort_extra_save');
      if ((d.levelsCleared || 0) >= 20) candidates.push('watersort_endurance');
    }
    if (game === 'game1010' && (meta.maxClear || meta.details?.maxClear || 0) > 4) candidates.push('game1010_strategy');
    if (game === 'game1010' && (meta.toolExhaustLose || meta.details?.toolExhaustLose)) candidates.push('game1010_bad_luck');
    if (game === 'game1010' && (meta.lowSpaceCount || meta.details?.lowSpaceCount || 0) > 3) candidates.push('game1010_clutch');
    if (game === 'turkey' && (meta.maxClear || meta.details?.maxClear || 0) >= 4) candidates.push('super_good');
    if (game === 'turkey' && (meta.maxCombo || meta.details?.maxCombo || 0) >= 5) candidates.push('turkey_hot');
    if (game === 'turkey' && (meta.moves || meta.details?.moves || 0) >= 100) candidates.push('turkey_endure');
    if (game === 'turkey' && (meta.noTool3000 || meta.details?.noTool3000)) candidates.push('turkey_minimal');
    if (game === 'turkey' && (meta.clutch || meta.details?.clutch)) candidates.push('turkey_clutch');
    if (game === 'turkey' && (meta.amazingClear || meta.details?.amazingClear || meta.clearAllCount || meta.details?.clearAllCount)) candidates.push('turkey_clear_all');
    if (game === 'turkey' && (meta.badLuck || meta.details?.badLuck)) candidates.push('bad_luck');
    if (game === 'turkey' && (meta.toolsAll || meta.details?.toolsAll)) candidates.push('turkey_tools');
    if (game === 'spider' && (meta.maxChain || meta.details?.maxChain || 0) >= 5) candidates.push('spider_chain_master');
    if (game === 'spider' && (meta.maxEmptyCols || meta.details?.maxEmptyCols || 0) >= 4) candidates.push('spider_four_empty');
    if (game === 'spider' && (meta.clearTable || meta.details?.clearTable)) candidates.push('spider_clear_table');
    if (game === 'spider' && (meta.completed || meta.details?.completed || 0) >= 50) candidates.push('super_good');
    if (game === 'spider' && (meta.clutch || meta.details?.clutch || 0) > 0) candidates.push('spider_clutch');
    if (game === 'spider' && (meta.badDeals || meta.details?.badDeals || 0) >= 3) candidates.push('bad_luck');
    if (game === 'linklink' && (meta.maxCombo || meta.details?.maxCombo || 0) >= 20) candidates.push('link_fast_combo');
    if (game === 'linklink' && (meta.fastClear || meta.details?.fastClear)) candidates.push('link_time_rich');
    if (game === 'linklink' && (meta.lastSecond || meta.details?.lastSecond)) candidates.push('link_last_second');
    if (game === 'linklink' && (meta.deadShufflesInLevel || meta.details?.deadShufflesInLevel || 0) >= 3) candidates.push('bad_luck');
    if (game === 'linklink' && (meta.completedAll || meta.details?.completedAll)) candidates.push('link_master');
    if (durationMs <= 15000 && ((game === 'tetris' && score < 200) || (game === 'snake' && score < 30) || ((game === 'jump' || game === 'plank') && score < 3) || (game === 'watermelon' && score < 120) || (game === 'game2048' && score < 128))) candidates.push('super_bad');
    if (game !== 'linklink' && durationMs >= 1200000) candidates.push('long_run');
    if (currentRoundRecord) candidates.push('record');
    if (game === 'screw' && !candidates.length) candidates.push(meta.completed ? 'screw_success' : 'screw_fail');
    return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : '';
  }
  function doubleSpecialTheater(game, outcome, scoreText, meta) {
    meta = meta || {};
    if (game === 'westernchess') { const d=meta.details||meta||{}, arr=[]; if((d.promotions||0)>0) arr.push('chess_promotion'); if((d.castles||0)>0) arr.push('chess_castle'); if(outcome==='draw') arr.push('chess_stalemate'); if(outcome==='user_win' && (d.userChecks||0)>=3) arr.push('chess_checkstorm'); if(outcome==='user_win' && (meta.materialSwing || d.materialSwing || 0) >= 800) arr.push('chess_material'); return arr.length ? arr[Math.floor(Math.random()*arr.length)] : ''; }
    if (game === 'chinesechess') { const d=meta.details||meta||{}, arr=[]; if((d.cannonHits||0)>0) arr.push('chinese_cannon'); if((d.riverCross||0)>0) arr.push('chinese_river'); if(outcome==='draw' || /困毙|长回合/.test(d.endReason||'')) arr.push('chinese_stalemate'); if(outcome==='user_win' && (d.userChecks||0)>=3) arr.push('chinese_checkstorm'); if(outcome==='user_win' && (meta.materialSwing || d.materialSwing || 0) >= 800) arr.push('chinese_material'); return arr.length ? arr[Math.floor(Math.random()*arr.length)] : ''; }
    if (game === 'blackjack') { const d=meta.details||meta||{}; const arr=[]; if((d.blackjacks||0)>0) arr.push('bj_blackjack'); if((d.exact21||0)>0) arr.push('bj_exact21'); if(d.sixCard) arr.push('bj_six'); if(d.peekWin) arr.push('bj_peek_win'); if(d.tripleBust) arr.push('bad_luck'); if(d.charTripleBust) arr.push('bj_char_bust'); if((d.maxStreak||0)>=5) arr.push('bj_win5'); if(d.wonTiebreak) arr.push('bj_tiebreak'); if(d.peekBust) arr.push('bj_peek_bust'); if(currentRoundRecord) arr.push('record'); return arr.length ? arr[Math.floor(Math.random()*arr.length)] : ''; }
    if (game === 'connect4d' && outcome === 'draw') return 'balanced';
    if (game === 'ludo' && Number(meta.userFlights || meta.details?.userFlights || 0) > 3) return 'flight_show';
    if (outcome === 'user_win') {
      const cheatUsed = Number(meta.cheatUsed || meta.details?.cheatUsed || 0);
      if (cheatUsed >= CHEAT_MAX) return 'cheat_win';
      if (game === 'gomoku') {
        if (meta.endless) return Math.abs((meta.userCaptures || 0) - (meta.taCaptures || 0)) <= 2 ? 'close_win' : 'gomoku_endless_user_capture';
        return 'gomoku_normal_user_win';
      }
      if (game === 'bombnumber' && meta.luckyShrink) return 'bomb_lucky';
      if (game === 'bombnumber' && meta.charDoomed) return 'rage';
      if (game === 'bombnumber') return '';
      if (game === 'draughts' && meta.shock) return 'shock';
      if (game === 'draughts' && (meta.charNotHomeAtEnd || 0) > 5) return 'super_good';
      if (game === 'reversi' && meta.comeback) return 'reversi_comeback';
      if (game === 'reversi' && (meta.userScore || 0) >= 55) return 'reversi_user_sweep';
      if (game === 'reversi' && (meta.userScore || 0) > (meta.taScore || 0) && (meta.userScore || 0) - (meta.taScore || 0) <= 2) return 'reversi_close_win';
      if ((game === 'guessnumber' && (meta.tries || 99) <= 5) || (game === 'ludo' && (meta.consecutiveSixes || 0) >= 2) || (game === 'wordguess' && meta.firstClueWin) || (game === 'oldmaid' && (meta.userTurns || 99) <= 3)) return 'lucky';
      if (game === 'wordguess' && meta.allCorrect) return 'soulmate';
      if ((game === 'tictactoe' && meta.lastMoveWin) || (game === 'territory' && Math.abs((meta.userScore || 0) - (meta.taScore || 0)) <= 2) || (game === 'ludo' && meta.opponentOnePieceLeft)) return 'close_win';
      return '';
    }
    if (outcome === 'ta_win') {
      if (game === 'gomoku') {
        if (meta.endless) return Math.abs((meta.userCaptures || 0) - (meta.taCaptures || 0)) <= 2 ? 'close_lose' : 'gomoku_endless_char_capture';
        return 'gomoku_normal_char_win';
      }
      if (game === 'bombnumber' && meta.badLuck) return 'bad_luck';
      if (game === 'bombnumber' && meta.userDoomed) return 'fated';
      if (game === 'bombnumber') return '';
      if (game === 'draughts' && meta.shock) return 'shock';
      if (game === 'draughts' && (meta.userNotHomeAtEnd || 0) > 5) return 'super_bad';
      if (game === 'reversi' && (meta.taScore || 0) >= 55) return 'reversi_char_sweep';
      if (game === 'reversi' && (meta.taScore || 0) > (meta.userScore || 0) && (meta.taScore || 0) - (meta.userScore || 0) <= 2) return 'reversi_close_lose';
      if ((game === 'ludo' && meta.userHomeAll) || (game === 'territory' && (meta.taScore || 0) - (meta.userScore || 0) >= 10) || (game === 'oldmaid' && (meta.taTurns || 99) <= 3)) return 'stomp';
      if ((game === 'tictactoe' && meta.lastMoveWin) || (game === 'territory' && Math.abs((meta.userScore || 0) - (meta.taScore || 0)) <= 2) || (game === 'ludo' && meta.opponentOnePieceLeft)) return 'close_lose';
    }
    return '';
  }
  function theaterTitleForSpecial(special) {
    return ({
      record: '破纪录小剧场',
      win_streak3: '连赢三场小剧场',
      lose_streak3: '连输三场小剧场',
      super_good: '超级厉害小剧场',
      super_bad: '超级菜小剧场',
      long_run: '超能熬小剧场',
      lucky: '运气超好小剧场',
      stomp: '实力悬殊小剧场',
      close_lose: '惜败小剧场',
      close_win: '险胜小剧场',
      soulmate: '心有灵犀小剧场'
      ,cheat_win: '耍赖小剧场'
      ,scholar: '谁是学霸小剧场'
      ,independent: '超独立小剧场'
      ,bad_luck: '超倒霉小剧场'
      ,bomb_lucky: '超幸运小剧场'
      ,fated: '命中注定小剧场'
      ,rage: '气急败坏小剧场'
      ,plank_regret: '遗憾小剧场'
      ,plank_tease: '嘲笑小剧场'
      ,reversi_user_sweep: '完胜小剧场'
      ,reversi_char_sweep: '完败小剧场'
      ,reversi_close_win: '险胜小剧场'
      ,reversi_close_lose: '险败小剧场'
      ,reversi_comeback: '逆转小剧场'
      ,balanced: '势均力敌小剧场'
      ,shock: '震惊小剧场'
      ,gomoku_normal_user_win: '普通模式胜利小剧场'
      ,gomoku_normal_char_win: '普通模式失败小剧场'
      ,gomoku_endless_user_capture: '无尽吃子胜利小剧场'
      ,gomoku_endless_char_capture: '无尽吃子失败小剧场'
      ,uyangle_clutch: '命悬一线小剧场'
      ,minesweeper_regret: '遗憾小剧场'
      ,mine_lucky: '超幸运小剧场'
      ,shuerte_focus: '专注小剧场'
      ,shuerte_regret: '遗憾小剧场'
      ,screw_regret: '遗憾小剧场'
      ,screw_success: '成功小剧场'
      ,screw_fail: '失败小剧场'
      ,popstar_clutch: '命悬一线小剧场'
      ,popstar_godmove: '神之一手小剧场'
      ,popstar_clear_all: '竟然全部消除'
      ,paopao_clutch: '命悬一线小剧场'
      ,paopao_drop: '泡泡掉下来啦'
      ,paopao_bomb_fail: '不明所以小剧场'
      ,paopao_clear_all: '竟然全部消除'
      ,zuma_chain_master: '连锁大师小剧场'
      ,zuma_clutch: '洞口救险小剧场'
      ,zuma_sharpshooter: '神射手小剧场'
      ,zuma_toolbox: '道具大师小剧场'
      ,zuma_endurance: '无尽坚守小剧场'
      ,watersort_perfect: '完美整理小剧场'
      ,watersort_efficient: '一气呵成小剧场'
      ,watersort_no_hint: '不看答案小剧场'
      ,watersort_extra_save: '多瓶救场小剧场'
      ,watersort_endurance: '无尽整理小剧场'
      ,game1010_strategy: '运筹帷幄小剧场'
      ,game1010_bad_luck: '倒霉小剧场'
      ,game1010_clutch: '命悬一线小剧场'
      ,turkey_hot: '手感正热'
      ,turkey_endure: '毅力小剧场'
      ,turkey_minimal: '极简主义'
      ,turkey_clutch: '绝地反击'
      ,turkey_clear_all: '竟然全部消除'
      ,turkey_tools: '工具齐全'
      ,link_fast_combo: '超快小剧场'
      ,link_time_rich: '时间富翁'
      ,link_last_second: '最后一秒'
      ,link_master: '连连看大师'
      ,spider_chain_master: '连锁大师小剧场'
      ,spider_four_empty: '四面通风小剧场'
      ,spider_clear_table: '牌桌清空小剧场'
      ,spider_clutch: '命悬一线小剧场'
      ,bj_blackjack: '天生21'
      ,bj_exact21: '21正好'
      ,bj_six: '六牌奇迹'
      ,bj_peek_win: '一眼看穿'
      ,bj_char_bust: 'Char也有今天'
      ,bj_win5: '停不下来'
      ,bj_tiebreak: '决胜赢家'
      ,bj_peek_bust: '偷看是不对的'
      ,flight_show: '飞行小剧场'
      ,chess_material: '子力优势小剧场'
      ,chess_checkstorm: '连续将军小剧场'
      ,chess_castle: '王车易位小剧场'
      ,chess_promotion: '升变小剧场'
      ,chess_stalemate: '逼和平局小剧场'
      ,chinese_material: '子力优势小剧场'
      ,chinese_checkstorm: '连续将军小剧场'
      ,chinese_cannon: '炮打小剧场'
      ,chinese_river: '过河兵小剧场'
      ,chinese_stalemate: '困毙平局小剧场'
    }[special] || '特殊角色互动小剧场').replace(/{{char}}/g, displayCharName());
  }
  function nextCharLineTurn(from) { return (from || 0) + 3 + Math.floor(Math.random() * 3); }
	  const CHEAT_MAX = 3;
	  function cheatButtonHTML(left) {
	    const n = Math.max(0, Math.min(CHEAT_MAX, Number(left == null ? CHEAT_MAX : left) || 0));
	    return '<button type="button" class="wb-btn primary wb-cheat-btn wb-cheat-compact" id="wb-cheat">耍赖 <span class="wb-sudoku-badge" id="wb-cheat-left">' + n + '</span></button>';
  }
  function cheatButtonCompactHTML(left) {
    const n = Math.max(0, Math.min(CHEAT_MAX, Number(left == null ? CHEAT_MAX : left) || 0));
    return '<button type="button" class="wb-btn primary wb-cheat-btn wb-cheat-compact" id="wb-cheat">耍赖 <span class="wb-sudoku-badge" id="wb-cheat-left">' + n + '</span></button>';
  }
  function cloneCheatState(value) {
    try { return JSON.parse(JSON.stringify(value)); } catch(e) { return value; }
  }
  function pushCheatUndo(stack, snapshot) {
    const arr = Array.isArray(stack) ? stack : [];
    arr.push(cloneCheatState(snapshot));
    return arr.slice(-8);
  }
	  function restoreCheatSnapshot(snapshot, assign) {
	    if (!snapshot) return false;
	    assign(cloneCheatState(snapshot));
	    return true;
	  }
	  function cheatAttemptResult(game, root, locked) {
	    if (locked) return 'locked';
	    const role = displayCharNameForGame(game) || displayCharName() || 'TA';
	    if (Math.random() < 0.5) {
	      toast(role + '大发慈悲的允许你回退一步');
	      speak(game, 'cheat_success');
	      return 'success';
	    }
	    speak(game, 'cheat_fail');
	    toast(role + '拒绝了你的耍赖');
	    return 'fail';
	  }
	  function toastCheatAlreadyAttempted() {
	    toast('别耍赖了，下次再试试吧~');
	  }
	  function refreshCheatButton(root, left, canUndo, disabled) {
	    const btn = qs('#wb-cheat', root);
	    if (!btn) return;
    const n = Math.max(0, Math.min(CHEAT_MAX, Number(left == null ? CHEAT_MAX : left) || 0));
    const badge = qs('#wb-cheat-left', root);
    if (badge) badge.textContent = String(n);
    btn.disabled = !!disabled || n <= 0 || !canUndo;
  }
  function eventDescriptionBlock(game, keys) {
    const m = EVENT_DESCRIPTIONS[game] || {};
    const g = GAME_META[game] || {};
    return (keys || Object.keys(DEFAULT_LINES[game] || {})).map(k => {
      const desc = k === 'random' ? ((g.mode === 'double' ? '一起玩' : '观看') + (g.name || game) + '游戏时的碎碎念') : (m[k] || '游戏事件触发');
      return k + '：' + desc;
    }).join('\n');
  }
  function specialLanguageOptions() { return ['粤语','古言','日语','英语','韩语','法语','俄语','西语']; }
  function specialLanguageRequirement(kind, cfgOverride) {
    const cfg = cfgOverride || settings();
    if (!cfg.specialLanguageEnabled) return '';
    const lang = specialLanguageOptions().includes(cfg.specialLanguage) ? cfg.specialLanguage : '粤语';
    if (kind === 'line') {
      if (lang === '古言') return `【强制语言要求】
当前特殊语言风格：古言。
请使用白话古风文风生成角色语录，可带古风称呼、语气、句式和含蓄表达。
整体必须易懂，不要写成艰涩文言文。
不要出现现代翻译括号。
语录必须仍然贴合当前游戏事件，不要写成脱离游戏的古风套话。`;
      return `【强制语言要求】
当前特殊语言风格：${lang}。
语录整体必须使用普通话，普通中文读者必须能顺畅看懂。
禁止输出真正的外语单词、外语短句、外语字母或外语文字。
请只保留“该语言使用者说普通话时的口吻和节奏”，可以体现在语气词、称呼、断句、词序、轻微翻译腔、情绪表达方式和常见说话习惯上。
语言风格必须自然融入角色对白，不要像翻译练习、语言教材或刻意卖弄。
语录必须仍然符合角色性格、关系感和当前游戏事件，不要为了语言风格牺牲角色口吻。`;
    }
    if (kind === 'petLog') {
      if (lang === '古言') return `【强制语言要求】
当前特殊语言风格：古言。
宠物日志请使用白话古风文风，像当前角色为你们和宠物写下的一段小记。
可以使用古风措辞、含蓄情绪、旧时称谓和文雅句式。
整体必须通顺易懂，不要写成艰涩文言文。
日志必须围绕今日养宠互动、剧情记忆、{{user}}、{{char}}与宠物的关系变化，不要写成脱离宠物生活的抒情。
不要出现外语括号翻译格式。`;
      return `【强制语言要求】
当前特殊语言风格：${lang}。
宠物日志整体以普通话为主，普通中文读者必须能顺畅看懂。
请保留“该语言使用者说普通话时的口吻和节奏”，可以体现在语气词、称呼、断句、词序、轻微翻译腔、情绪表达方式和常见说话习惯上。
可以少量加入符合该语言氛围的简单外语词、短句或称呼。
外语内容必须简短，并在首次出现时用括号给出中文含义。
不要整段外语，不要让日志变成翻译文本或语言教学。
语言风格必须服务于当前角色口吻、养宠日常、关系感和今日记忆。`;
    }
    if (kind === 'log') {
      if (lang === '古言') return `【强制语言要求】
当前特殊语言风格：古言。
日志请使用白话古风文风，像当前角色事后写下的一段古风小记。
可以使用古风措辞、含蓄情绪、旧时称谓和文雅句式。
整体必须通顺易懂，不要写成艰涩文言文。
日志必须自然提及本局游戏、胜负或分数、用时和关键过程，不要写成脱离游戏的古风抒情。
不要出现外语括号翻译格式。`;
      return `【强制语言要求】
当前特殊语言风格：${lang}。
日志整体必须以普通话为主，普通中文读者必须能顺畅看懂。
请保留“该语言使用者说普通话时的口吻和节奏”，可以体现在语气词、称呼、断句、词序、轻微翻译腔、情绪表达方式和常见说话习惯上。
可以少量加入符合该语言氛围的简单外语词、短句或称呼。
外语内容必须简短，并在首次出现时用括号给出中文含义，例如：bonjour（你好）。
不要整段外语，不要让日志变成翻译文本或语言教学。
语言风格必须服务于角色口吻、关系感、当局情绪和游戏过程，不要盖过日志内容。`;
    }
    if (lang === '古言') return `【强制语言要求】
当前特殊语言风格：古言。
小剧场整体请使用白话古风文风来写，包括叙述、动作、心理、场景和对白。
文风要像通顺易懂的古风短篇，不要写成艰涩文言文。
可以使用古风称谓、含蓄情绪、衣袖、灯影、案前、棋局、旧约等意象。
角色对白和叙述都可以带古风，但仍必须承接小游戏输赢、角色关系和当局情绪。
必须自然提及或承接本局游戏，不要写成完全脱离小游戏的古风段子。`;
    return `【强制语言要求】
当前特殊语言风格：${lang}。
小剧场的叙述、动作、心理、场景描写必须使用普通话，保证普通中文读者顺畅阅读。
当角色说出外语时，必须严格使用格式：“外语原文”（*中文翻译*），例如：“bonjour”（*你好*）。禁止输出花括号。
旁白、动作描写、心理描写不得写成外语。
语言风格必须服务于角色性格、关系感、小游戏输赢和当局情绪，不要写成翻译练习或语言教材。`;
  }
  function addTaWin(game) { const sc = scores(); const cur = sc[game] && typeof sc[game] === 'object' ? sc[game] : { user: sc[game] || 0, ta: 0 }; cur.ta = (cur.ta || 0) + 1; sc[game] = cur; saveJSON(STORAGE_SCORES, sc); }
  function isMobileHost() {
    const win = getHostWindow();
    const nav = win.navigator || navigator;
    return (win.innerWidth || 800) <= 768 || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') || (nav.maxTouchPoints || 0) > 1;
  }
	  function themeClass(value) {
	    const t = value || settings().theme || 'day';
	    return ({ day:'wb-day', arcade:'wb-arcade', night:'wb-night', spring:'wb-spring', cyber:'wb-cyber', mono:'wb-mono', card:'wb-cardtheater', tavern:'wb-tavern' })[t] || 'wb-day';
	  }
	  function clearTavernThemeVars(root) {
	    if (!root) return;
	    ['--wb-bg','--wb-panel','--wb-soft','--wb-text','--wb-sub','--wb-border','--wb-accent','--wb-accent2','--wb-board','--wb-input','--wb-glow','--wb-gold','--wb-screen','--wb-on-accent'].forEach(name => root.style.removeProperty(name));
	  }
	  function contrastTextForCss(color, fallback) {
	    const lum = relativeLuminanceFromCss(color);
	    if (!Number.isFinite(lum)) return fallback || '#fff';
	    return lum > .55 ? '#172033' : '#fff';
	  }
	  function hostCssValue(name, fallback) {
	    try {
	      const doc = getHostDocument();
	      const styles = getHostWindow().getComputedStyle(doc.documentElement);
	      return String(styles.getPropertyValue(name) || fallback || '').trim();
	    } catch(e) { return fallback || ''; }
	  }
	  function applyTavernThemeVars(root) {
	    if (!root) return;
	    if ((settings().theme || 'day') !== 'tavern') { clearTavernThemeVars(root); return; }
	    const doc = getHostDocument();
	    const win = getHostWindow();
	    const bodyStyle = win.getComputedStyle(doc.body || doc.documentElement);
	    const bodyBg = hostCssValue('--SmartThemeBodyColor', bodyStyle.backgroundColor || '#1f1f1f');
	    const text = hostCssValue('--SmartThemeTextColor', bodyStyle.color || '#f5f5f5');
	    const accent = hostCssValue('--SmartThemeQuoteColor', hostCssValue('--SmartThemeEmColor', '#8ab4f8'));
	    let panel = hostCssValue('--SmartThemeBlurTintColor', hostCssValue('--SmartThemeBotMesBlurTintColor', bodyBg));
	    const border = hostCssValue('--SmartThemeBorderColor', hostCssValue('--SmartThemeShadowColor', 'rgba(255,255,255,.22)'));
	    const textLum = relativeLuminanceFromCss(text);
	    const panelLum = relativeLuminanceFromCss(panel);
	    if (Math.abs(textLum - panelLum) < .18) panel = textLum > .55 ? '#172033' : '#FFFFFF';
	    root.style.setProperty('--wb-bg', bodyBg);
	    root.style.setProperty('--wb-panel', panel);
	    root.style.setProperty('--wb-soft', 'color-mix(in srgb, ' + panel + ' 78%, ' + accent + ' 22%)');
	    root.style.setProperty('--wb-text', text);
	    root.style.setProperty('--wb-sub', 'color-mix(in srgb, ' + text + ' 68%, ' + bodyBg + ' 32%)');
	    root.style.setProperty('--wb-border', border);
	    root.style.setProperty('--wb-accent', accent);
	    root.style.setProperty('--wb-accent2', hostCssValue('--SmartThemeEmColor', accent));
	    root.style.setProperty('--wb-on-accent', contrastTextForCss(accent, '#fff'));
	    root.style.setProperty('--wb-board', 'color-mix(in srgb, ' + bodyBg + ' 78%, ' + panel + ' 22%)');
	    root.style.setProperty('--wb-input', 'color-mix(in srgb, ' + panel + ' 86%, ' + bodyBg + ' 14%)');
	    root.style.setProperty('--wb-glow', 'color-mix(in srgb, ' + accent + ' 28%, transparent 72%)');
	    root.style.setProperty('--wb-screen', 'color-mix(in srgb, ' + bodyBg + ' 72%, ' + panel + ' 28%)');
	  }
	  function relativeLuminanceFromCss(color) {
	    const raw = String(color || '').trim();
	    const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
	    if(hex) {
	      const h = hex[1].length === 3 ? hex[1].split('').map(x => x + x).join('') : hex[1];
	      const vals = [0,2,4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4));
	      return vals[0] * .2126 + vals[1] * .7152 + vals[2] * .0722;
	    }
	    const m = raw.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
	    if(!m) return .5;
	    const vals = [1,2,3].map(i => {
	      const c = Number(m[i]) / 255;
	      return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4);
	    });
	    return vals[0] * .2126 + vals[1] * .7152 + vals[2] * .0722;
	  }
	  function customFonts() {
	    const cfg = settings();
	    return Array.isArray(cfg.customFonts) ? cfg.customFonts.filter(x => x && x.name && x.url) : [];
	  }
	  function selectedFontConfig(cfgOverride) {
	    const cfg = cfgOverride || settings();
	    const name = String(cfg.selectedFont || '').trim();
	    if (!name) return null;
	    return (Array.isArray(cfg.customFonts) ? cfg.customFonts : []).find(x => x && x.name === name && x.url) || null;
	  }
	  function applySelectedFont() {
      if (standalone) return;
	    const doc = getHostDocument();
	    const old = qs('#' + SCRIPT_ID + '-font-css', doc);
	    const font = selectedFontConfig();
	    if (!font) { if (old) old.remove(); return; }
	    const safeFamily = 'WanbanCustomFont_' + String(font.name).replace(/[^\w-]/g, '_');
	    const cssText = "@font-face{font-family:'" + safeFamily + "';src:url('" + String(font.url).replace(/['\\]/g, '') + "');font-display:swap;}#" + POPUP_ID + ",.wb-modal-mask{font-family:'" + safeFamily + "','Microsoft YaHei',system-ui,sans-serif!important;}";
	    const style = old || doc.createElement('style');
	    style.id = SCRIPT_ID + '-font-css';
	    style.textContent = cssText;
	    if (!old) doc.head.appendChild(style);
	  }
		  function isNightTheme(value) {
		    const t = value || settings().theme || 'day';
		    if (t === 'tavern') {
		      try {
		        const doc = getHostDocument();
		        return relativeLuminanceFromCss(hostCssValue('--SmartThemeBodyColor', getHostWindow().getComputedStyle(doc.body || doc.documentElement).backgroundColor)) < .35;
		      } catch(e) {
		        return false;
		      }
		    }
		    return t === 'night' || t === 'cyber' || t === 'card';
		  }
	  function canvasThemePalette() {
	    const t = settings().theme || 'day';
	    if (t === 'tavern') {
	      const popup = qs('#' + POPUP_ID);
	      const cs = popup ? getHostWindow().getComputedStyle(popup) : null;
	      const val = (name, fallback) => cs ? (cs.getPropertyValue(name).trim() || fallback) : fallback;
	      return { top:val('--wb-screen','#1f1f1f'), mid:val('--wb-board','#252525'), bottom:val('--wb-bg','#181818'), pattern:'rgba(255,255,255,.05)', grid:val('--wb-border','rgba(255,255,255,.18)'), border:val('--wb-accent','rgba(255,255,255,.34)'), text:val('--wb-text','#f5f5f5') };
	    }
    if (t === 'mono') return { top:'#f4f4f4', mid:'#dedede', bottom:'#c8c8c8', pattern:'rgba(0,0,0,.06)', grid:'rgba(0,0,0,.24)', border:'rgba(0,0,0,.48)', text:'#171717' };
    if (t === 'arcade') return { top:'#FFFFFF', mid:'#F3FBFF', bottom:'#D8F0FF', pattern:'rgba(43,148,209,.055)', grid:'rgba(43,148,209,.16)', border:'rgba(43,148,209,.28)', text:'#18364D' };
    if (t === 'spring') return { top:'#F4F1D3', mid:'#EAF6D4', bottom:'#D8EDB2', pattern:'rgba(111,168,90,.075)', grid:'rgba(76,59,42,.16)', border:'rgba(111,83,45,.32)', text:'#4C3B2A' };
    if (t === 'cyber') return { top:'#101A1D', mid:'#14201B', bottom:'#0D1512', pattern:'rgba(241,232,91,.07)', grid:'rgba(25,211,197,.18)', border:'rgba(241,232,91,.34)', text:'#F6F5DE' };
    if (t === 'card') return { top:'#18070A', mid:'#10080A', bottom:'#070304', pattern:'rgba(245,201,104,.06)', grid:'rgba(245,201,104,.16)', border:'rgba(245,201,104,.42)', text:'#F8EFE7' };
    if (t === 'night') return { top:'#1b1020', mid:'#211426', bottom:'#120b17', pattern:'rgba(244,194,215,.04)', grid:'rgba(244,194,215,.12)', border:'rgba(244,194,215,.16)', text:'#f7dce7' };
    return { top:'#fff1f5', mid:'#fde7ee', bottom:'#f8dce7', pattern:'rgba(216,112,147,.045)', grid:'rgba(174,82,115,.14)', border:'rgba(174,82,115,.18)', text:'#6f5b45' };
  }

  function modalMaskClass() { return 'wb-modal-mask ' + themeClass(); }
	  function appendModalMask(mask) {
	    const doc = getHostDocument();
	    const win = getHostWindow();
	    applySelectedFont();
	    applyTavernThemeVars(mask);
	    const shell = qs('#' + SHELL_ID, doc);
    const popup = qs('#' + POPUP_ID, doc);
    const mobile = (win.innerWidth || 800) <= 768;
    if (mobile && shell) {
      const vp = win.visualViewport || (typeof visualViewport !== 'undefined' ? visualViewport : null);
      const viewH = (vp && vp.height) || win.innerHeight || doc.documentElement.clientHeight || 600;
      const scrollTop = shell.scrollTop || 0;
      mask.style.top = scrollTop + 'px';
      mask.style.height = viewH + 'px';
      mask.style.bottom = 'auto';
      shell.style.overflowY = 'hidden';
    }
    const rawRemove = mask.remove.bind(mask);
    mask.remove = function() {
      rawRemove();
      if (shell && !qs('.wb-modal-mask', shell)) shell.style.overflowY = '';
    };
    (popup || doc.body).appendChild(mask);
    return mask;
  }
  let toastTimer = null;
  function toast(msg) {
    if (!standalone && typeof toastr !== 'undefined') { toastr.info(msg); return; }
    const doc = getHostDocument();
    let el = qs('#wanba-toast', doc);
    if (!el) { el = doc.createElement('div'); el.id = 'wanba-toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); doc.body.appendChild(el); }
    el.textContent = String(msg); el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3600);
  }
  function updateLineGenerationStatusUI() {
    const status = qs('#wb-line-generation-status');
    if (status) status.textContent = lineGenerationStatus;
    const batch = qs('#wb-batch-lines');
    if (batch) { batch.disabled = lineGenerationBusy && lineGenerationKind !== 'batch'; batch.textContent = lineGenerationBusy && lineGenerationKind === 'batch' ? '取消生成' : '批量生成角色数据'; }
    const single = qs('#wb-generate-lines');
    if (single) { single.disabled = lineGenerationBusy; single.textContent = lineGenerationBusy ? '生成中' : '生成'; }
    const modalStart = qs('#wb-batch-start');
    if (modalStart) { modalStart.disabled = lineGenerationBusy && lineGenerationKind !== 'batch'; if (lineGenerationBusy && lineGenerationKind === 'batch') modalStart.textContent = '取消生成'; }
  }
  function setLineGenerationStatus(text, busy) {
    lineGenerationStatus = text || '当前状态：空闲';
    lineGenerationBusy = !!busy;
    updateLineGenerationStatusUI();
  }
  function requestBatchLineGenerationCancel() {
    if (!lineGenerationBusy || lineGenerationKind !== 'batch') return;
    showConfirm('中断批量生成', '确定要中断当前批量生成吗？正在等待的这一次 AI 调用可能会先完成，之后不会继续生成后续游戏。', () => {
      batchLineGenerationCancel = true;
      setLineGenerationStatus('正在中断批量生成，等待当前调用结束...', true);
      toast('已请求中断批量生成');
    });
  }
  function makeLineGenerationProgress(label, total, onText) {
    let done = 0;
    const progress = detail => {
      if (!total) return;
      done += 1;
      const text = label + '：' + done + '/' + total + (detail ? '（' + detail + '）' : '');
      setLineGenerationStatus(text, true);
      if (onText) onText(text);
    };
    progress.done = () => done;
    return progress;
  }
  function hostValue(name) {
    const w = getHostWindow();
    try {
      const ctx = w.SillyTavern && typeof w.SillyTavern.getContext === 'function' ? w.SillyTavern.getContext() : null;
      if (ctx && ctx[name] !== undefined) return ctx[name];
    } catch(e) {}
    return w && w[name] !== undefined ? w[name] : (window[name] !== undefined ? window[name] : undefined);
  }
  let messageNotifyBound = false;
  let messageNotifyLastSignature = null;
  let messageNotifyRecent = { key:'', at:0 };
  let messageNotifyPollTimer = null;
  function pauseGameForMessageNotify() {
    if (!gameStarted || !currentGame || gamePaused) return;
    if ((GAME_META[currentGame] || {}).mode === 'double') return;
    commitGameActiveDuration(true);
    gamePaused = true;
    showGamePauseOverlay();
    const pbtn = qs('#wb-pause'); if (pbtn) pbtn.textContent = '继续';
  }
  function pauseGameForInactiveSurface() {
    if (!gameStarted || !currentGame || gamePaused) return;
    commitGameActiveDuration(true, true);
    gamePaused = true;
    gameActiveStartedAt = 0;
    showGamePauseOverlay();
    const pbtn = qs('#wb-pause'); if (pbtn) pbtn.textContent = '继续';
  }
  function notifyBeep() {
    try {
      const w = getHostWindow();
      const AudioContextCls = w.AudioContext || w.webkitAudioContext || window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCls) return false;
      const ctx = new AudioContextCls();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.34);
      return true;
    } catch(e) { return false; }
  }
  function extractTaggedBody(text) {
    const tag = (settings().messageNotifyTag || 'content').replace(/[<>/\s]/g, '') || 'content';
    const raw = String(text || '');
    const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'i');
    const match = raw.match(re);
    const body = (match ? match[1] : raw).replace(/<[^>]+>/g, '').trim();
    if (body.length <= 220) return body;
    const paragraphs = body.split(/\n{2,}|\r?\n/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const firstPart = paragraphs.length ? paragraphs.join('\n\n') : body.replace(/\s+/g, ' ').trim();
    return firstPart.slice(0, 200).trim();
  }
  function sendMessageFinishedNotification(messageId, text) {
    const cfg = settings();
    if (!cfg.messageNotify) return;
    const shell = qs('#' + SHELL_ID);
    if (!shell || !shell.classList.contains('wb-shell-visible') || !currentGame) return;
    const preview = extractTaggedBody(text) || 'RP正文已生成。';
    const stableKey = preview.replace(/\s+/g, '').slice(0, 160);
    const now = Date.now();
    if (stableKey && messageNotifyRecent.key === stableKey && now - messageNotifyRecent.at < 8000) return;
    const signature = String(messageId == null ? 'latest' : messageId) + '::' + preview;
    if (signature === messageNotifyLastSignature) return;
    messageNotifyLastSignature = signature;
    messageNotifyRecent = { key:stableKey, at:now };
    pauseGameForMessageNotify();
    notifyBeep();
    try { const nav = getHostWindow().navigator || navigator; if (nav && nav.vibrate) nav.vibrate([180, 80, 220]); } catch(e) {}
    showTextModal('RP正文完成提醒', preview);
  }
  function messageFromHost(messageId) {
    const w = getHostWindow();
    try {
      const getter = w.getChatMessages || window.getChatMessages;
      if (typeof getter === 'function') {
        const arr = getter(messageId);
        if (Array.isArray(arr) && arr[0]) return arr[0];
      }
    } catch(e) {}
    try {
      const ctx = w.SillyTavern && typeof w.SillyTavern.getContext === 'function' ? w.SillyTavern.getContext() : null;
      const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : null;
      if (chat && messageId != null && chat[messageId]) return chat[messageId];
      if (chat && chat.length) return chat[chat.length - 1];
    } catch(e) {}
    return null;
  }
  function primeMessageNotifyBaseline() {
    const msg = messageFromHost(null);
    if (!msg || !isAssistantMessage(msg)) return;
    const id = msg.id ?? msg.swipe_id ?? msg.send_date ?? 'latest';
    const text = String(msg.message || msg.mes || msg.text || '');
    const preview = extractTaggedBody(text) || '';
    if (preview) messageNotifyLastSignature = String(id) + '::' + preview;
  }
  function isAssistantMessage(msg) {
    if (!msg) return true;
    if (msg.role) return msg.role === 'assistant';
    if (msg.is_system) return false;
    if (msg.is_user === false) return true;
    return false;
  }
  function hostMessageStableKey(messageId, msg, text) {
    const raw = String(text || '');
    let hash = 5381;
    for (let i = 0; i < raw.length; i++) hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    const id = msg?.id ?? msg?.send_date ?? msg?.swipe_id ?? messageId ?? 'latest';
    return String(id) + ':' + raw.length + ':' + (hash >>> 0).toString(36);
  }
  function recordPetWalkRpGeneration(messageId, msg, text) {
    if (!settings().petDesktopEnabled || !String(text || '').trim()) return;
    let state = petTestState();
    if (state.stage === 'egg' || state.ended) return;
    const key = hostMessageStableKey(messageId, msg, text);
    if (!key || state.lastWalkRpMessageKey === key) return;
    state.lastWalkRpMessageKey = key;
    const total = Math.max(0, Number(state.walkRpGenerationCount || 0)) + 1;
    const rewards = Math.floor(total / 3);
    state.walkRpGenerationCount = total % 3;
    if (rewards > 0) {
      const before = Number(state.growth || 0);
      state.growth = Math.min(petStageCap(state.stage), before + rewards);
      const added = Math.max(0, Number(state.growth || 0) - before);
      const today = todayKey();
      const day = Object.assign({ feed:0, pet:0, poke:0, outing:0, play:0 }, state.days?.[today] || {});
      day.outing = Number(day.outing || 0) + rewards;
      day.growth = Number(day.growth || 0) + added;
      day.snapshot = petSnapshotData(state);
      state.days = Object.assign({}, state.days || {}, { [today]:day });
      petToastGrowth('遛弯阅读正文', added);
    }
    state = updatePetPendingStories(state, petTestInfoCache || { side_story:[] });
    savePetTestState(state);
  }
  function handleHostMessageReceived(messageId, type, countPetGrowth = true) {
    const msg = messageFromHost(messageId);
    if (!isAssistantMessage(msg)) return;
    const text = msg ? String(msg.message || msg.mes || msg.text || '') : '';
    if (countPetGrowth) recordPetWalkRpGeneration(messageId, msg, text);
    if (!settings().messageNotify) return;
    sendMessageFinishedNotification(messageId, text);
  }
  function bindMessageNotifyEvents() {
    if (messageNotifyBound) return;
    const w = getHostWindow();
    const eventSource = hostValue('eventSource');
    const eventTypes = hostValue('event_types') || hostValue('eventTypes') || hostValue('tavern_events') || {};
    const eventName = eventTypes.MESSAGE_RECEIVED || 'MESSAGE_RECEIVED';
    const updateNames = [eventTypes.MESSAGE_UPDATED, eventTypes.MESSAGE_SWIPED, eventTypes.CHARACTER_MESSAGE_RENDERED, 'MESSAGE_UPDATED', 'MESSAGE_SWIPED', 'CHARACTER_MESSAGE_RENDERED'].filter(Boolean);
    if (eventSource && typeof eventSource.on === 'function') {
      eventSource.on(eventName, handleHostMessageReceived);
      updateNames.forEach(name => { try { eventSource.on(name, (id, type) => handleHostMessageReceived(id, type, false)); } catch(e) {} });
      messageNotifyBound = true;
      startMessageNotifyPolling();
      return;
    }
    if (eventSource && typeof eventSource.addEventListener === 'function') {
      eventSource.addEventListener(eventName, e => handleHostMessageReceived(e && e.detail && e.detail.message_id, e && e.detail && e.detail.type));
      updateNames.forEach(name => { try { eventSource.addEventListener(name, e => handleHostMessageReceived(e && e.detail && e.detail.message_id, e && e.detail && e.detail.type, false)); } catch(err) {} });
      messageNotifyBound = true;
      startMessageNotifyPolling();
      return;
    }
    if (!w.__wanbanMessageNotifyRetry) {
      w.__wanbanMessageNotifyRetry = setInterval(() => {
        const es = hostValue('eventSource');
        if (es && typeof es.on === 'function') { clearInterval(w.__wanbanMessageNotifyRetry); w.__wanbanMessageNotifyRetry = null; bindMessageNotifyEvents(); }
      }, 2000);
    }
    startMessageNotifyPolling();
  }
  function startMessageNotifyPolling() {
    if (messageNotifyPollTimer) return;
    let pendingSig = '', pendingAt = 0;
    messageNotifyPollTimer = setInterval(() => {
      if (!settings().messageNotify && !settings().petDesktopEnabled) return;
      const msg = messageFromHost(null);
      if (!isAssistantMessage(msg)) return;
      const id = msg.id ?? msg.swipe_id ?? msg.send_date ?? 'latest';
      const text = String(msg.message || msg.mes || msg.text || '');
      if (!text.trim()) return;
      const sig = String(id) + '::' + text;
      if (sig !== pendingSig) { pendingSig = sig; pendingAt = Date.now(); return; }
      if (Date.now() - pendingAt >= 1400) handleHostMessageReceived(id, undefined, !messageNotifyBound);
    }, 1200);
  }

  function stopGame() { if (activeGameController) { try { activeGameController.save?.(); activeGameController.destroy?.(); } catch(e) {} activeGameController = null; } flushAllProgressSaves(); commitGameActiveDuration(true); clearGameDurationRewardTimer(); if (snakeTimer) clearInterval(snakeTimer); if (tetrisTimer) clearInterval(tetrisTimer); if (watermelonTimer) clearInterval(watermelonTimer); if (jumpTimer) clearInterval(jumpTimer); if (screwTimer) clearInterval(screwTimer); if (linkLinkTimer) clearInterval(linkLinkTimer); if (shuerteTimer) clearInterval(shuerteTimer); if (randomLineTimer) clearInterval(randomLineTimer); if (singleDialogueTimer) clearTimeout(singleDialogueTimer); snakeTimer = tetrisTimer = watermelonTimer = jumpTimer = screwTimer = linkLinkTimer = shuerteTimer = randomLineTimer = null; singleDialogueTimer = null; singleDialogueQueue = null; firstMoverAwaitingUserAction = false; hideGamePauseOverlay(); getHostDocument().onkeydown = null; gameStarted = false; gamePaused = true; gameActiveStartedAt = 0; }
  function showGamePauseOverlay() {
    const box = qs('#wb-gamebox');
    if (!box || qs('#wb-pause-overlay', box)) return;
    const div = getHostDocument().createElement('div');
    div.className = 'wb-pause-overlay';
    div.id = 'wb-pause-overlay';
    div.innerHTML = '<span>PAUSE</span>';
    box.appendChild(div);
  }
  function hideGamePauseOverlay() {
    const old = qs('#wb-pause-overlay');
    if (old) old.remove();
  }

  function fitGameSurface() {
    const box = qs('#wb-gamebox');
    if (!box) return;
	    const shell = qs('.wb-tetris-shell, .wb-snake-shell', box);
	    const playfield = shell ? qs('.wb-tetris-playfield, .wb-snake-playfield', shell) : null;
	    const target = playfield || shell || box;
    const rect = target.getBoundingClientRect();
    const controls = shell ? qs('.wb-tetris-controls, .wb-snake-controls', shell) : null;
    const controlsRect = controls && getHostWindow().getComputedStyle(controls).display !== 'none' ? controls.getBoundingClientRect() : null;
    const padX = 2;
    const padY = 2;
    const tetrisControls = controlsRect && controls?.classList.contains('wb-tetris-controls');
    const snakeControls = controlsRect && controls?.classList.contains('wb-snake-controls');
    const maxW = Math.max(0, rect.width - padX - (tetrisControls ? controlsRect.width + 8 : 0));
    const maxH = Math.max(0, rect.height - padY - (snakeControls ? controlsRect.height + 8 : 0));
    if (maxW < 20 || maxH < 20) return;
    const canvas = qs('canvas.wb-canvas', box);
    if (canvas) {
      const rawW = canvas.width || 300;
      const rawH = canvas.height || rawW;
      const allowGrow = canvas.classList.contains('wb-snake-canvas') && getHostWindow().matchMedia('(max-width: 768px)').matches;
      const scale = Math.min(maxW / rawW, maxH / rawH, allowGrow ? 10 : 1);
      canvas.style.width = Math.floor(rawW * scale) + 'px';
      canvas.style.height = Math.floor(rawH * scale) + 'px';
      return;
    }
    const square = qs('.wb-ludo', box);
    if (square) {
      const isLudo = square.classList.contains('wb-ludo');
      const mobile = getHostWindow().matchMedia && getHostWindow().matchMedia('(max-width: 700px)').matches;
      const ludoInfo = isLudo ? qs('.wb-ludo-info', box) : null;
      const ludoInfoRect = ludoInfo ? ludoInfo.getBoundingClientRect() : null;
      const limitedH = isLudo ? Math.max(0, maxH - (ludoInfoRect ? ludoInfoRect.height + 12 : 0)) : maxH;
      const side = Math.floor(Math.min(maxW - (isLudo && mobile ? 12 : 0), limitedH, isLudo ? (mobile ? 310 : 460) : Infinity));
      square.style.width = side + 'px';
      if (isLudo) {
        square.style.height = side + 'px';
      }
    }
  }
  function scheduleFitGameSurface() {
    const win = getHostWindow();
    const raf = win.requestAnimationFrame ? win.requestAnimationFrame.bind(win) : (fn) => setTimeout(fn, 16);
    raf(() => fitGameSurface());
    setTimeout(fitGameSurface, 80);
  }

  function injectStyle() {
    if (qs('#' + STYLE_ID)) return;
    const css = getHostDocument().createElement('style');
    css.id = STYLE_ID;
    css.textContent = `
      #${SHELL_ID}, #${SHELL_ID} * { box-sizing: border-box; }
      #${SHELL_ID} {
        display:none;
        position:fixed;
        inset:0;
        width:100%;
	        height:100vh;
	        height:var(--wb-vvh, 100dvh);
	        min-height:100vh;
        z-index:999999;
        background:rgba(0,0,0,.45);
        backdrop-filter:blur(3px);
        -webkit-backdrop-filter:blur(3px);
        overscroll-behavior:contain;
      }
      #${SHELL_ID}.wb-shell-visible { display:flex; justify-content:center; align-items:stretch; padding:calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px)); }
      #${SHELL_ID}.wb-open-guard::after {
        content:'';
        position:fixed;
        inset:0;
        z-index:1000003;
        background:transparent;
        pointer-events:auto;
      }
      #${POPUP_ID}, #${POPUP_ID} *,
      .wb-modal-mask, .wb-modal-mask * {
        writing-mode:horizontal-tb;
        text-orientation:mixed;
      }
      #${POPUP_ID} :is(.wb-switch,.wb-btn,.wb-tab,.wb-iconbtn,.wb-pill,.wb-tag,label,span),
      .wb-modal-mask :is(.wb-switch,.wb-btn,.wb-tab,.wb-iconbtn,.wb-pill,.wb-tag,label,span) {
        word-break:keep-all;
        overflow-wrap:normal;
      }
      #${FLOAT_ID} {
        position:fixed;
        left:18px;
        top:180px;
        width:54px;
        height:54px;
        z-index:999998;
        border:1px solid rgba(255,255,255,.75);
        border-radius:999px;
        background:url('${APP_ICON_URL}') center / cover no-repeat, linear-gradient(135deg, #ff7aa8, #6bc8ff);
        box-shadow:0 10px 26px rgba(0,0,0,.28), 0 0 0 3px rgba(255,255,255,.24);
        cursor:grab;
        touch-action:none;
        padding:0;
        outline:none;
      }
      #${FLOAT_ID}:hover { transform:translateY(-1px); box-shadow:0 14px 30px rgba(0,0,0,.32), 0 0 0 3px rgba(255,255,255,.32); }
      #${FLOAT_ID}.dragging { cursor:grabbing; transform:scale(.98); }

      #${POPUP_ID}.wb-cardtheater {
        background:
          radial-gradient(circle at 50% -16%, rgba(201,24,43,.34), transparent 34%),
          radial-gradient(circle at 112% 12%, rgba(245,201,104,.10), transparent 26%),
          repeating-linear-gradient(45deg, rgba(255,255,255,.025) 0 1px, transparent 1px 7px),
          linear-gradient(180deg, #160609 0%, #080304 62%, #040203 100%);
        border:1px solid rgba(245,201,104,.46);
        border-top:3px solid #C9182B;
        box-shadow:0 26px 76px rgba(0,0,0,.72), 0 0 0 1px rgba(255,255,255,.04) inset, 0 0 44px rgba(201,24,43,.22);
        font-family:'WanbanCardTheater','LXGW WenKai','霞鹜文楷','霞鹜文楷 GB',Georgia,'Noto Serif SC','Microsoft YaHei',serif;
      }
      #${POPUP_ID}.wb-cardtheater::before,
      .wb-modal-mask.wb-cardtheater .wb-modal::before,
      #${POPUP_ID}.wb-cardtheater .wb-panel::before,
      #${POPUP_ID}.wb-cardtheater .wb-game-card::after {
        content:'♠  ♥  ♦  ♣';
        position:absolute;
        pointer-events:none;
        color:rgba(245,201,104,.08);
        font-weight:900;
        letter-spacing:10px;
        white-space:nowrap;
      }
      #${POPUP_ID}.wb-cardtheater::before { right:18px; bottom:10px; font-size:42px; transform:rotate(-7deg); opacity:.72; }
      #${POPUP_ID}.wb-cardtheater .wb-head {
        position:relative;
        background:
          linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.10)),
          linear-gradient(90deg, rgba(20,6,8,.94), rgba(70,9,16,.78) 48%, rgba(12,5,6,.94));
        border-bottom:1px solid rgba(245,201,104,.34);
        box-shadow:0 1px 0 rgba(255,255,255,.08) inset, 0 10px 24px rgba(0,0,0,.22);
      }
      #${POPUP_ID}.wb-cardtheater :is(.wb-title,.wb-tab,.wb-btn,.wb-iconbtn,.wb-pill,.wb-tag,.wb-input,.wb-select,.wb-textarea,.wb-modal-title),
      .wb-modal-mask.wb-cardtheater :is(.wb-modal,.wb-modal-title,.wb-btn,.wb-iconbtn,.wb-pill,.wb-tag,.wb-input,.wb-select,.wb-textarea) {
        font-family:'WanbanCardTheater','LXGW WenKai','霞鹜文楷','霞鹜文楷 GB',Georgia,'Noto Serif SC','Microsoft YaHei',serif;
      }
      #${POPUP_ID}.wb-cardtheater .wb-title { color:#F8EFE7; text-shadow:0 0 10px rgba(201,24,43,.46); }
      #${POPUP_ID}.wb-cardtheater .wb-title::before { content:''; width:22px; height:22px; margin-right:0; border-radius:5px; border:1px solid rgba(245,201,104,.58); background:url('${APP_ICON_URL}') center / cover no-repeat, linear-gradient(135deg,#C9182B,#0D0708); box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 0 12px rgba(201,24,43,.24); }
      #${POPUP_ID}.wb-cardtheater .wb-title::after { width:100%; height:1px; background:linear-gradient(90deg, #F5C968, #C9182B, transparent); opacity:.9; }
      #${POPUP_ID}.wb-cardtheater .wb-head-meta span {
        color:#F8EFE7;
        background:linear-gradient(180deg, rgba(245,201,104,.12), rgba(0,0,0,.18));
        border-color:rgba(245,201,104,.42);
        box-shadow:0 1px 0 rgba(255,255,255,.08) inset;
      }
      #${POPUP_ID}.wb-cardtheater .wb-head-meta i { color:#F5C968; }
      #${POPUP_ID}.wb-cardtheater .wb-tabs {
        border-color:rgba(245,201,104,.40);
        background:linear-gradient(180deg, rgba(245,201,104,.08), rgba(0,0,0,.20));
        box-shadow:0 0 0 1px rgba(255,255,255,.04) inset;
        overflow:hidden;
      }
      #${POPUP_ID}.wb-cardtheater .wb-tabs .wb-tab {
        color:#D5BBA5;
        background:transparent;
        border-right:1px solid rgba(245,201,104,.22);
        text-shadow:none;
      }
      #${POPUP_ID}.wb-cardtheater .wb-tabs .wb-tab:nth-child(1)::before { content:'♠'; color:#F8EFE7; opacity:.82; }
      #${POPUP_ID}.wb-cardtheater .wb-tabs .wb-tab:nth-child(2)::before { content:'♥'; color:#FF3048; opacity:.82; }
      #${POPUP_ID}.wb-cardtheater .wb-tabs .wb-tab:nth-child(3)::before { content:'♦'; color:#F5C968; opacity:.82; }
      #${POPUP_ID}.wb-cardtheater .wb-tabs .wb-tab:nth-child(4)::before { content:'♣'; color:#F8EFE7; opacity:.82; }
      #${POPUP_ID}.wb-cardtheater .wb-tabs .wb-tab.active {
        color:#FFF8F0;
        background:linear-gradient(180deg, #C9182B, #7A1019 56%, #3A0710);
        box-shadow:0 10px 20px rgba(201,24,43,.30), 0 1px 0 rgba(255,255,255,.20) inset, 0 -1px 0 rgba(245,201,104,.55) inset;
      }
      #${POPUP_ID}.wb-cardtheater .wb-body {
        background:
          radial-gradient(circle at 18% 8%, rgba(201,24,43,.18), transparent 22%),
          repeating-linear-gradient(90deg, rgba(245,201,104,.025) 0 1px, transparent 1px 18px),
          linear-gradient(180deg, rgba(255,255,255,.025), transparent 30%);
      }
      #${POPUP_ID}.wb-cardtheater :is(.wb-btn,.wb-iconbtn,.wb-pill,.wb-tag),
      .wb-modal-mask.wb-cardtheater :is(.wb-btn,.wb-iconbtn,.wb-pill,.wb-tag) {
        color:#F8EFE7;
        background:linear-gradient(180deg, #201014, #0D0708);
        border:1px solid rgba(245,201,104,.38);
        border-radius:5px;
        box-shadow:0 8px 18px rgba(0,0,0,.30), inset 0 1px 0 rgba(255,255,255,.08), inset 0 -1px 0 rgba(201,24,43,.28);
        text-shadow:0 1px 1px rgba(0,0,0,.55);
        max-width:100%;
      }
      #${POPUP_ID}.wb-cardtheater :is(.wb-btn.primary,.wb-tab.active,.wb-tag.active),
      .wb-modal-mask.wb-cardtheater :is(.wb-btn.primary,.wb-tab.active,.wb-tag.active) {
        color:#FFF8F0;
        background:linear-gradient(135deg, #E12A3B, #A30F20 58%, #4A0710);
        border-color:rgba(245,201,104,.68);
        box-shadow:0 12px 24px rgba(201,24,43,.34), 0 0 0 1px rgba(255,255,255,.06) inset, inset 0 1px 0 rgba(255,255,255,.22);
      }
      #${POPUP_ID}.wb-cardtheater :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-game-card):hover,
      .wb-modal-mask.wb-cardtheater :is(.wb-btn,.wb-iconbtn,.wb-tab):hover {
        border-color:rgba(245,201,104,.74);
        filter:brightness(1.07);
        box-shadow:0 14px 28px rgba(0,0,0,.36), 0 0 18px rgba(201,24,43,.24), inset 0 1px 0 rgba(255,255,255,.10);
      }
      #${POPUP_ID}.wb-cardtheater :is(.wb-input,.wb-select,.wb-textarea),
      .wb-modal-mask.wb-cardtheater :is(.wb-input,.wb-select,.wb-textarea) {
        color:#F8EFE7;
        background:linear-gradient(180deg, #100708, #080405);
        border:1px solid rgba(245,201,104,.36);
        border-radius:5px;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.045);
      }
      #${POPUP_ID}.wb-cardtheater :is(.wb-input,.wb-select,.wb-textarea)::placeholder,
      .wb-modal-mask.wb-cardtheater :is(.wb-input,.wb-select,.wb-textarea)::placeholder { color:rgba(213,187,165,.62); }
      #${POPUP_ID}.wb-cardtheater :is(.wb-input,.wb-select,.wb-textarea):focus,
      .wb-modal-mask.wb-cardtheater :is(.wb-input,.wb-select,.wb-textarea):focus { outline:0; border-color:#F5C968; box-shadow:0 0 0 2px rgba(245,201,104,.16), 0 0 16px rgba(201,24,43,.18); }
      #${POPUP_ID}.wb-cardtheater .wb-panel,
      .wb-modal-mask.wb-cardtheater :is(.wb-api-status,.wb-worldbook-list,.wb-sticky-actions,.wb-record-table-wrap) {
        position:relative;
        overflow:hidden;
        color:#F8EFE7;
        background:
          linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.10)),
          radial-gradient(circle at 100% 0%, rgba(201,24,43,.13), transparent 34%),
          #13080A;
        border:1px solid rgba(245,201,104,.34);
        border-top-color:rgba(245,201,104,.58);
        border-radius:8px;
        box-shadow:0 14px 32px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.035) inset;
      }
      #${POPUP_ID}.wb-cardtheater .wb-panel::before { right:10px; top:6px; font-size:22px; letter-spacing:5px; opacity:.70; }
      #${POPUP_ID}.wb-cardtheater .wb-section-title,
      .wb-modal-mask.wb-cardtheater .wb-section-title { color:#F5C968; border-color:rgba(245,201,104,.28); text-shadow:0 1px 0 rgba(0,0,0,.48); }
      #${POPUP_ID}.wb-cardtheater .wb-section-title::before { content:'♠ '; color:#F5C968; background:transparent; box-shadow:none; text-shadow:0 0 10px rgba(245,201,104,.30); }
      #${POPUP_ID}.wb-cardtheater .wb-section-title.no-mark::before { content:''; }
      #${POPUP_ID}.wb-cardtheater .wb-muted,
      .wb-modal-mask.wb-cardtheater .wb-muted { color:#D5BBA5; }
      #${POPUP_ID}.wb-cardtheater .wb-game-card {
        border:1px solid rgba(245,201,104,.34);
        border-left:1px solid rgba(245,201,104,.34);
        border-radius:7px;
        background:
          radial-gradient(circle at 15% 20%, rgba(255,255,255,.06), transparent 20%),
          linear-gradient(145deg, rgba(34,12,15,.92), rgba(9,4,5,.96) 56%, rgba(63,8,15,.58));
        box-shadow:0 18px 38px rgba(0,0,0,.38), 0 0 0 1px rgba(255,255,255,.04) inset;
      }
      #${POPUP_ID}.wb-cardtheater .wb-game-card::before { border-top:2px solid rgba(245,201,104,.62); }
      #${POPUP_ID}.wb-cardtheater .wb-game-card::after { right:10px; bottom:6px; font-size:20px; letter-spacing:5px; transform:rotate(-8deg); }
      #${POPUP_ID}.wb-cardtheater .wb-game-card:hover { transform:translateY(-4px) rotate(-.35deg); border-color:rgba(245,201,104,.72); box-shadow:0 22px 44px rgba(0,0,0,.46), 0 0 26px rgba(201,24,43,.28); }
      #${POPUP_ID}.wb-cardtheater .wb-game-icon {
        border-radius:5px;
        border:1px solid rgba(245,201,104,.45);
        background:linear-gradient(135deg, #C9182B, #26080D 62%, #F5C968);
        box-shadow:0 12px 24px rgba(201,24,43,.26), inset 0 1px 0 rgba(255,255,255,.20);
      }
      #${POPUP_ID}.wb-cardtheater .wb-game-icon.has-image { background:#0E0708; }
      #${POPUP_ID}.wb-cardtheater .wb-game-name { color:#FFF8F0; text-shadow:0 1px 0 rgba(0,0,0,.55); }
      #${POPUP_ID}.wb-cardtheater .wb-tab-count,
      #${POPUP_ID}.wb-cardtheater :is(.badge,.left,.wb-popstar-badge,.wb-sudoku-badge),
      .wb-modal-mask.wb-cardtheater .wb-tab-count {
        color:#120608;
        background:radial-gradient(circle at 30% 25%, #FFF8F0, #F5C968 58%, #B88A3B);
        border:1px solid rgba(255,248,240,.58);
        text-shadow:none;
      }
      .wb-modal-mask.wb-cardtheater { background:radial-gradient(circle at 50% 16%, rgba(201,24,43,.24), transparent 35%), rgba(0,0,0,.88); }
      .wb-modal-mask.wb-cardtheater .wb-modal {
        position:relative;
        color:#F8EFE7;
        background:
          linear-gradient(180deg, rgba(92,10,18,.30), transparent 88px),
          repeating-linear-gradient(45deg, rgba(245,201,104,.028) 0 1px, transparent 1px 8px),
          linear-gradient(180deg, #17090B, #080304);
        border:1px solid rgba(245,201,104,.54);
        border-top:3px solid #C9182B;
        border-radius:8px;
        box-shadow:0 24px 70px rgba(0,0,0,.66), 0 0 34px rgba(201,24,43,.22), inset 0 0 0 1px rgba(255,255,255,.04);
      }
      .wb-modal-mask.wb-cardtheater .wb-modal::before { right:16px; top:12px; font-size:24px; opacity:.95; }
      .wb-modal-mask.wb-cardtheater .wb-modal-title {
        color:#F5C968;
        border-bottom:1px solid rgba(245,201,104,.30);
        text-shadow:0 1px 0 rgba(0,0,0,.56);
      }
      .wb-modal-mask.wb-cardtheater .wb-modal-title::before { content:'♠ '; color:#F8EFE7; }
      .wb-modal-mask.wb-cardtheater .wb-modal-title::after { content:' ♥'; color:#FF3048; }
      .wb-modal-mask.wb-cardtheater .wb-sticky-actions {
        position:sticky;
        bottom:-18px;
        z-index:6;
        overflow:visible;
        margin:12px -22px -18px;
        padding:10px 22px;
        background:linear-gradient(180deg, rgba(19,8,10,.82), #080304 72%);
        border:0;
        border-top:1px solid rgba(245,201,104,.48);
        border-radius:0 0 8px 8px;
        box-shadow:0 -10px 24px rgba(0,0,0,.32), 0 -1px 0 rgba(255,255,255,.04) inset;
      }
      .wb-modal-mask.wb-cardtheater table,
      .wb-modal-mask.wb-cardtheater th,
      .wb-modal-mask.wb-cardtheater td { color:#F8EFE7; border-color:rgba(245,201,104,.24); }
      .wb-modal-mask.wb-cardtheater th { color:#F5C968; background:rgba(245,201,104,.08); }
      #${POPUP_ID}.wb-cardtheater :is(.wb-switch,.wb-field label,label),
      .wb-modal-mask.wb-cardtheater :is(.wb-switch,.wb-field label,label) { color:#F8EFE7; }
      #${POPUP_ID}.wb-cardtheater input[type="checkbox"] { accent-color:#C9182B; }
      @media (max-width: 768px) {
        #${FLOAT_ID} {
          width:36px;
          height:36px;
          box-shadow:0 8px 18px rgba(0,0,0,.26), 0 0 0 2px rgba(255,255,255,.24);
        }
      }
      #${PET_FLOAT_ID}, #${PET_FLOAT_ID} * { box-sizing:border-box; }
      #${PET_FLOAT_ID} {
        position:fixed;
        left:78px;
        top:240px;
        width:104px;
        height:104px;
        z-index:999998;
        overflow:visible!important;
        touch-action:none;
        cursor:grab;
        user-select:none;
        -webkit-user-select:none;
        -webkit-touch-callout:none;
      }
      #${PET_FLOAT_ID}.dragging { cursor:grabbing; }
      .wb-pet-desk-fox {
        width:104px;
        height:104px;
        padding:0;
        border:0;
        background:transparent;
        display:grid;
        place-items:center;
        cursor:inherit;
        filter:drop-shadow(0 12px 18px rgba(0,0,0,.28));
      }
      .wb-pet-desk-menu {
        position:absolute;
        left:50%;
        bottom:98px;
        transform:translateX(-50%);
        display:none;
        gap:8px;
        align-items:center;
        justify-content:center;
        pointer-events:auto;
      }
      #${PET_FLOAT_ID}.menu-open .wb-pet-desk-menu { display:flex; }
      .wb-pet-round {
        width:42px;
        height:42px;
        border-radius:999px;
        border:2px solid rgba(255,255,255,.9);
        background:color-mix(in srgb, var(--wb-panel, #fff) 78%, var(--wb-accent, #c65b7c) 22%);
        color:var(--wb-text, #2f2430);
        box-shadow:0 10px 22px rgba(0,0,0,.24);
        display:grid;
        place-items:center;
        padding:0;
        font-size:21px;
        line-height:1;
        cursor:pointer;
      }
      .wb-pet-round:hover { transform:translateY(-1px); }
      .wb-pet-desk-speech {
        display:none;
      }
      #${PET_FLOAT_ID}.talk-on .wb-pet-desk-speech {
        display:block;
        position:absolute;
        left:50%;
        bottom:108px;
        transform:translateX(-50%);
        min-width:150px;
        max-width:230px;
        padding:7px 9px;
        border:1px solid rgba(255,255,255,.76);
        background:rgba(255,255,255,.9);
        color:#2f2430;
        font-size:12px;
        font-weight:800;
        line-height:1.45;
        box-shadow:0 10px 22px rgba(0,0,0,.22);
        pointer-events:none;
      }
      .wb-pet-fox {
        width:100%;
        aspect-ratio:1 / 1;
        background-image:var(--wb-pet-sprite);
        background-repeat:no-repeat;
        background-size:400% 100%;
        background-position:0 0;
        image-rendering:auto;
      }
      .wb-pet-asset, .wb-pet-egg-img {
        display:block;
        width:100%;
        height:100%;
        object-fit:contain;
        image-rendering:auto;
      }
      .wb-pet-fox.animating { animation:wbPetFoxFrames 2s step-end 1; }
      @keyframes wbPetFoxFrames {
        0%, 24.999% { background-position:0 0; }
        25%, 49.999% { background-position:33.333% 0; }
        50%, 74.999% { background-position:66.666% 0; }
        75%, 100% { background-position:100% 0; }
      }
      @media (max-width: 768px) {
        #${PET_FLOAT_ID}, .wb-pet-desk-fox { width:86px; height:86px; }
        .wb-pet-desk-menu { bottom:82px; }
        .wb-pet-round { width:38px; height:38px; font-size:19px; }
        .wb-pet-desk-speech { display:none; }
      }
      /* Desktop pet mode: radial pixel/frosted controls, panels and ball game. */
      #${PET_FLOAT_ID}{width:110px;height:110px;z-index:1000002;}
      .wb-pet-desk-fox{width:110px;height:110px;border:0!important;background:transparent!important;box-shadow:none!important;}
      .wb-pet-desk-menu,.wb-pet-desk-submenu{position:absolute;left:50%;top:50%;width:1px;height:1px;display:block!important;transform:translate(-50%,-50%);pointer-events:none;}
      .wb-pet-desk-menu .wb-pet-round,.wb-pet-desk-submenu .wb-pet-round{position:absolute;left:0;top:0;opacity:0;transform:translate(-50%,-50%) scale(.42) rotate(-10deg);pointer-events:none;transition:transform .22s cubic-bezier(.2,1.35,.35,1),opacity .16s ease;}
      #${PET_FLOAT_ID}.menu-open .wb-pet-desk-menu .wb-pet-round,#${PET_FLOAT_ID}.interact-open .wb-pet-desk-submenu .wb-pet-round{opacity:1;pointer-events:auto;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(1) rotate(0);}
      .wb-pet-desk-menu .wb-pet-round:nth-child(1){--dx:-76px;--dy:-62px;transition-delay:.02s}.wb-pet-desk-menu .wb-pet-round:nth-child(2){--dx:0px;--dy:-90px;transition-delay:.05s}.wb-pet-desk-menu .wb-pet-round:nth-child(3){--dx:76px;--dy:-62px;transition-delay:.08s}.wb-pet-desk-menu .wb-pet-round:nth-child(4){--dx:104px;--dy:10px;transition-delay:.11s}
      .wb-pet-desk-submenu .wb-pet-round:nth-child(1){--dx:-76px;--dy:-24px;transition-delay:.02s}.wb-pet-desk-submenu .wb-pet-round:nth-child(2){--dx:-76px;--dy:3px;transition-delay:.05s}.wb-pet-desk-submenu .wb-pet-round:nth-child(3){--dx:-76px;--dy:30px;transition-delay:.08s}
      .wb-pet-round{width:43px!important;height:43px!important;border-radius:999px!important;border:1px solid rgba(255,255,255,.92)!important;background:rgba(255,255,255,.76)!important;color:#415466!important;box-shadow:0 6px 16px rgba(83,105,130,.18),inset 0 0 0 1px rgba(255,255,255,.65)!important;backdrop-filter:blur(10px) saturate(1.15);-webkit-backdrop-filter:blur(10px) saturate(1.15);font-size:0!important;display:grid!important;place-items:center!important;}
      .wb-pet-round svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;}
      .wb-pet-desk-panel{position:absolute;left:50%;top:105px;width:224px;max-height:158px;transform:translateX(-50%);padding:9px;border:1px solid rgba(255,255,255,.82);background:rgba(255,255,255,.74);color:#2f3b46;box-shadow:0 10px 28px rgba(58,74,92,.18),inset 0 0 0 1px rgba(255,255,255,.58);backdrop-filter:blur(12px) saturate(1.18);-webkit-backdrop-filter:blur(12px) saturate(1.18);display:none;overflow:auto;image-rendering:pixelated;z-index:2;}
      .wb-pet-desk-chat{z-index:4}.wb-pet-desk-status{z-index:3}
      #${PET_FLOAT_ID}.status-on .wb-pet-desk-status,#${PET_FLOAT_ID}.chat-on .wb-pet-desk-chat{display:block;}#${PET_FLOAT_ID}.status-on.chat-on .wb-pet-desk-status{top:105px;}#${PET_FLOAT_ID}.status-on.chat-on .wb-pet-desk-chat{top:190px;}
      .wb-pet-desk-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;font-size:12px;font-weight:900;color:#61748a}.wb-pet-desk-close{width:22px;height:22px;border-radius:999px;border:1px solid rgba(100,125,148,.25);background:rgba(255,255,255,.7);color:#61748a;display:grid;place-items:center;padding:0;cursor:pointer}.wb-pet-desk-stats{display:grid;gap:5px;font-size:12px;line-height:1.35}.wb-pet-desk-bar{height:7px;border:1px solid rgba(80,103,125,.28);background:rgba(235,243,250,.78);overflow:hidden}.wb-pet-desk-bar span{display:block;height:100%;width:var(--v);background:#9bc7ef}.wb-pet-desk-chat{max-height:150px}.wb-pet-desk-chat-actions{display:flex;gap:5px;margin-bottom:6px}.wb-pet-desk-chat-actions button{flex:1;min-height:25px;border:1px solid rgba(100,125,148,.24);background:rgba(255,255,255,.72);color:#415466;font-size:11px;font-weight:900;padding:2px 5px;cursor:pointer}.wb-pet-desk-chat-text{min-height:44px;max-height:88px;overflow:auto;font-size:12px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}.wb-pet-ball-score{position:fixed;left:50%;top:14px;z-index:1000000;transform:translateX(-50%);padding:7px 12px;border:1px solid rgba(255,255,255,.86);background:rgba(255,255,255,.78);color:#415466;box-shadow:0 8px 22px rgba(58,74,92,.18);backdrop-filter:blur(10px);font-weight:900;pointer-events:none}.wb-pet-ball{position:fixed;left:0;top:0;z-index:999999;width:28px;height:28px;border-radius:999px;background:radial-gradient(circle at 32% 28%,#fff 0 12%,#ffe08a 13% 34%,#ff9c76 35% 100%);border:1px solid rgba(255,255,255,.86);box-shadow:0 6px 16px rgba(80,62,28,.20);pointer-events:none;will-change:transform;contain:layout style paint;transform:translate3d(-40px,-40px,0)}
      #wb-pet-desktop-chat-mask{position:fixed!important;inset:0!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100dvh!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:18px!important;box-sizing:border-box!important;z-index:1000006!important;}
      #wb-pet-desktop-chat-mask .wb-pet-modal{position:relative!important;margin:0 auto!important;transform:none!important;max-height:calc(100dvh - 36px)!important;}
      .wb-pet-desk-menu .wb-pet-round{width:46px!important;height:30px!important;border-radius:12px!important;font-size:11px!important;font-weight:900;letter-spacing:0;color:#263746!important;}
      .wb-pet-desk-submenu .wb-pet-round{width:42px!important;height:22px!important;border-radius:7px!important;font-size:10px!important;font-weight:900!important;letter-spacing:0!important;color:#263746!important;}
      .wb-pet-desk-submenu .wb-pet-round svg{display:none!important}
      .wb-pet-desk-panel{width:196px;max-height:116px;padding:6px;}
      .wb-pet-desk-panel-head{margin-bottom:3px;font-size:11px}.wb-pet-desk-close{width:18px;height:18px;border:0!important;background:transparent!important;box-shadow:none!important;color:#111!important;font-size:13px;line-height:1}.wb-pet-desk-close svg{display:none}.wb-pet-desk-stats{gap:3px;font-size:11px}.wb-pet-desk-stat-row{display:grid;grid-template-columns:42px minmax(0,1fr);align-items:center;gap:4px}.wb-pet-desk-stat-row b{font-size:10px}.wb-pet-desk-bar{height:5px}.wb-pet-desk-chat-actions{display:flex;align-items:center;gap:3px;margin-bottom:4px}.wb-pet-desk-chat-title{flex:1;font-size:11px;font-weight:900;color:#61748a;white-space:nowrap}.wb-pet-desk-chat-actions button{flex:0 0 auto;min-height:18px!important;height:18px;font-size:10px;padding:0 4px;border-radius:6px}.wb-pet-desk-chat-actions button[data-pet-chat=close]{flex:0 0 22px;border:0!important;background:transparent!important;box-shadow:none!important;color:#111!important;font-size:13px}.wb-pet-desk-chat-actions button[data-pet-chat=close] svg{display:none}.wb-pet-desk-chat-text{min-height:42px;max-height:74px;overflow-y:auto!important;overflow-x:hidden;font-size:11px;line-height:1.34;padding:4px;border:1px solid rgba(100,125,148,.18);background:rgba(255,255,255,.52);white-space:pre-wrap;overflow-wrap:anywhere;-webkit-overflow-scrolling:touch}.wb-pet-desk-panel *{touch-action:auto}
      #${PET_FLOAT_ID}.speech-on .wb-pet-desk-speech{display:block!important;position:absolute;right:calc(100% + 8px);left:auto;top:34px;bottom:auto;transform:none;min-width:86px;max-width:132px;padding:4px 6px;border:2px solid #fff;border-radius:9px;background:#fff;color:#2b2137;box-shadow:0 0 0 1px rgba(43,33,55,.8),0 3px 0 rgba(0,0,0,.12);font-size:10px;font-weight:900;line-height:1.18;pointer-events:none;white-space:normal;overflow-wrap:anywhere;z-index:4;}
      #${PET_FLOAT_ID}.speech-on .wb-pet-desk-speech:after{content:'';position:absolute;right:-7px;top:18px;border-width:5px 0 5px 7px;border-style:solid;border-color:transparent transparent transparent #fff;}
      #${PET_FLOAT_ID}.speech-on.speech-right .wb-pet-desk-speech{left:calc(100% + 8px);right:auto;}
      #${PET_FLOAT_ID}.speech-on.speech-right .wb-pet-desk-speech:after{left:-7px;right:auto;border-width:5px 7px 5px 0;border-color:transparent #fff transparent transparent;}
      #${PET_FLOAT_ID}.speech-on .wb-pet-desk-speech{border:1px solid #000!important;box-shadow:0 2px 0 rgba(0,0,0,.12)!important}#${PET_FLOAT_ID}.speech-on .wb-pet-desk-speech:before,#${PET_FLOAT_ID}.speech-on.speech-right .wb-pet-desk-speech:before{content:'';position:absolute;left:auto;right:20px;top:auto;bottom:-10px;border-width:10px 8px 0 8px;border-style:solid;border-color:#000 transparent transparent transparent;}#${PET_FLOAT_ID}.speech-on .wb-pet-desk-speech:after,#${PET_FLOAT_ID}.speech-on.speech-right .wb-pet-desk-speech:after{left:auto!important;right:21px!important;top:auto!important;bottom:-9px!important;border-width:9px 7px 0 7px!important;border-color:#fff transparent transparent transparent!important}
      @media (max-width:768px){#${PET_FLOAT_ID},.wb-pet-desk-fox{width:86px;height:86px}.wb-pet-desk-menu .wb-pet-round{width:42px!important;height:28px!important;font-size:10px!important}.wb-pet-desk-submenu .wb-pet-round{width:40px!important;height:21px!important;font-size:9px!important}.wb-pet-round svg{width:16px;height:16px}.wb-pet-desk-menu .wb-pet-round:nth-child(1){--dx:-60px;--dy:-48px}.wb-pet-desk-menu .wb-pet-round:nth-child(2){--dx:0px;--dy:-72px}.wb-pet-desk-menu .wb-pet-round:nth-child(3){--dx:60px;--dy:-48px}.wb-pet-desk-menu .wb-pet-round:nth-child(4){--dx:80px;--dy:8px}.wb-pet-desk-submenu .wb-pet-round:nth-child(1){--dx:-60px;--dy:-18px}.wb-pet-desk-submenu .wb-pet-round:nth-child(2){--dx:-60px;--dy:8px}.wb-pet-desk-submenu .wb-pet-round:nth-child(3){--dx:-60px;--dy:34px}.wb-pet-desk-panel{top:86px;width:184px;max-height:112px;padding:6px}#${PET_FLOAT_ID}.status-on.chat-on .wb-pet-desk-status{top:86px}#${PET_FLOAT_ID}.status-on.chat-on .wb-pet-desk-chat{top:173px}.wb-pet-desk-chat-text{max-height:62px}#${PET_FLOAT_ID}.speech-on .wb-pet-desk-speech{max-width:112px;font-size:9px;padding:3px 5px;top:30px}}
      #${POPUP_ID}, #${POPUP_ID} * { box-sizing: border-box; }
      #${POPUP_ID} {
        position: fixed;
        top: calc(16px + env(safe-area-inset-top, 0px));
        right: calc(16px + env(safe-area-inset-right, 0px));
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        left: calc(16px + env(safe-area-inset-left, 0px));
        width: auto;
        height: auto;
        max-width: calc(100vw - 32px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));
	        max-height: calc(var(--wb-vvh, 100dvh) - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
        z-index: 1;
        color: var(--wb-text);
        background: var(--wb-bg);
        border: 1px solid var(--wb-border);
        border-top: 3px solid var(--wb-accent);
        box-shadow: 0 24px 70px rgba(0,0,0,.55), 0 0 40px var(--wb-glow);
        overflow: hidden;
        overscroll-behavior: contain;
        font-family: Georgia, 'Noto Serif SC', 'Microsoft YaHei', serif;
        font-size: 14px;
        line-height: 1.6;
        display: flex;
        flex-direction: column;
      }
      #${POPUP_ID}.wb-day { --wb-bg:#fff7fb; --wb-panel:#fffefd; --wb-soft:#ffeaf1; --wb-text:#2f2430; --wb-sub:#8a6470; --wb-border:#e8b9c5; --wb-accent:#c65b7c; --wb-accent2:#3a8f91; --wb-board:#fff2e6; --wb-input:#fff9fb; --wb-glow:rgba(198,91,124,.26); --wb-gold:#c99738; --wb-screen:#fff9f2; --wb-on-accent:#fff; }
      #${POPUP_ID}.wb-arcade { --wb-bg:#F3FAFF; --wb-panel:#FFFDF8; --wb-soft:#E5F4FF; --wb-text:#28435A; --wb-sub:#6F8EA3; --wb-border:#B8DCEF; --wb-accent:#5FA8D7; --wb-accent2:#F6C8D8; --wb-board:#F8FCFF; --wb-input:#FFFDF8; --wb-glow:rgba(95,168,215,.14); --wb-gold:#5FA8D7; --wb-screen:#FFFDF8; --wb-on-accent:#fff; }
      #${POPUP_ID}.wb-spring { --wb-bg:#EAF6D4; --wb-panel:#F6E7C8; --wb-soft:#D8EDB2; --wb-text:#4C3B2A; --wb-sub:#7A6752; --wb-border:#BFA372; --wb-accent:#6FA85A; --wb-accent2:#7DB9D8; --wb-board:#E2F0BF; --wb-input:#F8EED6; --wb-glow:rgba(111,168,90,.24); --wb-gold:#E3C56A; --wb-screen:#F4F1D3; --wb-on-accent:#fff; }
	      #${POPUP_ID}.wb-night { --wb-bg:#11121d; --wb-panel:#191a28; --wb-soft:#252033; --wb-text:#f5eafa; --wb-sub:#bba8c7; --wb-border:#54425f; --wb-accent:#ff7aa8; --wb-accent2:#6ed6d1; --wb-board:#111827; --wb-input:#151620; --wb-glow:rgba(255,122,168,.28); --wb-gold:#f3c56a; --wb-screen:#111827; --wb-on-accent:#fff; }
	      #${POPUP_ID}.wb-mono { --wb-bg:#f2f2f2; --wb-panel:#ffffff; --wb-soft:#dcdcdc; --wb-text:#151515; --wb-sub:#565656; --wb-border:#8f8f8f; --wb-accent:#111111; --wb-accent2:#4d4d4d; --wb-board:#e6e6e6; --wb-input:#f7f7f7; --wb-glow:rgba(0,0,0,.12); --wb-gold:#2e2e2e; --wb-screen:#eeeeee; --wb-on-accent:#fff; }
	      #${POPUP_ID}.wb-cyber { --wb-bg:#0D1512; --wb-panel:#18231E; --wb-soft:#24352D; --wb-text:#F6F5DE; --wb-sub:#B9C4B8; --wb-border:#4C5B4A; --wb-accent:#F1E85B; --wb-accent2:#19D3C5; --wb-board:#101A1D; --wb-input:#14201B; --wb-glow:rgba(241,232,91,.22); --wb-gold:#FF8A3D; --wb-screen:#1A221D; --wb-on-accent:#0D1512; }
	      #${POPUP_ID}.wb-cardtheater { --wb-bg:#080304; --wb-panel:#13080A; --wb-soft:#241014; --wb-text:#F8EFE7; --wb-sub:#D5BBA5; --wb-border:rgba(245,201,104,.34); --wb-accent:#C9182B; --wb-accent2:#F5C968; --wb-board:#100506; --wb-input:#0E0708; --wb-glow:rgba(201,24,43,.30); --wb-gold:#F5C968; --wb-screen:#0B0506; --wb-on-accent:#FFF8F0; }
	      #${POPUP_ID}.wb-tavern { --wb-bg:var(--SmartThemeBodyColor, #1f1f1f); --wb-panel:var(--SmartThemeBlurTintColor, var(--SmartThemeBotMesBlurTintColor, #2a2a2a)); --wb-soft:color-mix(in srgb, var(--wb-panel) 78%, var(--wb-accent) 22%); --wb-text:var(--SmartThemeTextColor, #f5f5f5); --wb-sub:color-mix(in srgb, var(--wb-text) 68%, var(--wb-bg) 32%); --wb-border:var(--SmartThemeBorderColor, rgba(255,255,255,.22)); --wb-accent:var(--SmartThemeQuoteColor, var(--SmartThemeEmColor, #8ab4f8)); --wb-accent2:var(--SmartThemeEmColor, var(--wb-accent)); --wb-board:color-mix(in srgb, var(--wb-bg) 78%, var(--wb-panel) 22%); --wb-input:color-mix(in srgb, var(--wb-panel) 86%, var(--wb-bg) 14%); --wb-glow:color-mix(in srgb, var(--wb-accent) 28%, transparent 72%); --wb-gold:var(--SmartThemeQuoteColor, #d7a64d); --wb-screen:color-mix(in srgb, var(--wb-bg) 72%, var(--wb-panel) 28%); font-family:inherit; }
      .wb-head { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px 12px; border-bottom:1px solid var(--wb-border); background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.02)); }
      .wb-title { font-size:20px; font-weight:800; letter-spacing:2px; color:var(--wb-accent); white-space:nowrap; }
      .wb-title::after { content:''; display:block; width:64px; height:1px; background:var(--wb-accent); margin-top:3px; opacity:.75; }
      .wb-head-meta { display:none; flex:0 0 auto; align-items:center; gap:8px; color:var(--wb-sub); font-size:11px; line-height:1.2; font-weight:800; text-align:right; white-space:nowrap; }
      #${POPUP_ID}.wb-tab-settings .wb-head-meta { display:flex; }
      .wb-head-meta span { padding:3px 7px; border:1px solid var(--wb-border); background:var(--wb-soft); }
      .wb-head-meta i { font-style:normal; color:var(--wb-accent); margin-right:3px; }
      .wb-tabs { display:flex; gap:0; flex:1 1 auto; min-width:0; flex-wrap:nowrap!important; border:1px solid var(--wb-border); background:var(--wb-soft); }
      .wb-tab, .wb-btn, .wb-iconbtn { border:1px solid var(--wb-border); background:var(--wb-panel); color:var(--wb-text); border-radius:0; min-height:34px; padding:7px 12px; cursor:pointer; font-weight:700; font-family:inherit; letter-spacing:1px; }
      .wb-tabs .wb-tab { border:0; border-right:1px solid var(--wb-border); flex:1 1 0; min-width:0!important; display:inline-flex; align-items:center; justify-content:center; white-space:nowrap; gap:5px; padding-inline:clamp(4px, 1.5vw, 10px); font-size:clamp(11px, 1.8vw, 14px); }
      .wb-tabs .wb-tab[data-tab="settings"] { flex:0 0 auto; width:auto; min-width:44px!important; padding-inline:7px; }
      .wb-tab-count { display:inline-grid; place-items:center; min-width:17px; height:17px; margin-left:0; padding:0 4px; border:1px solid currentColor; border-radius:999px; font-size:11px; line-height:1; font-weight:900; letter-spacing:0; vertical-align:middle; }
      .wb-tabs .wb-tab:last-child { border-right:0; }
      .wb-iconbtn { width:34px; padding:0; display:grid; place-items:center; font-size:18px; }
      .wb-tab.active, .wb-btn.primary { background:var(--wb-accent); color:var(--wb-on-accent,#fff); border-color:var(--wb-accent); }
      .wb-body { flex:1 1 auto; min-height:0; display:block; padding:14px; overflow-y:auto; -webkit-overflow-scrolling:touch; }
      .wb-body.wb-swipe-enter-left { animation:wbSwipeEnterLeft .22s ease both; }
      .wb-body.wb-swipe-enter-right { animation:wbSwipeEnterRight .22s ease both; }
      @keyframes wbSwipeEnterLeft { from { opacity:.55; transform:translateX(22px); } to { opacity:1; transform:translateX(0); } }
      @keyframes wbSwipeEnterRight { from { opacity:.55; transform:translateX(-22px); } to { opacity:1; transform:translateX(0); } }
      .wb-body.wb-settings-mode { overflow-y:auto; overflow-x:hidden; overscroll-behavior:contain; max-height:calc(100dvh - 118px); min-height:0; padding-bottom:24px; }
      .wb-body.wb-game-mode { flex:1 1 auto; min-height:0; display:flex; flex-direction:column; overflow:hidden; -webkit-overflow-scrolling:touch; height:auto; }
      .wb-body.wb-intimacy-mode { padding:12px; overflow:auto; display:block; min-height:0; }
      .wb-body.wb-pet-mode { overflow:hidden; padding:8px; display:flex; flex-direction:column; }
      .wb-intimacy-hub { min-height:0; display:grid; grid-template-columns:1fr; gap:10px; align-content:start; justify-items:center; width:100%; }
      .wb-intimacy-button {
        position:relative;
        width:min(100%, 340px);
        aspect-ratio:936 / 204;
        display:grid;
        place-items:center;
        padding:0;
        border:0;
        background:transparent;
        color:#2f2430;
        box-shadow:none;
        cursor:pointer;
        overflow:hidden;
        font-family:inherit;
      }
      .wb-intimacy-button::before { content:none; }
      .wb-intimacy-button:hover { transform:translateY(-1px); filter:brightness(1.02); }
      .wb-intimacy-button:active { transform:translateY(1px); box-shadow:none; }
      .wb-intimacy-button img { position:absolute; inset:0; z-index:1; width:100%; height:100%; object-fit:fill; display:block; filter:saturate(.98) brightness(1.02); }
      .wb-intimacy-button span { position:relative; z-index:2; min-width:0; font-family:'WanbanIntimacyButton', 'Microsoft YaHei', 'PingFang SC', system-ui, sans-serif!important; font-size:clamp(30px, 3.4vw, 38px); font-weight:700; letter-spacing:2px; color:#4A2617; text-shadow:0 1px 0 rgba(255,255,255,.82), 0 2px 8px rgba(255,255,255,.62); white-space:nowrap; }
      .wb-pet-trial-note { min-width:0; padding:6px 8px; border:1px solid var(--wb-border); background:var(--wb-soft); color:var(--wb-text); font-weight:900; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .wb-pet-room { width:min(100%, 760px); margin:0 auto; flex:1 1 auto; min-height:0; display:grid; grid-template-rows:auto auto minmax(0, 1fr) minmax(86px, 22cqh); gap:7px; overflow:hidden; }
      .wb-pet-room-top { display:grid; grid-template-columns:auto minmax(0, 1fr) auto; align-items:center; gap:8px; }
      .wb-pet-room-title { font-weight:900; color:var(--wb-accent); letter-spacing:1px; }
      .wb-pet-top-actions { display:flex; gap:6px; align-items:center; justify-self:end; margin-left:auto; }
      .wb-pet-iconbtn {
        width:36px;
        height:36px;
        min-height:36px;
        padding:0;
        display:grid;
        place-items:center;
        font-size:18px;
        line-height:1;
      }
      .wb-pet-stage { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:8px; min-height:0; justify-self:center; width:min(100%, 680px); }
      .wb-pet-scene {
        position:relative;
        width:100%;
        height:100%;
        max-height:min(54cqh, 430px);
        aspect-ratio:1 / 1;
        justify-self:center;
        align-self:center;
        min-height:0;
        overflow:hidden;
        border:1px solid var(--wb-border);
        background:var(--wb-board) center / cover no-repeat;
      }
      .wb-pet-room-fox {
        position:absolute;
        left:50%;
        top:46%;
        width:min(30cqh, 28cqw, 174px);
        min-width:86px;
        transform:translate(-50%, -50%);
        filter:drop-shadow(0 14px 20px rgba(0,0,0,.22));
      }
      .wb-pet-speech {
        position:absolute;
        left:50%;
        top:14px;
        transform:translateX(-50%);
        max-width:min(88%, 420px);
        padding:8px 12px;
        background:rgba(255,255,255,.88);
        color:#2f2430;
        border:1px solid rgba(255,255,255,.72);
        box-shadow:0 10px 22px rgba(0,0,0,.18);
        font-weight:700;
        text-align:center;
      }
      .wb-pet-npc-portrait {
        position:absolute;
        left:50%;
        top:50%;
        width:min(100%,512px);
        height:min(100%,512px);
        transform:translate(-50%,-50%);
        object-fit:contain;
        border:0;
        background:transparent;
        z-index:5;
      }
      .wb-pet-room-actions { display:grid; grid-template-columns:1fr; gap:6px; align-content:start; width:44px; }
      .wb-pet-room-actions .wb-pet-iconbtn { width:44px; height:42px; min-height:42px; }
      .wb-pet-bars { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; width:100%; }
      .wb-pet-bar { display:grid; gap:3px; color:var(--wb-sub); font-size:12px; font-weight:800; }
      .wb-pet-bar-track { height:8px; border:1px solid var(--wb-border); background:var(--wb-board); overflow:hidden; }
      .wb-pet-bar-fill { height:100%; width:var(--v, 0%); background:var(--c, var(--wb-accent)); }
      .wb-pet-dialogue { min-height:0; overflow:hidden; border:2px solid var(--wb-border); background:color-mix(in srgb, var(--wb-panel) 92%, #000 8%); padding:9px 10px; color:var(--wb-text); font-weight:700; display:grid; grid-template-rows:auto minmax(0, 1fr) auto; gap:5px; cursor:pointer; }
      .wb-pet-dialogue-name { color:var(--wb-accent); font-weight:900; font-size:12px; }
      .wb-pet-dialogue-text { min-height:0; overflow:hidden; line-height:1.55; font-size:14px; }
      .wb-pet-dialogue-actions { display:flex; gap:6px; justify-content:flex-end; align-items:center; }
      .wb-pet-dialogue-actions .wb-btn { min-height:28px; padding:4px 8px; font-size:12px; }
      .wb-pet-locations { position:absolute; left:8px; top:8px; display:flex; gap:6px; z-index:4; }
      .wb-pet-locations .wb-btn { width:32px; height:30px; min-height:30px; padding:0; font-size:16px; }
      .wb-pet-story-badge { color:var(--wb-on-accent,#fff); background:var(--wb-accent); border:1px solid var(--wb-accent); padding:3px 8px; font-size:12px; font-weight:900; }
      .wb-pet-rpg-line { border:1px solid var(--wb-border); background:var(--wb-panel); padding:8px 10px; margin:0 0 8px; }
      .wb-pet-rpg-speaker { display:inline-block; margin-bottom:4px; color:var(--wb-accent); font-weight:900; }
      .wb-pet-rpg-line.speaker-u .wb-pet-rpg-speaker { color:#3a8f91; }
      .wb-pet-rpg-line.speaker-c .wb-pet-rpg-speaker { color:#c65b7c; }
      .wb-pet-rpg-line.speaker-p .wb-pet-rpg-speaker { color:#c99738; }
      .wb-pet-rpg-line.speaker-shen .wb-pet-rpg-speaker { color:#5FA8D7; }
      @media (max-width: 768px) {
        .wb-body.wb-intimacy-mode { padding:8px; }
        .wb-body.wb-pet-mode { padding:6px; }
        .wb-intimacy-hub { gap:8px; }
        .wb-intimacy-button { width:min(96%, 360px); aspect-ratio:936 / 204; }
        .wb-intimacy-button span { font-size:clamp(32px, 9.2vw, 40px); }
        .wb-pet-room { width:100%; grid-template-rows:auto auto minmax(0, 1fr) minmax(94px, 24cqh); gap:6px; }
        .wb-pet-stage { width:100%; grid-template-columns:minmax(0, 1fr) 40px; gap:6px; }
        .wb-pet-scene { max-height:none; aspect-ratio:auto; }
        .wb-pet-room-actions { width:40px; gap:5px; }
        .wb-pet-room-actions .wb-pet-iconbtn { width:40px; height:38px; min-height:38px; font-size:16px; }
        .wb-pet-room-fox { top:48%; width:min(34cqw, 138px); min-width:78px; }
        .wb-pet-dialogue-text { font-size:13px; line-height:1.45; }
      }
      #${POPUP_ID}.wb-playing { bottom:28px; }
      @media (min-width: 769px) {
        .wb-body.wb-game-mode { overflow:hidden; padding:8px 10px 10px; }
        .wb-body.wb-game-mode .wb-layout { flex:1 1 auto; height:auto; min-height:0; }
        .wb-body.wb-game-mode > .wb-layout > .wb-panel:first-child { overflow:hidden; }
        .wb-body.wb-game-mode .wb-board-wrap { min-height:0; height:auto; }
      }
      .wb-cardgrid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px; align-content:start; }
      .wb-game-card { background:var(--wb-panel); border:1px solid var(--wb-border); border-left:3px solid var(--wb-accent); border-radius:0; padding:14px; cursor:pointer; min-height:92px; display:flex; align-items:center; gap:12px; transition:.16s transform,.16s box-shadow,.16s border-color; }
      .wb-game-card:hover { transform:translateY(-2px); border-color:var(--wb-accent); box-shadow:0 12px 28px rgba(0,0,0,.16); }
      .wb-game-icon { flex:0 0 auto; width:60px; height:60px; display:grid; place-items:center; border-radius:0; background:var(--wb-soft); color:var(--wb-accent); border:1px solid var(--wb-border); font-weight:900; overflow:hidden; }
      .wb-game-icon img { width:100%; height:100%; object-fit:cover; display:block; }
      .wb-game-icon.has-image { padding:0; background:var(--wb-soft); color:transparent; }
      .wb-game-icon.has-image span { display:none; }
      .wb-game-info { min-width:0; display:grid; gap:5px; align-content:center; }
      .wb-game-name { font-size:18px; font-weight:800; letter-spacing:1px; }
      .wb-muted { color:var(--wb-sub); font-size:13px; }
      .wb-word-meta { color:var(--wb-sub); font-size:13px; line-height:1.35; display:block; }
      .wb-layout { flex:1 1 auto; min-height:0; height:auto; display:grid; grid-template-columns:minmax(0, 1fr) minmax(250px, 300px); grid-template-rows:minmax(0, 1fr); gap:12px; align-items:stretch; }
      .wb-layout.no-companion { grid-template-columns:minmax(0, 1fr); }
      .wb-layout.companion-pc-left { grid-template-columns:minmax(250px, 300px) minmax(0, 1fr); }
      .wb-layout.companion-pc-left .wb-game-main { grid-column:2; grid-row:1; }
      .wb-layout.companion-pc-left .wb-side-companion { grid-column:1; grid-row:1; }
      .wb-layout.companion-pc-right .wb-game-main { grid-column:1; grid-row:1; }
      .wb-layout.companion-pc-right .wb-side-companion { grid-column:2; grid-row:1; }
      .wb-layout.game-layout-spider .wb-game-main,
      .wb-layout.game-layout-spider .wb-board-wrap,
      .wb-layout.game-layout-spider .wb-spider { position:relative; z-index:3; }
      .wb-layout.game-layout-spider .wb-side-companion { position:relative; z-index:1; }
      .wb-panel { background:var(--wb-panel); border:1px solid var(--wb-border); border-radius:0; padding:12px; min-height:0; }
      .wb-body.wb-game-mode > .wb-layout > .wb-panel:first-child { display:flex; flex-direction:column; overflow:hidden; }
      .wb-body.wb-game-mode > .wb-layout > .wb-panel:last-child { overflow:hidden; display:flex; flex-direction:column; }
      .wb-toolbar { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
      .wb-layout.no-companion .wb-toolbar { flex-wrap:nowrap; }
      .wb-layout.no-companion .wb-stat { flex:1 1 auto; min-width:0; flex-wrap:nowrap; overflow:hidden; }
      .wb-layout.no-companion .wb-toolbar > .wb-actions { flex:0 0 auto; margin-left:auto; flex-wrap:nowrap; justify-content:flex-end; }
      .wb-stat { display:flex; gap:6px; flex-wrap:wrap; }
      .wb-pill { background:var(--wb-soft); border:1px solid var(--wb-border); border-radius:0; padding:5px 9px; font-size:12px; font-weight:700; }
      #wb-score.target-met { color:#fff; border-color:#16a34a; background:linear-gradient(135deg,#16a34a,#22c55e); box-shadow:0 0 16px rgba(34,197,94,.35); }
      .wb-board-wrap { position:relative; flex:1 1 auto; min-height:0; width:100%; display:grid; place-items:center; background:var(--wb-board); border:1px solid var(--wb-border); border-radius:0; padding:8px; touch-action:none; overflow:hidden; container-type:size; }
      .wb-pause-overlay { position:absolute; inset:8px; z-index:6; display:grid; place-items:center; background:rgba(0,0,0,.42); color:#fff; font-size:clamp(34px, 9vh, 84px); font-weight:900; letter-spacing:0; pointer-events:none; text-shadow:0 3px 18px rgba(0,0,0,.45); }
      .wb-pause-overlay span { padding:8px 18px; border:2px solid rgba(255,255,255,.55); background:rgba(0,0,0,.18); }
      .wb-canvas { display:block; max-width:min(100%, 100cqw); max-height:min(100%, 100cqh); width:auto; height:auto; object-fit:contain; background:#151515; border-radius:0; box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); }
	      .wb-touch-togglebar { width:100%; flex:0 0 auto; display:flex; justify-content:center; align-items:center; min-height:30px; }
	      .wb-touch-togglebar .wb-btn { min-height:26px; padding:3px 10px; font-size:12px; }
	      .wb-snake-shell { width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; }
	      .wb-snake-playfield { flex:1 1 0; min-width:0; min-height:0; width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; }
	      .wb-snake-controls { display:grid; grid-template-columns:repeat(3, 42px); grid-template-rows:repeat(3, 42px); gap:0; justify-content:center; flex:0 0 auto; }
	      .wb-snake-controls .wb-btn { min-width:42px; min-height:42px; }
	      .wb-snake-controls .up { grid-column:2; grid-row:1; }
	      .wb-snake-controls .left { grid-column:1; grid-row:2; }
	      .wb-snake-controls .down { grid-column:2; grid-row:3; }
	      .wb-snake-controls .right { grid-column:3; grid-row:2; }
	      .wb-snake-shell.controls-hidden .wb-snake-controls,
	      .wb-snake-shell.control-mode-swipe .wb-snake-controls,
	      .wb-snake-shell.control-mode-tap .wb-snake-controls { display:none; }
	      .wb-canvas.wb-tetris-canvas { aspect-ratio:1 / 2; max-height:min(100%, 100cqh); }
	      .wb-canvas.wb-tetris-canvas { background:var(--wb-board); box-shadow:none; }
      .wb-jump-shell { position:relative; width:100%; height:100%; min-width:0; min-height:0; display:grid; place-items:center; user-select:none; -webkit-user-select:none; -moz-user-select:none; -ms-user-select:none; -webkit-touch-callout:none; -webkit-user-drag:none; touch-action:none; }
      .wb-jump-shell * { user-select:none; -webkit-user-select:none; -moz-user-select:none; -ms-user-select:none; -webkit-touch-callout:none; -webkit-user-drag:none; }
      .wb-jump-canvas { aspect-ratio:13 / 16; max-height:min(100%, 100cqh); background:#e9f8ff; touch-action:none; user-select:none; -webkit-user-select:none; -moz-user-select:none; -ms-user-select:none; -webkit-touch-callout:none; -webkit-user-drag:none; }
      .wb-plank-shell { position:relative; width:100%; height:100%; min-width:0; min-height:0; display:grid; place-items:center; user-select:none; -webkit-user-select:none; -moz-user-select:none; -ms-user-select:none; -webkit-touch-callout:none; -webkit-user-drag:none; touch-action:none; }
      .wb-plank-shell * { user-select:none; -webkit-user-select:none; -moz-user-select:none; -ms-user-select:none; -webkit-touch-callout:none; -webkit-user-drag:none; }
      .wb-plank-canvas { aspect-ratio:13 / 9; max-height:min(100%, 100cqh); background:#e9f8ff; touch-action:none; user-select:none; -webkit-user-select:none; -moz-user-select:none; -ms-user-select:none; -webkit-touch-callout:none; -webkit-user-drag:none; border:6px solid color-mix(in srgb, var(--wb-accent) 36%, #6b4328 64%); box-shadow:0 18px 36px rgba(74,49,31,.18), inset 0 0 0 2px rgba(255,255,255,.24); }
      #${POPUP_ID}.wb-night .wb-plank-canvas,
      #${POPUP_ID}.wb-cyber .wb-plank-canvas { border-color:color-mix(in srgb, var(--wb-accent) 70%, #101A1D 30%); box-shadow:0 0 24px rgba(25,211,197,.18), inset 0 0 0 2px rgba(241,232,91,.16); }
      .wb-jump-help { position:absolute; top:12px; left:50%; transform:translateX(-50%); z-index:2; padding:4px 10px; border:1px solid color-mix(in srgb, var(--wb-border) 70%, transparent 30%); background:color-mix(in srgb, var(--wb-panel) 82%, transparent 18%); color:var(--wb-sub); font-size:12px; font-weight:800; line-height:1.2; pointer-events:none; user-select:none; -webkit-user-select:none; -moz-user-select:none; -ms-user-select:none; -webkit-touch-callout:none; -webkit-user-drag:none; box-shadow:0 6px 16px rgba(0,0,0,.12); }
      .wb-jump-help::before { content:attr(data-label); }
      #${POPUP_ID}.wb-night .wb-jump-canvas { background:#000; }
      #${POPUP_ID}.wb-cyber .wb-jump-help { border-color:rgba(25,211,197,.35); color:#F1E85B; box-shadow:0 0 14px rgba(25,211,197,.16); }
	      .wb-tetris-shell { width:100%; height:100%; min-width:0; min-height:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; }
	      .wb-tetris-playfield { flex:1 1 0; min-width:0; min-height:0; width:100%; display:flex; align-items:center; justify-content:center; gap:10px; }
	      .wb-tetris-controls { display:grid; flex:0 0 auto; grid-template-columns:repeat(3,38px); grid-template-rows:repeat(3,38px); gap:0; }
      .wb-arcade-btn { position:relative; display:grid; place-items:center; min-width:42px; min-height:42px; padding:0; border-radius:0!important; border:2px solid color-mix(in srgb, var(--wb-accent) 76%, #000 24%); background:radial-gradient(circle at 34% 22%, rgba(255,255,255,.48), transparent 34%), linear-gradient(145deg, color-mix(in srgb, var(--wb-accent2) 42%, var(--wb-panel) 58%), color-mix(in srgb, var(--wb-accent) 30%, var(--wb-soft) 70%)); box-shadow:0 4px 0 color-mix(in srgb, var(--wb-accent) 46%, #000 54%), 0 10px 18px rgba(0,0,0,.22), inset 0 0 0 1px rgba(255,255,255,.38), inset 0 -8px 14px rgba(0,0,0,.08); color:var(--wb-text); font-size:0!important; line-height:1; overflow:hidden; clip-path:var(--wb-pad-shape); transform:var(--wb-pad-shift); z-index:1; }
      .wb-arcade-btn:hover, .wb-arcade-btn:focus, .wb-arcade-btn:focus-visible { transform:var(--wb-pad-shift)!important; }
      .wb-arcade-btn:active { transform:var(--wb-pad-shift)!important; filter:brightness(.94); box-shadow:0 2px 0 color-mix(in srgb, var(--wb-accent) 46%, #000 54%), 0 6px 12px rgba(0,0,0,.18), inset 0 2px 5px rgba(0,0,0,.22); }
      .wb-arcade-btn::before { content:none; }
      .wb-arcade-btn.up { --wb-pad-shift:translateY(50%); --wb-pad-shape:polygon(12% 0, 88% 0, 88% 66%, 50% 100%, 12% 66%); }
      .wb-arcade-btn.down { --wb-pad-shift:translateY(-50%); --wb-pad-shape:polygon(12% 34%, 50% 0, 88% 34%, 88% 100%, 12% 100%); }
      .wb-arcade-btn.left { --wb-pad-shift:translateX(50%); --wb-pad-shape:polygon(0 12%, 66% 12%, 100% 50%, 66% 88%, 0 88%); }
      .wb-arcade-btn.right { --wb-pad-shift:translateX(-50%); --wb-pad-shape:polygon(34% 12%, 100% 12%, 100% 88%, 34% 88%, 0 50%); }
      .wb-tetris-controls .wb-arcade-btn { min-width:38px; min-height:38px; }
      .wb-tetris-controls .up::after, .wb-tetris-controls .down::after { position:absolute; left:50%; transform:translateX(-50%); font-size:9px; font-weight:900; letter-spacing:0; color:var(--wb-text); line-height:1; white-space:nowrap; text-shadow:0 1px 0 rgba(255,255,255,.38); }
      .wb-tetris-controls .up::after { content:'变换'; top:3px; }
      .wb-tetris-controls .down::after { content:'加速'; bottom:3px; }
      .wb-tetris-controls .up, .wb-tetris-controls .down { color:#fff; border-color:color-mix(in srgb, var(--wb-accent) 78%, #000 22%); background:radial-gradient(circle at 35% 25%, rgba(255,255,255,.34), transparent 34%), linear-gradient(145deg, var(--wb-accent), color-mix(in srgb, var(--wb-accent2) 58%, var(--wb-accent) 42%)); box-shadow:0 4px 0 color-mix(in srgb, var(--wb-accent) 48%, #000 52%), 0 9px 16px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.42); }
      .wb-tetris-controls .up::after, .wb-tetris-controls .down::after { color:#fff; text-shadow:0 1px 2px rgba(0,0,0,.72), 0 0 1px rgba(0,0,0,.85); }
	      .wb-tetris-controls .up { grid-column:2; grid-row:1; }
	      .wb-tetris-controls .left { grid-column:1; grid-row:2; }
	      .wb-tetris-controls .down { grid-column:2; grid-row:3; }
	      .wb-tetris-controls .right { grid-column:3; grid-row:2; }
	      .wb-tetris-shell.controls-hidden .wb-tetris-playfield,
	      .wb-tetris-shell.control-mode-swipe .wb-tetris-playfield,
	      .wb-tetris-shell.control-mode-tap .wb-tetris-playfield { gap:8px; }
	      .wb-tetris-shell.control-mode-swipe .wb-tetris-controls,
	      .wb-tetris-shell.control-mode-tap .wb-tetris-controls { display:none; }
	      .wb-tetris-shell.controls-hidden .wb-tetris-controls { grid-template-columns:38px; grid-template-rows:repeat(2,38px); row-gap:8px; width:38px; }
	      .wb-tetris-shell.controls-hidden .wb-tetris-controls .left,
	      .wb-tetris-shell.controls-hidden .wb-tetris-controls .right { display:none; }
	      .wb-tetris-shell.controls-hidden .wb-tetris-controls .up { grid-column:1; grid-row:1; }
	      .wb-tetris-shell.controls-hidden .wb-tetris-controls .down { grid-column:1; grid-row:2; }
	      .wb-tetris-shell.controls-hidden .wb-tetris-controls .up,
	      .wb-tetris-shell.controls-hidden .wb-tetris-controls .down { --wb-pad-shift:none; clip-path:none; }
      .wb-2048-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; place-items:center; gap:8px; overflow:hidden; }
      .wb-control-mode-btn { min-height:26px; padding:3px 10px; font-size:12px; white-space:nowrap; }
      .wb-grid2048 { width:min(430px, 100%, 82cqh); aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(var(--wb-2048-size,4),minmax(0,1fr)); grid-template-rows:repeat(var(--wb-2048-size,4),minmax(0,1fr)); gap:8px; background:#b8a89f; padding:8px; border-radius:0; box-sizing:border-box; }
      .wb-grid2048 .wb-tile { border:0; border-radius:0; padding:0; display:grid; place-items:center; font-weight:900; color:#5e514d; }
      .wb-grid2048 .wb-tile:not(.clearable) { pointer-events:none; }
      .wb-grid2048 .wb-tile.clearable { outline:3px solid var(--wb-accent); cursor:pointer; }
      .wb-2048-tools { min-height:34px; }
      .wb-tile { display:grid; place-items:center; border-radius:0; background:#cdc0b6; font-weight:900; font-size:clamp(16px, 3.2vh, 26px); color:#4f4039; min-width:0; min-height:0; aspect-ratio:1; overflow:hidden; line-height:1; }
      .wb-board3-panel { width:100%; height:100%; min-height:0; display:grid; place-items:center; overflow:hidden; }
      .wb-board3 { width:min(430px, 100%, 82cqh); aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); grid-template-rows:repeat(3,minmax(0,1fr)); gap:8px; box-sizing:border-box; }
      .wb-cell { border:1px solid var(--wb-border); border-radius:0; background:var(--wb-panel); color:var(--wb-text); font-size:clamp(30px, 6vh, 48px); font-weight:900; cursor:pointer; min-width:0; min-height:0; aspect-ratio:1; line-height:1; overflow:hidden; }
      .wb-gomoku-panel { width:100%; height:100%; min-height:0; display:grid; place-items:center; overflow:hidden; }
      .wb-gomoku-with-info { grid-template-rows:42px minmax(0, 1fr); gap:6px; }
      .wb-gomoku { width:min(500px, 100%, 82cqh); aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(15,minmax(0,1fr)); grid-template-rows:repeat(15,minmax(0,1fr)); gap:2px; background:#ba9362; padding:7px; border-radius:0; box-sizing:border-box; }
      .wb-territory-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0, 1fr); gap:10px; place-items:center; }
      .wb-territory-info { display:flex; flex-wrap:wrap; gap:6px; justify-content:center; align-items:center; }
      .wb-territory-board { width:min(520px, 100%, 100cqh); max-height:100%; aspect-ratio:1; display:grid; grid-template-columns:repeat(11,minmax(0,1fr)); grid-template-rows:repeat(11,minmax(0,1fr)); gap:0; padding:8px; background:#f5f7fb; border:1px solid var(--wb-border); contain:layout size; }
      .wb-territory-dot { width:9px; height:9px; place-self:center; background:#384152; border:1px solid rgba(0,0,0,.2); }
      .wb-territory-edge { appearance:none; border:0; background:transparent; cursor:pointer; padding:0; min-width:0; min-height:0; }
      .wb-territory-edge:hover:not(:disabled) { background:rgba(58,143,145,.24); }
      .wb-territory-edge.legal { background:rgba(58,143,145,.2); box-shadow:0 0 0 2px rgba(58,143,145,.28); }
      .wb-territory-edge.legal:hover { background:rgba(58,143,145,.42); box-shadow:0 0 0 2px rgba(58,143,145,.48); }
      .wb-territory-edge.h { height:9px; align-self:center; width:100%; }
      .wb-territory-edge.v { width:9px; justify-self:center; height:100%; }
      .wb-territory-edge.claimed { cursor:default; background:#4b5563; }
      .wb-territory-edge.user { background:#3a8f91; }
      .wb-territory-edge.ta { background:#d86f45; }
      .wb-territory-cell { margin:3px; display:grid; place-items:center; font-size:11px; font-weight:900; color:rgba(255,255,255,.92); background:rgba(148,163,184,.14); border:1px solid rgba(148,163,184,.16); }
      .wb-territory-cell.user { background:rgba(58,143,145,.78); }
      .wb-territory-cell.ta { background:rgba(216,111,69,.78); }
      #${POPUP_ID}.wb-night .wb-territory-board { background:#000; }
      #${POPUP_ID}.wb-night .wb-territory-dot { background:#d1d5db; }
      #${POPUP_ID}.wb-night .wb-territory-cell { background:rgba(255,255,255,.08); }
      #${POPUP_ID}.wb-night .wb-territory-cell.user { background:rgba(58,143,145,.72); }
      #${POPUP_ID}.wb-night .wb-territory-cell.ta { background:rgba(216,111,69,.72); }
      #${POPUP_ID}.wb-day .wb-territory-board { background:#fff1f5; }
      #${POPUP_ID}.wb-spring .wb-territory-board { background:#EAF6D4; }
      #${POPUP_ID}.wb-spring .wb-territory-dot { background:#4C3B2A; border-color:rgba(76,59,42,.28); }
      #${POPUP_ID}.wb-spring .wb-territory-cell { background:rgba(216,237,178,.42); border-color:rgba(111,168,90,.24); color:#4C3B2A; }
      #${POPUP_ID}.wb-spring .wb-territory-cell.user { background:rgba(111,168,90,.78); color:#fff; }
      #${POPUP_ID}.wb-spring .wb-territory-cell.ta { background:rgba(217,123,84,.78); color:#fff; }
      #${POPUP_ID}.wb-cyber .wb-territory-board { background:#101A1D; }
      #${POPUP_ID}.wb-cyber .wb-territory-dot { background:#F1E85B; border-color:rgba(25,211,197,.45); box-shadow:0 0 8px rgba(241,232,91,.38); }
      #${POPUP_ID}.wb-cyber .wb-territory-cell { background:rgba(25,211,197,.08); border-color:rgba(25,211,197,.18); color:#F6F5DE; }
      #${POPUP_ID}.wb-cyber .wb-territory-edge.user { background:#F1E85B; box-shadow:0 0 10px rgba(241,232,91,.32); }
      #${POPUP_ID}.wb-cyber .wb-territory-cell.user { background:rgba(241,232,91,.86); color:var(--wb-on-accent,#0D1512); }
      #${POPUP_ID}.wb-cyber .wb-territory-cell.ta { background:rgba(255,79,163,.55); color:#F6F5DE; }
      .wb-oldmaid { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto auto minmax(0, 1fr) minmax(0, 1fr) auto; gap:8px; align-items:stretch; }
      .wb-oldmaid-status { min-height:34px; display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; text-align:center; font-weight:800; color:var(--wb-text); }
      .wb-oldmaid-status > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-oldmaid-reveal { min-height:0; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; }
      .wb-oldmaid-reveal:empty { display:none; }
      .wb-oldmaid-reveal-text { color:var(--wb-sub); font-size:12px; font-weight:800; }
      .wb-oldmaid-zone { min-height:0; display:grid; grid-template-rows:auto minmax(0, 1fr); gap:6px; }
      .wb-oldmaid-hand { min-height:0; display:flex; flex-wrap:wrap; gap:8px; align-content:center; justify-content:center; overflow:auto; padding:6px; border:1px solid var(--wb-border); background:var(--wb-soft); }
      .wb-oldmaid-card { width:42px; height:58px; display:grid; place-items:center; border:1px solid var(--wb-border); border-radius:0; background:#fff; color:#111827; font-weight:900; font-size:17px; box-shadow:0 2px 8px rgba(15,23,42,.12); }
      .wb-oldmaid-card.big { width:54px; height:74px; font-size:22px; box-shadow:0 8px 20px rgba(15,23,42,.22); }
      .wb-oldmaid-card.back { cursor:pointer; color:transparent; font-size:0; background:url('${OLDMAID_BACK_URL}') center / 100% 100% no-repeat, #1f2937; overflow:hidden; }
      .wb-oldmaid-card.back:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 5px 14px rgba(15,23,42,.22); }
      .wb-oldmaid-card.back:disabled { opacity:.55; cursor:default; }
      .wb-oldmaid-card.joker { padding:0; color:transparent; font-size:0; background:#fff; border-color:var(--wb-border); overflow:hidden; box-shadow:none; }
      .wb-oldmaid-card.joker.big { box-shadow:none; }
      .wb-oldmaid-card.joker img { width:100%; height:100%; display:block; object-fit:fill; object-position:center; pointer-events:none; }
      .wb-oldmaid-log { min-height:34px; max-height:64px; overflow:auto; padding:7px 9px; border:1px solid var(--wb-border); color:var(--wb-muted); background:var(--wb-panel); font-size:12px; line-height:1.45; }
      .wb-turkey { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:4px; overflow:hidden; --tk-cell:32px; }
      .wb-turkey-top { display:grid; gap:3px; border-bottom:1px solid color-mix(in srgb,var(--wb-border) 72%,transparent 28%); padding-bottom:2px; }
      .wb-turkey-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; }
      .wb-turkey-stat { text-align:center; border:0; border-right:1px solid color-mix(in srgb,var(--wb-border) 70%,transparent 30%); background:transparent; padding:2px 3px; border-radius:0; line-height:1.02; }
      .wb-turkey-stat:last-child { border-right:0; }
      .wb-turkey-stat small { display:block; font-size:9px; color:var(--wb-muted); font-weight:800; }
      .wb-turkey-stat b { font-size:13px; color:var(--wb-text); }
      .wb-turkey-danger { display:none; }
      .wb-turkey-danger-bar { flex:1; height:12px; display:grid; grid-template-columns:repeat(10,1fr); gap:2px; }
      .wb-turkey-danger-bar span { border:1px solid rgba(80,103,125,.18); background:rgba(255,255,255,.45); border-radius:2px; }
      .wb-turkey-danger-bar.safe span.on { background:#86efac; } .wb-turkey-danger-bar.warn span.on { background:#fde68a; } .wb-turkey-danger-bar.danger span.on { background:#fdba74; } .wb-turkey-danger-bar.critical span.on { background:#fb7185; animation:wbTurkeyPulse .7s ease-in-out infinite alternate; }
      .wb-turkey-hint { min-height:14px; text-align:center; font-size:11px; font-weight:900; color:var(--wb-accent); }
      .wb-turkey-board { position:relative; width:min(calc(100cqw - 16px), calc((100cqh - 94px) * .8), 330px, 100%); max-height:calc(100cqh - 94px); aspect-ratio:8/10; justify-self:center; align-self:center; border:1px solid color-mix(in srgb,var(--wb-border) 76%,#5fd1c8 24%); background:linear-gradient(180deg,rgba(255,255,255,.62),rgba(238,246,255,.48)); overflow:hidden; touch-action:none; box-shadow:inset 0 0 0 1px rgba(255,255,255,.5); }
      .wb-turkey-board::before { content:''; position:absolute; inset:0; background-image:linear-gradient(to right,rgba(80,103,125,.18) 1px,transparent 1px),linear-gradient(to bottom,rgba(80,103,125,.18) 1px,transparent 1px); background-size:12.5% 10%; pointer-events:none; z-index:1; }
      .wb-turkey-block { position:absolute; height:calc(var(--tk-cell) - 4px); border-radius:calc(var(--tk-cell) * .18); background:var(--c); border:1px solid rgba(255,255,255,.76); box-shadow:inset 0 3px 0 rgba(255,255,255,.22), inset 0 -5px 9px rgba(0,0,0,.10), 0 3px 8px rgba(15,23,42,.16); z-index:2; display:grid; place-items:center; transition:left .13s ease, top .18s ease, transform .13s ease, opacity .18s ease; }
      .wb-turkey-block::before,.wb-turkey-block::after { content:none; }
      .wb-turkey-face { position:relative; z-index:1; max-width:calc(100% - 4px); color:rgba(31,41,55,.66); font-weight:1000; font-size:clamp(8px, calc(var(--tk-cell) * .28), 13px); line-height:1; letter-spacing:-.4px; white-space:nowrap; text-shadow:0 1px 0 rgba(255,255,255,.30); transform:translateY(-1px); overflow:hidden; }
      .wb-turkey-block.sel { transform:translateY(-2px); outline:2px solid rgba(255,255,255,.9); z-index:4; }
      .wb-turkey-block.dim { filter:grayscale(.8) brightness(.7); opacity:.55; }
      .wb-turkey-block.clear { transform:scale(.76); opacity:0; }
      .wb-turkey-block.shatter { animation:wbTurkeyShatter .34s ease-in forwards; filter:saturate(1.2) brightness(1.08); }
      .wb-turkey-preview { position:absolute; height:calc(var(--tk-cell) - 4px); border-radius:calc(var(--tk-cell) * .18); border:2px solid #22c55e; background:rgba(34,197,94,.14); z-index:3; pointer-events:none; }
      .wb-turkey-preview.bad { border-color:#ef4444; background:rgba(239,68,68,.12); }
      .wb-turkey-rowflash { position:absolute; left:0; width:100%; height:var(--tk-cell); background:rgba(255,255,255,.48); z-index:5; pointer-events:none; animation:wbTurkeyFlash .18s ease; }
      .wb-turkey-particle { position:absolute; width:6px; height:6px; border-radius:50%; background:var(--c); z-index:6; pointer-events:none; animation:wbTurkeyParticle .42s ease-out forwards; }
      .wb-turkey-combo { position:absolute; left:50%; top:45%; transform:translate(-50%,-50%); z-index:8; font-weight:1000; font-size:28px; color:#fff; text-shadow:0 2px 8px rgba(15,23,42,.55); animation:wbTurkeyCombo .8s ease forwards; pointer-events:none; }
      .wb-turkey-tools { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; height:30px; align-items:center; }
      .wb-turkey-tool { position:relative; min-height:28px; height:28px; border:1px solid var(--wb-border); border-radius:7px; padding:2px 5px; font-size:11px; background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 86%,var(--wb-bg) 14%),color-mix(in srgb,var(--wb-soft) 72%,var(--wb-bg) 28%)); color:var(--wb-text); font-weight:900; display:inline-flex; align-items:center; justify-content:center; gap:4px; white-space:nowrap; box-shadow:0 3px 10px color-mix(in srgb,#000 12%,transparent 88%), inset 0 1px 0 color-mix(in srgb,var(--wb-text) 10%,transparent 90%); }
      .wb-turkey-tool.active { outline:2px solid var(--wb-gold); }
      .wb-turkey-tool:disabled { opacity:.45; filter:grayscale(.8); }
      .wb-turkey-tool .badge { position:static; display:inline-grid; place-items:center; min-width:15px; height:15px; border-radius:999px; background:color-mix(in srgb,var(--wb-accent) 72%,var(--wb-panel) 28%); color:var(--wb-on-accent,#fff); border:1px solid color-mix(in srgb,var(--wb-border) 55%,var(--wb-accent) 45%); font-size:9px; line-height:1; }
      @keyframes wbTurkeyPulse { to { filter:brightness(1.22); box-shadow:0 0 8px rgba(239,68,68,.5); } }
      @keyframes wbTurkeyFlash { 50% { opacity:.35; } }
      @keyframes wbTurkeyParticle { to { transform:translate(var(--dx),var(--dy)) scale(.2); opacity:0; } }
      @keyframes wbTurkeyShatter { 0%{transform:scale(1);opacity:1} 45%{transform:scale(1.06) rotate(.6deg);opacity:.9} 100%{transform:scale(.35) rotate(-4deg);opacity:0} }
      @keyframes wbTurkeyCombo { 0%{opacity:0;transform:translate(-50%,-35%) scale(.8)} 25%,75%{opacity:1;transform:translate(-50%,-50%) scale(1)} 100%{opacity:0;transform:translate(-50%,-68%) scale(.9)} }
      .wb-link { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto auto; gap:7px; overflow:hidden; color:var(--wb-text); }
      .wb-link-top { display:grid; grid-template-columns:minmax(70px,.9fr) minmax(120px,1.6fr) minmax(70px,.9fr) auto; align-items:center; gap:6px; padding:2px 2px 6px; border-bottom:1px solid color-mix(in srgb,var(--wb-border) 72%,transparent 28%); }
      .wb-link-level,.wb-link-total { min-width:0; display:grid; gap:1px; text-align:center; line-height:1.05; }
      .wb-link-level small,.wb-link-total small { color:var(--wb-muted); font-size:10px; font-weight:900; }
      .wb-link-level b,.wb-link-total b { color:var(--wb-text); font-size:14px; font-weight:1000; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .wb-link-progress { min-width:0; display:grid; gap:4px; color:var(--wb-muted); font-size:11px; font-weight:900; text-align:center; }
      .wb-link-bar { height:5px; border-radius:999px; overflow:hidden; background:color-mix(in srgb,var(--wb-border) 36%,transparent 64%); }
      .wb-link-fill { width:0; height:100%; border-radius:inherit; background:linear-gradient(90deg,#55cbb1,#9be7d2); transition:width .18s ease; }
      .wb-link-fill.done { background:linear-gradient(90deg,#f5c94f,#ffe8a3); }
      .wb-link-time { min-width:66px; height:28px; display:grid; place-items:center; padding:0 8px; border:1px solid color-mix(in srgb,var(--wb-border) 70%,var(--wb-accent) 30%); border-radius:999px; background:color-mix(in srgb,var(--wb-panel) 76%,transparent 24%); color:var(--wb-text); font-size:12px; font-weight:1000; white-space:nowrap; }
      .wb-link-time.bonus { border-color:#34d399; background:linear-gradient(180deg,rgba(52,211,153,.22),rgba(16,185,129,.12)); color:#047857; box-shadow:0 0 0 2px rgba(52,211,153,.18), inset 0 1px 0 rgba(255,255,255,.54); }
      .wb-link-time.warn { border-color:#f59e0b; color:#d97706; }
      .wb-link-time.danger { border-color:#ef4444; color:#ef4444; animation:wbLinkPulse .8s ease-in-out infinite alternate; }
      .wb-link-time.freeze { border-color:#60a5fa; color:#2563eb; }
      .wb-link-boardwrap { position:relative; min-height:0; display:grid; place-items:center; overflow:hidden; padding:2px; }
      .wb-link-board { --ll-pad:5px; position:relative; display:grid; grid-template-columns:repeat(var(--ll-cols), minmax(0,1fr)); grid-template-rows:repeat(var(--ll-rows), minmax(0,1fr)); gap:0; width:min(100%, calc((100cqh - 120px) * var(--ll-ratio)), 560px); max-height:calc(100cqh - 120px); aspect-ratio:var(--ll-cols) / var(--ll-rows); padding:var(--ll-pad); border:1px solid color-mix(in srgb,var(--wb-border) 74%,var(--wb-accent) 26%); background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 82%,var(--wb-bg) 18%),color-mix(in srgb,var(--wb-soft) 58%,var(--wb-panel) 42%)); box-shadow:inset 0 1px 0 color-mix(in srgb,var(--wb-panel) 55%,transparent 45%),0 10px 24px color-mix(in srgb,#000 12%,transparent 88%); box-sizing:border-box; overflow:hidden; }
      .wb-link-tile { appearance:none; -webkit-tap-highlight-color:transparent; touch-action:manipulation; min-width:0; min-height:0; width:100%; height:100%; aspect-ratio:1/1; padding:0; border:1px solid color-mix(in srgb,var(--wb-border) 78%,var(--wb-accent) 22%); border-radius:9px; background:radial-gradient(circle at 30% 18%,rgba(255,255,255,.9),transparent 34%),linear-gradient(145deg,#fffdf9,#edf8f2 58%,#e3f0ea); color:#28343a; box-shadow:inset 0 1px 0 rgba(255,255,255,.86), inset 0 -6px 12px rgba(47,78,70,.07), 0 1px 3px rgba(15,23,42,.08); display:grid; place-items:center; font-size:clamp(16px, min(5.8cqw, 7.2cqh), 34px); line-height:1; cursor:pointer; user-select:none; transition:transform .08s ease, opacity .12s ease, filter .12s ease, box-shadow .12s ease, background .12s ease; }
      .wb-link-tile:focus,.wb-link-tile:focus-visible,.wb-link-tile:active { outline:none; filter:none; }
      .wb-link-tile.empty { visibility:hidden; pointer-events:none; }
      .wb-link-tile.stone { color:transparent; pointer-events:none; background:linear-gradient(135deg,#d9dee4,#aeb7c1); border-color:#aab3bd; box-shadow:inset 5px 0 0 rgba(255,255,255,.22), inset -4px -4px 0 rgba(80,90,105,.18); }
      .wb-link-tile.sel { transform:translateY(-3px); background:radial-gradient(circle at 30% 18%,rgba(255,255,255,.95),transparent 36%),linear-gradient(145deg,#ecfff9,#d4f7ee 62%,#c2eadf); border-color:color-mix(in srgb,#55cbb1 72%,var(--wb-border) 28%); box-shadow:0 0 0 2px rgba(85,203,177,.36), 0 7px 16px rgba(15,23,42,.14), inset 0 1px 0 rgba(255,255,255,.82); z-index:2; }
      .wb-link-tile.hint { border-color:#f5c94f; box-shadow:0 0 0 2px rgba(245,201,79,.34), inset 0 1px 0 rgba(255,255,255,.76); animation:wbLinkHint .8s ease-in-out infinite alternate; }
      .wb-link-tile.bad { filter:sepia(.15) saturate(1.3); border-color:#ef4444; animation:wbLinkBad .18s linear; }
      .wb-link-tile.gone { transform:scale(.72); opacity:0; pointer-events:none; }
      .wb-link-line { position:absolute; inset:var(--ll-pad); z-index:5; pointer-events:none; overflow:visible; }
      .wb-link-line path { fill:none; stroke:#55cbb1; stroke-width:1.35; stroke-linecap:round; stroke-linejoin:round; filter:drop-shadow(0 0 3px rgba(85,203,177,.34)); vector-effect:non-scaling-stroke; }
      .wb-link-line.hint path { stroke:#f5c94f; stroke-dasharray:4 3; }
      .wb-link-line.magic path { stroke:#b28dff; }
      .wb-link-tools { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:6px; height:38px; }
      .wb-link-tool { position:relative; min-width:0; height:38px; padding:2px 5px; border:1px solid var(--wb-border); border-radius:9px; background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 88%,var(--wb-bg) 12%),color-mix(in srgb,var(--wb-soft) 74%,var(--wb-bg) 26%)); color:var(--wb-text); font-size:11px; font-weight:1000; display:flex; align-items:center; justify-content:center; gap:4px; white-space:nowrap; box-shadow:0 3px 10px color-mix(in srgb,#000 10%,transparent 90%), inset 0 1px 0 color-mix(in srgb,var(--wb-text) 9%,transparent 91%); }
      .wb-link-tool i { font-style:normal; font-size:13px; line-height:1; }
      .wb-link-tool:disabled { opacity:.42; filter:grayscale(.75); }
      .wb-link-tool.hint { animation:wbLinkPulse .8s ease-in-out 1; }
      .wb-link-tool .badge { position:static; display:inline-grid; place-items:center; min-width:16px; height:16px; padding:0 4px; border-radius:999px; background:color-mix(in srgb,var(--wb-accent) 72%,var(--wb-panel) 28%); color:var(--wb-on-accent,#fff); border:1px solid color-mix(in srgb,var(--wb-border) 55%,var(--wb-accent) 45%); font-size:10px; line-height:1; }
      .wb-link-rule { min-height:16px; color:var(--wb-muted); font-size:11px; font-weight:900; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .wb-link-combo,.wb-link-toast { position:absolute; left:50%; top:42%; transform:translate(-50%,-50%); z-index:8; pointer-events:none; padding:7px 12px; border-radius:999px; background:rgba(15,23,42,.82); color:#fff; font-weight:1000; box-shadow:0 8px 22px rgba(15,23,42,.24); animation:wbLinkFloat .9s ease forwards; }
      .wb-link-combo.hot { color:#fde68a; } .wb-link-combo.fire { color:#fdba74; }
      @keyframes wbLinkFloat { 0%{opacity:0;transform:translate(-50%,-28%)} 20%,75%{opacity:1;transform:translate(-50%,-50%)} 100%{opacity:0;transform:translate(-50%,-74%)} }
      @keyframes wbLinkHint { to { box-shadow:0 0 0 3px rgba(245,201,79,.42), inset 0 1px 0 rgba(255,255,255,.76); } }
      @keyframes wbLinkBad { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-2px)} 75%{transform:translateX(2px)} }
      @keyframes wbLinkPulse { to { filter:brightness(1.1); box-shadow:0 0 12px color-mix(in srgb,var(--wb-accent) 35%,transparent 65%); } }
      @media (max-width:700px), (pointer:coarse) {
        .wb-link { gap:5px; }
        .wb-link-top { grid-template-columns:minmax(56px,.8fr) minmax(92px,1.45fr) minmax(54px,.78fr) auto; gap:4px; padding-bottom:4px; }
        .wb-link-level small,.wb-link-total small { font-size:9px; }
        .wb-link-level b,.wb-link-total b { font-size:12px; }
        .wb-link-progress { font-size:10px; gap:3px; }
        .wb-link-time { min-width:58px; height:25px; padding:0 6px; font-size:11px; }
        .wb-link-board { --ll-pad:4px; gap:0; width:min(100%, calc((100cqh - 94px) * var(--ll-ratio)), 520px); max-height:calc(100cqh - 94px); }
        .wb-link-tools { height:32px; gap:4px; }
        .wb-link-tool { height:32px; padding:1px 3px; font-size:10px; border-radius:7px; }
        .wb-link-rule { min-height:14px; font-size:10px; }
      }
      .wb-bj { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr); gap:8px; overflow:hidden; color:var(--wb-text); }
      .wb-bj-top { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:4px 2px 7px; border-bottom:1px solid color-mix(in srgb,var(--wb-border) 76%,transparent 24%); }
      .wb-bj-title { display:flex; align-items:center; gap:8px; font-weight:1000; font-size:16px; white-space:nowrap; }
      .wb-bj-point-toggle { height:24px; padding:0 8px; border:1px solid color-mix(in srgb,var(--wb-border) 70%,var(--wb-accent) 30%); border-radius:999px; background:color-mix(in srgb,var(--wb-panel) 78%,transparent 22%); color:var(--wb-text); font-size:11px; font-weight:1000; white-space:nowrap; cursor:pointer; }
      .wb-bj-point-toggle.active { border-color:color-mix(in srgb,var(--wb-gold) 72%,var(--wb-border) 28%); background:color-mix(in srgb,var(--wb-gold) 24%,var(--wb-panel) 76%); }
      .wb-bj-title small,.wb-bj-total { color:var(--wb-muted); font-size:12px; font-weight:900; }
      .wb-bj-table { position:relative; min-height:0; display:grid; grid-template-rows:auto minmax(76px,.9fr) auto minmax(92px,1fr) auto auto auto; gap:6px; padding:9px; border:1px solid color-mix(in srgb,var(--wb-border) 74%,var(--wb-accent) 26%); border-radius:24px; background:radial-gradient(circle at 18% 8%,rgba(255,255,255,.24),transparent 26%),linear-gradient(145deg,color-mix(in srgb,var(--wb-board) 76%,#0f766e 24%),color-mix(in srgb,var(--wb-bg) 62%,#111827 38%)); box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 12px 28px color-mix(in srgb,#000 16%,transparent 84%); overflow:hidden; }
      .wb-bj-playerbar { display:grid; grid-template-columns:34px minmax(0,1fr) auto; grid-template-rows:auto 6px; align-items:center; gap:3px 7px; min-width:0; }
      .wb-bj-playerbar.user { grid-template-columns:minmax(0,1fr) auto; }
      .wb-bj-avatar { width:32px; height:32px; border-radius:50%; display:grid; place-items:center; overflow:hidden; background:linear-gradient(135deg,var(--wb-accent),var(--wb-accent2)); color:var(--wb-on-accent,#fff); font-weight:1000; box-shadow:0 3px 10px color-mix(in srgb,#000 18%,transparent 82%); }
      .wb-bj-avatar img { width:100%; height:100%; object-fit:cover; display:block; }
      .wb-bj-name { min-width:0; display:flex; align-items:center; gap:5px; font-weight:1000; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
      .wb-bj-name small { color:var(--wb-muted); font-size:11px; font-weight:900; }
      .wb-bj-score { position:relative; font-weight:1000; font-size:12px; color:var(--wb-text); white-space:nowrap; }
      .wb-bj-progress { grid-column:1 / -1; height:6px; border-radius:999px; overflow:hidden; background:color-mix(in srgb,var(--wb-panel) 64%,#000 12%); border:1px solid color-mix(in srgb,var(--wb-border) 72%,transparent 28%); }
      .wb-bj-progress span { display:block; height:100%; width:0; transition:width .35s ease; }
      .wb-bj-progress.user span { background:linear-gradient(90deg,#65d6bd,#a7f3d0); }
      .wb-bj-progress.char span { background:linear-gradient(90deg,#fb923c,#fed7aa); }
      .wb-bj-hand { min-height:64px; display:flex; align-items:center; justify-content:center; gap:0; padding:2px 0; overflow:hidden; }
      .wb-bj-card { position:relative; flex:0 0 clamp(38px,10.5vw,58px); width:clamp(38px,10.5vw,58px); aspect-ratio:2.5/3.5; margin-left:clamp(-13px,-2.5vw,-5px); border:1px solid #d5dce2; border-radius:8px; background:#fffdfc; color:#27343a; box-shadow:0 4px 10px rgba(15,23,42,.16); font-weight:1000; overflow:hidden; animation:wbBjDeal .25s ease-out both; }
      .wb-bj-card:first-child { margin-left:0; }
      .wb-bj-card.red { color:#d95c5c; }
      .wb-bj-card.back { background:url('${OLDMAID_BACK_URL}') center / 100% 100% no-repeat,#29384d; border-color:#223149; }
      .wb-bj-card .corner { position:absolute; left:4px; top:4px; display:grid; line-height:.92; font-size:clamp(10px,2.5vw,14px); }
      .wb-bj-card .pip { position:absolute; inset:0; display:grid; place-items:center; font-size:clamp(22px,6vw,34px); opacity:.88; }
      .wb-bj-points { visibility:hidden; min-height:22px; text-align:center; font-size:15px; font-weight:1000; color:#f8fafc; text-shadow:0 1px 2px rgba(0,0,0,.25); }
      .wb-bj.show-points .wb-bj-points { visibility:visible; }
      .wb-bj-points.good { color:#a7f3d0; } .wb-bj-points.gold { color:#facc15; } .wb-bj-points.bust { color:#fb7185; animation:wbBjShake .22s linear; }
      .wb-bj-mid { display:flex; align-items:center; justify-content:center; gap:16px; min-height:46px; color:#f8fafc; font-size:12px; font-weight:900; }
      .wb-bj-status { min-width:132px; max-width:52%; padding:6px 10px; border-radius:999px; text-align:center; background:rgba(15,23,42,.42); border:1px solid rgba(255,255,255,.2); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
      .wb-bj-deck { position:relative; width:44px; height:36px; margin:auto; }
      .wb-bj-deck i { position:absolute; width:28px; height:36px; border:1px solid #223149; border-radius:7px; background:url('${OLDMAID_BACK_URL}') center / 100% 100% no-repeat,#29384d; box-shadow:0 2px 6px rgba(0,0,0,.18); }
      .wb-bj-deck i:nth-child(1){ left:0; top:3px; } .wb-bj-deck i:nth-child(2){ left:6px; top:1px; } .wb-bj-deck i:nth-child(3){ left:12px; top:0; }
      .wb-bj-tools { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; }
      .wb-bj-tool { position:relative; min-width:0; height:44px; padding:4px 5px; border:1px solid color-mix(in srgb,var(--wb-border) 76%,var(--wb-accent) 24%); border-radius:12px; background:color-mix(in srgb,var(--wb-panel) 82%,transparent 18%); color:var(--wb-text); font-size:12px; font-weight:1000; display:flex; align-items:center; justify-content:center; gap:4px; white-space:nowrap; box-shadow:inset 0 1px 0 rgba(255,255,255,.22); }
      .wb-bj-tool.ready { outline:2px solid var(--wb-gold); }
      .wb-bj-tool:disabled { opacity:.35; filter:grayscale(.8); }
      .wb-bj-tool .badge { position:static; display:inline-grid; place-items:center; min-width:17px; height:17px; padding:0 4px; border-radius:999px; background:color-mix(in srgb,var(--wb-accent) 72%,var(--wb-panel) 28%); color:var(--wb-on-accent,#fff); font-size:10px; line-height:1; }
      .wb-bj-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .wb-bj-action { min-height:46px; border:0; border-radius:14px; font-size:16px; font-weight:1000; color:#fff; box-shadow:0 6px 16px color-mix(in srgb,#000 20%,transparent 80%), inset 0 1px 0 rgba(255,255,255,.24); }
      .wb-bj-hit { background:linear-gradient(135deg,#0f766e,#22c55e); }
      .wb-bj-stand { background:linear-gradient(135deg,#b45309,#f59e0b); }
      .wb-bj-action:disabled { opacity:.45; filter:grayscale(.65); }
      .wb-bj-float,.wb-bj-choice { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); z-index:30; border-radius:18px; background:rgba(15,23,42,.88); color:#fff; border:1px solid rgba(255,255,255,.22); box-shadow:0 14px 32px rgba(0,0,0,.28); font-weight:1000; }
      .wb-bj-float { padding:10px 16px; animation:wbBjFloat 1.35s ease forwards; pointer-events:none; }
      .wb-bj-choice { min-width:min(280px,86%); padding:14px; display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; }
      .wb-bj-choice span { flex:1 1 100%; text-align:center; }
      .wb-bj-choice button { min-width:86px; min-height:34px; border-radius:10px; border:1px solid rgba(255,255,255,.28); background:rgba(255,255,255,.1); color:#fff; font-weight:1000; }
      .wb-bj-choice button.primary { background:linear-gradient(135deg,#0f766e,#22c55e); border-color:transparent; }
      .wb-bj-gain { position:absolute; right:0; top:-20px; color:#facc15; font-size:12px; font-weight:1000; pointer-events:none; animation:wbBjGain .52s ease-out forwards; text-shadow:0 1px 4px rgba(0,0,0,.32); }
      @keyframes wbBjDeal { from { transform:translate(22px,-18px) scale(.82); opacity:0; } to { transform:none; opacity:1; } }
      @keyframes wbBjGain { to { transform:translateY(-20px); opacity:0; } }
      @keyframes wbBjFloat { 0% { opacity:0; transform:translate(-50%,-42%); } 18%,78% { opacity:1; transform:translate(-50%,-50%); } 100% { opacity:0; transform:translate(-50%,-64%); } }
      @keyframes wbBjShake { 0%,100% { transform:translateX(0); } 25% { transform:translateX(-3px); } 75% { transform:translateX(3px); } }
      @media (max-width:700px), (pointer:coarse) {
        .wb-bj { gap:5px; }
        .wb-bj-top { padding-bottom:4px; }
        .wb-bj-title { font-size:14px; gap:5px; }
        .wb-bj-point-toggle { height:22px; padding:0 6px; font-size:10px; }
        .wb-bj-table { grid-template-rows:auto minmax(56px,.75fr) auto minmax(70px,.9fr) auto auto auto; gap:4px; padding:6px; border-radius:18px; }
        .wb-bj-hand { min-height:50px; }
        .wb-bj-card { flex-basis:clamp(34px,10vw,48px); width:clamp(34px,10vw,48px); }
        .wb-bj-mid { min-height:38px; gap:9px; }
        .wb-bj-status { min-width:108px; padding:5px 8px; }
        .wb-bj-tool { height:36px; font-size:11px; padding:2px 3px; }
        .wb-bj-action { min-height:42px; font-size:15px; }
      }
      .wb-spider { --sp-card-w:clamp(23px,8vw,44px); --sp-card-h:calc(var(--sp-card-w) * 1.38); --sp-col-gap:2px; width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; gap:4px; overflow:hidden; position:relative; }
      .wb-spider-top { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:4px; align-items:center; padding:0 2px; border-bottom:1px solid color-mix(in srgb,var(--wb-border) 72%,transparent 28%); }
      .wb-spider-stat { min-width:0; padding:2px 3px; text-align:center; line-height:1.02; background:transparent; border:0; border-right:1px solid color-mix(in srgb,var(--wb-border) 70%,transparent 30%); }
      .wb-spider-stat:last-child { border-right:0; }
      .wb-spider-stat small { display:block; font-size:9px; color:var(--wb-muted); font-weight:800; }
      .wb-spider-stat b { display:block; margin-top:1px; font-size:13px; color:var(--wb-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .wb-spider-deckbar { display:flex; align-items:center; justify-content:space-between; gap:5px; min-height:42px; padding:4px 6px; border-bottom:1px solid color-mix(in srgb,var(--wb-border) 70%,transparent 30%); }
      .wb-spider-dealinfo { flex:0 0 auto; min-width:0; }
      .wb-spider-pilebox { height:34px; min-width:48px; display:flex; align-items:center; justify-content:center; border:0; background:transparent; box-shadow:none; padding:2px 3px; }
      .wb-spider-pilebox.collect { flex:1 1 auto; min-width:78px; justify-content:flex-start; overflow:hidden; }
      .wb-spider-deckside { display:flex; align-items:center; gap:5px; flex:1 1 auto; min-width:0; justify-content:flex-end; }
      .wb-spider-deckpile { position:relative; width:42px; height:28px; flex:0 0 42px; }
      .wb-spider-deckpile span { position:absolute; width:20px; height:28px; border:1px solid #26344f; background:url('${SPIDER_BACK_URL}') center / 100% 100% no-repeat,#243858; box-shadow:0 1px 4px rgba(15,23,42,.22); }
      .wb-spider-deckpile span:nth-child(1){ left:0; top:2px; } .wb-spider-deckpile span:nth-child(2){ left:7px; top:1px; } .wb-spider-deckpile span:nth-child(3){ left:14px; top:0; }
      .wb-spider-deckpile.dealt span:nth-child(3) { opacity:0; transform:translateY(-4px); transition:.18s ease; }
      .wb-spider-collectpile { width:100%; max-width:240px; height:32px; flex:1 1 auto; color:#243449; display:flex; align-items:center; overflow:hidden; padding-left:2px; }
      .wb-spider-collectpile.empty { opacity:.38; }
      .wb-spider-collect-card { position:relative; flex:0 0 22px; width:22px; height:30px; margin-left:-7px; border:1px solid #aeb9c8; background:#fffdf8; color:#172033; font-weight:900; box-shadow:0 1px 4px rgba(15,23,42,.14); overflow:hidden; }
      .wb-spider-collect-card:first-child { margin-left:0; }
      .wb-spider-collect-card.red { color:#d94b55; border-color:#e89aa3; }
      .wb-spider-collect-card .corner,.wb-spider-collect-fly .corner { position:absolute; left:2px; top:2px; font-size:8px; line-height:.95; letter-spacing:-.5px; }
      .wb-spider-collect-card .pip,.wb-spider-collect-fly .pip { position:absolute; inset:0; display:grid; place-items:center; font-size:14px; opacity:.86; }
      .wb-spider-collect-card .rank-bottom,.wb-spider-collect-fly .rank-bottom { position:absolute; right:2px; bottom:2px; font-size:7px; transform:rotate(180deg); line-height:.95; }
      .wb-spider-collect-fly { position:fixed; width:26px; height:36px; border:1px solid #aeb9c8; background:#fffdf8; color:#172033; z-index:1000004; pointer-events:none; font-weight:900; box-shadow:0 4px 14px rgba(15,23,42,.22); animation:wbSpiderCollectFly .32s ease-in forwards; overflow:hidden; }
      .wb-spider-collect-fly.red { color:#d94b55; border-color:#e89aa3; }
      .wb-spider-countdown { display:inline-flex; align-items:center; justify-content:center; min-height:28px; padding:4px 10px; border:1px solid rgba(15,118,110,.28); background:linear-gradient(180deg,rgba(240,253,250,.92),rgba(204,251,241,.46)); box-shadow:inset 0 1px 0 rgba(255,255,255,.62),0 2px 8px rgba(15,118,110,.08); font-weight:900; color:#0f766e; line-height:1.1; }
      .wb-spider-countdown.warn { color:#d97706; }
      .wb-spider-countdown.danger { color:#ea580c; animation:wbSpiderPulse .7s ease-in-out infinite alternate; }
      .wb-spider-deck { min-width:62px; height:34px; border:1px solid #60708c; border-radius:5px; background:#fff7df; color:#273449; display:flex; align-items:center; justify-content:center; gap:4px; font-weight:900; box-shadow:0 2px 7px rgba(37,59,99,.13); cursor:pointer; white-space:nowrap; word-break:keep-all; line-height:1; flex:0 0 auto; }
      .wb-spider-deck::before { content:'☞'; font-size:16px; line-height:1; }
      .wb-spider-deck.blocked { opacity:.55; filter:saturate(.72); }
      .wb-spider-board { min-height:0; display:grid; grid-template-columns:repeat(10,minmax(0,1fr)); gap:var(--sp-col-gap); align-items:start; overflow:hidden; padding:3px 2px 5px; border:1px solid color-mix(in srgb,var(--wb-border) 65%,#a8c8c4 35%); border-radius:10px; background:linear-gradient(180deg,rgba(236,250,246,.70),rgba(255,248,236,.72)); touch-action:pan-y; }
      .wb-spider-col { position:relative; min-height:calc(var(--sp-card-h) + 12px); border:1px solid rgba(81,119,118,.18); border-radius:4px; padding:1px; transition:border-color .15s,box-shadow .15s,background .15s; }
      .wb-spider-col.legal { border-color:#22c55e; box-shadow:0 0 0 2px rgba(34,197,94,.22); background:rgba(220,252,231,.28); }
      .wb-spider-col.illegal { border-color:#ef4444; box-shadow:0 0 0 2px rgba(239,68,68,.2); }
      .wb-spider-col.empty-warn { border-color:#f59e0b; box-shadow:0 0 0 2px rgba(245,158,11,.2); }
      .wb-spider-col.overflow { border-color:#ef4444; box-shadow:0 0 0 2px rgba(239,68,68,.28); animation:wbSpiderShake .25s linear; }
      .wb-spider-card { position:absolute; left:50%; width:var(--sp-card-w); height:var(--sp-card-h); margin-left:calc(var(--sp-card-w) / -2); border:1px solid #aeb9c8; border-radius:1px; background:#fffdf8; color:#172033; font-weight:900; box-shadow:0 1px 4px rgba(15,23,42,.15); user-select:none; touch-action:none; box-sizing:border-box; transition:transform .14s,box-shadow .14s,border-color .14s,opacity .14s; z-index:1; overflow:hidden; }
      .wb-spider-card.red { color:#d94b55; border-color:#e89aa3; }
      .wb-spider-card.back { background:url('${SPIDER_BACK_URL}') center / 100% 100% no-repeat,#243858; color:transparent; border-color:#20324f; box-shadow:0 1px 4px rgba(15,23,42,.18); }
      .wb-spider-card .corner { position:absolute; left:2px; top:2px; font-size:clamp(8px,1.7cqw,12px); line-height:.95; letter-spacing:-.5px; }
      .wb-spider-card .pip { position:absolute; inset:0; display:grid; place-items:center; font-size:clamp(14px,2.8cqw,22px); opacity:.86; }
      .wb-spider-card .rank-bottom { position:absolute; right:2px; bottom:2px; font-size:clamp(7px,1.55cqw,10px); transform:rotate(180deg); line-height:.95; }
      .wb-spider-card.selected { transform:translateY(-8px); border-color:#f0b429; box-shadow:0 0 0 2px rgba(251,191,36,.5),0 6px 14px rgba(15,23,42,.22); z-index:30; }
      .wb-spider-card.eliminate-choice { box-shadow:0 0 0 2px rgba(239,68,68,.35),0 5px 14px rgba(239,68,68,.18); }
      .wb-spider-card.hint-card { border-color:#3b82f6; box-shadow:0 0 0 2px rgba(59,130,246,.42),0 5px 14px rgba(59,130,246,.18); z-index:25; }
      .wb-spider-card.moving { opacity:.35; }
      .wb-spider-card.bad { animation:wbSpiderShake .22s linear; }
      .wb-spider-stack.ghost { position:fixed; pointer-events:none; z-index:99999; width:var(--sp-card-w); height:var(--sp-card-h); }
      .wb-spider-drag-card { position:absolute; left:0; width:var(--sp-card-w); height:var(--sp-card-h); border:1px solid #aeb9c8; border-radius:1px; background:#fffdf8; box-shadow:0 8px 20px rgba(15,23,42,.24); color:#172033; font-weight:900; padding:3px; box-sizing:border-box; display:grid; grid-template-rows:auto 1fr auto; overflow:hidden; }
      .wb-spider-drag-card.red { color:#d94b55; border-color:#e89aa3; }
      .wb-spider-done { display:none; }
      .wb-spider-tools { height:34px; display:flex; align-items:center; justify-content:center; gap:8px; padding:1px 0 0; }
      .wb-spider-tool { width:66px; min-width:66px; height:30px; padding:0 6px; border:1px solid var(--wb-border); border-radius:6px; background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 86%,var(--wb-bg) 14%),color-mix(in srgb,var(--wb-soft) 72%,var(--wb-bg) 28%)); color:var(--wb-text); font-weight:900; box-shadow:0 3px 10px color-mix(in srgb,#000 12%,transparent 88%), inset 0 1px 0 color-mix(in srgb,var(--wb-text) 10%,transparent 90%); position:relative; display:inline-flex; align-items:center; justify-content:center; gap:4px; white-space:nowrap; }
      .wb-spider-tool.end { width:58px; min-width:58px; border-color:color-mix(in srgb,var(--wb-accent) 52%,var(--wb-border) 48%); background:linear-gradient(180deg,color-mix(in srgb,var(--wb-accent) 18%,var(--wb-panel) 82%),color-mix(in srgb,var(--wb-accent) 28%,var(--wb-bg) 72%)); color:var(--wb-text); }
      .wb-spider-tool.active { border-color:#ef4444; box-shadow:0 0 0 2px rgba(239,68,68,.22); }
      .wb-spider-tool.hint-on { border-color:#3b82f6; box-shadow:0 0 0 2px rgba(59,130,246,.24); }
      .wb-spider-tool .left { position:static; display:inline-grid; place-items:center; min-width:16px; height:16px; border-radius:999px; background:color-mix(in srgb,var(--wb-accent) 72%,var(--wb-panel) 28%); color:var(--wb-on-accent,#fff); border:1px solid color-mix(in srgb,var(--wb-border) 55%,var(--wb-accent) 45%); font-size:10px; line-height:1; }
      .wb-spider-fly { position:fixed; width:26px; height:36px; border:1px solid #20324f; border-radius:1px; background:url('${SPIDER_BACK_URL}') center / 100% 100% no-repeat,#243858; z-index:1000004; pointer-events:none; animation:wbSpiderFly .34s ease-in-out forwards; }
      .wb-spider-toast { position:absolute; left:50%; top:44%; transform:translate(-50%,-50%); padding:8px 13px; border-radius:999px; background:rgba(17,24,39,.84); color:#fff; font-weight:900; pointer-events:none; z-index:50; animation:wbSpiderFloat 1.4s ease forwards; }
      @keyframes wbSpiderPulse { from { box-shadow:0 0 0 rgba(234,88,12,0); } to { box-shadow:0 0 16px rgba(234,88,12,.45); } }
      @keyframes wbSpiderShake { 0%,100% { transform:translateX(0); } 25% { transform:translateX(-3px); } 75% { transform:translateX(3px); } }
      @keyframes wbSpiderFly { to { transform:translate(var(--sp-fly-x),var(--sp-fly-y)) scale(.86); opacity:.16; } }
      @keyframes wbSpiderCollectFly { to { transform:translate(var(--sp-fly-x),var(--sp-fly-y)) scale(.72); opacity:.10; } }
      @keyframes wbSpiderFloat { 0% { opacity:0; transform:translate(-50%,-40%); } 18%,78% { opacity:1; transform:translate(-50%,-50%); } 100% { opacity:0; transform:translate(-50%,-65%); } }
      .wb-text-segments { white-space:normal; line-height:1.75; }
      .wb-text-seg { margin:0 0 12px; }
      .wb-text-seg:last-child { margin-bottom:0; }
      .wb-text-segments h1, .wb-text-segments h2, .wb-text-segments h3, .wb-text-segments h4, .wb-text-segments h5, .wb-text-segments h6 { margin:10px 0 8px; color:var(--wb-accent); line-height:1.35; letter-spacing:0; }
      .wb-text-segments h1 { font-size:18px; }
      .wb-text-segments h2 { font-size:16px; }
      .wb-text-segments h3, .wb-text-segments h4, .wb-text-segments h5, .wb-text-segments h6 { font-size:14px; }
      .wb-text-segments ul { margin:0 0 12px 18px; padding:0; }
      .wb-text-segments li { margin:3px 0; }
      .wb-text-segments code { padding:1px 4px; border-radius:4px; background:color-mix(in srgb, var(--wb-border) 18%, transparent 82%); font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.92em; }
      .wb-text-segments pre { margin:0 0 12px; padding:9px 10px; border:1px solid var(--wb-border); border-radius:6px; background:color-mix(in srgb, var(--wb-soft) 80%, #000 20%); overflow:auto; white-space:pre-wrap; }
      .wb-watermelon-canvas { aspect-ratio:4 / 5; max-height:min(100%, 100cqh); background:#f7efe3; }
      .wb-ludo-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0, 1fr); gap:6px; place-items:center; overflow:hidden; }
      .wb-ludo { --wb-ludo-pad:7px; width:min(460px, 100%, calc(100cqh - 68px)); height:min(460px, 100%, calc(100cqh - 68px)); aspect-ratio:1 / 1; position:relative; display:grid; grid-template-columns:repeat(11,minmax(0,1fr)); grid-template-rows:repeat(11,minmax(0,1fr)); gap:2px; background:#f4c8d6; padding:7px; border:1px solid rgba(174,82,115,.28); contain:layout size; box-sizing:border-box; }
      .wb-ludo-flight-layer { position:absolute; inset:var(--wb-ludo-pad); pointer-events:none; z-index:4; overflow:visible; }
      .wb-ludo-flight-line { fill:none; stroke-width:2px; stroke-dasharray:5 5; stroke-linecap:round; opacity:.72; vector-effect:non-scaling-stroke; }
      .wb-ludo-flight-line.red { stroke:#d84b42; }
      .wb-ludo-flight-line.blue { stroke:#2773c8; }
      .wb-ludo-cell { position:relative; border:1px solid rgba(174,82,115,.13); background:#fff1f5; min-width:0; min-height:0; display:flex; flex-wrap:wrap; align-items:center; justify-content:center; align-content:center; gap:1px; font-size:10px; overflow:hidden; }
      .wb-ludo-cell.path { background:#fde7ee; }
      .wb-ludo-cell.home-red { background:#f7c4cf; }
      .wb-ludo-cell.home-blue { background:#e7d7f5; }
      .wb-ludo-cell.flight-red { background:linear-gradient(rgba(216,75,66,.38), rgba(216,75,66,.38)), var(--wb-ludo-cell-base, #fde7ee); box-shadow:inset 0 0 0 2px rgba(216,75,66,.38); }
      .wb-ludo-cell.flight-blue { background:linear-gradient(rgba(39,115,200,.38), rgba(39,115,200,.38)), var(--wb-ludo-cell-base, #fde7ee); box-shadow:inset 0 0 0 2px rgba(39,115,200,.38); }
      .wb-ludo-cell.flight-red.flight-blue { background:linear-gradient(135deg, rgba(216,75,66,.42) 0 50%, rgba(39,115,200,.42) 50% 100%), var(--wb-ludo-cell-base, #fde7ee); box-shadow:inset 0 0 0 2px rgba(115,78,160,.38); }
      .wb-ludo-piece { position:relative; z-index:5; width:44%; height:auto; aspect-ratio:1 / 1; min-width:14px; max-width:22px; padding:0; border-radius:50%; border:1px solid rgba(0,0,0,.28); display:grid; place-items:center; color:#fff; font-size:11px; line-height:1; text-align:center; font-weight:900; cursor:pointer; box-shadow:0 2px 6px rgba(0,0,0,.22); flex:0 0 auto; }
      .wb-ludo-piece:only-child { width:60%; max-width:24px; }
      .wb-ludo-piece.red { background:#d84b42; }
      .wb-ludo-piece.blue { background:#2773c8; }
      .wb-ludo-piece.can { outline:2px solid var(--wb-accent); outline-offset:2px; }
      .wb-ludo-info { display:flex; gap:6px; align-items:center; justify-content:center; flex-wrap:wrap; margin:0; }
      .wb-ludo-dice { width:38px; height:38px; padding:4px; box-sizing:border-box; display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); place-items:center; border:1px solid var(--wb-border); border-radius:8px; background:#fffdf8; box-shadow:0 2px 8px rgba(15,23,42,.14), inset 0 0 0 1px rgba(255,255,255,.8); }
      .wb-ludo-dice.rolling { animation:wbDicePulse .18s linear infinite; }
      .wb-ludo-dot { width:6px; height:6px; border-radius:50%; background:#28313f; box-shadow:inset 0 1px 1px rgba(255,255,255,.2); }
      .wb-ludo-dice.one .wb-ludo-dot { width:12px; height:12px; background:#d84b42; }
      @keyframes wbDicePulse { 0% { transform:rotate(-5deg) scale(1); } 50% { transform:rotate(5deg) scale(1.08); } 100% { transform:rotate(-5deg) scale(1); } }
      .wb-gcell { position:relative; border:0; border-radius:50%; background:#d7b37c; cursor:pointer; min-width:0; min-height:0; aspect-ratio:1; overflow:hidden; }
      .wb-gcell.black { background:#222; box-shadow:inset 0 0 0 2px #000; }
      .wb-gcell.white { background:#f7f2e9; box-shadow:inset 0 0 0 2px #ddd; }
      .wb-gcell.char-last { outline:3px solid var(--wb-accent); outline-offset:-2px; }
      .wb-gcell.eatable { outline:2px solid var(--wb-accent); outline-offset:-2px; box-shadow:0 0 0 2px rgba(239,68,68,.45), inset 0 0 0 2px #ddd; }
      .wb-gcell.recycle { outline:3px solid var(--wb-gold); outline-offset:-2px; animation:wbGomokuPulse .75s ease-in-out infinite; }
      .wb-gcell.eaten { outline:3px solid #ef4444; outline-offset:-2px; animation:wbGomokuEat .7s ease-in-out infinite; }
      .wb-gomoku-endless-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:42px minmax(0,1fr); gap:6px; place-items:center; overflow:hidden; }
      .wb-gomoku-endless-panel .wb-gomoku { align-self:center; justify-self:center; width:min(560px, 100%, calc(100cqh - 48px)); max-height:100%; }
      .wb-gomoku-info { width:100%; height:42px; min-height:42px; display:grid; grid-template-columns:minmax(0,.8fr) minmax(0,1.35fr) minmax(0,1.35fr) minmax(70px,auto); gap:6px; align-items:stretch; justify-items:stretch; overflow:hidden; }
      .wb-gomoku-stat { min-width:0; height:42px; display:grid; grid-template-rows:13px 1fr; place-items:center; padding:2px 4px; border:1px solid var(--wb-border); border-radius:8px; background:var(--wb-panel); box-sizing:border-box; overflow:hidden; }
      .wb-gomoku-stat span { font-size:10px; line-height:1; font-weight:800; color:var(--wb-muted); }
      .wb-gomoku-stat b { min-width:0; max-width:100%; font-size:10px; line-height:1.08; font-weight:900; color:var(--wb-text); text-align:center; white-space:normal; word-break:keep-all; overflow:visible; }
      .wb-gomoku-info .wb-cheat-btn { align-self:center; justify-self:stretch; min-height:32px; height:36px; white-space:nowrap; padding:4px 8px; }
      @keyframes wbGomokuPulse { 0%,100% { transform:scale(1); filter:brightness(1); } 50% { transform:scale(1.18); filter:brightness(1.28); } }
      @keyframes wbGomokuEat { 0%,100% { transform:scale(1); filter:brightness(1); } 50% { transform:scale(.82); filter:brightness(1.45); } }
      .wb-memory-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0, 1fr); gap:8px; justify-items:center; align-items:center; align-content:stretch; overflow:hidden; }
      .wb-memory-panel .wb-guess-row { align-self:start; justify-content:center; }
      .wb-memory { width:min(420px, 100%, calc(100cqh - 54px)); height:auto; max-width:100%; aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); grid-template-rows:repeat(4,minmax(0,1fr)); gap:10px; padding:6px; box-sizing:border-box; contain:layout size; align-self:center; justify-self:center; }
      .wb-memory-card { position:relative; border:0; background:transparent; color:var(--wb-accent); font-size:clamp(22px,5vh,36px); font-weight:900; display:block; width:100%; height:100%; cursor:pointer; min-width:0; min-height:0; aspect-ratio:1 / 1; padding:0; overflow:hidden; perspective:800px; transition:.16s transform,.16s opacity; }
      .wb-memory-card.open .wb-memory-inner { transform:rotateY(180deg); }
      .wb-memory-card.done { opacity:0; pointer-events:none; transform:scale(.86); }
      .wb-memory-inner { position:absolute; inset:0; transform-style:preserve-3d; transition:transform .42s cubic-bezier(.2,.75,.2,1); }
      .wb-memory-face { position:absolute; inset:0; display:grid; place-items:center; overflow:hidden; border:1px solid var(--wb-border); border-radius:6px; backface-visibility:hidden; box-shadow:0 4px 10px rgba(0,0,0,.12); }
      .wb-memory-back { background:url('${MEMORY_CARD_URL}') center / 100% 100% no-repeat, var(--wb-panel); }
      .wb-memory-back::after { content:''; display:none; }
      .wb-memory-front { background:var(--wb-panel); transform:rotateY(180deg); box-shadow:inset 0 0 0 2px var(--wb-accent2), 0 4px 10px rgba(0,0,0,.12); }
      .wb-memory-img { width:100%; height:100%; object-fit:contain; display:block; background:#000; }
      .wb-sudoku-panel { width:min(100%, 520px); height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto auto; gap:8px; place-items:center; overflow:hidden; box-sizing:border-box; padding:0 6px; justify-self:center; }
      .wb-sudoku-top { width:100%; min-width:0; display:flex; justify-content:space-between; align-items:center; gap:8px; }
      .wb-sudoku { width:min(430px, 100%, 68vh); height:min(430px, 100%, 68vh); aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(9,minmax(0,1fr)); grid-template-rows:repeat(9,minmax(0,1fr)); border:3px solid var(--wb-text); background:var(--wb-text); gap:0; box-sizing:border-box; contain:layout size; }
      .wb-sudoku-cell { min-width:0; min-height:0; width:100%; height:100%; aspect-ratio:1 / 1; border:1px solid var(--wb-border); background:var(--wb-panel); color:var(--wb-text); font-weight:900; font-size:clamp(16px, 3.2vh, 24px); padding:0; box-sizing:border-box; line-height:1; display:grid; place-items:center; }
      .wb-sudoku-cell.box-l { border-left:2px solid var(--wb-text); }
      .wb-sudoku-cell.box-r { border-right:2px solid var(--wb-text); }
      .wb-sudoku-cell.box-t { border-top:2px solid var(--wb-text); }
      .wb-sudoku-cell.box-b { border-bottom:2px solid var(--wb-text); }
      .wb-sudoku-cell.fixed { background:var(--wb-soft); color:var(--wb-accent); cursor:pointer; }
      .wb-sudoku-cell.mutable { cursor:pointer; }
      .wb-sudoku-cell.peer { background:color-mix(in srgb, var(--wb-accent2) 10%, var(--wb-panel) 90%); }
      .wb-sudoku-cell.fixed.peer { background:color-mix(in srgb, var(--wb-accent2) 22%, var(--wb-soft) 78%); }
      .wb-sudoku-cell.fixed.same { background:color-mix(in srgb, var(--wb-gold) 46%, var(--wb-soft) 54%); color:var(--wb-text); }
      .wb-sudoku-cell.sel { outline:2px solid var(--wb-accent); z-index:1; }
      .wb-sudoku-cell.wrong { color:#ef4444; box-shadow:inset 0 0 0 2px #ef4444; }
      .wb-sudoku-nums { width:100%; min-width:0; display:grid; grid-template-columns:repeat(9,minmax(0,1fr)); gap:3px; }
      .wb-sudoku-nums .wb-btn { min-width:0; padding:6px 0; }
      .wb-sudoku-tools { justify-content:center; }
      .wb-sudoku-badge { display:inline-grid; place-items:center; min-width:18px; height:18px; margin-left:4px; padding:0 4px; border-radius:999px; background:rgba(255,255,255,.35); color:inherit; font-size:11px; font-weight:900; line-height:1; }
      .wb-uyangle-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto auto auto; gap:5px; overflow:hidden; }
      .wb-uyangle-top { display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; min-width:0; }
      .wb-uyangle-progress { position:relative; width:min(360px, 100%); height:14px; justify-self:center; overflow:hidden; border:1px solid var(--wb-border); border-radius:4px; background:var(--wb-soft); box-shadow:inset 0 1px 0 color-mix(in srgb, var(--wb-panel) 55%, transparent 45%); }
      .wb-uyangle-progress-fill { position:absolute; inset:0 auto 0 0; width:0%; border-radius:inherit; background:linear-gradient(90deg, var(--wb-accent), var(--wb-accent2)); transition:width .16s ease; }
      .wb-uyangle-progress span { position:relative; z-index:1; display:grid; place-items:center; height:100%; color:var(--wb-text); font-size:10px; font-weight:900; text-shadow:0 1px 2px color-mix(in srgb, var(--wb-bg) 72%, transparent 28%); }
      .wb-endless-counter { border-radius:999px; background:var(--wb-panel); box-shadow:none; }
      .wb-endless-counter :is(.wb-uyangle-progress-fill,#wb-screw-progress-fill) { display:none; }
      .wb-uyangle-board { position:relative; width:min(620px, 100%, 100cqh); max-height:100%; aspect-ratio:1.08 / 1; justify-self:center; align-self:center; overflow:hidden; background:color-mix(in srgb, var(--wb-board) 88%, var(--wb-panel) 12%); border:1px solid var(--wb-border); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--wb-panel) 52%, transparent 48%); }
      .wb-uyangle-tile { position:absolute; width:7.8%; aspect-ratio:1 / 1; padding:0; border:1px solid color-mix(in srgb, var(--wb-border) 82%, var(--wb-text) 18%); border-radius:5px; background:var(--wb-panel); box-shadow:0 4px 10px color-mix(in srgb, #000 20%, transparent 80%); display:grid; place-items:center; overflow:hidden; transform:translate(-50%, -50%); transition:transform .12s ease, filter .12s ease, opacity .12s ease; }
      .wb-uyangle-tile img, .wb-uyangle-mini img { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
      .wb-uyangle-tile:not(:disabled) { cursor:pointer; }
      .wb-uyangle-tile:not(:disabled):hover { transform:translate(-50%, -50%) scale(1.05); filter:brightness(1.05); }
      .wb-uyangle-tile:disabled { cursor:default; filter:saturate(.75) brightness(.82); opacity:.82; }
      .wb-uyangle-tile.blocked::after { content:''; position:absolute; inset:0; background:rgba(0,0,0,.18); pointer-events:none; }
      .wb-uyangle-hold, .wb-uyangle-tray { min-height:42px; display:grid; gap:5px; justify-content:center; align-items:center; }
      .wb-uyangle-hold { min-height:36px; grid-template-columns:repeat(3, minmax(0, 44px)); opacity:.95; padding:3px 6px; border:1px solid color-mix(in srgb, var(--wb-border) 72%, transparent 28%); background:color-mix(in srgb, var(--wb-soft) 46%, transparent 54%); justify-self:center; }
      .wb-uyangle-tray-wrap { justify-self:center; padding:5px; border:1px solid color-mix(in srgb, var(--wb-border) 72%, var(--wb-text) 28%); border-radius:6px; background:linear-gradient(180deg, color-mix(in srgb, var(--wb-board) 68%, var(--wb-panel) 32%), color-mix(in srgb, var(--wb-soft) 64%, var(--wb-bg) 36%)); box-shadow:inset 0 1px 0 color-mix(in srgb, var(--wb-panel) 58%, transparent 42%), inset 0 -2px 0 color-mix(in srgb, var(--wb-text) 16%, transparent 84%); }
      .wb-uyangle-tray { grid-template-columns:repeat(7, minmax(0, 44px)); }
      .wb-uyangle-slot { width:44px; height:44px; border:1px dashed color-mix(in srgb, var(--wb-accent2) 58%, var(--wb-border) 42%); background:linear-gradient(180deg, color-mix(in srgb, var(--wb-accent2) 18%, var(--wb-panel) 82%), color-mix(in srgb, var(--wb-accent2) 28%, var(--wb-soft) 72%)); display:grid; place-items:center; border-radius:4px; box-shadow:inset 0 1px 3px color-mix(in srgb, var(--wb-accent2) 22%, transparent 78%); }
      .wb-uyangle-mini { width:100%; height:100%; padding:0; border:1px solid color-mix(in srgb, var(--wb-border) 82%, var(--wb-text) 18%); border-radius:4px; background:var(--wb-panel); overflow:hidden; box-shadow:0 1px 4px color-mix(in srgb, #000 14%, transparent 86%); }
      .wb-uyangle-mini.pickable { cursor:pointer; }
      .wb-uyangle-mini.selected { outline:2px solid var(--wb-accent); outline-offset:-2px; }
      .wb-uyangle-actions { justify-content:center; gap:6px; margin-top:4px; }
      .wb-mines-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:8px; place-items:center; overflow:hidden; }
      .wb-mines-top { width:100%; display:flex; justify-content:center; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
      .wb-mines-board { width:min(560px, 100%, 100cqh); max-height:100%; aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(var(--wb-mines-size,16),minmax(0,1fr)); grid-template-rows:repeat(var(--wb-mines-size,16),minmax(0,1fr)); gap:1px; padding:6px; background:#8f969d; border:2px solid #6c7279; box-shadow:inset 2px 2px 0 rgba(255,255,255,.44), inset -2px -2px 0 rgba(0,0,0,.22); box-sizing:border-box; contain:layout size; justify-self:center; align-self:center; }
      .wb-mines-cell { min-width:0; min-height:0; width:100%; height:100%; padding:0; display:grid; place-items:center; border-radius:0; border:1px solid #6f767d; background:#c5cbd1; color:#20242a; font-weight:900; font-size:clamp(10px, 2.6cqh, 18px); line-height:1; cursor:pointer; box-shadow:inset 2px 2px 0 rgba(255,255,255,.78), inset -2px -2px 0 rgba(64,70,76,.52); }
      .wb-mines-cell.open { background:#aeb5bc; border-color:#8d949b; box-shadow:inset 1px 1px 0 rgba(0,0,0,.18); cursor:default; }
      .wb-mines-cell.mine { color:#111; background:#d6a0a0; }
      .wb-mines-cell.boom { background:#ef4444; color:#fff; animation:wbMineBoom .42s ease-in-out 2; }
      .wb-mines-cell.pulse { animation:wbMinePress .16s ease-in-out 1; }
      .wb-mines-cell.n1 { color:#1857c7; }
      .wb-mines-cell.n2 { color:#18743a; }
      .wb-mines-cell.n3 { color:#c82828; }
      .wb-mines-cell.n4 { color:#29248f; }
      .wb-mines-cell.n5 { color:#8b251f; }
      .wb-mines-cell.n6 { color:#147b86; }
      .wb-mines-cell.n7 { color:#1d1d1d; }
      .wb-mines-cell.n8 { color:#666; }
      .wb-mines-actions { justify-content:center; gap:8px; flex-wrap:nowrap; }
      .wb-mines-actions .wb-btn { min-width:86px; }
      .wb-shuerte-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto auto; gap:8px; place-items:center; overflow:hidden; }
      .wb-shuerte-top { width:100%; display:flex; justify-content:center; align-items:center; gap:6px; flex-wrap:wrap; min-width:0; }
      .wb-shuerte-board { width:min(520px, 100%, 100cqh); max-height:100%; aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(var(--wb-shuerte-size,4),minmax(0,1fr)); grid-template-rows:repeat(var(--wb-shuerte-size,4),minmax(0,1fr)); gap:8px; padding:10px; border-radius:24px; background:linear-gradient(135deg,#f7f0de,#dff3e7); box-shadow:inset 0 0 0 1px rgba(80,96,68,.18), 0 16px 30px rgba(73,86,65,.12); box-sizing:border-box; contain:layout size; justify-self:center; align-self:center; }
      .wb-shuerte-cell { position:relative; min-width:0; min-height:0; width:100%; height:100%; padding:0; display:grid; place-items:center; border:0; border-radius:18px; background:#fffdf7; color:#33402f; font-weight:900; font-size:clamp(18px, 7cqh, 40px); line-height:1; cursor:pointer; box-shadow:0 8px 18px rgba(87,99,69,.13), inset 0 -3px 0 rgba(89,103,67,.08); transition:transform .12s ease, background .18s ease, opacity .18s ease, box-shadow .18s ease; }
      .wb-shuerte-cell:hover { transform:translateY(-1px); }
      .wb-shuerte-cell.done { opacity:.28; transform:scale(.94); background:#dfe8d6; box-shadow:none; cursor:default; }
      .wb-shuerte-cell.good { animation:wbShuerteGood .24s ease-out; background:#dff7e8; color:#18743a; }
      .wb-shuerte-cell.bad { animation:wbShuerteBad .22s ease-in-out; background:#ffe2df; color:#c82828; }
      .wb-shuerte-cell.hint, .wb-shuerte-cell.focus { outline:3px solid #f0b84d; box-shadow:0 0 0 6px rgba(240,184,77,.22), 0 10px 22px rgba(87,99,69,.18); }
      .wb-shuerte-cell.dim { opacity:.32; }
      .wb-shuerte-float { position:absolute; top:8px; right:10px; pointer-events:none; font-size:12px; font-weight:900; animation:wbScoreFloat .52s ease-out forwards; }
      .wb-shuerte-float.good { color:#16964c; }
      .wb-shuerte-float.bad { color:#d62d20; }
      .wb-shuerte-tools { justify-content:center; gap:8px; flex-wrap:wrap; }
      .wb-shuerte-tools .wb-btn { min-width:90px; }
      .wb-shuerte-note { font-size:12px; color:#7a816f; text-align:center; }
      @keyframes wbShuerteGood { 0%{ transform:scale(.92); } 60%{ transform:scale(1.06); } 100%{ transform:scale(1); } }
      @keyframes wbShuerteBad { 0%,100%{ transform:translateX(0); } 25%{ transform:translateX(-4px); } 75%{ transform:translateX(4px); } }
      @keyframes wbScoreFloat { from { opacity:0; transform:translateY(6px) scale(.9); } 20% { opacity:1; } to { opacity:0; transform:translateY(-24px) scale(1.08); } }
      @keyframes wbMinePress { 0%,100% { transform:translateY(0); } 50% { transform:translateY(1px); box-shadow:inset 1px 1px 0 rgba(0,0,0,.24); } }
      @keyframes wbMineBoom { 0%,100% { transform:scale(1); } 50% { transform:scale(1.12); filter:brightness(1.18); } }
      .wb-popstar-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:7px; place-items:center; overflow:hidden; }
      .wb-popstar-top { width:100%; min-width:0; display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:6px; align-items:center; }
      .wb-popstar-stat { min-width:0; height:34px; display:grid; place-items:center; padding:3px 7px; border:1px solid color-mix(in srgb, var(--wb-border) 72%, var(--wb-accent2) 28%); background:linear-gradient(180deg, color-mix(in srgb, var(--wb-panel) 84%, var(--wb-accent2) 16%), color-mix(in srgb, var(--wb-soft) 82%, var(--wb-panel) 18%)); color:var(--wb-text); font-size:12px; font-weight:900; line-height:1.1; text-align:center; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; box-shadow:inset 0 1px 0 rgba(255,255,255,.42); }
      .wb-popstar-stat.target-met { color:#fff; border-color:#16a34a; background:linear-gradient(135deg,#16a34a,#22c55e); box-shadow:0 0 16px rgba(34,197,94,.38), inset 0 1px 0 rgba(255,255,255,.46); }
      .wb-popstar-stage { position:relative; width:var(--wb-popstar-size, min(560px, 100%, 100cqh)); height:var(--wb-popstar-size, min(560px, 100%, 100cqh)); max-width:100%; max-height:100%; aspect-ratio:1 / 1; border:2px solid color-mix(in srgb, var(--wb-accent2) 44%, var(--wb-border) 56%); background:radial-gradient(circle at 22% 18%, rgba(255,255,255,.55), transparent 18%), linear-gradient(180deg,#dff5ff,#fbe7f5 64%,#fff4d9); box-shadow:inset 0 0 0 6px rgba(255,255,255,.24), 0 12px 28px rgba(79,141,247,.15); overflow:hidden; contain:layout size; touch-action:none; box-sizing:border-box; }
      .wb-popstar-board { position:absolute; inset:8px; aspect-ratio:1 / 1; box-sizing:border-box; }
      .wb-popstar-cell { position:absolute; width:10%; height:10%; aspect-ratio:1 / 1; box-sizing:border-box; left:calc(var(--c) * 10%); top:calc(var(--r) * 10%); padding:3px; border:0; background:transparent; cursor:pointer; transition:left .24s cubic-bezier(.2,.8,.2,1), top .28s cubic-bezier(.2,.82,.2,1), transform .16s ease, opacity .18s ease, filter .16s ease; transform:scale(1); z-index:2; }
      .wb-popstar-cell:not(:disabled):hover { transform:scale(1.08); filter:brightness(1.06) saturate(1.08); z-index:4; }
      .wb-popstar-cell.hint { animation:wbPopstarHint .72s ease-in-out infinite alternate; }
      .wb-popstar-cell.removing { opacity:0; transform:scale(.2) rotate(18deg); pointer-events:none; }
      .wb-popstar-cell.settling { animation:wbPopstarSettle .34s ease-out 1; }
      .wb-popstar-block { position:relative; width:100%; height:100%; display:grid; place-items:center; border-radius:10px; background:linear-gradient(145deg, color-mix(in srgb, var(--star-color) 68%, #fff 32%), color-mix(in srgb, var(--star-color) 92%, #000 8%)); box-shadow:inset 0 2px 0 rgba(255,255,255,.45), inset 0 -5px 9px rgba(0,0,0,.16), 0 4px 10px rgba(42,66,100,.18); border:1px solid color-mix(in srgb, var(--star-color) 72%, #3b3b3b 28%); overflow:hidden; }
      .wb-popstar-block::before { content:''; position:absolute; inset:8% 12% auto 12%; height:30%; border-radius:999px; background:rgba(255,255,255,.28); filter:blur(.2px); }
      .wb-popstar-star { position:relative; z-index:1; width:68%; height:68%; display:block; filter:drop-shadow(0 2px 2px rgba(0,0,0,.18)); }
      .wb-popstar-star path { fill:color-mix(in srgb, var(--star-color) 28%, #fff 72%); stroke:rgba(255,255,255,.74); stroke-width:7; stroke-linejoin:round; }
      .wb-popstar-score-pop { position:absolute; z-index:8; left:var(--x); top:var(--y); transform:translate(-50%,-50%); color:#fff; font-weight:1000; font-size:clamp(18px,4cqh,30px); line-height:1; text-shadow:0 2px 0 rgba(0,0,0,.24), 0 0 12px rgba(255,196,79,.9); pointer-events:none; animation:wbPopstarScore .78s ease-out forwards; }
      .wb-popstar-shard { position:absolute; z-index:7; left:var(--x); top:var(--y); width:9px; height:9px; border-radius:3px; background:var(--color); box-shadow:0 0 8px color-mix(in srgb, var(--color) 58%, transparent 42%); pointer-events:none; animation:wbPopstarShard .62s ease-out forwards; }
      .wb-popstar-actions { width:100%; display:flex; justify-content:center; gap:8px; flex-wrap:nowrap; }
      .wb-popstar-actions .wb-btn { min-width:104px; }
      .wb-popstar-badge { display:inline-grid; place-items:center; min-width:18px; height:18px; margin-left:4px; padding:0 4px; border-radius:999px; background:rgba(255,255,255,.36); color:inherit; font-size:11px; font-weight:1000; line-height:1; }
      .wb-popstar-actions .wb-btn.primary .wb-popstar-badge { background:rgba(255,255,255,.22); }
      .wb-popstar-settle { position:absolute; inset:0; z-index:10; display:grid; place-items:center; background:rgba(255,255,255,.38); color:#2f2430; font-weight:1000; text-align:center; pointer-events:none; animation:wbPopstarSettleMask .38s ease-out both; }
      .wb-popstar-settle-card { min-width:min(280px,84%); padding:14px 18px; border:2px solid rgba(255,255,255,.78); background:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,244,217,.9)); box-shadow:0 12px 30px rgba(79,141,247,.2); }
      @keyframes wbPopstarHint { from { transform:scale(1); } to { transform:scale(1.09) rotate(-2deg); } }
      @keyframes wbPopstarSettle { 0% { transform:translateY(-10px) scale(.98); } 70% { transform:translateY(2px) scale(1.03); } 100% { transform:translateY(0) scale(1); } }
      @keyframes wbPopstarScore { from { opacity:0; transform:translate(-50%,-20%) scale(.75); } 18% { opacity:1; } to { opacity:0; transform:translate(-50%,-145%) scale(1.14); } }
      @keyframes wbPopstarShard { from { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0); } to { opacity:0; transform:translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(.2) rotate(var(--rot)); } }
      @keyframes wbPopstarSettleMask { from { opacity:0; transform:scale(.98); } to { opacity:1; transform:scale(1); } }
      @media (max-width: 700px), (pointer: coarse) {
        .wb-popstar-panel { gap:5px; }
        .wb-popstar-stat { height:30px; padding:2px 5px; font-size:11px; box-shadow:none; }
        .wb-popstar-stat.target-met { box-shadow:0 0 8px rgba(34,197,94,.24); }
        .wb-popstar-stage { box-shadow:inset 0 0 0 3px rgba(255,255,255,.2); background:linear-gradient(180deg,#dff5ff,#fff1dc); }
        .wb-popstar-board { inset:6px; }
        .wb-popstar-cell { padding:2px; transition:left .18s cubic-bezier(.2,.8,.2,1), top .2s cubic-bezier(.2,.82,.2,1), transform .12s ease, opacity .14s ease; }
        .wb-popstar-cell:not(:disabled):hover { transform:scale(1); filter:none; }
        .wb-popstar-block { border-radius:8px; box-shadow:inset 0 1px 0 rgba(255,255,255,.38), inset 0 -3px 5px rgba(0,0,0,.12); }
        .wb-popstar-block::before { display:none; }
        .wb-popstar-star { filter:none; }
        .wb-popstar-score-pop { text-shadow:0 1px 0 rgba(0,0,0,.24); animation-duration:.62s; }
        .wb-popstar-shard { width:7px; height:7px; box-shadow:none; animation-duration:.48s; }
        .wb-popstar-settle-card { box-shadow:0 6px 16px rgba(79,141,247,.14); }
      }
      .wb-board-wrap.wb-gamebox-screw { height:100%; flex:1 1 0; align-items:stretch; justify-items:center; }
      .wb-screw-panel { width:min(100%, 560px); height:100%; max-height:100%; min-height:0; display:grid; grid-template-rows:124px minmax(0,1fr); gap:8px; justify-items:center; align-items:stretch; overflow:hidden; box-sizing:border-box; }
      .wb-screw-top { width:100%; height:124px; min-height:124px; display:grid; grid-template-rows:70px 32px; grid-template-columns:minmax(0,1fr); gap:8px; align-items:center; padding:8px; box-sizing:border-box; overflow:hidden; background:var(--wb-soft); border:1px solid var(--wb-border); color:var(--wb-text); box-shadow:inset 0 1px 0 rgba(255,255,255,.28); }
      .wb-screw-boxes { height:70px; min-height:0; display:flex; gap:8px; align-items:center; justify-content:center; min-width:0; max-width:100%; overflow:hidden; flex-wrap:nowrap; }
      .wb-screw-tools { width:100%; height:32px; min-width:0; display:grid; grid-template-columns:minmax(150px,1fr) auto auto; gap:8px; align-items:center; justify-content:center; overflow:hidden; }
      .wb-screw-box { position:relative; flex:0 0 64px; width:64px; height:58px; border:1px solid color-mix(in srgb, var(--c) 68%, var(--wb-border) 32%); border-radius:8px; background:linear-gradient(180deg, color-mix(in srgb, var(--c) 20%, var(--wb-panel) 80%), color-mix(in srgb, var(--c) 46%, var(--wb-soft) 54%)); box-shadow:inset 0 1px 0 rgba(255,255,255,.42), 0 3px 8px rgba(0,0,0,.10); display:grid; grid-template-columns:repeat(2, 20px); grid-template-rows:repeat(2, 20px); justify-content:center; align-content:center; gap:1px 8px; color:var(--wb-text); }
      .wb-screw-box::before { content:''; position:absolute; top:-8px; left:22px; width:20px; height:9px; border-radius:4px 4px 0 0; background:linear-gradient(90deg,var(--wb-border) 0 24%, color-mix(in srgb, var(--c) 68%, #fff 32%) 25% 75%, var(--wb-border) 76%); }
      .wb-screw-box-hole { position:relative; z-index:1; width:18px; height:18px; border-radius:50%; background:color-mix(in srgb, var(--wb-border) 65%, #777 35%); box-shadow:inset 0 2px 1px rgba(255,255,255,.28), inset 0 -2px 2px rgba(0,0,0,.18); }
      .wb-screw-box-hole:first-child { grid-column:1 / 3; justify-self:center; }
      .wb-screw-box-hole i { display:block; width:100%; height:100%; border-radius:50%; box-shadow:inset 0 2px 0 rgba(255,255,255,.36), 0 1px 2px rgba(0,0,0,.24); }
      .wb-screw-box.active { outline:2px solid color-mix(in srgb, var(--c) 55%, #fff 45%); outline-offset:2px; }
      .wb-screw-progress { position:relative; height:18px; border:1px solid var(--wb-border); border-radius:999px; background:var(--wb-panel); overflow:hidden; min-width:150px; }
      #wb-screw-progress-fill { display:block; height:100%; width:0; background:linear-gradient(90deg,var(--wb-accent),var(--wb-accent2)); }
      #wb-screw-progress-text { position:absolute; inset:0; display:grid; place-items:center; font-size:10px; font-weight:900; color:var(--wb-text); text-shadow:0 1px 0 rgba(255,255,255,.45); }
      .wb-screw-tray { display:grid; grid-template-columns:repeat(5,24px); gap:6px; justify-self:center; }
      .wb-screw-slot { width:24px; height:24px; border:1px solid var(--wb-border); border-radius:50%; background:var(--wb-panel); box-shadow:inset 0 1px 0 rgba(255,255,255,.32), 0 1px 3px rgba(0,0,0,.08); display:grid; place-items:center; }
      .wb-screw-slot span { width:17px; height:17px; border-radius:50%; box-shadow:inset 0 2px 0 rgba(255,255,255,.35), 0 1px 3px rgba(0,0,0,.18); }
      .wb-screw-canvas { height:100%; width:auto; max-width:100%; aspect-ratio:3 / 4; align-self:center; justify-self:center; background:var(--wb-board); border-radius:0; box-shadow:inset 0 0 0 1px rgba(255,255,255,.08); touch-action:none; }
      .wb-screw-addbox { justify-self:center; min-width:132px; margin-bottom:2px; }
      .wb-screw-addbox span { display:inline-grid; place-items:center; min-width:18px; height:18px; margin-left:4px; border-radius:999px; background:var(--wb-soft); border:1px solid var(--wb-border); font-size:11px; }
      @media (max-width: 768px) {
        .wb-board-wrap:has(.wb-screw-panel) { padding:0; }
        .wb-screw-panel { width:100%; grid-template-rows:78px minmax(0,1fr); gap:2px; }
        .wb-screw-top { height:78px; min-height:78px; grid-template-rows:40px 29px; gap:2px; padding:3px 4px; }
        .wb-screw-boxes { height:40px; gap:4px; }
        .wb-screw-tools { height:29px; grid-template-columns:minmax(66px, 1fr) auto auto; gap:4px; }
        .wb-screw-box { flex-basis:clamp(38px, 11.4vw, 46px); width:clamp(38px, 11.4vw, 46px); height:clamp(32px, 9.8vw, 38px); grid-template-columns:repeat(2, 12px); grid-template-rows:repeat(2, 12px); gap:0 4px; border-radius:5px; }
        .wb-screw-box::before { top:-6px; left:50%; transform:translateX(-50%); width:16px; height:7px; border-radius:3px 3px 0 0; }
        .wb-screw-box-hole { width:12px; height:12px; }
        .wb-screw-box.active { outline-width:1px; outline-offset:1px; }
        .wb-screw-progress { width:100%; min-width:0; height:13px; justify-self:stretch; }
        #wb-screw-progress-text { font-size:8px; }
        .wb-screw-tray { grid-template-columns:repeat(5,17px); gap:3px; }
        .wb-screw-slot { width:17px; height:17px; }
        .wb-screw-slot span { width:12px; height:12px; }
        .wb-screw-canvas { height:100%; width:auto; max-width:100%; align-self:center; justify-self:center; }
        .wb-screw-addbox { min-width:54px; min-height:21px; margin-bottom:0; padding:2px 5px; font-size:9px; }
        .wb-screw-addbox span { min-width:13px; height:13px; font-size:8px; margin-left:2px; }
      }
      .wb-reversi-panel, .wb-c4d-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr); gap:8px; place-items:center; overflow:hidden; }
      .wb-bomb-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr) 54px; gap:6px; place-items:center; overflow:hidden; }
      .wb-bomb-info, .wb-reversi-info, .wb-c4d-info { min-height:34px; display:flex; align-items:center; justify-content:center; gap:6px; text-align:center; font-weight:800; color:var(--wb-text); max-width:100%; min-width:0; flex-wrap:wrap; }
      .wb-bomb-info > span, .wb-reversi-info > span, .wb-c4d-info > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-cheat-btn { min-height:28px; padding:4px 9px; flex:0 0 auto; }
      .wb-cheat-compact .wb-sudoku-badge { margin-left:5px; }
      .wb-reversi { width:min(430px, 100%, 82cqh); aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(8,1fr); grid-template-rows:repeat(8,1fr); gap:2px; padding:6px; background:#276749; border:2px solid var(--wb-border); }
      .wb-reversi-cell { min-width:0; min-height:0; border:1px solid rgba(0,0,0,.18); background:#348a61; display:grid; place-items:center; padding:0; }
      .wb-reversi-cell span { width:74%; height:74%; border-radius:50%; display:block; box-shadow:0 2px 6px rgba(0,0,0,.28); }
      .wb-reversi-cell.user span { background:#f8fafc; }
      .wb-reversi-cell.ta span { background:#111827; }
      .wb-reversi-cell.legal::after { content:''; width:28%; height:28%; border-radius:50%; background:rgba(255,255,255,.45); }
      .wb-chess-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; gap:5px; place-items:center; overflow:hidden; }
      .wb-chess-info { min-height:34px; display:flex; align-items:center; justify-content:center; gap:6px; text-align:center; font-weight:800; color:var(--wb-text); max-width:100%; min-width:0; flex-wrap:wrap; }
      .wb-chess-info > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-chess-captures { width:min(500px,100%); min-height:23px; display:flex; align-items:center; gap:7px; padding:2px 7px; border-left:3px solid; background:color-mix(in srgb,var(--wb-panel) 82%,transparent 18%); box-sizing:border-box; overflow:hidden; }
      .wb-chess-captures.ta { border-color:#d69e2e; }
      .wb-chess-captures.user { border-color:#159c8c; }
      .wb-chess-captures-label { flex:0 0 auto; max-width:34%; color:var(--wb-sub); font-size:11px; font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-chess-captured-list { min-width:0; flex:1 1 auto; display:flex; align-items:center; gap:1px; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; }
      .wb-chess-captured-list::-webkit-scrollbar { display:none; }
      .wb-chess-captured-piece { flex:0 0 auto; display:inline-grid; place-items:center; line-height:1; }
      .wb-chess-captured-piece.western { width:18px; height:18px; color:var(--wb-text); font-size:20px; text-shadow:0 1px 1px rgba(0,0,0,.18); }
      .wb-chess-captured-piece.xq { width:19px; height:19px; border:1px solid currentColor; border-radius:50%; background:#fff7df; font-size:11px; font-weight:1000; }
      .wb-chess-captured-piece.xq.user { color:#7f1d1d; }
      .wb-chess-captured-piece.xq.ta { color:#1f2937; }
      .wb-chess-no-captures { color:var(--wb-muted); font-size:10px; white-space:nowrap; }
      .wb-chess-board { width:min(500px,100%,calc(100cqh - 104px)); aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(8,1fr); grid-template-rows:repeat(8,1fr); padding:8px; border:2px solid color-mix(in srgb,var(--wb-border) 76%,#8b5e34 24%); background:linear-gradient(135deg,#8b5e34,#52371f); box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 14px 30px rgba(15,23,42,.16); }
      .wb-chess-cell { position:relative; min-width:0; min-height:0; padding:0; border:0; display:grid; place-items:center; font-size:clamp(25px,7cqh,48px); line-height:1; cursor:pointer; transition:transform .12s ease, filter .12s ease, box-shadow .12s ease; }
      .wb-chess-cell.light { background:#f0d9b5; }
      .wb-chess-cell.dark { background:#b58863; }
      .wb-chess-cell span { position:relative; z-index:2; }
      .wb-chess-cell.user span { color:#fffdf7; text-shadow:0 2px 3px rgba(0,0,0,.48),0 0 1px #111; }
      .wb-chess-cell.ta span { color:#172033; text-shadow:0 1px 0 rgba(255,255,255,.55); }
      .wb-chess-cell.last-user::before,.wb-chess-cell.last-ta::before,.wb-chess-cell.last-both::before { content:''; position:absolute; inset:0; z-index:0; pointer-events:none; }
      .wb-chess-cell.last-user::before { background:rgba(20,184,166,.36); }
      .wb-chess-cell.last-ta::before { background:rgba(245,158,11,.40); }
      .wb-chess-cell.last-both::before { background:linear-gradient(135deg,rgba(20,184,166,.40) 0 50%,rgba(245,158,11,.44) 50% 100%); }
      .wb-chess-cell.last-from::before { opacity:.72; }
      .wb-chess-cell.last-to::before { box-shadow:inset 0 0 0 3px rgba(255,255,255,.46); }
      .wb-chess-cell.selected { z-index:2; box-shadow:inset 0 0 0 4px var(--wb-gold); filter:brightness(1.08); }
      .wb-chess-cell.legal::after { content:''; position:absolute; z-index:1; width:30%; height:30%; border-radius:50%; background:rgba(34,197,94,.62); box-shadow:0 0 0 4px rgba(34,197,94,.14); }
      .wb-chess-cell.legal.ta::after { position:absolute; inset:8%; width:auto; height:auto; border-radius:8px; background:rgba(239,68,68,.20); box-shadow:inset 0 0 0 3px rgba(239,68,68,.48); }
      .wb-chess-cell:hover:not(:disabled) { transform:scale(1.03); z-index:3; }
      .wb-chess-cell.bad { animation:wbChessBad .22s linear; }
      @keyframes wbChessBad { 0%,100%{ transform:translateX(0); } 25%{ transform:translateX(-4px); } 75%{ transform:translateX(4px); } }
      .wb-xq-panel { width:100%; height:100%; min-height:0; display:grid; grid-template-rows:auto auto minmax(0,1fr) auto; gap:4px; place-items:center; overflow:hidden; }
      .wb-xq-info { min-height:34px; display:flex; align-items:center; justify-content:center; gap:6px; text-align:center; font-weight:800; color:var(--wb-text); max-width:100%; min-width:0; flex-wrap:wrap; }
      .wb-xq-info > span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-xq-board { position:relative; width:min(500px,100%,67cqh); aspect-ratio:9 / 10.72; display:grid; grid-template-columns:repeat(9,1fr); grid-template-rows:repeat(5,1fr) .72fr repeat(5,1fr); padding:8px; border:2px solid color-mix(in srgb,var(--wb-border) 70%,#a16207 30%); background:linear-gradient(180deg,#f7dfaa,#edc77c); box-shadow:inset 0 0 0 1px rgba(255,255,255,.24),0 14px 30px rgba(15,23,42,.16); overflow:hidden; }
      .wb-xq-cell { position:relative; z-index:1; min-width:0; min-height:0; padding:0; border:0; background:transparent; display:grid; place-items:center; cursor:pointer; transition:transform .12s ease, filter .12s ease, box-shadow .12s ease; }
      .wb-xq-cell span { position:relative; z-index:2; width:min(84%,44px); height:min(84%,44px); border-radius:50%; display:grid; place-items:center; box-sizing:border-box; padding-bottom:2px; line-height:1; background:#fff7df; border:2px solid #8a5a21; color:#7f1d1d; font-weight:1000; font-size:clamp(14px,4.2cqh,28px); box-shadow:0 2px 8px rgba(70,42,12,.22); }
      .wb-xq-cell.ta span { color:#1f2937; border-color:#374151; }
      .wb-xq-cell.last-user::before,.wb-xq-cell.last-ta::before,.wb-xq-cell.last-both::before { content:''; position:absolute; inset:4%; z-index:1; box-sizing:border-box; border:3px solid transparent; border-radius:50%; pointer-events:none; }
      .wb-xq-cell.last-user::before { border-color:rgba(13,148,136,.88); box-shadow:0 0 0 2px rgba(20,184,166,.14); }
      .wb-xq-cell.last-ta::before { border-color:rgba(217,119,6,.90); box-shadow:0 0 0 2px rgba(245,158,11,.15); }
      .wb-xq-cell.last-both::before { border-color:rgba(13,148,136,.88) rgba(217,119,6,.90) rgba(217,119,6,.90) rgba(13,148,136,.88); box-shadow:0 0 0 2px rgba(100,116,139,.14); }
      .wb-xq-cell.last-from::before { opacity:.58; border-style:dashed; }
      .wb-xq-cell.last-to::before { opacity:1; }
      .wb-xq-cell.selected { z-index:2; filter:brightness(1.06); }
.wb-xq-cell.selected span { box-shadow:0 0 0 4px var(--wb-gold),0 2px 8px rgba(70,42,12,.22); }
      .wb-xq-cell.legal::after { content:''; position:absolute; z-index:0; width:24%; height:24%; border-radius:50%; background:rgba(34,197,94,.70); box-shadow:0 0 0 4px rgba(34,197,94,.14); }
      .wb-xq-cell.legal.ta::after { inset:8%; width:auto; height:auto; border-radius:50%; background:rgba(239,68,68,.18); box-shadow:inset 0 0 0 3px rgba(239,68,68,.48); }
      .wb-xq-cell:hover:not(:disabled) { transform:scale(1.03); z-index:3; }
      .wb-xq-cell.bad { animation:wbChessBad .22s linear; }
      .wb-xq-lines { position:absolute; inset:8px; z-index:0; pointer-events:none; overflow:visible; }
.wb-xq-river { grid-column:1 / -1; grid-row:6; z-index:1; min-height:24px; display:flex; align-items:center; justify-content:space-around; pointer-events:none; font-weight:1000; letter-spacing:.35em; color:rgba(120,53,15,.58); background:linear-gradient(90deg,transparent,rgba(255,247,220,.72),transparent); }
      .wb-bomb-grid { width:min(520px, 100%, 78cqh); aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(10,1fr); gap:3px; align-self:center; justify-self:center; }
      .wb-bomb-cell { min-width:0; min-height:0; padding:0; border:1px solid var(--wb-border); background:var(--wb-panel); color:var(--wb-text); font-weight:800; font-size:clamp(10px,2.2cqh,16px); }
      .wb-bomb-cell.ok { background:color-mix(in srgb, var(--wb-accent2) 20%, var(--wb-panel) 80%); cursor:pointer; }
      .wb-bomb-cell.off { opacity:.28; }
      .wb-bomb-cell.chosen { transform:scale(1.08); background:color-mix(in srgb, var(--wb-gold) 62%, var(--wb-panel) 38%); color:var(--wb-text); box-shadow:0 0 0 2px var(--wb-gold), 0 0 16px rgba(255,196,79,.45); z-index:2; }
      .wb-bomb-cell.boom { transform:scale(1.16); background:#ef4444; color:#fff; box-shadow:0 0 0 3px rgba(255,255,255,.7), 0 0 26px rgba(239,68,68,.75); animation:wb-bomb-pop .55s ease-in-out infinite alternate; z-index:3; }
      .wb-bomb-cell.boom { font-size:clamp(20px,4.6cqh,34px); }
      .wb-bomb-cell.chosen, .wb-bomb-cell.boom { position:relative; transition:transform .18s ease, background .18s ease, box-shadow .18s ease; }
      @keyframes wb-bomb-pop { from { filter:brightness(1); } to { filter:brightness(1.28); } }
      .wb-bomb-log { width:min(520px,100%); height:54px; overflow:auto; color:var(--wb-sub); font-size:12px; line-height:1.4; box-sizing:border-box; }
      .wb-c4d-mask { width:min(460px,100%,66cqh); max-height:100%; aspect-ratio:1 / .95; display:grid; place-items:center; border:0; border-radius:0; background:linear-gradient(180deg, color-mix(in srgb, var(--wb-board) 76%, transparent 24%), color-mix(in srgb, var(--wb-soft) 66%, transparent 34%)); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--wb-border) 48%, transparent 52%); overflow:hidden; }
      .wb-c4d-stage { position:relative; width:84%; aspect-ratio:1 / 1.12; display:grid; grid-template-rows:12% 1fr 5%; align-items:stretch; }
      .wb-c4d-drop-line { position:absolute; left:0; right:0; top:8%; border-top:2px dashed color-mix(in srgb, var(--wb-accent) 70%, transparent 30%); opacity:.82; pointer-events:none; }
      .wb-c4d-drop-line::after { content:'投放线'; position:absolute; right:0; top:-18px; font-size:11px; color:var(--wb-sub); font-weight:800; }
      .wb-c4d { grid-row:2; width:100%; aspect-ratio:1 / 1; display:grid; grid-template-columns:repeat(7,1fr); grid-template-rows:repeat(7,1fr); gap:3px; align-self:end; padding:5px; box-sizing:border-box; background:linear-gradient(135deg, color-mix(in srgb, var(--wb-soft) 70%, transparent 30%), color-mix(in srgb, var(--wb-board) 86%, transparent 14%)); box-shadow:inset 0 0 0 1px color-mix(in srgb, var(--wb-border) 52%, transparent 48%); }
      .wb-c4d-stage::after { content:''; grid-row:3; display:block; width:100%; height:100%; background:linear-gradient(180deg, color-mix(in srgb, var(--wb-border) 45%, transparent 55%), color-mix(in srgb, var(--wb-board) 88%, transparent 12%)); box-shadow:inset 0 1px 0 rgba(255,255,255,.16); }
      .wb-c4d-cell { position:relative; min-width:0; min-height:0; border:1px solid color-mix(in srgb, var(--wb-border) 64%, transparent 36%); border-radius:8px; background:radial-gradient(circle at 50% 42%, rgba(255,255,255,.18), transparent 38%), color-mix(in srgb, var(--wb-panel) 70%, var(--wb-board) 30%); padding:2px; display:grid; place-items:center; cursor:pointer; overflow:hidden; }
      .wb-c4d-cell.full { opacity:.72; cursor:default; }
      .wb-c4d-cell.aim { outline:3px solid var(--wb-gold); outline-offset:-3px; filter:brightness(1.08); }
      .wb-c4d-disc, .wb-c4d-falling { width:68%; aspect-ratio:1 / 1; border-radius:50%; border:1px solid rgba(0,0,0,.22); display:block; }
      .wb-c4d-disc.user, .wb-c4d-falling.user { background:#f8fafc; box-shadow:0 3px 8px rgba(0,0,0,.24), inset 0 2px 3px rgba(255,255,255,.72); }
      .wb-c4d-disc.ta, .wb-c4d-falling.ta { background:#ef6f91; box-shadow:0 3px 8px rgba(0,0,0,.24), inset 0 2px 3px rgba(255,255,255,.35); }
      .wb-c4d-falling { position:absolute; z-index:4; width:26px; height:26px; border-radius:50%; pointer-events:none; transition:none; }
      .wb-guess-panel { width:min(560px,100%); max-height:100%; min-height:0; display:grid; gap:10px; align-content:start; overflow:hidden; }
      .wb-guess-panel.wb-memory-panel { width:100%; height:100%; grid-template-rows:auto minmax(0, 1fr); gap:8px; justify-items:center; align-items:center; align-content:stretch; }
      .wb-number-guess { grid-template-rows:auto auto auto auto minmax(0, 1fr); }
      .wb-guess-title { font-size:18px; font-weight:900; color:var(--wb-accent); }
      .wb-guess-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .wb-num-keypad { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:6px; }
      .wb-num-keypad .wb-btn { min-width:0; padding:6px 4px; font-size:15px; }
      .wb-guess-history { min-height:0; max-height:min(260px, calc(100dvh - 360px)); overflow-y:auto; display:grid; gap:6px; padding:8px; background:var(--wb-soft); border:1px solid var(--wb-border); }
      .wb-guess-item { background:var(--wb-panel); border:1px solid var(--wb-border); padding:7px 9px; font-size:13px; }
      .wb-clue-box { white-space:pre-wrap; min-height:72px; max-height:min(260px, calc(100dvh - 360px)); overflow-y:auto; }
      .wb-companion { display:none; flex-shrink:0; margin-top:10px; background:var(--wb-panel); border:1px solid var(--wb-border); border-left:3px solid var(--wb-accent2); border-radius:0; padding:10px; max-height:92px; overflow:hidden; }
      .wb-companion.on { display:block; }
      .wb-side-companion { gap:10px; }
      .wb-side-companion .wb-companion { margin-top:0; margin-bottom:10px; max-height:none; }
      .wb-side-companion .wb-speech { min-height:62px; max-height:72px; overflow:hidden; }
      .wb-comp-row { display:flex; gap:10px; align-items:flex-start; min-height:0; }
      .wb-avatar { width:46px; height:46px; border-radius:0; object-fit:cover; background:var(--wb-soft); border:1px solid var(--wb-border); display:grid; place-items:center; font-weight:900; overflow:hidden; flex:0 0 auto; }
      .wb-comp-main { flex:1; min-width:0; display:grid; gap:4px; }
      .wb-comp-name { color:var(--wb-accent); font-weight:800; font-size:12px; line-height:1.1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-speech { min-height:62px; max-height:72px; overflow:hidden; padding:7px 10px; border-radius:0; background:var(--wb-soft); line-height:1.45; font-size:13px; box-sizing:border-box; }
      .wb-form { display:grid; gap:10px; align-content:start; min-height:0; }
      .wb-body.wb-game-mode .wb-form { gap:8px; }
      .wb-field { display:grid; gap:6px; }
      .wb-field label { font-size:12px; color:var(--wb-sub); font-weight:700; letter-spacing:1px; }
      .wb-input, .wb-textarea, .wb-select { width:100%; background:var(--wb-input); color:var(--wb-text); border:1px solid var(--wb-border); border-radius:0; padding:8px 10px; outline:none; font-family:inherit; }
      .wb-textarea { min-height:76px; resize:vertical; }
      .wb-switch { display:flex; align-items:center; gap:8px; font-weight:800; }
      .wb-inline-select-row { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:34px; font-weight:800; }
      .wb-inline-select-row > span { flex:1 1 auto; min-width:0; }
      .wb-inline-select-row .wb-inline-hint { color:var(--wb-sub); font-size:11px; font-weight:700; opacity:.82; margin-left:6px; }
      .wb-inline-select-row .wb-select { flex:0 0 132px; width:132px; min-height:32px; padding:6px 9px; font-weight:700; }
      .wb-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
      .wb-line-tools { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
      .wb-line-tools .wb-select, .wb-line-tools .wb-input { width:auto; min-width:126px; max-width:180px; min-height:34px; padding:7px 9px; }
      .wb-title-row { display:inline-flex; align-items:center; gap:3px; min-width:0; max-width:100%; vertical-align:middle; }
      .wb-game-title-text { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-rule-btn { flex:0 0 auto; width:20px; min-width:20px; height:20px; min-height:20px; padding:0; border:0; background:transparent; box-shadow:none; border-radius:50%; font-size:15px; line-height:1; display:inline-grid; place-items:center; }
      .wb-rule-btn:hover { background:color-mix(in srgb, var(--wb-soft) 55%, transparent 45%); transform:none; }
      .wb-sticky-actions { position:sticky; bottom:-18px; z-index:3; margin:12px -22px -18px; padding:10px 22px; background:linear-gradient(180deg, color-mix(in srgb, var(--wb-panel) 70%, transparent 30%), var(--wb-panel)); border-top:1px solid var(--wb-border); }
      .wb-start-cover { display:grid; place-items:center; text-align:center; gap:10px; width:100%; height:100%; min-height:240px; color:var(--wb-sub); }
      .wb-start-cover .wb-btn { min-width:160px; }

      .wb-update-panel { border:1px solid var(--wb-border); padding:8px 10px; }
      .wb-update-panel.available { border-color:var(--wb-accent); box-shadow:0 0 0 2px rgba(239,138,108,.16); }
      .wb-update-panel.busy { border-color:var(--wb-gold); }
      .wb-update-panel.done { border-color:#22c55e; }
      .wb-update-panel.error { border-color:#ef4444; }
      .wb-update-row { display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:32px; font-weight:900; color:var(--wb-text); }
      .wb-update-row span { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-update-icon { flex:0 0 auto; width:34px; min-width:34px; height:30px; padding:0; display:grid; place-items:center; }
      .wb-tab.update-available { position:relative; color:var(--wb-accent); font-weight:900; }
      .wb-tab.update-available::after { content:''; position:absolute; right:8px; top:7px; width:8px; height:8px; border-radius:50%; background:#ef4444; box-shadow:0 0 0 3px rgba(239,68,68,.20),0 0 10px rgba(239,68,68,.55); }
      .wb-settings-grid { display:grid; grid-template-columns:minmax(0, 820px); justify-content:center; gap:12px; align-items:start; padding-bottom:12px; }
      .wb-settings-left, .wb-settings-right { display:contents; }
      .wb-settings-grid .wb-panel { display:grid; gap:10px; align-content:start; min-height:auto; }
      .wb-preset-row, .wb-preset-save-row { display:flex; gap:6px; align-items:center; }
      .wb-preset-row select, .wb-preset-save-row input { flex:1; min-width:0; }
      .wb-api-status { background:var(--wb-soft); border:1px solid var(--wb-border); padding:8px 10px; color:var(--wb-sub); font-size:12px; line-height:1.6; }
      .wb-char-desc-preview { max-height:88px; overflow-y:auto; padding:7px 9px; line-height:1.45; white-space:pre-wrap; scrollbar-width:thin; }
      .wb-worldbook-list { display:flex; flex-wrap:wrap; gap:5px; max-height:118px; overflow-y:auto; padding:7px; background:var(--wb-soft); border:1px solid var(--wb-border); }
      .wb-tag { border:1px solid var(--wb-border); background:var(--wb-panel); color:var(--wb-text); padding:4px 8px; cursor:pointer; font-size:12px; }
      .wb-tag.active { background:var(--wb-accent); color:var(--wb-on-accent,#fff); border-color:var(--wb-accent); }
      .wb-section-title { color:var(--wb-accent); font-weight:800; letter-spacing:2px; border-bottom:1px solid var(--wb-border); padding-bottom:6px; margin-bottom:2px; }
      .wb-modal-mask { position:fixed; top:0; left:0; right:0; bottom:0; width:100%; height:100%; z-index:1000000; background:rgba(0,0,0,.88); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; animation:wbFadeIn .25s ease; --wb-bg:#fff7fb; --wb-panel:#fffefd; --wb-soft:#ffeaf1; --wb-text:#2f2430; --wb-sub:#8a6470; --wb-border:#e8b9c5; --wb-accent:#c65b7c; --wb-accent2:#3a8f91; --wb-board:#fff2e6; --wb-input:#fff9fb; --wb-glow:rgba(198,91,124,.26); --wb-gold:#c99738; --wb-screen:#fff9f2; --wb-on-accent:#fff; }
      .wb-modal-mask.wb-night { --wb-bg:#11121d; --wb-panel:#191a28; --wb-soft:#252033; --wb-text:#f5eafa; --wb-sub:#bba8c7; --wb-border:#54425f; --wb-accent:#ff7aa8; --wb-accent2:#6ed6d1; --wb-board:#111827; --wb-input:#151620; --wb-glow:rgba(255,122,168,.28); --wb-gold:#f3c56a; --wb-screen:#111827; --wb-on-accent:#fff; }
	      .wb-modal-mask.wb-spring { --wb-bg:#EAF6D4; --wb-panel:#F6E7C8; --wb-soft:#D8EDB2; --wb-text:#4C3B2A; --wb-sub:#7A6752; --wb-border:#BFA372; --wb-accent:#6FA85A; --wb-accent2:#7DB9D8; --wb-board:#E2F0BF; --wb-input:#F8EED6; --wb-glow:rgba(111,168,90,.24); --wb-gold:#E3C56A; --wb-screen:#F4F1D3; --wb-on-accent:#fff; }
	      .wb-modal-mask.wb-mono { --wb-bg:#f2f2f2; --wb-panel:#ffffff; --wb-soft:#dcdcdc; --wb-text:#151515; --wb-sub:#565656; --wb-border:#8f8f8f; --wb-accent:#111111; --wb-accent2:#4d4d4d; --wb-board:#e6e6e6; --wb-input:#f7f7f7; --wb-glow:rgba(0,0,0,.12); --wb-gold:#2e2e2e; --wb-screen:#eeeeee; --wb-on-accent:#fff; }
	      .wb-modal-mask.wb-cyber { --wb-bg:#0D1512; --wb-panel:#18231E; --wb-soft:#24352D; --wb-text:#F6F5DE; --wb-sub:#B9C4B8; --wb-border:#4C5B4A; --wb-accent:#F1E85B; --wb-accent2:#19D3C5; --wb-board:#101A1D; --wb-input:#14201B; --wb-glow:rgba(241,232,91,.22); --wb-gold:#FF8A3D; --wb-screen:#1A221D; --wb-on-accent:#0D1512; }
	      .wb-modal-mask.wb-cardtheater { --wb-bg:#080304; --wb-panel:#13080A; --wb-soft:#241014; --wb-text:#F8EFE7; --wb-sub:#D5BBA5; --wb-border:rgba(245,201,104,.34); --wb-accent:#C9182B; --wb-accent2:#F5C968; --wb-board:#100506; --wb-input:#0E0708; --wb-glow:rgba(201,24,43,.30); --wb-gold:#F5C968; --wb-screen:#0B0506; --wb-on-accent:#FFF8F0; }
	      .wb-modal-mask.wb-arcade { --wb-bg:#F3FAFF; --wb-panel:#FFFDF8; --wb-soft:#E5F4FF; --wb-text:#28435A; --wb-sub:#6F8EA3; --wb-border:#B8DCEF; --wb-accent:#5FA8D7; --wb-accent2:#F6C8D8; --wb-board:#F8FCFF; --wb-input:#FFFDF8; --wb-glow:rgba(95,168,215,.14); --wb-gold:#5FA8D7; --wb-screen:#FFFDF8; --wb-on-accent:#fff; }
	      .wb-modal-mask.wb-tavern { --wb-bg:var(--SmartThemeBodyColor, #1f1f1f); --wb-panel:var(--SmartThemeBlurTintColor, var(--SmartThemeBotMesBlurTintColor, #2a2a2a)); --wb-soft:color-mix(in srgb, var(--wb-panel) 78%, var(--wb-accent) 22%); --wb-text:var(--SmartThemeTextColor, #f5f5f5); --wb-sub:color-mix(in srgb, var(--wb-text) 68%, var(--wb-bg) 32%); --wb-border:var(--SmartThemeBorderColor, rgba(255,255,255,.22)); --wb-accent:var(--SmartThemeQuoteColor, var(--SmartThemeEmColor, #8ab4f8)); --wb-accent2:var(--SmartThemeEmColor, var(--wb-accent)); --wb-board:color-mix(in srgb, var(--wb-bg) 78%, var(--wb-panel) 22%); --wb-input:color-mix(in srgb, var(--wb-panel) 86%, var(--wb-bg) 14%); --wb-glow:color-mix(in srgb, var(--wb-accent) 28%, transparent 72%); --wb-gold:var(--SmartThemeQuoteColor, #d7a64d); --wb-screen:color-mix(in srgb, var(--wb-bg) 72%, var(--wb-panel) 28%); font-family:inherit; }
      @keyframes wbFadeIn{from{opacity:0}to{opacity:1}}
      .wb-modal { background:linear-gradient(180deg, var(--wb-panel), var(--wb-bg)); color:var(--wb-text); border:1px solid var(--wb-border); border-top:3px solid var(--wb-accent); width:100%; max-width:560px; max-height:85vh; overflow-y:auto; animation:wbSlideUp .3s cubic-bezier(.34,1.56,.64,1); box-shadow:0 20px 60px rgba(0,0,0,.5),0 0 40px var(--wb-glow); padding:18px 22px; border-radius:0; }
      @keyframes wbSlideUp{from{transform:translateY(30px);opacity:0}to{transform:translateY(0);opacity:1}}
      .wb-modal-title { font-size:17px; font-weight:700; color:var(--wb-accent); letter-spacing:2px; padding:0 0 12px; margin:0 0 14px; border-bottom:1px solid var(--wb-border); }
      .wb-choice-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; }
      .wb-choice-card { border:1px solid var(--wb-border); border-left:4px solid var(--wb-accent); background:linear-gradient(180deg,var(--wb-panel),var(--wb-soft)); color:var(--wb-text); padding:14px 12px; display:grid; gap:6px; text-align:left; cursor:pointer; box-shadow:0 8px 18px rgba(0,0,0,.10), inset 0 1px 0 rgba(255,255,255,.28); }
      .wb-choice-card.primary { border-left-color:var(--wb-accent2); }
      .wb-choice-card:hover { transform:translateY(-1px); border-color:var(--wb-accent); }
      .wb-choice-card b { font-size:20px; letter-spacing:1px; }
      .wb-choice-card span { color:var(--wb-sub); font-size:12px; line-height:1.45; }
      .wb-shuerte-choice-note { margin:-2px 0 8px; color:var(--wb-sub); font-size:12px; text-align:center; font-weight:800; }
      .wb-shuerte-choice-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }
      .wb-shuerte-choice-group { cursor:default; }
      .wb-shuerte-choice-group:hover { transform:none; }
      .wb-shuerte-choice-actions { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:2px; }
      .wb-shuerte-choice-actions .wb-btn { min-width:0; width:100%; justify-content:center; }
      .wb-shuerte-choice-group em { color:var(--wb-sub); font-size:11px; line-height:1.35; font-style:normal; }
      @media (max-width:520px) { .wb-shuerte-choice-grid { grid-template-columns:1fr; } }
      .wb-countdown { display:grid; place-items:center; gap:8px; padding:16px 0 18px; }
      .wb-countdown-num { width:72px; height:72px; display:grid; place-items:center; border-radius:50%; background:linear-gradient(145deg, var(--wb-accent), var(--wb-accent2)); color:#fff; font-size:34px; font-weight:900; box-shadow:0 14px 34px var(--wb-glow); }

      /* 高级掌机风格美化层 */
      #${POPUP_ID} {
        border-radius:8px;
        border:1px solid color-mix(in srgb, var(--wb-border) 78%, #fff 22%);
        border-top:1px solid color-mix(in srgb, var(--wb-gold) 76%, #fff 24%);
        background:
          linear-gradient(145deg, color-mix(in srgb, var(--wb-bg) 92%, #fff 8%), color-mix(in srgb, var(--wb-panel) 80%, var(--wb-soft) 20%)),
          var(--wb-bg);
        box-shadow:0 28px 80px rgba(20,12,24,.42), 0 0 0 1px rgba(255,255,255,.22) inset, 0 0 44px var(--wb-glow);
      }
      #${POPUP_ID}.wb-night {
        background:
          linear-gradient(145deg, #10111c 0%, #191626 46%, #101824 100%),
          var(--wb-bg);
        box-shadow:0 30px 90px rgba(0,0,0,.62), 0 0 0 1px rgba(255,255,255,.08) inset, 0 0 48px rgba(255,122,168,.18);
      }
      #${POPUP_ID}.wb-spring {
        font-family:'WanbanCyberPixel','Microsoft YaHei',system-ui,sans-serif;
        letter-spacing:0;
        background:
          linear-gradient(145deg, rgba(255,255,255,.36), rgba(216,237,178,.42)),
          repeating-linear-gradient(90deg, rgba(122,103,82,.05) 0 3px, transparent 3px 12px),
          var(--wb-bg);
        box-shadow:0 28px 80px rgba(76,59,42,.22), 0 0 0 1px rgba(255,255,255,.32) inset, 0 0 44px rgba(111,168,90,.18);
      }
      #${POPUP_ID}.wb-mono {
        font-family:'WanbanCyberPixel','Microsoft YaHei',system-ui,sans-serif;
        letter-spacing:0;
        image-rendering:pixelated;
        background:#fff;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-cyber {
        font-family:'WanbanCyberPixel','Microsoft YaHei',system-ui,sans-serif;
        letter-spacing:0;
        background:
          linear-gradient(145deg, #0D1512 0%, #18231E 48%, #101A1D 100%),
          var(--wb-bg);
        box-shadow:0 30px 90px rgba(0,0,0,.70), 0 0 0 1px rgba(25,211,197,.16) inset, 0 0 54px rgba(241,232,91,.16);
      }
      #${POPUP_ID}::before { background:rgba(20,10,18,.42); backdrop-filter:blur(5px); -webkit-backdrop-filter:blur(5px); }
      #${POPUP_ID}.wb-night::before { background:rgba(2,4,12,.62); }
      .wb-head {
        min-height:46px;
        display:grid;
        grid-template-columns:auto minmax(280px, 1fr) auto;
        align-items:center;
        gap:10px;
        padding:6px 10px;
        border-bottom:1px solid color-mix(in srgb, var(--wb-border) 70%, transparent 30%);
        background:
          linear-gradient(180deg, rgba(255,255,255,.54), rgba(255,255,255,.18)),
          var(--wb-panel);
      }
      #${POPUP_ID}.wb-night .wb-head {
        background:
          linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025)),
          var(--wb-panel);
      }
      #${POPUP_ID}.wb-spring .wb-head {
        background:
          repeating-linear-gradient(90deg, rgba(76,59,42,.06) 0 4px, transparent 4px 14px),
          linear-gradient(180deg, rgba(255,255,255,.40), rgba(246,231,200,.36)),
          var(--wb-panel);
      }
      #${POPUP_ID}.wb-mono .wb-head {
        background:#fff;
        border-bottom:2px solid #111;
      }
      #${POPUP_ID}.wb-cyber .wb-head {
        background:
          linear-gradient(90deg, rgba(25,211,197,.16), rgba(241,232,91,.08) 42%, rgba(255,79,163,.12)),
          var(--wb-panel);
        box-shadow:0 1px 0 rgba(241,232,91,.22) inset;
      }
      .wb-title {
        display:flex;
        align-items:center;
        gap:7px;
        color:var(--wb-text);
        font-size:17px;
        letter-spacing:1px;
        text-shadow:none;
      }
      .wb-title::before {
        content:'';
        width:22px;
        height:22px;
        display:grid;
        place-items:center;
        border-radius:7px;
        background:url('${APP_ICON_URL}') center / cover no-repeat, linear-gradient(135deg, var(--wb-accent), var(--wb-accent2));
        box-shadow:0 0 0 1px rgba(255,255,255,.35) inset;
        overflow:hidden;
      }
      .wb-title::after {
        display:none;
      }
      .wb-tabs {
        justify-self:center;
        flex-wrap:nowrap;
        padding:2px;
        gap:2px;
        border-radius:5px;
        border-color:color-mix(in srgb, var(--wb-border) 74%, transparent 26%);
        background:color-mix(in srgb, var(--wb-soft) 50%, var(--wb-panel) 50%);
        box-shadow:0 1px 0 rgba(255,255,255,.55) inset;
      }
      #${POPUP_ID}.wb-night .wb-tabs { box-shadow:0 1px 0 rgba(255,255,255,.08) inset; }
      .wb-tabs .wb-tab {
        border:0;
        border-radius:3px;
        min-width:96px;
        min-height:28px;
        padding:4px 10px;
        color:var(--wb-sub);
        background:transparent;
      }
      .wb-tabs .wb-tab.active {
        color:var(--wb-on-accent,#fff);
        background:linear-gradient(135deg, var(--wb-accent), color-mix(in srgb, var(--wb-accent2) 72%, var(--wb-accent) 28%));
        box-shadow:0 6px 14px var(--wb-glow), 0 1px 0 rgba(255,255,255,.32) inset;
      }
      .wb-iconbtn, .wb-btn {
        border-radius:3px;
        border-color:color-mix(in srgb, var(--wb-border) 78%, transparent 22%);
        background:linear-gradient(180deg, color-mix(in srgb, var(--wb-panel) 92%, #fff 8%), color-mix(in srgb, var(--wb-soft) 72%, var(--wb-panel) 28%));
        box-shadow:0 1px 0 rgba(255,255,255,.55) inset, 0 8px 18px rgba(45,24,36,.10);
      }
      .wb-head .wb-iconbtn { width:30px; height:30px; min-height:30px; font-size:16px; }
      #${POPUP_ID}.wb-night .wb-iconbtn, #${POPUP_ID}.wb-night .wb-btn {
        background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02));
        box-shadow:0 1px 0 rgba(255,255,255,.08) inset, 0 10px 20px rgba(0,0,0,.24);
      }
      #${POPUP_ID}.wb-cyber .wb-iconbtn, #${POPUP_ID}.wb-cyber .wb-btn {
        background:linear-gradient(180deg, rgba(241,232,91,.14), rgba(25,211,197,.06)), var(--wb-panel);
        color:var(--wb-text);
        box-shadow:0 0 14px rgba(25,211,197,.12), 0 1px 0 rgba(241,232,91,.18) inset;
      }
      #${POPUP_ID}.wb-cyber .wb-btn.primary,
      #${POPUP_ID}.wb-cyber .wb-tab.active {
        color:var(--wb-on-accent,#0D1512);
        text-shadow:0 1px 0 rgba(255,255,255,.22);
      }
      .wb-btn:hover, .wb-iconbtn:hover, .wb-tab:hover { transform:translateY(-1px); filter:brightness(1.04); }
      .wb-btn.primary {
        background:linear-gradient(135deg, var(--wb-accent), color-mix(in srgb, var(--wb-accent) 54%, var(--wb-accent2) 46%));
        border-color:color-mix(in srgb, var(--wb-accent) 76%, #fff 24%);
        color:var(--wb-on-accent,#fff);
        box-shadow:0 12px 24px var(--wb-glow), 0 1px 0 rgba(255,255,255,.34) inset;
      }
      #${POPUP_ID}.wb-cyber .wb-btn.primary,
      #${POPUP_ID}.wb-cyber .wb-tab.active {
        background:linear-gradient(135deg, #F1E85B, #FF8A3D);
        border-color:#F6F5DE;
        color:var(--wb-on-accent,#0D1512);
        box-shadow:0 0 18px rgba(241,232,91,.26), 0 1px 0 rgba(255,255,255,.42) inset;
        text-shadow:0 1px 0 rgba(255,255,255,.24);
      }
      .wb-modal-mask.wb-cyber .wb-btn.primary,
      .wb-modal-mask.wb-cyber .wb-tab.active {
        background:linear-gradient(135deg, #F1E85B, #FF8A3D);
        border-color:#F6F5DE;
        color:var(--wb-on-accent,#0D1512);
        box-shadow:0 0 18px rgba(241,232,91,.26), 0 1px 0 rgba(255,255,255,.42) inset;
        text-shadow:0 1px 0 rgba(255,255,255,.24);
      }
      .wb-body {
        padding:16px;
        background:
          linear-gradient(180deg, rgba(255,255,255,.10), transparent 32%),
          linear-gradient(90deg, color-mix(in srgb, var(--wb-soft) 28%, transparent 72%), transparent 46%, color-mix(in srgb, var(--wb-accent2) 8%, transparent 92%));
      }
      .wb-cardgrid { gap:14px; }
      .wb-game-card {
        min-height:104px;
        padding:16px;
        align-items:center;
        gap:14px;
        border-radius:8px;
        border:1px solid color-mix(in srgb, var(--wb-border) 74%, #fff 26%);
        border-left:0;
        background:
          linear-gradient(145deg, rgba(255,255,255,.78), rgba(255,255,255,.24) 45%, color-mix(in srgb, var(--wb-soft) 70%, transparent 30%)),
          var(--wb-panel);
        box-shadow:0 14px 32px rgba(52,28,42,.13), 0 0 0 1px rgba(255,255,255,.34) inset;
        position:relative;
        overflow:hidden;
      }
      #${POPUP_ID}.wb-night .wb-game-card {
        background:linear-gradient(145deg, rgba(255,255,255,.09), rgba(255,255,255,.03) 46%, rgba(255,122,168,.07)), var(--wb-panel);
        border-color:rgba(255,255,255,.10);
        box-shadow:0 16px 34px rgba(0,0,0,.30), 0 0 0 1px rgba(255,255,255,.06) inset;
      }
      #${POPUP_ID}.wb-spring .wb-game-card {
        background:
          linear-gradient(145deg, rgba(255,255,255,.46), rgba(216,237,178,.30) 58%, rgba(246,231,200,.52)),
          var(--wb-panel);
      }
      #${POPUP_ID}.wb-cyber .wb-game-card {
        background:linear-gradient(145deg, rgba(255,255,255,.045), rgba(255,255,255,.02)), var(--wb-panel);
        border-color:#4C5B4A;
        box-shadow:0 16px 34px rgba(0,0,0,.34), 0 0 0 1px rgba(25,211,197,.06) inset;
      }
      .wb-game-card::before {
        content:'';
        position:absolute;
        inset:0;
        border-top:2px solid color-mix(in srgb, var(--wb-gold) 68%, transparent 32%);
        pointer-events:none;
      }
      .wb-game-card:hover {
        transform:translateY(-4px);
        border-color:color-mix(in srgb, var(--wb-accent) 64%, var(--wb-border) 36%);
        box-shadow:0 20px 42px rgba(52,28,42,.20), 0 0 28px var(--wb-glow), 0 0 0 1px rgba(255,255,255,.36) inset;
      }
      .wb-game-icon {
        width:68px;
        height:68px;
        border-radius:8px;
        border-color:color-mix(in srgb, var(--wb-accent) 34%, var(--wb-border) 66%);
        color:#fff;
        background:linear-gradient(135deg, var(--wb-accent), var(--wb-accent2));
        box-shadow:0 12px 24px var(--wb-glow), 0 1px 0 rgba(255,255,255,.45) inset;
      }
      .wb-game-icon.has-image { color:transparent; background:var(--wb-soft); }
      .wb-game-icon.has-image img { border-radius:7px; }
      .wb-game-info { position:relative; z-index:1; }
      .wb-game-name { font-size:19px; color:var(--wb-text); }
      .wb-panel {
        border-radius:8px;
        border-color:color-mix(in srgb, var(--wb-border) 76%, transparent 24%);
        background:linear-gradient(180deg, color-mix(in srgb, var(--wb-panel) 94%, #fff 6%), color-mix(in srgb, var(--wb-panel) 76%, var(--wb-soft) 24%));
        box-shadow:0 12px 30px rgba(45,24,36,.10), 0 1px 0 rgba(255,255,255,.45) inset;
      }
      #${POPUP_ID}.wb-night .wb-panel {
        background:linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.025)), var(--wb-panel);
        box-shadow:0 14px 34px rgba(0,0,0,.28), 0 1px 0 rgba(255,255,255,.07) inset;
      }
      #${POPUP_ID}.wb-spring .wb-panel {
        background:
          repeating-linear-gradient(90deg, rgba(76,59,42,.04) 0 3px, transparent 3px 16px),
          linear-gradient(180deg, rgba(255,255,255,.36), rgba(246,231,200,.42)),
          var(--wb-panel);
      }
      #${POPUP_ID}.wb-mono .wb-panel {
        background:#fff;
        border-color:#111;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-cyber .wb-panel {
        background:linear-gradient(180deg, rgba(25,211,197,.07), rgba(241,232,91,.025)), var(--wb-panel);
        box-shadow:0 14px 34px rgba(0,0,0,.32), 0 0 0 1px rgba(25,211,197,.08) inset;
      }
      .wb-toolbar {
        padding:5px;
        border-radius:3px;
        margin-bottom:6px;
        background:color-mix(in srgb, var(--wb-soft) 52%, transparent 48%);
        border:1px solid color-mix(in srgb, var(--wb-border) 58%, transparent 42%);
      }
      .wb-toolbar .wb-btn { min-height:28px; padding:4px 9px; }
      .wb-toolbar .wb-select, .wb-toolbar .wb-input { min-height:28px; padding:4px 7px; }
      .wb-toolbar .wb-pill { padding:3px 7px; }
      .wb-pill {
        border-radius:999px;
        color:var(--wb-text);
        background:linear-gradient(180deg, color-mix(in srgb, var(--wb-panel) 86%, #fff 14%), color-mix(in srgb, var(--wb-soft) 78%, var(--wb-panel) 22%));
        box-shadow:0 1px 0 rgba(255,255,255,.42) inset;
      }
      .wb-board-wrap {
        border-radius:8px;
        padding:14px;
        border:1px solid color-mix(in srgb, var(--wb-border) 70%, var(--wb-gold) 30%);
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--wb-board) 82%, #fff 18%), color-mix(in srgb, var(--wb-soft) 72%, var(--wb-board) 28%));
        box-shadow:0 18px 38px rgba(51,28,41,.13) inset, 0 12px 28px rgba(51,28,41,.12);
      }
      #${POPUP_ID}.wb-night .wb-board-wrap {
        background:linear-gradient(135deg, #130d18, #1d1224 55%, #120b17);
        box-shadow:0 18px 38px rgba(0,0,0,.34) inset, 0 0 24px rgba(244,194,215,.07);
      }
      #${POPUP_ID}.wb-spring .wb-board-wrap {
        background:
          linear-gradient(135deg, #F6E7C8, #D8EDB2);
        border-color:#BFA372;
        box-shadow:0 16px 34px rgba(76,59,42,.12) inset;
      }
      #${POPUP_ID}.wb-mono .wb-board-wrap {
        background:#fff;
        border:2px solid #111;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-cyber .wb-board-wrap {
        background:
          linear-gradient(135deg, rgba(25,211,197,.08), rgba(241,232,91,.05)),
          #101A1D;
        border-color:#4C5B4A;
        box-shadow:0 0 0 1px rgba(25,211,197,.20) inset, 0 0 24px rgba(25,211,197,.12), 0 18px 38px rgba(0,0,0,.40) inset;
      }
      #${POPUP_ID}.wb-spring :is(.wb-canvas,.wb-ludo,.wb-territory-board) {
        border:7px solid #9E7846;
        border-color:#B98A54 #6F4F2C #6F4F2C #C99A5F;
        box-shadow:0 0 0 2px rgba(255,246,220,.55) inset, 0 10px 22px rgba(76,59,42,.20);
      }
      #${POPUP_ID}.wb-mono :is(.wb-canvas,.wb-ludo,.wb-territory-board,.wb-grid2048,.wb-gomoku,.wb-board3) {
        border:4px solid #111;
        border-color:#111;
        box-shadow:none;
        image-rendering:pixelated;
      }
      #${POPUP_ID}.wb-mono :is(.wb-canvas,.wb-jump-canvas,.wb-plank-canvas,.wb-tetris-canvas) {
        filter:grayscale(1) contrast(1.12);
      }
      #${POPUP_ID}.wb-cyber :is(.wb-canvas,.wb-ludo,.wb-territory-board) {
        border:4px solid #4C5B4A;
        border-image:linear-gradient(135deg, #F1E85B, #19D3C5 38%, #8B6BFF 68%, #FF4FA3) 1;
        box-shadow:0 0 0 2px rgba(241,232,91,.10) inset, 0 0 18px rgba(25,211,197,.18), 0 0 28px rgba(241,232,91,.10);
      }
      .wb-canvas, .wb-grid2048, .wb-board3, .wb-gomoku, .wb-ludo {
        border-radius:8px;
        box-shadow:0 0 0 1px rgba(255,255,255,.16), 0 12px 28px rgba(0,0,0,.20);
      }
      .wb-canvas,
      .wb-canvas.wb-tetris-canvas,
      .wb-canvas.wb-watermelon-canvas,
      #wb-canvas.wb-canvas {
        border-radius:0;
      }
      .wb-grid2048 { background:linear-gradient(135deg, #d8b59f, #bfa1c9); }
      .wb-tile { border-radius:6px; box-shadow:0 2px 7px rgba(59,35,42,.18), 0 1px 0 rgba(255,255,255,.45) inset; }
      .wb-cell { border-radius:8px; background:linear-gradient(180deg, var(--wb-panel), var(--wb-soft)); box-shadow:0 1px 0 rgba(255,255,255,.34) inset; }
      .wb-cell:hover, .wb-gcell:hover, .wb-ludo-piece:hover { filter:brightness(1.08); transform:translateY(-1px); }
      .wb-gomoku { background:linear-gradient(135deg, #d7b06e, #b98b5e); }
      .wb-gcell { box-shadow:0 1px 1px rgba(255,255,255,.28) inset; }
      .wb-ludo { border-radius:8px; background-image:linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.15) 75%), linear-gradient(45deg, rgba(255,255,255,.15) 25%, transparent 25%, transparent 75%, rgba(255,255,255,.15) 75%); background-position:0 0, 10px 10px; background-size:20px 20px; }
      #${POPUP_ID}.wb-night .wb-ludo { background-color:#241429; border-color:rgba(244,194,215,.20); }
      #${POPUP_ID}.wb-night .wb-ludo-cell { background:#1b1020; border-color:rgba(244,194,215,.10); }
      #${POPUP_ID}.wb-night .wb-ludo-cell.path { background:#2b1830; }
      #${POPUP_ID}.wb-night .wb-ludo-cell.home-red { background:#3a1c2a; }
      #${POPUP_ID}.wb-night .wb-ludo-cell.home-blue { background:#241d3a; }
      #${POPUP_ID}.wb-arcade .wb-ludo { background-color:#E5F4FF; border-color:#B8DCEF; background-image:none; box-shadow:none; }
      #${POPUP_ID}.wb-arcade .wb-ludo-cell { background:#FFFDF8; border-color:rgba(95,168,215,.18); }
      #${POPUP_ID}.wb-arcade .wb-ludo-cell.path { background:#F8FCFF; }
      #${POPUP_ID}.wb-arcade .wb-ludo-cell.home-red { background:#FCEAF1; }
      #${POPUP_ID}.wb-arcade .wb-ludo-cell.home-blue { background:#DDEFFF; }
      #${POPUP_ID}.wb-spring .wb-ludo { background-color:#B98A54; border-color:#6F4F2C; }
      #${POPUP_ID}.wb-spring .wb-ludo-cell { background:#F6E7C8; border-color:rgba(76,59,42,.18); }
      #${POPUP_ID}.wb-spring .wb-ludo-cell.path { background:#D8EDB2; }
      #${POPUP_ID}.wb-spring .wb-ludo-cell.home-red { background:#E3C56A; }
      #${POPUP_ID}.wb-spring .wb-ludo-cell.home-blue { background:#BDE0E9; }
      #${POPUP_ID}.wb-mono .wb-ludo { background-color:#d0d0d0; border-color:#111; background-image:none; }
      #${POPUP_ID}.wb-mono .wb-ludo-cell { background:#f2f2f2; border-color:#999; }
      #${POPUP_ID}.wb-mono .wb-ludo-cell.path { background:#c9c9c9; }
      #${POPUP_ID}.wb-mono .wb-ludo-cell.home-red { background:#777; }
      #${POPUP_ID}.wb-mono .wb-ludo-cell.home-blue { background:#aaa; }
      #${POPUP_ID}.wb-cyber .wb-ludo { background-color:#101A1D; border-color:#4C5B4A; box-shadow:0 0 18px rgba(25,211,197,.14); }
      #${POPUP_ID}.wb-cyber .wb-ludo-cell { background:#14201B; border-color:rgba(25,211,197,.16); }
      #${POPUP_ID}.wb-cyber .wb-ludo-cell.path { background:#24352D; }
      #${POPUP_ID}.wb-cyber .wb-ludo-cell.home-red { background:rgba(255,79,163,.20); }
      #${POPUP_ID}.wb-cyber .wb-ludo-cell.home-blue { background:rgba(25,211,197,.18); }
      #${POPUP_ID}.wb-cardtheater .wb-ludo {
        background-color:#080304;
        background-image:radial-gradient(circle at 50% 50%, rgba(201,24,43,.22), transparent 34%), repeating-linear-gradient(45deg, rgba(245,201,104,.055) 0 1px, transparent 1px 9px);
        border-color:rgba(245,201,104,.62);
        box-shadow:0 18px 36px rgba(0,0,0,.44), 0 0 0 1px rgba(245,201,104,.12) inset, 0 0 24px rgba(201,24,43,.16);
      }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-cell {
        background:#0D0607;
        border-color:rgba(245,201,104,.18);
        color:#F8EFE7;
      }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-cell.path { background:#1B090D; box-shadow:inset 0 0 0 1px rgba(245,201,104,.06); }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-cell.home-red { background:linear-gradient(135deg, rgba(201,24,43,.42), rgba(58,7,16,.78)); }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-cell.home-blue { background:linear-gradient(135deg, rgba(245,201,104,.22), rgba(10,7,8,.88)); }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-cell.flight-red { background:linear-gradient(rgba(201,24,43,.42), rgba(201,24,43,.42)), #1B090D; box-shadow:inset 0 0 0 2px rgba(255,48,72,.42); }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-cell.flight-blue { background:linear-gradient(rgba(245,201,104,.24), rgba(245,201,104,.24)), #0D0607; box-shadow:inset 0 0 0 2px rgba(245,201,104,.42); }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-cell.flight-red.flight-blue { background:linear-gradient(135deg, rgba(201,24,43,.46) 0 50%, rgba(245,201,104,.30) 50% 100%), #13080A; }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-piece.red {
        background:radial-gradient(circle at 32% 26%, #FF9AA6, #C9182B 56%, #550711);
        border-color:rgba(245,201,104,.62);
        color:#FFF8F0;
      }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-piece.blue {
        background:radial-gradient(circle at 32% 26%, #FFF8F0, #F5C968 48%, #1A0A0D 72%);
        border-color:rgba(245,201,104,.72);
        color:#170608;
      }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-piece.can { outline-color:#F5C968; box-shadow:0 0 16px rgba(245,201,104,.42),0 2px 8px rgba(0,0,0,.36); }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-flight-line.red { stroke:#FF3048; opacity:.86; }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-flight-line.blue { stroke:#F5C968; opacity:.86; }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-dice {
        background:linear-gradient(180deg,#F8EFE7,#D8B878);
        border-color:rgba(245,201,104,.74);
        box-shadow:0 8px 18px rgba(0,0,0,.34), inset 0 0 0 1px rgba(255,255,255,.55);
      }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-dot { background:#160608; }
      #${POPUP_ID}.wb-cardtheater .wb-ludo-dice.one .wb-ludo-dot { background:#C9182B; }
      #${POPUP_ID}.wb-spring :is(.wb-canvas,.wb-ludo,.wb-territory-board) {
        border:7px solid #9E7846;
        border-color:#B98A54 #6F4F2C #6F4F2C #C99A5F;
        box-shadow:0 0 0 2px rgba(255,246,220,.55) inset, 0 10px 22px rgba(76,59,42,.20);
      }
      #${POPUP_ID}.wb-cyber :is(.wb-canvas,.wb-ludo,.wb-territory-board) {
        border:4px solid #4C5B4A;
        border-image:linear-gradient(135deg, #F1E85B, #19D3C5 38%, #8B6BFF 68%, #FF4FA3) 1;
        box-shadow:0 0 0 2px rgba(241,232,91,.10) inset, 0 0 18px rgba(25,211,197,.18), 0 0 28px rgba(241,232,91,.10);
      }
      .wb-ludo-cell { border-radius:4px; }
      .wb-ludo-piece { transition:.14s transform,.14s filter; }
      .wb-ludo-piece.can { outline-color:var(--wb-gold); box-shadow:0 0 14px var(--wb-glow), 0 2px 6px rgba(0,0,0,.26); }
      .wb-companion.on {
        border-radius:8px;
        border-left:0;
        border-top:1px solid color-mix(in srgb, var(--wb-accent2) 70%, #fff 30%);
        background:linear-gradient(135deg, color-mix(in srgb, var(--wb-panel) 80%, #fff 20%), color-mix(in srgb, var(--wb-soft) 74%, var(--wb-accent2) 26%));
        box-shadow:0 12px 24px rgba(37,28,43,.12), 0 1px 0 rgba(255,255,255,.40) inset;
      }
      #${POPUP_ID}.wb-night .wb-side-companion { background:linear-gradient(155deg, #211a32, #162530 72%); border-color:rgba(110,214,209,.26); box-shadow:0 14px 34px rgba(0,0,0,.30), 0 0 22px rgba(110,214,209,.07) inset; }
      #${POPUP_ID}.wb-night .wb-companion.on { background:linear-gradient(135deg, rgba(55,38,70,.92), rgba(25,55,64,.84)); border-top-color:rgba(110,214,209,.55); }
      #${POPUP_ID}.wb-night .wb-speech { background:rgba(13,19,32,.72); border:1px solid rgba(110,214,209,.18); color:#f5eafa; }
      #${POPUP_ID}.wb-night .wb-comp-name { color:#f3c56a; }
      #${POPUP_ID}.wb-arcade .wb-side-companion { background:#FFFDF8; border-color:rgba(95,168,215,.28); box-shadow:none; }
      #${POPUP_ID}.wb-arcade .wb-companion.on { background:#F8FCFF; border-top-color:rgba(246,200,216,.78); box-shadow:none; }
      #${POPUP_ID}.wb-arcade .wb-speech { background:#FFFDF8; border:1px solid rgba(95,168,215,.24); color:#28435A; box-shadow:none; }
      #${POPUP_ID}.wb-arcade .wb-comp-name { color:#4D9AC9; }
      #${POPUP_ID}.wb-arcade,
      .wb-modal-mask.wb-arcade {
        font-family:'WanbanLetter','LXGW WenKai','霞鹜文楷','Klee One','Comic Sans MS','Microsoft YaHei',system-ui,sans-serif;
      }
      #${POPUP_ID}.wb-arcade {
        background:
          repeating-linear-gradient(180deg, transparent 0 27px, rgba(95,168,215,.10) 27px 28px),
          var(--wb-bg);
        border-color:#B8DCEF;
        border-top-color:#F6C8D8;
        box-shadow:0 18px 42px rgba(95,168,215,.14);
      }
      #${POPUP_ID}.wb-arcade .wb-head,
      #${POPUP_ID}.wb-arcade .wb-body,
      .wb-modal-mask.wb-arcade .wb-modal {
        background:
          repeating-linear-gradient(180deg, transparent 0 27px, rgba(95,168,215,.08) 27px 28px),
          var(--wb-bg);
      }
      #${POPUP_ID}.wb-arcade .wb-head { border-bottom-color:#B8DCEF; }
      #${POPUP_ID}.wb-arcade .wb-title { color:#4D9AC9; letter-spacing:1px; }
      #${POPUP_ID}.wb-arcade .wb-title::after,
      .wb-modal-mask.wb-arcade .wb-modal-title::after { background:#F6C8D8; opacity:1; }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-board-wrap,.wb-game-card,.wb-toolbar,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-worldbook-list,.wb-api-status,.wb-record-table-wrap,.wb-guess-history,.wb-clue-box,.wb-oldmaid-hand,.wb-oldmaid-log),
      .wb-modal-mask.wb-arcade :is(.wb-modal,.wb-sticky-actions,.wb-api-status,.wb-worldbook-list) {
        background:#FFFDF8;
        border-color:#B8DCEF;
        box-shadow:0 7px 16px rgba(73,126,158,.10), 0 1px 0 rgba(255,255,255,.78) inset;
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag) {
        background:#FFFDF8;
        border-color:#B8DCEF;
        color:#28435A;
        border-radius:6px;
        box-shadow:none;
        text-shadow:none;
        letter-spacing:0;
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn.primary,.wb-tab.active,.wb-tag.active),
      .wb-modal-mask.wb-arcade :is(.wb-btn.primary,.wb-tab.active,.wb-tag.active) {
        background:#5FA8D7;
        border-color:#5FA8D7;
        color:#FFFFFF;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-arcade .wb-tabs {
        background:#E5F4FF;
        border-color:#B8DCEF;
        box-shadow:0 4px 10px rgba(73,126,158,.08);
      }
      #${POPUP_ID}.wb-arcade .wb-game-card {
        border-left-color:#F6C8D8;
        transition:.14s border-color,.14s background-color;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:hover {
        transform:none;
        background:#F8FCFF;
        border-color:#8FC9E8;
        border-left-color:#F6C8D8;
        box-shadow:0 9px 18px rgba(73,126,158,.13), 0 1px 0 rgba(255,255,255,.82) inset;
      }
      #${POPUP_ID}.wb-arcade .wb-game-icon {
        background:#E5F4FF;
        border-color:#B8DCEF;
        color:#4D9AC9;
        border-radius:6px;
        box-shadow:0 3px 8px rgba(73,126,158,.08);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-canvas,.wb-grid2048,.wb-board3,.wb-gomoku,.wb-ludo,.wb-territory-board,.wb-cell,.wb-tile) {
        box-shadow:0 5px 12px rgba(73,126,158,.09);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-cell,.wb-tile) { box-shadow:0 2px 5px rgba(73,126,158,.08); }
      #${POPUP_ID}.wb-arcade .wb-cell { background:#FFFDF8; border-color:#B8DCEF; }
      #${POPUP_ID}.wb-arcade .wb-arcade-btn {
        background:#FFFDF8;
        border-color:#9CCCE6;
        color:#28435A;
        box-shadow:none;
        text-shadow:none;
      }
      #${POPUP_ID}.wb-arcade .wb-arcade-btn:active { filter:brightness(.98); box-shadow:none; }
      #${POPUP_ID}.wb-arcade .wb-tetris-controls .up,
      #${POPUP_ID}.wb-arcade .wb-tetris-controls .down {
        background:#5FA8D7;
        border-color:#5FA8D7;
        color:#FFFFFF;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-arcade .wb-tetris-controls .up::after,
      #${POPUP_ID}.wb-arcade .wb-tetris-controls .down::after {
        color:#FFFFFF;
        text-shadow:none;
      }
      #${POPUP_ID}.wb-arcade {
        --wb-paper:#FFF7D8;
        --wb-paper-line:rgba(95,168,215,.13);
        --wb-paper-margin:rgba(246,200,216,.82);
        --wb-paper-shadow:rgba(77,132,166,.13);
        background:
          linear-gradient(90deg, transparent 0 34px, var(--wb-paper-margin) 35px, var(--wb-paper-margin) 36px, transparent 37px),
          repeating-linear-gradient(180deg, transparent 0 25px, var(--wb-paper-line) 26px, transparent 27px),
          linear-gradient(180deg, #F8FCFF 0%, #F3FAFF 100%);
        border:1px solid #A9D3EA;
        border-radius:8px;
        box-shadow:0 24px 54px rgba(65,112,143,.18), 0 2px 0 rgba(255,255,255,.86) inset;
      }
      #${POPUP_ID}.wb-arcade .wb-head,
      #${POPUP_ID}.wb-arcade .wb-body,
      .wb-modal-mask.wb-arcade .wb-modal {
        background:
          linear-gradient(90deg, transparent 0 34px, var(--wb-paper-margin) 35px, var(--wb-paper-margin) 36px, transparent 37px),
          repeating-linear-gradient(180deg, transparent 0 25px, var(--wb-paper-line) 26px, transparent 27px),
          rgba(248,252,255,.92);
      }
      .wb-modal-mask.wb-arcade .wb-modal {
        position:relative;
        border-radius:0;
        background:var(--wb-paper);
        border:0;
        box-shadow:6px 8px 0 rgba(232,211,150,.38), 0 20px 46px rgba(65,112,143,.20);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-board-wrap,.wb-game-card,.wb-toolbar,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-worldbook-list,.wb-api-status,.wb-record-table-wrap,.wb-guess-history,.wb-clue-box,.wb-oldmaid-hand,.wb-oldmaid-log),
      .wb-modal-mask.wb-arcade :is(.wb-sticky-actions,.wb-api-status,.wb-worldbook-list) {
        position:relative;
        background:#FFFDF8;
        border:1px solid rgba(208,177,105,.42);
        border-radius:0;
        box-shadow:4px 6px 0 rgba(232,211,150,.34), 0 12px 24px var(--wb-paper-shadow);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-game-card,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-api-status)::before,
      .wb-modal-mask.wb-arcade :is(.wb-api-status,.wb-worldbook-list)::before {
        content:'';
        position:absolute;
        left:12px;
        right:12px;
        top:-1px;
        height:2px;
        background:rgba(95,168,215,.25);
        pointer-events:none;
      }
      #${POPUP_ID}.wb-arcade .wb-tabs {
        background:rgba(229,244,255,.76);
        border-radius:0;
        padding:2px;
      }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab {
        background:transparent;
        border-color:transparent;
        color:#527891;
        border-radius:0;
      }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab.active {
        background:#FFFDF8;
        color:#3F8FBE;
        box-shadow:0 2px 7px rgba(77,132,166,.10), inset 0 -2px 0 #5FA8D7;
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag) {
        background:#FFFDF8;
        border-color:rgba(118,177,210,.78);
        border-radius:0;
        box-shadow:0 2px 0 rgba(188,220,238,.36);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn.primary,.wb-tag.active),
      .wb-modal-mask.wb-arcade :is(.wb-btn.primary,.wb-tag.active) {
        background:#5FA8D7;
        border-color:#4D9AC9;
        color:#fff;
        box-shadow:0 3px 0 rgba(61,126,166,.22);
      }
      #${POPUP_ID}.wb-arcade .wb-title,
      #${POPUP_ID}.wb-arcade .wb-section-title,
      .wb-modal-mask.wb-arcade .wb-modal-title {
        color:#3F8FBE;
      }
      #${POPUP_ID}.wb-arcade .wb-title::after {
        width:84px;
        height:2px;
        background:#F6C8D8;
      }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-game-card,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-api-status)::before,
      .wb-modal-mask.wb-arcade :is(.wb-api-status,.wb-worldbook-list)::before {
        content:none;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card {
        align-items:flex-start;
        gap:13px;
        min-height:110px;
        padding:18px 14px 14px;
        background:#FFFDF8;
        border:0;
        border-left:0;
        border-radius:0;
        box-shadow:5px 7px 0 rgba(188,220,238,.40), 0 14px 28px rgba(77,132,166,.12);
        overflow:visible;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card::after,
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-side-companion,.wb-companion.on,.wb-speech)::after,
      .wb-modal-mask.wb-arcade .wb-modal::after {
        content:'';
        position:absolute;
        left:50%;
        top:-9px;
        width:72px;
        height:16px;
        transform:translateX(-50%) rotate(-1.5deg);
        border:1px solid rgba(216,184,95,.18);
        background:rgba(255,232,154,.68);
        box-shadow:0 2px 5px rgba(83,130,158,.08);
        pointer-events:none;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 1)::after { transform:translateX(-50%) rotate(1.8deg); }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 2)::after { transform:translateX(-50%) rotate(-2.2deg); }
      #${POPUP_ID}.wb-arcade .wb-game-card:hover {
        border-color:transparent;
        box-shadow:6px 8px 0 rgba(188,220,238,.50), 0 16px 30px rgba(77,132,166,.16);
      }
      #${POPUP_ID}.wb-arcade .wb-game-icon {
        width:58px;
        height:58px;
        padding:4px;
        background:#FFFFFF;
        border:1px solid rgba(157,190,208,.62);
        border-radius:0;
        box-shadow:3px 4px 0 rgba(188,220,238,.38), 0 8px 15px rgba(77,132,166,.10);
        transform:rotate(-1.4deg);
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(2n) .wb-game-icon { transform:rotate(1.2deg); }
      #${POPUP_ID}.wb-arcade .wb-game-icon img {
        border-radius:0;
        outline:1px solid rgba(95,168,215,.18);
        outline-offset:-1px;
      }
      #${POPUP_ID}.wb-arcade .wb-game-icon:not(.has-image) {
        background:
          linear-gradient(#FFFFFF,#FFFFFF) padding-box,
          repeating-linear-gradient(180deg, #EAF6FF 0 8px, #F8FCFF 8px 16px) border-box;
        color:#3F8FBE;
      }
      #${POPUP_ID}.wb-arcade .wb-game-name { color:#2F789F; letter-spacing:.5px; }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-side-companion,.wb-companion.on,.wb-speech),
      .wb-modal-mask.wb-arcade .wb-modal {
        overflow:visible;
        box-shadow:5px 7px 0 rgba(188,220,238,.36), 0 14px 28px rgba(77,132,166,.12);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag) {
        box-shadow:0 2px 0 rgba(188,220,238,.36);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag):hover,
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag):focus-visible,
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag):hover,
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag):focus-visible {
        transform:translateY(-1px);
        background:#F4FBFF;
        border-color:#74B7DC;
        color:#236F98;
        box-shadow:0 3px 0 rgba(188,220,238,.48), 0 8px 16px rgba(77,132,166,.12);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn.primary,.wb-tag.active):hover,
      #${POPUP_ID}.wb-arcade :is(.wb-btn.primary,.wb-tag.active):focus-visible,
      .wb-modal-mask.wb-arcade :is(.wb-btn.primary,.wb-tag.active):hover,
      .wb-modal-mask.wb-arcade :is(.wb-btn.primary,.wb-tag.active):focus-visible {
        background:#4D9AC9;
        border-color:#3F8FBE;
        color:#fff;
        box-shadow:0 4px 0 rgba(61,126,166,.26), 0 9px 18px rgba(77,132,166,.16);
      }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab:hover,
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab:focus-visible {
        background:rgba(255,253,248,.72);
        color:#236F98;
        box-shadow:inset 0 -2px 0 rgba(95,168,215,.45);
      }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab.active:hover,
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab.active:focus-visible {
        background:#FFFDF8;
        color:#236F98;
        box-shadow:0 3px 8px rgba(77,132,166,.12), inset 0 -2px 0 #4D9AC9;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:hover .wb-game-icon {
        box-shadow:4px 5px 0 rgba(188,220,238,.48), 0 10px 18px rgba(77,132,166,.14);
        border-color:rgba(95,168,215,.72);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag,.wb-game-card),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag) {
        border-radius:0;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card {
        background:#FFFDF8;
        border:0;
        border-left:0;
        border-radius:0;
        box-shadow:
          0 1px 1px rgba(68,111,139,.08),
          5px 7px 14px rgba(148,174,190,.30),
          16px 20px 36px rgba(77,105,126,.14);
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:hover {
        transform:translateY(-1px);
        border-color:transparent;
        box-shadow:
          0 1px 2px rgba(68,111,139,.10),
          7px 9px 18px rgba(148,174,190,.40),
          20px 24px 42px rgba(77,105,126,.18);
      }
      #${POPUP_ID}.wb-arcade .wb-game-card::after {
        border-color:transparent;
        background:rgba(255,255,255,.82);
        box-shadow:0 2px 8px rgba(87,112,130,.10);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-side-companion,.wb-companion.on,.wb-speech),
      .wb-modal-mask.wb-arcade .wb-modal {
        border-radius:0;
        box-shadow:
          0 1px 1px rgba(82,94,104,.08),
          6px 8px 18px rgba(188,220,238,.24),
          18px 22px 42px rgba(77,132,166,.12);
      }
      .wb-modal-mask.wb-arcade .wb-modal {
        background:var(--wb-paper);
        border:0;
        box-shadow:
          0 1px 1px rgba(112,88,36,.08),
          7px 9px 18px rgba(232,211,150,.35),
          22px 26px 52px rgba(65,112,143,.18);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag) {
        border-color:transparent;
        box-shadow:0 2px 0 rgba(148,174,190,.28), 0 7px 14px rgba(77,105,126,.10);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag):hover,
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag):focus-visible,
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag):hover,
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag):focus-visible {
        border-color:transparent;
        box-shadow:0 3px 0 rgba(148,174,190,.38), 0 9px 18px rgba(77,105,126,.14);
      }
      .wb-modal-mask.wb-arcade .wb-modal {
        max-height:calc(100dvh - 40px);
        overflow-y:auto;
        overflow-x:hidden;
        overscroll-behavior:contain;
      }
      .wb-modal-mask.wb-arcade .wb-modal::after {
        top:8px;
        z-index:1;
      }
      .wb-modal-mask.wb-arcade .wb-modal-title,
      .wb-modal-mask.wb-arcade .wb-modal > :not(.wb-sticky-actions) {
        position:relative;
        z-index:2;
      }
      .wb-modal-mask.wb-arcade .wb-sticky-actions {
        position:sticky;
        bottom:-18px;
        z-index:8;
        margin:12px -22px -18px;
        padding:10px 22px;
        background:#FFF7D8;
        border:0;
        box-shadow:0 -10px 22px rgba(112,88,36,.08), 0 -1px 0 rgba(255,255,255,.58);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-game-card,.wb-panel,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-api-status,.wb-worldbook-list,.wb-record-table-wrap,.wb-guess-history,.wb-clue-box,.wb-oldmaid-hand,.wb-oldmaid-log) {
        position:relative;
        background:#FFFDF8;
        border:0;
        border-left:0;
        border-radius:0;
        box-shadow:
          0 1px 1px rgba(68,111,139,.08),
          5px 7px 14px rgba(148,174,190,.30),
          16px 20px 36px rgba(77,105,126,.14);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-game-card,.wb-panel,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-api-status,.wb-worldbook-list)::before {
        content:none;
      }
      #${POPUP_ID}.wb-arcade :is(.wb-game-card,.wb-panel,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-api-status,.wb-worldbook-list)::after {
        content:'';
        position:absolute;
        left:50%;
        top:-9px;
        width:72px;
        height:16px;
        transform:translateX(-50%) rotate(-1.5deg);
        border:0;
        background:rgba(255,232,154,.72);
        box-shadow:0 2px 8px rgba(87,112,130,.10);
        pointer-events:none;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 1)::after { transform:translateX(-50%) rotate(1.8deg); }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 2)::after { transform:translateX(-50%) rotate(-2.2deg); }
      #${POPUP_ID}.wb-arcade :is(.wb-game-card,.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag):hover,
      #${POPUP_ID}.wb-arcade :is(.wb-game-card,.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag):focus-visible {
        border-color:transparent;
        box-shadow:
          0 1px 2px rgba(68,111,139,.10),
          7px 9px 18px rgba(148,174,190,.40),
          20px 24px 42px rgba(77,105,126,.18);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag) {
        border-color:transparent;
        border-radius:0;
        box-shadow:0 2px 0 rgba(148,174,190,.28), 0 7px 14px rgba(77,105,126,.10);
      }
      .wb-modal-mask.wb-arcade .wb-modal {
        position:relative;
        background:#FFF7D8;
        border:0;
        border-radius:0;
        max-height:calc(100dvh - 40px);
        overflow-y:auto;
        overflow-x:hidden;
        overscroll-behavior:contain;
        box-shadow:
          0 1px 1px rgba(112,88,36,.08),
          7px 9px 18px rgba(232,211,150,.35),
          22px 26px 52px rgba(65,112,143,.18);
      }
      .wb-modal-mask.wb-arcade .wb-modal::after {
        content:'';
        position:absolute;
        left:50%;
        top:8px;
        width:72px;
        height:16px;
        transform:translateX(-50%) rotate(-1.5deg);
        border:0;
        background:rgba(255,255,255,.86);
        box-shadow:0 2px 8px rgba(87,112,130,.10);
        pointer-events:none;
        z-index:1;
      }
      .wb-modal-mask.wb-arcade .wb-modal-title,
      .wb-modal-mask.wb-arcade .wb-modal > :not(.wb-sticky-actions) {
        position:relative;
        z-index:2;
      }
      .wb-modal-mask.wb-arcade .wb-sticky-actions {
        position:sticky;
        bottom:-18px;
        z-index:8;
        margin:12px -22px -18px;
        padding:10px 22px;
        background:#FFF7D8;
        border:0;
        box-shadow:0 -10px 22px rgba(112,88,36,.08), 0 -1px 0 rgba(255,255,255,.58);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag) {
        border-color:rgba(148,174,190,.12);
        border-radius:0;
        transform:rotate(-.25deg);
        box-shadow:2px 3px 8px rgba(86,111,128,.13);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag):nth-child(even),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag):nth-child(even) {
        transform:rotate(.22deg);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn.primary,.wb-tag.active),
      .wb-modal-mask.wb-arcade :is(.wb-btn.primary,.wb-tag.active) {
        border-color:rgba(77,154,201,.16);
        box-shadow:2px 3px 8px rgba(63,111,139,.16);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag):hover,
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag):focus-visible,
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag):hover,
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag):focus-visible {
        transform:translateY(-1px) rotate(0deg);
        border-color:rgba(116,183,220,.18);
        box-shadow:3px 4px 10px rgba(86,111,128,.18);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-game-card,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-api-status,.wb-worldbook-list,.wb-record-table-wrap,.wb-guess-history,.wb-clue-box,.wb-oldmaid-hand,.wb-oldmaid-log)::after,
      .wb-modal-mask.wb-arcade :is(.wb-modal,.wb-api-status,.wb-worldbook-list)::after {
        content:none;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card::after,
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-body > .wb-panel::after {
        content:'';
        position:absolute;
        left:50%;
        top:-9px;
        width:72px;
        height:16px;
        transform:translateX(-50%) rotate(-1.5deg);
        border:0;
        background:rgba(255,232,154,.72);
        box-shadow:0 2px 8px rgba(87,112,130,.10);
        pointer-events:none;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 1)::after { transform:translateX(-50%) rotate(1.8deg); }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 2)::after { transform:translateX(-50%) rotate(-2.2deg); }
      .wb-modal-mask.wb-arcade .wb-modal {
        padding-top:26px;
      }
      .wb-modal-mask.wb-arcade .wb-modal::after {
        content:'';
        position:absolute;
        left:50%;
        top:-10px;
        width:84px;
        height:18px;
        transform:translateX(-50%) rotate(-1.2deg);
        border:0;
        background:rgba(255,255,255,.88);
        box-shadow:1px 2px 4px rgba(87,112,130,.08);
        pointer-events:none;
        z-index:10;
      }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-game-card,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-api-status,.wb-worldbook-list,.wb-record-table-wrap,.wb-guess-history,.wb-clue-box,.wb-oldmaid-hand,.wb-oldmaid-log)::after,
      .wb-modal-mask.wb-arcade :is(.wb-modal,.wb-api-status,.wb-worldbook-list)::after {
        content:none;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card,
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-body > .wb-panel,
      .wb-modal-mask.wb-arcade .wb-modal {
        overflow:visible;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card { padding-top:28px; }
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-body > .wb-panel { padding-top:28px; }
      .wb-modal-mask.wb-arcade .wb-modal {
        padding-top:36px;
        overflow-y:auto;
        overflow-x:hidden;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card::after,
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-body > .wb-panel::after {
        content:'';
        position:absolute;
        left:50%;
        top:7px;
        width:72px;
        height:16px;
        transform:translateX(-50%) rotate(-1.5deg);
        border:0;
        background:rgba(255,232,154,.76);
        box-shadow:0 2px 8px rgba(87,112,130,.10);
        pointer-events:none;
        z-index:3;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 1)::after { transform:translateX(-50%) rotate(1.8deg); }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 2)::after { transform:translateX(-50%) rotate(-2.2deg); }
      .wb-modal-mask.wb-arcade .wb-modal::after {
        content:'';
        position:absolute;
        left:50%;
        top:8px;
        width:84px;
        height:18px;
        transform:translateX(-50%) rotate(-1.2deg);
        border:0;
        background:rgba(255,255,255,.88);
        box-shadow:1px 2px 4px rgba(87,112,130,.08);
        pointer-events:none;
        z-index:10;
      }
      #${POPUP_ID}.wb-arcade .wb-tabs {
        gap:6px;
        background:transparent;
        border:0;
        box-shadow:none;
        padding:0;
        overflow:visible;
      }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab {
        position:relative;
        overflow:visible;
        background:#FFFDF8;
        color:#527891;
        border:0;
        border-radius:0;
        transform:rotate(-.35deg);
        box-shadow:
          0 1px 1px rgba(68,111,139,.08),
          3px 4px 10px rgba(148,174,190,.28),
          10px 12px 22px rgba(77,105,126,.10);
      }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab:nth-child(even) { transform:rotate(.28deg); }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab::after {
        content:'';
        position:absolute;
        left:50%;
        top:3px;
        width:34px;
        height:8px;
        transform:translateX(-50%) rotate(-1.4deg);
        background:rgba(255,232,154,.76);
        box-shadow:0 1px 5px rgba(87,112,130,.09);
        pointer-events:none;
      }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab.active {
        background:#F8FCFF;
        color:#236F98;
        box-shadow:
          0 1px 1px rgba(68,111,139,.10),
          4px 5px 12px rgba(148,174,190,.34),
          12px 14px 26px rgba(77,105,126,.13);
      }
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab:hover,
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab:focus-visible {
        transform:translateY(-1px) rotate(0deg);
        background:#F4FBFF;
        color:#236F98;
        box-shadow:
          0 1px 2px rgba(68,111,139,.10),
          5px 6px 14px rgba(148,174,190,.38),
          14px 16px 30px rgba(77,105,126,.16);
      }
      #${POPUP_ID}.wb-arcade :is(.wb-panel,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-api-status,.wb-worldbook-list,.wb-record-table-wrap,.wb-guess-history,.wb-clue-box,.wb-oldmaid-hand,.wb-oldmaid-log)::after,
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab::after,
      .wb-modal-mask.wb-arcade :is(.wb-modal,.wb-api-status,.wb-worldbook-list,.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag)::after {
        content:none;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card::after {
        content:'';
        position:absolute;
        left:50%;
        top:7px;
        width:72px;
        height:16px;
        transform:translateX(-50%) rotate(-1.5deg);
        border:0;
        background:rgba(255,232,154,.76);
        box-shadow:0 2px 8px rgba(87,112,130,.10);
        pointer-events:none;
        z-index:3;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 1)::after { transform:translateX(-50%) rotate(1.8deg); }
      #${POPUP_ID}.wb-arcade .wb-game-card:nth-child(3n + 2)::after { transform:translateX(-50%) rotate(-2.2deg); }
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-body > .wb-panel::after {
        content:'';
        position:absolute;
        left:50%;
        top:7px;
        width:72px;
        height:16px;
        transform:translateX(-50%) rotate(-1.5deg);
        border:0;
        background:rgba(255,232,154,.76);
        box-shadow:0 2px 8px rgba(87,112,130,.10);
        pointer-events:none;
        z-index:3;
      }
      .wb-modal-mask.wb-arcade .wb-modal::after {
        content:'';
        position:absolute;
        left:50%;
        top:8px;
        width:84px;
        height:18px;
        transform:translateX(-50%) rotate(-1.2deg);
        border:0;
        background:rgba(255,255,255,.88);
        box-shadow:1px 2px 4px rgba(87,112,130,.08);
        pointer-events:none;
        z-index:10;
      }
      @media (max-width: 768px) {
        #${POPUP_ID}.wb-arcade .wb-cardgrid {
          padding-top:10px;
        }
        #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-body {
          padding-top:18px;
        }
        .wb-modal-mask.wb-arcade {
          padding-top:calc(30px + env(safe-area-inset-top, 0px));
        }
      }
      #${POPUP_ID}.wb-arcade .wb-game-card,
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-settings-grid > .wb-panel {
        position:relative!important;
        overflow:visible!important;
        padding-top:30px!important;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card::after,
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-settings-grid > .wb-panel::after {
        content:''!important;
        display:block!important;
        position:absolute!important;
        left:50%!important;
        top:-8px!important;
        width:76px!important;
        height:16px!important;
        transform:translateX(-50%) rotate(-1.5deg)!important;
        border:0!important;
        background:rgba(255,232,154,.56)!important;
        box-shadow:0 1px 4px rgba(87,112,130,.12)!important;
        pointer-events:none!important;
        z-index:20!important;
      }
      #${POPUP_ID}.wb-arcade :is(.wb-side-companion,.wb-companion.on,.wb-api-status,.wb-worldbook-list,.wb-record-table-wrap,.wb-guess-history,.wb-clue-box,.wb-oldmaid-hand,.wb-oldmaid-log)::after,
      #${POPUP_ID}.wb-arcade .wb-tabs .wb-tab::after,
      .wb-modal-mask.wb-arcade :is(.wb-api-status,.wb-worldbook-list,.wb-btn,.wb-iconbtn,.wb-tab,.wb-pill,.wb-tag)::after {
        content:none!important;
        display:none!important;
      }
      #${POPUP_ID}.wb-arcade .wb-speech {
        background:#FFF7D8!important;
        border-color:transparent!important;
        font-family:'WanbanLetter','LXGW WenKai','霞鹜文楷','Klee One','Comic Sans MS','Microsoft YaHei',system-ui,sans-serif!important;
        letter-spacing:.2px!important;
      }
      #${POPUP_ID}.wb-arcade .wb-speech *,
      #${POPUP_ID}.wb-arcade #wb-speech {
        font-family:'WanbanLetter','LXGW WenKai','霞鹜文楷','Klee One','Comic Sans MS','Microsoft YaHei',system-ui,sans-serif!important;
      }
      #${POPUP_ID}.wb-arcade .wb-speech::after {
        content:none!important;
        display:none!important;
      }
      .wb-modal-mask.wb-arcade {
        align-items:center!important;
        overflow-y:auto!important;
        padding-top:calc(34px + env(safe-area-inset-top, 0px))!important;
        padding-bottom:34px!important;
      }
      .wb-modal-mask.wb-arcade .wb-modal {
        position:relative!important;
        max-height:none!important;
        padding-top:34px!important;
        overflow:visible!important;
      }
      .wb-modal-mask.wb-arcade .wb-modal::after {
        content:''!important;
        display:block!important;
        position:absolute!important;
        left:50%!important;
        top:-10px!important;
        width:86px!important;
        height:18px!important;
        transform:translateX(-50%) rotate(-1.2deg)!important;
        border:0!important;
        background:rgba(255,255,255,.66)!important;
        box-shadow:0 1px 5px rgba(87,112,130,.12)!important;
        pointer-events:none!important;
        z-index:20!important;
      }
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-body {
        padding-top:22px!important;
      }
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-settings-grid {
        overflow:visible!important;
        padding-top:10px!important;
      }
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-settings-grid > .wb-panel {
        position:relative!important;
        overflow:visible!important;
        padding-top:30px!important;
      }
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-settings-grid > .wb-panel::after {
        content:''!important;
        display:block!important;
        position:absolute!important;
        left:50%!important;
        top:-8px!important;
        width:76px!important;
        height:16px!important;
        transform:translateX(-50%) rotate(-1.5deg)!important;
        border:0!important;
        background:rgba(255,232,154,.56)!important;
        box-shadow:0 1px 4px rgba(87,112,130,.12)!important;
        pointer-events:none!important;
        z-index:30!important;
      }
      #${POPUP_ID}.wb-arcade .wb-game-card,
      #${POPUP_ID}.wb-arcade.wb-tab-settings .wb-settings-grid > .wb-panel {
        border-color:transparent!important;
        box-shadow:1px 2px 4px rgba(87,112,130,.08)!important;
      }
      #${POPUP_ID}.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag),
      .wb-modal-mask.wb-arcade :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-tag) {
        box-shadow:0 2px 5px rgba(87,112,130,.12)!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-modal {
        background:#FFF3BC!important;
        color:#244B66!important;
        box-shadow:0 1px 1px rgba(42,73,96,.08), 0 4px 10px rgba(87,112,130,.14)!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-modal .wb-modal-title {
        color:#244B66!important;
        border-bottom:1px solid rgba(43,91,126,.52)!important;
        padding-bottom:8px!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-table-wrap {
        background:#FFF3BC!important;
        border:1px solid rgba(43,91,126,.72)!important;
        box-shadow:0 1px 4px rgba(87,112,130,.10)!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-table {
        background:#FFF3BC!important;
        color:#244B66!important;
        border-collapse:collapse!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-table thead,
      .wb-modal-mask.wb-arcade .wb-record-table tbody,
      .wb-modal-mask.wb-arcade .wb-record-table tr,
      .wb-modal-mask.wb-arcade .wb-record-table th,
      .wb-modal-mask.wb-arcade .wb-record-table td {
        background:#FFF3BC!important;
        color:#244B66!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-table th,
      .wb-modal-mask.wb-arcade .wb-record-table td {
        border-bottom:1px solid rgba(43,91,126,.54)!important;
        border-right:1px solid rgba(43,91,126,.42)!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-table th:last-child,
      .wb-modal-mask.wb-arcade .wb-record-table td:last-child {
        border-right:0!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-table th {
        color:#1F587D!important;
        font-weight:900!important;
        box-shadow:0 1px 0 rgba(43,91,126,.38)!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-table tr:hover td {
        background:#FFEEA8!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-table .wb-muted,
      .wb-modal-mask.wb-arcade .wb-record-modal .wb-muted,
      .wb-modal-mask.wb-arcade .wb-record-modal .wb-pill {
        color:#416D88!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-modal :is(.wb-btn,.wb-pill) {
        background:#FFF3BC!important;
        color:#244B66!important;
        border:1px solid rgba(43,91,126,.62)!important;
        box-shadow:0 1px 3px rgba(43,91,126,.14)!important;
      }
      .wb-modal-mask.wb-arcade .wb-record-modal .wb-btn:hover,
      .wb-modal-mask.wb-arcade .wb-record-modal .wb-btn:focus-visible {
        background:#FFEEA8!important;
        color:#1F587D!important;
        border-color:rgba(43,91,126,.82)!important;
        box-shadow:0 2px 5px rgba(43,91,126,.18)!important;
      }
      .wb-modal-mask.wb-arcade.wb-batch-lines-mask .wb-batch-lines-modal {
        --wb-field-bg:#FFF8D2;
        --wb-field-text:#244B66;
        --wb-field-border:rgba(43,91,126,.62);
        background:#FFF3BC!important;
        background-image:none!important;
        color:#244B66!important;
        border:1px solid rgba(43,91,126,.42)!important;
        box-shadow:0 1px 1px rgba(42,73,96,.08), 0 4px 10px rgba(87,112,130,.14)!important;
        max-height:min(85vh, calc(100dvh - 68px))!important;
        overflow-y:auto!important;
      }
      .wb-modal-mask.wb-arcade.wb-batch-lines-mask .wb-batch-lines-modal .wb-modal-title {
        color:#244B66!important;
        border-bottom:1px solid rgba(43,91,126,.52)!important;
        padding-bottom:8px!important;
      }
      .wb-modal-mask.wb-arcade.wb-batch-lines-mask .wb-batch-lines-modal :is(.wb-worldbook-list,.wb-api-status,.wb-sticky-actions) {
        background:#FFF3BC!important;
        background-image:none!important;
        color:#244B66!important;
        border-color:rgba(43,91,126,.42)!important;
        box-shadow:0 1px 4px rgba(87,112,130,.10)!important;
      }
      .wb-modal-mask.wb-arcade.wb-batch-lines-mask .wb-batch-lines-modal :is(.wb-input,.wb-select,.wb-textarea) {
        background:#FFF8D2!important;
        border-color:rgba(43,91,126,.62)!important;
        color:#244B66!important;
        -webkit-text-fill-color:#244B66;
      }
      .wb-modal-mask.wb-arcade.wb-batch-lines-mask .wb-batch-lines-modal :is(.wb-btn,.wb-pill) {
        background:#FFF3BC!important;
        color:#244B66!important;
        border:1px solid rgba(43,91,126,.62)!important;
        box-shadow:0 1px 3px rgba(43,91,126,.14)!important;
      }
      .wb-modal-mask.wb-arcade.wb-batch-lines-mask .wb-batch-lines-modal :is(.wb-btn,.wb-pill):hover,
      .wb-modal-mask.wb-arcade.wb-batch-lines-mask .wb-batch-lines-modal :is(.wb-btn,.wb-pill):focus-visible {
        background:#FFEEA8!important;
        color:#1F587D!important;
        border-color:rgba(43,91,126,.82)!important;
        box-shadow:0 2px 5px rgba(43,91,126,.18)!important;
      }
      #${POPUP_ID}.wb-spring .wb-side-companion { background:linear-gradient(155deg, #D8EDB2, #BFDFA0 72%); border-color:rgba(111,168,90,.34); box-shadow:0 14px 30px rgba(76,59,42,.14), 0 1px 0 rgba(255,255,255,.42) inset; }
      #${POPUP_ID}.wb-spring .wb-companion.on { background:linear-gradient(135deg, rgba(255,248,220,.88), rgba(199,225,160,.78)); border-top-color:rgba(217,123,84,.58); box-shadow:0 10px 22px rgba(76,59,42,.12), 0 1px 0 rgba(255,255,255,.55) inset; }
      #${POPUP_ID}.wb-spring .wb-speech { background:rgba(255,248,220,.70); border:1px solid rgba(111,168,90,.24); color:#4C3B2A; }
      #${POPUP_ID}.wb-spring .wb-comp-name { color:#D97B54; }
      #${POPUP_ID}.wb-mono .wb-side-companion { background:#fff; border-color:#111; box-shadow:none; }
      #${POPUP_ID}.wb-mono .wb-companion.on { background:#fff; border-top-color:#111; box-shadow:none; }
      #${POPUP_ID}.wb-mono .wb-speech { background:#f6f6f6; border:1px solid #777; color:#151515; }
      #${POPUP_ID}.wb-mono .wb-comp-name { color:#111; }
      #${POPUP_ID}.wb-cyber .wb-side-companion { background:linear-gradient(155deg, #24152e, #171a32 72%); border-color:rgba(255,79,163,.34); box-shadow:0 14px 34px rgba(0,0,0,.36), 0 0 24px rgba(255,79,163,.10) inset; }
      #${POPUP_ID}.wb-cyber .wb-companion.on { background:linear-gradient(135deg, rgba(255,79,163,.18), rgba(139,107,255,.16)), #171a32; border-top-color:rgba(255,79,163,.68); box-shadow:0 0 22px rgba(255,79,163,.12), 0 1px 0 rgba(255,255,255,.08) inset; }
      #${POPUP_ID}.wb-cyber .wb-speech { background:rgba(255,79,163,.10); border:1px solid rgba(255,79,163,.24); color:#F6F5DE; }
      #${POPUP_ID}.wb-cyber .wb-comp-name { color:#FF8A3D; }
      #${POPUP_ID}.wb-mono .wb-btn,
      #${POPUP_ID}.wb-mono .wb-iconbtn,
      #${POPUP_ID}.wb-mono .wb-tab,
      #${POPUP_ID}.wb-mono .wb-input,
      #${POPUP_ID}.wb-mono .wb-select,
      #${POPUP_ID}.wb-mono .wb-textarea,
      #${POPUP_ID}.wb-mono .wb-pill,
      #${POPUP_ID}.wb-mono .wb-game-card,
      #${POPUP_ID}.wb-mono .wb-tag {
        border-radius:0;
        border-color:#111;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-btn.primary,
      #${POPUP_ID}.wb-mono .wb-tab.active,
      #${POPUP_ID}.wb-mono .wb-tag.active {
        background:#111;
        color:#fff;
        border-color:#111;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono :is(.wb-grid2048,.wb-gomoku,.wb-board3,.wb-territory-board) {
        background:#d8d8d8;
        filter:grayscale(1) contrast(1.08);
      }
      #${POPUP_ID}.wb-mono .wb-territory-dot { background:#111; border-color:#555; }
      #${POPUP_ID}.wb-mono .wb-territory-cell { background:#eeeeee; border-color:#aaa; color:#111; }
      #${POPUP_ID}.wb-mono .wb-territory-cell.user { background:#555; color:#fff; }
      #${POPUP_ID}.wb-mono .wb-territory-cell.ta { background:#999; color:#111; }
      .wb-avatar { border-radius:8px; border-color:color-mix(in srgb, var(--wb-accent2) 45%, var(--wb-border) 55%); box-shadow:0 6px 14px rgba(0,0,0,.16); }
      .wb-speech { border-radius:0; background:color-mix(in srgb, var(--wb-soft) 78%, var(--wb-panel) 22%); }
      .wb-input, .wb-textarea, .wb-select {
        border-radius:7px;
        background:linear-gradient(180deg, var(--wb-input), color-mix(in srgb, var(--wb-input) 78%, var(--wb-soft) 22%));
        box-shadow:0 1px 0 rgba(255,255,255,.35) inset;
      }
      .wb-worldbook-list, .wb-api-status { border-radius:8px; }
      .wb-summary-modal { width:min(620px, 100%); max-height:calc(100dvh - 48px); overflow-y:auto; }
      .wb-summary-list { display:grid; gap:8px; max-height:420px; overflow-y:auto; padding-right:2px; }
      .wb-record-table-wrap { max-height:min(620px, calc(100dvh - 170px)); overflow:auto; border:1px solid var(--wb-border); }
      .wb-record-table { width:100%; border-collapse:collapse; font-size:11px; table-layout:fixed; }
      .wb-record-table th, .wb-record-table td { border-bottom:1px solid var(--wb-border); padding:5px 6px; text-align:left; vertical-align:middle; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .wb-record-table th { position:sticky; top:0; background:var(--wb-soft); z-index:1; color:var(--wb-accent); }
      .wb-record-table.wb-no-score .wb-rec-score-col { display:none; }
      .wb-record-table .wb-actions { gap:4px; }
      .wb-summary-item { display:flex; align-items:center; gap:10px; padding:10px; border:1px solid var(--wb-border); border-radius:8px; background:var(--wb-panel); }
      .wb-tag { border-radius:999px; background:linear-gradient(180deg, var(--wb-panel), var(--wb-soft)); }
      .wb-tag.active { background:linear-gradient(135deg, var(--wb-accent), var(--wb-accent2)); box-shadow:0 8px 18px var(--wb-glow); }
      .wb-section-title {
        color:var(--wb-text);
        border-bottom:1px solid color-mix(in srgb, var(--wb-border) 60%, transparent 40%);
        text-shadow:0 0 18px var(--wb-glow);
      }
      .wb-section-title::before { content:'◇ '; color:var(--wb-accent); }
      .wb-section-title.no-mark::before { content:''; }
      .wb-modal {
        border-radius:8px;
        background:linear-gradient(180deg, var(--wb-panel), var(--wb-bg));
        box-shadow:0 24px 70px rgba(0,0,0,.42), 0 0 0 1px rgba(255,255,255,.16) inset;
      }
      .wb-modal-title { color:var(--wb-text); text-shadow:0 0 18px var(--wb-glow); }
      .wb-start-cover {
        border-radius:8px;
        background:linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.04));
      }
      @media (max-width: 768px) {
        #${SHELL_ID}.wb-shell-visible { display:block!important; position:fixed!important; top:0!important; left:0!important; right:0!important; bottom:0!important; width:100%!important; height:100vh; height:100dvh; overflow-y:auto; padding:env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px)!important; box-sizing:border-box; background:rgba(0,0,0,.45); backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px); -webkit-overflow-scrolling:touch; }
        #${POPUP_ID} { position:relative!important; top:auto!important; left:auto!important; right:auto!important; bottom:auto!important; transform:none!important; min-width:unset!important; max-width:100%!important; width:100%!important; min-height:calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); min-height:calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); height:auto!important; max-height:none!important; margin:0!important; display:flex!important; flex-direction:column!important; overflow:visible!important; border-radius:0!important; border-left:0!important; border-right:0!important; }
        .wb-head { flex-shrink:0; display:grid; grid-template-columns:1fr auto; align-items:center; padding:4px 7px; gap:4px; min-height:0; }
        #${POPUP_ID}.wb-tab-settings .wb-head { grid-template-columns:minmax(0,1fr) auto auto; }
        .wb-title { font-size:15px; grid-column:1; grid-row:1; letter-spacing:1px; }
        .wb-title::after { width:44px; margin-top:1px; }
        .wb-head-meta { grid-column:2; grid-row:1; justify-self:end; gap:4px; font-size:10px; max-width:156px; overflow:hidden; }
        .wb-head-meta span { padding:0; border:0; background:transparent; }
        .wb-head-meta i { display:none; }
        .wb-iconbtn { grid-column:2; grid-row:1; justify-self:end; width:24px; min-height:24px; height:24px; font-size:13px; padding:0; }
        #${POPUP_ID}.wb-tab-settings .wb-iconbtn { grid-column:3; }
        .wb-tabs { width:100%; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)) auto; grid-column:1 / 3; grid-row:2; }
        #${POPUP_ID}.wb-tab-settings .wb-tabs { grid-column:1 / 4; }
        .wb-tabs .wb-tab { min-width:0!important; min-height:26px; padding:3px 4px; font-size:clamp(10px, 2.8vw, 12px); }
        .wb-tabs .wb-tab[data-tab="settings"] { min-width:36px!important; padding-inline:5px; }
        .wb-tab-count { min-width:14px; height:14px; padding:0 3px; font-size:9px; }
        .wb-body { flex:1 1 0!important; min-height:0!important; padding:6px; gap:6px; overflow-y:auto!important; -webkit-overflow-scrolling:touch; }
        .wb-body.wb-settings-mode { max-height:none; padding-bottom:32px; }
        .wb-cardgrid { grid-template-columns:1fr; }
        #${POPUP_ID}.wb-playing { min-height:calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); min-height:calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)); height:calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))!important; height:calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))!important; overflow:hidden!important; }
        #${POPUP_ID}.wb-playing .wb-head { grid-template-columns:1fr auto; grid-template-rows:auto; padding:2px 6px; }
        #${POPUP_ID}.wb-playing .wb-title { font-size:13px; }
        #${POPUP_ID}.wb-playing .wb-title::after { display:none; }
        #${POPUP_ID}.wb-playing .wb-tabs { display:none; }
        .wb-body.wb-game-mode { flex:1 1 auto!important; min-height:0!important; display:flex; flex-direction:column; overflow:hidden!important; padding:3px 5px 5px; height:auto; }
        .wb-layout { flex:1 1 auto; width:100%; height:100%; min-height:0; grid-template-columns:minmax(0,1fr); grid-template-rows:minmax(0,1fr) auto; gap:4px; overflow:hidden; }
        .wb-layout.companion-pc-left,
        .wb-layout.companion-pc-right { grid-template-columns:minmax(0,1fr); }
        .wb-layout.no-companion { grid-template-rows:minmax(0,1fr); }
        .wb-layout.companion-mobile-top { grid-template-rows:auto auto minmax(0,1fr); }
        .wb-layout.companion-mobile-top .wb-game-main { display:contents; }
        .wb-layout.companion-mobile-top .wb-toolbar { grid-column:1; grid-row:1; min-width:0; margin-bottom:0; }
        .wb-layout.companion-mobile-top .wb-side-companion { grid-column:1; grid-row:2; }
        .wb-layout.companion-mobile-top .wb-board-wrap { grid-column:1; grid-row:3; width:100%; height:100%; min-height:0; overflow:hidden; }
        .wb-layout.companion-mobile-bottom .wb-game-main { grid-column:1; grid-row:1; }
        .wb-layout.companion-mobile-bottom .wb-side-companion { grid-column:1; grid-row:2; }
        .wb-body.wb-game-mode > .wb-layout > .wb-panel:first-child { min-height:0; height:auto; padding:4px; display:flex; flex-direction:column; overflow:hidden; }
        .wb-body.wb-game-mode > .wb-layout > .wb-panel:last-child { max-height:90px; min-height:0; padding:4px 6px; overflow:hidden; display:flex; align-items:center; justify-content:center; }
        #${POPUP_ID} .wb-body.wb-game-mode > .wb-layout > .wb-side-companion {
          height:88px;
          max-height:88px;
          padding:0!important;
          border:0!important;
          background:transparent!important;
          background-image:none!important;
          box-shadow:none!important;
        }
        .wb-body.wb-game-mode > .wb-layout.companion-mobile-top > .wb-game-main { display:contents!important; padding:0; }
        .wb-body.wb-game-mode > .wb-layout.companion-mobile-top > .wb-side-companion { width:100%; max-height:90px; }
        .wb-body.wb-game-mode > .wb-layout.no-companion > .wb-panel:first-child { max-height:none; padding:4px; }
        .wb-board-wrap { flex:1 1 0; height:auto; min-height:0; padding:4px; overflow:hidden; }
        .wb-toolbar { flex-shrink:0; display:grid; grid-template-columns:auto minmax(0,1fr); grid-template-rows:auto auto; gap:3px 5px; margin-bottom:3px; align-items:center; padding:3px; border:1px solid color-mix(in srgb, var(--wb-border) 70%, transparent 30%); border-radius:2px; background:color-mix(in srgb, var(--wb-soft) 72%, var(--wb-panel) 28%); }
        .wb-layout.no-companion .wb-toolbar { grid-template-columns:auto minmax(0,1fr) auto; grid-template-rows:auto; gap:4px; width:100%; box-sizing:border-box; }
        .wb-layout.no-companion .wb-stat { grid-column:2; grid-row:1; min-width:0; flex:1 1 auto; flex-wrap:nowrap; overflow:hidden; }
        .wb-layout.no-companion .wb-toolbar > .wb-actions { grid-column:3; grid-row:1; width:auto; min-width:0; flex:0 0 auto; display:flex; flex-wrap:nowrap; gap:4px; overflow:visible; padding-bottom:0; justify-content:flex-end; margin-left:auto; }
        .wb-layout.no-companion .wb-toolbar > .wb-actions .wb-line-tools,
        .wb-layout.no-companion .wb-toolbar > .wb-actions #wb-generate-lines { display:none; }
        .wb-layout.no-companion #wb-back { grid-column:1; grid-row:1; }
        .wb-stat { grid-column:2; grid-row:1; min-width:0; gap:6px; flex-wrap:nowrap; overflow:hidden; align-items:center; }
        .wb-stat .wb-pill { border:0; background:transparent; box-shadow:none; padding:0; font-size:12px; line-height:1.2; }
        .wb-stat .wb-pill:first-child { font-size:13px; font-weight:900; color:var(--wb-text); max-width:56%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding-left:3px; }
        .wb-stat .wb-title-row { min-width:0; }
        .wb-stat .wb-game-title-text { padding-left:1px; }
        .wb-stat #wb-high { display:none; }
        .wb-toolbar > .wb-actions { grid-column:1 / 3; grid-row:2; width:100%; min-width:0; display:flex; flex-wrap:nowrap; gap:4px; overflow-x:auto; padding-bottom:0; scrollbar-width:none; justify-content:flex-start; }
        .wb-toolbar > .wb-actions::-webkit-scrollbar { display:none; }
        .wb-line-tools { flex:1 1 auto; min-width:136px; display:flex; flex-wrap:nowrap; gap:4px; width:auto; }
        .wb-line-tools .wb-select { flex:1 1 auto; min-width:74px; max-width:140px; height:26px; font-size:11px; padding:2px 5px; }
        .wb-btn { min-height:25px; padding:3px 7px; font-size:11px; border-radius:3px; white-space:nowrap; background:linear-gradient(180deg, var(--wb-panel), color-mix(in srgb, var(--wb-soft) 70%, var(--wb-panel) 30%)); box-shadow:0 1px 0 rgba(255,255,255,.28) inset; }
        .wb-btn.primary { background:linear-gradient(135deg, var(--wb-accent), var(--wb-accent2)); box-shadow:0 6px 14px var(--wb-glow); }
        #wb-back { grid-column:1; grid-row:1; width:auto; min-width:40px; min-height:25px; padding:2px 7px; display:grid; place-items:center; font-size:12px; border-radius:2px; }
        #wb-generate-lines { min-width:44px; }
        .wb-pill { padding:3px 5px; font-size:10px; }
        .wb-record-table-wrap { width:100%; border:1px solid var(--wb-border); max-height:calc(100dvh - 104px); overflow-y:auto; overflow-x:hidden; }
        .wb-record-modal { width:100vw!important; max-width:100vw!important; height:calc(100dvh - 12px); max-height:calc(100dvh - 12px); padding:8px 4px; display:flex; flex-direction:column; box-sizing:border-box; }
        .wb-record-modal .wb-record-table-wrap { flex:1 1 auto; min-height:0; }
        .wb-record-table { display:table; width:100%; min-width:0; table-layout:fixed; font-size:9px; }
        .wb-record-table thead { display:table-header-group; }
        .wb-record-table tbody { display:table-row-group; }
        .wb-record-table tr { display:table-row; margin:0; padding:0; border:0; background:transparent; box-shadow:none; }
        .wb-record-table th, .wb-record-table td { display:table-cell; padding:3px 2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:none; line-height:1.25; }
        .wb-record-table th:nth-child(1), .wb-record-table td:nth-child(1) { width:20%; }
        .wb-record-table th:nth-child(2), .wb-record-table td:nth-child(2) { width:10%; }
        .wb-record-table th:nth-child(3), .wb-record-table td:nth-child(3) { width:11%; }
        .wb-record-table th:nth-child(4), .wb-record-table td:nth-child(4) { width:10%; }
        .wb-record-table th:nth-child(5), .wb-record-table td:nth-child(5) { width:13%; }
        .wb-record-table th:nth-child(6), .wb-record-table td:nth-child(6) { width:14%; }
        .wb-record-table th:nth-child(7), .wb-record-table td:nth-child(7) { width:10%; }
        .wb-record-table th:nth-child(8), .wb-record-table td:nth-child(8) { width:12%; }
        .wb-record-table td::before { content:none; }
        .wb-record-table .wb-actions { justify-content:flex-start; gap:2px; flex-wrap:nowrap; }
        .wb-record-table .wb-btn { min-height:22px; padding:2px 4px; border-radius:5px; font-size:9px; }
        .wb-record-modal > .wb-actions { margin-top:6px!important; gap:4px; }
        .wb-record-modal > .wb-actions .wb-btn { min-height:26px; padding:4px 7px; font-size:11px; }
        .wb-record-modal > .wb-actions .wb-pill { padding:4px 6px; font-size:11px; }
        .wb-grid2048, .wb-board3 { width:min(100%, 50dvh, 340px); }
        .wb-memory { width:min(100%, 48dvh, 320px); height:min(100%, 48dvh, 320px); gap:6px; padding:4px; }
        .wb-uyangle-panel { grid-template-rows:auto auto minmax(0,1fr) auto auto auto; gap:4px; }
        .wb-uyangle-progress { height:14px; width:min(320px, 100%); }
        .wb-uyangle-board { width:min(100%, 100cqh, 64dvh, 440px); aspect-ratio:1 / 1; }
        .wb-uyangle-tile { width:8.6%; }
        .wb-uyangle-hold, .wb-uyangle-tray { min-height:clamp(36px, 10.4vw, 40px); gap:3px; }
        .wb-uyangle-hold { grid-template-columns:repeat(3, minmax(0, clamp(36px, 10.4vw, 40px))); }
        .wb-uyangle-tray { grid-template-columns:repeat(7, minmax(0, clamp(36px, 10.4vw, 40px))); }
        .wb-uyangle-tray-wrap { padding:4px; }
        .wb-uyangle-slot { width:clamp(36px, 10.4vw, 40px); height:clamp(36px, 10.4vw, 40px); }
        .wb-uyangle-actions { margin-top:5px; }
        .wb-uyangle-actions .wb-btn { min-height:25px; padding:3px 6px; }
        .wb-mines-panel { gap:5px; }
        .wb-mines-top { gap:4px; flex-wrap:nowrap; overflow:hidden; }
        .wb-mines-board { width:min(100%, 100cqh, 72dvh, 430px); padding:3px; gap:1px; }
        .wb-mines-cell { font-size:clamp(9px, 2.8cqh, 16px); }
        .wb-mines-actions { gap:6px; }
        .wb-mines-actions .wb-btn { flex:1 1 0; min-width:0; min-height:30px; }
        .wb-shuerte-panel { gap:5px; }
        .wb-shuerte-top { gap:4px; flex-wrap:nowrap; overflow:hidden; }
        .wb-shuerte-board { width:min(100%, 100cqh, 66dvh, 390px); padding:6px; gap:5px; border-radius:18px; }
        .wb-shuerte-cell { border-radius:12px; font-size:clamp(16px, 7cqh, 34px); }
        .wb-shuerte-tools { gap:6px; width:100%; }
        .wb-shuerte-tools .wb-btn { flex:1 1 0; min-width:0; min-height:30px; padding-inline:8px; }
        .wb-shuerte-note { font-size:11px; }
        .wb-gomoku, .wb-territory-board { width:min(100%, 52dvh, 360px); }
        .wb-ludo { --wb-ludo-pad:5px; width:min(calc(100% - 12px), 46dvh, 310px); height:min(calc(100% - 12px), 46dvh, 310px); padding:5px; gap:1px; justify-self:center; align-self:center; }
        .wb-ludo-piece { min-width:12px; max-width:19px; font-size:10px; }
        .wb-ludo-piece:only-child { max-width:21px; }
        .wb-canvas { max-height:100%; max-width:100%; }
	        .wb-snake-shell .wb-canvas { max-height:calc(100% - 78px); }
	        .wb-snake-shell.controls-hidden .wb-canvas,
	        .wb-snake-shell.control-mode-swipe .wb-canvas,
	        .wb-snake-shell.control-mode-tap .wb-canvas { max-height:100%; }
	        .wb-snake-controls { display:grid; }
	        .wb-canvas.wb-tetris-canvas { height:auto; width:auto; max-height:100%; max-width:100%; }
	        .wb-tetris-controls { display:grid; grid-template-columns:repeat(3,36px); grid-template-rows:repeat(3,36px); }
	        .wb-tetris-controls .wb-btn { min-width:36px; min-height:36px; }
	        .wb-tetris-shell.controls-hidden .wb-tetris-controls { grid-template-columns:36px; grid-template-rows:repeat(2,36px); width:36px; }
        .wb-watermelon-canvas { max-height:100%; }
        .wb-gomoku { gap:1px; padding:4px; }
        .wb-guess-panel { max-height:100%; overflow:hidden; gap:6px; }
        .wb-guess-history { max-height:86px; padding:5px; }
        .wb-clue-box { min-height:44px; max-height:none; overflow:visible; }
        .wb-side-companion { align-self:stretch; box-sizing:border-box; display:flex; align-items:center; justify-content:center; }
        .wb-side-companion .wb-companion { margin:0; width:100%; height:88px; }
        .wb-companion { max-height:88px; min-height:0; height:88px; margin-top:0; margin-bottom:0; padding:5px 7px; box-sizing:border-box; overflow:hidden; }
        .wb-avatar { width:40px; height:40px; }
        .wb-comp-main { gap:2px; }
        .wb-comp-name { font-size:11px; }
        .wb-speech { min-height:52px; max-height:60px; font-size:12px; padding:5px 8px; line-height:1.35; overflow:hidden; box-sizing:border-box; }
        .wb-body.wb-game-mode .wb-muted { display:none; }
        .wb-body.wb-game-mode .wb-word-meta { display:block!important; }
        .wb-body.wb-game-mode .wb-field { display:none; }
        .wb-body.wb-game-mode .wb-form { grid-template-columns:1fr 1fr; gap:5px; align-content:center; }
        .wb-settings-grid { grid-template-columns:1fr; }
        .wb-modal-mask { padding:20px; }
        .wb-modal { max-height:85vh; }
      }

      #${POPUP_ID}.wb-mono,
      #${POPUP_ID}.wb-mono .wb-body,
      #${POPUP_ID}.wb-mono .wb-head,
      #${POPUP_ID}.wb-mono .wb-panel,
      #${POPUP_ID}.wb-mono .wb-board-wrap,
      #${POPUP_ID}.wb-mono .wb-game-card,
      #${POPUP_ID}.wb-mono .wb-toolbar,
      #${POPUP_ID}.wb-mono .wb-side-companion,
      #${POPUP_ID}.wb-mono .wb-companion.on,
      #${POPUP_ID}.wb-mono .wb-speech,
      #${POPUP_ID}.wb-mono .wb-worldbook-list,
      #${POPUP_ID}.wb-mono .wb-api-status,
      #${POPUP_ID}.wb-mono .wb-sticky-actions {
        background:#fff;
        background-image:none;
        color:#111;
        box-shadow:none;
        text-shadow:none;
      }
      #${POPUP_ID}.wb-mono {
        border:4px solid #111;
        border-top:4px solid #111;
        font-family:'WanbanCyberPixel','Microsoft YaHei',system-ui,sans-serif;
        image-rendering:pixelated;
      }
      #${POPUP_ID}.wb-mono::before { background:rgba(0,0,0,.35); backdrop-filter:none; -webkit-backdrop-filter:none; }
      #${POPUP_ID}.wb-mono .wb-head { border-bottom:4px solid #111; }
      #${POPUP_ID}.wb-mono .wb-title { color:#111; letter-spacing:0; }
      #${POPUP_ID}.wb-mono .wb-title::before {
        border-radius:0;
        border:3px solid #111;
        background:url('${APP_ICON_URL}') center / cover no-repeat, #fff;
        filter:grayscale(1) contrast(1.25);
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-title::after { display:block; background:#111; opacity:1; }
      #${POPUP_ID}.wb-mono :is(.wb-panel,.wb-board-wrap,.wb-game-card,.wb-side-companion,.wb-companion.on,.wb-speech,.wb-toolbar,.wb-worldbook-list,.wb-api-status,.wb-record-table-wrap,.wb-guess-history,.wb-clue-box,.wb-oldmaid-hand,.wb-oldmaid-log) {
        border:3px solid #111;
        border-radius:0;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-tabs {
        background:#fff;
        border:3px solid #111;
        border-radius:0;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-tabs .wb-tab { border-right:3px solid #111; }
      #${POPUP_ID}.wb-mono .wb-tabs .wb-tab:last-child { border-right:0; }
      #${POPUP_ID}.wb-mono :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag,.wb-memory-face,.wb-oldmaid-card,.wb-bomb-cell,.wb-sudoku-cell) {
        background:#fff;
        background-image:none;
        color:#111;
        border:3px solid #111;
        border-radius:0;
        box-shadow:none;
        text-shadow:none;
      }
      #${POPUP_ID}.wb-mono :is(.wb-btn.primary,.wb-tab.active,.wb-tag.active,.wb-bomb-cell.boom,.wb-bomb-cell.chosen) {
        background:#111;
        background-image:none;
        color:#fff;
        border-color:#111;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono :is(.wb-btn:hover,.wb-iconbtn:hover,.wb-tab:hover,.wb-game-card:hover,.wb-cell:hover,.wb-gcell:hover,.wb-ludo-piece:hover) {
        transform:none;
        filter:none;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-game-card::before { display:none; }
      #${POPUP_ID}.wb-mono .wb-game-icon {
        background:#fff;
        background-image:none;
        color:#111;
        border:3px solid #111;
        border-radius:0;
        box-shadow:none;
        filter:grayscale(1) contrast(1.15);
      }
      #${POPUP_ID}.wb-mono .wb-game-icon.has-image { background:#fff; }
      #${POPUP_ID}.wb-mono .wb-game-card img,
      #${POPUP_ID}.wb-mono .wb-game-icon.has-image img,
      #${POPUP_ID}.wb-mono .wb-intimacy-image {
        border-radius:0;
        filter:grayscale(1) contrast(1.15)!important;
      }
      #${POPUP_ID}.wb-mono .wb-avatar {
        border:3px solid #111;
        border-radius:0;
        box-shadow:none;
        filter:grayscale(1) contrast(1.15);
      }
      #${POPUP_ID}.wb-mono :is(.wb-canvas,.wb-watermelon-canvas,.wb-jump-canvas,.wb-plank-canvas,.wb-tetris-canvas,.wb-ludo,.wb-territory-board,.wb-grid2048,.wb-gomoku,.wb-board3,.wb-reversi,.wb-c4d,.wb-c4d-mask) {
        background:#d9d9d9;
        background-image:none;
        border:4px solid #111;
        border-radius:0;
        box-shadow:none;
        filter:grayscale(1) contrast(1.12);
        image-rendering:pixelated;
      }
      #${POPUP_ID}.wb-mono .wb-screw-top {
        background:linear-gradient(180deg, #e8f6ff, #fff2f8);
        border-color:#7DB9D8;
        box-shadow:inset 0 1px 0 rgba(255,255,255,.72), 0 2px 8px rgba(79,141,247,.14);
      }
      #${POPUP_ID}.wb-mono .wb-screw-canvas {
        background:linear-gradient(180deg, #c9ebff 0%, #a9d7f5 55%, #bfe4ff 100%);
        border:4px solid #5FA8D7;
        box-shadow:inset 0 0 0 1px rgba(255,255,255,.42), 0 6px 16px rgba(79,141,247,.18);
        filter:none;
        image-rendering:auto;
      }
      #${POPUP_ID}.wb-mono .wb-screw-box {
        border-color:color-mix(in srgb, var(--c) 76%, #24536f 24%);
        background:linear-gradient(180deg, color-mix(in srgb, var(--c) 22%, #fff 78%), color-mix(in srgb, var(--c) 58%, #f5fbff 42%));
        box-shadow:inset 0 1px 0 rgba(255,255,255,.58), 0 4px 10px rgba(79,141,247,.14);
        filter:none;
      }
      #${POPUP_ID}.wb-mono .wb-screw-box::before {
        background:linear-gradient(90deg, color-mix(in srgb, var(--c) 42%, #24536f 58%) 0 24%, color-mix(in srgb, var(--c) 74%, #fff 26%) 25% 75%, color-mix(in srgb, var(--c) 42%, #24536f 58%) 76%);
      }
      #${POPUP_ID}.wb-mono .wb-screw-box-hole {
        background:#eef5f8;
        border:1px solid rgba(36,83,111,.32);
      }
      #${POPUP_ID}.wb-mono .wb-screw-box-hole i,
      #${POPUP_ID}.wb-mono .wb-screw-slot span {
        filter:none;
      }
      #${POPUP_ID}.wb-mono :is(.wb-cell,.wb-gcell,.wb-ludo-cell,.wb-reversi-cell,.wb-c4d-cell,.wb-memory-front,.wb-memory-back,.wb-tile) {
        background:#fff;
        background-image:none;
        border:2px solid #111;
        border-radius:0;
        box-shadow:none;
        color:#111;
      }
      #${POPUP_ID}.wb-mono .wb-gcell.black,
      #${POPUP_ID}.wb-mono .wb-reversi-cell.ta span,
      #${POPUP_ID}.wb-mono .wb-c4d-disc.ta,
      #${POPUP_ID}.wb-mono .wb-c4d-falling.ta { background:#111; border-color:#111; box-shadow:none; }
      #${POPUP_ID}.wb-mono .wb-gcell.white,
      #${POPUP_ID}.wb-mono .wb-reversi-cell.user span,
      #${POPUP_ID}.wb-mono .wb-c4d-disc.user,
      #${POPUP_ID}.wb-mono .wb-c4d-falling.user { background:#fff; border:2px solid #111; box-shadow:none; }
      #${POPUP_ID}.wb-mono .wb-ludo-cell.path,
      #${POPUP_ID}.wb-mono .wb-cell.fixed,
      #${POPUP_ID}.wb-mono .wb-territory-cell { background:#d9d9d9; color:#111; }
      #${POPUP_ID}.wb-mono .wb-ludo-cell.home-red,
      #${POPUP_ID}.wb-mono .wb-ludo-cell.home-blue,
      #${POPUP_ID}.wb-mono .wb-territory-cell.ta { background:#999; color:#111; }
      #${POPUP_ID}.wb-mono .wb-territory-cell.user,
      #${POPUP_ID}.wb-mono .wb-territory-edge.user,
      #${POPUP_ID}.wb-mono .wb-territory-edge.ta,
      #${POPUP_ID}.wb-mono .wb-ludo-piece.red,
      #${POPUP_ID}.wb-mono .wb-ludo-piece.blue { background:#111; color:#fff; border-color:#111; box-shadow:none; }
      #${POPUP_ID}.wb-mono .wb-territory-edge.legal,
      #${POPUP_ID}.wb-mono .wb-territory-edge:hover:not(:disabled) { background:#d9d9d9; box-shadow:none; }
      #${POPUP_ID}.wb-mono .wb-territory-dot { background:#111; border-color:#111; }
      #${POPUP_ID}.wb-mono .wb-pause-overlay { background:rgba(0,0,0,.75); color:#fff; text-shadow:none; }
      .wb-modal-mask.wb-mono .wb-modal,
      .wb-modal-mask.wb-mono .wb-sticky-actions {
        background:#fff;
        background-image:none;
        color:#111;
        border:4px solid #111;
        border-radius:0;
        box-shadow:none;
      }
      .wb-modal-mask.wb-mono :is(.wb-btn,.wb-iconbtn,.wb-tab,.wb-input,.wb-select,.wb-textarea,.wb-pill,.wb-tag,.wb-api-status,.wb-worldbook-list) {
        background:#fff;
        background-image:none;
        color:#111;
        border:3px solid #111;
        border-radius:0;
        box-shadow:none;
        text-shadow:none;
      }
      .wb-modal-mask.wb-mono :is(.wb-btn.primary,.wb-tab.active,.wb-tag.active) {
        background:#111;
        background-image:none;
        color:#fff;
        border-color:#111;
        box-shadow:none;
      }
      .wb-modal-mask.wb-mono .wb-countdown-num {
        background:#111;
        background-image:none;
        color:#fff;
        border:3px solid #111;
        border-radius:0;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-gomoku {
        background:linear-gradient(135deg, #d7b06e, #b98b5e);
        border:2px solid #5f3d20;
        box-shadow:none;
        filter:none;
      }
      #${POPUP_ID}.wb-mono .wb-gcell {
        background:#d7b37c;
        border:0;
        border-radius:50%;
        box-shadow:0 1px 1px rgba(255,255,255,.28) inset;
        filter:none;
      }
      #${POPUP_ID}.wb-mono .wb-gcell.black { background:#222; box-shadow:inset 0 0 0 2px #000; }
      #${POPUP_ID}.wb-mono .wb-gcell.white { background:#f7f2e9; box-shadow:inset 0 0 0 2px #ddd; }
      #${POPUP_ID}.wb-mono .wb-reversi {
        background:#276749;
        border:2px solid #174b35;
        box-shadow:none;
        filter:none;
      }
      #${POPUP_ID}.wb-mono .wb-reversi-cell {
        background:#348a61;
        border:1px solid rgba(0,0,0,.18);
        border-radius:0;
        box-shadow:none;
        filter:none;
      }
      #${POPUP_ID}.wb-mono .wb-reversi-cell.user span { background:#f8fafc; border:0; box-shadow:0 2px 6px rgba(0,0,0,.28); }
      #${POPUP_ID}.wb-mono .wb-reversi-cell.ta span { background:#111827; border:0; box-shadow:0 2px 6px rgba(0,0,0,.28); }
      #${POPUP_ID}.wb-mono .wb-reversi-cell.legal::after { background:rgba(255,255,255,.45); }
      #${POPUP_ID}.wb-mono .wb-oldmaid-hand {
        background:var(--wb-soft);
        border:1px solid var(--wb-border);
      }
      #${POPUP_ID}.wb-mono .wb-oldmaid-card {
        background:#fff;
        color:#111827;
        border:1px solid var(--wb-border);
        border-radius:0;
        box-shadow:0 2px 8px rgba(15,23,42,.12);
      }
      #${POPUP_ID}.wb-mono .wb-oldmaid-card.big { box-shadow:0 8px 20px rgba(15,23,42,.22); }
      #${POPUP_ID}.wb-mono .wb-oldmaid-card.back {
        color:transparent;
        background:url('${OLDMAID_BACK_URL}') center / 100% 100% no-repeat, #1f2937;
      }
      #${POPUP_ID}.wb-mono .wb-oldmaid-card.joker {
        padding:0;
        color:transparent;
        font-size:0;
        background:#fff;
        border-color:var(--wb-border);
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-oldmaid-card.joker.big { box-shadow:none; }
      #${POPUP_ID}.wb-mono .wb-oldmaid-card.joker img { width:100%; height:100%; display:block; object-fit:fill; object-position:center; pointer-events:none; filter:none; }
      #${POPUP_ID}.wb-mono .wb-oldmaid-log {
        background:var(--wb-panel);
        border:1px solid var(--wb-border);
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-progress,
      #${POPUP_ID}.wb-mono .wb-uyangle-board,
      #${POPUP_ID}.wb-mono .wb-uyangle-tile,
      #${POPUP_ID}.wb-mono .wb-uyangle-hold,
      #${POPUP_ID}.wb-mono .wb-uyangle-tray-wrap,
      #${POPUP_ID}.wb-mono .wb-uyangle-slot,
      #${POPUP_ID}.wb-mono .wb-uyangle-mini {
        border-radius:0;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-progress {
        background:#fff;
        border:2px solid #111;
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-progress-fill {
        background:#111;
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-progress span {
        color:#111;
        text-shadow:none;
        mix-blend-mode:difference;
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-board {
        background:#e6e6e6;
        border:2px solid #111;
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-tile,
      #${POPUP_ID}.wb-mono .wb-uyangle-mini {
        background:#fff;
        border:2px solid #111;
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-tile:disabled {
        filter:grayscale(1) brightness(.72);
        opacity:.82;
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-tile.blocked::after {
        background:repeating-linear-gradient(45deg, rgba(0,0,0,.2) 0 2px, transparent 2px 5px);
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-hold,
      #${POPUP_ID}.wb-mono .wb-uyangle-tray-wrap {
        background:#fff;
        border:2px solid #111;
      }
      #${POPUP_ID}.wb-mono .wb-uyangle-slot {
        background:#f2f2f2;
        border:2px dashed #111;
      }
      #${POPUP_ID}.wb-mono .wb-territory-board {
        background:#e6e6e6;
        border:4px solid #111;
      }
      #${POPUP_ID}.wb-mono .wb-territory-edge.legal {
        background:#c4c4c4;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-territory-edge.legal:hover {
        background:#9e9e9e;
        box-shadow:none;
      }
      #${POPUP_ID}.wb-mono .wb-territory-edge.claimed { background:#777; }
      #${POPUP_ID}.wb-mono .wb-territory-edge.user { background:#111; }
      #${POPUP_ID}.wb-mono .wb-territory-edge.ta { background:#bdbdbd; box-shadow:0 0 0 1px #111 inset; }
      #${POPUP_ID}.wb-mono .wb-territory-cell.user { background:#111; color:#fff; }
      #${POPUP_ID}.wb-mono .wb-territory-cell.ta { background:#777; color:#fff; }
      #${POPUP_ID}.wb-mono .wb-watermelon-canvas {
        filter:none;
        background:#f7efe3;
      }
      #${POPUP_ID}.wb-day,
      .wb-modal-mask {
        --wb-field-bg:#fff9fb;
        --wb-field-text:#2f2430;
        --wb-field-border:#e8b9c5;
      }
      #${POPUP_ID}.wb-arcade,
      .wb-modal-mask.wb-arcade {
        --wb-field-bg:#FFFDF8;
        --wb-field-text:#28435A;
        --wb-field-border:#8DC9E8;
      }
      #${POPUP_ID}.wb-spring,
      .wb-modal-mask.wb-spring {
        --wb-field-bg:#F8EED6;
        --wb-field-text:#4C3B2A;
        --wb-field-border:#A98858;
      }
      #${POPUP_ID}.wb-mono,
      .wb-modal-mask.wb-mono {
        --wb-field-bg:#fff;
        --wb-field-text:#111;
        --wb-field-border:#111;
      }
      #${POPUP_ID}.wb-night,
      .wb-modal-mask.wb-night {
        --wb-field-bg:#151620;
        --wb-field-text:#f5eafa;
        --wb-field-border:#6b5578;
      }
      #${POPUP_ID}.wb-cyber,
      .wb-modal-mask.wb-cyber {
        --wb-field-bg:#101A1D;
        --wb-field-text:#F6F5DE;
        --wb-field-border:#19D3C5;
      }
      #${POPUP_ID}.wb-tavern,
      .wb-modal-mask.wb-tavern {
        --wb-field-bg:color-mix(in srgb, var(--wb-bg) 72%, #fff 28%);
        --wb-field-text:var(--wb-text);
        --wb-field-border:var(--wb-accent);
      }
      #${POPUP_ID} :is(.wb-select,.wb-input,.wb-textarea),
      .wb-modal-mask :is(.wb-select,.wb-input,.wb-textarea) {
        color:var(--wb-field-text)!important;
        background:linear-gradient(180deg, var(--wb-field-bg), color-mix(in srgb, var(--wb-field-bg) 86%, var(--wb-panel) 14%))!important;
        border-color:var(--wb-field-border)!important;
        -webkit-text-fill-color:var(--wb-field-text);
        color-scheme:light;
      }
      #${POPUP_ID} .wb-select option,
      .wb-modal-mask .wb-select option {
        color:var(--wb-field-text)!important;
        background:var(--wb-field-bg)!important;
      }
      #${POPUP_ID}.wb-night :is(.wb-select,.wb-input,.wb-textarea),
      #${POPUP_ID}.wb-cyber :is(.wb-select,.wb-input,.wb-textarea),
      .wb-modal-mask.wb-night :is(.wb-select,.wb-input,.wb-textarea),
      .wb-modal-mask.wb-cyber :is(.wb-select,.wb-input,.wb-textarea) {
        color-scheme:dark;
      }
      #${POPUP_ID} :is(.wb-input,.wb-textarea)::placeholder,
      .wb-modal-mask :is(.wb-input,.wb-textarea)::placeholder {
        color:color-mix(in srgb, var(--wb-field-text) 54%, transparent 46%);
        -webkit-text-fill-color:color-mix(in srgb, var(--wb-field-text) 54%, transparent 46%);
      }
      #${POPUP_ID}.wb-cyber .wb-speech,
      #${POPUP_ID}.wb-cyber #wb-speech {
        color:#F6F5DE!important;
        background:rgba(13,21,18,.92)!important;
        border:1px solid rgba(241,232,91,.38)!important;
        text-shadow:0 0 8px rgba(241,232,91,.22);
      }
      #${POPUP_ID}.wb-cyber .wb-speech * {
        color:#F6F5DE!important;
        -webkit-text-fill-color:#F6F5DE;
      }
      #${POPUP_ID} .wb-speech,
      #${POPUP_ID}.wb-night .wb-speech,
      #${POPUP_ID}.wb-arcade .wb-speech,
      #${POPUP_ID}.wb-spring .wb-speech,
      #${POPUP_ID}.wb-mono .wb-speech,
      #${POPUP_ID}.wb-cyber .wb-speech,
      #${POPUP_ID} #wb-speech {
        position:relative!important;
        overflow:hidden!important;
        min-height:62px!important;
        max-height:72px!important;
        border-radius:0!important;
        border:1px solid var(--wb-border)!important;
        box-sizing:border-box!important;
      }
      #${POPUP_ID} .wb-speech::before,
      #${POPUP_ID} .wb-speech::after,
      #${POPUP_ID}.wb-night .wb-speech::before,
      #${POPUP_ID}.wb-night .wb-speech::after,
      #${POPUP_ID}.wb-arcade .wb-speech::before,
      #${POPUP_ID}.wb-arcade .wb-speech::after,
      #${POPUP_ID}.wb-spring .wb-speech::before,
      #${POPUP_ID}.wb-spring .wb-speech::after,
      #${POPUP_ID}.wb-mono .wb-speech::before,
      #${POPUP_ID}.wb-mono .wb-speech::after,
      #${POPUP_ID}.wb-cyber .wb-speech::before,
      #${POPUP_ID}.wb-cyber .wb-speech::after {
        content:none!important;
        display:none!important;
      }
      #${POPUP_ID} .wb-speech .wb-text-seg {
        margin:0!important;
      }
    `;

    getHostDocument().head.appendChild(css);
  }

  function syncMobileShellViewport() {
    const doc = getHostDocument();
    const shell = qs('#' + SHELL_ID, doc);
    if (!shell) return;
    const win = getHostWindow();
	    const vp = win.visualViewport || (typeof visualViewport !== 'undefined' ? visualViewport : null);
	    const nav = win.navigator || navigator;
	    const touchViewport = (win.innerWidth || 800) <= 1024 || /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent || '') || (nav.maxTouchPoints || 0) > 1;
	    if (!touchViewport) {
	      shell.style.top = '';
	      shell.style.height = '';
	      shell.style.setProperty('--wb-vvh', '100vh');
	      return;
	    }
	    const h = Math.max(320, Math.floor(vp && vp.height ? vp.height : (win.innerHeight || doc.documentElement.clientHeight || 700)));
	    shell.style.top = (vp && vp.offsetTop ? Math.max(0, Math.floor(vp.offsetTop)) : 0) + 'px';
	    shell.style.height = h + 'px';
	    shell.style.setProperty('--wb-vvh', h + 'px');
	  }
  let petTestInfoCache = null;
  let petTestInfoLoading = null;
  let petFullActiveCaretakerId = '';
  let petRuntimeMode = '';
  const PET_STAGE_CAP = { egg:100, juvenile:100, adult:100, spirit:50, ordinary:50 };
  const PET_MAIN_TRIGGERS = [
    { id:'M01', stage:'any', at:0 },
    { id:'M02', stage:'egg', custom:s => (s.eggInteractions || 0) >= 2 },
    { id:'M03', stage:'egg', at:50 },
    { id:'M04', stage:'egg', at:80 },
    { id:'M05', stage:'egg', at:100 },
    { id:'M06', stage:'juvenile', at:10 },
    { id:'M07', stage:'juvenile', at:50 },
    { id:'M08', stage:'juvenile', at:100 },
    { id:'M09', stage:'adult', at:50 },
    { id:'M10', stage:'adult', at:80 },
    { id:'M11', stage:'adult', at:100 },
    { id:'M12', stage:'spirit', at:5, route:'spirit' },
    { id:'M13', stage:'ordinary', at:5, route:'ordinary' },
    { id:'M14', stage:'chosen', at:25 },
    { id:'M15', stage:'chosen', at:50, final:true }
  ];
  function cleanPetInfoText(text) {
    return String(text || '').replace(/\r\n/g, '\n').split('\n')
      .filter(line => !/^\s*```/.test(line) && !/^\s*<\/?p(?:e|s)t_info>\s*$/.test(line))
      .join('\n');
  }
  function parsePetInfoValue(line) {
    const m = String(line || '').match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    return m ? { key:m[1], value:m[2].trim() } : null;
  }
  function stripPetQuote(value) {
    return String(value || '').trim().replace(/^-\s*/, '').replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
  function parsePetStoryLines(raw) {
    return String(raw || '').split('\n').map(line => {
      const m = line.trim().match(/^\[([^\]]+)\]\s*(.*)$/);
      return m ? { speaker:m[1], text:m[2] } : { speaker:'旁白', text:line.trim() };
    }).filter(x => x.text);
  }
  function parsePetFields(lines) {
    const out = {};
    for (let i = 0; i < lines.length; i++) {
      const parsed = parsePetInfoValue(lines[i]);
      if (!parsed) continue;
      if (parsed.key === 'story' && /^\|-/.test(parsed.value)) {
        const story = [];
        i++;
        while (i < lines.length) {
          const next = parsePetInfoValue(lines[i]);
          if (next && next.key !== 'story' && !/^\s+\[/.test(lines[i])) { i--; break; }
          story.push(String(lines[i] || '').replace(/^\s{2,4}/, ''));
          i++;
        }
        out.story = story.join('\n').trim();
      } else if (parsed.key !== 'variants' && parsed.key !== 'trigger') {
        out[parsed.key] = parsed.value;
      }
    }
    return out;
  }
  function parsePetTrigger(lines) {
    const trigger = {};
    let inside = false;
    lines.forEach(line => {
      const parsed = parsePetInfoValue(line);
      if (!parsed) return;
      if (parsed.key === 'trigger') { inside = true; return; }
      if (inside && ['title','opening_cause','story'].includes(parsed.key)) { inside = false; return; }
      if (!inside) return;
      let value = parsed.value;
      if (value === 'null') value = null;
      else if (/^\d+(\.\d+)?$/.test(value)) value = Number(value);
      trigger[parsed.key] = value;
    });
    return trigger;
  }
  function normalizePetStory(item, petName) {
    if (!item) return null;
    return Object.assign({}, item, {
      title: item.title || item.id || '剧情',
      summary: item.summary || item.opening_cause || '',
      story: item.story || '',
      lines: parsePetStoryLines(item.story || ''),
      petName: petName || '宠物'
    });
  }
  function defaultPetFullData() { return { activeCaretakerId:'', caretakers:[] }; }
  function petFullData() {
    const data = Object.assign(defaultPetFullData(), safeObject(loadJSON(STORAGE_PET_FULL, {})));
    data.caretakers = Array.isArray(data.caretakers) ? data.caretakers : [];
    data.caretakers.forEach(c => { c.pets = Array.isArray(c.pets) ? c.pets : []; });
    return data;
  }
  function savePetFullData(data) { saveJSON(STORAGE_PET_FULL, Object.assign(defaultPetFullData(), data || {})); }
  function petFullActiveCaretaker(data) {
    if (petRuntimeMode === 'test') return null;
    const all = data || petFullData();
    const id = petFullActiveCaretakerId || all.activeCaretakerId;
    return (all.caretakers || []).find(c => c.id === id) || (all.caretakers || []).find(c => (c.pets || []).length) || (all.caretakers || [])[0] || null;
  }
  function petFullActivePet(data, caretaker) {
    if (petRuntimeMode === 'test') return null;
    const c = caretaker || petFullActiveCaretaker(data);
    if (!c) return null;
    return (c.pets || []).find(p => p.id === c.activePetId) || (c.pets || [])[0] || null;
  }
  function petFullIsActive() { return !!petFullActivePet(); }
  function withPetFullActive(caretakerId) {
    petRuntimeMode = 'full';
    petFullActiveCaretakerId = caretakerId || '';
    const data = petFullData();
    data.activeCaretakerId = petFullActiveCaretakerId;
    savePetFullData(data);
    petTestInfoCache = null;
    petTestInfoLoading = null;
  }
  function savePetFullActivePetState(state) {
    const data = petFullData();
    const c = petFullActiveCaretaker(data);
    if (!c) return false;
    const pet = petFullActivePet(data, c);
    if (!pet) return false;
    pet.state = Object.assign(defaultPetTestState(), state || {});
    if (pet.state.ended) pet.endedAt = pet.endedAt || Date.now();
    c.activePetId = pet.id;
    data.activeCaretakerId = c.id;
    savePetFullData(data);
    return true;
  }
  function petFullCaretakerById(id) { return (petFullData().caretakers || []).find(c => c.id === id) || null; }
  function petFullPetCompleted(pet) {
    const st = safeObject(pet && pet.state || {});
    return !!(pet && (pet.endedAt || st.ended));
  }
  function petFullCompletedCount(caretaker) {
    return ((caretaker && caretaker.pets) || []).filter(petFullPetCompleted).length;
  }
  function petFullAdoptionCycle(caretaker) { return Math.max(1, petFullCompletedCount(caretaker) + 1); }
  function petFullAllLogsText(caretaker) {
    const lines = [];
    ((caretaker && caretaker.pets) || []).filter(petFullPetCompleted).forEach((pet, idx) => {
      const state = safeObject(pet.state || {});
      const info = petFullParsedInfo(pet);
      const card = info && info.pet_card ? info.pet_card : {};
      const cardLines = [
        '宠物名片：',
        '  名字：' + (card.pet_name || '未知'),
        '  蛋：' + (card.egg || pet.egg || state.testEgg || '未知'),
        '  品种：' + (card.species || '未知'),
        '  性别：' + (card.sex || card.gender || '未知'),
        '  性格：' + (card.personality || '未知'),
        '  灵息能力：' + (card.spirit || card.spirit_ability || '未知'),
        '  路线/阶段：' + petDisplayStage(state)
      ];
      const logs = Object.keys(state.logs || {}).sort().map(date => ({ date, log:state.logs[date] || {} }));
      const picked = logs.length <= 3 ? logs : [logs[0], logs[Math.floor((logs.length - 1) / 2)], logs[logs.length - 1]];
      picked.forEach(({ date, log }) => {
        cardLines.push('日志｜' + date + '｜' + (log.title || '日志') + '\n' + (log.body || log.diary || ''));
      });
      if (!picked.length) cardLines.push('日志：无');
      (state.storyRecords || []).slice().reverse().slice(0, 8).forEach(story => {
        if (story && (story.title || story.summary)) cardLines.push('剧情回忆｜' + (story.title || story.id || '') + '：' + (story.summary || ''));
      });
      lines.push('第' + (idx + 1) + '次养宠\n' + cardLines.join('\n'));
    });
    return lines.join('\n\n---\n\n') || '无';
  }
  function petFullAllLogsTextLegacy(caretaker) {
    const lines = [];
    ((caretaker && caretaker.pets) || []).filter(petFullPetCompleted).forEach((pet, idx) => {
      const state = safeObject(pet.state || {});
      Object.keys(state.logs || {}).sort().forEach(date => {
        const log = state.logs[date] || {};
        lines.push('第' + (idx + 1) + '只宠物｜' + date + '｜' + (log.title || '日志') + '\n' + (log.body || log.diary || ''));
      });
      (state.storyRecords || []).slice().reverse().forEach(story => {
        lines.push('第' + (idx + 1) + '只宠物｜剧情｜' + (story.title || story.id || '') + '\n' + (story.summary || '') + '\n' + (story.story || ''));
      });
    });
    return lines.join('\n\n---\n\n') || '无';
  }
  function petFullParsedInfo(pet) {
    try { return pet && pet.infoText ? parsePetInfoText(pet.infoText) : null; }
    catch (_) { return null; }
  }
  function petLatestCaretakerConfig(caretaker) {
    const c = caretaker || {};
    const cfg = settings();
    const name = normalizePresetName(c.name || c.charName || '');
    const currentName = normalizePresetName((cfg.charName && cfg.charName !== '{{char}}') ? cfg.charName : companionName());
    if (name && currentName && name === currentName) {
      return Object.assign({}, cfg, {
        charName:name,
        charDescriptionSnapshot:currentCharDescription(Object.assign({}, cfg, { charName:name, charDescriptionSnapshot:'' })),
        summarySnapshot:summarySnapshotFromId(cfg.summaryId) || cfg.summarySnapshot || null,
        worldText:selectedWorldText(cfg) || c.worldText || ''
      });
    }
    const pr = worldPresets().find(x => normalizePresetName(x && (x.name || x.charName)) === name);
    if (!pr) return null;
    const merged = Object.assign({}, cfg, pr, { charName:pr.charName || pr.name || name });
    return Object.assign({}, merged, {
      worldText:selectedWorldText(merged) || pr.worldText || c.worldText || '',
      summarySnapshot:pr.summarySnapshot || summarySnapshotFromId(pr.summaryId) || null,
      charDescriptionSnapshot:pr.charDescriptionSnapshot || currentCharDescription(Object.assign({}, merged, { charDescriptionSnapshot:'' }))
    });
  }
  function petCaretakerPromptConfig(caretaker) {
    const c = caretaker || petFullActiveCaretaker();
    const cfg = settings();
    if (!c) return cfg;
    const latest = petLatestCaretakerConfig(c) || {};
    const src = Object.assign({}, c, latest);
    const merged = Object.assign({}, cfg, {
      charName:src.charName || src.name || cfg.charName,
      avatarUrl:src.avatarUrl || cfg.avatarUrl || '',
      worldText:src.worldText || '',
      injectUserDesc:src.injectUserDesc !== undefined ? src.injectUserDesc : cfg.injectUserDesc,
      injectCharDesc:src.injectCharDesc !== undefined ? src.injectCharDesc : cfg.injectCharDesc,
      injectChat:src.injectChat !== undefined ? src.injectChat : cfg.injectChat,
      specialLanguageEnabled:src.specialLanguageEnabled !== undefined ? src.specialLanguageEnabled : cfg.specialLanguageEnabled,
      specialLanguage:src.specialLanguage || cfg.specialLanguage,
      breakLimitPrompt:src.breakLimitPrompt || cfg.breakLimitPrompt || '',
      userName:src.userName || cfg.userName || '{{user}}',
      userPersona:src.userPersona || cfg.userPersona || '',
      charDescMode:src.charDescMode || cfg.charDescMode || 'auto',
      manualCharPersona:src.manualCharPersona || cfg.manualCharPersona || '',
      charDescriptionSnapshot:src.charDescriptionSnapshot || (src.worldText ? ((src.name || src.charName || cfg.charName || '{{char}}') + '：\n' + src.worldText) : ''),
      summaryId:src.summaryId || cfg.summaryId || '',
      summarySnapshot:src.summarySnapshot || '',
      selectedWorldEntries:Array.isArray(src.selectedWorldEntries) ? src.selectedWorldEntries : (cfg.selectedWorldEntries || []),
      selectedWorldPresetName:src.selectedWorldPresetName || cfg.selectedWorldPresetName || ''
    });
    return merged;
  }
  function petFullRecordContext(info, state) {
    const c = petFullActiveCaretaker();
    if (!c) return null;
    const pets = (c.pets || []).map((pet, idx) => {
      const parsed = petFullParsedInfo(pet) || info;
      return { pet, petIndex:idx + 1, info:parsed, state:Object.assign(defaultPetTestState(), pet.state || {}) };
    });
    return { caretaker:c, pets };
  }
  function petFullSetActivePet(caretakerId, petId) {
    const data = petFullData();
    const c = (data.caretakers || []).find(x => x.id === caretakerId);
    if (!c) return false;
    c.activePetId = petId || c.activePetId || '';
    data.activeCaretakerId = c.id;
    savePetFullData(data);
    withPetFullActive(c.id);
    return true;
  }
  function petFullCaretakerOptions() {
    const opts = [];
    const cfg = settings();
    const snapshot = (base, extra) => {
      const merged = Object.assign({}, base || cfg, extra || {});
      return {
        injectUserDesc:merged.injectUserDesc,
        injectCharDesc:merged.injectCharDesc,
        injectChat:merged.injectChat,
        specialLanguageEnabled:!!merged.specialLanguageEnabled,
        specialLanguage:merged.specialLanguage || cfg.specialLanguage,
        breakLimitPrompt:merged.breakLimitPrompt || '',
        userName:merged.userName || cfg.userName || '{{user}}',
        userPersona:merged.userPersona || '',
        charDescMode:merged.charDescMode || 'auto',
        manualCharPersona:merged.manualCharPersona || '',
        charName:merged.charName || '',
        charDescriptionSnapshot:merged.charDescriptionSnapshot || '',
        summaryId:merged.summaryId || '',
        summarySnapshot:merged.summarySnapshot || '',
        selectedWorldEntries:Array.isArray(merged.selectedWorldEntries) ? merged.selectedWorldEntries : [],
        selectedWorldPresetName:merged.selectedWorldPresetName || ''
      };
    };
    const push = (name, avatarUrl, roleCfg, idx) => {
      const n = String(name || '').trim();
      if (!n || opts.some(x => x.name === n)) return;
      const merged = Object.assign({}, roleCfg || {}, { charName:n });
      opts.push(Object.assign({ name:n, avatarUrl:avatarUrl || '', worldText:selectedWorldText(merged) || merged.worldText || '', worldIndex:idx }, snapshot(cfg, merged)));
    };
    push(petCharName(), cfg.avatarUrl || findCurrentCardAvatar() || '', Object.assign({}, cfg, { charDescriptionSnapshot:currentCharDescription(cfg) }), -1);
    worldPresets().forEach((pr, i) => push(pr.name || pr.charName || ('角色' + (i + 1)), pr.avatarUrl || '', Object.assign({}, cfg, pr || {}, { selectedWorldEntries:pr.selectedWorldEntries || [], selectedWorldPresetName:pr.selectedWorldPresetName || pr.name || '' }), i));
    return opts;
  }
  function petFullEnsureCaretaker(opt) {
    const data = petFullData();
    let c = data.caretakers.find(x => x.name === opt.name);
    const fields = ['worldIndex','worldText','lazyWorldInject','userDescSource','worldAutoMountMode','injectUserDesc','injectCharDesc','injectChat','specialLanguageEnabled','specialLanguage','breakLimitPrompt','userName','userPersona','charDescMode','manualCharPersona','charName','charDescriptionSnapshot','summaryId','summarySnapshot','selectedWorldEntries','selectedWorldPresetName'];
    if (!c) {
      c = { id:'petc_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), name:opt.name, avatarUrl:opt.avatarUrl || '', activePetId:'', pets:[], createdAt:Date.now() };
      fields.forEach(k => { if (opt[k] !== undefined) c[k] = opt[k]; });
      data.caretakers.unshift(c);
    } else {
      c.avatarUrl = opt.avatarUrl || c.avatarUrl || '';
      fields.forEach(k => { if (opt[k] !== undefined) c[k] = opt[k]; });
    }
    data.activeCaretakerId = c.id;
    savePetFullData(data);
    withPetFullActive(c.id);
    return c;
  }
  function petFullAddPet(caretakerId, infoText, state, meta) {
    const data = petFullData();
    const c = data.caretakers.find(x => x.id === caretakerId);
    if (!c) return null;
    const id = 'pet_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const pet = Object.assign({ id, infoText, state:Object.assign(defaultPetTestState(), state || {}), createdAt:Date.now() }, meta || {});
    c.pets = c.pets || [];
    c.pets.push(pet);
    c.activePetId = id;
    data.activeCaretakerId = c.id;
    savePetFullData(data);
    withPetFullActive(c.id);
    return pet;
  }
  function petFullRemoveActivePet(caretakerId) {
    const data = petFullData();
    const c = data.caretakers.find(x => x.id === caretakerId);
    if (!c) return false;
    const id = c.activePetId || ((c.pets || [])[0] && (c.pets || [])[0].id);
    if (!id) return false;
    c.pets = (c.pets || []).filter(p => p.id !== id);
    c.activePetId = ((c.pets || [])[c.pets.length - 1] || {}).id || '';
    data.activeCaretakerId = c.id;
    savePetFullData(data);
    withPetFullActive(c.id);
    petTestInfoCache = null;
    petTestInfoLoading = null;
    return true;
  }

  function parsePetInfoText(text) {
    const cleaned = cleanPetInfoText(text);
    const lines = cleaned.split('\n');
    const info = { pet_card:{}, main_story:[], side_story:[], quotes:{ char:{}, pet:{} }, parseWarnings:[] };
    const cardStart = lines.findIndex(line => /^\s*pet_card\s*:\s*$/.test(line));
    const mainStart = lines.findIndex(line => /^\s*main_story\s*:\s*$/.test(line));
    const sideStart = lines.findIndex(line => /^\s*side_story\s*:\s*$/.test(line));
    const quotesStart = lines.findIndex(line => /^\s*quotes\s*:\s*$/.test(line));
    if (cardStart >= 0 && mainStart > cardStart) {
      lines.slice(cardStart + 1, mainStart).forEach(line => {
        const parsed = parsePetInfoValue(line);
        if (parsed) info.pet_card[parsed.key] = parsed.value;
      });
    }
    const storyEnd = quotesStart >= 0 ? quotesStart : lines.length;
    const storyLines = lines.slice(mainStart >= 0 ? mainStart + 1 : 0, storyEnd);
    const starts = [];
    storyLines.forEach((line, i) => {
      const m = line.match(/^\s*-\s*id:\s*([A-Z]+\d+)/);
      if (m) starts.push({ index:i, id:m[1] });
    });
    starts.forEach((start, idx) => {
      const block = storyLines.slice(start.index, idx + 1 < starts.length ? starts[idx + 1].index : storyLines.length);
      const id = start.id;
      if (id === 'M14' || id === 'M15') {
        const item = Object.assign({ id, variants:{} }, parsePetFields(block));
        ['spirit','ordinary'].forEach(route => {
          const routeIdx = block.findIndex(line => new RegExp('^\\s*' + route + '\\s*:\\s*$').test(line));
          if (routeIdx >= 0) {
            const otherIdx = block.findIndex((line, i) => i > routeIdx && /^\s*(spirit|ordinary)\s*:\s*$/.test(line));
            item.variants[route] = normalizePetStory(Object.assign({ id, route }, parsePetFields(block.slice(routeIdx + 1, otherIdx >= 0 ? otherIdx : block.length))), info.pet_card.pet_name);
          }
        });
        info.main_story.push(item);
      } else if (/^M\d+/.test(id)) {
        info.main_story.push(normalizePetStory(Object.assign({ id }, parsePetFields(block)), info.pet_card.pet_name));
      } else {
        const item = normalizePetStory(Object.assign({ id, trigger:parsePetTrigger(block) }, parsePetFields(block)), info.pet_card.pet_name);
        info.side_story.push(item);
      }
    });
    if (quotesStart >= 0) {
      let target = null, stage = null, action = null;
      const quoteLines = lines.slice(quotesStart + 1);
      quoteLines.forEach((raw, idx) => {
        const line = raw.trim();
        if (!line) return;
        const nextMeaningful = quoteLines.slice(idx + 1).map(x => x.trim()).find(Boolean) || '';
        if (line === 'char:' || (line === 'pet:' && /^(egg|juvenile|adult|spirit):\s*$/.test(nextMeaningful))) { target = line.slice(0, -1); stage = null; action = null; return; }
        if (!target) return;
        const key = line.match(/^([A-Za-z_]+):\s*(.*)$/);
        if (key) {
          if (['egg','juvenile','adult','spirit'].includes(key[1])) {
            stage = key[1]; action = null;
            info.quotes[target][stage] = info.quotes[target][stage] || {};
          } else if (['feed','pet','poke','sleep','sad'].includes(key[1]) && stage) {
            action = key[1];
            info.quotes[target][stage][action] = key[2] === '[]' ? [] : [];
          }
          return;
        }
        if (target && stage && action && /^-\s*/.test(line)) {
          info.quotes[target][stage][action].push(stripPetQuote(line));
        }
      });
    }
    info.mainById = {};
    info.sideById = {};
    info.main_story.forEach(item => { if (item && item.id) info.mainById[item.id] = item; });
    info.side_story.forEach(item => { if (item && item.id) info.sideById[item.id] = item; });
    if (info.main_story.length < 15) info.parseWarnings.push('主线数量少于15，当前解析到 ' + info.main_story.length);
    if (info.side_story.length < 6) info.parseWarnings.push('支线数量少于6，当前解析到 ' + info.side_story.length);
    return info;
  }
  async function loadPetTestInfo() {
    const activeFullPet = petFullActivePet();
    if (activeFullPet && activeFullPet.infoText) {
      petTestInfoCache = parsePetInfoText(activeFullPet.infoText);
      return petTestInfoCache;
    }
    if (petTestInfoCache) return petTestInfoCache;
    if (petTestInfoLoading) return petTestInfoLoading;
    const testState = petTestState();
    const testSpecies = String(testState.testSpecies || 'rabbit').replace(/[^\w-]/g, '') || 'rabbit';
    const testEgg = String(testState.testEgg || '').replace(/[^\w-]/g, '');
    const url = PET_ASSET_BASE + 'text/pet_info_' + testSpecies + '.txt';
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('宠物试用版数据读取超时')), 15000));
    petTestInfoLoading = Promise.race([fetch(url, { cache:'no-store' }), timeout])
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(text => {
        petTestInfoCache = parsePetInfoText(text);
        if (testEgg) petTestInfoCache.pet_card.egg = testEgg;
        petTestInfoCache.pet_card.species = petTestInfoCache.pet_card.species || testSpecies;
        return petTestInfoCache;
      })
      .catch(e => {
        console.warn('[玩伴小屋] pet test info load failed:', e);
        petTestInfoCache = parsePetInfoText('');
        petTestInfoCache.parseWarnings.push('试用版文本读取失败：' + (e && e.message ? e.message : e));
        return petTestInfoCache;
      });
    return petTestInfoLoading;
  }
  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function offsetDateKey(dateKey, offsetDays) {
    const d = dateKey ? new Date(String(dateKey) + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + Number(offsetDays || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function defaultPetTestState() {
    const now = Date.now();
    return {
      stage:'egg', route:'common', growth:0, fullness:80, happiness:80, location:'home',
      completedMain:[], completedSide:[], storyRecords:[], logs:{}, days:{}, sideCounts:{}, sideTriggered:[], archives:[],
      pendingStories:[], eggInteractions:0, feedCount:0, petCount:0, pokeCount:0, outingCount:0, lastEggPetGrowthAt:0,
      walkRpGenerationCount:0, lastWalkRpMessageKey:'',
      activeStory:null, dismissedStories:[], endingReady:false, finalConfirmed:false, ended:false, startedAt:now, firstVisitDate:todayKey(), lastVisitDate:todayKey(), lastDecayAt:now, lastInteractionAt:now
    };
  }
  function petTestState() {
    const activeFullPet = petFullActivePet();
    if (activeFullPet) return Object.assign(defaultPetTestState(), safeObject(activeFullPet.state || {}));
    return Object.assign(defaultPetTestState(), safeObject(loadJSON(STORAGE_PET_TEST, {})));
  }
  function petTrialHasSavedPet() {
    const raw = safeObject(loadJSON(STORAGE_PET_TEST, {}));
    return !!(raw.testSpecies || raw.testEgg || raw.userName || Number(raw.growth || 0) > 0
      || Object.keys(raw.logs || {}).length || Object.keys(raw.days || {}).length
      || (Array.isArray(raw.storyRecords) && raw.storyRecords.length)
      || (Array.isArray(raw.completedMain) && raw.completedMain.length)
      || (Array.isArray(raw.completedSide) && raw.completedSide.length));
  }
  function savePetTestState(state) {
    if (savePetFullActivePetState(state)) return;
    saveJSON(STORAGE_PET_TEST, Object.assign(defaultPetTestState(), state || {}));
  }
  function petStageCap(stage) {
    return PET_STAGE_CAP[stage] || 100;
  }
  function petGrowthPercent(state) {
    const cap = petStageCap(state.stage);
    return Math.max(0, Math.min(100, Math.round((Number(state.growth || 0) / cap) * 100)));
  }
  function petToastGrowth(reason, added) {
    const n = Math.max(0, Number(added || 0));
    if (n > 0) toast((reason || '成长') + '：成长值 +' + n);
  }
  function petDisplayStage(state) {
    if (state.stage === 'egg') return '蛋形态';
    if (state.stage === 'juvenile') return '幼年';
    if (state.stage === 'adult') return '成年';
    if (state.stage === 'spirit') return '灵息';
    if (state.stage === 'ordinary') return '普通';
    return '宠物';
  }
  function petDisplayName(info, state, fallback) {
    return state && state.stage === 'egg' ? '？？？' : ((info && info.pet_card && info.pet_card.pet_name) || fallback || '宠物');
  }
  function petSpeciesColorRule(species) {
    const map = {
      fox: { name:'狐狸', normal:'红色', spirit:'白色点缀紫色' },
      rabbit: { name:'兔子', normal:'浅黄色', spirit:'黑色点缀金色' },
      cat: { name:'猫', normal:'灰色条纹起司猫', spirit:'白色点缀蓝色' },
      dog: { name:'狗', normal:'黄色柴犬', spirit:'黑色柴犬' },
      bala: { name:'水豚', normal:'棕色', spirit:'棕色点缀绿色' },
      bird: { name:'鸟/鹰', normal:'浅黄色', spirit:'金色点缀红色火焰的鹰' }
    };
    return map[String(species || '').toLowerCase()] || null;
  }
  function petSpeciesColorRuleText(species) {
    const order = ['fox','rabbit','cat','dog','bala','bird'];
    const list = species && species !== 'random' ? [String(species).toLowerCase()] : order;
    return list.map(id => {
      const r = petSpeciesColorRule(id);
      return r ? '- ' + id + '（' + r.name + '）：普通形态=' + r.normal + '；灵息形态=' + r.spirit : '';
    }).filter(Boolean).join('\n');
  }
  function petFormForStage(state) {
    if (state.stage === 'spirit') return 'magic';
    if (state.stage === 'adult' || state.stage === 'ordinary') return 'adult';
    return 'baby';
  }
  function applyPetVisitAndDecay(state) {
    const next = Object.assign(defaultPetTestState(), state || {});
    const now = Date.now();
    const today = todayKey();
    if (!next.firstVisitDate) next.firstVisitDate = today;
    if (next.lastVisitDate && next.lastVisitDate !== today && next.firstVisitDate !== today && !next.ended) {
      const beforeGrowth = Number(next.growth || 0);
      next.growth = Math.min(petStageCap(next.stage), beforeGrowth + 5);
      const added = Math.max(0, Number(next.growth || 0) - beforeGrowth);
      next.days[today] = Object.assign({}, next.days[today] || {}, { visited:true, growth:Number((next.days[today] || {}).growth || 0) + added });
      petToastGrowth('每日照看', added);
    }
    next.lastVisitDate = today;
    const decayStepMs = 30 * 60 * 1000;
    const savedDecayAt = Number(next.lastDecayAt || 0);
    const decayBase = Math.min(now, Math.max(savedDecayAt || petOnlineSessionStartedAt, petOnlineSessionStartedAt));
    const elapsed = Math.floor((now - decayBase) / decayStepMs);
    if (elapsed > 0 && next.stage !== 'egg') {
      next.fullness = Math.max(0, Number(next.fullness || 0) - elapsed * 3);
      next.happiness = Math.max(0, Number(next.happiness || 0) - elapsed * 3);
      next.lastDecayAt = decayBase + elapsed * decayStepMs;
    } else if (elapsed > 0) {
      next.lastDecayAt = now;
    }
    if (!next.lastInteractionAt) next.lastInteractionAt = now;
    return next;
  }
  function petStatePersistKey(state) {
    const s = state || {};
    return JSON.stringify({
      stage:s.stage, route:s.route, growth:Number(s.growth || 0), fullness:Number(s.fullness || 0), happiness:Number(s.happiness || 0),
      lastVisitDate:s.lastVisitDate || '', lastDecayAt:Number(s.lastDecayAt || 0),
      walkRpGenerationCount:Number(s.walkRpGenerationCount || 0), lastWalkRpMessageKey:s.lastWalkRpMessageKey || '',
      days:s.days || {}, sideCounts:s.sideCounts || {}, sideTriggered:s.sideTriggered || [], pendingStories:s.pendingStories || []
    });
  }
  function applyPetVisitAndDecaySaved() {
    const before = petTestState();
    const beforeKey = petStatePersistKey(before);
    const next = applyPetVisitAndDecay(before);
    if (petStatePersistKey(next) !== beforeKey) {
      const saved = updatePetPendingStories(next, petTestInfoCache || { side_story:[] });
      savePetTestState(saved);
      return saved;
    }
    return next;
  }
  function petAutoAction(state) {
    const pet = state || petTestState();
    if (pet.ended || pet.stage === 'egg') return '';
    if (Number(pet.fullness || 0) < 30 || Number(pet.happiness || 0) < 30) return 'sad';
    const last = Number(pet.lastInteractionAt || pet.startedAt || Date.now());
    if (Date.now() - last >= 600000) return 'sleep';
    return '';
  }
  function petQuote(info, who, stage, action, fallback) {
    const quotes = info && info.quotes && info.quotes[who] && info.quotes[who][stage] && info.quotes[who][stage][action];
    if (Array.isArray(quotes) && quotes.length) return quotes[Math.floor(Math.random() * quotes.length)];
    if (stage === 'ordinary') return petQuote(info, who, 'adult', action, fallback);
    return fallback || '';
  }
  function getPetMainStory(info, id, route) {
    const item = info && info.mainById && info.mainById[id];
    if (!item) return null;
    if (item.variants) return item.variants[route || 'spirit'] || item.variants.spirit || item.variants.ordinary || null;
    return item;
  }
  function markPetStoryComplete(state, id, story, route) {
    const next = Object.assign({}, state);
    const listName = /^S/.test(id) ? 'completedSide' : 'completedMain';
    next[listName] = Array.from(new Set([].concat(next[listName] || [], id)));
    next.storyRecords = [{ id, route:route || next.route, title:story?.title || id, summary:story?.summary || '', story:story?.story || '', userName:petPlayerName(next), savedAt:Date.now(), date:todayKey(), snapshot:petSnapshotData(next) }].concat(next.storyRecords || []).slice(0, 120);
    if (id === 'M05') { next.stage = 'juvenile'; next.growth = 0; next.fullness = 80; next.happiness = 80; resetPetSideCountsBeforeStage(next, 'juvenile'); }
    if (id === 'M08') { next.stage = 'adult'; next.growth = 0; resetPetSideCountsBeforeStage(next, 'adult'); }
    if (id === 'M12') { next.stage = 'spirit'; next.route = 'spirit'; next.growth = 0; }
    if (id === 'M13') { next.stage = 'ordinary'; next.route = 'ordinary'; next.growth = 0; }
    if (id === 'M15') next.ended = true;
    return next;
  }
  function petEligibleMainIds(state) {
    const completed = new Set(state.completedMain || []);
    const pending = [];
    PET_MAIN_TRIGGERS.forEach(rule => {
      if (completed.has(rule.id)) return;
      if (rule.final && !state.finalConfirmed) return;
      if (rule.route && state.route !== rule.route) return;
      const stageOk = rule.stage === 'any' || rule.stage === state.stage || (rule.stage === 'chosen' && (state.stage === 'spirit' || state.stage === 'ordinary'));
      if (!stageOk) return;
      if (rule.custom && !rule.custom(state)) return;
      if (rule.at != null && Number(state.growth || 0) < rule.at) return;
      pending.push(rule.id);
    });
    return pending;
  }
  function petSideStageAllowed(required, current) {
    const req = String(required || '').toLowerCase();
    const cur = String(current || '').toLowerCase();
    if (!req || req === 'any') return true;
    if (req === cur) return true;
    const order = { egg:0, juvenile:1, adult:2, spirit:3, ordinary:3 };
    if (req === 'juvenile') return (order[cur] || 0) >= 1;
    if (req === 'adult') return (order[cur] || 0) >= 2;
    return false;
  }
  function petStageOrder(stage) {
    return ({ egg:0, juvenile:1, adult:2, spirit:3, ordinary:3 })[String(stage || '').toLowerCase()] ?? 0;
  }
  function resetPetSideCountsBeforeStage(state, stage) {
    const min = petStageOrder(stage);
    if (!state || !petTestInfoCache?.side_story) return;
    const nextCounts = Object.assign({}, state.sideCounts || {});
    const triggered = new Set(state.sideTriggered || []);
    const pending = new Set(state.pendingStories || []);
    petTestInfoCache.side_story.forEach(side => {
      const required = String(side?.trigger?.stage || 'any').toLowerCase();
      if (required !== 'any' && petStageOrder(required) >= min) {
        delete nextCounts[side.id];
        triggered.delete(side.id);
        pending.delete(side.id);
      }
    });
    state.sideCounts = nextCounts;
    state.sideTriggered = Array.from(triggered);
    state.pendingStories = Array.from(pending);
  }
  function petSideTriggerActionAllowed(trigger, state) {
    if (!petSideStageAllowed(trigger.stage, state.stage)) return false;
    if (trigger.context_type === 'location' && trigger.context_value !== state.location) return false;
    if (trigger.context_type === 'time' && trigger.context_value !== petTimeOfDay()) return false;
    return true;
  }

  function updatePetPendingStories(state, info) {
    const next = Object.assign({}, state);
    const existing = new Set(next.pendingStories || []);
    petEligibleMainIds(next).forEach(id => existing.add(id));
    (info?.side_story || []).forEach(side => {
      const id = side.id;
      if (!id || (next.completedSide || []).includes(id)) return;
      const trigger = side.trigger || {};
      if (!petSideStageAllowed(trigger.stage, next.stage)) return;
      if (trigger.context_type === 'location' && trigger.context_value !== next.location) return;
      if (trigger.context_type === 'time' && trigger.context_value !== petTimeOfDay()) return;
      const count = Number((next.sideCounts || {})[id] || 0);
      const triggered = new Set(next.sideTriggered || []);
      if (trigger.behavior_trigger_type === 'count' && count >= Number(trigger.threshold || 0)) triggered.add(id);
      next.sideTriggered = Array.from(triggered);
      if (triggered.has(id)) existing.add(id);
    });
    next.pendingStories = Array.from(existing);
    return next;
  }
  function petTimeOfDay() {
    const h = new Date().getHours();
    return h >= 6 && h < 18 ? 'day' : 'night';
  }
  function petSceneUrl(state) {
    const loc = ['home','outside','garden'].includes(state.location) ? state.location : 'home';
    return PET_ASSET_BASE + 'scene/' + loc + '-' + petTimeOfDay() + '.png';
  }
  function petEggUrl(state) {
    const pct = petGrowthPercent(state);
    const idx = pct >= 80 ? 4 : (pct >= 50 ? 3 : (pct >= 20 ? 2 : 1));
    const egg = (petTestInfoCache?.pet_card?.egg || 'gold').replace(/[^a-z]/g, '') || 'gold';
    return PET_ASSET_BASE + 'eggs/' + egg + '-' + idx + '.png';
  }
  function petAnimalSpriteUrl(state, action) {
    const activeFullPet = petFullActivePet();
    if (!petTestInfoCache && activeFullPet?.infoText) {
      try { petTestInfoCache = parsePetInfoText(activeFullPet.infoText); } catch (_) {}
    }
    const testSpecies = petTestState().testSpecies || '';
    const species = (petTestInfoCache?.pet_card?.species || testSpecies || 'rabbit').replace(/[^a-z]/g, '') || 'rabbit';
    return PET_ASSET_BASE + species + '/' + petFormForStage(state) + '/' + petStateClass(action || state.petAction || 'normal') + '.png';
  }
  function petAssetHTML(state, action) {
    const pet = state || petTestState();
    if (pet.stage === 'egg') return '<img class="wb-pet-asset wb-pet-egg-img" src="' + esc(petEggUrl(pet)) + '" alt="">';
    return '<div class="wb-pet-fox ' + esc(petFormForStage(pet)) + ' ' + esc(petStateClass(action || pet.petAction || 'normal')) + '" style="--wb-pet-sprite:url(' + esc(petAnimalSpriteUrl(pet, action)) + ')"></div>';
  }
  function petEggUrlForInfo(state, info) {
    const pct = petGrowthPercent(state || {});
    const idx = pct >= 80 ? 4 : (pct >= 50 ? 3 : (pct >= 20 ? 2 : 1));
    const egg = (info?.pet_card?.egg || state?.testEgg || 'gold').replace(/[^a-z]/g, '') || 'gold';
    return PET_ASSET_BASE + 'eggs/' + egg + '-' + idx + '.png';
  }
  function petAnimalSpriteUrlForInfo(state, action, info) {
    const pet = state || defaultPetTestState();
    const species = (info?.pet_card?.species || pet.testSpecies || 'rabbit').replace(/[^a-z]/g, '') || 'rabbit';
    return PET_ASSET_BASE + species + '/' + petFormForStage(pet) + '/' + petStateClass(action || pet.petAction || 'normal') + '.png';
  }
  function petAssetHTMLForInfo(state, action, info) {
    const pet = state || defaultPetTestState();
    if (pet.stage === 'egg') return '<img class="wb-pet-asset wb-pet-egg-img" src="' + esc(petEggUrlForInfo(pet, info)) + '" alt="">';
    return '<div class="wb-pet-fox ' + esc(petFormForStage(pet)) + ' ' + esc(petStateClass(action || pet.petAction || 'normal')) + '" style="--wb-pet-sprite:url(' + esc(petAnimalSpriteUrlForInfo(pet, action, info)) + ')"></div>';
  }
  function petUiIcon(name) {
    const icons = {
      back:'<path d="M19 12H5"/><path d="M12 5l-7 7 7 7"/>',
      down:'<path d="M7 9l5 6 5-6"/>',
      help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.8 2.8 0 0 1 5 1.7c0 2-2.5 2.1-2.5 4"/><path d="M12 18h.01"/>',
      restart:'<path d="M18.5 9.2A6.8 6.8 0 1 0 20 14"/><path d="M18.5 9.2V4.8"/><path d="M18.5 9.2h-4.4"/>',
      walk:'<path d="M12 4l-5 7h3l-4 6h12l-4-6h3z"/><path d="M12 17v4"/><path d="M9 21h6"/>',
      feed:'<path d="M12 7c-4 0-7 2.5-7 6 0 4.5 5.2 8 7 8s7-3.5 7-8c0-3.5-3-6-7-6z"/><path d="M12 7l-3-3"/><path d="M12 7l3-3"/><path d="M12 7c-1.2-1.5-3.4-1.8-5-1"/><path d="M12 7c1.2-1.5 3.4-1.8 5-1"/><path d="M9 12h.01"/><path d="M12 15h.01"/><path d="M15 12h.01"/>',
      pat:'<path d="M7 12V8a1.5 1.5 0 0 1 3 0v4"/><path d="M10 11V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M13 11V7.5a1.5 1.5 0 0 1 3 0V12"/><path d="M16 12V10a1.5 1.5 0 0 1 3 0v4c0 4-2.5 6-6 6h-1c-2.6 0-4.2-1.2-5.8-3.4L4.8 14.7a1.4 1.4 0 0 1 2.2-1.7L9 15"/>',
      log:'<path d="M5 19l4-1 9-9-3-3-9 9-1 4z"/><path d="M13 8l3 3"/>',
      records:'<path d="M6 4h12v16H6z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/>',
      scene:'<path d="M4 6h16v12H4z"/><path d="M8 14l3-3 2 2 2-3 3 4"/>',
      story:'<path d="M12 5v8"/><path d="M12 18h.01"/>',
      ending:'<path d="M12 3l2.2 6 6 .3-4.7 3.8 1.6 5.9-5.1-3.3L6.9 19l1.6-5.9L3.8 9.3l6-.3z"/>',
      replay:'<path d="M5 7h11v10H5z"/><path d="M16 10l4-2v8l-4-2"/><path d="M8 5l2 2"/><path d="M14 5l-2 2"/>',
      card:'<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M7 10h5"/><path d="M7 14h10"/><path d="M15 10h2"/>',
      plus:'<path d="M12 5v14"/><path d="M5 12h14"/>',
      interact:'<path d="M7 13c2-5 8-5 10 0"/><path d="M8 16h8"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
      status:'<path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/>',
      chat:'<path d="M5 6h14v10H9l-4 3z"/>',
      home:'<path d="M4 11l8-7 8 7"/><path d="M7 10v10h10V10"/>',
      ball:'<circle cx="12" cy="12" r="8"/><path d="M4.8 9.5c4.8 1.8 9.6 1.8 14.4 0"/><path d="M4.8 14.5c4.8-1.8 9.6-1.8 14.4 0"/><path d="M12 4c-2.2 2.4-2.2 13.6 0 16"/><path d="M12 4c2.2 2.4 2.2 13.6 0 16"/>',
      coin:'<circle cx="12" cy="12" r="8"/><path d="M9 9.5h6"/><path d="M9 12h6"/><path d="M9 14.5h6"/>',
      close:'<path d="M7 7l10 10"/><path d="M17 7L7 17"/>'
    };
    return '<svg class="wb-pet-svg" viewBox="0 0 24 24" aria-hidden="true">' + (icons[name] || icons.help) + '</svg>';
  }
  function petSnapshotData(state) {
    const src = state || petTestState();
    return {
      stage:src.stage || 'egg',
      route:src.route || 'common',
      growth:Number(src.growth || 0),
      location:src.location || 'home',
      petAction:src.petAction || 'normal',
      testSpecies:src.testSpecies || '',
      testEgg:src.testEgg || ''
    };
  }
  function petSnapshotState(snapshot) {
    return Object.assign({}, petTestState(), snapshot || {});
  }
  function petSnapshotHTML(snapshot, label) {
    const snap = petSnapshotState(snapshot);
    return '<div class="wb-pet-snapshot" style="background-image:url(' + esc(petSceneUrl(snap)) + ')">' + petAssetHTML(snap, snap.petAction || 'normal') + '</div>';
  }
  function petSnapshotHTMLForInfo(snapshot, info) {
    const snap = petSnapshotState(snapshot);
    return '<div class="wb-pet-snapshot" style="background-image:url(' + esc(petSceneUrl(snap)) + ')">' + petAssetHTMLForInfo(snap, snap.petAction || 'normal', info) + '</div>';
  }
  function petApplyInteraction(action) {
    let state = applyPetVisitAndDecay(petTestState());
    const today = todayKey();
    const day = Object.assign({ feed:0, pet:0, poke:0, outing:0, play:0 }, state.days[today] || {});
    const canGrow = !state.ended;
    const addGrowth = (amount, reason) => {
      if (!canGrow || amount <= 0) return 0;
      const before = Number(state.growth || 0);
      state.growth = Math.min(petStageCap(state.stage), before + amount);
      const added = Math.max(0, Number(state.growth || 0) - before);
      day.growth = Number(day.growth || 0) + added;
      petToastGrowth(reason, added);
      return added;
    };
    if (action === 'feed' && state.stage !== 'egg') {
      const beforeFullness = Number(state.fullness || 0);
      state.fullness = Math.min(100, beforeFullness + 15);
      if (state.fullness > beforeFullness) addGrowth(1, '喂食照顾');
      state.feedCount = Number(state.feedCount || 0) + 1;
      day.feed++;
    } else if (action === 'pet') {
      if (state.stage !== 'egg') {
        const beforeHappiness = Number(state.happiness || 0);
        state.happiness = Math.min(100, beforeHappiness + 15);
        if (state.happiness > beforeHappiness) addGrowth(1, '抚摸陪伴');
      }
      if (state.stage === 'egg') {
        const now = Date.now();
        const last = Number(state.lastEggPetGrowthAt || 0);
        if (!last || now - last >= 600000) {
          addGrowth(1, '抚摸蛋壳');
          state.lastEggPetGrowthAt = now;
        }
      }
      state.petCount = Number(state.petCount || 0) + 1;
      if (state.stage === 'egg') state.eggInteractions = Number(state.eggInteractions || 0) + 1;
      day.pet++;
    } else if (action === 'poke') {
      state.pokeCount = Number(state.pokeCount || 0) + 1;
      if (state.stage === 'egg') state.eggInteractions = Number(state.eggInteractions || 0) + 1;
      day.poke++;
    } else if (action === 'outing') {
      state.outingCount = Number(state.outingCount || 0) + 1;
      if (state.stage !== 'egg') {
        const latest = messageFromHost(null);
        const text = latest ? String(latest.message || latest.mes || latest.text || '') : '';
        if (isAssistantMessage(latest) && text.trim()) state.lastWalkRpMessageKey = hostMessageStableKey(null, latest, text);
      }
      day.outing++;
    } else if (action === 'play') {
      if (state.stage !== 'egg') state.happiness = Math.min(100, Number(state.happiness || 0) + 5);
      addGrowth(2, '一起玩耍');
      day.play++;
    }
    state.lastInteractionAt = Date.now();
    day.snapshot = petSnapshotData(state);
    state.days = Object.assign({}, state.days || {}, { [today]:day });
    const sideCounts = Object.assign({}, state.sideCounts || {});
    const triggered = new Set(state.sideTriggered || []);
    (petTestInfoCache?.side_story || []).forEach(side => {
      const trigger = side.trigger || {};
      if (trigger.behavior !== action) return;
      if (!petSideTriggerActionAllowed(trigger, state)) return;
      sideCounts[side.id] = Number(sideCounts[side.id] || 0) + 1;
      if ((state.completedSide || []).includes(side.id)) return;
      if (trigger.behavior_trigger_type === 'count' && sideCounts[side.id] >= Number(trigger.threshold || 0)) triggered.add(side.id);
      if (trigger.behavior_trigger_type === 'probability' && Math.random() < Number(trigger.probability || 0)) triggered.add(side.id);
    });
    state.sideCounts = sideCounts;
    state.sideTriggered = Array.from(triggered);
    state.lastDecayAt = Date.now();
    const auto = petAutoAction(state);
    if (auto) state.petAction = auto;
    return state;
  }
  function petApplyGameReward(gameMeta, result, durationMs, recordBroken) {
    let state = applyPetVisitAndDecay(petTestState());
    if (state.ended) return;
    const mode = gameMeta && gameMeta.mode;
    const outcome = resultOutcome(result);
    const growthAdd = mode === 'double' && outcome !== 'draw' && outcome !== 'finished'
      ? (outcome === 'user_win' ? 6 : 4)
      : (Number(durationMs || 0) >= 3600000 ? 6 : 4);
    const recordBonus = recordBroken ? 5 : 0;
    const today = todayKey();
    const day = Object.assign({ feed:0, pet:0, poke:0, outing:0, play:0 }, state.days[today] || {});
    day.play = Number(day.play || 0) + 1;
    if (recordBonus) day.record = Number(day.record || 0) + recordBonus;
    day.snapshot = petSnapshotData(state);
    if (state.stage !== 'egg') state.happiness = Math.min(100, Number(state.happiness || 0) + 5);
    const beforeGrowth = Number(state.growth || 0);
    state.growth = Math.min(petStageCap(state.stage), beforeGrowth + growthAdd + recordBonus);
    const added = Math.max(0, Number(state.growth || 0) - beforeGrowth);
    day.growth = Number(day.growth || 0) + added;
    petToastGrowth((gameMeta && gameMeta.name ? gameMeta.name : '小游戏') + '陪玩', added);
    state.days = Object.assign({}, state.days || {}, { [today]:day });
    const sideCounts = Object.assign({}, state.sideCounts || {});
    const triggered = new Set(state.sideTriggered || []);
    (petTestInfoCache?.side_story || []).forEach(side => {
      const trigger = side.trigger || {};
      if (trigger.behavior !== 'play') return;
      if (!petSideTriggerActionAllowed(trigger, state)) return;
      sideCounts[side.id] = Number(sideCounts[side.id] || 0) + 1;
      if ((state.completedSide || []).includes(side.id)) return;
      if (trigger.behavior_trigger_type === 'count' && sideCounts[side.id] >= Number(trigger.threshold || 0)) triggered.add(side.id);
      if (trigger.behavior_trigger_type === 'probability' && Math.random() < Number(trigger.probability || 0)) triggered.add(side.id);
    });
    state.sideCounts = sideCounts;
    state.sideTriggered = Array.from(triggered);
    savePetTestState(updatePetPendingStories(state, petTestInfoCache || { side_story:[] }));
  }
  function petApplyDesktopBallReward(amount, recordBroken) {
    let state = applyPetVisitAndDecay(petTestState());
    if (state.ended) return state;
    const today = todayKey();
    const day = Object.assign({ feed:0, pet:0, poke:0, outing:0, play:0 }, state.days[today] || {});
    day.play = Number(day.play || 0) + 1;
    const recordBonus = recordBroken ? 5 : 0;
    if (recordBonus) day.record = Number(day.record || 0) + recordBonus;
    if (state.stage !== 'egg') state.happiness = Math.min(100, Number(state.happiness || 0) + 5);
    const beforeGrowth = Number(state.growth || 0);
    state.growth = Math.min(petStageCap(state.stage), beforeGrowth + Math.max(1, Number(amount || 1)) + 2 + recordBonus);
    const added = Math.max(0, Number(state.growth || 0) - beforeGrowth);
    day.growth = Number(day.growth || 0) + added;
    petToastGrowth('桌宠玩球', added);
    day.snapshot = petSnapshotData(state);
    state.days = Object.assign({}, state.days || {}, { [today]:day });
    state.lastDecayAt = Date.now();
    savePetTestState(updatePetPendingStories(state, petTestInfoCache || { side_story:[] }));
    return state;
  }
  function petApplyCheatGrowth(amount) {
    let state = applyPetVisitAndDecay(petTestState());
    if (state.ended) return state;
    const today = todayKey();
    const day = Object.assign({ feed:0, pet:0, poke:0, outing:0, play:0 }, state.days[today] || {});
    const beforeGrowth = Number(state.growth || 0);
    state.growth = Math.min(petStageCap(state.stage), beforeGrowth + Math.max(0, Number(amount || 0)));
    const added = Math.max(0, Number(state.growth || 0) - beforeGrowth);
    day.growth = Number(day.growth || 0) + added;
    day.cheat = Number(day.cheat || 0) + added;
    petToastGrowth('开挂模式', added);
    day.snapshot = petSnapshotData(state);
    state.days = Object.assign({}, state.days || {}, { [today]:day });
    state.lastDecayAt = Date.now();
    savePetTestState(updatePetPendingStories(state, petTestInfoCache || { side_story:[] }));
    return state;
  }
  function petApplyStoryGrowth(state, amount, key, reason) {
    const next = Object.assign(defaultPetTestState(), state || {});
    if (next.ended) return next;
    const today = todayKey();
    const day = Object.assign({ feed:0, pet:0, poke:0, outing:0, play:0 }, next.days[today] || {});
    const beforeGrowth = Number(next.growth || 0);
    next.growth = Math.min(petStageCap(next.stage), beforeGrowth + Math.min(5, Math.max(0, Number(amount || 0))));
    const added = Math.max(0, Number(next.growth || 0) - beforeGrowth);
    if (added > 0) {
      day.growth = Number(day.growth || 0) + added;
      day[key || 'story'] = Number(day[key || 'story'] || 0) + added;
      day.snapshot = petSnapshotData(next);
      next.days = Object.assign({}, next.days || {}, { [today]:day });
      petToastGrowth(reason || '剧情记录', added);
    }
    return next;
  }
  function petStateClass(state) {
    return ['normal','happy','eat','sleep','sad'].indexOf(state) >= 0 ? state : 'normal';
  }
  function petFormForCount(count) {
    return petFormForStage(petTestState());
  }
  function petCurrentForm() {
    return petFormForStage(petTestState());
  }
  function petSpriteUrl(form, state) {
    const pet = petTestState();
    if (pet.stage === 'egg') return petEggUrl(pet);
    return petAnimalSpriteUrl(Object.assign({}, pet, { stage: form === 'magic' ? 'spirit' : (form === 'adult' ? 'adult' : 'juvenile') }), state);
  }
  function petEvolutionLine(form) {
    const name = petTestInfoCache?.pet_card?.pet_name || '宠物';
    if (form === 'adult') return name + '长大了一点，站得更稳了。';
    if (form === 'magic') return name + '身上亮起微光，变成了灵息形态。';
    return '';
  }
  function petLineFor(state) {
    const pet = petTestState();
    const stage = pet.stage === 'egg' ? 'egg' : (pet.stage === 'ordinary' ? 'adult' : pet.stage);
    const cls = petStateClass(state);
    const action = ({ normal:'poke', happy:'pet', eat:'feed', sleep:'sleep', sad:'sad' })[cls] || 'poke';
    const quoted = petTestInfoCache && petQuote(petTestInfoCache, 'pet', stage, action, '');
    if (quoted) return quoted;
    const name = petDisplayName(petTestInfoCache, pet, '我');
    return ({
      eat: name + '吃得很认真。',
      happy: name + '开心地蹭了蹭你。',
      sleep: name + '困困地打了个小哈欠。',
      sad: name + '有点委屈地看着你。',
      normal: name + '轻轻碰了碰你的手。'
    })[cls] || '';
  }
  function petSpriteHTML(state, extraClass) {
    const pet = petTestState();
    if (pet.stage === 'egg') return '<img class="wb-pet-fox wb-pet-egg-img' + (extraClass ? ' ' + esc(extraClass) : '') + '" src="' + esc(petEggUrl(pet)) + '" alt="">';
    const form = petCurrentForm();
    return '<div class="wb-pet-fox ' + esc(form) + ' ' + esc(petStateClass(state)) + (extraClass ? ' ' + esc(extraClass) : '') + '" style="--wb-pet-sprite:url(' + esc(petSpriteUrl(form, state)) + ')"></div>';
  }
  function setPetSpriteState(root, state) {
    const fox = qs('.wb-pet-fox', root || getHostDocument());
    if (!fox) return;
    const pet = petTestState();
    if (pet.stage === 'egg' && fox.tagName === 'IMG') {
      fox.src = petEggUrl(pet);
      return;
    }
    const form = petCurrentForm();
    ['baby','adult','magic'].forEach(x => fox.classList.toggle(x, x === form));
    ['normal','happy','eat','sleep','sad'].forEach(x => fox.classList.toggle(x, x === petStateClass(state)));
    fox.style.setProperty('--wb-pet-sprite', 'url(' + petSpriteUrl(form, state) + ')');
    fox.classList.remove('animating');
    void fox.offsetWidth;
  }
  function triggerPetAnimation(root) {
    const fox = qs('.wb-pet-fox', root || getHostDocument());
    if (!fox) return;
    fox.classList.remove('animating');
    void fox.offsetWidth;
    fox.classList.add('animating');
    setTimeout(() => {
      const latest = qs('.wb-pet-fox', root || getHostDocument());
      if (latest) latest.classList.remove('animating');
    }, 2050);
  }
  function resetPetAnimationLoop(root, fast) {
    if (petAnimationTimer) clearTimeout(petAnimationTimer);
    const schedule = () => {
      const delay = fast ? 3600 + Math.floor(Math.random() * 1800) : 10000;
      petAnimationTimer = setTimeout(() => {
        const doc = getHostDocument();
        const target = root && root.isConnected ? root : (qs('#wb-pet-room', doc) || qs('#' + PET_FLOAT_ID, doc));
        if (!target) { petAnimationTimer = null; return; }
        triggerPetAnimation(target);
        schedule();
      }, delay);
    };
    schedule();
  }
  function clearPetTimers() {
    if (petIdleTimer) clearTimeout(petIdleTimer);
    if (petSadTimer) clearTimeout(petSadTimer);
    if (petAnimationTimer) clearTimeout(petAnimationTimer);
    if (petStateReturnTimer) clearTimeout(petStateReturnTimer);
    petIdleTimer = null;
    petSadTimer = null;
    petAnimationTimer = null;
    petStateReturnTimer = null;
  }
  function resetPetIdleTimer(root) {
    if (petIdleTimer) clearTimeout(petIdleTimer);
    if (petSadTimer) clearTimeout(petSadTimer);
    const auto = petAutoAction(applyPetVisitAndDecaySaved());
    if (auto === 'sad') {
      petSetState('sad', '', { root, persistent:true, temporary:false, animate:true, resetIdle:false });
      return;
    }
    if (auto === 'sleep') {
      petSetState('sleep', '', { root, persistent:true, temporary:false, animate:true });
      return;
    }
    petIdleTimer = setTimeout(() => {
      petSetState('sleep', '', { root, persistent:true, temporary:false, animate:true });
    }, 600000);
    petSadTimer = null;
  }
  function petSetState(state, line, options) {
    const opts = options || {};
    const nextState = petStateClass(state);
    const doc = getHostDocument();
    const root = opts.root && opts.root.isConnected ? opts.root : (qs('#wb-pet-room', doc) || qs('#' + PET_FLOAT_ID, doc));
    if (opts.persistent !== false) setSettings({ petDesktopState: nextState });
    if (root) {
      setPetSpriteState(root, nextState);
      const speech = qs('.wb-pet-speech, .wb-pet-desk-speech', root);
      if (speech) {
        const text = opts.suppressSpeech ? '' : (line || petLineFor(nextState) || '');
        speech.textContent = text;
        speech.style.display = text ? '' : 'none';
        if (root.id === PET_FLOAT_ID) {
          const rect = root.getBoundingClientRect ? root.getBoundingClientRect() : null;
          root.classList.toggle('speech-right', !!(text && rect && rect.left < 150));
          root.classList.toggle('speech-on', !!text);
          if (text) setTimeout(() => { const latest = qs('#' + PET_FLOAT_ID, doc); if (latest) latest.classList.remove('speech-on'); }, 4200);
        }
      }
      if (opts.animate !== false) triggerPetAnimation(root);
      resetPetAnimationLoop(root, nextState === 'eat' || nextState === 'happy');
    }
    if (opts.temporary) {
      if (petStateReturnTimer) clearTimeout(petStateReturnTimer);
      petStateReturnTimer = setTimeout(() => {
        petSetState('normal', petLineFor('normal') || '', { root, persistent:true, temporary:false, animate:false });
      }, 10000);
    }
    if (nextState !== 'sleep' && opts.resetIdle !== false) resetPetIdleTimer(root);
  }
  function petInteract(root, state) {
    const pet = petApplyInteraction(state === 'eat' ? 'feed' : (state === 'happy' ? 'pet' : 'poke'));
    savePetTestState(updatePetPendingStories(pet, petTestInfoCache));
    const auto = petAutoAction(pet);
    const nextState = auto || state;
    petSetState(nextState, petLineFor(nextState), { root, persistent:true, temporary:!auto, animate:true });
  }
  function petDesktopStatusHTML() {
    const pet = applyPetVisitAndDecaySaved();
    const pct = petGrowthPercent(pet);
    const rows = [
      ['成长值', pct + '%', pct],
      ['饱食度', pet.stage === 'egg' ? '???' : Math.round(pet.fullness || 0), pet.stage === 'egg' ? 0 : Math.round(pet.fullness || 0)],
      ['开心值', pet.stage === 'egg' ? '???' : Math.round(pet.happiness || 0), pet.stage === 'egg' ? 0 : Math.round(pet.happiness || 0)]
    ];
    return '<div class="wb-pet-desk-panel-head"><span>灵息状态 · ' + esc(petDisplayName(petTestInfoCache, pet)) + ' · ' + esc(petDisplayStage(pet)) + '</span><button class="wb-pet-desk-close" data-pet-close="status" type="button">▲</button></div><div class="wb-pet-desk-stats">' + rows.map(r => '<div class="wb-pet-desk-stat-row"><b>' + esc(r[0]) + '</b><div class="wb-pet-desk-bar" style="--v:' + Math.max(0, Math.min(100, Number(r[2] || 0))) + '%"><span></span></div></div>').join('') + '</div>';
  }
  function petCardPromptText(info, state) {
    const hidden = v => v ? String(v) : '???';
    return [
      '宠物名称：' + petDisplayName(info, state),
      '当前阶段：' + petDisplayStage(state),
      '成长值：' + petGrowthPercent(state) + '%',
      '饱食度：' + (state.stage === 'egg' ? '???' : Math.round(state.fullness || 0)),
      '开心值：' + (state.stage === 'egg' ? '???' : Math.round(state.happiness || 0)),
      '品种：' + hidden(state.stage === 'egg' ? '' : info?.pet_card?.species),
      '性别：' + hidden(info?.pet_card?.gender),
      '性格：' + hidden(state.stage === 'egg' ? '' : info?.pet_card?.personality),
      '灵息：' + hidden(state.stage === 'spirit' ? info?.pet_card?.spirit : ''),
      '收养人：' + petPlayerName(state) + ' & ' + petCharName()
    ].join('\n');
  }
  async function petDesktopChatPromptText() {
    try {
      const res = await fetch(PET_ASSET_BASE + 'text/desktop_chat.txt', { cache:'no-store' });
      if (res.ok) return await res.text();
    } catch(e) {}
    return '你需要扮演当前灵息宠物，作为可爱的桌面宠物、旁观者和读者，只输出宠物回复正文。';
  }
  function recentChatText(limit) {
    const ctx = getHostContext();
    const chat = ctx && Array.isArray(ctx.chat) ? ctx.chat : [];
    return chat.slice(-(limit || 6)).map(m => {
      const name = m?.name || (m?.is_user ? petPlayerName(petTestState()) : petCharName());
      return name + '：' + String(m?.mes || m?.message || m?.text || '').replace(/<[^>]+>/g, '').trim();
    }).filter(Boolean).join('\n\n');
  }
  async function generatePetDesktopChat(kind, userText) {
    const cfg = petCaretakerPromptConfig();
    const state = applyPetVisitAndDecaySaved();
    const info = petTestInfoCache || {};
    const fallback = kind === 'comment' ? '我刚刚像趴在窗台上一样看完啦，这段剧情里有一点亮晶晶的地方。' : '我听见啦。今天也要慢慢照顾我，不许偷偷忘记。';
    if (!cfg.apiUrl || !cfg.apiModel) return fallback;
    const basePrompt = await petDesktopChatPromptText();
    const prompt = [
      (cfg.breakLimitPrompt || '').trim(),
      '语言要求：宠物聊天只使用自然、普通的中文输出，不要套用当前角色的日语/古风/外语等特殊语言风格。',
      basePrompt,
      '【当前共同养宠角色】\n' + currentCharDescription(cfg),
      '【当前用户设定】\n' + currentUserDescription(cfg),
      '【宠物名片】\n' + petCardPromptText(info, state),
      '【上面8层剧情内容】\n' + (recentChatText(8) || '无'),
      kind === 'comment' ? '任务：评论最近几层楼的故事剧情，像读者一样说出你的感受。' : '用户对你说：' + (userText || '')
    ].filter(Boolean).join('\n\n');
    return (await callApiText(cfg, prompt, '你是可爱的桌面宠物，只输出宠物回复正文。', 900)).trim();
  }
  function updatePetDesktopPanels(el) {
    if (!el) return;
    const status = qs('.wb-pet-desk-status', el);
    if (status) status.innerHTML = petDesktopStatusHTML();
    qsa('[data-pet-close]', el).forEach(btn => {
      btn.onclick = e => {
        stopFloatEvent(e);
        el.classList.remove(btn.dataset.petClose === 'status' ? 'status-on' : 'chat-on');
      };
    });
  }
  function petDesktopSetChat(el, text) {
    const box = qs('.wb-pet-desk-chat-text', el);
    if (box) box.textContent = text || '';
  }
  function openPetDesktopChatInput(el) {
    injectPetArcadeStyle();
    const doc = getHostDocument();
    const old = qs('#wb-pet-desktop-chat-mask', doc); if (old) old.remove();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-desktop-chat-mask';
    mask.innerHTML = '<div class="wb-modal wb-mini-modal wb-pet-modal"><div class="wb-pet-modal-head"><div class="wb-pet-modal-title">和宠物聊天</div></div><div class="wb-field" style="margin:14px;"><textarea class="wb-textarea" id="wb-pet-desktop-chat-input" style="min-height:92px;" placeholder="想对宠物说什么？"></textarea></div><div class="wb-actions" style="padding:0 14px 14px;"><button class="wb-btn primary" id="wb-pet-desktop-chat-ok" style="flex:1;">确定</button><button class="wb-btn" id="wb-pet-desktop-chat-cancel" style="flex:1;">返回</button></div></div>';
    applySelectedFont();
    applyTavernThemeVars(mask);
    doc.body.appendChild(mask);
    qs('#wb-pet-desktop-chat-cancel', mask).onclick = () => mask.remove();
    qs('#wb-pet-desktop-chat-ok', mask).onclick = async () => {
      const text = (qs('#wb-pet-desktop-chat-input', mask)?.value || '').trim();
      if (!text) { toast('请先输入聊天内容'); return; }
      mask.remove();
      el.classList.add('chat-on');
      petDesktopSetChat(el, '生成中...');
      try { petDesktopSetChat(el, await generatePetDesktopChat('chat', text)); }
      catch(e) { petDesktopSetChat(el, '我刚刚有点走神了，但我听见你说的话啦。'); }
    };
  }
  function startPetBallGame(el) {
    const doc = getHostDocument();
    const win = getHostWindow();
    let score = 0, raf = 0, running = true;
    const ball = doc.createElement('div');
    const card = doc.createElement('div');
    const record = Math.max(0, Number(settings().petBallRecord || 0));
    const scoreText = () => '玩球 ' + score + '｜记录 ' + Math.max(record, score);
    ball.className = 'wb-pet-ball';
    card.className = 'wb-pet-ball-score';
    card.textContent = scoreText();
    doc.body.appendChild(ball);
    doc.body.appendChild(card);
    el.classList.remove('menu-open', 'interact-open', 'status-on', 'chat-on');
    const vw = () => win.innerWidth || doc.documentElement.clientWidth || 800;
    const vh = () => win.innerHeight || doc.documentElement.clientHeight || 700;
    let x = Math.random() * Math.max(80, vw() - 80) + 30;
    let y = -20;
    let vx = 0;
    let vy = 1.2;
    let frame = 0;
    let petRect = el.getBoundingClientRect();
    const end = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
      ball.remove();
      card.remove();
      const recordBroken = score > record;
      if (recordBroken) setSettings({ petBallRecord:score });
      if (score > 3) {
        petApplyDesktopBallReward(1, recordBroken);
      }
      petSetState(score <= 3 ? 'sad' : 'happy', '', { root:el, persistent:true, temporary:true, animate:true, suppressSpeech:true });
    };
    const tick = () => {
      if (!running) return;
      if ((frame++ & 3) === 0) {
        petRect = el.getBoundingClientRect();
        if (petRect.top < vh() * .63) {
          placePetDesktop(el, petRect.left, vh() * .68);
          petRect = el.getBoundingClientRect();
        }
      }
      const rect = petRect;
      const petSize = Math.min(rect.width, rect.height) * .5;
      const pcx = rect.left + rect.width / 2;
      const pcy = rect.top + rect.height / 2;
      vy += .22;
      x += vx;
      y += vy;
      const bx = x + 14, by = y + 14;
      const dx = bx - pcx, dy = by - pcy;
      if (dy > -petSize && dy < petSize && Math.abs(dx) < petSize && vy > 0) {
        score++;
        card.textContent = scoreText();
        vy = -(7.8 + Math.random() * 3.8);
        vx = Math.max(-4.4, Math.min(4.4, vx * .55 + (dx / petSize) * 1.8 + (Math.random() - .5) * .55));
        if (score % 3 === 0) petSetState(score <= 3 ? 'sad' : 'happy', '', { root:el, persistent:false, temporary:true, animate:true, suppressSpeech:true });
      }
      ball.style.transform = 'translate3d(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px,0)';
      if (y > vh() - 18 || y < -80 || x < -28 || x > vw()) { end(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  function clampPetDesktopPosition(x, y) {
    const win = getHostWindow();
    const doc = getHostDocument();
    const vw = win.innerWidth || doc.documentElement.clientWidth || 800;
    const vh = win.innerHeight || doc.documentElement.clientHeight || 700;
    const size = vw <= 768 ? 86 : 104;
    const margin = 6;
    const nx = Number.isFinite(Number(x)) ? Number(x) : DEFAULT_SETTINGS.petDesktopX;
    const ny = Number.isFinite(Number(y)) ? Number(y) : DEFAULT_SETTINGS.petDesktopY;
    return {
      x: Math.max(margin, Math.min(nx, Math.max(margin, vw - size - margin))),
      y: Math.max(margin, Math.min(ny, Math.max(margin, vh - size - margin)))
    };
  }
  function placePetDesktop(el, x, y) {
    if (!el) return;
    const pos = clampPetDesktopPosition(x, y);
    el.style.left = pos.x + 'px';
    el.style.top = pos.y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }
  function clampFloatingBallPosition(x, y) {
    const win = getHostWindow();
    const doc = getHostDocument();
    const vw = win.innerWidth || doc.documentElement.clientWidth || 800;
    const vh = win.innerHeight || doc.documentElement.clientHeight || 700;
    const size = vw <= 768 ? 36 : 54;
    const margin = 8;
    const nx = Number.isFinite(Number(x)) ? Number(x) : DEFAULT_SETTINGS.floatingBallX;
    const ny = Number.isFinite(Number(y)) ? Number(y) : DEFAULT_SETTINGS.floatingBallY;
    return {
      x: Math.max(margin, Math.min(nx, Math.max(margin, vw - size - margin))),
      y: Math.max(margin, Math.min(ny, Math.max(margin, vh - size - margin)))
    };
  }
  function placeFloatingBall(btn, x, y) {
    if (!btn) return;
    const pos = clampFloatingBallPosition(x, y);
    btn.style.left = pos.x + 'px';
    btn.style.top = pos.y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }
  function stopFloatEvent(e) {
    if (!e) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
  }
  function armPopupOpenGuard() {
    const shell = qs('#' + SHELL_ID, getHostDocument());
    if (!shell) return;
    shell.classList.add('wb-open-guard');
    setTimeout(() => {
      const latest = qs('#' + SHELL_ID, getHostDocument());
      if (latest) latest.classList.remove('wb-open-guard');
    }, 320);
  }
  function bindFloatingBall(btn) {
    if (!btn || btn.dataset.wbBound) return;
    btn.dataset.wbBound = '1';
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    btn.addEventListener('pointerdown', e => {
      if (e.button != null && e.button !== 0) return;
      const rect = btn.getBoundingClientRect();
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      originX = rect.left;
      originY = rect.top;
      btn.classList.add('dragging');
      try { btn.setPointerCapture(e.pointerId); } catch(e2) {}
      stopFloatEvent(e);
    });
    btn.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      placeFloatingBall(btn, originX + dx, originY + dy);
      stopFloatEvent(e);
    });
    const finish = e => {
      if (!dragging) return;
      dragging = false;
      btn.classList.remove('dragging');
      try { btn.releasePointerCapture(e.pointerId); } catch(e2) {}
      const rect = btn.getBoundingClientRect();
      const pos = clampFloatingBallPosition(rect.left, rect.top);
      setSettings({ floatingBallX: pos.x, floatingBallY: pos.y });
      placeFloatingBall(btn, pos.x, pos.y);
      if (!moved) { buildPopup(); armPopupOpenGuard(); }
      stopFloatEvent(e);
    };
    btn.addEventListener('pointerup', finish);
    btn.addEventListener('pointercancel', e => {
      if (!dragging) return;
      dragging = false;
      btn.classList.remove('dragging');
      try { btn.releasePointerCapture(e.pointerId); } catch(e2) {}
      stopFloatEvent(e);
    });
    btn.addEventListener('click', stopFloatEvent, true);
    btn.addEventListener('touchstart', stopFloatEvent, { capture:true, passive:false });
    btn.addEventListener('touchend', stopFloatEvent, { capture:true, passive:false });
  }
  function bindPetDesktop(el) {
    if (!el || el.dataset.wbBound) return;
    el.dataset.wbBound = '1';
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originX = 0;
    let originY = 0;
    const foxBtn = qs('.wb-pet-desk-fox', el);
    const stopPetShellEvent = e => {
      if (e && e.target && e.target.closest && e.target.closest('.wb-pet-round, .wb-pet-desk-panel')) return;
      stopFloatEvent(e);
    };
    el.addEventListener('pointerdown', e => {
      if (e.button != null && e.button !== 0) return;
      if (e.target && e.target.closest && e.target.closest('.wb-pet-round, .wb-pet-desk-panel')) return;
      const rect = el.getBoundingClientRect();
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      originX = rect.left;
      originY = rect.top;
      el.classList.add('dragging');
      try { el.setPointerCapture(e.pointerId); } catch(e2) {}
      stopFloatEvent(e);
    });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      placePetDesktop(el, originX + dx, originY + dy);
      stopFloatEvent(e);
    });
    const finish = e => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      try { el.releasePointerCapture(e.pointerId); } catch(e2) {}
      const rect = el.getBoundingClientRect();
      const pos = clampPetDesktopPosition(rect.left, rect.top);
      setSettings({ petDesktopX: pos.x, petDesktopY: pos.y });
      placePetDesktop(el, pos.x, pos.y);
      if (!moved) {
        const now = Date.now();
        if (now >= petDesktopPokeLockedUntil) {
          petDesktopPokeLockedUntil = now + 3000;
          petSetState(Math.random() < .5 ? 'normal' : 'happy', '', { root:el, persistent:true, temporary:true, animate:true, suppressSpeech:true });
        }
        if (el.classList.contains('menu-open')) el.classList.remove('menu-open', 'interact-open');
        else { el.classList.remove('speech-on'); el.classList.add('menu-open'); }
      }
      stopFloatEvent(e);
    };
    el.addEventListener('pointerup', finish);
    el.addEventListener('pointercancel', e => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      try { el.releasePointerCapture(e.pointerId); } catch(e2) {}
      stopFloatEvent(e);
    });
    if (foxBtn) foxBtn.addEventListener('click', stopFloatEvent, true);
    qsa('.wb-pet-round', el).forEach(btn => {
      btn.onclick = e => {
        stopFloatEvent(e);
        const action = btn.dataset.petAction;
        if (action !== 'interact') el.classList.remove('menu-open', 'interact-open');
        if (action === 'interact') { el.classList.toggle('interact-open'); return; }
        if (action === 'feed') { petInteract(el, 'eat'); updatePetDesktopPanels(el); }
        if (action === 'pet') { petInteract(el, 'happy'); updatePetDesktopPanels(el); }
        if (action === 'ball') startPetBallGame(el);
        if (action === 'status') { el.classList.toggle('status-on'); updatePetDesktopPanels(el); }
        if (action === 'talk') { el.classList.toggle('chat-on'); updatePetDesktopPanels(el); }
        if (action === 'home') {
          setSettings({ petDesktopEnabled:false, petDesktopState:'normal', petForm:petCurrentForm() });
          petReturnHouseOnRender = true;
          syncPetDesktop();
          syncFloatingBall();
          currentTab = 'intimacy';
          currentGame = null;
          buildPopup();
        }
      };
    });
    qsa('.wb-pet-desk-chat-actions button', el).forEach(btn => {
      btn.onclick = async e => {
        stopFloatEvent(e);
        const action = btn.dataset.petChat;
        if (action === 'close') { el.classList.remove('chat-on'); return; }
        if (action === 'chat') { openPetDesktopChatInput(el); return; }
        if (action === 'comment') {
          petDesktopSetChat(el, '生成中...');
          try { petDesktopSetChat(el, await generatePetDesktopChat('comment', '')); }
          catch(err) { petDesktopSetChat(el, '我刚刚认真看了一会儿，感觉这段剧情像一颗小糖，藏着一点点亮光。'); }
        }
      };
    });
    updatePetDesktopPanels(el);
    el.addEventListener('click', stopPetShellEvent, true);
    el.addEventListener('touchstart', stopPetShellEvent, { capture:true, passive:false });
    el.addEventListener('touchend', stopPetShellEvent, { capture:true, passive:false });
  }
  function syncPetDesktop() {
    const doc = getHostDocument();
    const cfg = settings();
    let el = qs('#' + PET_FLOAT_ID, doc);
    if (!cfg.petDesktopEnabled) {
      if (el) el.remove();
      clearPetTimers();
      return;
    }
    injectStyle();
    const state = petStateClass(cfg.petDesktopState || 'normal');
    if (el && !qs('.wb-pet-desk-submenu', el)) { el.remove(); el = null; }
    if (!el) {
      el = doc.createElement('div');
      el.id = PET_FLOAT_ID;
      el.className = 'wb-pet-float';
      el.innerHTML = '<button class="wb-pet-desk-fox" type="button" aria-label="桌宠">'
        + petSpriteHTML(state)
        + '</button><div class="wb-pet-desk-menu">'
        + '<button class="wb-pet-round" type="button" data-pet-action="interact" title="互动" aria-label="互动">互动</button>'
        + '<button class="wb-pet-round" type="button" data-pet-action="status" title="查看状态" aria-label="查看状态">状态</button>'
        + '<button class="wb-pet-round" type="button" data-pet-action="talk" title="聊天" aria-label="聊天">聊天</button>'
        + '<button class="wb-pet-round" type="button" data-pet-action="home" title="回家" aria-label="回家">回家</button>'
        + '</div><div class="wb-pet-desk-submenu">'
        + '<button class="wb-pet-round" type="button" data-pet-action="feed" title="喂食" aria-label="喂食">喂食</button>'
        + '<button class="wb-pet-round" type="button" data-pet-action="pet" title="抚摸" aria-label="抚摸">抚摸</button>'
        + '<button class="wb-pet-round" type="button" data-pet-action="ball" title="玩球" aria-label="玩球">玩球</button>'
        + '</div><div class="wb-pet-desk-panel wb-pet-desk-chat"><div class="wb-pet-desk-chat-actions"><span class="wb-pet-desk-chat-title">宠物聊天</span><button type="button" data-pet-chat="chat">聊天</button><button type="button" data-pet-chat="comment">评论</button><button type="button" data-pet-chat="close">▲</button></div><div class="wb-pet-desk-chat-text">（陪我聊天吧！）</div></div><div class="wb-pet-desk-panel wb-pet-desk-status"></div><div class="wb-pet-desk-speech">' + esc(petLineFor(state)) + '</div>';
      doc.body.appendChild(el);
      bindPetDesktop(el);
    } else {
      setPetSpriteState(el, state);
      updatePetDesktopPanels(el);
    }
    placePetDesktop(el, cfg.petDesktopX, cfg.petDesktopY);
    resetPetIdleTimer(el);
    resetPetAnimationLoop(el, state === 'eat' || state === 'happy');
    if (!petDesktopResizeBound) {
      petDesktopResizeBound = true;
      getHostWindow().addEventListener('resize', () => {
        const latest = settings();
        const existing = qs('#' + PET_FLOAT_ID, getHostDocument());
        if (existing) placePetDesktop(existing, latest.petDesktopX, latest.petDesktopY);
      });
    }
  }
  function syncFloatingBall() {
    const doc = getHostDocument();
    const cfg = settings();
    let btn = qs('#' + FLOAT_ID, doc);
    if (cfg.petDesktopEnabled) {
      if (btn) btn.remove();
      syncPetDesktop();
      return;
    }
    syncPetDesktop();
    if (!cfg.floatingBallEnabled) {
      if (btn) btn.remove();
      return;
    }
    injectStyle();
    if (!btn) {
      btn = doc.createElement('button');
      btn.id = FLOAT_ID;
      btn.type = 'button';
      btn.title = '玩伴小屋';
      btn.setAttribute('aria-label', '打开玩伴小屋');
      doc.body.appendChild(btn);
      bindFloatingBall(btn);
    }
    placeFloatingBall(btn, cfg.floatingBallX, cfg.floatingBallY);
    if (!floatingBallResizeBound) {
      floatingBallResizeBound = true;
      getHostWindow().addEventListener('resize', () => {
        const latest = settings();
        const existing = qs('#' + FLOAT_ID, getHostDocument());
        if (existing) placeFloatingBall(existing, latest.floatingBallX, latest.floatingBallY);
      });
    }
  }
	  function buildPopup() {
	    injectStyle();
	    applySelectedFont();
    const doc = getHostDocument();
    let shell = qs('#' + SHELL_ID, doc);
    if (!shell) {
      shell = doc.createElement('div');
      shell.id = SHELL_ID;
      doc.body.appendChild(shell);
      shell.addEventListener('click', e => { if (e.target === shell) closePopupShell(); });
      const win = getHostWindow();
      const vp = win.visualViewport || (typeof visualViewport !== 'undefined' ? visualViewport : null);
      if (vp && !shell.dataset.vpBound) { vp.addEventListener('resize', () => { syncMobileShellViewport(); scheduleFitGameSurface(); }); vp.addEventListener('scroll', () => { syncMobileShellViewport(); scheduleFitGameSurface(); }); shell.dataset.vpBound = '1'; }
      win.addEventListener('resize', scheduleFitGameSurface);
      win.addEventListener('orientationchange', () => { setTimeout(syncMobileShellViewport, 120); setTimeout(scheduleFitGameSurface, 160); });
      if (!shell.dataset.visibilityBound) {
        doc.addEventListener('visibilitychange', () => { if (doc.hidden) pauseGameForInactiveSurface(); });
        shell.dataset.visibilityBound = '1';
      }
    }
    let p = qs('#' + POPUP_ID, doc);
    if (!p) {
      p = doc.createElement('div');
      p.id = POPUP_ID;
      shell.appendChild(p);
    } else if (p.parentNode !== shell) {
      shell.appendChild(p);
    }
    shell.classList.add('wb-shell-visible');
    shell.style.display = ((getHostWindow().innerWidth || 800) <= 768) ? 'block' : 'flex';
    syncMobileShellViewport();
    p.style.display = 'flex';
    restoreWindowState();
    render();
  }
  function closePopupShell() {
    if (standalone) { standaloneBack(); return; }
    pauseGameForInactiveSurface();
    const doc = getHostDocument();
    const shell = qs('#' + SHELL_ID, doc);
    if (shell) { shell.classList.remove('wb-shell-visible'); shell.style.display = 'none'; }
    const p = qs('#' + POPUP_ID, doc);
    if (p) p.style.display = 'none';
    if (!settings().petDesktopEnabled) clearPetTimers();
  }
	  function syncPopupModeClass() {
	    const p = qs('#' + POPUP_ID);
	    if (!p) return;
	    applySelectedFont();
	    const theme = themeClass();
	    p.className = theme + (currentGame ? ' wb-playing' : '') + ' wb-tab-' + (currentTab || 'single');
	    applyTavernThemeVars(p);
	  }
  function render() {
    const cfg = settings(); const p = qs('#' + POPUP_ID); syncPopupModeClass();
    // Only the embedded plugin needs to shield its host page from these events.
    // Standalone scrolling must not wait on non-passive popup listeners.
    p.onwheel = standalone ? null : (e) => { e.stopPropagation(); };
    p.ontouchmove = standalone ? null : (e) => { e.stopPropagation(); };
    const singleCount = Object.values(GAME_META).filter(g => g.mode === 'single').length;
    const doubleCount = Object.values(GAME_META).filter(g => g.mode === 'double').length;
    const intimacyCount = 1;
    const countBadge = n => '<span class="wb-tab-count">' + esc(n) + '</span>';
    if (standalone) {
      p.innerHTML = '<div class="wb-head"><div class="wb-title"><img src="' + new URL('../../assets/app-brand/app-icon.png', import.meta.url).href + '" alt="" width="28" height="28">玩吧</div><div class="wb-tabs"><button class="wb-tab" data-tab="single">单人游戏' + countBadge(singleCount) + '</button><button class="wb-tab" data-tab="double">人机挑战' + countBadge(doubleCount) + '</button><button class="wb-tab" data-tab="settings">设置</button></div></div><div class="wb-body" id="wb-body"></div>';
    } else {
    p.innerHTML = '<div class="wb-head"><div class="wb-title">玩伴小屋</div><div class="wb-tabs"><button class="wb-tab" data-tab="single">单人游戏' + countBadge(singleCount) + '</button><button class="wb-tab" data-tab="double">双人游戏' + countBadge(doubleCount) + '</button><button class="wb-tab" data-tab="intimacy">亲密互动' + countBadge(intimacyCount) + '</button><button class="wb-tab" data-tab="settings">设置</button></div><div class="wb-head-meta" aria-label="当前版本 V' + esc(EXTENSION_VERSION) + '，本游戏发布者 Gloria"><span><i>当前版本</i>V' + esc(EXTENSION_VERSION) + '</span><span><i>发布者</i>Gloria</span></div><button class="wb-iconbtn" id="wb-close" title="关闭">×</button></div><div class="wb-body" id="wb-body"></div>';
    }
    syncUpdateNoticeClass();
    qsa('.wb-tab', p).forEach(b => { b.classList.toggle('active', b.dataset.tab === currentTab); b.onclick = () => { flushSettingsProgress(); stopGame(); currentGame = null; currentTab = b.dataset.tab; saveWindowState(currentTab, ''); render(); }; });
    const closeButton = qs('#wb-close', p); if (closeButton) closeButton.onclick = () => { flushSettingsProgress(); saveWindowState(currentTab, currentGame); stopGame(); closePopupShell(); };
    try {
      if (currentGame) renderGame(currentGame); else if (currentTab === 'settings') renderSettings(); else if (currentTab === 'intimacy') renderIntimacy(); else renderSelect(currentTab);
      if (settings().petDesktopEnabled) syncFloatingBall();
      applyMainSwipeAnimation();
      bindMainSwipe();
    } catch(e) {
      console.error('[玩伴小屋] render failed:', e);
      currentGame = null;
      const body = qs('#wb-body', p);
      if (body) {
        body.className = 'wb-body wb-settings-mode';
        body.innerHTML = '<div class="wb-panel"><div class="wb-section-title">数据读取异常</div><div class="wb-api-status">当前本地数据可能存在不完整或不兼容内容，页面已进入保护模式。请刷新后重新导入备份，或清理异常本地数据。</div><div class="wb-actions"><button class="wb-btn primary" id="wb-render-retry">重新打开</button><button class="wb-btn danger" id="wb-render-clear-local">清理玩伴小屋本地数据</button><button class="wb-btn" id="wb-render-close">关闭</button></div></div>';
        const retry = qs('#wb-render-retry', body); if (retry) retry.onclick = () => { currentTab = 'settings'; render(); };
        const clear = qs('#wb-render-clear-local', body); if (clear) clear.onclick = () => showConfirm('清理玩伴小屋本地数据', '确定清理玩伴小屋本地数据吗？这会删除本插件的设置、语录、小剧场、游戏记录、进度和题库，但不会清理酒馆其他数据。', () => { Object.keys(localStorage).filter(k => k.indexOf(SCRIPT_ID + '_') === 0).forEach(k => localStorage.removeItem(k)); getHostWindow().location.reload(); });
        const close = qs('#wb-render-close', body); if (close) close.onclick = closePopupShell;
      }
    }
  }

  function applyMainSwipeAnimation() {
    const body = qs('#wb-body');
    if (!body || !mainSwipeAnimation || currentGame || !isMobileHost()) { mainSwipeAnimation = ''; return; }
    const cls = mainSwipeAnimation;
    body.classList.add(cls);
    mainSwipeAnimation = '';
    setTimeout(() => { if (body) body.classList.remove(cls); }, 260);
  }

  function bindMainSwipe() {
    const body = qs('#wb-body');
    if (!body) return;
    body._wanbaSwipeCleanup?.();
    body._wanbaSwipeCleanup = null;
    if (currentGame || body.classList.contains('wb-game-mode')) {
      body.ontouchstart = null;
      body.ontouchend = null;
      return;
    }
    let sx = 0, sy = 0;
    const tabs = standalone ? ['single','double','settings'] : ['single','double','intimacy','settings'];
    const start = e => { const t = e.touches && e.touches[0]; if (!t) return; sx = t.clientX; sy = t.clientY; };
    const end = e => {
      if (currentGame || body.classList.contains('wb-game-mode')) return;
      const t = e.changedTouches && e.changedTouches[0]; if (!t || !sx) return;
      const dx = t.clientX - sx, dy = t.clientY - sy; sx = sy = 0;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      const i = tabs.indexOf(currentTab);
      const next = tabs[Math.max(0, Math.min(tabs.length - 1, i + (dx < 0 ? 1 : -1)))];
      if (next && next !== currentTab) { flushSettingsProgress(); stopGame(); currentGame = null; mainSwipeAnimation = dx < 0 ? 'wb-swipe-enter-left' : 'wb-swipe-enter-right'; currentTab = next; saveWindowState(currentTab, ''); render(); }
    };
    if (standalone) {
      const cancel = () => { sx = sy = 0; };
      body.ontouchstart = body.ontouchend = null;
      body.addEventListener('touchstart', start, { passive:true });
      body.addEventListener('touchend', end, { passive:true });
      body.addEventListener('touchcancel', cancel, { passive:true });
      body._wanbaSwipeCleanup = () => { body.removeEventListener('touchstart', start); body.removeEventListener('touchend', end); body.removeEventListener('touchcancel', cancel); };
    } else { body.ontouchstart = start; body.ontouchend = end; }
  }

  function renderIntimacy() {
    syncPopupModeClass();
    const body = qs('#wb-body');
    body.className = 'wb-body wb-intimacy-mode';
    if (petReturnHouseOnRender) {
      petReturnHouseOnRender = false;
      renderPetHouse();
      return;
    }
    clearPetTimers();
    body.innerHTML = '<div class="wb-intimacy-hub">'
      + '<button class="wb-intimacy-button" id="wb-pet-trial" type="button"><img src="' + esc(PET_BUTTON_URL) + '" alt=""><span>灵息小窝</span></button>'
      + '<button class="wb-intimacy-button" data-soon="1" type="button"><img src="' + esc(HEART_CHALLENGE_URL) + '" alt=""><span>心跳挑战</span></button>'
      + '<button class="wb-intimacy-button" data-soon="1" type="button"><img src="' + esc(FARM_BUTTON_URL) + '" alt=""><span>种下心动</span></button>'
      + '</div>';
    const trial = qs('#wb-pet-trial', body);
    if (trial) trial.onclick = openPetFullEntry;
    qsa('[data-soon="1"]', body).forEach(btn => { btn.onclick = () => toast('敬请期待'); });
  }

  function openPetFullEntry() {
    petRuntimeMode = 'full';
    const data = petFullData();
    const activeCaretaker = petFullActiveCaretaker(data);
    const active = petFullActivePet(data, activeCaretaker);
    if (active && activeCaretaker) { withPetFullActive(activeCaretaker.id); renderPetHouse(); return; }
    openPetCaretakerSelect(null, { forceFull:true });
  }

  function renderPetEntry() {
    openPetFullEntry();
  }
  function openPetTestSelect() {
    injectPetArcadeStyle();
    petRuntimeMode = 'test';
    petFullActiveCaretakerId = '';
    petTestInfoCache = null;
    petTestInfoLoading = null;
    syncPopupModeClass();
    const body = qs('#wb-body');
    body.className = 'wb-body wb-intimacy-mode';
    clearPetTimers();
    const st = petTestState();
    const eggs = [['blue','蓝色蛋'], ['purple','紫色蛋'], ['pink','粉色蛋'], ['green','绿色蛋'], ['gold','金色蛋'], ['white','白色蛋']];
    const species = [['rabbit','兔子'], ['dog','小狗'], ['cat','猫咪'], ['bird','飞鸟'], ['bala','水豚'], ['fox','狐狸']];
    const egg = st.testEgg || 'green';
    const sp = st.testSpecies || 'rabbit';
    body.innerHTML = '<div class="wb-panel wb-pet-test-select" style="max-width:760px;margin:0 auto;display:grid;gap:12px;">'
      + '<div class="wb-section-title">试用版</div>'
      + '<label class="wb-field"><span>{{user}} 名字</span><input class="wb-input" id="wb-pet-test-user" value="' + esc(st.userName || settings().userName || '') + '" placeholder="输入你的名字"></label>'
      + '<div class="wb-field"><span>选择蛋</span><div class="wb-pet-egg-grid">' + eggs.map(e => '<button class="wb-btn wb-pet-egg-choice ' + (egg === e[0] ? 'selected' : '') + '" type="button" data-egg="' + e[0] + '"><img src="' + esc(PET_ASSET_BASE + 'eggs/' + e[0] + '-1.png') + '" alt=""><span>' + e[1] + '</span></button>').join('') + '</div></div>'
      + '<div class="wb-field"><span>选择宠物种类</span><div class="wb-pet-species-grid">' + species.map(x => '<button class="wb-btn wb-pet-species-choice ' + (sp === x[0] ? 'selected' : '') + '" type="button" data-species="' + x[0] + '">' + esc(x[1]) + '</button>').join('') + '</div></div>'
      + '<div class="wb-actions"><button class="wb-btn primary" id="wb-pet-test-enter" style="flex:1;">直接进入</button><button class="wb-btn" id="wb-pet-test-back">返回</button></div>'
      + '</div>';
    let selectedEgg = egg, selectedSpecies = sp;
    qsa('.wb-pet-egg-choice', body).forEach(btn => btn.onclick = () => { selectedEgg = btn.dataset.egg; qsa('.wb-pet-egg-choice', body).forEach(x => x.classList.toggle('selected', x === btn)); });
    qsa('.wb-pet-species-choice', body).forEach(btn => btn.onclick = () => { selectedSpecies = btn.dataset.species; qsa('.wb-pet-species-choice', body).forEach(x => x.classList.toggle('selected', x === btn)); });
    qs('#wb-pet-test-enter', body).onclick = () => {
      const userName = (qs('#wb-pet-test-user', body)?.value || '').trim() || settings().userName || '你';
      setSettings({ userName });
      saveJSON(STORAGE_PET_TEST, Object.assign(defaultPetTestState(), { userName, testEgg:selectedEgg, testSpecies:selectedSpecies }));
      petTestInfoCache = null;
      petTestInfoLoading = null;
      renderPetHouse();
    };
    qs('#wb-pet-test-back', body).onclick = openPetFullEntry;
  }
  function renderPetNameGate() {
    syncPopupModeClass();
    const body = qs('#wb-body');
    body.className = 'wb-body wb-intimacy-mode';
    clearPetTimers();
    const state = petTestState();
    const current = state.userName || settings().userName || '';
    body.innerHTML = '<div class="wb-panel" style="max-width:560px;margin:0 auto;display:grid;gap:12px;">'
      + '<div class="wb-section-title">进入试用版</div>'
      + '<label class="wb-field"><span>{{user}} 名字</span><input class="wb-input" id="wb-pet-user-name" value="' + esc(current) + '" placeholder="输入你的名字"></label>'
      + '<div class="wb-actions"><button class="wb-btn primary" id="wb-pet-name-start" style="flex:1;">进入</button><button class="wb-btn" id="wb-pet-name-back">返回</button></div>'
      + '</div>';
    const input = qs('#wb-pet-user-name', body);
    const start = qs('#wb-pet-name-start', body);
    const go = () => {
      const name = (input && input.value ? input.value.trim() : '') || '你';
      const next = Object.assign({}, petTestState(), { userName:name });
      savePetTestState(next);
      setSettings({ userName:name });
      renderPetHouse();
    };
    if (start) start.onclick = go;
    if (input) input.onkeydown = e => { if (e.key === 'Enter') go(); };
    const back = qs('#wb-pet-name-back', body);
    if (back) back.onclick = openPetFullEntry;
  }

  function petBarHTML(label, value, color) {
    const v = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
    return '<div class="wb-pet-bar"><span><b>' + esc(label) + '</b><em>' + v + '%</em></span><div class="wb-pet-bar-track"><div class="wb-pet-bar-fill" style="--v:' + v + '%;--c:' + esc(color) + ';"></div></div></div>';
  }
  function petSpeakerClass(speaker) {
    const sp = String(speaker || '').toLowerCase();
    if (speaker === 'U' || sp === 'user' || speaker === '{{user}}') return 'speaker-u';
    if (speaker === 'C' || sp === 'char' || speaker === '{{char}}') return 'speaker-c';
    if (speaker === 'P' || sp === 'pet' || speaker === '宠物') return 'speaker-p';
    if (speaker === '沈栖白' || speaker === '沈') return 'speaker-shen';
    return 'speaker-narrator';
  }
  function petPlayerName(state) {
    return (state && state.userName) || petTestState().userName || settings().userName || '{{user}}';
  }
  function petCharName() {
    if (petRuntimeMode === 'test') return '江维';
    const c = petFullActiveCaretaker();
    return (c && c.name) || companionName() || '{{char}}';
  }
  function petCharAvatarHTML() {
    const c = petRuntimeMode === 'test' ? null : petFullActiveCaretaker();
    const url = (c && c.avatarUrl) || settings().avatarUrl || findCurrentCardAvatar() || '';
    const name = petCharName();
    return '<span class="wb-pet-title-avatar">' + (url ? '<img src="' + esc(url) + '" alt="">' : esc(String(name || '?').slice(0, 1))) + '</span>';
  }
  function injectPetArcadeStyle() {
    const doc = getHostDocument();
    if (qs('#' + SCRIPT_ID + '-pet-arcade-css', doc)) return;
    const style = doc.createElement('style');
    style.id = SCRIPT_ID + '-pet-arcade-css';
    style.textContent = `
      #${POPUP_ID} .wb-body.wb-pet-mode{padding:10px;overflow:hidden;background:radial-gradient(circle at 18% 8%,var(--wb-glow),transparent 28%),linear-gradient(135deg,var(--wb-bg) 0%,var(--wb-board) 54%,var(--wb-soft) 100%)}
      #${POPUP_ID} .wb-pet-room{height:100%;min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:6px;color:var(--wb-text);font-family:'Trebuchet MS','Microsoft YaHei',sans-serif;justify-items:stretch}
      #${POPUP_ID} .wb-pet-room button,.wb-modal-mask .wb-pet-modal button{image-rendering:pixelated;border-radius:0!important;border:2px solid color-mix(in srgb,var(--wb-accent) 48%,var(--wb-border) 52%)!important;background:var(--wb-soft)!important;color:var(--wb-text)!important;box-shadow:3px 3px 0 color-mix(in srgb,var(--wb-text) 55%,#000 45%)!important;font-weight:1000;display:inline-grid;place-items:center;text-align:center;line-height:1!important;transition:transform .08s steps(1,end),filter .08s steps(1,end),box-shadow .08s steps(1,end)}#${POPUP_ID} .wb-pet-room button:hover,.wb-modal-mask .wb-pet-modal button:hover{transform:translate(-1px,-1px);filter:none;box-shadow:4px 4px 0 color-mix(in srgb,var(--wb-text) 55%,#000 45%)!important}#${POPUP_ID} .wb-pet-room button:active,.wb-modal-mask .wb-pet-modal button:active{transform:translate(2px,2px);box-shadow:1px 1px 0 color-mix(in srgb,var(--wb-text) 55%,#000 45%)!important}
      #${POPUP_ID} .wb-pet-topbar{position:relative;display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px;padding:8px;border:2px solid color-mix(in srgb,var(--wb-text) 60%,#000 40%);background:linear-gradient(180deg,color-mix(in srgb,var(--wb-accent) 82%,#fff 18%),var(--wb-accent2));box-shadow:none!important;color:var(--wb-on-accent)}
      #${POPUP_ID} .wb-pet-titlebox{position:relative;grid-column:2;justify-self:center;display:flex;align-items:center;justify-content:center;gap:5px;min-width:0;max-width:100%;font-weight:1000;letter-spacing:.5px;text-shadow:1px 1px 0 rgba(255,255,255,.5);z-index:2}
      #${POPUP_ID} .wb-pet-title-avatar{width:30px;height:30px;min-width:30px;border-radius:999px;overflow:hidden;display:grid;place-items:center;background:color-mix(in srgb,var(--wb-panel) 82%,var(--wb-accent) 18%);color:var(--wb-text);border:2px solid color-mix(in srgb,var(--wb-on-accent) 70%,transparent);font-size:14px;font-weight:1000;line-height:1;text-shadow:none}
      #${POPUP_ID} .wb-pet-title-avatar img{width:100%;height:100%;object-fit:cover;display:block}
      #${POPUP_ID} .wb-pet-house-name{white-space:normal;overflow:visible;text-overflow:clip;text-align:center;line-height:1.05;font-size:clamp(11px,1.55vw,15px);overflow-wrap:anywhere;word-break:break-word}
      #${POPUP_ID} .wb-pet-top-actions{display:flex;gap:6px;align-items:center;justify-self:end;margin-left:auto;position:relative;z-index:4;grid-column:3}
      #${POPUP_ID} .wb-pet-iconbtn{width:38px;min-width:38px;height:36px;padding:0!important;display:grid!important;place-items:center!important;align-items:center!important;justify-items:center!important;background:var(--wb-soft)!important;color:var(--wb-text)!important;font-size:18px;font-family:'Trebuchet MS','Microsoft YaHei',sans-serif}#${POPUP_ID} .wb-pet-topbar .wb-pet-iconbtn{background:var(--wb-soft)!important;color:var(--wb-text)!important;box-shadow:3px 3px 0 color-mix(in srgb,var(--wb-text) 54%,#000 46%)!important}#${POPUP_ID} .wb-pet-svg{width:20px;height:20px;display:block;fill:none;stroke:currentColor;stroke-width:2.8;stroke-linecap:square;stroke-linejoin:miter}#${POPUP_ID} #wb-pet-back .wb-pet-svg{width:24px;height:24px}#${POPUP_ID} #wb-pet-caretakers .wb-pet-svg{width:18px;height:18px}#${POPUP_ID} #wb-pet-help .wb-pet-svg,#${POPUP_ID} #wb-pet-restart .wb-pet-svg{width:21px;height:21px;stroke-width:2.6}#${POPUP_ID} #wb-pet-back,#${POPUP_ID} #wb-pet-caretakers,#${POPUP_ID} #wb-pet-help,#${POPUP_ID} #wb-pet-restart{background:transparent!important;border-color:transparent!important;color:var(--wb-on-accent)!important}.wb-modal-mask .wb-pet-modal-head .wb-pet-iconbtn{background:transparent!important;border-color:transparent!important;color:var(--wb-on-accent)!important}#${POPUP_ID} #wb-pet-caretakers .wb-pet-svg{stroke-width:3.2}#${POPUP_ID} #wb-pet-restart .wb-pet-svg{width:23px;height:23px;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
      #${POPUP_ID} .wb-pet-status-card{display:grid;gap:6px;padding:8px;border:2px solid color-mix(in srgb,var(--wb-text) 65%,#000 35%);background:linear-gradient(180deg,var(--wb-panel),var(--wb-soft));box-shadow:none!important}
      #${POPUP_ID} .wb-pet-status-head{display:flex;justify-content:space-between;align-items:center;gap:8px;color:var(--wb-accent);font-weight:900}
      #${POPUP_ID} .wb-pet-status-identity{display:flex;align-items:center;gap:6px;min-width:0}
      #${POPUP_ID} .wb-pet-status-name,#${POPUP_ID} .wb-pet-status-stage{display:inline-flex;align-items:center;min-height:25px;padding:3px 8px;border:2px solid color-mix(in srgb,var(--wb-text) 62%,#000 38%);background:var(--wb-input);color:var(--wb-text);font-size:15px;line-height:1;box-sizing:border-box}
      #${POPUP_ID} .wb-pet-status-name{max-width:38vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:color-mix(in srgb,var(--wb-accent) 16%,var(--wb-input) 84%)}
      #${POPUP_ID} .wb-pet-status-stage{font-size:14px;background:color-mix(in srgb,var(--wb-soft) 82%,#fff 18%)}
      #${POPUP_ID} .wb-pet-status-place{display:flex;align-items:center;gap:5px;flex-shrink:0}
      #${POPUP_ID} .wb-pet-status-place i{display:inline-flex;align-items:center;min-height:19px;padding:2px 6px;border:1px solid color-mix(in srgb,var(--wb-accent) 55%,var(--wb-border) 45%);background:color-mix(in srgb,var(--wb-panel) 74%,transparent);color:var(--wb-sub);font-style:normal;font-size:10px;line-height:1}
      #${POPUP_ID} .wb-pet-bars{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}#${POPUP_ID} .wb-pet-bars.egg{grid-template-columns:1fr}
      #${POPUP_ID} .wb-pet-bar{border:2px solid color-mix(in srgb,var(--wb-text) 65%,#000 35%);background:var(--wb-input);color:var(--wb-text);padding:5px;box-shadow:none!important;font-size:11px;font-weight:900}
      #${POPUP_ID} .wb-pet-bar span{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
      #${POPUP_ID} .wb-pet-bar b{font-size:12px;letter-spacing:.5px}
      #${POPUP_ID} .wb-pet-bar em{font-style:normal;color:var(--wb-accent);font-size:10px}
      #${POPUP_ID} .wb-pet-bar-track{height:10px;background:#2b2137;border:1px solid #2b2137;overflow:hidden}
      #${POPUP_ID} .wb-pet-bar-fill{height:100%;width:var(--v);background:linear-gradient(90deg,var(--c),#fff39d)}
      #${POPUP_ID} .wb-pet-stage{position:relative;min-height:0;display:grid;place-items:center;justify-self:center;width:100%;max-width:100%;overflow:visible;grid-template-columns:1fr;margin-top:-4px}
      #${POPUP_ID} .wb-pet-scene{width:min(100%,54dvh,520px);height:auto;aspect-ratio:1/1;min-height:0;border:3px solid color-mix(in srgb,var(--wb-text) 65%,#000 35%);box-shadow:none!important;background-size:cover;background-position:center;image-rendering:pixelated}
      #${POPUP_ID} .wb-pet-scene-title{position:absolute;right:8px;bottom:8px;z-index:3;padding:4px 10px;border:2px solid color-mix(in srgb,var(--wb-text) 65%,#000 35%);background:var(--wb-panel);color:var(--wb-text);box-shadow:none!important;font-size:12px;font-weight:900}
      #${POPUP_ID} .wb-pet-scene-drawer{position:absolute;left:0;bottom:12px;z-index:7;display:grid;justify-items:start;gap:5px}#${POPUP_ID} .wb-pet-scene-toggle{width:16px;height:58px;padding:1px!important;background:var(--wb-soft)!important;color:var(--wb-text)!important;border-color:transparent!important;font-size:9px;letter-spacing:0}#${POPUP_ID} .wb-pet-scene-toggle .wb-pet-svg{display:none}#${POPUP_ID} .wb-pet-scene-toggle-text{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;line-height:1}#${POPUP_ID} .wb-pet-scene-menu{display:none;position:absolute;left:20px;bottom:0;grid-template-columns:repeat(3,42px);gap:5px;padding:5px;border:2px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%);background:var(--wb-panel);box-shadow:none!important}#${POPUP_ID} .wb-pet-scene-drawer.open .wb-pet-scene-menu{display:grid}#${POPUP_ID} .wb-pet-scene-choice{width:42px;height:42px;padding:2px!important;display:grid;gap:1px;place-items:center;font-size:8px;background:var(--wb-soft)!important;color:var(--wb-text)!important}#${POPUP_ID} .wb-pet-scene-thumb{width:33px;height:19px;border:1px solid var(--wb-border);background-size:cover;background-position:center;image-rendering:pixelated}#${POPUP_ID} .wb-pet-scene-choice.locked{position:relative;overflow:hidden}#${POPUP_ID} .wb-pet-scene-choice.locked::before{content:'';position:absolute;inset:0;background:rgba(255,255,255,.62);z-index:2;pointer-events:none}#${POPUP_ID} .wb-pet-scene-choice.locked::after{content:'🔒';position:absolute;inset:0;display:grid;place-items:center;z-index:3;font-size:16px;color:#2b2137;pointer-events:none}
      #${POPUP_ID} .wb-pet-room-fox{top:43%;width:clamp(124px,20dvh,158px);min-width:124px;filter:drop-shadow(0 12px 0 rgba(0,0,0,.2));image-rendering:pixelated;border:0!important;box-shadow:none!important;outline:0!important;background:transparent!important}#${POPUP_ID} #wb-pet-poke{border:0!important;box-shadow:none!important;outline:0!important;background:transparent!important}#${POPUP_ID} #wb-pet-poke .wb-pet-egg-img{width:100%;height:100%;object-fit:contain;transform-origin:50% 78%;}#${POPUP_ID} #wb-pet-poke.egg-shake .wb-pet-egg-img{animation:wbPetEggShake .34s steps(2,end)}@keyframes wbPetEggShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-.7px)}50%{transform:translateX(.7px)}75%{transform:translateX(-.4px)}}#${POPUP_ID} #wb-pet-poke,#${POPUP_ID} #wb-pet-poke:hover,#${POPUP_ID} #wb-pet-poke:active{transform:translate(-50%,-50%)!important;filter:none!important;box-shadow:none!important}
      #${POPUP_ID} .wb-pet-fox,.wb-pet-asset{image-rendering:pixelated}#${POPUP_ID} .wb-pet-fox,.wb-modal-mask .wb-pet-snapshot .wb-pet-fox{background-size:400% 100%!important;background-position:0 0}.wb-pet-fox.animating,#${POPUP_ID} .wb-pet-fox.animating{animation:wbPetFoxFrames 2s steps(1,end) 1}
      #${POPUP_ID} .wb-pet-speech{left:12px;top:14px;transform:none;max-width:min(64%,420px);padding:5px 8px;border:1px solid #000;border-radius:12px;background:#fff;color:#2b2137;box-shadow:0 3px 0 rgba(0,0,0,.14);text-align:left;font-size:11px;font-weight:900;line-height:1.22;image-rendering:pixelated}
      #${POPUP_ID} .wb-pet-speech:before{content:'';position:absolute;right:20px;bottom:-10px;border-width:10px 8px 0 8px;border-style:solid;border-color:#000 transparent transparent transparent}#${POPUP_ID} .wb-pet-speech:after{content:'';position:absolute;right:21px;bottom:-9px;border-width:9px 7px 0 7px;border-style:solid;border-color:#fff transparent transparent transparent}
      #${POPUP_ID} .wb-pet-speech{border-color:#000!important;box-shadow:0 3px 0 rgba(0,0,0,.14)!important}#${POPUP_ID} .wb-pet-speech:before{border-color:#000 transparent transparent transparent!important}#${POPUP_ID} .wb-pet-speech:after{border-color:#fff transparent transparent transparent!important}
      #${POPUP_ID} .wb-pet-scene-actions{position:absolute;right:18px;top:12px;z-index:5;display:grid;gap:5px}
      #${POPUP_ID} .wb-pet-scene-actions .wb-pet-iconbtn{width:34px;height:34px;min-width:34px;padding:0!important;border-radius:999px!important;background:var(--wb-soft)!important;color:var(--wb-text)!important;border-color:var(--wb-text)!important;font-size:16px;display:grid!important;place-items:center!important;box-shadow:2px 2px 0 color-mix(in srgb,var(--wb-text) 55%,#000 45%)!important}#${POPUP_ID} .wb-pet-scene-actions .wb-pet-iconbtn:hover{transform:translate(-1px,-1px);filter:none}#${POPUP_ID} .wb-pet-scene-actions .wb-pet-svg{width:18px;height:18px;stroke-width:1.8}
      #${POPUP_ID} .wb-pet-dialogue{height:68px;min-height:68px;max-height:68px;border:3px solid color-mix(in srgb,var(--wb-accent) 46%,var(--wb-border) 54%);background:var(--wb-soft);color:var(--wb-text);box-shadow:0 5px 0 #120b18;padding:16px 12px 8px;position:relative;overflow:visible;display:grid;grid-template-rows:1fr}
      #${POPUP_ID} .wb-pet-dialogue-name,.wb-pet-rpg-speaker{display:inline-flex;align-items:center;padding:4px 9px;border-radius:4px;border:2px solid #2b2137;background:#ff7d7d;color:#fff;box-shadow:0 2px 0 #211629;font-weight:900}
      #${POPUP_ID} .wb-pet-dialogue-name{position:absolute;left:12px;top:-18px;line-height:1.15;z-index:4;min-height:24px}
      #${POPUP_ID} .wb-pet-dialogue-text{margin-top:2px;font-size:13px;line-height:1.45;font-weight:800;max-height:38px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      #${POPUP_ID} .wb-pet-dialogue-text em,.wb-modal-mask .wb-pet-rpg-text em,.wb-modal-mask .wb-pet-story-body .narrator em{font-style:italic;font-weight:inherit;opacity:.92}
      #${POPUP_ID} .wb-pet-dialogue-actions{display:none}
      #${POPUP_ID} .wb-pet-story-status{min-height:30px;display:grid;place-items:center;font-size:15px;font-weight:1000;letter-spacing:2px;color:var(--wb-accent)}
      #${POPUP_ID} .wb-pet-room.story-mode{cursor:pointer}#${POPUP_ID} .wb-pet-story-exit{position:absolute;right:12px;top:12px;z-index:8;width:auto!important;min-width:0!important;height:30px!important;padding:0 9px!important;border-radius:999px!important;border-color:color-mix(in srgb,var(--wb-text) 65%,#000 35%)!important;background:var(--wb-soft)!important;color:var(--wb-text)!important;font-size:11px!important}#${POPUP_ID} .wb-pet-room.story-mode .wb-pet-dialogue{cursor:pointer}#${POPUP_ID} .wb-pet-room.story-mode .wb-pet-dialogue-text{display:block;-webkit-line-clamp:unset;-webkit-box-orient:initial;overflow:hidden;word-break:break-all;overflow-wrap:anywhere}
      #${POPUP_ID} .wb-pet-story-done{font-size:11px!important;text-align:center;color:var(--wb-sub)!important;align-self:center}
      #${POPUP_ID} .wb-pet-npc-portrait{animation:wbPetNpcFade .28s steps(4,end) both}@keyframes wbPetNpcFade{from{opacity:0;transform:translate(-50%,-50%) translateY(6px)}to{opacity:1;transform:translate(-50%,-50%) translateY(0)}}

      #${POPUP_ID} .wb-pet-card-btn{width:24px!important;min-width:24px!important;height:22px!important;margin-left:4px;padding:0!important;background:transparent!important;border-color:transparent!important;color:var(--wb-accent)!important;vertical-align:middle}.wb-modal-mask#wb-pet-profile-mask .wb-pet-modal{width:min(94vw,540px)!important;max-width:540px!important;overflow:visible!important}.wb-modal-mask .wb-pet-profile-card{box-sizing:border-box;position:relative;width:100%;max-width:100%;padding:18px 18px 16px;border:3px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%);background:linear-gradient(135deg,#fffdf7,#f4fbff 58%,#fff4e8);color:#2f3b46;box-shadow:0 0 0 4px rgba(255,255,255,.55) inset;overflow:hidden}.wb-modal-mask .wb-pet-profile-card::before{content:'';position:absolute;left:-20%;right:-20%;top:0;height:9px;background:repeating-linear-gradient(90deg,#ffd7e2 0 28px,#dff3ff 28px 56px,#e4f5d8 56px 84px,#fff0bd 84px 112px)}.wb-modal-mask .wb-pet-profile-top{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;margin-bottom:12px}.wb-modal-mask .wb-pet-profile-photo{position:relative;width:96px;height:72px;border:2px solid #2f3b46;background:#fffdf7;overflow:hidden;display:grid;place-items:center}.wb-modal-mask .wb-pet-profile-photo .wb-pet-asset,.wb-modal-mask .wb-pet-profile-photo .wb-pet-egg-img{width:58px;height:58px;object-fit:contain}.wb-modal-mask .wb-pet-profile-photo .wb-pet-fox{width:62px;height:62px;background-image:var(--wb-pet-sprite);background-size:400% 100%;background-repeat:no-repeat;background-position:0 0;animation:none!important}.wb-modal-mask .wb-pet-profile-seal{width:58px;height:58px;border:2px solid #2f3b46;border-radius:14px;background:#fff7d8;display:grid;place-items:center;font-size:26px;font-weight:1000;color:#c28a2d}.wb-modal-mask .wb-pet-profile-title{display:grid;gap:2px}.wb-modal-mask .wb-pet-profile-title b{font-size:22px;color:#be6a55;letter-spacing:1px}.wb-modal-mask .wb-pet-profile-title span{font-size:12px;color:#657489;font-weight:900}.wb-modal-mask .wb-pet-profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.wb-modal-mask .wb-pet-profile-item{padding:8px 10px;border:1px solid rgba(80,98,112,.22);background:rgba(255,255,255,.62);border-radius:12px;min-width:0}.wb-modal-mask .wb-pet-profile-item.wide{grid-column:1/-1}.wb-modal-mask .wb-pet-profile-item em{display:block;font-style:normal;font-size:11px;font-weight:1000;color:#7d8da0;margin-bottom:2px}.wb-modal-mask .wb-pet-profile-item strong{display:block;font-size:15px;color:#30404b;line-height:1.35;overflow-wrap:anywhere}.wb-modal-mask .wb-pet-profile-num{font-size:20px;color:#d56a52;font-weight:1000}.wb-modal-mask .wb-pet-profile-lock{letter-spacing:2px;color:#a8a2a0!important}.wb-modal-mask .wb-pet-profile-actions{display:flex;justify-content:flex-end;margin-top:14px}
      .wb-modal-mask .wb-pet-story-choice{width:min(90vw,440px)!important;max-width:440px!important}.wb-modal-mask .wb-pet-story-choice-title{font-size:14px;color:var(--wb-sub);font-weight:900;text-align:center}.wb-modal-mask .wb-pet-story-choice-name{margin:8px 0 10px;text-align:center;font-size:24px;line-height:1.25;color:var(--wb-accent);font-weight:1000}.wb-modal-mask .wb-pet-story-choice-summary{padding:10px 12px;border:2px solid color-mix(in srgb,var(--wb-accent) 34%,var(--wb-border) 66%);background:var(--wb-soft);color:var(--wb-text);line-height:1.55;font-weight:800}
      .wb-modal-mask .wb-pet-modal:not(.wb-mini-modal){width:min(96vw,980px)!important;max-width:980px!important;height:min(92dvh,760px);max-height:92dvh;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}.wb-modal-mask#wb-pet-log-mask,.wb-modal-mask#wb-pet-records-mask,.wb-modal-mask#wb-pet-caretaker-mask,.wb-modal-mask#wb-pet-char-picker-mask,.wb-modal-mask#wb-pet-adoption-mask{overflow:hidden!important;padding:0!important}.wb-modal-mask#wb-pet-log-mask .wb-pet-modal,.wb-modal-mask#wb-pet-records-mask .wb-pet-modal,.wb-modal-mask#wb-pet-caretaker-mask .wb-pet-modal,.wb-modal-mask#wb-pet-char-picker-mask .wb-pet-modal,.wb-modal-mask#wb-pet-adoption-mask .wb-pet-modal{width:calc(100vw - 12px)!important;max-width:calc(100vw - 12px)!important;height:calc(100dvh - 12px)!important;max-height:calc(100dvh - 12px)!important;border:3px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%)!important;box-sizing:border-box}
      .wb-modal-mask .wb-mini-modal{width:min(92vw,420px)!important;max-width:420px!important;height:auto;max-height:72dvh}
      .wb-modal-mask .wb-pet-modal{border:3px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%)!important;background:linear-gradient(180deg,var(--wb-panel),var(--wb-bg))!important;color:var(--wb-text)!important;box-shadow:0 8px 0 rgba(0,0,0,.5),0 0 0 4px var(--wb-glow)!important;padding:0!important}.wb-modal-mask.wb-arcade .wb-pet-modal{padding-top:0!important;overflow:hidden!important}
      .wb-modal-mask .wb-pet-modal-head{position:sticky;top:0;z-index:3;display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:10px 14px;border-bottom:3px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%);background:linear-gradient(180deg,var(--wb-accent),var(--wb-accent2));color:var(--wb-on-accent)}
      .wb-modal-mask .wb-pet-modal-title{flex:1;text-align:center;font-weight:1000;letter-spacing:1px}
      .wb-modal-mask .wb-pet-scroll{min-height:0;overflow:auto;padding:4px}
      .wb-modal-mask .wb-pet-card-list{display:grid;gap:16px}
      .wb-modal-mask .wb-pet-caretaker-card,.wb-modal-mask .wb-pet-record-entry{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:16px;padding:12px;border:2px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%);background:var(--wb-panel);box-shadow:3px 3px 0 color-mix(in srgb,var(--wb-text) 54%,#000 46%);color:var(--wb-text)}
      .wb-modal-mask .wb-pet-avatar{width:48px;height:48px;border:2px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%);background:var(--wb-input);display:grid;place-items:center;font-weight:1000;color:var(--wb-text)}
      .wb-modal-mask .wb-pet-help-mark{width:38px;min-width:38px;height:36px;display:grid;place-items:center;background:transparent!important;border:0!important;box-shadow:none!important;color:var(--wb-on-accent)!important;font-weight:1000}
      .wb-modal-mask .wb-pet-stage-tip{margin:8px 0 16px;color:var(--wb-text)}
      .wb-modal-mask .wb-pet-stage-tip-title{margin:0 0 7px;text-align:center;color:#be6a55;font-size:16px;font-weight:1000;letter-spacing:1px}
      .wb-modal-mask .wb-pet-stage-tip-box{position:relative;padding:13px 16px;border:1px solid rgba(190,106,85,.38);border-radius:14px;background:linear-gradient(135deg,rgba(255,244,226,.96),rgba(255,253,247,.78));color:#8a6046;font-size:14px;line-height:1.65;font-weight:900;text-align:center;box-shadow:0 4px 14px rgba(120,82,45,.08)}
      .wb-modal-mask .wb-pet-stage-tip-box:before,.wb-modal-mask .wb-pet-stage-tip-box:after{content:'';position:absolute;left:18px;right:18px;height:1px;background:linear-gradient(90deg,transparent,rgba(190,106,85,.42),transparent)}
      .wb-modal-mask .wb-pet-stage-tip-box:before{top:6px}.wb-modal-mask .wb-pet-stage-tip-box:after{bottom:6px}
      .wb-modal-mask .wb-pet-adopt-success-modal{width:min(92vw,520px)!important;max-width:520px!important}.wb-modal-mask .wb-pet-adopt-success-modal .wb-pet-scroll{padding:12px 14px}.wb-modal-mask .wb-pet-adopt-success-card{box-shadow:none!important}
      .wb-modal-mask .wb-pet-avatar img{width:100%;height:100%;object-fit:cover;display:block}.wb-modal-mask .wb-pet-full-caretaker{grid-template-columns:48px 72px minmax(0,1fr)!important;text-align:left}.wb-modal-mask .wb-pet-char-pick{grid-template-columns:48px minmax(0,1fr)!important;text-align:left}.wb-modal-mask .wb-pet-full-caretaker .wb-pet-snapshot{width:72px;height:52px}.wb-modal-mask .wb-pet-full-caretaker > div:last-child{min-width:0;overflow:hidden}.wb-modal-mask .wb-pet-adopt-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:start}.wb-modal-mask .wb-pet-adopt-wide{grid-column:1/-1}.wb-modal-mask .wb-pet-egg-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:6px}.wb-modal-mask .wb-pet-egg-choice{min-height:66px;padding:5px!important;display:grid!important;place-items:center;gap:3px}.wb-modal-mask .wb-pet-egg-choice img{width:32px;height:32px;object-fit:contain;image-rendering:pixelated}.wb-modal-mask .wb-pet-egg-choice span{font-size:10px}.wb-modal-mask .wb-pet-egg-choice.selected{outline:3px solid var(--wb-accent);outline-offset:2px}.wb-modal-mask .wb-pet-empty-stage{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:10px 14px;border:2px dashed color-mix(in srgb,var(--wb-text) 55%,transparent);background:color-mix(in srgb,var(--wb-panel) 78%,transparent);font-size:12px;font-weight:900;color:var(--wb-text)}#${POPUP_ID} .wb-pet-new-adoption{min-height:42px;width:100%;font-size:15px}#${POPUP_ID} .wb-pet-test-select .wb-pet-egg-grid,#${POPUP_ID} .wb-pet-test-select .wb-pet-species-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}#${POPUP_ID} .wb-pet-test-select .wb-pet-egg-choice{min-height:74px;padding:6px;display:grid;place-items:center;gap:4px}#${POPUP_ID} .wb-pet-test-select .wb-pet-egg-choice img{width:38px;height:38px;object-fit:contain;image-rendering:pixelated}#${POPUP_ID} .wb-pet-test-select .selected{outline:3px solid var(--wb-accent);outline-offset:2px}
      .wb-modal-mask .wb-pet-note-page{position:relative;background:radial-gradient(circle at 18px 18px,rgba(112,151,170,.10) 0 2px,transparent 3px),repeating-linear-gradient(to bottom,#fffdf5 0,#fffdf5 31px,rgba(139,177,190,.26) 32px),#fffdf5;color:#31404a;border:2px solid #d7bd83;box-shadow:0 8px 0 #947247,0 18px 42px rgba(68,43,18,.18);padding:20px 24px 24px;line-height:1.8;overflow:hidden}.wb-modal-mask .wb-pet-note-page::before{content:none}.wb-modal-mask .wb-pet-note-page::after{content:'';position:absolute;left:0;right:0;top:0;height:8px;background:repeating-linear-gradient(90deg,rgba(155,199,239,.72) 0 14px,rgba(246,223,159,.72) 14px 28px,rgba(152,214,197,.72) 28px 42px);opacity:.55}
      .wb-modal-mask .wb-pet-diary-cover{position:relative;margin:4px 0 14px 42px;padding:14px 16px 12px;border:1px solid rgba(183,147,88,.5);border-radius:16px;background:linear-gradient(135deg,rgba(255,247,217,.92),rgba(255,255,255,.58));box-shadow:0 6px 18px rgba(122,88,35,.12)}.wb-modal-mask .wb-pet-diary-kicker{font-size:11px;letter-spacing:2px;color:#b17b54;font-weight:900;text-align:center}.wb-modal-mask .wb-pet-diary-meta{display:flex;align-items:center;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:8px}.wb-modal-mask .wb-pet-diary-meta span{display:inline-flex;align-items:baseline;gap:5px;padding:2px 4px;color:#8d7252;font-size:12px;white-space:nowrap}.wb-modal-mask .wb-pet-diary-meta b{min-width:54px;padding:0 8px 1px;border-bottom:2px solid #c8b17f;font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive;font-size:16px;font-weight:500;color:#30404b;text-align:center}.wb-modal-mask .wb-pet-note-tags{display:flex;gap:7px;flex-wrap:wrap;justify-content:center;margin:0 0 12px 42px}.wb-modal-mask .wb-pet-note-tag{padding:3px 8px;border:1.5px solid #9bc7ef;background:rgba(236,247,255,.72);color:#3f7fb5;border-radius:4px;font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive;font-size:15px;line-height:1.15;transform:rotate(-.5deg)}.wb-modal-mask .wb-pet-diary-two{display:grid;gap:8px;margin:0 0 14px 42px}.wb-modal-mask .wb-pet-diary-two div{display:grid;grid-template-columns:96px 1fr;gap:8px;align-items:start;padding:7px 9px;border-radius:12px;background:rgba(255,250,230,.64);border:1px dashed #d8bf87}.wb-modal-mask .wb-pet-diary-two em{font-style:normal;color:#d56a52;font-weight:900}.wb-modal-mask .wb-pet-diary-two span{font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive;font-size:16px;color:#30404b;white-space:normal;overflow-wrap:anywhere;word-break:break-all;line-break:anywhere}.wb-modal-mask .wb-pet-diary-title{margin:8px 0 12px 42px;text-align:center;font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive;font-size:31px;line-height:1.25;color:#cf604e;text-shadow:0 2px 0 rgba(255,255,255,.8)}.wb-modal-mask .wb-pet-diary-body{margin-left:42px;background:transparent;padding-top:1px}.wb-modal-mask .wb-pet-diary-body p{min-height:33px;margin:0 0 7px;font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive;font-size:18px;line-height:33px;letter-spacing:.3px;text-indent:2em}.wb-modal-mask .wb-pet-note-title{font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive;font-size:26px;text-align:center;color:#d56a52;font-weight:900}
      .wb-modal-mask .wb-pet-note-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:8px 0 14px 42px}.wb-modal-mask .wb-pet-note-line{border-bottom:1px solid #b7d7dc;min-height:24px;font-family:'Comic Sans MS','KaiTi',cursive}.wb-modal-mask#wb-pet-log-mask .wb-pet-scroll{display:grid;gap:10px}.wb-modal-mask#wb-pet-log-mask .wb-field{margin:0;padding:10px;border:1px solid rgba(214,189,134,.65);border-radius:14px;background:rgba(255,253,245,.78);box-shadow:0 4px 14px rgba(122,88,35,.08)}.wb-modal-mask#wb-pet-log-mask .wb-field span{font-weight:900;color:#9f724c}.wb-modal-mask#wb-pet-log-mask .wb-select,.wb-modal-mask#wb-pet-log-mask .wb-textarea{border-radius:12px;background:#fffdf7}.wb-modal-mask#wb-pet-log-mask #wb-pet-log-generate{min-height:40px;border-radius:0!important;background:var(--wb-accent)!important;color:var(--wb-on-accent,#fff)!important}.wb-modal-mask#wb-pet-log-mask #wb-pet-log-preview:empty{display:none}

      .wb-modal-mask .wb-pet-diary-page{padding:18px 20px 22px}.wb-modal-mask .wb-pet-diary-cover{overflow:hidden;border:1px solid rgba(201,154,87,.58);background:linear-gradient(135deg,rgba(255,246,212,.96),rgba(255,255,255,.72));}.wb-modal-mask .wb-pet-diary-cover::before{content:'';position:absolute;left:-12%;right:-12%;top:0;height:7px;background:repeating-linear-gradient(90deg,#f0a66e 0 28px,#f7d889 28px 56px,#9bd9c8 56px 84px,#a9bfea 84px 112px)}.wb-modal-mask .wb-pet-diary-kicker{display:none}.wb-modal-mask .wb-pet-diary-meta{display:flex;align-items:center;justify-content:center;gap:22px;flex-wrap:nowrap;margin-top:8px}.wb-modal-mask .wb-pet-diary-meta span{white-space:nowrap}.wb-modal-mask .wb-pet-rpg-speaker{border-radius:999px;border:1px solid rgba(60,48,40,.22);box-shadow:0 2px 0 rgba(70,50,35,.14);color:#4a3b37}.wb-modal-mask .speaker-u .wb-pet-rpg-speaker{background:#dce9ff;color:#385783}.wb-modal-mask .speaker-c .wb-pet-rpg-speaker{background:#ffe1e8;color:#8b4258}.wb-modal-mask .speaker-p .wb-pet-rpg-speaker{background:#dcf4e7;color:#3f765b}.wb-modal-mask .speaker-shen .wb-pet-rpg-speaker{background:#eee3ff;color:#654f93}.wb-modal-mask .wb-pet-rpg-line.speaker-narrator{font-style:italic;color:#68798b;background:rgba(255,255,255,.38);border-color:rgba(150,170,190,.28)}#${POPUP_ID} .wb-pet-dialogue-text.narrator{font-style:italic;color:color-mix(in srgb,var(--wb-text) 76%,var(--wb-sub) 24%)}#${POPUP_ID} .wb-pet-dialogue-name.speaker-u{background:#dce9ff;color:#385783}#${POPUP_ID} .wb-pet-dialogue-name.speaker-c{background:#ffe1e8;color:#8b4258}#${POPUP_ID} .wb-pet-dialogue-name.speaker-p{background:#dcf4e7;color:#3f765b}#${POPUP_ID} .wb-pet-dialogue-name.speaker-shen{background:#eee3ff;color:#654f93}
      .wb-modal-mask .wb-pet-modal .wb-actions{gap:14px;margin:14px 0}.wb-modal-mask .wb-pet-record-home{min-height:52px}.wb-modal-mask .wb-pet-snapshot{position:relative;width:72px;height:58px;overflow:hidden;border:2px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%);background-size:cover;background-position:center;box-shadow:none!important;image-rendering:pixelated}.wb-modal-mask .wb-pet-snapshot .wb-pet-asset,.wb-modal-mask .wb-pet-snapshot .wb-pet-egg-img{position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%);object-fit:contain}.wb-modal-mask .wb-pet-snapshot .wb-pet-fox{position:absolute;left:50%;top:50%;width:46px;height:46px;transform:translate(-50%,-50%);background-image:var(--wb-pet-sprite);background-size:400% 100%;background-repeat:no-repeat;animation:none!important;background-position:0 0!important}.wb-modal-mask .wb-pet-snapshot-label{position:absolute;left:2px;bottom:2px;min-width:16px;padding:1px 4px;background:rgba(255,253,240,.9);border:1px solid rgba(43,33,55,.72);color:#2b2137;font-size:10px;font-weight:1000;line-height:1}
      .wb-modal-mask .wb-pet-modal button{box-shadow:1px 1px 0 color-mix(in srgb,var(--wb-text) 50%,#000 50%)!important}.wb-modal-mask .wb-pet-modal button:hover{box-shadow:2px 2px 0 color-mix(in srgb,var(--wb-text) 50%,#000 50%)!important}.wb-modal-mask .wb-pet-diary-page{box-sizing:border-box;background:radial-gradient(circle at 18px 18px,rgba(112,151,170,.10) 0 2px,transparent 3px),repeating-linear-gradient(to bottom,#fffdf5 0,#fffdf5 31px,rgba(139,177,190,.26) 32px),#fffdf5!important}.wb-modal-mask .wb-pet-diary-body p{text-decoration:none!important;border-bottom:0!important}.wb-modal-mask .wb-pet-story-page{position:relative;padding:22px 26px 26px;border:2px solid #b7c7d8;background:linear-gradient(180deg,#fbfdff,#f5f9ff 46%,#fffdf7);color:#2f3b46;box-shadow:0 8px 0 #7d91aa,0 18px 42px rgba(38,54,75,.16);font-family:'Microsoft YaHei','PingFang SC',system-ui,sans-serif;line-height:1.82}.wb-modal-mask .wb-pet-story-page *{font-family:inherit}.wb-modal-mask .wb-pet-story-head{display:grid;grid-template-columns:1fr;align-items:center;justify-items:center;gap:12px;margin-bottom:14px;padding:12px 14px;border:1px solid rgba(125,145,170,.36);border-radius:16px;background:linear-gradient(135deg,rgba(229,242,255,.96),rgba(255,255,255,.82))}.wb-modal-mask .wb-pet-story-type{display:inline-grid;grid-auto-flow:column;align-items:center;justify-content:center;place-items:center;gap:7px;min-height:34px;padding:0 14px;border-radius:999px;background:#dbeafe;color:#41658f;font-size:15px;font-weight:1000;letter-spacing:1px}.wb-modal-mask .wb-pet-story-replay{width:28px!important;min-width:28px!important;height:28px!important;padding:0!important;border-color:transparent!important;background:transparent!important;color:#41658f!important}.wb-modal-mask .wb-pet-story-replay .wb-pet-svg{width:18px;height:18px;stroke-width:1.6!important}.wb-modal-mask .wb-pet-story-meta{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;color:#657489;font-size:13px;font-weight:900}.wb-modal-mask .wb-pet-story-meta b{color:#31465d;font-weight:900}.wb-modal-mask .wb-pet-story-title{margin:6px 0 10px;text-align:center;color:#be6a55;font-size:28px;line-height:1.3;font-weight:1000}.wb-modal-mask .wb-pet-story-summary{margin:0 auto 18px;padding:10px 14px;max-width:680px;border:1px solid rgba(190,106,85,.24);border-radius:14px;background:linear-gradient(135deg,rgba(255,244,226,.95),rgba(255,250,242,.72));color:#9b6a49;text-align:center;font-weight:850;box-shadow:0 4px 14px rgba(120,82,45,.08)}.wb-modal-mask .wb-pet-story-lines{display:grid;gap:8px}.wb-modal-mask .wb-pet-story-body .narrator{color:#6b7c93;font-style:italic;margin:0 0 8px 42px}.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-line{margin:0 0 8px 42px;padding:8px 10px;border:1px solid rgba(132,148,168,.24);border-radius:12px;background:rgba(255,255,255,.58);line-height:1.85}.wb-modal-mask .wb-pet-rpg-line .wb-pet-rpg-text{display:inline}.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-speaker{margin:0 7px 0 0;vertical-align:baseline;color:#4a3b37!important;font-weight:1000}.wb-modal-mask .speaker-u .wb-pet-rpg-speaker,.wb-modal-mask .speaker-c .wb-pet-rpg-speaker,.wb-modal-mask .speaker-p .wb-pet-rpg-speaker,.wb-modal-mask .speaker-shen .wb-pet-rpg-speaker{color:#4a3b37!important}.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-line,.wb-modal-mask#wb-pet-story-player .wb-text-segments .wb-pet-rpg-line{background:#fffdf7!important;color:#2f3b46!important;border-color:#d7c7a8!important}.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-text,.wb-modal-mask#wb-pet-story-player .wb-text-segments .wb-pet-rpg-text{color:#2f3b46!important}.wb-modal-mask .wb-pet-story-body .narrator,.wb-modal-mask#wb-pet-story-player .wb-text-segments .speaker-narrator{background:#f7fbff!important;color:#607086!important;border-color:#cfdcea!important}

      .wb-modal-mask .wb-pet-record-entry{min-height:0}.wb-modal-mask#wb-pet-records-mask :is(#wb-pet-log-home,#wb-pet-log-list,#wb-pet-story-home,#wb-pet-story-list,#wb-pet-cal-home,#wb-pet-dex-home){width:max-content!important;min-width:96px!important;justify-self:center;align-self:center;margin:0 auto 8px!important;padding:7px 13px!important}.wb-modal-mask .wb-pet-record-entry.compact{grid-template-columns:auto 1fr;padding:8px 10px;gap:10px}.wb-modal-mask .wb-pet-record-main{display:grid;gap:3px;min-width:0}.wb-modal-mask .wb-pet-record-date{font-size:11px;color:var(--wb-sub);font-weight:500;line-height:1.2}.wb-modal-mask .wb-pet-record-title{font-size:12px;color:var(--wb-text);font-weight:500;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wb-modal-mask .wb-pet-record-story-tag{display:inline-flex;align-items:center;justify-content:center;margin-right:5px;padding:1px 5px;border:1px solid currentColor;border-radius:4px;background:#eef6ff;color:#41658f;font-size:10px;line-height:1.2;font-weight:800;vertical-align:1px}.wb-modal-mask .wb-pet-record-story-tag[data-type="支线"]{background:#fff4e8;color:#9b6a49}.wb-modal-mask .wb-pet-record-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}.wb-modal-mask .wb-pet-record-tag{display:inline-flex;align-items:center;min-height:18px;padding:1px 5px;border:1px solid color-mix(in srgb,var(--wb-accent) 36%,var(--wb-border) 64%);background:var(--wb-soft);color:var(--wb-text);font-size:10px;line-height:1;white-space:nowrap}.wb-modal-mask .wb-pet-cal-fixed{flex:0 0 auto;padding:0 12px 8px}.wb-modal-mask .wb-pet-cal-fixed .wb-actions{margin:8px 0}.wb-modal-mask .wb-pet-cal-scroll{min-height:0;overflow:auto}.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-text,.wb-modal-mask#wb-pet-story-player .wb-text-segments .wb-pet-rpg-text{word-break:break-all!important;overflow-wrap:anywhere!important}.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-line,.wb-modal-mask#wb-pet-story-player .wb-text-segments .wb-pet-rpg-line{word-break:break-all!important;overflow-wrap:anywhere!important}
      .wb-modal-mask .wb-pet-dex-modal .wb-pet-scroll{padding:8px 12px 16px;background:radial-gradient(circle at 14% 8%,rgba(255,255,255,.62),transparent 24%),linear-gradient(135deg,#e54343 0 18%,#fff9e8 18% 22%,#2f78c9 22% 100%)}.wb-modal-mask .wb-pet-dex-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 8px;padding:12px 14px;border:3px solid #22324d;border-radius:18px;background:linear-gradient(180deg,#fffdf4,#dff0ff);box-shadow:0 5px 0 #22324d;color:#22324d;overflow:hidden}.wb-modal-mask .wb-pet-dex-head::after{content:'';position:absolute;right:70px;top:-24px;width:72px;height:72px;border:8px solid rgba(47,120,201,.14);border-radius:999px}.wb-modal-mask .wb-pet-dex-head strong{display:block;font-size:22px;line-height:1;font-weight:1000;letter-spacing:2px}.wb-modal-mask .wb-pet-dex-head span{display:block;margin-top:3px;color:#5e728d;font-size:11px;font-weight:900}.wb-modal-mask .wb-pet-dex-head b{position:relative;z-index:1;min-width:74px;padding:8px 10px;border:2px solid #22324d;border-radius:999px;background:#ffde59;color:#22324d;text-align:center;font-size:19px;box-shadow:0 3px 0 rgba(34,50,77,.35)}.wb-modal-mask .wb-pet-dex-progress{height:16px;margin:0 0 12px;padding:3px;border:2px solid #22324d;border-radius:999px;background:#16243c;box-shadow:0 3px 0 rgba(0,0,0,.24);overflow:hidden}.wb-modal-mask .wb-pet-dex-progress span{display:block;width:var(--v);height:100%;border-radius:999px;background:linear-gradient(90deg,#7ce38b,#fff16a,#ff9b54);box-shadow:0 0 12px rgba(255,241,106,.7)}.wb-modal-mask .wb-pet-dex-grid{display:grid;grid-template-columns:repeat(6,minmax(108px,1fr));gap:10px}.wb-modal-mask .wb-pet-dex-card{position:relative;min-height:156px;padding:8px 7px 9px!important;border:3px solid #22324d!important;border-radius:18px!important;background:linear-gradient(180deg,#eef3f8,#cbd5df)!important;color:#22324d!important;box-shadow:0 5px 0 #22324d!important;overflow:hidden;display:grid!important;grid-template-rows:auto 1fr auto auto;gap:4px;place-items:center}.wb-modal-mask .wb-pet-dex-card::before{content:'';position:absolute;inset:8px;border-radius:14px;background:radial-gradient(circle at 50% 42%,rgba(255,255,255,.72) 0 28px,transparent 29px),linear-gradient(135deg,rgba(255,255,255,.28),transparent);pointer-events:none}.wb-modal-mask .wb-pet-dex-card.unlocked{background:linear-gradient(180deg,#fff8d9,#9ed9ff 55%,#7ad68a)!important}.wb-modal-mask .wb-pet-dex-card.unlocked:nth-child(4n+2){background:linear-gradient(180deg,#fff2d0,#ffc4d0 58%,#ffe26c)!important}.wb-modal-mask .wb-pet-dex-card.unlocked:nth-child(4n+3){background:linear-gradient(180deg,#e8fff6,#afe7ff 58%,#b9e887)!important}.wb-modal-mask .wb-pet-dex-card.unlocked:nth-child(4n+4){background:linear-gradient(180deg,#f3edff,#cbb7ff 58%,#86e0ff)!important}.wb-modal-mask .wb-pet-dex-no{position:relative;z-index:1;justify-self:start;padding:2px 7px;border:2px solid #22324d;border-radius:999px;background:#fffdf4;font-size:10px;font-weight:1000}.wb-modal-mask .wb-pet-dex-ball{position:absolute;right:7px;top:7px;width:22px;height:22px;border:2px solid #22324d;border-radius:999px;background:linear-gradient(#e64646 0 46%,#22324d 46% 56%,#fff 56%);z-index:1}.wb-modal-mask .wb-pet-dex-ball span{position:absolute;left:50%;top:50%;width:7px;height:7px;border:2px solid #22324d;border-radius:999px;background:#fff;transform:translate(-50%,-50%)}.wb-modal-mask .wb-pet-dex-art{position:relative;z-index:1;width:86px;height:76px;display:grid;place-items:center;margin-top:3px}.wb-modal-mask .wb-pet-dex-egg{width:62px;height:62px;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 7px 0 rgba(34,50,77,.22))}.wb-modal-mask .wb-pet-dex-fox{width:76px;height:76px;background-image:var(--wb-pet-sprite);background-size:400% 100%;background-repeat:no-repeat;background-position:0 0;image-rendering:pixelated;filter:drop-shadow(0 8px 0 rgba(34,50,77,.2))}.wb-modal-mask .wb-pet-dex-fox.animating{animation:wbPetFoxFrames 1.45s steps(1,end) 1}.wb-modal-mask .wb-pet-dex-shadow{width:76px;height:76px;background:#56616d!important;filter:drop-shadow(0 8px 0 rgba(34,50,77,.20));opacity:.74;-webkit-mask-image:var(--wb-pet-sprite);mask-image:var(--wb-pet-sprite);-webkit-mask-size:400% 100%;mask-size:400% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:0 0;mask-position:0 0}.wb-modal-mask .wb-pet-dex-shadow.egg{width:62px;height:62px;-webkit-mask-size:contain;mask-size:contain;-webkit-mask-position:center;mask-position:center}.wb-modal-mask .wb-pet-dex-shadow.baby{transform:scale(.88)}.wb-modal-mask .wb-pet-dex-shadow.adult{transform:scale(1.02)}.wb-modal-mask .wb-pet-dex-shadow.magic{transform:scale(1.08)}.wb-modal-mask .wb-pet-dex-card.locked img,.wb-modal-mask .wb-pet-dex-card.locked .wb-pet-dex-fox,.wb-modal-mask .wb-pet-dex-card.locked .wb-pet-dex-egg{display:none!important;background-image:none!important;visibility:hidden!important}.wb-modal-mask .wb-pet-dex-question{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:54px;font-weight:1000;text-shadow:0 3px 0 #22324d,0 0 12px rgba(34,50,77,.45)}.wb-modal-mask .wb-pet-dex-name{position:relative;z-index:1;font-size:15px;font-weight:1000;line-height:1}.wb-modal-mask .wb-pet-dex-form{position:relative;z-index:1;padding:2px 8px;border:1px solid rgba(34,50,77,.48);border-radius:999px;background:rgba(255,255,255,.68);font-size:10px;font-weight:900}.wb-modal-mask .wb-pet-dex-card.happy .wb-pet-dex-egg{animation:wbPetDexHappy .62s steps(2,end) 2}.wb-modal-mask .wb-pet-dex-card.happy{transform:translateY(-2px) rotate(-1deg)!important;filter:saturate(1.18)}@keyframes wbPetDexHappy{0%,100%{transform:translateY(0) scale(1)}35%{transform:translateY(-8px) scale(1.06)}70%{transform:translateY(1px) scale(.98)}}
      .wb-modal-mask .wb-pet-dex-modal .wb-pet-scroll{background:radial-gradient(circle at 14% 8%,color-mix(in srgb,var(--wb-glow) 78%,transparent),transparent 26%),linear-gradient(135deg,color-mix(in srgb,var(--wb-accent) 70%,var(--wb-bg) 30%) 0 18%,color-mix(in srgb,var(--wb-panel) 92%,var(--wb-soft) 8%) 18% 23%,color-mix(in srgb,var(--wb-accent2) 64%,var(--wb-bg) 36%) 23% 100%)!important}.wb-modal-mask .wb-pet-dex-head{border-color:color-mix(in srgb,var(--wb-text) 78%,#000 22%)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 90%,#fff 10%),color-mix(in srgb,var(--wb-soft) 72%,var(--wb-accent2) 28%))!important;color:var(--wb-text)!important;box-shadow:0 5px 0 color-mix(in srgb,var(--wb-text) 70%,#000 30%)!important}.wb-modal-mask .wb-pet-dex-head span{color:var(--wb-sub)!important}.wb-modal-mask .wb-pet-dex-head b{border-color:color-mix(in srgb,var(--wb-text) 78%,#000 22%)!important;background:color-mix(in srgb,var(--wb-gold,#ffde59) 78%,var(--wb-panel) 22%)!important;color:var(--wb-text)!important}.wb-modal-mask .wb-pet-dex-progress{border-color:color-mix(in srgb,var(--wb-text) 74%,#000 26%)!important;background:color-mix(in srgb,var(--wb-bg) 72%,#000 28%)!important}.wb-modal-mask .wb-pet-dex-progress span{background:linear-gradient(90deg,var(--wb-accent),var(--wb-gold,#fff16a),var(--wb-accent2))!important}.wb-modal-mask .wb-pet-dex-card{border-color:color-mix(in srgb,var(--wb-text) 76%,#000 24%)!important;background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 86%,var(--wb-bg) 14%),color-mix(in srgb,var(--wb-soft) 62%,var(--wb-bg) 38%))!important;color:var(--wb-text)!important;box-shadow:0 5px 0 color-mix(in srgb,var(--wb-text) 70%,#000 30%)!important}.wb-modal-mask .wb-pet-dex-card.unlocked{background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 78%,#fff 22%),color-mix(in srgb,var(--wb-accent2) 40%,var(--wb-soft) 60%) 58%,color-mix(in srgb,var(--wb-accent) 34%,var(--wb-panel) 66%))!important}.wb-modal-mask .wb-pet-dex-card.unlocked:nth-child(4n+2),.wb-modal-mask .wb-pet-dex-card.unlocked:nth-child(4n+3),.wb-modal-mask .wb-pet-dex-card.unlocked:nth-child(4n+4){background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 80%,#fff 20%),color-mix(in srgb,var(--wb-accent) 28%,var(--wb-soft) 72%) 58%,color-mix(in srgb,var(--wb-accent2) 34%,var(--wb-panel) 66%))!important}.wb-modal-mask .wb-pet-dex-card::before{background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--wb-panel) 76%,transparent) 0 28px,transparent 29px),linear-gradient(135deg,color-mix(in srgb,#fff 20%,transparent),transparent)!important}.wb-modal-mask .wb-pet-dex-no{border-color:color-mix(in srgb,var(--wb-text) 72%,#000 28%)!important;background:var(--wb-panel)!important;color:var(--wb-text)!important}.wb-modal-mask .wb-pet-dex-form{border-color:color-mix(in srgb,var(--wb-text) 42%,transparent)!important;background:color-mix(in srgb,var(--wb-panel) 72%,transparent)!important;color:var(--wb-text)!important}.wb-modal-mask .wb-pet-dex-shadow-sprite{opacity:.46;filter:grayscale(1) brightness(0) drop-shadow(1px 0 0 #b9c0c8) drop-shadow(-1px 0 0 #b9c0c8) drop-shadow(0 1px 0 #b9c0c8) drop-shadow(0 -1px 0 #b9c0c8)!important}.wb-modal-mask .wb-pet-dex-shadow-img{opacity:.42;filter:grayscale(1) brightness(0) drop-shadow(1px 0 0 #b9c0c8) drop-shadow(-1px 0 0 #b9c0c8) drop-shadow(0 1px 0 #b9c0c8) drop-shadow(0 -1px 0 #b9c0c8)!important}.wb-modal-mask .wb-pet-dex-egg-mini{position:absolute;right:7px;top:7px;z-index:1;max-width:42px;padding:2px 5px;border:1px solid color-mix(in srgb,var(--wb-text) 52%,transparent);border-radius:999px;background:color-mix(in srgb,var(--wb-panel) 78%,transparent);color:var(--wb-text);font-size:9px;font-weight:1000;line-height:1;white-space:nowrap}.wb-modal-mask .wb-pet-dex-card.locked .wb-pet-dex-art{opacity:.76}.wb-modal-mask .wb-pet-dex-card.locked .wb-pet-dex-name{color:var(--wb-sub)}.wb-modal-mask .wb-pet-dex-trinket,.wb-modal-mask .wb-pet-dex-trinket-mini{position:relative;z-index:1;display:grid;place-items:center;image-rendering:pixelated}.wb-modal-mask .wb-pet-dex-trinket{width:64px;height:64px;filter:drop-shadow(0 7px 0 rgba(0,0,0,.20))}.wb-modal-mask .wb-pet-dex-trinket-mini{position:absolute;right:7px;top:7px;width:24px;height:24px;border:2px solid color-mix(in srgb,var(--wb-text) 64%,#000 36%);border-radius:9px;background:linear-gradient(180deg,color-mix(in srgb,var(--wb-panel) 82%,#fff 18%),color-mix(in srgb,var(--wb-soft) 72%,var(--wb-accent2) 28%));box-shadow:0 2px 0 color-mix(in srgb,var(--wb-text) 54%,#000 46%),inset 0 0 0 1px rgba(255,255,255,.42)}.wb-modal-mask .wb-pet-dex-trinket i,.wb-modal-mask .wb-pet-dex-trinket-mini i{display:block;width:30px;height:30px;background:var(--wb-accent);clip-path:polygon(50% 0,61% 34%,98% 34%,68% 55%,80% 94%,50% 70%,20% 94%,32% 55%,2% 34%,39% 34%);box-shadow:0 0 0 3px color-mix(in srgb,var(--wb-panel) 78%,#fff 22%) inset}.wb-modal-mask .wb-pet-dex-trinket-mini i{width:14px;height:14px;box-shadow:0 0 0 2px rgba(255,255,255,.45) inset,0 1px 0 rgba(0,0,0,.16)}.wb-modal-mask .trinket-blue i{background:#64b5ff;clip-path:polygon(50% 4%,78% 22%,86% 58%,50% 96%,14% 58%,22% 22%)}.wb-modal-mask .trinket-purple i{background:#b790ff;clip-path:polygon(50% 2%,63% 34%,98% 34%,69% 55%,80% 96%,50% 73%,20% 96%,31% 55%,2% 34%,37% 34%)}.wb-modal-mask .trinket-pink i{background:#ff8fc2;clip-path:polygon(50% 88%,12% 50%,12% 24%,34% 12%,50% 28%,66% 12%,88% 24%,88% 50%)}.wb-modal-mask .trinket-green i{background:#72d978;clip-path:polygon(52% 4%,88% 22%,78% 62%,44% 96%,18% 70%,24% 30%)}.wb-modal-mask .trinket-gold i{background:#ffc94f;clip-path:polygon(50% 0,62% 28%,92% 18%,82% 52%,98% 80%,64% 76%,50% 100%,36% 76%,2% 80%,18% 52%,8% 18%,38% 28%)}.wb-modal-mask .trinket-white i{background:#dff6ff;clip-path:polygon(50% 2%,72% 18%,88% 42%,78% 78%,50% 98%,22% 78%,12% 42%,28% 18%)}.wb-modal-mask .trinket-rabbit i{background:#ffb6ca;clip-path:polygon(38% 18%,28% 0,20% 24%,31% 42%,22% 76%,50% 96%,78% 76%,69% 42%,80% 24%,72% 0,62% 18%,50% 14%)}.wb-modal-mask .trinket-fox i{background:#ff9a42;clip-path:polygon(50% 4%,94% 36%,78% 88%,50% 98%,22% 88%,6% 36%)}.wb-modal-mask .trinket-dog i{background:#d69b68;clip-path:polygon(14% 24%,36% 8%,50% 20%,64% 8%,86% 24%,78% 80%,50% 98%,22% 80%)}.wb-modal-mask .trinket-cat i{background:#7cc8ff;clip-path:polygon(16% 18%,38% 32%,50% 16%,62% 32%,84% 18%,76% 78%,50% 98%,24% 78%)}.wb-modal-mask .trinket-bird i{background:#81d884;clip-path:polygon(50% 4%,84% 35%,70% 92%,50% 76%,30% 92%,16% 35%)}.wb-modal-mask .trinket-bala i{background:#c59b72;clip-path:polygon(22% 20%,78% 20%,94% 52%,78% 84%,22% 84%,6% 52%)}.wb-modal-mask .wb-pet-dex-card.happy .wb-pet-dex-trinket{animation:wbPetDexHappy .62s steps(2,end) 2}.wb-modal-mask .wb-pet-dex-trinket-mini{width:32px;height:32px;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}.wb-modal-mask .wb-pet-dex-pixel-icon{width:28px;height:28px;display:block;image-rendering:pixelated;filter:drop-shadow(1px 2px 0 rgba(0,0,0,.18))}.wb-modal-mask .wb-pet-dex-card.happy .wb-pet-dex-trinket-mini{animation:wbPetDexHappy .62s steps(2,end) 2}
      .wb-pet-hatch-flash{position:fixed;inset:0;z-index:1000005;background:#fff;animation:wbPetHatchFlash .7s ease both;pointer-events:none}@keyframes wbPetHatchFlash{0%{opacity:0}28%{opacity:1}100%{opacity:0}}.wb-modal-mask .wb-pet-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.wb-modal-mask .wb-pet-day{min-height:42px;background:#fffdf0!important}.wb-modal-mask .wb-pet-day.hot1{background:#effcf4!important}.wb-modal-mask .wb-pet-day.hot2{background:#d8f7e3!important}.wb-modal-mask .wb-pet-day.hot3{background:#b6efcb!important}.wb-modal-mask .wb-pet-day.hot4{background:#78dc9c!important}.wb-modal-mask .wb-pet-day.hot5{background:#30bd69!important;color:#fff!important}
      @media (max-width:768px){.wb-modal-mask#wb-pet-profile-mask{overflow:hidden!important;padding:0!important}.wb-modal-mask#wb-pet-profile-mask .wb-pet-modal{width:calc(100vw - 18px)!important;max-width:calc(100vw - 18px)!important;height:auto!important;max-height:calc(100dvh - 18px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))!important;overflow:hidden!important}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-card{padding:12px 10px 10px;max-height:calc(100dvh - 28px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));overflow:hidden}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-card::before{height:6px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-top{grid-template-columns:1fr 76px;gap:7px;margin-bottom:8px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-title b{font-size:17px;line-height:1.1}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-title span{font-size:10px;line-height:1.2}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-photo{width:74px;height:54px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-photo .wb-pet-asset,.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-photo .wb-pet-egg-img{width:44px;height:44px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-photo .wb-pet-fox{width:48px;height:48px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-grid{grid-template-columns:1fr 1fr;gap:5px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-item{padding:5px 7px;border-radius:9px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-item em{font-size:9px;margin-bottom:1px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-item strong{font-size:12px;line-height:1.22}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-num{font-size:16px}.wb-modal-mask#wb-pet-profile-mask .wb-pet-profile-actions{margin-top:8px}.wb-modal-mask#wb-pet-profile-mask #wb-pet-profile-close{min-height:30px!important;padding:5px 12px!important;font-size:12px}.wb-modal-mask .wb-pet-note-page{box-sizing:border-box;width:100%;padding:12px 4px 14px;background:repeating-linear-gradient(to bottom,#fffdf5 0,#fffdf5 30px,rgba(139,177,190,.24) 31px),#fffdf5}.wb-modal-mask .wb-pet-note-page::before{content:none}.wb-modal-mask .wb-pet-diary-cover{margin-left:2px;margin-right:0;padding:8px 6px}.wb-modal-mask .wb-pet-diary-meta{display:grid;grid-template-columns:1fr;justify-content:stretch;gap:2px;flex-wrap:nowrap}.wb-modal-mask .wb-pet-diary-meta span{display:grid;grid-template-columns:58px minmax(0,1fr);align-items:end;gap:4px;font-size:10px;padding:0 2px;white-space:nowrap}.wb-modal-mask .wb-pet-diary-meta b{min-width:0;font-size:14px;padding:0 3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wb-modal-mask .wb-pet-note-tags,.wb-modal-mask .wb-pet-diary-two,.wb-modal-mask .wb-pet-diary-title,.wb-modal-mask .wb-pet-diary-body,.wb-modal-mask .wb-pet-note-meta{margin-left:2px}.wb-modal-mask .wb-pet-note-tags{gap:4px;margin-bottom:8px}.wb-modal-mask .wb-pet-note-tag{font-size:13px;padding:2px 6px}.wb-modal-mask .wb-pet-diary-two{gap:5px;margin-right:0;margin-bottom:9px;width:calc(100% - 2px);box-sizing:border-box}.wb-modal-mask .wb-pet-diary-two div{grid-template-columns:1fr;gap:2px;padding:5px 6px;box-sizing:border-box;min-width:0;overflow:hidden}.wb-modal-mask .wb-pet-diary-two em{font-size:13px;min-width:0}.wb-modal-mask .wb-pet-diary-two span{font-size:14px;line-height:1.45;min-width:0;white-space:normal;overflow-wrap:anywhere;word-break:break-all;line-break:anywhere}.wb-modal-mask .wb-pet-diary-title{font-size:23px;margin-top:5px;margin-bottom:8px}.wb-modal-mask .wb-pet-diary-body{background:transparent}.wb-modal-mask .wb-pet-diary-body p{font-size:16px;line-height:31px;min-height:31px;text-indent:2em;text-decoration:none!important;border:0!important}.wb-modal-mask .wb-pet-story-page{box-sizing:border-box;width:100%;max-width:100%;padding:14px 8px 16px;overflow:hidden}.wb-modal-mask .wb-pet-story-head{grid-template-columns:1fr;justify-items:center;gap:7px;padding:9px;box-sizing:border-box}.wb-modal-mask .wb-pet-story-meta{justify-content:center}.wb-modal-mask .wb-pet-story-title{font-size:23px}.wb-modal-mask .wb-pet-story-summary{padding:8px 9px;margin-bottom:12px;box-sizing:border-box;max-width:100%;overflow-wrap:anywhere}.wb-modal-mask .wb-pet-story-lines{min-width:0}.wb-modal-mask .wb-pet-story-body .narrator,.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-line{margin-left:0;margin-right:0;box-sizing:border-box;max-width:100%;min-width:0;overflow-wrap:anywhere;word-break:break-word}.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-line{padding:7px 8px}.wb-modal-mask .wb-pet-story-body .wb-pet-rpg-text{overflow-wrap:anywhere;word-break:break-word}.wb-modal-mask#wb-pet-records-mask :is(#wb-pet-log-home,#wb-pet-log-list,#wb-pet-story-home,#wb-pet-story-list,#wb-pet-cal-home,#wb-pet-dex-home){min-width:82px!important;padding:6px 10px!important;font-size:12px}.wb-modal-mask#wb-pet-records-mask .wb-pet-cal-fixed .wb-actions{gap:6px}.wb-modal-mask#wb-pet-log-mask .wb-pet-scroll{padding:6px 7px 10px!important;gap:7px}.wb-modal-mask#wb-pet-log-mask .wb-field{padding:8px}.wb-modal-mask#wb-pet-log-mask .wb-textarea{min-height:64px!important}.wb-modal-mask .wb-pet-dex-grid{grid-template-columns:repeat(3,minmax(92px,1fr));gap:8px}.wb-modal-mask .wb-pet-dex-card{min-height:140px}.wb-modal-mask .wb-pet-dex-head strong{font-size:18px}.wb-modal-mask .wb-pet-dex-head b{font-size:16px;min-width:62px}.wb-modal-mask .wb-pet-dex-art{width:74px;height:66px}.wb-modal-mask .wb-pet-dex-fox{width:66px;height:66px}.wb-modal-mask .wb-pet-dex-egg{width:54px;height:54px}#${POPUP_ID} .wb-pet-bars{grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}#${POPUP_ID} .wb-pet-bars.egg{grid-template-columns:1fr}#${POPUP_ID} .wb-pet-bar{font-size:9px;padding:4px}#${POPUP_ID} .wb-pet-stage{place-items:center}#${POPUP_ID} .wb-pet-stage{justify-self:center;width:100%;grid-template-columns:1fr;margin-top:-5px}#${POPUP_ID} .wb-pet-scene{width:min(82vw,49dvh,440px);height:auto;aspect-ratio:1/1;min-height:0;justify-self:center}#${POPUP_ID} .wb-pet-room-fox{top:43%;width:clamp(124px,20dvh,158px);min-width:124px}#${POPUP_ID} .wb-pet-scene-actions{right:14px;top:12px;gap:4px}#${POPUP_ID} .wb-pet-scene-actions .wb-pet-iconbtn{width:30px;min-width:30px;height:30px;border-radius:999px!important}#${POPUP_ID} .wb-pet-scene-actions .wb-pet-svg{width:16px;height:16px;stroke-width:1.8}#${POPUP_ID} .wb-pet-iconbtn{width:32px;min-width:32px;height:32px;padding:0!important;display:grid!important;place-items:center!important}.wb-modal-mask .wb-pet-modal:not(.wb-mini-modal){width:100%!important;height:auto;max-height:calc(100dvh - 16px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));}.wb-modal-mask .wb-pet-modal{padding:0!important}.wb-modal-mask .wb-pet-scroll{padding:4px 12px 12px}.wb-modal-mask .wb-pet-modal>.wb-actions{padding:0 12px 12px}.wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-api-status,.wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-pet-story-choice-title,.wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-pet-story-choice-name,.wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-pet-story-choice-summary{margin-left:14px!important;margin-right:14px!important}.wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-actions{padding:0 14px 14px!important}}

      #${POPUP_ID} .wb-body.wb-pet-mode button,
      #${POPUP_ID} .wb-pet-room button,
      #${POPUP_ID} .wb-pet-room button:hover,
      #${POPUP_ID} .wb-pet-room button:active,
      .wb-modal-mask .wb-pet-modal button,
      .wb-modal-mask .wb-pet-modal button:hover,
      .wb-modal-mask .wb-pet-modal button:active,
      .wb-modal-mask .wb-pet-modal .wb-btn,
      .wb-modal-mask .wb-pet-modal .wb-iconbtn,
      #${POPUP_ID} .wb-pet-iconbtn,
      #${POPUP_ID} .wb-pet-topbar .wb-pet-iconbtn,
      #${POPUP_ID} .wb-pet-scene-actions .wb-pet-iconbtn,
      #${POPUP_ID} .wb-pet-scene-toggle,
      #${POPUP_ID} .wb-pet-scene-choice,
      #${POPUP_ID} .wb-pet-record-home {
        box-shadow:none!important;
        text-shadow:none!important;
      }
      #${POPUP_ID} .wb-pet-room button:hover,
      .wb-modal-mask .wb-pet-modal button:hover,
      #${POPUP_ID} .wb-pet-room button:active,
      .wb-modal-mask .wb-pet-modal button:active {
        transform:none!important;
        filter:none!important;
      }

      #${POPUP_ID} .wb-body.wb-pet-mode button:not(.primary),
      #${POPUP_ID} .wb-pet-room button:not(.primary),
      .wb-modal-mask .wb-pet-modal button:not(.primary) {
        background:var(--wb-soft)!important;
        color:var(--wb-text)!important;
        border-color:color-mix(in srgb,var(--wb-accent) 48%,var(--wb-border) 52%)!important;
      }
      #${POPUP_ID} #wb-pet-back,
      #${POPUP_ID} #wb-pet-caretakers,
      #${POPUP_ID} #wb-pet-help,
      #${POPUP_ID} #wb-pet-restart,
      .wb-modal-mask #wb-pet-adopt-close,
      .wb-modal-mask #wb-pet-char-picker-close,
      .wb-modal-mask .wb-pet-modal-head .wb-pet-iconbtn,
      .wb-modal-mask .wb-pet-modal-head button.wb-pet-iconbtn {
        background:transparent!important;
        border-color:transparent!important;
        color:var(--wb-on-accent)!important;
      }
      #${POPUP_ID} .wb-pet-scene-toggle,
      #${POPUP_ID} .wb-pet-scene-toggle:not(.primary) {
        border-color:transparent!important;
      }
      .wb-modal-mask .wb-pet-story-type .wb-pet-story-replay,
      .wb-modal-mask .wb-pet-story-type .wb-pet-story-replay:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-story-type button.wb-pet-story-replay:not(.primary) {
        background:transparent!important;
        background-color:transparent!important;
        background-image:none!important;
        color:inherit!important;
        border:1px solid currentColor!important;
        box-shadow:none!important;
        border-radius:999px!important;
      }
      #${POPUP_ID} .wb-pet-scene-actions .wb-pet-iconbtn {
        border-color:#111!important;
      }
      #${POPUP_ID}.wb-night .wb-pet-scene-actions .wb-pet-iconbtn,
      #${POPUP_ID}.wb-cyber .wb-pet-scene-actions .wb-pet-iconbtn,
      #${POPUP_ID}.wb-tavern .wb-pet-scene-actions .wb-pet-iconbtn {
        border-color:color-mix(in srgb,var(--wb-text) 88%,#fff 12%)!important;
      }
      #${POPUP_ID}.wb-spring .wb-pet-scene-actions .wb-pet-iconbtn,
      #${POPUP_ID}.wb-mono .wb-pet-scene-actions .wb-pet-iconbtn {
        border-color:#111!important;
      }
      .wb-modal-mask .wb-mini-modal.wb-pet-modal {
        padding:0!important;
      }
      .wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-api-status,
      .wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-pet-story-choice-title,
      .wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-pet-story-choice-name,
      .wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-pet-story-choice-summary {
        margin-left:16px!important;
        margin-right:16px!important;
      }
      .wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-pet-story-choice-title {
        margin-top:16px!important;
      }
      .wb-modal-mask .wb-mini-modal.wb-pet-modal > .wb-actions {
        padding:0 16px 16px!important;
        box-sizing:border-box;
      }
      #${POPUP_ID} .wb-body.wb-pet-mode button.primary,
      #${POPUP_ID} .wb-pet-room button.primary,
      .wb-modal-mask .wb-pet-modal button.primary {
        background:var(--wb-accent)!important;
        color:var(--wb-on-accent,#fff)!important;
        border-color:var(--wb-accent)!important;
      }
      #${POPUP_ID} .wb-pet-dialogue {
        background:var(--wb-soft)!important;
      }
      #${POPUP_ID} .wb-body.wb-pet-mode button.wb-pet-card-btn,
      #${POPUP_ID} .wb-body.wb-pet-mode button.wb-pet-card-btn:not(.primary),
      #${POPUP_ID} .wb-pet-topbar button.wb-pet-iconbtn,
      .wb-modal-mask .wb-pet-modal-head button,
      .wb-modal-mask .wb-pet-modal-head button.wb-pet-iconbtn,
      .wb-modal-mask .wb-pet-modal-head .wb-pet-iconbtn {
        background:transparent!important;
        border:2px solid transparent!important;
        box-shadow:none!important;
      }
      #${POPUP_ID} .wb-pet-scene-toggle,
      #${POPUP_ID} .wb-pet-scene-toggle:not(.primary),
      #${POPUP_ID} .wb-body.wb-pet-mode button.wb-pet-scene-toggle:not(.primary) {
        border:2px solid transparent!important;
        box-shadow:none!important;
      }
      /* Final high-specificity pet overrides: keep these after generic button rules. */
      #${POPUP_ID}.wb-day .wb-body.wb-pet-mode .wb-pet-room .wb-pet-scene .wb-pet-scene-actions button.wb-btn.wb-pet-iconbtn:not(.primary),
      #${POPUP_ID}.wb-arcade .wb-body.wb-pet-mode .wb-pet-room .wb-pet-scene .wb-pet-scene-actions button.wb-btn.wb-pet-iconbtn:not(.primary),
      #${POPUP_ID}.wb-spring .wb-body.wb-pet-mode .wb-pet-room .wb-pet-scene .wb-pet-scene-actions button.wb-btn.wb-pet-iconbtn:not(.primary),
      #${POPUP_ID}.wb-mono .wb-body.wb-pet-mode .wb-pet-room .wb-pet-scene .wb-pet-scene-actions button.wb-btn.wb-pet-iconbtn:not(.primary) {
        border-color:#111!important;
      }
      #${POPUP_ID}.wb-night .wb-body.wb-pet-mode .wb-pet-room .wb-pet-scene .wb-pet-scene-actions button.wb-btn.wb-pet-iconbtn:not(.primary),
      #${POPUP_ID}.wb-cyber .wb-body.wb-pet-mode .wb-pet-room .wb-pet-scene .wb-pet-scene-actions button.wb-btn.wb-pet-iconbtn:not(.primary),
      #${POPUP_ID}.wb-tavern .wb-body.wb-pet-mode .wb-pet-room .wb-pet-scene .wb-pet-scene-actions button.wb-btn.wb-pet-iconbtn:not(.primary) {
        border-color:#f5eafa!important;
      }
      .wb-modal-mask .wb-pet-modal button.wb-btn.wb-pet-day.hot1:not(.primary){background:#effcf4!important;color:#28435a!important}
      .wb-modal-mask .wb-pet-modal button.wb-btn.wb-pet-day.hot2:not(.primary){background:#d8f7e3!important;color:#28435a!important}
      .wb-modal-mask .wb-pet-modal button.wb-btn.wb-pet-day.hot3:not(.primary){background:#b6efcb!important;color:#28435a!important}
      .wb-modal-mask .wb-pet-modal button.wb-btn.wb-pet-day.hot4:not(.primary){background:#78dc9c!important;color:#18364d!important}
      .wb-modal-mask .wb-pet-modal button.wb-btn.wb-pet-day.hot5:not(.primary){background:#30bd69!important;color:#fff!important}

      /* Hard reset pet modal/topbar arrow buttons after every generic button rule. */
      #${POPUP_ID} .wb-pet-topbar > button.wb-btn.wb-pet-iconbtn,
      #${POPUP_ID} .wb-pet-topbar > button.wb-btn.wb-pet-iconbtn:not(.primary),
      #${POPUP_ID} .wb-pet-titlebox > button.wb-btn.wb-pet-iconbtn,
      #${POPUP_ID} .wb-pet-titlebox > button.wb-btn.wb-pet-iconbtn:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > button.wb-btn.wb-pet-iconbtn,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > button.wb-btn.wb-pet-iconbtn:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-log-close,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-records-close,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-caretaker-close,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-tutorial-close,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-adopt-close,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-char-picker-close,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-log-close:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-records-close:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-caretaker-close:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-tutorial-close:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-adopt-close:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > #wb-pet-char-picker-close:not(.primary){
        background:transparent!important;
        background-color:transparent!important;
        background-image:none!important;
        border-color:transparent!important;
        box-shadow:none!important;
        outline:0!important;
        filter:none!important;
      }
      #${POPUP_ID} .wb-pet-topbar > button.wb-btn.wb-pet-iconbtn:hover,
      #${POPUP_ID} .wb-pet-topbar > button.wb-btn.wb-pet-iconbtn:active,
      #${POPUP_ID} .wb-pet-titlebox > button.wb-btn.wb-pet-iconbtn:hover,
      #${POPUP_ID} .wb-pet-titlebox > button.wb-btn.wb-pet-iconbtn:active,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > button.wb-btn.wb-pet-iconbtn:hover,
      .wb-modal-mask .wb-pet-modal .wb-pet-modal-head > button.wb-btn.wb-pet-iconbtn:active{
        background:transparent!important;
        background-color:transparent!important;
        background-image:none!important;
        border-color:transparent!important;
        box-shadow:none!important;
        transform:none!important;
      }

      /* Final story replay button override: placed last because earlier generic pet button rules reset background/border. */
      .wb-modal-mask .wb-pet-modal .wb-pet-story-head .wb-pet-story-type > button.wb-btn.wb-pet-story-replay,
      .wb-modal-mask .wb-pet-modal .wb-pet-story-head .wb-pet-story-type > button.wb-btn.wb-pet-story-replay:not(.primary),
      .wb-modal-mask .wb-pet-modal .wb-pet-story-head .wb-pet-story-type > button.wb-btn.wb-pet-story-replay:hover,
      .wb-modal-mask .wb-pet-modal .wb-pet-story-head .wb-pet-story-type > button.wb-btn.wb-pet-story-replay:active {
        width:30px!important;
        min-width:30px!important;
        height:24px!important;
        min-height:24px!important;
        margin-left:2px!important;
        padding:0!important;
        display:inline-grid!important;
        place-items:center!important;
        background:transparent!important;
        background-color:transparent!important;
        background-image:none!important;
        color:inherit!important;
        border:1px solid currentColor!important;
        border-color:currentColor!important;
        border-radius:999px!important;
        box-shadow:none!important;
        text-shadow:none!important;
        transform:none!important;
        filter:none!important;
        opacity:.92;
      }
      .wb-modal-mask .wb-pet-modal .wb-pet-story-head .wb-pet-story-type > button.wb-pet-story-replay .wb-pet-svg {
        width:16px!important;
        height:16px!important;
        stroke:currentColor!important;
        stroke-width:1.55!important;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-caretaker-card,
      .wb-modal-mask#wb-pet-char-picker-mask .wb-pet-caretaker-card {
        width:100%!important;
        min-width:0!important;
        overflow:hidden!important;
        justify-items:start!important;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-full-caretaker {
        position:relative;
        align-items:center!important;
        min-height:78px;
        padding:10px 12px!important;
        gap:12px!important;
        border:0!important;
        box-shadow:none!important;
        background:
          linear-gradient(135deg,color-mix(in srgb,var(--wb-panel) 96%,#fff 4%),color-mix(in srgb,var(--wb-soft) 78%,var(--wb-accent) 22%))!important;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-full-caretaker::before {
        content:'';
        position:absolute;
        left:0;
        top:0;
        bottom:0;
        width:5px;
        background:linear-gradient(180deg,var(--wb-accent),var(--wb-accent2));
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-caretaker-info {
        min-width:0;
        display:grid;
        align-content:center;
        gap:4px;
        line-height:1.2;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-caretaker-title {
        min-width:0;
        display:flex;
        align-items:center;
        gap:6px;
        overflow:hidden;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-nameplate {
        display:inline-flex;
        align-items:center;
        max-width:100%;
        min-height:24px;
        padding:3px 10px 4px;
        border:0!important;
        background:linear-gradient(135deg,#fff7d8,color-mix(in srgb,var(--wb-accent) 22%,#fff 78%));
        color:color-mix(in srgb,var(--wb-text) 84%,var(--wb-accent) 16%);
        box-shadow:none!important;
        font-size:14px;
        font-weight:1000;
        letter-spacing:.5px;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-caretaker-tag {
        flex:0 0 auto;
        max-width:none;
        padding:2px 6px!important;
        border-radius:999px!important;
        font-size:10px!important;
        line-height:1.15!important;
        white-space:nowrap;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-caretaker-line {
        font-size:10.5px!important;
        line-height:1.32!important;
        white-space:nowrap;
        overflow:hidden;
        text-overflow:ellipsis;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-avatar,
      .wb-modal-mask#wb-pet-char-picker-mask .wb-pet-avatar {
        width:48px!important;
        min-width:48px!important;
        max-width:48px!important;
        height:48px!important;
        min-height:48px!important;
        max-height:48px!important;
        padding:0!important;
        overflow:hidden!important;
        box-sizing:border-box!important;
        position:relative!important;
        display:grid!important;
        place-items:center!important;
        align-self:center!important;
        justify-self:center!important;
        line-height:1!important;
        font-size:18px!important;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-avatar img,
      .wb-modal-mask#wb-pet-char-picker-mask .wb-pet-avatar img {
        position:absolute!important;
        inset:0!important;
        width:100%!important;
        height:100%!important;
        max-width:100%!important;
        max-height:100%!important;
        object-fit:cover!important;
        object-position:center!important;
        display:block!important;
        margin:0!important;
        padding:0!important;
        border:0!important;
        transform:none!important;
      }
      .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-trial-avatar {
        background:var(--wb-accent)!important;
        color:var(--wb-on-accent)!important;
        font-weight:1000!important;
      }
      .wb-modal-mask .wb-pet-info-stream {
        box-sizing:border-box;
        width:100%;
        max-height:220px;
        margin:8px 0 0;
        padding:8px;
        overflow:auto;
        border:2px solid color-mix(in srgb,var(--wb-text) 62%,#000 38%);
        background:var(--wb-input);
        color:var(--wb-text);
        font:11px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;
        white-space:pre-wrap;
        word-break:break-all;
      }
      .wb-modal-mask .wb-pet-info-raw {
        margin-top:8px;
        color:var(--wb-text);
      }
      .wb-modal-mask .wb-pet-info-raw summary {
        cursor:pointer;
        font-weight:900;
        color:var(--wb-accent);
      }
      .wb-modal-mask .wb-pet-manual {
        font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive!important;
        color:#31404a;
        line-height:1.75;
        letter-spacing:.2px;
      }
      .wb-modal-mask .wb-pet-manual,
      .wb-modal-mask .wb-pet-manual * {
        font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive!important;
      }
      .wb-modal-mask .wb-pet-manual h2 {
        margin:4px 0 10px;
        text-align:center;
        color:#d56a52;
        font-size:28px;
        line-height:1.25;
      }
      .wb-modal-mask .wb-pet-manual h3 {
        margin:16px 0 6px;
        padding:3px 8px;
        border:1px solid #9bc7ef;
        background:rgba(236,247,255,.72);
        color:#3f7fb5;
        font-size:19px;
        line-height:1.3;
      }
      .wb-modal-mask .wb-pet-manual p {
        margin:5px 0;
        font-size:16px;
      }
      .wb-modal-mask .wb-pet-manual ul {
        margin:4px 0 8px 1.2em;
        padding:0;
      }
      .wb-modal-mask .wb-pet-manual li {
        margin:4px 0;
        font-size:16px;
      }
      .wb-modal-mask .wb-pet-manual strong {
        color:#be6a55;
        font-weight:900;
      }
      .wb-modal-mask .wb-pet-manual code {
        padding:1px 5px;
        border:1px solid #d8bf87;
        background:rgba(255,250,230,.75);
        color:#7a5834;
        font-family:'WanbanPetHandwrite','Comic Sans MS','KaiTi',cursive;
      }
      .wb-modal-mask .wb-pet-tutorial-modal,
      .wb-modal-mask .wb-pet-tutorial-modal *,
      .wb-modal-mask .wb-pet-note-page.wb-pet-manual,
      .wb-modal-mask .wb-pet-note-page.wb-pet-manual * {
        font-family:'WanbanPetHandwrite','STKaiti','KaiTi','KaiTi_GB2312','DFKai-SB','Comic Sans MS',cursive!important;
      }
      .wb-modal-mask .wb-pet-tutorial-modal .wb-pet-modal-title {
        color:#fff8df!important;
        font-size:24px;
        text-shadow:1px 1px 0 rgba(86,64,39,.55),0 0 8px rgba(255,244,196,.35);
      }
      .wb-modal-mask#wb-pet-tutorial-mask {
        padding:12px!important;
        overflow:hidden!important;
        align-items:center!important;
        justify-content:center!important;
        box-sizing:border-box!important;
      }
      .wb-modal-mask#wb-pet-tutorial-mask .wb-pet-tutorial-modal {
        width:min(94vw,760px)!important;
        max-width:760px!important;
        height:min(88dvh,680px)!important;
        max-height:calc(100dvh - 24px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))!important;
        display:flex!important;
        flex-direction:column!important;
        overflow:hidden!important;
        box-sizing:border-box!important;
      }
      .wb-modal-mask#wb-pet-tutorial-mask .wb-pet-modal-head {
        flex:0 0 auto!important;
        margin-bottom:0!important;
      }
      .wb-modal-mask#wb-pet-tutorial-mask .wb-pet-scroll {
        flex:1 1 auto!important;
        min-height:0!important;
        overflow:auto!important;
        padding:12px 16px 16px!important;
        box-sizing:border-box!important;
      }
      .wb-modal-mask .wb-pet-manual h2 {
        font-size:31px;
        transform:rotate(-.6deg);
      }
      .wb-modal-mask .wb-pet-manual h3 {
        width:max-content;
        max-width:100%;
        border:0;
        border-radius:8px 13px 7px 12px;
        background:linear-gradient(104deg,rgba(130,205,255,.36),rgba(130,205,255,.66) 58%,rgba(130,205,255,.24));
        box-shadow:0 2px 0 rgba(63,127,181,.16);
        transform:rotate(-.35deg);
      }
      .wb-modal-mask .wb-pet-manual h3:nth-of-type(2n) {
        background:linear-gradient(104deg,rgba(255,210,115,.28),rgba(255,210,115,.62) 58%,rgba(255,210,115,.22));
        color:#a8692c;
      }
      .wb-modal-mask .wb-pet-manual h3:nth-of-type(3n) {
        background:linear-gradient(104deg,rgba(255,151,164,.24),rgba(255,151,164,.56) 58%,rgba(255,151,164,.2));
        color:#bd5f70;
      }
      .wb-modal-mask .wb-pet-manual strong {
        position:relative;
        z-index:0;
        display:inline;
        padding:0 4px 1px;
        color:#68472d!important;
        font-weight:1000;
      }
      .wb-modal-mask .wb-pet-manual strong:before {
        content:'';
        position:absolute;
        z-index:-1;
        left:0;
        right:0;
        bottom:.05em;
        height:.72em;
        border-radius:9px 12px 8px 10px;
        background:rgba(255,221,94,.55);
        transform:rotate(-1deg);
      }
      .wb-modal-mask .wb-pet-manual li:nth-child(3n+1) strong:before,
      .wb-modal-mask .wb-pet-manual p:nth-of-type(3n+1) strong:before {
        background:rgba(141,210,255,.5);
      }
      .wb-modal-mask .wb-pet-manual li:nth-child(3n+2) strong:before,
      .wb-modal-mask .wb-pet-manual p:nth-of-type(3n+2) strong:before {
        background:rgba(255,163,178,.45);
      }
      .wb-modal-mask .wb-pet-manual .wb-pet-mark {
        display:inline;
        padding:0 5px 1px;
        border-radius:9px 12px 8px 10px;
        background:linear-gradient(transparent 36%, rgba(255,221,94,.62) 37%);
        color:#5f4328;
        font-weight:1000;
        box-decoration-break:clone;
        -webkit-box-decoration-break:clone;
      }
      .wb-modal-mask .wb-pet-manual .wb-pet-mark.blue {
        background:linear-gradient(transparent 36%, rgba(141,210,255,.58) 37%);
        color:#2f638d;
      }
      .wb-modal-mask .wb-pet-manual .wb-pet-mark.pink {
        background:linear-gradient(transparent 36%, rgba(255,163,178,.52) 37%);
        color:#9a4d5b;
      }
      .wb-modal-mask .wb-pet-manual .wb-pet-mark.green {
        background:linear-gradient(transparent 36%, rgba(152,214,197,.58) 37%);
        color:#3d7766;
      }
      .wb-modal-mask .wb-pet-stage-tip-title,
      .wb-modal-mask .wb-pet-stage-tip-box {
        font-family:'WanbanPetHandwrite','STKaiti','KaiTi','KaiTi_GB2312','DFKai-SB','Comic Sans MS',cursive!important;
      }
      .wb-modal-mask .wb-pet-stage-tip-box {
        background:linear-gradient(135deg,rgba(255,246,218,.98),rgba(255,255,255,.82)),repeating-linear-gradient(0deg,transparent 0 25px,rgba(190,106,85,.12) 26px);
      }

      @media (max-width:768px){
        .wb-modal-mask#wb-pet-log-mask .wb-pet-modal,
        .wb-modal-mask#wb-pet-records-mask .wb-pet-modal,
        .wb-modal-mask#wb-pet-caretaker-mask .wb-pet-modal,
        .wb-modal-mask#wb-pet-char-picker-mask .wb-pet-modal,
        .wb-modal-mask#wb-pet-adoption-mask .wb-pet-modal{
          width:calc(100vw - 12px)!important;
          max-width:calc(100vw - 12px)!important;
          height:calc(100dvh - 18px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))!important;
          max-height:calc(100dvh - 18px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))!important;
          border:3px solid color-mix(in srgb,var(--wb-text) 70%,#000 30%)!important;
          box-sizing:border-box;
        }
        .wb-modal-mask .wb-pet-adopt-grid{grid-template-columns:1fr;gap:8px}.wb-modal-mask .wb-pet-egg-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.wb-modal-mask .wb-pet-egg-choice{min-height:68px}.wb-modal-mask .wb-pet-egg-choice img{width:34px;height:34px}
      }
    `;
    doc.head.appendChild(style);
  }
  function petRenderText(text, info, state) {
    return String(text || '')
      .replace(/\{\{user\}\}/g, petPlayerName(state))
      .replace(/\{\{char\}\}/g, petCharName())
      .replace(/江维/g, petCharName())
      .replace(/小黑/g, petDisplayName(info, state));
  }
  function petInlineHTML(text) {
    return esc(text).replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  }
  function petRpgLineHTML(line, info, state) {
    const speaker = line.speaker || '旁白';
    const isNarrator = speaker === '旁白' || petSpeakerClass(speaker) === 'speaker-narrator';
    const name = petSpeakerName(speaker, info, state);
    return '<div class="wb-pet-rpg-line ' + petSpeakerClass(speaker) + '">' + (isNarrator ? '' : '<span class="wb-pet-rpg-speaker">' + esc(name) + '</span>') + '<span class="wb-pet-rpg-text">' + petInlineHTML(petRenderText(line.text || '', info, state)) + '</span></div>';
  }
  function petStoryForPending(info, state, id) {
    if (/^S/.test(id)) return info.sideById[id] || null;
    return getPetMainStory(info, id, state.route);
  }
  function petNextPendingStoryId(info, state) {
    const dismissed = new Set((state && state.dismissedStories) || []);
    return ((state && state.pendingStories) || []).filter(id => !dismissed.has(id) && petStoryForPending(info, state, id))[0] || '';
  }
  function petAllowedLocations(state) {
    const stage = state && state.stage;
    if (stage === 'egg') return ['home'];
    if (stage === 'juvenile') return ['home', 'outside'];
    return ['home', 'outside', 'garden'];
  }
  function petLocationUnlocked(state, loc) {
    return petAllowedLocations(state).includes(loc);
  }
  function petNormalizeLocation(state) {
    if (!petLocationUnlocked(state, state.location)) return Object.assign({}, state, { location:'home' });
    return state;
  }
  function petSpeakerName(speaker, info, state) {
    const sp = String(speaker || '').toLowerCase();
    if (speaker === 'U' || sp === 'user' || speaker === '{{user}}') return petPlayerName();
    if (speaker === 'C' || sp === 'char' || speaker === '{{char}}') return petCharName();
    if (speaker === 'P' || sp === 'pet' || speaker === '宠物') return (state && state.stage === 'egg') ? '？？？' : (info?.pet_card?.pet_name || '宠物');
    if (speaker === '沈') return '沈栖白';
    return speaker || '旁白';
  }

  function petStoryMeasureWidth(doc) {
    const dialogue = qs('#wb-pet-dialogue', doc);
    const dialogueRect = dialogue && dialogue.getBoundingClientRect ? dialogue.getBoundingClientRect() : null;
    if (dialogueRect && dialogueRect.width > 40) return Math.max(120, dialogueRect.width - 24);
    const room = qs('#wb-pet-room', doc) || qs('#' + POPUP_ID, doc);
    const roomRect = room && room.getBoundingClientRect ? room.getBoundingClientRect() : null;
    return Math.max(180, Math.min(760, (roomRect && roomRect.width ? roomRect.width : 360) - 32));
  }
  function petMeasuredStoryLinePages(text, className) {
    const raw = String(text || '');
    if (!raw) return [''];
    const doc = getHostDocument();
    if (!doc || !doc.body) return [raw];
    const width = Math.round(petStoryMeasureWidth(doc));
    const cacheKey = width + '|' + (className || '') + '|' + raw;
    if (petStoryPageCache.has(cacheKey)) return petStoryPageCache.get(cacheKey).slice();
    if (petStoryPageCache.size > 80) petStoryPageCache.clear();
    const source = qs('#wb-pet-dialogue .wb-pet-dialogue-text', doc);
    const probe = doc.createElement('div');
    probe.className = 'wb-pet-dialogue-text ' + (className || '');
    probe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;z-index:-1;visibility:hidden;pointer-events:none;box-sizing:border-box;display:block!important;max-height:none!important;height:auto!important;-webkit-line-clamp:unset!important;-webkit-box-orient:initial!important;white-space:normal!important;word-break:break-all!important;overflow-wrap:anywhere!important;overflow:visible!important;padding:0!important;border:0!important;margin:0!important;';
    probe.style.width = width + 'px';
    if (source && doc.defaultView) {
      const cs = doc.defaultView.getComputedStyle(source);
      ['fontFamily','fontSize','fontWeight','fontStyle','letterSpacing','lineHeight','textTransform'].forEach(prop => { probe.style[prop] = cs[prop]; });
    } else {
      probe.style.fontSize = '13px';
      probe.style.fontWeight = '800';
      probe.style.lineHeight = '1.45';
    }
    doc.body.appendChild(probe);
    const cs = doc.defaultView ? doc.defaultView.getComputedStyle(probe) : null;
    const fontSize = cs ? parseFloat(cs.fontSize) || 13 : 13;
    const lineHeight = cs ? parseFloat(cs.lineHeight) || fontSize * 1.45 : fontSize * 1.45;
    const maxHeight = lineHeight * 2 + 4;
    const fits = chunk => {
      probe.textContent = chunk || '';
      const h = probe.getBoundingClientRect ? probe.getBoundingClientRect().height : probe.scrollHeight;
      return h <= maxHeight;
    };
    const pages = [];
    let start = 0;
    while (start < raw.length) {
      let lo = 1, hi = raw.length - start, best = 1;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (fits(raw.slice(start, start + mid))) { best = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      let end = start + best;
      if (end < raw.length && best > 14) end = start + Math.max(1, best - 2);
      while (end < raw.length && /[，。！？、；：,.!?;:）】』」》]/.test(raw[end]) && fits(raw.slice(start, end + 1))) end++;
      pages.push(raw.slice(start, end));
      start = end;
      while (start < raw.length && /\s/.test(raw[start])) start++;
    }
    probe.remove();
    const result = pages.length ? pages : [''];
    petStoryPageCache.set(cacheKey, result);
    return result.slice();
  }
  function petStoryLineAt(info, state, active) {
    const story = active && active.id ? petStoryForPending(info, state, active.id) : null;
    const lines = story?.lines?.length ? story.lines : parsePetStoryLines(story?.story || '');
    const index = Math.max(0, Math.min(Math.max(0, lines.length - 1), Number(active?.index || 0)));
    const line = lines[index] || { speaker:'旁白', text:story?.summary || '' };
    const speaker = line.speaker || '旁白';
    const pages = petMeasuredStoryLinePages(petRenderText(line.text || '', info, state), (speaker === '旁白' || petSpeakerClass(speaker) === 'speaker-narrator') ? 'narrator' : '');
    const page = Math.max(0, Math.min(pages.length - 1, Number(active?.page || 0)));
    return { story, lines, index, line:Object.assign({}, line, { text:pages[page] }), page, pages };
  }
  function petStoryPreviewState(state) {
    const active = state && state.activeStory;
    if (!active || !active.id || active.prompt) return state;
    const next = Object.assign({}, state);
    if (active.id === 'M05' && next.stage === 'egg') next.stage = 'juvenile';
    if (active.id === 'M08' && next.stage === 'juvenile') next.stage = 'adult';
    if (active.id === 'M12') next.stage = 'spirit';
    if (active.id === 'M13') next.stage = 'ordinary';
    return next;
  }
  function petDialogueHTML(info, state, charLine) {
    const active = state.activeStory || null;
    if (active && active.id) {
      const story = petStoryForPending(info, state, active.id);
      if (story) {
        if (active.prompt) {
          return '<div class="wb-pet-dialogue-name">触发' + (/^S/.test(active.id) ? '支线剧情' : '主线剧情') + ' · ' + esc(petRenderText(story.title || active.id, info, state)) + '</div>'
            + '<div class="wb-pet-dialogue-text">' + petInlineHTML(petRenderText(story.summary || '有新的剧情可以体验。', info, state)) + '</div>'
            + '<div class="wb-pet-dialogue-actions"></div>';
        }
        if (active.done) return '<div class="wb-pet-dialogue-text narrator wb-pet-story-done">当前剧情已完成，点击回到小屋</div><div class="wb-pet-dialogue-actions"></div>';
        const view = petStoryLineAt(info, state, active);
        const line = view.line;
        const speaker = line.speaker || '旁白';
        return (speaker === '旁白' || petSpeakerClass(speaker) === 'speaker-narrator' ? '' : '<div class="wb-pet-dialogue-name ' + petSpeakerClass(speaker) + '">' + esc(petSpeakerName(speaker, info, state)) + '</div>')
          + '<div class="wb-pet-dialogue-text ' + (speaker === '旁白' || petSpeakerClass(speaker) === 'speaker-narrator' ? 'narrator' : '') + '" data-raw="' + esc(line.text || '') + '">' + petInlineHTML(line.text || '') + '</div>'
          + '<div class="wb-pet-dialogue-actions"></div>';
      }
    }
    return '<div class="wb-pet-dialogue-name">' + esc(petCharName()) + '</div><div class="wb-pet-dialogue-text">' + petInlineHTML(petRenderText(charLine || '', info, state)) + '</div><div class="wb-pet-dialogue-actions"></div>';
  }
  function petActiveStoryLine(info, state) {
    const active = state && state.activeStory;
    if (!active || !active.id || active.prompt) return null;
    if (active.done) return null;
    return petStoryLineAt(info, state, active).line || null;
  }
  function petLocationName(loc) {
    return ({ home:'小屋', outside:'小院', garden:'花园' })[loc] || '小屋';
  }
  function petBehaviorName(behavior) {
    return ({ feed:'喂食', pet:'抚摸', poke:'戳戳', outing:'遛弯', play:'玩游戏', sleep:'睡觉' })[behavior] || behavior || '互动';
  }
  function petStoryTriggerText(item, info) {
    const id = item && item.id;
    const side = id && info && info.sideById ? info.sideById[id] : null;
    const trigger = side && side.trigger ? side.trigger : null;
    if (!trigger) return '';
    const context = trigger.context_type === 'time'
      ? (trigger.context_value === 'night' ? '夜间' : (trigger.context_value === 'day' ? '日间' : trigger.context_value))
      : (trigger.context_type === 'location' ? petLocationName(trigger.context_value) : (trigger.stage ? petDisplayStage({ stage:trigger.stage }) : '任意'));
    return [context, petBehaviorName(trigger.behavior)].filter(Boolean).join(' / ');
  }
  function petNextLocation(state) {
    const arr = petAllowedLocations(state);
    const idx = Math.max(0, arr.indexOf(state.location || 'home'));
    return arr[(idx + 1) % arr.length] || 'home';
  }
  function petTimeHM(ts) {
    const n = Number(ts || 0);
    if (!n) return '';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function petDateCN(dateKey) {
    const d = String(dateKey || todayKey()).split('-');
    return d.length >= 3 ? d[0] + '.' + d[1] + '.' + d[2] : String(dateKey || '');
  }
  function petMiniConfirm(title, message, onConfirm, onCancel) {
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.innerHTML = '<div class="wb-modal wb-mini-modal wb-pet-modal"><div class="wb-pet-modal-head"><div class="wb-pet-modal-title">' + esc(title) + '</div></div><div class="wb-api-status">' + esc(message) + '</div><div class="wb-actions" style="margin-top:12px;"><button class="wb-btn primary" id="wb-pet-mini-ok" style="flex:1;">是</button><button class="wb-btn" id="wb-pet-mini-cancel" style="flex:1;">返回</button></div></div>';
    appendModalMask(mask);
    qs('#wb-pet-mini-ok', mask).onclick = () => { mask.remove(); if (onConfirm) onConfirm(); };
    qs('#wb-pet-mini-cancel', mask).onclick = () => { mask.remove(); if (onCancel) onCancel(); };
  }
  function openPetHatchPrompt(info) {
    const state = petTestState();
    if (state.stage !== 'egg' || Number(state.growth || 0) < petStageCap('egg') || state.hatchingDone || state.hatchingOpen) return;
    const next = Object.assign({}, state, { hatchingOpen:true });
    savePetTestState(next);
    petMiniConfirm('破壳啦', '蛋壳里传来了很轻的敲击声。点击确定，迎接当前的动物。', () => {
      const doc = getHostDocument();
      const flash = doc.createElement('div');
      flash.className = 'wb-pet-hatch-flash';
      doc.body.appendChild(flash);
      setTimeout(() => {
        const latest = petTestState();
        const eggStoryIds = ['M02','M03','M04'];
        const hatched = Object.assign({}, latest, {
          hatchingOpen:false,
          hatchingDone:true,
          activeStory:{ id:'M05', prompt:false, index:0, page:0, done:false },
          pendingStories:Array.from(new Set([].concat((latest.pendingStories || []).filter(x => !eggStoryIds.includes(x)), 'M05'))),
          completedMain:Array.from(new Set([].concat(latest.completedMain || [], eggStoryIds)))
        });
        savePetTestState(updatePetPendingStories(hatched, info));
        renderPetHouse();
        setTimeout(() => flash.remove(), 420);
      }, 260);
    }, () => {
      const latest = petTestState();
      savePetTestState(Object.assign({}, latest, { hatchingOpen:false }));
    });
  }
  function petLogPageHTML(log, state, info) {
    if (!log) return '';
    const currentState = log?.snapshot ? petSnapshotState(log.snapshot) : (state || petTestState());
    const displayDate = log?.date || todayKey();
    const displayStage = log?.pet_stage || petDisplayStage(currentState);
    const displayName = petDisplayName(info, currentState, log?.pet_name || '宠物');
    const title = log?.title || (petDateCN(displayDate) + ' 灵息日志');
    const body = String(log?.body || log?.diary || '').trim();
    const lines = body ? body.split(/\n+/).map(x => x.trim()).filter(Boolean) : [];
    const tags = Array.isArray(log?.tags) ? log.tags : String(log?.tags || '').split(/[,，、\s]+/).filter(Boolean);
    const tagHtml = (tags.length ? tags : ['日常', displayStage, '灵息小窝']).slice(0, 6).map(x => '<span class="wb-pet-note-tag"># ' + esc(x) + '</span>').join('');
    return '<article class="wb-pet-note-page wb-pet-diary-page">'
      + '<div class="wb-pet-diary-cover"><div class="wb-pet-diary-meta"><span>日期 <b>' + esc(petDateCN(displayDate)) + '</b></span><span>宠物名称 <b>' + esc(displayName) + '</b></span><span>宠物形态 <b>' + esc(displayStage) + '</b></span></div></div>'
      + '<div class="wb-pet-note-tags">' + tagHtml + '</div>'
      + '<div class="wb-pet-diary-two"><div><em>我们的关系</em><span>' + esc(log?.relationship_delta || '今天的陪伴让你们和宠物更靠近了一点。') + '</span></div><div><em>特别记忆存档</em><span>' + esc(log?.memory_anchor || '小屋里留下了一件值得以后想起的小事。') + '</span></div></div>'
      + '<h2 class="wb-pet-diary-title">' + esc(title) + '</h2>'
      + '<div class="wb-pet-diary-body">' + (lines.length ? lines.map(x => '<p>' + esc(x) + '</p>').join('') : '<p></p><p></p><p></p>') + '</div>'
      + '</article>';
  }
  function petDailyInteractionText(state, today) {
    const day = (state.days || {})[today] || {};
    return [
      '日期：' + petDateCN(today),
      '喂食次数：' + (day.feed || 0),
      '抚摸次数：' + (day.pet || 0),
      '戳戳次数：' + (day.poke || 0),
      '遛弯/桌宠计时段：' + (day.outing || 0),
      '玩游戏次数：' + (day.play || 0),
      '游戏时长额外成长：' + (day.playTime || 0),
      '破纪录额外成长：' + (day.record || 0),
      '成长值：' + petGrowthPercent(state) + '%',
      state.stage === 'egg' ? '蛋形态：无饱食度和开心值。' : ('饱食度：' + Math.round(state.fullness || 0) + '；开心值：' + Math.round(state.happiness || 0))
    ].join('\n');
  }
  function petTodayStoryText(state, info, today) {
    const arr = (state.storyRecords || []).filter(x => (x.date || '') === today);
    if (!arr.length) return '今天没有保存的新剧情。';
    return arr.map(x => '《' + petRenderText(x.title || x.id, info, state) + '》\n类型：' + (/^S/.test(x.id || '') ? '支线剧情' : '主线剧情') + '\n摘要：' + petRenderText(x.summary || '', info, state) + '\n正文：\n' + petRenderText(x.story || '', info, state)).join('\n\n---\n\n');
  }
  function normalizePetLogData(raw, today) {
    if (!raw) return parsePetGeneratedLog('', today);
    try {
      const obj = parseGeneratedJson(raw);
      if (obj && typeof obj === 'object') return {
        date:today,
        pet_name:String(obj.pet_name || '').trim(),
        pet_stage:String(obj.pet_stage || '').trim(),
        title:String(obj.title || '').trim() || (petDateCN(today) + ' 灵息日志'),
        tags:Array.isArray(obj.tags) ? obj.tags.map(String).filter(Boolean) : String(obj.tags || '').split(/[,，、\s]+/).filter(Boolean),
        relationship_delta:String(obj.relationship_delta || '').trim(),
        memory_anchor:String(obj.memory_anchor || '').trim(),
        body:String(obj.diary || obj.body || '').trim()
      };
    } catch(e) {}
    return parsePetGeneratedLog(raw, today);
  }
  async function petAssetText(path, fallback) {
    try {
      const res = await fetch(PET_ASSET_BASE + 'text/' + path, { cache:'no-store' });
      if (res.ok) return await res.text();
    } catch(e) {}
    return fallback || '';
  }
  async function generatePetFullInfo(caretaker, form, onDelta) {
    const api = apiFieldsFromPresetIndex(form.api_preset_index);
    const cfg = Object.assign({}, petCaretakerPromptConfig(caretaker), api);
    if (!cfg.apiUrl || !cfg.apiModel) throw new Error('请先在设置中配置API和模型');
    const world = await petAssetText('world.txt', '');
    const infoPrompt = await petAssetText('info.txt', '');
    const cycle = Number(form.adoption_cycle || petFullAdoptionCycle(caretaker));
    const input = [
      'pet_name_candidates:',
      '  male: ' + (form.male_name || '小星'),
      '  female: ' + (form.female_name || '小月'),
      'egg_options: [blue, purple, pink, green, gold, white]',
      'selected_egg: ' + (form.wish_mode ? 'wish' : (form.selected_egg || 'green')),
      'selected_egg_color: ' + (form.selected_egg || 'green'),
      'wish_mode: ' + (!!form.wish_mode),
      'wish_species: ' + (form.wish_species || 'random'),
      'wish_sex: ' + (form.wish_sex || 'random'),
      'wish_tendency: ' + (form.wish_tendency || 'random'),
      'pet_sprite_color_rules:',
      petSpeciesColorRuleText(form.wish_species || 'random').split('\n').map(x => '  ' + x).join('\n'),
      'pet_sprite_color_requirement: |',
      '  生成宠物剧情文本、summary、story、left_item、语录时，宠物外观颜色必须严格遵守上述立绘颜色。',
      '  common、juvenile、adult、ordinary 普通路线均使用“普通形态”颜色；spirit 路线和灵息形态均使用“灵息形态”颜色。',
      '  不要写成其他毛色、羽色、眼花色或与立绘冲突的花纹；如需描写光效，只能作为点缀，不能覆盖规定主色。',
      'narrative_person: ' + (['first','second','third'].includes(form.narrative_person) ? form.narrative_person : 'second'),
      'user_pronoun: TA',
      'adoption_cycle: ' + cycle,
      'user_name: ' + (form.user_name || petPlayerName(petTestState())),
      'char_name: ' + (caretaker?.name || petCharName()),
      'previous_pet_memories: |-',
      String(cycle > 1 ? petFullAllLogsText(caretaker) : '无').split('\n').map(x => '  ' + x).join('\n')
    ].join('\n');
    const prompt = [
      (cfg.breakLimitPrompt || '').trim(),
      specialLanguageRequirement('petInfo', cfg),
      '【module0-module1 世界规则】\n' + world,
      '【当前{{char}}世界观全部信息】\n' + (caretaker?.worldText || selectedWorldText(cfg) || '无'),
      '【当前角色描述】\n' + currentCharDescription(cfg),
      '【当前{{user}}设定】\n' + currentUserDescription(cfg),
      '【当前语言/风格要求】\n' + (cfg.specialLanguageEnabled ? (cfg.specialLanguage || '已开启') : '无'),
      '【界面输入内容】\n' + input,
      '【宠物立绘颜色硬性规则】\n' + petSpeciesColorRuleText(form.wish_species || 'random') + '\n\n必须遵守：普通成长线和普通路线使用普通形态颜色；灵息路线使用灵息形态颜色。剧情中所有对宠物毛色、羽色、花纹、光效、遗留物颜色的描写都不能与该颜色规则冲突。',
      '【info生成规范】\n' + infoPrompt
    ].filter(Boolean).join('\n\n');
    const raw = onDelta
      ? await callApiTextStream(cfg, prompt, '你是灵息宠物系统素材生成器。只输出合法的<pet_info> YAML，不要解释。', 16000, onDelta)
      : await callApiText(cfg, prompt, '你是灵息宠物系统素材生成器。只输出合法的<pet_info> YAML，不要解释。', 16000);
    const parsed = parsePetInfoText(raw);
    if ((parsed.parseWarnings || []).length || !parsed.pet_card?.pet_name || parsed.main_story.length < 15 || parsed.side_story.length < 6) {
      const err = new Error('info解析失败：' + ((parsed.parseWarnings || []).join('；') || '字段数量不足'));
      err.raw = raw;
      err.parsed = parsed;
      throw err;
    }
    return { raw, parsed };
  }

  async function petLogPromptText() {
    try {
      const res = await fetch(PET_ASSET_BASE + 'text/log.txt', { cache:'no-store' });
      if (res.ok) return await res.text();
    } catch(e) {}
    return '你需要根据输入内容，生成一篇由 {{char}} 亲自记录的每日宠物日志。只输出JSON。';
  }
  async function generatePetDailyLog(info, state, note, cfgOverride, dateKeyOverride) {
    const cfg = cfgOverride || settings();
    const today = dateKeyOverride || todayKey();
    const fallback = parsePetGeneratedLog('<daily_pet_log>\npet_name: "' + (info?.pet_card?.pet_name || '宠物') + '"\npet_stage: "' + petDisplayStage(state) + '"\ntitle: "' + petDateCN(today) + ' 的小屋微光"\nrelationship_delta: "今天的照顾让彼此更熟悉了一点"\nmemory_anchor: "' + (note || '小动物在小屋里留下了很轻的脚步声') + '"\ndiary: |-\n  ' + petDailyInteractionText(state, today).replace(/\n/g, '。') + (note ? '。额外记录：' + note : '') + '\n</daily_pet_log>', today);
    if (!cfg.apiUrl || !cfg.apiModel) return fallback;
    const basePrompt = await petLogPromptText();
    const prompt = [
      (cfg.breakLimitPrompt || '').trim(),
      specialLanguageRequirement('petLog', cfg),
      basePrompt,
      '请只输出JSON，不要Markdown，不要解释。JSON结构：{"pet_name":"","pet_stage":"","title":"8-14字标题","tags":["标签1","标签2","标签3"],"relationship_delta":"一句话说明今天{{user}}、{{char}}与宠物的关系变化","memory_anchor":"一句话记录今天最值得以后回忆的小细节","diary":"450-650字正文"}',
      '当前日期：' + petDateCN(today),
      '饲养员/角色：' + (cfg.charName || petCharName()),
      '用户：' + petPlayerName(state),
      '用户设定：\n' + currentUserDescription(cfg),
      '语言/风格要求：\n' + (cfg.specialLanguageEnabled ? (cfg.specialLanguage || '已开启') : '无'),
      '宠物名称：' + petDisplayName(info, state),
      '宠物阶段：' + petDisplayStage(state),
      '宠物名片：\n' + petCardPromptText(info, state),
      '当前世界观：\n' + (selectedWorldText(cfg) || '无'),
      '角色描述：\n' + currentCharDescription(cfg),
      '大总结：\n' + (selectedSummaryText(cfg) || '无'),
      '今天全部互动：\n' + petDailyInteractionText(state, today),
      '今天全部剧情内容：\n' + petTodayStoryText(state, info, today),
      '用户补充做了什么：\n' + (note || '无')
    ].filter(Boolean).join('\n\n');
    const raw = await callApiText(cfg, prompt, '你是宠物陪伴游戏的日志写作助手。必须只输出可解析JSON。', 4096);
    const data = normalizePetLogData(raw, today);
    return data.body ? data : fallback;
  }
  function petDayHasAutoLogRecord(day) {
    if (!day || day.adopted) return false;
    return ['feed','pet','poke','outing','play','playTime','growth','cheat'].some(k => Number(day[k] || 0) > 0)
      || !!day.visited
      || !!day.snapshot;
  }
  function maybeAutoGeneratePreviousPetLog(info, state) {
    const cfg = petCaretakerPromptConfig();
    if (!settings().petAutoDailyLog || !cfg.apiUrl || !cfg.apiModel) return;
    const date = offsetDateKey(todayKey(), -1);
    const day = (state.days || {})[date];
    if (!petDayHasAutoLogRecord(day) || (state.logs || {})[date]) return;
    const key = (petFullActivePet()?.id || 'trial') + ':' + date;
    if (petAutoDailyLogRunning[key]) return;
    petAutoDailyLogRunning[key] = true;
    generatePetDailyLog(info, state, '每日自动记录日志。', cfg, date).then(log => {
      const latest = petTestState();
      if ((latest.logs || {})[date]) return;
      latest.logs = Object.assign({}, latest.logs || {}, { [date]:Object.assign({}, log, {
        savedAt:Date.now(),
        auto:true,
        date,
        pet_name:petDisplayName(info, latest, log?.pet_name || '宠物'),
        pet_stage:petDisplayStage(latest),
        snapshot:day.snapshot || petSnapshotData(latest)
      }) });
      savePetTestState(latest);
      toast('已自动记录昨日宠物日志');
    }).catch(e => {
      console.warn('[玩伴小屋] auto pet log failed:', e);
    }).finally(() => {
      delete petAutoDailyLogRunning[key];
    });
  }
  function petStoryPageHTML(item, info, state) {
    const lines = parsePetStoryLines(item?.story || '').map(line => {
      const speaker = line.speaker || '旁白';
      if (speaker === '旁白') return '<p class="narrator">' + petInlineHTML(petRenderText(line.text, info, state)) + '</p>';
      return '<div class="wb-pet-rpg-line ' + petSpeakerClass(speaker) + '"><span class="wb-pet-rpg-speaker">' + esc(petSpeakerName(speaker, info, state)) + '</span><span class="wb-pet-rpg-text">' + petInlineHTML(petRenderText(line.text, info, state)) + '</span></div>';
    }).join('');
    const isSide = /^S/.test(item?.id || '');
    const type = isSide ? '支线剧情' : '主线剧情';
    const triggerText = isSide ? petStoryTriggerText(item, info) : '';
    const meta = '<span>时间：<b>' + esc(petDateCN(item?.date || todayKey())) + '</b></span>' + (triggerText ? '<span>触发条件：<b>' + esc(triggerText) + '</b></span>' : '');
    return '<div class="wb-pet-story-page wb-pet-story-body"><div class="wb-pet-story-head"><div class="wb-pet-story-type">' + type + '<button class="wb-btn wb-pet-story-replay" type="button" title="回放剧情" aria-label="回放剧情" data-story-id="' + esc(item?.id || '') + '">' + petUiIcon('replay') + '</button></div><div class="wb-pet-story-meta">' + meta + '</div></div><h2 class="wb-pet-story-title">' + esc(petRenderText(item?.title || '剧情', info, state)) + '</h2><div class="wb-pet-story-summary">' + esc(petRenderText(item?.summary || '', info, state)) + '</div><div class="wb-pet-story-lines">' + lines + '</div></div>';
  }

  function petEggDisplayName(egg) {
    const map = { gold:'金色蛋', white:'白色蛋', black:'黑色蛋', blue:'蓝色蛋', pink:'粉色蛋' };
    return map[String(egg || '').toLowerCase()] || (egg ? String(egg) + '蛋' : '???');
  }
  function petSpeciesName(species) {
    return ({ rabbit:'兔子', cat:'猫', dog:'小狗', bird:'鸟', fox:'狐狸', bala:'巴拉' })[String(species || '').toLowerCase()] || species || '???';
  }
  function petSexName(sex) {
    return ({ male:'男孩子', female:'女孩子', unknown:'未知' })[String(sex || '').toLowerCase()] || sex || '???';
  }
  function petProfileValue(value, unlocked) {
    return unlocked && value ? esc(value) : '<span class="wb-pet-profile-lock">???</span>';
  }
  function openPetProfileCard(info) {
    injectPetArcadeStyle();
    const state = petTestState();
    const card = info?.pet_card || {};
    const isEgg = state.stage === 'egg';
    const hasSpirit = state.stage === 'spirit';
    const n = Number(state.adoptionCycle || card.adoption_cycle || 0) || ((state.archives || []).length + 1);
    const name = petDisplayName(info, state);
    const shape = isEgg ? '蛋' : petDisplayStage(state);
    const spirit = String(card.spirit_tendency_skill || '').split('|').filter(Boolean).join(' / ');
    const doc = getHostDocument();
    const old = qs('#wb-pet-profile-mask', doc); if (old) old.remove();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-profile-mask';
    const item = (label, value, wide) => '<div class="wb-pet-profile-item' + (wide ? ' wide' : '') + '"><em>' + esc(label) + '</em><strong>' + value + '</strong></div>';
    mask.innerHTML = '<div class="wb-modal wb-pet-modal wb-mini-modal"><div class="wb-pet-profile-card">'
      + '<div class="wb-pet-profile-top"><div class="wb-pet-profile-title"><b>灵息宠物名片</b><span>' + esc(petCharName()) + '的小屋收藏档案</span></div><div class="wb-pet-profile-photo">' + petAssetHTML(state, state.petAction || 'normal') + '</div></div>'
      + '<div class="wb-pet-profile-grid">'
      + item('宠物品种', petProfileValue(petSpeciesName(card.species), !isEgg), false)
      + item('姓名', esc(name), false)
      + item('形态', esc(shape), false)
      + item('性别', petProfileValue(petSexName(card.sex), !isEgg), false)
      + item('性格', petProfileValue(String(card.personality || '').split('|').join(' / '), !isEgg), true)
      + item('灵息', petProfileValue(spirit, hasSpirit), true)
      + item('收养人', esc(petPlayerName(state)) + ' & ' + esc(petCharName()), true)
      + '<div class="wb-pet-profile-item wide"><em>小屋编号</em><strong>这是我们的第 <span class="wb-pet-profile-num">' + esc(n) + '</span> 个宠物</strong></div>'
      + '</div><div class="wb-pet-profile-actions"><button class="wb-btn primary" id="wb-pet-profile-close">收好名片</button></div>'
      + '</div></div>';
    appendModalMask(mask);
    qs('#wb-pet-profile-close', mask).onclick = () => mask.remove();
  }

  function renderPetHouse() {
    syncPopupModeClass();
    injectPetArcadeStyle();
    if (settings().petDesktopEnabled) {
      savePetTestState(applyPetVisitAndDecay(petTestState()));
      setSettings({ petDesktopEnabled:false, petDesktopState:'normal', petForm:petCurrentForm() });
      syncFloatingBall();
    }
    const body = qs('#wb-body');
    body.className = 'wb-body wb-intimacy-mode wb-pet-mode';
    body.innerHTML = '<div class="wb-panel" style="display:grid;place-items:center;min-height:240px;">读取宠物试用版数据...</div>';
    loadPetTestInfo().then(info => {
      let state = petNormalizeLocation(applyPetVisitAndDecay(petTestState()));
      state = updatePetPendingStories(state, info);
      savePetTestState(state);
      maybeAutoGeneratePreviousPetLog(info, state);
      renderPetHouseLoaded(info, state);
      setTimeout(() => {
        if (petTestState().stage === 'egg' && Number(petTestState().growth || 0) >= petStageCap('egg')) openPetHatchPrompt(info);
        else openNextPetStoryPrompt(info);
      }, 80);
    }).catch(e => {
      console.error('[玩伴小屋] render pet house failed:', e);
      const fallback = parsePetInfoText('');
      fallback.parseWarnings.push('宠物界面加载失败，已进入本地预览：' + (e && e.message ? e.message : e));
      try {
        const state = petNormalizeLocation(applyPetVisitAndDecay(petTestState()));
        renderPetHouseLoaded(fallback, state);
      } catch (inner) {
        console.error('[玩伴小屋] fallback render failed:', inner);
        const body = qs('#wb-body');
        if (body) body.innerHTML = '<div class="wb-panel" style="display:grid;gap:10px;place-items:center;min-height:240px;"><b>宠物界面读取失败</b><div class="wb-muted">' + esc(inner && inner.message ? inner.message : inner) + '</div><button class="wb-btn" id="wb-pet-retry">重试</button></div>';
        const retry = qs('#wb-pet-retry'); if (retry) retry.onclick = renderPetHouse;
      }
    });
  }
  function renderPetHouseLoaded(info, state) {
    if (petStoryTypeTimer) { clearInterval(petStoryTypeTimer); petStoryTypeTimer = 0; }
    const body = qs('#wb-body');
    const renderState = petStoryPreviewState(state);
    const storyMode = !!(state.activeStory && state.activeStory.id && !state.activeStory.prompt);
    const petName = petDisplayName(info, renderState);
    const activeLine = petActiveStoryLine(info, state);
    const storyTalkAction = storyMode && activeLine && ['U','C','user','char','{{user}}','{{char}}'].includes(String(activeLine.speaker || '')) && Math.random() < .45 ? (Math.random() < .5 ? 'happy' : 'normal') : '';
    const autoAction = storyMode ? '' : petAutoAction(renderState);
    const action = storyTalkAction || autoAction || renderState.petAction || 'normal';
    setSettings({ petDesktopState: action, petForm:petFormForStage(renderState) });
    const pendingCount = (state.pendingStories || []).length;
    const isEgg = renderState.stage === 'egg';
    const isEnded = !!renderState.ended;
    const canFeed = !isEgg && !renderState.ended;
    const charLine = state.lastCharLine || (petCharName() + '看着' + petName + '，又看了看你，像是已经把照顾计划在心里排好了。');
    const petLine = state.lastPetLine || '';
    const showShen = activeLine && petSpeakerName(activeLine.speaker, info, state) === '沈栖白';
    const warnings = (info.parseWarnings || []).length ? '<div class="wb-api-status">' + esc(info.parseWarnings.join('；')) + '</div>' : '';
    const locName = petLocationName(state.location);
    const cheatActionHTML = petRuntimeMode === 'test' ? '<button class="wb-btn wb-pet-iconbtn wb-pet-cheat-btn" id="wb-pet-cheat" title="开挂模式" aria-label="开挂模式">' + petUiIcon('coin') + '</button>' : '';
    body.innerHTML = '<div class="wb-pet-room' + (storyMode ? ' story-mode' : '') + '" id="wb-pet-room">'
      + '<div class="wb-pet-topbar"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-back" title="返回" aria-label="返回">' + petUiIcon('back') + '</button><div class="wb-pet-titlebox">' + petCharAvatarHTML() + '<span class="wb-pet-house-name">' + esc(petCharName()) + '的小屋</span><button class="wb-btn wb-pet-iconbtn" id="wb-pet-caretakers" title="选择饲养员" aria-label="选择饲养员">' + petUiIcon('down') + '</button></div><div class="wb-pet-top-actions"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-help" title="教程" aria-label="教程">' + petUiIcon('help') + '</button><button class="wb-btn wb-pet-iconbtn" id="wb-pet-restart" title="重开" aria-label="重开">' + petUiIcon('restart') + '</button></div></div>'
      + warnings
      + '<div class="wb-pet-status-card">' + (storyMode ? '<div class="wb-pet-story-status">剧情模式中</div>' : (isEnded ? '<button class="wb-btn primary wb-pet-new-adoption" id="wb-pet-new-adoption" type="button">领养新的宠物</button>' : '<div class="wb-pet-status-head"><span class="wb-pet-status-identity"><b class="wb-pet-status-name">' + esc(petName) + '</b><b class="wb-pet-status-stage">' + esc(petDisplayStage(renderState)) + '</b><button class="wb-btn wb-pet-card-btn" id="wb-pet-card" title="宠物名片" aria-label="宠物名片">' + petUiIcon('card') + '</button></span><span class="wb-pet-status-place"><i>' + esc(locName) + '</i><i>' + esc(petTimeOfDay() === 'day' ? '白天' : '夜晚') + '</i></span></div><div class="wb-pet-bars' + (isEgg ? ' egg' : '') + '">' + petBarHTML('成长值', petGrowthPercent(renderState), '#43c96f') + (isEgg ? '' : petBarHTML('饱食度', renderState.fullness, '#ff9f43') + petBarHTML('开心值', renderState.happiness, '#ff6f91')) + '</div>')) + '</div>'
      + '<div class="wb-pet-stage">'
      + '<div class="wb-pet-scene" id="wb-pet-scene" style="background-image:url(' + esc(petSceneUrl(state)) + ')">'
      + (!storyMode && !isEnded ? '<div class="wb-pet-scene-title">' + esc(locName) + '</div>' : '')
      + (!storyMode && !isEnded && petLine ? '<div class="wb-pet-speech">' + esc(petLine) + '</div>' : '')
      + (!storyMode && !isEnded ? '<div class="wb-pet-scene-drawer" id="wb-pet-scene-drawer"><div class="wb-pet-scene-menu"><button class="wb-btn wb-pet-scene-choice" data-loc="home"><span class="wb-pet-scene-thumb" style="background-image:url(' + esc(PET_ASSET_BASE + 'scene/home-' + petTimeOfDay() + '.png') + ')"></span>小屋</button><button class="wb-btn wb-pet-scene-choice ' + (petLocationUnlocked(state, 'outside') ? '' : 'locked') + '" data-loc="outside" data-locked="' + (petLocationUnlocked(state, 'outside') ? '0' : '1') + '"><span class="wb-pet-scene-thumb" style="background-image:url(' + esc(PET_ASSET_BASE + 'scene/outside-' + petTimeOfDay() + '.png') + ')"></span>小院</button><button class="wb-btn wb-pet-scene-choice ' + (petLocationUnlocked(state, 'garden') ? '' : 'locked') + '" data-loc="garden" data-locked="' + (petLocationUnlocked(state, 'garden') ? '0' : '1') + '"><span class="wb-pet-scene-thumb" style="background-image:url(' + esc(PET_ASSET_BASE + 'scene/garden-' + petTimeOfDay() + '.png') + ')"></span>花园</button></div><button class="wb-btn wb-pet-scene-toggle" id="wb-pet-scene-toggle" title="切换场景" aria-label="切换场景"><span class="wb-pet-scene-toggle-text"><i>切</i><i>换</i><i>场</i><i>景</i></span>' + petUiIcon('scene') + '</button></div>' : '')
      + (!storyMode && !isEnded ? '<div class="wb-pet-scene-actions">' + (isEgg ? '<button class="wb-btn wb-pet-iconbtn" id="wb-pet-pat" title="抚摸" aria-label="抚摸">' + petUiIcon('pat') + '</button><button class="wb-btn wb-pet-iconbtn" id="wb-pet-log" title="写日志" aria-label="写日志">' + petUiIcon('log') + '</button><button class="wb-btn wb-pet-iconbtn" id="wb-pet-records" title="记录" aria-label="记录">' + petUiIcon('records') + '</button>' + cheatActionHTML + '' : '<button class="wb-btn wb-pet-iconbtn" id="wb-pet-walk" title="遛弯" aria-label="遛弯">' + petUiIcon('walk') + '</button><button class="wb-btn wb-pet-iconbtn" id="wb-pet-feed" title="喂食" aria-label="喂食" ' + (canFeed ? '' : 'disabled') + '>' + petUiIcon('feed') + '</button><button class="wb-btn wb-pet-iconbtn" id="wb-pet-pat" title="抚摸" aria-label="抚摸">' + petUiIcon('pat') + '</button><button class="wb-btn wb-pet-iconbtn" id="wb-pet-log" title="写日志" aria-label="写日志">' + petUiIcon('log') + '</button><button class="wb-btn wb-pet-iconbtn" id="wb-pet-records" title="记录" aria-label="记录">' + petUiIcon('records') + '</button>' + cheatActionHTML + '') + (state.endingReady && Number(state.growth || 0) >= petStageCap(state.stage) && !state.ended && !isEgg ? '<button class="wb-btn wb-pet-iconbtn primary" id="wb-pet-ending" title="进入结局" aria-label="进入结局">' + petUiIcon('ending') + '</button>' : '') + '</div>' : '')
      + (!isEnded ? '<button class="wb-pet-room-fox' + (isEgg && state.lastPetLine ? ' egg-shake' : '') + '" id="wb-pet-poke" type="button" title="戳一戳" style="border:0;background:transparent;padding:0;box-shadow:none!important;">' + petAssetHTML(renderState, action) + '</button>' : '<div class="wb-pet-empty-stage">这段灵息旅程已经完成。</div>')
      + (storyMode ? '<button class="wb-btn wb-pet-story-exit" id="wb-pet-story-exit" type="button">退出剧情</button>' : '')
      + (showShen ? '<img class="wb-pet-npc-portrait" src="' + esc(PET_ASSET_BASE + 'scene/shenqibai.png') + '" alt="">' : '')
      + '</div>'
      + '</div>'
      + '<div class="wb-pet-dialogue" id="wb-pet-dialogue">' + petDialogueHTML(info, state, charLine) + '</div>'
      + '</div>';
    const room = qs('#wb-pet-room', body);
    if (storyMode && !(state.activeStory && state.activeStory.done)) {
      const textEl = qs('.wb-pet-dialogue-text', room);
      if (textEl) {
        const full = textEl.dataset.raw || textEl.textContent || '';
        textEl.textContent = '';
        let i = 0;
        petStoryTypeTimer = setInterval(() => {
          i = Math.min(full.length, i + 6);
          textEl.textContent = full.slice(0, i);
          if (i >= full.length) { clearInterval(petStoryTypeTimer); petStoryTypeTimer = 0; textEl.innerHTML = petInlineHTML(full); }
        }, 12);
      }
    }
    resetPetIdleTimer(room);
    resetPetAnimationLoop(room, action === 'eat' || action === 'happy');
    const feed = qs('#wb-pet-feed', room);
    const pat = qs('#wb-pet-pat', room);
    const reset = qs('#wb-pet-reset', room);
    const back = qs('#wb-pet-back', room);
    const walk = qs('#wb-pet-walk', room);
    const runAction = (kind, spriteState) => {
      let next = petApplyInteraction(kind);
      const stage = next.stage === 'ordinary' ? 'adult' : next.stage;
      const auto = petAutoAction(next);
      const shownState = auto || spriteState;
      next.petAction = shownState;
      next.lastPetLine = next.stage === 'egg' && (kind === 'pet' || kind === 'poke') ? '......' : petQuote(info, 'pet', stage, kind === 'feed' ? 'feed' : (kind === 'pet' ? 'pet' : 'poke'), petLineFor(shownState));
      next.lastCharLine = petQuote(info, 'char', stage === 'egg' ? 'egg' : stage, kind === 'feed' ? 'feed' : (kind === 'pet' ? 'pet' : 'poke'), '');
      next = updatePetPendingStories(next, info);
      savePetTestState(next);
      renderPetHouseLoaded(info, next);
      setTimeout(() => {
        if (petTestState().stage === 'egg' && Number(petTestState().growth || 0) >= petStageCap('egg')) openPetHatchPrompt(info);
        else openNextPetStoryPrompt(info);
      }, 80);
    };
    if (feed) feed.onclick = () => runAction('feed', 'eat');
    if (pat) pat.onclick = () => runAction('pet', 'happy');
    const poke = qs('#wb-pet-poke', room); if (poke && !isEgg && !storyMode) poke.onclick = () => runAction('poke', 'normal');
    qsa('[data-loc]', room).forEach(btn => btn.onclick = () => {
      if (btn.dataset.locked === '1' || btn.classList.contains('locked')) { toast('当前未解锁，继续养宠物解锁场景吧！'); return; }
      const next = Object.assign({}, petTestState(), { location:btn.dataset.loc });
      savePetTestState(updatePetPendingStories(next, info));
      renderPetHouse();
    });
    const recordsBtn = qs('#wb-pet-records', room); if (recordsBtn) recordsBtn.onclick = () => openPetRecords(info);
    const cheatBtn = qs('#wb-pet-cheat', room); if (cheatBtn) cheatBtn.onclick = () => {
      const next = petApplyCheatGrowth(5);
      renderPetHouseLoaded(info, next);
      setTimeout(() => {
        if (petTestState().stage === 'egg' && Number(petTestState().growth || 0) >= petStageCap('egg')) openPetHatchPrompt(info);
        else openNextPetStoryPrompt(info);
      }, 80);
    };
    const profileBtn = qs('#wb-pet-card', room); if (profileBtn) profileBtn.onclick = e => { e.stopPropagation(); openPetProfileCard(info); };
    const newAdopt = qs('#wb-pet-new-adoption', room); if (newAdopt) newAdopt.onclick = () => {
      if (petRuntimeMode === 'test') { openPetTestSelect(); return; }
      const c = petFullActiveCaretaker();
      if (c) openPetAdoptionForm(c);
      else openPetTestSelect();
    };
    const logBtn = qs('#wb-pet-log', room); if (logBtn) logBtn.onclick = () => openPetLogModal(info);
    const caretakersBtn = qs('#wb-pet-caretakers', room); if (caretakersBtn) caretakersBtn.onclick = () => openPetCaretakerSelect(null, { forceFull:true, stay:true });
    const helpBtn = qs('#wb-pet-help', room); if (helpBtn) helpBtn.onclick = openPetTutorial;
    const sceneToggle = qs('#wb-pet-scene-toggle', room); if (sceneToggle) sceneToggle.onclick = e => {
      e.stopPropagation();
      const drawer = qs('#wb-pet-scene-drawer', room);
      if (drawer) drawer.classList.toggle('open');
    };
    const nextScene = qs('#wb-pet-next-scene', room); if (nextScene) nextScene.onclick = () => {
      const next = Object.assign({}, petTestState(), { location:petNextLocation(state) });
      savePetTestState(updatePetPendingStories(next, info));
      renderPetHouse();
    };
    const endingBtn = qs('#wb-pet-ending', room); if (endingBtn) endingBtn.onclick = () => {
      const next = Object.assign({}, petTestState(), { endingReady:true, finalConfirmed:true, pendingStories:Array.from(new Set([].concat(petTestState().pendingStories || [], 'M15'))) });
      savePetTestState(updatePetPendingStories(next, info));
      openNextPetStoryPrompt(info);
    };
    if (reset) reset.onclick = () => petMiniConfirm('重置宠物试用版', '确定重置宠物试用版进度吗？这会清空试用版下的数值、剧情记录和日志。', () => {
      savePetTestState(defaultPetTestState());
      setSettings({ petInteractCount:0, petForm:'baby', petDesktopState:'normal' });
      renderPetHouse();
    });
    const restart = qs('#wb-pet-restart', room);
    if (restart) restart.onclick = () => petMiniConfirm('是否确定重新开始？', petFullActiveCaretaker() ? '确定后会删除当前这一轮宠物及本轮全部记录，然后重新进入领养登记表；之前轮次会保留。' : '确定后会回到最初的测试入口（选择角色页面），当前宠物试用版进度会清空。', () => {
      const fullCaretaker = petFullActiveCaretaker();
      if (fullCaretaker) {
        petFullRemoveActivePet(fullCaretaker.id);
        openPetAdoptionForm(petFullCaretakerById(fullCaretaker.id) || fullCaretaker);
        return;
      }
      savePetTestState(defaultPetTestState());
      setSettings({ petDesktopEnabled:false, petInteractCount:0, petForm:'baby', petDesktopState:'normal' });
      syncFloatingBall();
      openPetTestSelect();
    });
    if (back) back.onclick = () => {
      const goHub = () => {
        currentTab = 'intimacy';
        currentGame = null;
        petReturnHouseOnRender = false;
        clearPetTimers();
        renderIntimacy();
      };
      if (petTestState().activeStory && petTestState().activeStory.id) {
        petMiniConfirm('是否返回？', '当前正在剧情模式中，是否返回亲密互动首页？', () => {
          const next = petTestState();
          next.activeStory = null;
          savePetTestState(next);
          goHub();
        });
      } else goHub();
    };
    if (walk) walk.onclick = () => {
      toast('带' + petName + '去遛一遛。');
      petMiniConfirm('开启桌宠模式？', '带' + petName + '去遛一遛。', () => {
        let next = petApplyInteraction('outing');
        next = updatePetPendingStories(Object.assign(next, { petAction:'normal' }), info);
        savePetTestState(next);
        setSettings({ petDesktopEnabled:true, petDesktopState:'normal', petForm:petCurrentForm() });
        syncFloatingBall();
        currentTab = 'intimacy';
        currentGame = null;
        buildPopup();
      });
    };
    const storyExit = qs('#wb-pet-story-exit', room);
    if (storyExit) storyExit.onclick = e => {
      e.stopPropagation();
      const active = petTestState().activeStory || {};
      petMiniConfirm('退出剧情？', '退出后会保存当前剧情并回到小屋，是否确定？', () => {
        const latest = petTestState();
        if (active.replay) { latest.activeStory = null; savePetTestState(latest); toast('剧情回放已结束'); renderPetHouse(); }
        else if (active.id) completePetStory(info, active.id, false);
      });
    };
    bindPetStoryInlineControls(info, room);
  }

  function openPetCaretakerSelect(info, options) {
    injectPetArcadeStyle();
    const fullMode = !!(options && options.forceFull) || petFullIsActive() || !info;
    if (fullMode) petRuntimeMode = 'full';
    if (!fullMode) {
      const state = petTestState();
      const saved = Array.isArray(state.caretakers) ? state.caretakers : [];
      const doc = getHostDocument();
      const mask = doc.createElement('div');
      mask.className = modalMaskClass();
      mask.id = 'wb-pet-caretaker-mask';
      const rows = [{ name:petCharName(), pet:petDisplayName(info, state), test:true }].concat(saved);
      mask.innerHTML = '<div class="wb-modal wb-pet-modal"><div class="wb-pet-modal-head"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-caretaker-close">' + petUiIcon('back') + '</button><div class="wb-pet-modal-title">选择饲养员</div><button class="wb-btn wb-pet-iconbtn" id="wb-pet-caretaker-add">' + petUiIcon('plus') + '</button></div><div class="wb-pet-scroll"><div class="wb-pet-card-list">' + rows.map((r, i) => '<div class="wb-pet-caretaker-card" data-i="' + i + '"><div class="wb-pet-avatar">' + esc((r.name || '?').slice(0, 1)) + '</div><div><b>' + esc(r.name || '未命名') + '</b>' + (r.test ? ' <span class="wb-pill">试用版</span>' : '') + '<div class="wb-muted">当前动物：' + esc(r.pet || '暂无') + '</div></div>' + (r.test ? '<span class="wb-muted">可进入</span>' : '<button class="wb-btn wb-pet-caretaker-del" data-i="' + i + '">删除</button>') + '</div>').join('') + '</div></div></div>';
      appendModalMask(mask);
      qs('#wb-pet-caretaker-close', mask).onclick = () => mask.remove();
      qs('#wb-pet-caretaker-add', mask).onclick = () => toast('请从灵息小窝入口添加角色');
      return;
    }
    const data = petFullData();
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-caretaker-mask';
    const rows = data.caretakers || [];
    const trialState = Object.assign(defaultPetTestState(), safeObject(loadJSON(STORAGE_PET_TEST, {})));
    const trialInfo = null;
    const trialSpeciesLabel = { rabbit:'兔子', dog:'小狗', cat:'猫咪', bird:'飞鸟', bala:'水豚', fox:'狐狸' };
    const trialPetName = petDisplayName(trialInfo, trialState, trialSpeciesLabel[trialState.testSpecies] || '当前动物');
    const trialCycle = Number(trialState.adoptionCycle || 0) || Math.max(1, (Array.isArray(trialState.archives) ? trialState.archives.length : 0) + 1);
    const trialHTML = '<button class="wb-pet-caretaker-card wb-pet-full-caretaker wb-pet-trial-caretaker" type="button"><div class="wb-pet-avatar wb-pet-trial-avatar">试</div>' + petSnapshotHTMLForInfo(trialState, trialInfo) + '<div class="wb-pet-caretaker-info"><div class="wb-pet-caretaker-title"><b class="wb-pet-nameplate">江维</b><span class="wb-pill wb-pet-caretaker-tag">试用版</span></div><div class="wb-muted wb-pet-caretaker-line">当前动物：' + esc(trialPetName) + '</div><div class="wb-muted wb-pet-caretaker-line">第' + esc(String(trialCycle)) + '只宠物</div></div></button>';
    const rowHTML = rows.map(c => {
      const pet = petFullActivePet(data, c);
      const infoObj = pet?.infoText ? parsePetInfoText(pet.infoText) : null;
      const state = Object.assign(defaultPetTestState(), pet?.state || {});
      const avatar = c.avatarUrl ? '<img src="' + esc(c.avatarUrl) + '" alt="">' : esc((c.name || '?').slice(0, 1));
      const snap = pet ? petSnapshotHTMLForInfo(state, infoObj) : '<div class="wb-pet-snapshot"></div>';
      const completedCount = petFullCompletedCount(c);
      const shownCycle = pet && !petFullPetCompleted(pet) ? (Number(state.adoptionCycle || 0) || completedCount + 1) : completedCount;
      return '<button class="wb-pet-caretaker-card wb-pet-full-caretaker" data-id="' + esc(c.id) + '"><div class="wb-pet-avatar">' + avatar + '</div>' + snap + '<div class="wb-pet-caretaker-info"><div class="wb-pet-caretaker-title"><b class="wb-pet-nameplate">' + esc(c.name || '未命名') + '</b></div><div class="wb-muted wb-pet-caretaker-line">当前动物：' + esc(pet ? petDisplayName(infoObj, state, '未命名宠物') : '暂无宠物') + '</div><div class="wb-muted wb-pet-caretaker-line">第' + esc(String(Math.max(1, Number(shownCycle || 1)))) + '只宠物</div></div></button>';
    }).join('') + (rows.length ? '' : '<div class="wb-api-status">还没有添加正式饲养员。可以先进入试用版，或点击右上角“+”添加角色。</div>') + trialHTML;
    mask.innerHTML = '<div class="wb-modal wb-pet-modal"><div class="wb-pet-modal-head"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-caretaker-close">' + petUiIcon('back') + '</button><div class="wb-pet-modal-title">选择饲养员</div><button class="wb-btn wb-pet-iconbtn" id="wb-pet-caretaker-add">' + petUiIcon('plus') + '</button></div><div class="wb-pet-scroll"><div class="wb-pet-card-list">' + rowHTML + '</div></div></div>';
    appendModalMask(mask);
    qs('#wb-pet-caretaker-close', mask).onclick = () => { mask.remove(); if (!(options && options.stay)) renderIntimacy(); };
    qs('#wb-pet-caretaker-add', mask).onclick = () => openPetFullCharPicker(mask);
    const trial = qs('.wb-pet-trial-caretaker', mask);
    if (trial) trial.onclick = () => {
      mask.remove();
      if (petTrialHasSavedPet()) {
        petRuntimeMode = 'test';
        petFullActiveCaretakerId = '';
        petTestInfoCache = null;
        petTestInfoLoading = null;
        renderPetHouse();
      } else {
        openPetTestSelect();
      }
    };
    qsa('.wb-pet-full-caretaker', mask).forEach(btn => {
      if (btn.classList.contains('wb-pet-trial-caretaker')) return;
      btn.onclick = () => {
      const c = petFullCaretakerById(btn.dataset.id);
      if (!c) return;
      withPetFullActive(c.id);
      mask.remove();
      if (!petFullActivePet(petFullData(), c)) openPetAdoptionForm(c);
      else renderPetHouse();
      };
    });
  }

  function openPetFullCharPicker(parentMask) {
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-char-picker-mask';
    const opts = petFullCaretakerOptions();
    mask.innerHTML = '<div class="wb-modal wb-pet-modal"><div class="wb-pet-modal-head"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-char-picker-close">' + petUiIcon('back') + '</button><div class="wb-pet-modal-title">添加角色</div><span></span></div><div class="wb-pet-scroll"><div class="wb-pet-card-list">' + opts.map((o,i) => '<button class="wb-pet-caretaker-card wb-pet-char-pick" data-i="' + i + '"><div class="wb-pet-avatar">' + (o.avatarUrl ? '<img src="' + esc(o.avatarUrl) + '" alt="">' : esc(o.name.slice(0,1))) + '</div><div><b>' + esc(o.name) + '</b></div></button>').join('') + '</div></div></div>';
    appendModalMask(mask);
    qs('#wb-pet-char-picker-close', mask).onclick = () => mask.remove();
    qsa('.wb-pet-char-pick', mask).forEach(btn => btn.onclick = () => {
      const opt = opts[Number(btn.dataset.i)];
      if (!opt) return;
      petMiniConfirm('确认饲养员', '是否选择和' + opt.name + '一起养宠物？', () => {
        const c = petFullEnsureCaretaker(opt);
        mask.remove();
        if (parentMask) parentMask.remove();
        openPetCaretakerSelect(null, { forceFull:true });
        setTimeout(() => { const latest = petFullCaretakerById(c.id); if (latest && !(latest.pets || []).length) openPetAdoptionForm(latest); }, 80);
      });
    });
  }



  function petEggOptionHTML(selected) {
    const eggs = [['blue','蓝色蛋'], ['purple','紫色蛋'], ['pink','粉色蛋'], ['green','绿色蛋'], ['gold','金色蛋'], ['white','白色蛋']];
    return '<div class="wb-pet-egg-grid">' + eggs.map(e => '<button class="wb-btn wb-pet-egg-choice ' + (selected === e[0] ? 'selected' : '') + '" type="button" data-egg="' + e[0] + '"><img src="' + esc(PET_ASSET_BASE + 'eggs/' + e[0] + '-1.png') + '" alt=""><span>' + e[1] + '</span></button>').join('') + '</div>';
  }
  function petAdoptionEggCardHTML(parsed, form, cycle) {
    const card = parsed?.pet_card || {};
    const eggLabels = { blue:'蓝色蛋', purple:'紫色蛋', pink:'粉色蛋', green:'绿色蛋', gold:'金色蛋', white:'白色蛋' };
    const rawEgg = card.egg || form?.selected_egg || '';
    const egg = eggLabels[String(rawEgg).trim()] || rawEgg || '神秘蛋';
    const userName = form?.user_name || settings().userName || '你';
    const item = (k, v, wide) => '<div class="wb-pet-profile-item' + (wide ? ' wide' : '') + '"><em>' + esc(k) + '</em><strong>' + esc(v || '???') + '</strong></div>';
    return '<div class="wb-pet-profile-card wb-pet-adopt-success-card"><div class="wb-pet-profile-top"><div class="wb-pet-profile-title"><b>灵息宠物名片</b><span>蛋形态初始档案</span></div><div class="wb-pet-profile-seal">蛋</div></div><div class="wb-pet-profile-grid">'
      + item('品种', '???', false)
      + item('姓名', '???', false)
      + item('蛋', egg, false)
      + item('性别', '???', false)
      + item('性格', '???', false)
      + item('灵息', '???', false)
      + item('收养人', userName, false)
      + item('小屋编号', '这是我们的第 ' + String(cycle || 1) + ' 个宠物', false)
      + '</div></div>';
  }
  function openPetAdoptionForm(caretaker) {
    injectPetArcadeStyle();
    withPetFullActive(caretaker.id);
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-adoption-mask';
    const cycle = petFullAdoptionCycle(caretaker);
    let generated = null;
    let draft = {
      user_name:settings().userName || petTestState().userName || '',
      selected_egg:'green',
      adoption_cycle:cycle,
      wish_mode:false,
      wish_species:'random',
      wish_sex:'random',
      wish_tendency:'random',
      male_name:'',
      female_name:'',
      narrative_person:'second',
      api_preset_index:'',
      attempts:3
    };
    const draw = () => {
      const wishOpen = !!draft.wish_mode;
      const wishStyle = wishOpen ? '' : 'display:none;';
      const apiOptions = '<option value="">当前API配置（' + esc(settings().apiModel || '未配置') + '）</option>' + apiPresets().map((p, i) => '<option value="' + i + '">' + esc((p.name || ('预设' + (i + 1))) + ' · ' + (p.apiModel || '未选模型')) + '</option>').join('');
      mask.innerHTML = '<div class="wb-modal wb-pet-modal"><div class="wb-pet-modal-head"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-adopt-close">' + petUiIcon('back') + '</button><div class="wb-pet-modal-title">领养登记表</div><span></span></div><div class="wb-pet-scroll"><div class="wb-pet-adopt-grid">'
        + '<label class="wb-field"><span>你叫什么</span><input class="wb-input" id="wb-pet-adopt-user" value="' + esc(draft.user_name || '') + '"></label>'
        + '<label class="wb-field"><span>养宠次数</span><input class="wb-input" id="wb-pet-adopt-cycle" value="' + cycle + '" readonly></label>'
        + '<div class="wb-field wb-pet-adopt-wide"><span>选择你想要的蛋</span>' + petEggOptionHTML(draft.selected_egg) + '</div>'
        + '<label class="wb-switch wb-pet-adopt-wide"><input id="wb-pet-wish-mode" type="checkbox" ' + (wishOpen ? 'checked' : '') + '>许愿模式</label>'
        + '<div class="wb-pet-adopt-wide" id="wb-pet-wish-fields" style="' + wishStyle + '"><div class="wb-preset-row"><label class="wb-field" style="flex:1;"><span>品种</span><select class="wb-select" id="wb-pet-wish-species"><option value="random">随机</option><option value="rabbit">兔子</option><option value="dog">狗</option><option value="cat">猫</option><option value="bird">鹰</option><option value="bala">水豚</option><option value="fox">狐狸</option></select></label><label class="wb-field" style="flex:1;"><span>性别</span><select class="wb-select" id="wb-pet-wish-sex"><option value="random">随机</option><option value="male">男孩</option><option value="female">女孩</option></select></label></div><label class="wb-field"><span>灵息能力</span><input class="wb-input" id="wb-pet-wish-tendency" placeholder="随机 或 填写能力倾向" value="' + esc(draft.wish_tendency === 'random' ? '随机' : draft.wish_tendency) + '"></label></div>'
        + '<div class="wb-preset-row wb-pet-adopt-wide"><label class="wb-field" style="flex:1;"><span>男孩姓名</span><input class="wb-input" id="wb-pet-name-male" placeholder="例如：小曜" value="' + esc(draft.male_name || '') + '"></label><label class="wb-field" style="flex:1;"><span>女孩姓名</span><input class="wb-input" id="wb-pet-name-female" placeholder="例如：小露" value="' + esc(draft.female_name || '') + '"></label></div>'
        + '<div class="wb-preset-row wb-pet-adopt-wide"><label class="wb-field" style="flex:1;"><span>剧情人称</span><select class="wb-select" id="wb-pet-narrative-person"><option value="first">第一人称（我）</option><option value="second">第二人称（你）</option><option value="third">第三人称（TA）</option></select></label><div style="flex:1;"></div></div>'
        + '<div class="wb-preset-row wb-pet-adopt-wide"><label class="wb-field" style="flex:1;"><span>模型选择</span><select class="wb-select" id="wb-pet-adopt-model">' + apiOptions + '</select></label><label class="wb-field" style="flex:1;"><span>模型生成次数</span><input class="wb-input" id="wb-pet-adopt-attempts" type="number" min="1" max="5" value="' + esc(String(draft.attempts || 3)) + '"></label></div>'
        + '<div class="wb-actions wb-pet-adopt-wide"><button class="wb-btn primary" id="wb-pet-adopt-generate" style="flex:1;">确定，生成宠物文案</button></div>'
        + '<div id="wb-pet-adopt-status" class="wb-pet-adopt-wide"></div>'
        + '</div></div></div>';
      appendModalMask(mask);
      const species = qs('#wb-pet-wish-species', mask); if (species) species.value = draft.wish_species || 'random';
      const sex = qs('#wb-pet-wish-sex', mask); if (sex) sex.value = draft.wish_sex || 'random';
      const narrative = qs('#wb-pet-narrative-person', mask); if (narrative) narrative.value = draft.narrative_person || 'second';
      const apiSel = qs('#wb-pet-adopt-model', mask); if (apiSel) apiSel.value = draft.api_preset_index || '';
      bind();
    };
    const collect = () => {
      const userName = (qs('#wb-pet-adopt-user', mask)?.value || '').trim() || '你';
      setSettings({ userName:userName });
      draft = {
        user_name:userName,
        selected_egg:draft.selected_egg,
        adoption_cycle:cycle,
        wish_mode:!!qs('#wb-pet-wish-mode', mask)?.checked,
        wish_species:qs('#wb-pet-wish-species', mask)?.value || 'random',
        wish_sex:qs('#wb-pet-wish-sex', mask)?.value || 'random',
        wish_tendency:(qs('#wb-pet-wish-tendency', mask)?.value || 'random').replace(/^随机$/, 'random'),
        male_name:(qs('#wb-pet-name-male', mask)?.value || '').trim(),
        female_name:(qs('#wb-pet-name-female', mask)?.value || '').trim(),
        narrative_person:qs('#wb-pet-narrative-person', mask)?.value || 'second',
        api_preset_index:qs('#wb-pet-adopt-model', mask)?.value || '',
        attempts:Math.max(1, Math.min(5, parseInt(qs('#wb-pet-adopt-attempts', mask)?.value, 10) || 1))
      };
      return draft;
    };
    const generate = async () => {
      const form = collect();
      if (form.wish_mode && form.wish_sex === 'male' && !form.male_name) { toast('请填写男孩姓名'); return; }
      if (form.wish_mode && form.wish_sex === 'female' && !form.female_name) { toast('请填写女孩姓名'); return; }
      if ((!form.wish_mode || form.wish_sex === 'random') && (!form.male_name || !form.female_name)) { toast('需要填写男孩和女孩两个姓名'); return; }
      const status = qs('#wb-pet-adopt-status', mask);
      const btn = qs('#wb-pet-adopt-generate', mask);
      let streamRaw = '';
      if (status) status.innerHTML = '<div class="wb-api-status">生成中，正在接收模型输出...</div><pre class="wb-pet-info-stream" id="wb-pet-info-stream"></pre>';
      if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }
      let lastErr = null;
      for (let i = 0; i < form.attempts; i++) {
        try {
          if (i > 0) {
            streamRaw = '';
            if (status) status.innerHTML = '<div class="wb-api-status">第' + (i + 1) + '次重新生成中，正在接收模型输出...</div><pre class="wb-pet-info-stream" id="wb-pet-info-stream"></pre>';
          }
          generated = await generatePetFullInfo(caretaker, form, delta => {
            streamRaw += delta;
            const box = qs('#wb-pet-info-stream', mask);
            if (box) { box.textContent = streamRaw; box.scrollTop = box.scrollHeight; }
          });
          break;
        }
        catch(e) { lastErr = e; if (status) status.innerHTML = '<div class="wb-api-status">第' + (i + 1) + '次失败：' + esc(e.message || e) + '</div>' + (streamRaw ? '<pre class="wb-pet-info-stream">' + esc(streamRaw) + '</pre>' : ''); }
      }
      if (!generated && lastErr) { if (btn) { btn.disabled = false; btn.textContent = '确定，生成宠物文案'; } return; }
      if (status) status.innerHTML = '<div class="wb-api-status">生成完成，已解析出蛋形态名片。</div>';
      if (btn) { btn.disabled = false; btn.textContent = '确定，生成宠物文案'; }
      openPetAdoptionSuccessModal(form);
    };
    const enterGeneratedHouse = (form) => {
        form = form || collect();
        const state = Object.assign(defaultPetTestState(), { userName:form.user_name, adoptionCycle:cycle, firstSnapshot:null });
        petFullAddPet(caretaker.id, generated.raw, state, { egg:generated.parsed.pet_card?.egg || draft.selected_egg });
        petTestInfoCache = generated.parsed;
        mask.remove();
        renderPetHouse();
    };
    const openPetAdoptionSuccessModal = (form) => {
      const old = qs('#wb-pet-adoption-success-mask', doc);
      if (old) old.remove();
      const success = doc.createElement('div');
      success.className = modalMaskClass();
      success.id = 'wb-pet-adoption-success-mask';
      success.innerHTML = '<div class="wb-modal wb-mini-modal wb-pet-modal wb-pet-adopt-success-modal"><div class="wb-pet-modal-head"><div class="wb-pet-modal-title">生成并解析成功</div></div><div class="wb-pet-scroll">' + petAdoptionEggCardHTML(generated.parsed, form, cycle) + '<details class="wb-pet-info-raw"><summary>查看全部输出</summary><pre class="wb-pet-info-stream">' + esc(generated.raw || '') + '</pre></details></div><div class="wb-actions"><button class="wb-btn primary" id="wb-pet-enter-house" style="flex:1;">进入灵息小屋</button><button class="wb-btn" id="wb-pet-adopt-regen" style="flex:1;">重新生成</button></div></div>';
      appendModalMask(success);
      qs('#wb-pet-enter-house', success).onclick = () => { success.remove(); enterGeneratedHouse(form); };
      qs('#wb-pet-adopt-regen', success).onclick = () => { success.remove(); generated = null; generate(); };
    };
    const bind = () => {
      qs('#wb-pet-adopt-close', mask).onclick = () => { mask.remove(); openPetCaretakerSelect(null, { forceFull:true }); };
      qsa('.wb-pet-egg-choice', mask).forEach(btn => btn.onclick = () => {
        collect();
        draft.selected_egg = btn.dataset.egg;
        qsa('.wb-pet-egg-choice', mask).forEach(x => x.classList.toggle('selected', x === btn));
      });
      const wish = qs('#wb-pet-wish-mode', mask); if (wish) wish.onchange = () => {
        collect();
        draft.wish_mode = !!wish.checked;
        const fields = qs('#wb-pet-wish-fields', mask);
        if (fields) fields.style.display = draft.wish_mode ? '' : 'none';
      };
      const gen = qs('#wb-pet-adopt-generate', mask); if (gen) gen.onclick = generate;
    };
    draw();
  }

  function openPetTutorial() {
    injectPetArcadeStyle();
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-tutorial-mask';
    const state = petTestState();
    const petName = petDisplayName(petTestInfoCache, state);
    const stageName = state.stage === 'egg' ? '蛋' : (state.stage === 'juvenile' ? '幼崽' : ((state.stage === 'spirit' || state.stage === 'ordinary' || state.endingReady) ? '最终形态' : '成年'));
    const stageTip = (() => {
      if (state.stage === 'egg') return '蛋形态：多摸一摸孩子，去玩小游戏解锁成长度和更多形态吧！';
      if (state.stage === 'spirit' || state.stage === 'ordinary' || state.endingReady) return esc(petName) + '已经做好回到他的世界的准备了。你准备好道别了吗？';
      return '幼崽/成年：喂食、抚摸、玩游戏、遛弯都可以增加成长度，满足条件后在不同场景可以解锁支线剧情。挑战解锁更多的支线剧情吧！';
    })();
    const mark = (text, tone) => '<span class="wb-pet-mark' + (tone ? ' ' + tone : '') + '">' + esc(text) + '</span>';
    const manual = [
      '<div class="wb-pet-note-page wb-pet-manual">',
      '<h2>饲养员手册</h2>',
      '<div class="wb-pet-stage-tip"><div class="wb-pet-stage-tip-title">小提示：当前阶段——' + esc(stageName) + '</div><div class="wb-pet-stage-tip-box">' + stageTip + '</div></div>',
      '<p><strong>欢迎来到灵息小窝。</strong>这里是一套长期养宠模块：你和当前角色会共同领养、照顾、记录一只灵息宠物。它会从蛋开始成长，触发主线与支线剧情，最后走向普通宠物或灵息宠物的结局。</p>',
      '<h3>## 1. 从哪里开始？</h3>',
      '<ul><li><strong>灵息小窝入口：</strong>点击亲密互动里的“灵息小窝”。如果已经有正在养的宠物，会直接进入该宠物页面；想换人养宠，请点小屋标题旁边的下拉按钮。</li><li><strong>选择饲养员：</strong>列表里会显示“试用版”和已添加的角色。试用版会读取本地角色数据；正式角色会走 AI 生成完整宠物文案。</li><li><strong>添加角色：</strong>右上角“+”可以从' + mark('当前世界观', 'blue') + '角色里选择饲养员。添加后，每个角色都有' + mark('独立宠物', 'green') + '、日志、剧情和日期记录。</li><li><strong>领养登记表：</strong>没有宠物的正式角色会进入登记表。填写 user 名、选择蛋、宠物名字、' + mark('API 预设', 'blue') + '和' + mark('生成次数', 'green') + '；开启' + mark('许愿模式', 'pink') + '后可以指定' + mark('品种/性别/灵息能力') + '，选择“随机”则交给 AI 决定。</li></ul>',
      '<h3>## 2. 宠物有哪些阶段？</h3>',
      '<ul><li><strong>蛋形态：</strong>刚领养时只有成长值。此时右侧按钮较少，主要通过抚摸、戳戳、写日志、查看记录来陪伴它。蛋形态戳戳/抚摸的对话可能只是“......”，这是正常的。</li><li><strong>幼年期：</strong>破壳后会出现真正的动物。开始有饱食度和开心值，可以喂食、抚摸、遛弯，宠物会说话、做动作，也会逐步解锁场景。</li><li><strong>成年期：</strong>宠物更稳定，也会触发更关键的主线。成年后需要继续提高成长值，推动它走向最终选择。</li><li><strong>灵息 / 普通路线：</strong>后期剧情会让宠物选择接受灵息力量，或回归更普通的动物生活。不同路线会影响后续剧情和名片信息。</li><li><strong>旅程结束：</strong>最终剧情完成后，小屋会空出来，右侧交互按钮消失，上方会出现“领养新的宠物”。点击后可以为同一个角色开启下一轮养宠。</li></ul>',
      '<h3>## 3. 主页面怎么看？</h3>',
      '<ul><li><strong>顶部栏：</strong>左上角返回；右上角有教程和重开；中间显示“角色的小屋”，旁边的小三角可以打开选择饲养员。</li><li><strong>状态栏：</strong>显示宠物名称、阶段、当前场景和时间。旁边的' + mark('名片按钮', 'blue') + '可以查看宠物品种、姓名、性别、性格、灵息、收养人和第几只宠物。</li><li><strong>进度条：</strong>' + mark('成长值', 'green') + '决定阶段推进与主线触发；' + mark('饱食度') + '会通过喂食恢复；' + mark('开心值', 'pink') + '会通过抚摸、游戏等恢复。蛋形态只有成长值。</li><li><strong>中间场景：</strong>显示当前地点和宠物。宠物待机时会做动作；有语录时，宠物旁会出现小对话云朵。</li><li><strong>切换场景：</strong>左下侧的' + mark('切换场景', 'blue') + '拉手可以展开场景抽屉。未解锁场景会有锁，继续养宠后会逐步开放。</li><li><strong>底部对话框：</strong>平时显示角色语录；进入剧情时变成 RPG 对话框。文字满两行会自动分页，点击页面任意位置继续。</li></ul>',
      '<h3>## 4. 右侧按钮分别做什么？</h3>',
      '<ul><li><strong>遛弯：</strong>会询问是否开启桌宠模式。确认后退出小屋；遛弯期间每生成 3 次 RP 正文增加 1 点成长值，单纯挂机不会增加。</li><li><strong>喂食：</strong>增加饱食度；如果饱食度确实被补充，也会增加成长值。会触发吃饭动作、宠物语录和可能的支线事件。</li><li><strong>抚摸：</strong>增加开心值；如果开心值确实被补充，也会增加成长值。蛋形态每 10 分钟可通过抚摸获得成长。</li><li><strong>写日志：</strong>打开手账式日志页。可以选择模型、补充今天做了什么，AI 会结合世界观、宠物名片、当天互动和剧情生成日记。</li><li><strong>记录：</strong>查看日期记录、日志记录、剧情记录。日期会按当天累计成长值变色；日志和剧情会保留当时的时间、宠物阶段和快照。</li><li><strong>开挂模式：</strong>试用/调试用金币按钮，点击增加 5 点成长值，方便测试剧情和阶段推进。</li></ul>',
      '<h3>## 5. 剧情怎么触发？</h3>',
      '<ul><li><strong>主线剧情：</strong>通常由' + mark('成长值', 'green') + '和' + mark('阶段', 'blue') + '触发，例如蛋的觉醒、破壳、幼年成长、成年选择、灵息结局等。</li><li><strong>支线剧情：</strong>可能由' + mark('喂食/抚摸/遛弯', 'pink') + '、玩游戏、' + mark('时间/地点', 'blue') + '、概率或累计次数触发。有些事件会先进入“已触发”状态，等你回到合适场景或时间才弹出。</li><li><strong>触发弹窗：</strong>出现剧情时会先弹出小提示，显示主线/支线、剧情名和简介。你可以进入剧情，也可以放弃；放弃也会存档。</li><li><strong>剧情模式：</strong>进入后右侧交互按钮和场景切换会隐藏，上方显示“剧情模式中”。点击任意位置推进，剧情结束后点击回到小屋并保存。</li><li><strong>剧情回放：</strong>在剧情记录里可以点击放映机按钮回放已完成剧情，不会重复改变成长数据。</li></ul>',
      '<h3>## 6. 日志和记录有什么用？</h3>',
      '<ul><li><strong>写日志：</strong>适合每天结束时生成一篇手账。日志会保存日期、宠物名称、宠物形态、标签、我们的关系、特别记忆存档、标题和正文。</li><li><strong>覆盖规则：</strong>同一天如果已经有日志，再保存会提示是否覆盖当天日志。</li><li><strong>日期记录：</strong>像日历一样查看成长。' + mark('当天累计成长', 'green') + '越多，日期颜色越明显；下方会列出喂食、抚摸、遛弯、游戏等加分标签。</li><li><strong>日志记录：</strong>按日期和时间列出所有日志，点击后以同样的手账版式查看。</li><li><strong>剧情记录：</strong>按日期和时间列出主线/支线剧情，保留标题、summary、触发条件和正文，并用不同颜色区分角色姓名卡片。</li><li><strong>多宠物记录：</strong>正式模式下，一个角色养过的' + mark('所有宠物', 'pink') + '都会归入该角色记录里，便于回顾第 1 只、第 2 只……宠物的全部旅程。</li></ul>',
      '<h3>## 7. 桌宠模式怎么玩？</h3>',
      '<ul><li><strong>开启：</strong>点击“遛弯”并确认后，会离开灵息小窝，宠物作为可拖动桌宠陪在插件页面上。进入灵息小窝会退出桌宠模式。</li><li><strong>正文成长：</strong>桌宠开启期间，每生成 3 次 RP 正文增加 1 点成长值；计数按正文完成事件累计，不按在线时长计算。</li><li><strong>拖动：</strong>无论状态栏、聊天框是否打开，都可以拖动宠物移动位置。</li><li><strong>戳一戳：</strong>点击宠物会展开扇形按钮：互动、状态、聊天、回家；再次点击宠物会收起。</li><li><strong>互动：</strong>互动下方有喂食、抚摸、玩球。喂食/抚摸会更新数值；玩球超过 3 次可增加成长值。</li><li><strong>状态：</strong>显示宠物名、' + mark('灵息状态', 'blue') + '、成长/饱食/开心进度，界面很小巧，适合边玩边看。</li><li><strong>聊天：</strong>宠物会作为 {{user}} 的宠物和旁观者，结合最近剧情评论或聊天，回复约 50 字左右。</li><li><strong>回家：</strong>关闭桌宠并返回养宠页面。</li></ul>',
      '<h3>## 8. 新手目标</h3>',
      '<ul><li>每天进小屋看看宠物，喂食、抚摸或遛弯。</li><li>关注成长值，成长值满时通常会触发阶段剧情。</li><li>偶尔切换场景，部分支线需要特定地点或时间。</li><li>剧情后写一篇日志，记录今天发生了什么。</li><li>最终把宠物养大，让它成为属于你们的灵息宠物，或者陪它选择普通但温柔的生活。</li></ul>',
      '</div>'
    ].join('');
    mask.innerHTML = '<div class="wb-modal wb-pet-modal wb-pet-tutorial-modal"><div class="wb-pet-modal-head"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-tutorial-close">' + petUiIcon('back') + '</button><div class="wb-pet-modal-title">灵息小窝教程</div><span class="wb-pet-help-mark">?</span></div><div class="wb-pet-scroll">' + manual + '</div></div>';
    appendModalMask(mask);
    qs('#wb-pet-tutorial-close', mask).onclick = () => mask.remove();
  }

  function openNextPetStoryPrompt(info) {
    const state = petTestState();
    if (state.activeStory && state.activeStory.id) return;
    const id = petNextPendingStoryId(info, state);
    if (!id) return;
    const story = petStoryForPending(info, state, id);
    const doc = getHostDocument();
    const old = qs('#wb-pet-story-prompt', doc); if (old) old.remove();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-story-prompt';
    const finalStory = id === 'M15';
    const summaryText = finalStory
      ? (petDisplayName(info, state) + '打算回到灵息缝隙了。你确定要现在和它告别么？')
      : petRenderText(story?.summary || '有新的剧情可以体验。', info, state);
    mask.innerHTML = '<div class="wb-modal wb-pet-modal wb-mini-modal wb-pet-story-choice"><div class="wb-pet-story-choice-title">触发' + (/^S/.test(id) ? '支线剧情：' : '主线剧情：') + '</div><div class="wb-pet-story-choice-name">' + esc(petRenderText(story?.title || id, info, state)) + '</div><div class="wb-pet-story-choice-summary">' + esc(summaryText) + '</div><div class="wb-actions" style="margin-top:12px;"><button class="wb-btn primary" id="wb-pet-story-play" style="flex:1;">' + (finalStory ? '确定' : '进入剧情') + '</button><button class="wb-btn" id="wb-pet-story-skip">' + (finalStory ? '再陪它一会' : '放弃剧情') + '</button></div></div>';
    appendModalMask(mask);
    qs('#wb-pet-story-play', mask).onclick = () => {
      const next = petTestState();
      next.activeStory = { id, prompt:false, index:0, page:0, done:false, replay:false };
      savePetTestState(next);
      mask.remove();
      renderPetHouseLoaded(info, next);
    };
    qs('#wb-pet-story-skip', mask).onclick = () => {
      mask.remove();
      if (finalStory) {
        const next = petTestState();
        next.finalConfirmed = false;
        next.pendingStories = (next.pendingStories || []).filter(x => x !== id);
        savePetTestState(next);
        renderPetHouseLoaded(info, next);
        return;
      }
      completePetStory(info, id, false);
    };
  }
  function bindPetStoryInlineControls(info, room) {
    const play = qs('#wb-pet-story-play', room);
    if (play) play.onclick = e => {
      e.stopPropagation();
      const state = petTestState();
      if (!state.activeStory || !state.activeStory.id) return;
      state.activeStory = { id:state.activeStory.id, prompt:false, index:0, page:0, done:false, replay:false };
      savePetTestState(state);
      renderPetHouseLoaded(info, state);
    };
    const skip = qs('#wb-pet-story-skip', room);
    if (skip) skip.onclick = e => {
      e.stopPropagation();
      const state = petTestState();
      if (state.activeStory && state.activeStory.id) completePetStory(info, state.activeStory.id, false);
    };
    const next = qs('#wb-pet-story-next', room);
    const advance = () => {
      const state = petTestState();
      const active = state.activeStory || {};
      if (!active.id || active.prompt) return;
      if (active.done) {
        if (active.replay) { state.activeStory = null; savePetTestState(state); toast('剧情回放已结束'); renderPetHouse(); return; }
        completePetStory(info, active.id, true); return;
      }
      const view = petStoryLineAt(info, state, active);
      if (view.page + 1 < view.pages.length) state.activeStory = { id:active.id, prompt:false, index:view.index, page:view.page + 1, done:false, replay:!!active.replay };
      else if (view.index + 1 >= view.lines.length) state.activeStory = { id:active.id, prompt:false, index:view.index, page:view.page, done:true, replay:!!active.replay };
      else state.activeStory = { id:active.id, prompt:false, index:view.index + 1, page:0, done:false, replay:!!active.replay };
      savePetTestState(state);
      renderPetHouseLoaded(info, state);
    };
    if (next) next.onclick = e => { e.stopPropagation(); advance(); };
    const close = qs('#wb-pet-story-close', room);
    if (close) close.onclick = e => {
      e.stopPropagation();
      const state = petTestState();
      state.activeStory = null;
      savePetTestState(state);
      renderPetHouseLoaded(info, state);
    };
    const storyTap = e => {
      if (e) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      }
      if (e.target && e.target.closest && e.target.closest('button')) return;
      const now = Date.now();
      if (now < petStoryTapLockedUntil) return;
      petStoryTapLockedUntil = now + 70;
      const state = petTestState();
      if (state.activeStory && state.activeStory.id && state.activeStory.prompt) { state.activeStory = { id:state.activeStory.id, prompt:false, index:0, page:0, done:false, replay:false }; savePetTestState(state); renderPetHouseLoaded(info, state); return; }
      if (state.activeStory && state.activeStory.id && !state.activeStory.prompt) advance();
    };
    const dialogue = qs('#wb-pet-dialogue', room);
    if (dialogue) dialogue.onclick = storyTap;
    if (room) room.onclick = storyTap;
  }
  function completePetStory(info, id, experienced) {
    let state = petTestState();
    const story = petStoryForPending(info, state, id);
    const isSideStory = /^S/.test(id);
    const alreadyCompleted = (state.completedSide || []).includes(id) || (state.completedMain || []).includes(id);
    state.pendingStories = (state.pendingStories || []).filter(x => x !== id);
    if (isSideStory) state.sideTriggered = (state.sideTriggered || []).filter(x => x !== id);
    state.dismissedStories = (state.dismissedStories || []).filter(x => x !== id);
    state.activeStory = null;
    state = markPetStoryComplete(state, id, story, state.route);
    if (isSideStory && experienced && !alreadyCompleted) state = petApplyStoryGrowth(state, 5, 'sideStory', '支线剧情记录');
    if (id === 'M11') {
      savePetTestState(state);
      openPetRouteChoice(info);
      return;
    }
    if (id === 'M14') state.endingReady = true;
    if (experienced) state.lastCharLine = '这段剧情已经记录下来了。';
    state = updatePetPendingStories(state, info);
    savePetTestState(state);
    toast('剧情已保存');
    if (id === 'M15') {
      const fullCaretaker = petFullActiveCaretaker();
      if (fullCaretaker) {
        state.ended = true;
        state.endedAt = Date.now();
        savePetTestState(state);
        toast('当前宠物旅程已完成，可以领养新的宠物了');
        renderPetHouse();
        return;
      }
      showConfirm('开始下一个宠物？', petDisplayName(info, state) + '的结局已经保存。是否开始下一个宠物试用版？旧宠物记录会归档保留。', () => {
        const ended = petTestState();
        const fresh = defaultPetTestState();
        fresh.testEgg = ended.testEgg;
        fresh.testSpecies = ended.testSpecies;
        fresh.userName = ended.userName || settings().userName || '';
        fresh.archives = [ended].concat(ended.archives || []).slice(0, 10);
        savePetTestState(fresh);
        renderPetHouse();
      }, renderPetHouse);
      return;
    }
    renderPetHouse();
  }
  function openPetStoryPlayer(info, id) {
    const state = petTestState();
    const story = petStoryForPending(info, state, id);
    const lines = story?.lines?.length ? story.lines : parsePetStoryLines(story?.story || '');
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-story-player';
    let index = 0;
    const draw = () => {
      const visible = lines.slice(0, index + 1);
      const hasShen = visible.some(line => line.speaker === '沈栖白');
      mask.innerHTML = '<div class="wb-modal wb-summary-modal"><div class="wb-modal-title">' + esc(petRenderText(story.title || id, info, state)) + '</div>'
        + (hasShen ? '<img src="' + esc(PET_ASSET_BASE + 'scene/shenqibai.png') + '" alt="" style="width:min(42vw,512px);height:min(42vw,512px);max-width:512px;max-height:512px;object-fit:contain;float:right;margin:0 0 10px 12px;border:1px solid var(--wb-border);background:transparent;">' : '')
        + '<div class="wb-api-status wb-text-segments" style="max-height:52vh;overflow:auto;">' + visible.map(line => petRpgLineHTML(line, info, state)).join('') + '</div>'
        + '<div class="wb-actions" style="margin-top:12px;"><button class="wb-btn primary" id="wb-pet-story-next" style="flex:1;">' + (index + 1 >= lines.length ? '保存剧情' : '继续') + '</button><button class="wb-btn" id="wb-pet-story-close">稍后</button></div></div>';
      qs('#wb-pet-story-next', mask).onclick = () => {
        if (index + 1 >= lines.length) { mask.remove(); completePetStory(info, id, true); return; }
        index++;
        draw();
      };
      qs('#wb-pet-story-close', mask).onclick = () => mask.remove();
    };
    appendModalMask(mask);
    draw();
  }
  function openPetRouteChoice(info) {
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-route-choice';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">选择契机</div><div class="wb-api-status">' + esc(petDisplayName(info, petTestState())) + '已经获得选择未来形态的机会。选择灵息路线会进入 magic 形态；选择普通路线会继续保持 adult 形态。</div><div class="wb-actions" style="margin-top:12px;"><button class="wb-btn primary" id="wb-pet-route-spirit" style="flex:1;">成为灵息宠物</button><button class="wb-btn" id="wb-pet-route-ordinary" style="flex:1;">保持普通形态</button></div></div>';
    appendModalMask(mask);
    const choose = route => {
      const next = Object.assign({}, petTestState(), { route, stage:route, growth:0, petAction:'normal', pendingStories:[] });
      savePetTestState(updatePetPendingStories(next, info));
      mask.remove();
      renderPetHouse();
    };
    qs('#wb-pet-route-spirit', mask).onclick = () => choose('spirit');
    qs('#wb-pet-route-ordinary', mask).onclick = () => choose('ordinary');
  }
  function petDayGrowthTotal(day) {
    const d = day || {};
    const recorded = Number(d.growth || 0) + Number(d.growthAdd || 0);
    if (recorded > 0) return recorded;
    return Number(d.feed || 0) * 2 + Number(d.pet || 0) * 2 + Number(d.play || 0) * 3 + Number(d.outing || 0) * 2;
  }
  function openPetRecords(info) {
    injectPetArcadeStyle();
    const baseState = petTestState();
    const fullCtx = petFullRecordContext(info, baseState);
    const fullMode = !!(fullCtx && fullCtx.pets.length);
    const makeItems = () => {
      if (fullMode) return fullCtx.pets;
      const archived = (baseState.archives || []).slice().reverse().map((st, i) => ({ pet:null, petIndex:i + 1, info, state:Object.assign(defaultPetTestState(), st || {}) }));
      return archived.concat([{ pet:null, petIndex:archived.length + 1, info, state:baseState }]);
    };
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-records-mask';
    const head = title => '<div class="wb-pet-modal-head"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-records-close">' + petUiIcon('back') + '</button><div class="wb-pet-modal-title">' + esc(title) + '</div><span></span></div>';
    appendModalMask(mask);
    const close = () => mask.remove();
    const bindClose = () => { const b = qs('#wb-pet-records-close', mask); if (b) b.onclick = close; };
    const drawHome = () => {
      mask.innerHTML = '<div class="wb-modal wb-pet-modal">' + head('记录') + '<div class="wb-pet-scroll"><div class="wb-pet-card-list"><button class="wb-btn primary wb-pet-record-home" data-page="dates">日期记录</button><button class="wb-btn wb-pet-record-home" data-page="dex">图鉴</button><button class="wb-btn wb-pet-record-home" data-page="logs">日志记录</button><button class="wb-btn wb-pet-record-home" data-page="stories">剧情记录</button></div></div></div>';
      bindClose();
      qsa('.wb-pet-record-home', mask).forEach(btn => btn.onclick = () => ({ dates:drawDates, dex:drawDex, logs:drawLogs, stories:drawStories })[btn.dataset.page]());
    };
    const allDayEntries = () => {
      const out = [];
      makeItems().forEach(ctx => {
        Object.keys(ctx.state.days || {}).forEach(date => out.push({ date, day:ctx.state.days[date] || {}, ctx }));
        out.push({ date:ctx.state.firstVisitDate || todayKey(), day:{ adopted:true, snapshot:ctx.state.firstSnapshot || ctx.state }, ctx });
      });
      return out;
    };
    const dayTotals = () => allDayEntries().reduce((acc, row) => {
      if (!row.day.adopted) acc[row.date] = Number(acc[row.date] || 0) + petDayGrowthTotal(row.day);
      return acc;
    }, {});
    const dexEggs = ['blue','purple','pink','green','gold','white'];
    const dexEggNames = { blue:'蓝色蛋', purple:'紫色蛋', pink:'粉色蛋', green:'绿色蛋', gold:'金色蛋', white:'蓝白蛋' };
    const dexSpecies = ['rabbit','fox','dog','cat','bird','bala'];
    const dexForms = [
      { id:'baby', name:'幼崽', stage:'juvenile', story:'M05' },
      { id:'adult', name:'成年', stage:'adult', story:'M08' },
      { id:'magic', name:'灵息', stage:'spirit', story:'M12' }
    ];
    const dexStageReached = (state, formId) => {
      const st = String(state?.stage || 'egg');
      const completed = new Set(state?.completedMain || []);
      if (formId === 'egg') return true;
      if (formId === 'baby') return st !== 'egg' || completed.has('M05');
      if (formId === 'adult') return ['adult','ordinary','spirit'].includes(st) || completed.has('M08');
      if (formId === 'magic') return st === 'spirit' || completed.has('M12');
      return false;
    };
    const dexSpriteUrl = (ctx, species, formId, action) => {
      if (formId === 'egg') return PET_ASSET_BASE + 'eggs/' + (dexEggs.includes(species) ? species : 'green') + '-1.png';
      return PET_ASSET_BASE + species + '/' + formId + '/' + petStateClass(action || 'normal') + '.png';
    };
    const dexDateRank = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
    const dexMinDate = dates => dates.map(dexDateRank).filter(Boolean).sort()[0] || '';
    const dexStateUnlockDate = (ctx, formId) => {
      const state = ctx?.state || {};
      if (formId === 'egg') return dexDateRank(state.firstVisitDate) || todayKey();
      const storyId = formId === 'baby' ? 'M05' : (formId === 'adult' ? 'M08' : 'M12');
      const dates = (state.storyRecords || []).filter(x => x && x.id === storyId).map(x => x.date);
      Object.keys(state.days || {}).forEach(date => {
        const snap = state.days[date] && state.days[date].snapshot;
        if (snap && dexStageReached(snap, formId)) dates.push(date);
      });
      if (state.firstSnapshot && dexStageReached(state.firstSnapshot, formId)) dates.push(state.firstVisitDate);
      const found = dexMinDate(dates);
      return found || (dexStageReached(state, formId) ? (dexDateRank(state.firstVisitDate) || todayKey()) : '');
    };
    const dexEntries = () => {
      const unlocked = new Map();
      makeItems().forEach(ctx => {
        const species = (ctx?.info?.pet_card?.species || ctx?.state?.testSpecies || '').replace(/[^a-z]/g, '');
        const egg = (ctx?.info?.pet_card?.egg || ctx?.state?.testEgg || '').replace(/[^a-z]/g, '');
        if (egg && dexEggs.includes(egg) && dexStageReached(ctx.state, 'egg')) {
          const key = egg + ':egg';
          const date = dexStateUnlockDate(ctx, 'egg');
          const prev = unlocked.get(key);
          if (!prev || (date && date < prev.date)) unlocked.set(key, { ctx, date });
        }
        if (!species || !dexSpecies.includes(species)) return;
        dexForms.forEach(form => {
          if (!dexStageReached(ctx.state, form.id)) return;
          const key = species + ':' + form.id;
          const date = dexStateUnlockDate(ctx, form.id);
          const prev = unlocked.get(key);
          if (!prev || (date && date < prev.date)) unlocked.set(key, { ctx, date });
        });
      });
      const eggEntries = dexEggs.map(species => ({ species, form:{ id:'egg', name:'宠物蛋', stage:'egg' } }));
      const animalEntries = dexSpecies.flatMap(species => dexForms.map(form => ({ species, form })));
      return eggEntries.concat(animalEntries).map(entry => {
        const got = unlocked.get(entry.species + ':' + entry.form.id);
        return Object.assign(entry, { ctx:got && got.ctx, unlocked:!!got, date:(got && got.date) || '' });
      });
    };
    const petDexPixelIcon = key => {
      const eggKeys = new Set(['blue', 'purple', 'pink', 'green', 'gold', 'white']);
      const palette = {
        rabbit:'#ffb6ca', fox:'#ff9a42', dog:'#d69b68', cat:'#fffdf4', bird:'#81d884', bala:'#c59b72'
      };
      const fill = eggKeys.has(key) ? '#ffd45c' : (palette[key] || 'var(--wb-accent)');
      const dark = '#22324d', light = '#fffdf4', blush = '#ff8fa3', beak = '#ffd45c';
      const r = (x, y, w, h, c) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" fill="' + c + '"/>';
      const egg = () => [r(9,3,6,2,fill),r(7,5,10,3,fill),r(5,8,14,4,fill),r(4,12,16,5,fill),r(6,17,12,3,fill),r(8,20,8,1,dark),r(6,10,3,2,light),r(13,6,2,2,light)].join('');
      const maps = {
        rabbit:[r(7,2,3,7,fill),r(14,2,3,7,fill),r(8,3,1,5,light),r(15,3,1,5,light),r(5,9,14,10,fill),r(7,18,10,2,fill),r(8,12,2,2,dark),r(14,12,2,2,dark),r(11,15,2,1,dark),r(7,15,2,1,blush),r(15,15,2,1,blush)],
        fox:[r(8,4,2,2,fill),r(7,6,4,4,fill),r(14,4,2,2,fill),r(13,6,4,4,fill),r(8,6,1,2,light),r(15,6,1,2,light),r(6,8,12,9,fill),r(8,12,8,5,light),r(10,15,4,3,light),r(8,10,2,2,dark),r(14,10,2,2,dark),r(11,14,2,2,dark),r(4,16,5,3,fill),r(15,16,5,3,fill)],
        dog:[r(4,7,5,8,'#8d6749'),r(15,7,5,8,'#8d6749'),r(7,6,10,10,fill),r(8,14,8,5,light),r(8,10,2,2,dark),r(14,10,2,2,dark),r(11,13,2,2,dark),r(10,16,4,1,dark),r(9,7,2,2,light),r(6,17,4,2,fill),r(14,17,4,2,fill)],
        cat:[r(8,4,2,2,fill),r(7,6,4,4,fill),r(14,4,2,2,fill),r(13,6,4,4,fill),r(8,7,1,2,blush),r(15,7,1,2,blush),r(6,8,12,10,fill),r(8,15,8,4,'#eaf7ff'),r(8,11,2,2,dark),r(14,11,2,2,dark),r(11,14,2,1,dark),r(8,16,2,1,blush),r(15,16,2,1,blush),r(3,13,4,1,dark),r(17,13,4,1,dark),r(3,15,4,1,dark),r(17,15,4,1,dark)],
        bird:[r(10,4,6,4,fill),r(7,8,11,9,fill),r(5,10,4,5,fill),r(18,10,3,2,beak),r(14,8,2,2,dark),r(9,17,8,2,fill),r(10,19,2,2,dark),r(15,19,2,2,dark),r(9,8,3,2,light)],
        bala:[r(5,8,14,9,fill),r(7,6,3,3,fill),r(15,6,3,3,fill),r(7,17,10,2,fill),r(8,11,2,2,dark),r(15,11,2,2,dark),r(11,13,3,2,'#6f5038'),r(9,15,6,1,dark),r(6,9,2,2,light)]
      };
      const body = maps[key] ? maps[key].join('') : egg();
      return '<svg class="wb-pet-dex-pixel-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' + body + '</svg>';
    };
    const drawDex = () => {
      const entries = dexEntries();
      const count = entries.filter(x => x.unlocked).length;
      const total = dexEggs.length + dexSpecies.length * dexForms.length;
      const cards = entries.map((entry, idx) => {
        const no = String(idx + 1).padStart(2, '0');
        const dateText = entry.unlocked ? (entry.date ? petDateCN(entry.date) : '已解锁') : '???';
        const formName = entry.unlocked ? entry.form.name : '未解锁';
        const art = dexSpriteUrl(entry.ctx, entry.species, entry.form.id, 'normal');
        const happy = dexSpriteUrl(entry.ctx, entry.species, entry.form.id, 'happy');
        const visual = !entry.unlocked
          ? '<div class="wb-pet-dex-shadow ' + (entry.form.id === 'egg' ? 'egg' : esc(entry.form.id)) + '" style="--wb-pet-sprite:url(' + esc(art) + ')"></div><div class="wb-pet-dex-question">?</div>'
          : (entry.form.id === 'egg'
            ? '<img class="wb-pet-dex-egg" src="' + esc(art) + '" alt="">'
            : '<div class="wb-pet-dex-fox ' + esc(entry.form.id) + ' normal" data-normal="' + esc(art) + '" data-happy="' + esc(happy) + '" style="--wb-pet-sprite:url(' + esc(art) + ')"></div>');
        const corner = '<div class="wb-pet-dex-trinket-mini trinket-' + esc(entry.species) + '">' + petDexPixelIcon(entry.species) + '</div>';
        return '<button class="wb-pet-dex-card ' + (entry.unlocked ? 'unlocked' : 'locked') + '" type="button" data-form="' + esc(entry.form.id) + '" data-species="' + esc(entry.species) + '"><div class="wb-pet-dex-no">No.' + no + '</div>' + corner + '<div class="wb-pet-dex-art">' + visual + '</div><div class="wb-pet-dex-name">' + esc(dateText) + '</div><div class="wb-pet-dex-form">' + esc(formName) + '</div></button>';
      }).join('');
      mask.innerHTML = '<div class="wb-modal wb-pet-modal wb-pet-dex-modal">' + head('图鉴') + '<button class="wb-btn" id="wb-pet-dex-home">返回目录</button><div class="wb-pet-scroll"><div class="wb-pet-dex-head"><div><strong>灵息图鉴</strong><span>当前角色全部宠物</span></div><b>' + count + '/' + total + '</b></div><div class="wb-pet-dex-progress" style="--v:' + Math.round(count / total * 100) + '%"><span></span></div><div class="wb-pet-dex-grid">' + cards + '</div></div></div>';
      bindClose();
      qs('#wb-pet-dex-home', mask).onclick = drawHome;
      qsa('.wb-pet-dex-card.unlocked', mask).forEach(card => card.onclick = () => {
        const sprite = qs('.wb-pet-dex-fox', card);
        if (sprite) sprite.style.setProperty('--wb-pet-sprite', 'url(' + (sprite.dataset.happy || sprite.dataset.normal || '') + ')');
        card.classList.add('happy');
        if (sprite) sprite.classList.add('animating');
        setTimeout(() => {
          if (sprite) {
            sprite.style.setProperty('--wb-pet-sprite', 'url(' + (sprite.dataset.normal || '') + ')');
            sprite.classList.remove('animating');
          }
          card.classList.remove('happy');
        }, 1500);
      });
    };
    const drawDates = (offset = 0) => {
      const base = new Date(); base.setMonth(base.getMonth() + offset, 1);
      const y = base.getFullYear(), m = base.getMonth();
      const first = new Date(y, m, 1).getDay();
      const daysIn = new Date(y, m + 1, 0).getDate();
      const totals = dayTotals();
      const cells = [];
      ['日','一','二','三','四','五','六'].forEach(x => cells.push('<div style="text-align:center;font-weight:900;">' + x + '</div>'));
      for (let i = 0; i < first; i++) cells.push('<div></div>');
      for (let d = 1; d <= daysIn; d++) {
        const key = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const grow = Number(totals[key] || 0);
        const hot = grow >= 50 ? 5 : (grow >= 30 ? 4 : (grow >= 15 ? 3 : (grow >= 5 ? 2 : (grow > 0 ? 1 : 0))));
        cells.push('<button class="wb-btn wb-pet-day hot' + hot + '" title="' + esc(key + ' +' + grow) + '">' + d + '</button>');
      }
      const rows = allDayEntries().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(row => {
        const day = row.day || {};
        if (day.adopted) return '<div class="wb-pet-record-entry compact">' + petSnapshotHTMLForInfo(day.snapshot || row.ctx.state, row.ctx.info) + '<div class="wb-pet-record-main"><div class="wb-pet-record-date">' + esc(petDateCN(row.date)) + '</div><div class="wb-pet-record-title">第' + row.ctx.petIndex + '只 · 收养了' + esc(petDisplayName(row.ctx.info, day.snapshot ? petSnapshotState(day.snapshot) : row.ctx.state)) + '</div></div></div>';
        const add = petDayGrowthTotal(day);
        const tags = [['喂食', day.feed], ['抚摸', day.pet], ['遛弯', day.outing], ['游戏', day.play], ['游戏时长+', day.playTime], ['破纪录+', day.record]].filter(x => Number(x[1] || 0) > 0).map(x => '<span class="wb-pet-record-tag">' + x[0] + x[1] + '</span>').join('');
        return '<div class="wb-pet-record-entry compact">' + petSnapshotHTMLForInfo(day.snapshot || row.ctx.state, row.ctx.info) + '<div class="wb-pet-record-main"><div class="wb-pet-record-date">' + esc(petDateCN(row.date)) + ' · +' + add + '</div><div class="wb-pet-record-title">第' + row.ctx.petIndex + '只 · ' + esc(petDisplayName(row.ctx.info, day.snapshot ? petSnapshotState(day.snapshot) : row.ctx.state)) + '</div><div class="wb-pet-record-tags">' + (tags || '<span class="wb-pet-record-tag">无互动</span>') + '</div></div></div>';
      }).join('') || '<div class="wb-api-status">暂无成长记录</div>';
      mask.innerHTML = '<div class="wb-modal wb-pet-modal">' + head(y + '年' + (m + 1) + '月') + '<div class="wb-pet-cal-fixed"><div class="wb-actions"><button class="wb-btn" id="wb-pet-cal-prev">上一月</button><button class="wb-btn" id="wb-pet-cal-home">返回目录</button><button class="wb-btn" id="wb-pet-cal-next">下一月</button></div><div class="wb-pet-calendar" style="margin:6px 0 0;">' + cells.join('') + '</div></div><div class="wb-pet-scroll wb-pet-cal-scroll"><div class="wb-pet-card-list">' + rows + '</div></div></div>';
      bindClose();
      qs('#wb-pet-cal-home', mask).onclick = drawHome;
      qs('#wb-pet-cal-prev', mask).onclick = () => drawDates(offset - 1);
      qs('#wb-pet-cal-next', mask).onclick = () => drawDates(offset + 1);
    };
    const logItems = () => {
      const rows = [];
      makeItems().forEach(ctx => Object.keys(ctx.state.logs || {}).forEach(date => rows.push({ date, log:Object.assign({ date }, ctx.state.logs[date] || {}), ctx })));
      return rows.sort((a,b) => Number(b.log.savedAt || 0) - Number(a.log.savedAt || 0) || String(b.date).localeCompare(String(a.date)));
    };
    const drawLogs = () => {
      const logs = logItems();
      const list = logs.map((row, i) => {
        const time = petTimeHM(row.log.savedAt);
        const dateText = petDateCN(row.date) + (time ? ' · ' + time : '');
        return '<button class="wb-pet-record-entry compact wb-pet-record-log" data-i="' + i + '">' + petSnapshotHTMLForInfo(row.log.snapshot || row.ctx.state, row.ctx.info) + '<div class="wb-pet-record-main"><div class="wb-pet-record-date">' + esc(dateText) + ' · 第' + row.ctx.petIndex + '只</div><div class="wb-pet-record-title">' + esc(row.log.title || '日志') + '</div></div></button>';
      }).join('') || '<div class="wb-api-status">暂无日志</div>';
      mask.innerHTML = '<div class="wb-modal wb-pet-modal">' + head('日志记录') + '<button class="wb-btn" id="wb-pet-log-home">返回目录</button><div class="wb-pet-scroll"><div class="wb-pet-card-list">' + list + '</div></div></div>';
      bindClose();
      qs('#wb-pet-log-home', mask).onclick = drawHome;
      qsa('.wb-pet-record-log', mask).forEach(btn => btn.onclick = () => {
        const row = logs[Number(btn.dataset.i)];
        mask.innerHTML = '<div class="wb-modal wb-pet-modal">' + head(row.log.title || '日志') + '<button class="wb-btn" id="wb-pet-log-list">返回列表</button><div class="wb-pet-scroll">' + petLogPageHTML(row.log, row.ctx.state, row.ctx.info) + '</div></div>';
        bindClose();
        qs('#wb-pet-log-list', mask).onclick = drawLogs;
      });
    };
    const storyItems = () => {
      const rows = [];
      makeItems().forEach(ctx => (ctx.state.storyRecords || []).forEach(item => rows.push({ item, ctx })));
      return rows.sort((a,b) => Number(b.item?.savedAt || 0) - Number(a.item?.savedAt || 0) || String(b.item?.date || '').localeCompare(String(a.item?.date || '')));
    };
    const drawStories = () => {
      const stories = storyItems();
      const list = stories.map((row, i) => {
        const item = row.item || {};
        const time = petTimeHM(item.savedAt);
        const dateText = petDateCN(item.date || todayKey()) + (time ? ' · ' + time : '');
        const type = /^S/.test(item.id || '') ? '支线' : '主线';
        return '<button class="wb-pet-record-entry compact wb-pet-record-story" data-i="' + i + '">' + petSnapshotHTMLForInfo(item.snapshot || row.ctx.state, row.ctx.info) + '<div class="wb-pet-record-main"><div class="wb-pet-record-date">' + esc(dateText) + ' · 第' + row.ctx.petIndex + '只</div><div class="wb-pet-record-title"><span class="wb-pet-record-story-tag" data-type="' + esc(type) + '">' + esc(type) + '</span>' + esc(petRenderText(item.title || item.id, row.ctx.info, row.ctx.state)) + '</div></div></button>';
      }).join('') || '<div class="wb-api-status">暂无剧情</div>';
      mask.innerHTML = '<div class="wb-modal wb-pet-modal">' + head('剧情记录') + '<button class="wb-btn" id="wb-pet-story-home">返回目录</button><div class="wb-pet-scroll"><div class="wb-pet-card-list">' + list + '</div></div></div>';
      bindClose();
      qs('#wb-pet-story-home', mask).onclick = drawHome;
      qsa('.wb-pet-record-story', mask).forEach(btn => btn.onclick = () => {
        const row = stories[Number(btn.dataset.i)];
        const item = row.item || {};
        mask.innerHTML = '<div class="wb-modal wb-pet-modal">' + head(item.title || '剧情') + '<button class="wb-btn" id="wb-pet-story-list">返回列表</button><div class="wb-pet-scroll">' + petStoryPageHTML(item, row.ctx.info, row.ctx.state) + '</div></div>';
        bindClose();
        qs('#wb-pet-story-list', mask).onclick = drawStories;
        const replay = qs('.wb-pet-story-replay', mask);
        if (replay) replay.onclick = e => {
          e.stopPropagation();
          petMiniConfirm('回放剧情？', '是否回放当前剧情？', () => {
            if (fullMode && row.ctx.pet) petFullSetActivePet(fullCtx.caretaker.id, row.ctx.pet.id);
            petTestInfoCache = row.ctx.info;
            const next = Object.assign(defaultPetTestState(), row.ctx.state, { activeStory:{ id:item.id, prompt:false, index:0, page:0, done:false, replay:true } });
            savePetTestState(next);
            mask.remove();
            renderPetHouseLoaded(row.ctx.info, next);
          });
        };
      });
    };
    drawHome();
  }

  function parsePetGeneratedLog(text, today) {
    const raw = String(text || '');
    const pick = key => {
      const m = raw.match(new RegExp(key + '\\s*:\\s*"?([^"\\n]+)"?', 'i'));
      return m ? m[1].trim() : '';
    };
    const diary = (raw.match(/diary\s*:\s*\|-\s*\n([\s\S]*)/i) || [])[1];
    return {
      date: today,
      pet_name: pick('pet_name'),
      pet_stage: pick('pet_stage'),
      title: pick('title') || (petDateCN(today) + ' 灵息日志'),
      tags: (pick('tags') || '').split(/[,，、\s]+/).filter(Boolean),
      weather: pick('weather'),
      relationship_delta: pick('relationship_delta'),
      memory_anchor: pick('memory_anchor'),
      body: (diary || raw).replace(/<\/?daily_pet_log>/g, '').trim()
    };
  }
  function openPetLogModal(info) {
    injectPetArcadeStyle();
    const state = petTestState();
    const today = todayKey();
    const existing = state.logs[today] || null;
    const doc = getHostDocument();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-pet-log-mask';
    const currentModel = settings().apiModel || '本地预览';
    const apiOptions = '<option value="">当前API配置（' + esc(currentModel) + '）</option>' + apiPresets().map((p, i) => '<option value="' + i + '">' + esc((p.name || ('预设' + (i + 1))) + ' · ' + (p.apiModel || '未选模型')) + '</option>').join('') + '<option value="__local">本地预览</option>';
    let generated = null;
    const renderPreview = () => generated ? petLogPageHTML(generated, state, info) : '';
    mask.innerHTML = '<div class="wb-modal wb-pet-modal"><div class="wb-pet-modal-head"><button class="wb-btn wb-pet-iconbtn" id="wb-pet-log-close">' + petUiIcon('back') + '</button><div class="wb-pet-modal-title">写日志</div><span></span></div><div class="wb-pet-scroll"><label class="wb-switch"><input id="wb-pet-auto-log" type="checkbox" ' + (settings().petAutoDailyLog ? 'checked' : '') + '>每日自动记录日志：' + (settings().petAutoDailyLog ? '开' : '关') + '</label><div class="wb-muted" style="margin:-4px 0 8px;">开启后每日进入小屋时，会自动调用当前模型记录前一天日志；无记录、无 API 或已存在日志时不会更新。</div><label class="wb-field"><span>选择模型</span><select class="wb-select" id="wb-pet-log-model">' + apiOptions + '</select></label><label class="wb-field"><span>今天做了什么</span><textarea class="wb-textarea" id="wb-pet-log-note" style="min-height:72px;" placeholder="可以写下今天额外发生的事，会和系统LOG一起进入日志输入。"></textarea></label><button class="wb-btn primary" type="button" id="wb-pet-log-generate">生成</button><div id="wb-pet-log-preview" style="margin-top:12px;">' + renderPreview() + '</div></div><div class="wb-actions" style="margin-top:10px;"><button class="wb-btn primary" type="button" id="wb-pet-log-save" style="flex:1;">保存</button><button class="wb-btn" type="button" id="wb-pet-log-regen" style="flex:1;">重新生成</button></div></div>';
    appendModalMask(mask);
    const generate = async () => {
      const note = (qs('#wb-pet-log-note', mask)?.value || '').trim();
      const active = doc.activeElement;
      if (active && typeof active.blur === 'function') active.blur();
      const btn = qs('#wb-pet-log-generate', mask);
      const regen = qs('#wb-pet-log-regen', mask);
      if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }
      if (regen) regen.disabled = true;
      try {
        const selectedApi = qs('#wb-pet-log-model', mask)?.value || '';
        const api = selectedApi === '__local' ? { apiUrl:'', apiKey:'', apiModel:'' } : apiFieldsFromPresetIndex(selectedApi);
        const cfg = Object.assign({}, petCaretakerPromptConfig(), api);
        generated = await generatePetDailyLog(info, state, note, cfg);
        const preview = qs('#wb-pet-log-preview', mask); if (preview) preview.innerHTML = renderPreview();
      } catch(e) {
        toast('日志生成失败：' + (e && e.message ? e.message : e));
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = generated ? '重新生成' : '生成'; }
        if (regen) regen.disabled = false;
      }
    };
    qs('#wb-pet-log-generate', mask).onclick = generate;
    qs('#wb-pet-log-regen', mask).onclick = generate;
    const autoLog = qs('#wb-pet-auto-log', mask);
    if (autoLog) autoLog.onchange = () => {
      setSettings({ petAutoDailyLog:!!autoLog.checked });
      const label = autoLog.closest('label');
      if (label) {
        Array.from(label.childNodes).forEach(node => { if (node.nodeType === 3) node.nodeValue = '每日自动记录日志：' + (autoLog.checked ? '开' : '关'); });
      }
      toast(autoLog.checked ? '已开启每日自动记录日志' : '已关闭每日自动记录日志');
    };
    qs('#wb-pet-log-save', mask).onclick = () => {
      if (!generated) { toast('请先生成日志'); return; }
      const saveNow = () => {
        const next = petTestState();
        next.logs = Object.assign({}, next.logs || {}, { [today]:Object.assign({}, generated, { savedAt:Date.now(), date:today, pet_name:petDisplayName(info, next, generated?.pet_name || '宠物'), pet_stage:petDisplayStage(next), snapshot:petSnapshotData(next) }) });
        savePetTestState(next);
        mask.remove();
        toast('日志已保存');
        renderPetHouse();
      };
      if (existing) petMiniConfirm('覆盖当天日志？', '当前保存会覆盖当天日志，是否确定？', saveNow);
      else saveNow();
    };
    qs('#wb-pet-log-close', mask).onclick = () => mask.remove();
  }


  function renderSelect(mode) {
    syncPopupModeClass();
    const body = qs('#wb-body'); body.className = 'wb-body'; const ids = Object.values(GAME_META).filter(g => g.mode === mode).map(g => g.id);
    body.innerHTML = '<div class="wb-cardgrid">' + ids.map(id => { const g = GAME_META[id]; return '<div class="wb-game-card" data-game="' + id + '">' + gameIconHTML(g) + '<div class="wb-game-info"><div class="wb-game-name">' + esc(g.name) + '</div><div class="wb-muted">' + esc(cardScoreDisplay(id)) + '</div></div></div>'; }).join('') + '</div>';
    qsa('.wb-game-card', body).forEach(c => c.onclick = () => { currentGame = c.dataset.game; if (GAME_META[currentGame]) currentTab = GAME_META[currentGame].mode; saveWindowState(currentTab, currentGame); renderGame(currentGame); });
  }

  function markdownLiteHTML(text) {
    return markdownTextHTML(text);
  }
  function showGameRules(game) {
    const g = GAME_META[game] || { name:'游戏' };
    const doc = getHostDocument();
    const old = qs('#wb-rules-mask', doc); if (old) old.remove();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-rules-mask';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">' + esc(g.name) + ' · 游戏介绍</div><div class="wb-api-status wb-text-segments">' + markdownLiteHTML(GAME_RULES[game] || '暂无介绍。') + '</div><div class="wb-actions" style="margin-top:12px;justify-content:flex-end;"><button class="wb-btn" id="wb-rules-close">关闭</button></div></div>';
    if (standalone) {
      const instructions = qs('.wb-text-segments', mask);
      instructions.dataset.i18nRules = game;
      instructions.textContent = localizedGameRules(game, GAME_RULES[game] || '暂无介绍。');
      instructions.style.whiteSpace = 'pre-line';
    }
    appendModalMask(mask);
    qs('#wb-rules-close', mask).onclick = () => mask.remove();
  }

  function renderStandaloneSettings() {
    const cfg = settings(), body = qs('#wb-body');
    const allowDownloads = standaloneAppInfo.nativeSelfUpdateEnabled !== false;
    const allowAppUpdater = standaloneAppInfo.appUpdaterEnabled === true;
    syncPopupModeClass();
    body.className = 'wb-body wb-settings-mode';
    body.innerHTML = '<div class="wanba-settings">'
      + '<section class="wb-panel"><div class="wb-section-title">外观与进度</div><div class="wb-field"><label for="wb-theme">界面主题</label><select class="wb-select" id="wb-theme">' + STANDALONE_THEMES.map(([id,name]) => '<option value="' + id + '">' + name + '</option>').join('') + '</select></div>'
      + '<div class="wb-field"><label><input type="checkbox" id="wb-remember-window">下次打开时回到上次游戏</label><p class="wb-muted">游戏进度会自动保存到本机。返回游戏时可选择继续；此开关只控制打开应用后的页面。</p></div></section>'
      + '<section class="wb-panel"><div class="wb-section-title">游戏备份</div><p>备份包含游戏进度、历史记录和主题设置。换机前请先导出；导入也支持玩伴小屋的旧版游戏备份。</p><div class="wb-actions"><button class="wb-btn primary" id="wb-export-data">导出备份</button><button class="wb-btn" id="wb-import-data">导入备份</button><input type="file" id="wb-import-file" accept="application/json,.json" hidden></div><p class="wb-muted" id="wb-import-export-status" role="status">数据保存在当前设备，卸载应用会删除本机存档。</p></section>'
      + '<section class="wb-panel"><div class="wb-section-title">关于玩吧</div><p id="wanba-version">版本 ' + esc(standaloneAppInfo.appVersion) + ' · ' + esc(standaloneAppInfo.flavorLabel) + '</p><p id="wanba-engine">内核：' + esc(standaloneAppInfo.engineLabel) + (standaloneAppInfo.engineVersion ? ' ' + esc(standaloneAppInfo.engineVersion) : '') + (standaloneAppInfo.source === 'native' ? '' : '（浏览器检测）') + '</p>' + '<p>游戏基线 ' + esc(EXTENSION_VERSION) + ' · ' + Object.keys(GAME_META).length + ' 款游戏</p><p>单人游戏与人机挑战均可离线游玩。</p><div class="wb-actions">' + (allowDownloads ? '<button class="wb-btn" id="wanba-downloads">下载更新</button>' : '') + (allowAppUpdater ? '<button class="wb-btn" id="wanba-app-update">检查更新</button>' : '') + '<button class="wb-btn" id="wanba-credits">开源致谢</button></div>' + (allowDownloads ? '<p class="wb-muted">从下载页安装新版本即可保留存档。请使用同一来源的更新包，无需卸载。</p>' : '') + '</section></div>';
    qs('#wb-theme').value = cfg.theme;
    mountLanguagePicker(qs('.wanba-settings', body));
    mountPerformancePicker(qs('.wanba-settings', body));
    qs('#wb-remember-window').checked = cfg.rememberWindow;
    qs('#wb-theme').onchange = () => { setSettings({theme:qs('#wb-theme').value}); syncPopupModeClass(); toast('主题已保存'); };
    qs('#wb-remember-window').onchange = () => setSettings({rememberWindow:qs('#wb-remember-window').checked});
    qs('#wb-export-data').onclick = exportAllData;
    qs('#wb-import-data').onclick = () => qs('#wb-import-file').click();
    qs('#wb-import-file').onchange = importAllDataFromFile;
    if (allowDownloads) qs('#wanba-downloads').onclick = () => {
      if (typeof window.NativeBridge?.openDownloads === 'function') window.NativeBridge.openDownloads();
      else window.open('https://github.com/JackLee992/USER_HOUSE_ANDROID/releases', '_blank', 'noopener,noreferrer');
    };
    if (allowAppUpdater) qs('#wanba-app-update').onclick = () => {
      try {
        const result = window.NativeBridge?.openAppUpdater?.();
        result?.catch?.(error => toast(error.message || '更新暂不可用，请稍后重试'));
      } catch (error) { toast(error.message || '更新暂不可用，请稍后重试'); }
    };
    qs('#wanba-credits').onclick = () => {
      const mask = getHostDocument().createElement('div'); mask.className = modalMaskClass(); mask.id = 'wanba-credits-mask';
      const engineCredit = standaloneAppInfo.flavor === 'compat'
        ? '兼容版内置 Mozilla GeckoView，主要采用 MPL 2.0，并包含各自许可证下的第三方组件。完整条款与对应源码信息可在下方离线查看。'
        : standaloneAppInfo.flavor === 'system' ? '系统版使用设备提供的 Android System WebView；游戏文件随应用提供。' : '当前为浏览器预览，内核由打开页面的浏览器提供。';
      mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">开源致谢</div><div class="wb-api-status wb-text-segments"><p>玩吧基于 Gloria 的 USER_HOUSE / 玩伴小屋游戏集合及 JackLee992 的 3.10.0 版本改造。</p><p>三维弹球引擎：SpaceCadetPinball，k4zmu2a 与 alula 等贡献者，MIT 许可证。随包球台资源：Open Space Cadet，CC0。高清球台与应用图标使用生成素材。</p><p>' + engineCredit + '</p><p>完整来源与构建说明随仓库提供，许可证可在本机离线查看。</p></div><div class="wb-actions"><button class="wb-btn" id="wanba-licenses">查看许可证</button><button class="wb-btn" id="wanba-credits-close">关闭</button></div></div>';
      appendModalMask(mask); qs('#wanba-credits-close',mask).onclick = () => mask.remove();
      qs('#wanba-licenses',mask).onclick = showStandaloneLicenses;
    };
  }

  function showStandaloneLicenses() {
    const files = standaloneLicenses(standaloneAppInfo.flavor);
    const mask = getHostDocument().createElement('div'); mask.className = modalMaskClass(); mask.id = 'wanba-licenses-mask';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">开源许可证</div><div class="wanba-license-list">' + files.map(({id,label}) => '<button class="wb-btn" data-license="' + id + '">' + esc(label) + '</button>').join('') + '</div><div class="wb-actions"><button class="wb-btn" id="wanba-licenses-close">关闭</button></div></div>';
    appendModalMask(mask); qs('#wanba-licenses-close',mask).onclick = () => mask.remove();
    qsa('[data-license]',mask).forEach(button => button.onclick = async () => {
      const file = files.find(({id}) => id === button.dataset.license);
      if (!file) return;
      const viewer = getHostDocument().createElement('div'); viewer.className = modalMaskClass(); viewer.id = 'wanba-license-view-mask';
      viewer.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">' + esc(file.label) + '</div><pre class="wanba-license-text" role="document">正在读取本地许可证…</pre><div class="wb-actions"><button class="wb-btn" id="wanba-license-view-close">关闭</button></div></div>';
      appendModalMask(viewer); qs('#wanba-license-view-close',viewer).onclick = () => viewer.remove();
      try {
        const response = await fetch(file.url);
        if (!response.ok) throw Error('许可证文件未随当前安装包提供');
        const text = await response.text();
        if (viewer.isConnected) qs('.wanba-license-text',viewer).textContent = text;
      } catch (error) {
        if (viewer.isConnected) qs('.wanba-license-text',viewer).textContent = '读取失败：' + error.message;
      }
    });
  }

  function renderSettings() {
    if (standalone) { renderStandaloneSettings(); return; }
    const cfg = settings();
    const body = qs('#wb-body');
    body.className = 'wb-body wb-settings-mode';
    const apis = apiPresets();
    const injPresets = worldPresets();
    const sums = summaries();
    const apiOptions = '<option value="">— 选择预设载入 —</option>' + apis.map((x,i) => '<option value="' + i + '">' + esc(x.name || ('预设' + (i + 1))) + '</option>').join('');
	    const savedWorldNameRaw = String(cfg.selectedWorldPresetName || '').trim();
	    const savedWorldName = savedWorldNameRaw ? normalizePresetName(savedWorldNameRaw) : '';
	    let activeWorldIndex = savedWorldName ? injPresets.findIndex(x => normalizePresetName(x && x.name) === savedWorldName) : -1;
	    if (activeWorldIndex < 0) activeWorldIndex = injPresets.findIndex(x => normalizePresetName(x && x.name) === normalizePresetName(companionName()));
		    const injOptions = '<option value=""' + (activeWorldIndex < 0 ? ' selected' : '') + '>— 当前角色 —</option>' + injPresets.map((x,i) => '<option value="' + i + '"' + (i === activeWorldIndex ? ' selected' : '') + '>' + esc(x.name || ('预设' + (i + 1))) + '</option>').join('');
	    const sumOptions = '<option value="">— 不注入 —</option>' + sums.map(x => '<option value="' + esc(x.id) + '">' + esc(x.name || '大总结') + '</option>').join('');
		    const lineRoleOptions = roleNamesForLineStorage().map(name => '<option value="' + esc(name) + '">' + esc(name) + '</option>').join('');
		    const lineGameOptions = Object.values(GAME_META).map(g => '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>').join('');
		    const fontOptions = '<option value="">默认字体</option>' + customFonts().map(f => '<option value="' + esc(f.name) + '">' + esc(f.name) + '</option>').join('');
		    const languageOptions = specialLanguageOptions().map(x => '<option value="' + esc(x) + '">' + esc(x) + '</option>').join('');
		    const charPreview = currentCharDescription(Object.assign({}, cfg, { injectCharDesc: true }));
    body.innerHTML = '<div class="wb-settings-grid">'
      + updatePanelHTML()
      + '<div class="wb-panel"><div class="wb-section-title">基础设置</div>'
      + '<label class="wb-switch"><input id="wb-companion-toggle" type="checkbox" ' + (cfg.companion ? 'checked' : '') + '>开启陪伴模式</label>'
      + '<div id="wb-companion-suboptions" style="' + (cfg.companion ? '' : 'display:none;') + '">'
      + '<label class="wb-switch"><input id="wb-theater-toggle" type="checkbox" ' + (cfg.theaterEnabled ? 'checked' : '') + '>开启小剧场</label>'
      + '<label class="wb-switch"><input id="wb-auto-log-toggle" type="checkbox" ' + (cfg.autoLog ? 'checked' : '') + '>自动记录日志</label>'
      + '<label class="wb-inline-select-row"><span>陪伴对话位置<span class="wb-inline-hint">电脑端左右，移动端上下</span></span><select class="wb-select" id="wb-companion-dock"><option value="end">右 / 下</option><option value="start">左 / 上</option></select></label>'
      + '</div>'
      + '<label class="wb-switch"><input id="wb-remember-window" type="checkbox" ' + (cfg.rememberWindow ? 'checked' : '') + '>保留上一次窗口</label>'
      + '<label class="wb-switch"><input id="wb-floating-ball" type="checkbox" ' + (cfg.floatingBallEnabled ? 'checked' : '') + '>开启悬浮球入口</label>'
      + '<label class="wb-switch"><input id="wb-message-notify" type="checkbox" ' + (cfg.messageNotify ? 'checked' : '') + '>RP正文完成提醒</label>'
      + '<div class="wb-muted" style="font-size:11px;margin-top:-10px;padding-left:24px;line-height:1;">防沉迷系统（不是）</div>'
      + '<div class="wb-preset-row"><span class="wb-muted" style="flex:1;">正文标签：&lt;' + esc(cfg.messageNotifyTag || 'content') + '&gt;...&lt;/' + esc(cfg.messageNotifyTag || 'content') + '&gt;</span><button class="wb-btn" id="wb-message-tag-btn">设置正文标签</button></div>'
	      + '<div class="wb-field"><label>美化主题</label><select class="wb-select" id="wb-theme"><option value="tavern">跟随酒馆美化主题</option><option value="day">【日】梦幻掌机</option><option value="arcade">【日】晴日信箱</option><option value="spring">【日】春野物语</option><option value="mono">【日】黑白像素</option><option value="night">【夜】霓虹游戏舱</option><option value="cyber">【夜】赛博街机</option><option value="card">【夜】红黑牌剧场</option></select></div>'
	      + '<div class="wb-field"><label>全局字体</label><div class="wb-preset-row"><select class="wb-select" id="wb-font-select">' + fontOptions + '</select><button class="wb-btn" id="wb-font-edit" type="button">编辑</button></div></div>'
      + '</div>'
      + '<div class="wb-panel"><div class="wb-section-title">API 配置</div>'
      + '<div class="wb-api-status" id="wb-current-api-model">当前模型：' + esc(cfg.apiModel || '未配置') + '</div>'
      + '<div class="wb-section-title no-mark" style="font-size:12px;margin-top:8px;">API 预设</div>'
      + '<div class="wb-preset-row"><select class="wb-select" id="wb-api-preset">' + apiOptions + '</select><button class="wb-btn" id="wb-load-api-preset">载入</button><button class="wb-btn" id="wb-del-api-preset">删</button></div>'
      + '<button class="wb-btn" id="wb-api-details-toggle" type="button">展开配置预设模型</button>'
      + '<div id="wb-api-details" style="display:none;gap:10px;">'
      + '<div class="wb-field"><label>API 基础 URL</label><input class="wb-input" type="url" id="wb-api-url" placeholder="https://api.example.com" value="' + esc(cfg.apiUrl) + '"></div>'
      + '<div class="wb-field"><label>API 密钥</label><input class="wb-input" type="password" id="wb-api-key" placeholder="sk-..." value="' + esc(cfg.apiKey) + '"></div>'
      + '<div class="wb-actions"><button class="wb-btn" id="wb-load-models-btn" style="flex:1;">加载模型列表</button></div>'
      + '<div class="wb-field"><label>选择模型</label><select class="wb-select" id="wb-api-model"><option value="">请先加载模型列表</option></select></div>'
      + '<div class="wb-api-status" id="wb-api-status">状态: 未配置</div>'
      + '<div class="wb-actions"><button class="wb-btn primary" id="wb-save-api-config" style="flex:1;">保存API配置</button><button class="wb-btn" id="wb-clear-api-config">清除</button></div>'
      + '<div class="wb-preset-save-row"><input class="wb-input" type="text" id="wb-api-preset-name" placeholder="命名并保存当前 API 配置..."><button class="wb-btn" id="wb-save-api-preset">保存</button></div>'
      + '</div>'
      + '</div>'
	      + '<div class="wb-panel"><div class="wb-section-title">世界观注入</div>'
      + '<div class="wb-section-title no-mark" style="font-size:12px;margin-top:4px;">当前默认角色设置</div>'
      + '<div class="wb-preset-row"><select class="wb-select" id="wb-world-preset">' + injOptions + '</select><button class="wb-btn" id="wb-load-world-preset">载入</button><button class="wb-btn" id="wb-del-world-preset">删</button></div>'
      + '<button class="wb-btn" id="wb-injection-details-toggle" type="button">展开详细配置</button>'
      + '<div id="wb-injection-details" style="display:none;gap:10px;">'
      + '<label class="wb-switch"><input id="wb-lazy-world-inject" type="checkbox" ' + (cfg.lazyWorldInject ? 'checked' : '') + '>懒人模式 <span class="wb-muted" style="font-size:11px;">（当前角色卡全部信息）</span></label>'
	      + '<label class="wb-switch"><input type="checkbox" id="wb-inject-user-desc" ' + (cfg.injectUserDesc !== false ? 'checked' : '') + '> 用户设定描述</label>'
      + '<div class="wb-field"><div class="wb-preset-row"><label style="flex:1;">用户来源</label><select class="wb-select" id="wb-user-desc-source"><option value="auto">自动导入当前User人设</option><option value="manual">手动添加</option></select></div><textarea class="wb-textarea" id="wb-user-persona" placeholder="填写 user 的设定、性格、关系、偏好；自动模式会读取当前 persona...">' + esc(cfg.userPersona) + '</textarea></div>'
      + '<label class="wb-switch"><input id="wb-inject-char-desc" type="checkbox" ' + (cfg.injectCharDesc !== false ? 'checked' : '') + '>角色描述</label>'
      + '<div class="wb-field"><div class="wb-preset-row"><label style="flex:1;">角色描述来源</label><select class="wb-select" id="wb-char-desc-mode"><option value="auto">自动导入当前角色卡</option><option value="manual">手动添加</option></select></div></div>'
      + '<div class="wb-field"><label>角色姓名（可选）</label><input class="wb-input" id="wb-char-name" placeholder="留空则读取当前角色卡姓名" value="' + esc(cfg.charName && cfg.charName !== '{{char}}' ? cfg.charName : '') + '"></div>'
      + '<div class="wb-field" id="wb-manual-char-wrap"><label>手动角色描述（自动保存）</label><textarea class="wb-textarea" id="wb-manual-char-persona" placeholder="手动填写当前角色的性格、说话方式、关系设定...">' + esc(cfg.manualCharPersona || '') + '</textarea></div>'
      + '<div class="wb-api-status wb-char-desc-preview" id="wb-char-desc-preview">' + esc(charPreview) + '</div>'
      + '<div class="wb-field"><label>世界观头像 URL（可选）</label><input class="wb-input" id="wb-avatar-url" placeholder="输入 URL 会优先作为头像；留空后点击保存头像会读取当前角色卡头像" value="' + esc(cfg.avatarUrl || '') + '"><div class="wb-actions"><button class="wb-btn" id="wb-save-current-avatar">保存头像</button><button class="wb-btn" id="wb-clear-avatar">清除世界观头像</button></div></div>'
      + '<label class="wb-switch"><input id="wb-special-language-enabled" type="checkbox" ' + (cfg.specialLanguageEnabled ? 'checked' : '') + '>特殊语言要求</label>'
      + '<div class="wb-field" id="wb-special-language-wrap" style="' + (cfg.specialLanguageEnabled ? '' : 'display:none;') + '"><div class="wb-preset-row"><label style="flex:1;">使用语言</label><select class="wb-select" id="wb-special-language">' + languageOptions + '</select></div></div>'
      + '<label class="wb-switch"><input id="wb-inject-chat" type="checkbox" ' + (cfg.injectChat ? 'checked' : '') + '>注入最新聊天记录</label>'
      + '<label class="wb-switch"><input id="wb-intimacy-mode" type="checkbox" ' + (cfg.intimacyMode ? 'checked' : '') + '>NSFW模式</label>'
      + '<div class="wb-field"><label>前置提示词 / 破限词（自动保存）</label><textarea class="wb-textarea" id="wb-break-limit-prompt" style="min-height:88px;" placeholder="可粘贴希望置于生成提示词最前面的风格补充；不会覆盖安全限制。">' + esc(cfg.breakLimitPrompt || '') + '</textarea></div>'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;"><span class="wb-muted">当前挂载的世界书</span><div class="wb-actions" style="gap:6px;"><button class="wb-btn" id="wb-world-auto-mount-btn" type="button">自动挂载</button><select class="wb-select" id="wb-world-auto-mount" style="min-width:128px;display:none;"><option value="">请选择灯色</option><option value="blue">蓝灯</option><option value="bluegreen">蓝灯+绿灯</option></select><button class="wb-btn" id="wb-refresh-worldbook">刷新全部条目</button></div></div><div class="wb-muted" id="wb-mounted-worldbook-names">未自动挂载。</div>'
      + '<div class="wb-worldbook-list" id="wb-worldbook-list"><span class="wb-muted">点击刷新以载入当前挂载的世界书条目...</span></div>'
      + '<div class="wb-section-title" style="font-size:12px;margin-top:4px;">导入大总结</div>'
      + '<div class="wb-preset-row"><select class="wb-select" id="wb-summary-select">' + sumOptions + '</select><button class="wb-btn" id="wb-manage-summary">管理/导入</button></div>'
      + '<div class="wb-api-status" id="wb-summary-preview">' + esc(summaryPreview(cfg.summaryId)) + '</div>'
      + '<div class="wb-actions"><button class="wb-btn primary" id="wb-save-world-preset" style="flex:1;">保存为当前角色配置</button><button class="wb-btn" id="wb-reset-current-world-default" style="flex:1;">恢复当前角色卡默认</button></div>'
      + '</div>'
	      + '</div>'
	      + '<div class="wb-panel"><div class="wb-section-title">游戏语录设置</div>'
		      + '<details class="wb-line-view-details"><summary class="wb-btn" style="display:block;text-align:center;">查看语录 / 小剧场</summary><div style="display:grid;gap:8px;margin-top:8px;">'
		      + '<div class="wb-preset-row"><select class="wb-select" id="wb-line-view-role">' + lineRoleOptions + '</select><select class="wb-select" id="wb-line-view-game">' + lineGameOptions + '</select><select class="wb-select" id="wb-line-view-kind"><option value="lines">语录</option><option value="theater">小剧场</option></select></div>'
		      + '<div class="wb-api-status wb-text-segments" id="wb-line-view-box" style="min-height:180px;max-height:260px;overflow:auto;"></div></div></details>'
	      + '<div class="wb-api-status" id="wb-line-generation-status" style="margin-top:10px;">' + esc(lineGenerationStatus) + '</div>'
	      + '<div class="wb-actions" style="margin-top:10px;"><button class="wb-btn primary" id="wb-batch-lines" style="flex:1;">批量生成角色数据</button><button class="wb-btn" id="wb-batch-debug-settings">调试</button></div>'
	      + '</div>'
	      + '<div class="wb-panel"><div class="wb-section-title">导出 / 导入</div>'
	      + '<div class="wb-muted">一键导出除 API 配置和 API 预设以外的全部内容；导入不会覆盖 API URL、密钥、模型。</div>'
	      + '<div class="wb-actions"><button class="wb-btn primary" id="wb-export-all" style="flex:1;">导出全部内容</button><button class="wb-btn" id="wb-import-all" style="flex:1;">导入备份</button><input type="file" id="wb-import-all-file" accept=".json,application/json" style="display:none;"></div>'
	      + '<div class="wb-api-status" id="wb-import-export-status">未选择文件。</div>'
	      + '</div>'
	      + '</div>';
	    qs('#wb-theme').value = cfg.theme;
	    const fontSelect = qs('#wb-font-select'); if (fontSelect) fontSelect.value = selectedFontConfig(cfg) ? cfg.selectedFont : '';
	    const langSelect = qs('#wb-special-language'); if (langSelect) langSelect.value = specialLanguageOptions().includes(cfg.specialLanguage) ? cfg.specialLanguage : '粤语';
    const charMode = qs('#wb-char-desc-mode'); if (charMode) charMode.value = cfg.charDescMode === 'manual' ? 'manual' : 'auto';
    const userSource = qs('#wb-user-desc-source'); if (userSource) userSource.value = cfg.userDescSource === 'auto' ? 'auto' : 'manual';
    const autoMount = qs('#wb-world-auto-mount'); if (autoMount) autoMount.value = ['blue','bluegreen'].includes(cfg.worldAutoMountMode) ? cfg.worldAutoMountMode : '';
    setWorldAutoMountControlText();
    const manualWrap = qs('#wb-manual-char-wrap'); if (manualWrap) manualWrap.style.display = cfg.charDescMode === 'manual' ? '' : 'none';
    qs('#wb-summary-select').value = cfg.summaryId || '';
    bindUpdatePanelEvents();
    populateModelSelect(cfg.apiModel);
    updateApiStatusUI();
    restoreSelectedWorldEntries();
    updateMountedWorldbookNames();
    qs('#wb-companion-toggle').onchange = () => {
      const toggle = qs('#wb-companion-toggle');
      const sub = qs('#wb-companion-suboptions');
      if (sub) sub.style.display = toggle && toggle.checked ? '' : 'none';
      if (toggle && toggle.checked && !settings().companion) {
        const th = qs('#wb-theater-toggle');
        if (th) th.checked = true;
        autoSaveBasicSettingsFromUI();
      } else autoSaveBasicSettingsFromUI();
    };
    const theaterToggle = qs('#wb-theater-toggle'); if (theaterToggle) theaterToggle.onchange = autoSaveBasicSettingsFromUI;
    const autoLogToggle = qs('#wb-auto-log-toggle'); if (autoLogToggle) autoLogToggle.onchange = autoSaveBasicSettingsFromUI;
    const dock = qs('#wb-companion-dock'); if (dock) { dock.value = companionDockSide(cfg); dock.onchange = autoSaveBasicSettingsFromUI; }
    const rememberWindowToggle = qs('#wb-remember-window'); if (rememberWindowToggle) rememberWindowToggle.onchange = autoSaveBasicSettingsFromUI;
    const floatingBallToggle = qs('#wb-floating-ball'); if (floatingBallToggle) floatingBallToggle.onchange = autoSaveBasicSettingsFromUI;
    const messageNotifyToggle = qs('#wb-message-notify'); if (messageNotifyToggle) messageNotifyToggle.onchange = () => { autoSaveBasicSettingsFromUI(); bindMessageNotifyEvents(); };
    const messageTagBtn = qs('#wb-message-tag-btn'); if (messageTagBtn) messageTagBtn.onclick = () => { const next = prompt('正文标签名', settings().messageNotifyTag || 'content'); if (next == null) return; const tag = String(next || '').replace(/[<>/\s]/g, '').trim() || 'content'; setSettings({ messageNotifyTag: tag }); renderSettings(); toast('正文标签已设置为 <' + tag + '>'); };
	    qs('#wb-theme').onchange = autoSaveBasicSettingsFromUI;
	    if (fontSelect) fontSelect.onchange = autoSaveBasicSettingsFromUI;
	    const fontEdit = qs('#wb-font-edit'); if (fontEdit) fontEdit.onclick = editCustomFontFromUI;
    const apiDetailsToggle = qs('#wb-api-details-toggle');
    if (apiDetailsToggle) apiDetailsToggle.onclick = () => {
      const details = qs('#wb-api-details');
      if (!details) return;
      const open = details.style.display === 'none';
      details.style.display = open ? 'grid' : 'none';
      apiDetailsToggle.textContent = open ? '收起配置预设模型' : '展开配置预设模型';
    };
    const avatarInput = qs('#wb-avatar-url'); if (avatarInput) avatarInput.oninput = debounceAutoSaveInjection;
    const saveAvatarBtn = qs('#wb-save-current-avatar'); if (saveAvatarBtn) saveAvatarBtn.onclick = () => { const input = qs('#wb-avatar-url'); const typed = input ? input.value.trim() : ''; if (typed) { autoSaveInjectionSettingsFromUI(); toast('已保存头像 URL，优先使用该头像'); return; } const url = findCurrentCardAvatar(); if (!url) { toast('未读取到当前角色卡头像'); return; } if (input) input.value = url; autoSaveInjectionSettingsFromUI(); toast('已保存当前角色卡头像到世界观注入'); };
    const clearAvatarBtn = qs('#wb-clear-avatar'); if (clearAvatarBtn) clearAvatarBtn.onclick = () => { const input = qs('#wb-avatar-url'); if (input) input.value = ''; autoSaveInjectionSettingsFromUI(); toast('已清除世界观头像'); };
    qs('#wb-load-models-btn').onclick = loadModelsFromUI;
    const apiModelSelect = qs('#wb-api-model'); if (apiModelSelect) apiModelSelect.onchange = updateApiStatusUI;
    qs('#wb-save-api-config').onclick = saveApiConfigFromUI;
    qs('#wb-clear-api-config').onclick = clearApiConfigFromUI;
    qs('#wb-save-api-preset').onclick = saveApiPresetFromUI;
    qs('#wb-load-api-preset').onclick = loadApiPresetFromUI;
    qs('#wb-del-api-preset').onclick = deleteApiPresetFromUI;
    const exportBtn = qs('#wb-export-all'); if (exportBtn) exportBtn.onclick = exportAllData;
    const importBtn = qs('#wb-import-all'); if (importBtn) importBtn.onclick = () => { const f = qs('#wb-import-all-file'); if (f) f.click(); };
	    const importFile = qs('#wb-import-all-file'); if (importFile) importFile.onchange = importAllDataFromFile;
	    const batchLinesBtn = qs('#wb-batch-lines'); if (batchLinesBtn) batchLinesBtn.onclick = openBatchLineGenerator;
	    const batchDebugSettings = qs('#wb-batch-debug-settings'); if (batchDebugSettings) batchDebugSettings.onclick = () => showBatchDebugModal(batchGenerationDebug);
	    const refreshLineView = () => {
	      const role = qs('#wb-line-view-role')?.value || companionName();
	      const game = qs('#wb-line-view-game')?.value || Object.keys(GAME_META)[0];
	      const box = qs('#wb-line-view-box');
	      const kind = qs('#wb-line-view-kind')?.value || 'lines';
	      if (box) box.innerHTML = markdownTextHTML(kind === 'theater' ? formatStoredTheaters(game, role) : formatStoredLineSet(game, storedLineSetForRoleGame(game, role)));
	    };
	    const lineRoleSel = qs('#wb-line-view-role'); if (lineRoleSel) lineRoleSel.onchange = refreshLineView;
	    const lineGameSel = qs('#wb-line-view-game'); if (lineGameSel) lineGameSel.onchange = refreshLineView;
	    const lineKindSel = qs('#wb-line-view-kind'); if (lineKindSel) lineKindSel.onchange = refreshLineView;
	    refreshLineView();
	    updateLineGenerationStatusUI();
    const injectionDetailsToggle = qs('#wb-injection-details-toggle');
    if (injectionDetailsToggle) injectionDetailsToggle.onclick = () => {
      const details = qs('#wb-injection-details');
      if (!details) return;
      const open = details.style.display === 'none';
      details.style.display = open ? 'grid' : 'none';
      injectionDetailsToggle.textContent = open ? '收起详细配置' : '展开详细配置';
    };
    const refreshWorldbook = qs('#wb-refresh-worldbook'); if (refreshWorldbook) refreshWorldbook.onclick = refreshWorldbookList;
    const lazyWorldInject = qs('#wb-lazy-world-inject'); if (lazyWorldInject) lazyWorldInject.onchange = async () => { autoSaveInjectionSettingsFromUI(); if (lazyWorldInject.checked) await applyLazyWorldInject(); };
    const userDescSource = qs('#wb-user-desc-source'); if (userDescSource) userDescSource.onchange = () => { if (userDescSource.value === 'auto') { const persona = readCurrentUserPersonaFromST(); const input = qs('#wb-user-persona'); if (input) input.value = formatAutoUserPersona(persona); toast(persona ? '已自动导入当前User人设' : '未读取到当前User人设，可手动补充'); } autoSaveInjectionSettingsFromUI(); };
    const worldAutoMountBtn = qs('#wb-world-auto-mount-btn'); if (worldAutoMountBtn) worldAutoMountBtn.onclick = openWorldAutoMountModal;
    const worldAutoMount = qs('#wb-world-auto-mount'); if (worldAutoMount) worldAutoMount.onchange = async () => { await applyWorldAutoMount(worldAutoMount.value || '', true); };
    if (worldAutoMount && worldAutoMount.value) setTimeout(() => applyWorldAutoMount(worldAutoMount.value, false), 0);
    ['#wb-inject-user-desc','#wb-inject-char-desc','#wb-char-desc-mode','#wb-special-language-enabled','#wb-special-language','#wb-inject-chat','#wb-intimacy-mode','#wb-summary-select'].forEach(sel => { const el = qs(sel); if (el) el.onchange = () => { const pv = qs('#wb-summary-preview'); if (pv) pv.textContent = summaryPreview(qs('#wb-summary-select').value); const wrap = qs('#wb-manual-char-wrap'); if (wrap && qs('#wb-char-desc-mode')) wrap.style.display = qs('#wb-char-desc-mode').value === 'manual' ? '' : 'none'; const langWrap = qs('#wb-special-language-wrap'); if (langWrap && qs('#wb-special-language-enabled')) langWrap.style.display = qs('#wb-special-language-enabled').checked ? '' : 'none'; autoSaveInjectionSettingsFromUI(); const preview = qs('#wb-char-desc-preview'); if (preview) preview.textContent = currentCharDescription(settings()); }; });
    const up = qs('#wb-user-persona'); if (up) up.oninput = debounceAutoSaveInjection;
    const mp = qs('#wb-manual-char-persona'); if (mp) mp.oninput = () => { const preview = qs('#wb-char-desc-preview'); if (preview) preview.textContent = currentCharDescription(Object.assign({}, settings(), { charDescMode: 'manual', manualCharPersona: mp.value.trim(), injectCharDesc: true })); debounceAutoSaveInjection(); };
    const cn = qs('#wb-char-name'); if (cn) cn.oninput = () => { const preview = qs('#wb-char-desc-preview'); if (preview) preview.textContent = currentCharDescription(Object.assign({}, settings(), { charName: cn.value.trim() || '{{char}}', injectCharDesc: true })); debounceAutoSaveInjection(); };
    const bp = qs('#wb-break-limit-prompt'); if (bp) bp.oninput = debounceAutoSaveInjection;
    qs('#wb-manage-summary').onclick = openSummaryManager;
    qs('#wb-save-world-preset').onclick = saveWorldPresetFromUI;
    qs('#wb-reset-current-world-default').onclick = resetCurrentWorldDefaultFromUI;
    const worldPresetSelect = qs('#wb-world-preset'); if (worldPresetSelect) worldPresetSelect.onchange = loadWorldPresetFromUI;
    qs('#wb-load-world-preset').onclick = loadWorldPresetFromUI;
    qs('#wb-del-world-preset').onclick = deleteWorldPresetFromUI;
  }

  let wbAutoSaveTimer = null;
	  function autoSaveBasicSettingsFromUI() {
	    const companion = !!(qs('#wb-companion-toggle') && qs('#wb-companion-toggle').checked);
	    const theme = qs('#wb-theme') ? qs('#wb-theme').value : settings().theme;
	    const selectedFont = qs('#wb-font-select') ? qs('#wb-font-select').value : settings().selectedFont;
	    const rememberWindow = !!(qs('#wb-remember-window') && qs('#wb-remember-window').checked);
	    const floatingBallEnabled = !!(qs('#wb-floating-ball') && qs('#wb-floating-ball').checked);
	    const messageNotify = !!(qs('#wb-message-notify') && qs('#wb-message-notify').checked);
	    const theaterEnabled = companion && !!(qs('#wb-theater-toggle') && qs('#wb-theater-toggle').checked);
	    const autoLog = companion && !!(qs('#wb-auto-log-toggle') && qs('#wb-auto-log-toggle').checked);
	    const companionDock = qs('#wb-companion-dock') && qs('#wb-companion-dock').value === 'start' ? 'start' : 'end';
	    const companionDockPc = companionDock === 'start' ? 'left' : 'right';
	    const companionDockMobile = companionDock === 'start' ? 'top' : 'bottom';
	    const patch = { companion, theme, selectedFont, rememberWindow, floatingBallEnabled, messageNotify, theaterEnabled, autoLog, companionDock, companionDockPc, companionDockMobile };
	    if (rememberWindow) { patch.lastTab = currentTab || 'single'; patch.lastGame = currentGame || ''; }
	    setSettings(patch);
	    syncPopupModeClass();
	    applySelectedFont();
	    syncFloatingBall();
	  }
	  function editCustomFontFromUI() {
	    const cfg = settings();
	    const current = selectedFontConfig(cfg);
	    const name = prompt('字体名称', current ? current.name : '');
	    if (name == null) return;
	    const cleanName = String(name || '').trim();
	    if (!cleanName) { toast('请输入字体名称'); return; }
	    const url = prompt('字体 URL', current ? current.url : '');
	    if (url == null) return;
	    const cleanUrl = String(url || '').trim();
	    if (!cleanUrl) { toast('请输入字体 URL'); return; }
	    const fonts = customFonts().filter(f => f.name !== cleanName);
	    fonts.unshift({ name: cleanName, url: cleanUrl });
	    setSettings({ customFonts: fonts, selectedFont: cleanName });
	    applySelectedFont();
	    renderSettings();
	    toast('字体已保存并应用');
	  }
  function selectedWorldPresetNameFromUI() {
    const sel = qs('#wb-world-preset');
    if (!sel || sel.value === '') return '';
    const pr = worldPresets()[parseInt(sel.value, 10)];
    const name = String((pr && pr.name) || '').trim();
    return name ? normalizePresetName(name) : '';
  }
  function roleNameFromWorldUI() {
    const typed = qs('#wb-char-name') ? qs('#wb-char-name').value.trim() : '';
    return normalizePresetName(typed || companionName());
  }
  function autoSaveInjectionSettingsFromUI() {
    if (!qs('#wb-inject-user-desc')) return;
    setSettings({
      lazyWorldInject: !!(qs('#wb-lazy-world-inject') && qs('#wb-lazy-world-inject').checked),
      injectUserDesc: qs('#wb-inject-user-desc').checked,
      injectCharDesc: qs('#wb-inject-char-desc').checked,
      injectChat: qs('#wb-inject-chat').checked,
      specialLanguageEnabled: !!(qs('#wb-special-language-enabled') && qs('#wb-special-language-enabled').checked),
      specialLanguage: qs('#wb-special-language') ? qs('#wb-special-language').value : '粤语',
      intimacyMode: !!(qs('#wb-intimacy-mode') && qs('#wb-intimacy-mode').checked),
      breakLimitPrompt: qs('#wb-break-limit-prompt') ? qs('#wb-break-limit-prompt').value.trim() : '',
      userDescSource: qs('#wb-user-desc-source') ? (qs('#wb-user-desc-source').value === 'auto' ? 'auto' : 'manual') : 'manual',
      userPersona: qs('#wb-user-persona').value.trim(),
      charDescMode: qs('#wb-char-desc-mode') ? qs('#wb-char-desc-mode').value : 'auto',
      manualCharPersona: qs('#wb-manual-char-persona') ? qs('#wb-manual-char-persona').value.trim() : '',
      charName: (qs('#wb-char-name') && qs('#wb-char-name').value.trim()) || '{{char}}',
      avatarUrl: qs('#wb-avatar-url') ? qs('#wb-avatar-url').value.trim() : '',
      summaryId: qs('#wb-summary-select').value || '',
      worldAutoMountMode: qs('#wb-world-auto-mount') ? (qs('#wb-world-auto-mount').value || '') : '',
      selectedWorldEntries: selectedWorldEntriesFromUI(),
      selectedWorldPresetName: selectedWorldPresetNameFromUI()
    });
  }
  function debounceAutoSaveInjection() { if (wbAutoSaveTimer) clearTimeout(wbAutoSaveTimer); wbAutoSaveTimer = setTimeout(autoSaveInjectionSettingsFromUI, 250); }
  function flushSettingsProgress() {
    if (wbAutoSaveTimer) { clearTimeout(wbAutoSaveTimer); wbAutoSaveTimer = null; }
    if (qs('#wb-companion-toggle') || qs('#wb-theme') || qs('#wb-remember-window')) autoSaveBasicSettingsFromUI();
    if (qs('#wb-inject-user-desc')) autoSaveInjectionSettingsFromUI();
  }
  function saveBasicSettingsFromUI() {
    setSettings({ companion: qs('#wb-companion-toggle').checked, theme: qs('#wb-theme').value });
    toast('基础设置已保存'); render();
  }
  function populateModelSelect(model) {
    const sel = qs('#wb-api-model'); if (!sel) return;
    sel.innerHTML = model ? '<option value="' + esc(model) + '">' + esc(model) + '</option>' : '<option value="">请先加载模型列表</option>';
    if (model) sel.value = model;
  }
  function updateApiStatusUI() {
    const s = qs('#wb-api-status'); if (!s) return;
    const url = qs('#wb-api-url') ? qs('#wb-api-url').value.trim() : settings().apiUrl;
    const model = qs('#wb-api-model') ? qs('#wb-api-model').value : settings().apiModel;
    s.innerHTML = (url && model) ? ('URL: ' + esc(url) + '<br>模型: ' + esc(model)) : (url ? '已配置URL，请加载并选择模型' : '状态: 未配置');
    const current = qs('#wb-current-api-model');
    if (current) current.textContent = '当前模型：' + (model || '未配置');
  }
  function modelListUrl(url) {
    let base = (url || '').trim(); if (!base) return '';
    if (/\/chat\/completions\/?$/.test(base)) base = base.replace(/\/chat\/completions\/?$/, '/models');
    else { base = base.endsWith('/') ? base : base + '/'; if (!base.includes('/v1/') && !base.endsWith('v1/')) base += 'v1/'; base += 'models'; }
    return base;
  }
  async function loadModelsFromUI() {
    const url = qs('#wb-api-url').value.trim(); const key = qs('#wb-api-key').value.trim();
    if (!url) { toast('请输入API基础URL'); return; }
    const status = qs('#wb-api-status'); if (status) status.textContent = '正在加载模型列表...';
    try {
      const headers = { 'Content-Type': 'application/json' }; if (key) headers.Authorization = 'Bearer ' + key;
      const res = await fetch(modelListUrl(url), { method:'GET', headers });
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const data = await res.json();
      let models = [];
      if (data.data && Array.isArray(data.data)) models = data.data.map(m => m.id).filter(Boolean);
      else if (Array.isArray(data)) models = data.map(m => typeof m === 'string' ? m : m.id).filter(Boolean);
      const sel = qs('#wb-api-model'); sel.innerHTML = '';
      if (!models.length) { sel.innerHTML = '<option value="">未发现模型</option>'; toast('未能解析模型列表'); return; }
      models.forEach(m => { const opt = getHostDocument().createElement('option'); opt.value = m; opt.textContent = m; sel.appendChild(opt); });
      const saved = settings().apiModel; if (saved && models.includes(saved)) sel.value = saved;
      updateApiStatusUI(); toast('加载了 ' + models.length + ' 个模型');
    } catch(e) { if (status) status.textContent = '加载失败: ' + e.message; toast('加载失败: ' + e.message); }
  }
  function exportDataKeys() {
    if (standalone) return [STORAGE_SETTINGS, STORAGE_SCORES, STORAGE_PROGRESS, STORAGE_RECORDS, STORAGE_SUDOKU_STATE];
    return [
      STORAGE_SETTINGS,
      STORAGE_SCORES,
      STORAGE_LINES,
      STORAGE_ROLE_LINES,
      STORAGE_THEATERS,
      STORAGE_LINE_PRESET_SELECTION,
      STORAGE_WORLD_PRESETS,
      STORAGE_SUMMARIES,
      STORAGE_SUMMARY_REQ,
      STORAGE_PROGRESS,
      STORAGE_RECORDS,
      STORAGE_WORD_GUESS_BANK
    ];
  }
  function settingsWithoutApi(raw) {
    const out = Object.assign({}, raw || {});
    delete out.apiUrl;
    delete out.apiKey;
    delete out.apiModel;
    return out;
  }
  function sanitizeImportValue(key, value, currentApi) {
    if (key === STORAGE_SETTINGS) {
      const raw = safeObject(value);
      const clean = {};
      Object.keys(DEFAULT_SETTINGS).forEach(k => {
        if (Object.prototype.hasOwnProperty.call(raw, k)) clean[k] = raw[k];
      });
      clean.selectedWorldEntries = safeArray(clean.selectedWorldEntries);
      clean.customFonts = safeArray(clean.customFonts).filter(x => x && x.name && x.url);
      delete clean.apiUrl;
      delete clean.apiKey;
      delete clean.apiModel;
      const merged = Object.assign({}, DEFAULT_SETTINGS, clean, currentApi || {});
      return standalone ? constrainStandaloneSettings(merged) : merged;
    }
    if (key === STORAGE_WORLD_PRESETS || key === STORAGE_SUMMARIES) return safeArray(value).filter(x => x && typeof x === 'object');
    if (key === STORAGE_SETTINGS || key === STORAGE_SCORES || key === STORAGE_LINES || key === STORAGE_ROLE_LINES || key === STORAGE_THEATERS || key === STORAGE_LINE_PRESET_SELECTION || key === STORAGE_PROGRESS || key === STORAGE_RECORDS || key === STORAGE_SUDOKU_STATE) return safeObject(value);
    if (key === STORAGE_WORD_GUESS_BANK) return (Array.isArray(value) || isPlainObject(value)) ? value : {};
    if (key === STORAGE_SUMMARY_REQ) return String(value || '');
    return value == null ? {} : value;
  }
  function buildImportPlan(items) {
    if (!isPlainObject(items)) throw new Error('备份内容缺少 items 数据。');
    const currentApi = ((cfg) => ({ apiUrl: cfg.apiUrl || '', apiKey: cfg.apiKey || '', apiModel: cfg.apiModel || '' }))(settings());
    const plan = {};
    exportDataKeys().forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(items, key)) return;
      plan[key] = sanitizeImportValue(key, items[key], currentApi);
    });
    if (!Object.keys(plan).length) throw new Error('没有找到可导入的游戏数据。');
    if (plan[STORAGE_PROGRESS]) Object.entries(plan[STORAGE_PROGRESS]).forEach(([id,state]) => { if (GAME_META[id]) requireCompatibleSave(state,contentForGame(id)); });
    return plan;
  }
  function commitImportPlan(plan) {
    const originals = {};
    Object.keys(plan).forEach(key => { originals[key] = localStorage.getItem(key); });
    try {
      Object.keys(plan).forEach(key => {
        if (key === STORAGE_SUMMARY_REQ) localStorage.setItem(key, String(plan[key] || ''));
        else localStorage.setItem(key, JSON.stringify(plan[key]));
      });
    } catch(e) {
      Object.keys(originals).forEach(key => {
        try {
          if (originals[key] == null) localStorage.removeItem(key);
          else localStorage.setItem(key, originals[key]);
        } catch(restoreErr) {}
      });
      const quota = e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(e.message || ''));
      throw new Error(quota ? '手机端本地存储空间不足，已放弃导入并保留原数据。' : ('写入失败，已放弃导入并保留原数据：' + (e && e.message ? e.message : e)));
    }
  }
  function exportAllData() {
    saveStandaloneState();
    const data = { app:standalone ? '玩吧' : '玩伴小屋', scriptId:SCRIPT_ID, version:standalone ? standaloneAppInfo.appVersion : EXTENSION_VERSION, gameBaseline:EXTENSION_VERSION, exportedAt:new Date().toISOString(), items:{} };
    if (standalone) data.content = {snapshotId:contentState?.activeSnapshotId || 'builtin',games:Object.fromEntries(Object.keys(GAME_META).map(id => [id,contentForGame(id)]))};
    exportDataKeys().forEach(key => {
      if (key === STORAGE_SETTINGS) data.items[key] = settingsWithoutApi(loadJSON(key, {}));
      else if (key === STORAGE_SUMMARY_REQ) data.items[key] = localStorage.getItem(key) || '';
      else data.items[key] = loadJSON(key, null);
    });
    const text = JSON.stringify(data, null, 2);
    const filename = (standalone ? '玩吧' : '玩伴小屋') + '-备份-' + new Date().toISOString().slice(0,10) + '.json';
    if (standalone && typeof window.NativeBridge?.saveBackup === 'function') {
      try { window.NativeBridge.saveBackup(filename, text); } catch (error) { toast('无法导出备份：' + error.message); }
      return;
    }
    const blob = new Blob([text], { type:'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = getHostDocument().createElement('a');
    a.href = url;
    a.download = filename;
    getHostDocument().body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
    const st = qs('#wb-import-export-status'); if (st) st.textContent = standalone ? '已导出游戏进度、记录和主题设置。' : '已导出备份：不包含 API 配置和 API 预设。';
    toast('已导出备份');
  }
  function importAllDataFromFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || '{}'));
        const items = data.items || data;
        const plan = buildImportPlan(items);
        const st = qs('#wb-import-export-status'); if (st) st.textContent = '已读取备份：' + (file.name || '备份文件') + '，等待确认导入。';
        showConfirm('导入备份', standalone ? '备份中包含的游戏进度、记录和主题将覆盖对应的当前数据。写入失败会保留原数据。确定导入吗？' : '导入前会先校验并修复可恢复的数据；如果手机存储空间不足或写入失败，会放弃导入并保留当前数据。当前 API 配置和 API 预设会保留，不会被覆盖。确定要继续导入吗？', () => {
          try {
            commitImportPlan(plan);
          } catch(importErr) {
            const failStatus = qs('#wb-import-export-status'); if (failStatus) failStatus.textContent = '导入失败：' + (importErr && importErr.message ? importErr.message : importErr);
            toast('导入失败，已保留原数据');
            e.target.value = '';
            return;
          }
          theaterCache = safeObject(loadJSON(STORAGE_THEATERS, {}));
          const doneStatus = qs('#wb-import-export-status'); if (doneStatus) doneStatus.textContent = '已导入：' + (file.name || '备份文件') + (standalone ? '。' : '。API 配置和 API 预设已保留。');
          toast(standalone ? '游戏备份导入完成' : '导入完成，API 配置和 API 预设未被覆盖');
          renderSettings();
          e.target.value = '';
        }, () => {
          const cancelStatus = qs('#wb-import-export-status'); if (cancelStatus) cancelStatus.textContent = '已取消导入备份。';
          e.target.value = '';
        });
      } catch(err) {
        const st = qs('#wb-import-export-status'); if (st) st.textContent = '导入失败：' + (err && err.message ? err.message : err);
        toast('导入失败，未修改当前数据');
        e.target.value = '';
      }
    };
    reader.onerror = () => { toast('文件读取失败，未修改当前数据'); e.target.value = ''; };
    reader.readAsText(file, 'utf-8');
  }
  function saveApiConfigFromUI() { setSettings({ apiUrl: qs('#wb-api-url').value.trim(), apiKey: qs('#wb-api-key').value.trim(), apiModel: qs('#wb-api-model').value || 'gpt-4o-mini' }); updateApiStatusUI(); toast('API配置已保存'); }
  function clearApiConfigFromUI() { qs('#wb-api-url').value=''; qs('#wb-api-key').value=''; qs('#wb-api-model').innerHTML='<option value="">请先加载模型列表</option>'; setSettings({ apiUrl:'', apiKey:'', apiModel:'' }); updateApiStatusUI(); toast('API配置已清除'); }
  function saveApiPresetFromUI() {
    const name = qs('#wb-api-preset-name').value.trim(); if (!name) { toast('请输入 API 预设名称'); return; }
    const arr = apiPresets().filter(x => x.name !== name);
    arr.unshift({ name, apiUrl: qs('#wb-api-url').value.trim(), apiKey: qs('#wb-api-key').value.trim(), apiModel: qs('#wb-api-model').value || 'gpt-4o-mini' });
    saveApiPresets(arr); toast('API 预设已保存'); renderSettings();
  }
  function loadApiPresetFromUI() { const idx = parseInt(qs('#wb-api-preset').value, 10); const pr = apiPresets()[idx]; if (!pr) return; qs('#wb-api-url').value=pr.apiUrl||''; qs('#wb-api-key').value=pr.apiKey||''; populateModelSelect(pr.apiModel||''); updateApiStatusUI(); toast('API 预设已载入'); }
  function deleteApiPresetFromUI() { const idx = parseInt(qs('#wb-api-preset').value, 10); const arr = apiPresets(); if (!arr[idx]) return; showConfirm('删除 API 预设','确定删除这个 API 预设吗？',()=>{ arr.splice(idx,1); saveApiPresets(arr); renderSettings(); }); }
  function selectedWorldEntriesFromUI() { return qsa('#wb-worldbook-list .wb-tag.active').map(x => ({ label: x.dataset.label || x.textContent, content: x.dataset.content || '', wbName: x.dataset.wbName || '', uid: x.dataset.uid || '' })); }
  function selectedWorldText(cfg) { const entries = (cfg.selectedWorldEntries || []).filter(x => x && (x.content || x.label)); return entries.map(x => '[' + (x.label || '世界书条目') + ']\n' + (x.content || '')).join('\n\n'); }
  function selectedSummaryText(cfg) { if (cfg.summarySnapshot && (cfg.summarySnapshot.content || cfg.summarySnapshot.name)) return '[' + (cfg.summarySnapshot.name || '大总结') + ']\n' + (cfg.summarySnapshot.content || ''); if (!cfg.summaryId) return ''; const s = summaries().find(x => x.id === cfg.summaryId); return s ? ('[' + (s.name || '大总结') + ']\n' + (s.content || '')) : ''; }
  function restoreSelectedWorldEntries() { const cfg = settings(); if (cfg.selectedWorldEntries && cfg.selectedWorldEntries.length) renderWorldbookTags(cfg.selectedWorldEntries, true); }
  function renderWorldbookTags(entries, activeAll) {
    const list = qs('#wb-worldbook-list'); if (!list) return;
    if (!entries || !entries.length) { list.innerHTML = '<span class="wb-muted">当前未发现可读取的世界书条目</span>'; return; }
    list.innerHTML = '';
    entries.forEach(e => { const b = getHostDocument().createElement('button'); b.type='button'; b.className='wb-tag' + (activeAll ? ' active' : ''); b.textContent=e.label||'世界书条目'; b.dataset.label=e.label||'世界书条目'; b.dataset.content=e.content||''; b.dataset.wbName=e.wbName||''; b.dataset.uid=e.uid||''; b.title=(e.content||'').slice(0,160); b.onclick=()=>{ b.classList.toggle('active'); autoSaveInjectionSettingsFromUI(); }; list.appendChild(b); });
  }
  function setWorldAutoMountControlText() {
    const btn = qs('#wb-world-auto-mount-btn');
    const sel = qs('#wb-world-auto-mount');
    const mode = sel?.value || '';
    if (btn) {
      btn.textContent = mode ? ('自动挂载：' + (mode === 'blue' ? '蓝灯' : '蓝灯+绿灯')) : '自动挂载';
      btn.className = 'wb-btn' + (mode ? ' primary' : '');
    }
    if (sel) sel.style.display = 'none';
  }
  function openWorldAutoMountModal() {
    const doc = getHostDocument();
    const old = qs('#wb-world-auto-mount-mask', doc); if (old) old.remove();
    const mask = doc.createElement('div'); mask.className = modalMaskClass(); mask.id = 'wb-world-auto-mount-mask';
    const mode = qs('#wb-world-auto-mount')?.value || '';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">自动挂载世界书</div><div class="wb-api-status" style="margin-bottom:12px;">选择后会从当前角色世界书和已挂载世界书中，按灯色自动选中条目；需要手动刷新时请先关闭自动挂载。</div><div class="wb-actions"><button class="wb-btn ' + (mode === 'blue' ? 'primary' : '') + '" id="wb-auto-blue" style="flex:1;">蓝灯</button><button class="wb-btn ' + (mode === 'bluegreen' ? 'primary' : '') + '" id="wb-auto-bluegreen" style="flex:1;">蓝灯+绿灯</button></div><div class="wb-actions" style="margin-top:10px;"><button class="wb-btn" id="wb-auto-off" style="flex:1;">关闭自动挂载</button><button class="wb-btn" id="wb-auto-cancel">取消</button></div></div>';
    appendModalMask(mask);
    qs('#wb-auto-blue', mask).onclick = async () => { mask.remove(); await applyWorldAutoMount('blue', true); };
    qs('#wb-auto-bluegreen', mask).onclick = async () => { mask.remove(); await applyWorldAutoMount('bluegreen', true); };
    qs('#wb-auto-off', mask).onclick = async () => { mask.remove(); await applyWorldAutoMount('', true); };
    qs('#wb-auto-cancel', mask).onclick = () => mask.remove();
  }
  function updateMountedWorldbookNames() {
    const el = qs('#wb-mounted-worldbook-names');
    if (!el) return;
    const names = getCurrentWorldBookNames();
    const sel = qs('#wb-world-auto-mount');
    const mode = sel ? (sel.value || '') : (settings().worldAutoMountMode || '');
    el.textContent = names.length ? ('已发现：' + names.join('、') + (mode ? ('（自动挂载：' + (mode === 'blue' ? '蓝灯' : '蓝灯+绿灯') + '）') : '')) : '未发现当前角色卡或聊天挂载的世界书。';
  }
  async function updateMountedWorldbookNamesAsync() {
    const el = qs('#wb-mounted-worldbook-names');
    if (!el) return;
    const names = await getCurrentWorldBookNamesAsync();
    const sel = qs('#wb-world-auto-mount');
    const mode = sel ? (sel.value || '') : (settings().worldAutoMountMode || '');
    el.textContent = names.length ? ('已发现：' + names.join('、') + (mode ? ('（自动挂载：' + (mode === 'blue' ? '蓝灯' : '蓝灯+绿灯') + '）') : '')) : '未发现当前角色卡或聊天挂载的世界书。';
  }
  async function refreshWorldbookList() {
    let manualMode = false;
    const auto = qs('#wb-world-auto-mount');
    if (auto && auto.value) {
      auto.value = '';
      setWorldAutoMountControlText();
      manualMode = true;
    }
    const list = qs('#wb-worldbook-list'); if (list) list.innerHTML = '<span class="wb-muted">正在读取挂载条目...</span>';
    try {
      const out = await getWorldbookEntriesByMode('');
      renderWorldbookTags(out, false); await updateMountedWorldbookNamesAsync(); autoSaveInjectionSettingsFromUI(); toast(manualMode ? '进入手动挂载世界书模式' : (out.length ? ('已刷新 ' + out.length + ' 个世界书条目，可自行选择') : '当前未发现可读取的世界书条目'));
    } catch(e) { if (list) list.innerHTML = '<span class="wb-muted">读取失败：当前环境未暴露世界书接口</span>'; toast('世界书读取失败'); }
  }
  async function applyWorldAutoMount(mode, announce) {
    const auto = qs('#wb-world-auto-mount');
    if (auto) auto.value = mode || '';
    setWorldAutoMountControlText();
    updateMountedWorldbookNames();
    if (!mode) { autoSaveInjectionSettingsFromUI(); if (announce) toast('已关闭自动挂载，可自由选择世界书条目'); return; }
    const list = qs('#wb-worldbook-list'); if (list) list.innerHTML = '<span class="wb-muted">正在自动挂载世界书...</span>';
    try {
      const out = await getWorldbookEntriesByMode(mode);
      renderWorldbookTags(out, true);
      await updateMountedWorldbookNamesAsync();
      autoSaveInjectionSettingsFromUI();
      if (announce) toast(out.length ? ('已自动挂载 ' + out.length + ' 个世界书条目') : '当前没有符合灯色的世界书条目');
    } catch(e) { if (list) list.innerHTML = '<span class="wb-muted">自动挂载失败</span>'; toast('自动挂载失败'); }
  }
  async function applyLazyWorldInject() {
    const persona = readCurrentUserPersonaFromST();
    const userSource = qs('#wb-user-desc-source'); if (userSource) userSource.value = 'auto';
    const up = qs('#wb-user-persona'); if (up && persona) up.value = persona;
    const iu = qs('#wb-inject-user-desc'); if (iu) iu.checked = true;
    const ic = qs('#wb-inject-char-desc'); if (ic) ic.checked = true;
    const cm = qs('#wb-char-desc-mode'); if (cm) cm.value = 'auto';
    const mw = qs('#wb-manual-char-wrap'); if (mw) mw.style.display = 'none';
    const cn = qs('#wb-char-name'); if (cn && !cn.value.trim()) cn.value = companionName();
    const preview = qs('#wb-char-desc-preview'); if (preview) preview.textContent = currentCharDescription(Object.assign({}, settings(), { injectCharDesc:true, charDescMode:'auto', charName:cn?.value || '{{char}}' }));
    const auto = qs('#wb-world-auto-mount'); if (auto) auto.value = 'bluegreen';
    await applyWorldAutoMount('bluegreen', false);
    autoSaveInjectionSettingsFromUI();
    toast('懒人模式已自动导入当前配置');
  }
  function getHostContext() {
    try { const w = getHostWindow(); return w.SillyTavern && w.SillyTavern.getContext ? w.SillyTavern.getContext() : null; }
    catch(e) { return null; }
  }
  function getTavernHelper() {
    try { const w = getHostWindow(); return w.TavernHelper || window.TavernHelper || null; }
    catch(e) { return window.TavernHelper || null; }
  }
  function readCurrentUserPersonaFromST() {
    const ctx = getHostContext() || {};
    const w = getHostWindow();
    const pu = w.power_user || window.power_user || ctx.powerUserSettings || {};
    const currentAvatar = w.user_avatar || window.user_avatar || ctx.user_avatar || ctx.userAvatar || pu.user_avatar || '';
    const keys = [currentAvatar, ctx.user_avatar, ctx.userAvatar, pu.user_avatar, ctx.name1].filter(Boolean).map(x => String(x).trim());
    const stores = [pu.persona_descriptions, ctx.powerUserSettings?.persona_descriptions].filter(Boolean);
    const readFromStores = lookupKeys => {
      for (const store of stores) {
        if (Array.isArray(store)) {
          for (const item of store) {
            const itemKeys = [item?.avatar, item?.name, item?.key, item?.id, item?.filename].filter(Boolean).map(x => String(x).trim());
            if (itemKeys.some(k => lookupKeys.includes(k))) {
              const text = item.description || item.persona_description || item.content || item.value || '';
              if (String(text).trim()) return String(text).trim();
            }
          }
        } else if (store && typeof store === 'object') {
          for (const key of lookupKeys) {
            const direct = store[key] ?? store[String(key).replace(/^.*[\\/]/, '')];
            const text = typeof direct === 'string' ? direct : (direct?.description || direct?.persona_description || direct?.content || direct?.value || '');
            if (String(text).trim()) return String(text).trim();
          }
        }
      }
      return '';
    };
    const fromStore = readFromStores(keys);
    if (fromStore) return fromStore;
    const cached = pu.persona_description || ctx.powerUserSettings?.persona_description || ctx.personaDescription || ctx.persona || ctx.user_desc || '';
    if (String(cached).trim()) return String(cached).trim();
    const selectors = ['#persona_description','#personaDescription','#user_persona','#user-persona','textarea[name="persona_description"]','textarea[id*="persona"]','textarea[id*="Persona"]','[id*="persona"] textarea','[id*="Persona"] textarea'];
    for (const selector of selectors) {
      const el = [...getHostDocument().querySelectorAll(selector)].find(node => !node.closest('#' + POPUP_ID) && !node.disabled && node.offsetParent !== null);
      const value = el ? (el.value || el.textContent || '').trim() : '';
      if (value) return value;
    }
    return '';
  }
  function readCurrentUserNameFromST() {
    const ctx = getHostContext() || {};
    const w = getHostWindow();
    const pu = w.power_user || window.power_user || ctx.powerUserSettings || {};
    const name = ctx.name1 || w.name1 || window.name1 || pu.name1 || pu.user_name || ctx.userName || '';
    return String(name || '').trim();
  }
  function formatAutoUserPersona(persona) {
    const userName = readCurrentUserNameFromST() || '{{user}}';
    const text = String(persona || '').trim();
    if (/^user姓名：/i.test(text)) return text;
    return 'user姓名：' + userName + (text ? '\n' + text : '');
  }
  async function readLorebookEntries(name, preferRawApi) {
    const th = getTavernHelper();
    if (!name) return [];
    let entries = [];
    const readFromApi = async () => {
      const ctx = getHostContext();
      const headers = ctx?.getRequestHeaders ? ctx.getRequestHeaders() : { 'Content-Type':'application/json' };
      const res = await fetch('/api/worldinfo/get', { method:'POST', headers, body:JSON.stringify({ name }) });
      if (!res.ok) return [];
      const wb = await res.json();
      return Array.isArray(wb?.entries) ? wb.entries : Object.values(wb?.entries || {});
    };
    if (preferRawApi) {
      try { entries = await readFromApi(); }
      catch(e) { entries = []; }
      if (entries && entries.length) return entries;
    }
    if (th && th.getLorebookEntries) entries = await th.getLorebookEntries(name);
    else if (th && th.getWorldbook) {
      const wb = await th.getWorldbook(name);
      entries = Array.isArray(wb?.entries) ? wb.entries : Object.values(wb?.entries || {});
    } else {
      entries = await readFromApi();
    }
    return Array.isArray(entries) ? entries : Object.values(entries || {});
  }
  function worldEntryFlag(entry, key) {
    const snake = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
    const raw = entry?.[key] ?? entry?.extensions?.[key] ?? entry?.extensions?.[snake] ?? entry?.originalData?.[key] ?? entry?.originalData?.extensions?.[key] ?? entry?.originalData?.extensions?.[snake];
    return raw === true || raw === 'true' || raw === 1 || raw === '1';
  }
  function worldEntryLight(entry) {
    if (worldEntryFlag(entry, 'constant')) return 'blue';
    if (worldEntryFlag(entry, 'vectorized')) return 'chain';
    return 'green';
  }
  function worldEntryAllowed(entry, mode) {
    if (!mode) return true;
    if (worldEntryFlag(entry, 'disable') || entry?.enabled === false || entry?.enabled === 'false') return false;
    if (mode === 'blue') return worldEntryLight(entry) === 'blue';
    if (mode === 'bluegreen') return worldEntryLight(entry) !== 'chain';
    return true;
  }
  function normalizeWorldNames(value) {
    const out = [];
    const walk = v => {
      if (!v) return;
      if (Array.isArray(v)) v.forEach(walk);
      else if (typeof v === 'string') out.push(v);
      else if (typeof v === 'object') {
        ['globalSelect','selected_world_info','selectedWorldInfo','world_info','worldInfo','extraBooks'].forEach(k => walk(v[k]));
        Object.keys(v).forEach(k => {
          if (['globalSelect','selected_world_info','selectedWorldInfo','world_info','worldInfo','extraBooks'].includes(k)) return;
          if (v[k] === true) out.push(k);
          else if (typeof v[k] === 'string' || Array.isArray(v[k])) walk(v[k]);
        });
      }
    };
    walk(value);
    return out.map(x => String(x).trim()).filter(x => x && x !== 'None' && x !== '--- None ---' && !x.startsWith('--'));
  }
  function addWorldName(list, value) {
    normalizeWorldNames(value).forEach(name => { if (name && !list.includes(name)) list.push(name); });
  }
  function getMountedWorldNamesFromDom() {
    const names = [];
    const doc = getHostDocument();
    // SillyTavern stores the real book name in option text; option value is often just an index.
    qsa('#world_info option:selected, #world_info option:checked', doc).forEach(opt => addWorldName(names, opt.textContent || opt.label || opt.value));
    qsa('.character_world_info_selector option:selected, .character_extra_world_info_selector option:selected', doc).forEach(opt => addWorldName(names, opt.textContent || opt.label || opt.value));
    try {
      const $ = getHostWindow().jQuery || getHostWindow().$ || window.jQuery || window.$;
      if ($) {
        $('#world_info option:selected').each((_, opt) => addWorldName(names, opt.textContent || opt.label || opt.value));
        $('.character_world_info_selector option:selected, .character_extra_world_info_selector option:selected').each((_, opt) => addWorldName(names, opt.textContent || opt.label || opt.value));
      }
    } catch(e) {}
    return names;
  }
  async function getMountedWorldNamesFromModule() {
    try {
      const mod = await import('/scripts/world-info.js');
      const names = [];
      addWorldName(names, mod.selected_world_info || []);
      const wi = mod.getWorldInfoSettings ? mod.getWorldInfoSettings()?.world_info : (mod.world_info || {});
      addWorldName(names, wi?.globalSelect || []);
      const ctx = getHostContext();
      const char = ctx?.characters && ctx.characterId >= 0 ? ctx.characters[ctx.characterId] : null;
      if (char) {
        addWorldName(names, char.data?.extensions?.world);
        const fileName = String(char.avatar || '').replace(/\.[^/.]+$/, '');
        const extraCharLore = Array.isArray(wi?.charLore) ? wi.charLore.find(e => e?.name === fileName) : null;
        addWorldName(names, extraCharLore?.extraBooks || []);
      }
      return names;
    } catch(e) { return []; }
  }
  async function getActiveWorldbookEntries() {
    return getWorldbookEntriesByMode('');
  }
  function getCurrentWorldBookNames() {
    const names = [];
    const add = v => addWorldName(names, v);
    try {
      const ctx = getHostContext();
      if (!ctx) return names;
      add(getMountedWorldNamesFromDom());
      const char = ctx.characters && ctx.characterId >= 0 ? ctx.characters[ctx.characterId] : (ctx.character || null);
      const charData = char?.data || char || {};
      add([charData?.extensions?.world, charData?.world, charData?.character_book?.name]);
      const avatar = charData?.avatar || char?.avatar;
      const charLore = ctx.worldInfoSettings?.charLore || getHostWindow().world_info?.charLore || window.world_info?.charLore;
      if (avatar && Array.isArray(charLore)) {
        const fileName = String(avatar).replace(/\.[^.]+$/, '');
        const found = charLore.find(e => e?.name === fileName);
        add(found?.extraBooks || []);
      }
      const chatMeta = ctx.chatMetadata || {};
      const wiSettings = ctx.worldInfoSettings || getHostWindow().world_info || window.world_info || {};
      add([chatMeta.world_info, chatMeta.worldInfo, chatMeta.world, ctx.world_names, ctx.worldInfo, ctx.globalWorldInfo, wiSettings]);
    } catch(e) { console.warn('[玩伴小屋] getCurrentWorldBookNames failed:', e); }
    return names;
  }
  async function getCurrentWorldBookNamesAsync() {
    const names = getCurrentWorldBookNames();
    addWorldName(names, await getMountedWorldNamesFromModule());
    return names;
  }
  async function getWorldbookEntriesByMode(mode) {
    const results = [];
    const checked = new Set();
    const seen = new Set();
    const pushEntry = (source, e, i) => {
      if (!worldEntryAllowed(e, mode)) return;
      const content = String(e.content || '').trim();
      const labelCore = e.comment || e.name || (Array.isArray(e.key) ? e.key[0] : e.key) || e.uid || e.id || ('条目' + (i + 1));
      const uid = e.uid ?? e.id ?? '';
      const dedupeKey = content ? ('c:' + content.replace(/\s+/g, ' ').slice(0, 500)) : ('k:' + source + ':' + uid + ':' + labelCore);
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      results.push({ label: '[' + source + '] ' + labelCore, content, wbName: source, uid });
    };
    try {
      const ctx = getHostContext();
      if (!ctx) return results;
      const char = ctx.characters && ctx.characterId >= 0 ? ctx.characters[ctx.characterId] : (ctx.character || null);
      const charData = char?.data || char || {};
      for (const name of await getCurrentWorldBookNamesAsync()) {
        if (!name || checked.has(name)) continue;
        checked.add(name);
        try { (await readLorebookEntries(name, true)).forEach((e, i) => pushEntry(name, e, i)); }
        catch(e) { console.warn('[玩伴小屋] 世界书加载失败:', name, e); }
      }
      const inlineBook = charData?.character_book;
      if (inlineBook && Array.isArray(inlineBook.entries)) inlineBook.entries.forEach((e, i) => pushEntry('角色内嵌', e, i));
    } catch(e) { console.warn('[玩伴小屋] getActiveWorldbookEntries failed:', e); }
    return results.filter(e => e.content || e.label);
  }
  function currentUserDescription(cfg) {
    if (cfg.injectUserDesc === false) return '不注入';
    if (cfg.userDescSource !== 'auto' && cfg.userPersona && cfg.userPersona.trim()) return cfg.userPersona.trim();
    if (cfg.userDescSource === 'auto') {
      const imported = readCurrentUserPersonaFromST();
      if (imported) return formatAutoUserPersona(imported);
      if (cfg.userPersona && cfg.userPersona.trim()) return formatAutoUserPersona(cfg.userPersona.trim());
    }
    const ctx = getHostContext();
    const text = (ctx && (ctx.personaDescription || ctx.persona || ctx.user_desc)) || (cfg.userPersona && cfg.userPersona.trim()) || '未填写';
    return text;
  }
  function currentCharDescription(cfg) {
    if (cfg.injectCharDesc === false) return '不注入';
    if (cfg.charDescMode === 'manual') return String(cfg.manualCharPersona || '').trim() || '未填写手动角色描述';
    if (cfg.charDescriptionSnapshot && String(cfg.charDescriptionSnapshot).trim()) return String(cfg.charDescriptionSnapshot).trim();
    const ctx = getHostContext();
    const char = ctx && ctx.characters && ctx.characterId >= 0 ? ctx.characters[ctx.characterId] : (ctx && ctx.character ? ctx.character : null);
    const charData = char?.data || char || {};
    const name = cfg.charName && cfg.charName !== '{{char}}' ? cfg.charName : (charData.name || ctx?.name2 || '{{char}}');
    const desc = (charData.description || ctx?.description || '').trim();
    return name + '：' + (desc || '未读取到当前角色描述');
  }
  function summaryPreview(id) { const s = summaries().find(x => x.id === id); if (!s) return '当前不注入大总结。'; const txt = (s.content || '').replace(/\s+/g, ' ').slice(0, 140); return '[' + (s.name || '大总结') + '] ' + txt + ((s.content || '').length > 140 ? '...' : ''); }
  function refreshSummaryInjectionUI(selectedId) {
    const id = selectedId !== undefined ? (selectedId || '') : (settings().summaryId || '');
    const sums = summaries();
    const exists = !!id && sums.some(x => x.id === id);
    const actualId = exists ? id : '';
    const sel = qs('#wb-summary-select');
    if (sel) {
      sel.innerHTML = '<option value="">— 不注入 —</option>' + sums.map(x => '<option value="' + esc(x.id) + '">' + esc(x.name || '大总结') + '</option>').join('');
      sel.value = actualId;
    }
    const pv = qs('#wb-summary-preview');
    if (pv) pv.textContent = summaryPreview(actualId);
  }
  function renderSummaryManagerList(mask) {
    const list = qs('#wb-summary-manager-list', mask); if (!list) return;
    const arr = summaries();
    if (!arr.length) { refreshSummaryInjectionUI(''); list.innerHTML = '<div class="wb-muted" style="padding:10px;text-align:center;">暂无大总结，点击“添加/导入”。</div>'; return; }
    list.innerHTML = arr.map((s,i) => '<div class="wb-summary-item" data-i="' + i + '"><div style="min-width:0;flex:1;"><div style="font-weight:800;color:var(--wb-accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(s.name || '大总结') + '</div><div class="wb-muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc((s.content || '').replace(/\s+/g, ' ').slice(0, 90)) + '</div></div><div class="wb-actions"><button class="wb-btn wb-summary-use" data-i="' + i + '">导入</button><button class="wb-btn wb-summary-edit" data-i="' + i + '">编辑</button><button class="wb-btn wb-summary-del" data-i="' + i + '">删</button></div></div>').join('');
    qsa('.wb-summary-use', list).forEach(b => b.onclick = () => { const s = summaries()[+b.dataset.i]; if (!s) return; setSettings({ summaryId: s.id }); refreshSummaryInjectionUI(s.id); closeSummaryModal(mask); renderSettings(); toast('大总结已设为导入'); });
    qsa('.wb-summary-edit', list).forEach(b => b.onclick = () => openSummaryEditor(mask, +b.dataset.i));
    qsa('.wb-summary-del', list).forEach(b => b.onclick = () => { const idx = +b.dataset.i; const arr = summaries(); if (!arr[idx]) return; showConfirm('删除大总结','确定删除这个大总结吗？',()=>{ const deleted = arr.splice(idx,1)[0]; const cfg = settings(); if (cfg.summaryId === deleted.id) setSettings({ summaryId: '' }); saveSummaries(arr); refreshSummaryInjectionUI(settings().summaryId || ''); renderSummaryManagerList(mask); }); });
  }
  function openSummaryManager() {
    const doc = getHostDocument();
    const old = qs('#wb-summary-mask', doc); if (old) old.remove();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-summary-mask';
    mask.innerHTML = '<div class="wb-modal wb-summary-modal"><div class="wb-modal-title">导入大总结</div><div class="wb-actions" style="margin-bottom:10px;"><button class="wb-btn primary" id="wb-summary-add">添加/导入</button><button class="wb-btn" id="wb-summary-ai">AI智能导入</button><button class="wb-btn" id="wb-summary-clear-current">不注入</button></div><div class="wb-summary-list" id="wb-summary-manager-list"></div><div class="wb-actions" style="margin-top:12px;justify-content:flex-end;"><button class="wb-btn" id="wb-summary-close">关闭</button></div></div>';
    appendModalMask(mask);
    qs('#wb-summary-add', mask).onclick = () => openSummaryEditor(mask, -1);
    qs('#wb-summary-ai', mask).onclick = () => openAiSummaryImporter(mask);
    qs('#wb-summary-clear-current', mask).onclick = () => { setSettings({ summaryId: '' }); closeSummaryModal(mask); renderSettings(); toast('已取消导入大总结'); };
    qs('#wb-summary-close', mask).onclick = () => closeSummaryModal(mask);
    renderSummaryManagerList(mask);
  }
  function estimateTokenCount(text) {
    const s = String(text || '');
    const cjk = (s.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    const asciiWords = (s.replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ').match(/[A-Za-z0-9_]+|[^\sA-Za-z0-9_]/g) || []).length;
    return Math.max(1, Math.ceil(cjk + asciiWords * 0.75));
  }
  function fillApiDebugMeta(meta, data) {
    if (!meta || !data) return;
    const usage = data.usage || {};
    meta.inputTokensActual = usage.prompt_tokens || usage.input_tokens || 0;
    meta.outputTokensActual = usage.completion_tokens || usage.output_tokens || 0;
    meta.totalTokensActual = usage.total_tokens || 0;
  }
  function formatApiDebugMeta(meta) {
    if (!meta) return '';
    const input = meta.inputTokensActual ? (meta.inputTokensActual + '（API返回）') : ((meta.inputTokensEstimated || 0) + '（估算）');
    const output = meta.outputTokensActual ? String(meta.outputTokensActual) : '无';
    const total = meta.totalTokensActual ? String(meta.totalTokensActual) : '无';
    const seconds = typeof meta.durationMs === 'number' ? (meta.durationMs / 1000).toFixed(2) : '0.00';
    return [
      '输入token：' + input,
      '输出token：' + output,
      '总token：' + total,
      '输出时间：' + seconds + 's'
    ].join('\n');
  }
  async function callApiText(cfg, prompt, systemPrompt, maxTokens, debugMeta) {
    const url = apiChatUrl(cfg.apiUrl);
    if (!url) throw new Error('请先配置API基础URL');
    if (!cfg.apiModel) throw new Error('请先选择模型');
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
    const messages = [{ role: 'system', content: systemPrompt || '只输出结果正文，不要解释。' }, { role: 'user', content: prompt }];
    if (debugMeta) debugMeta.inputTokensEstimated = estimateTokenCount(messages.map(m => m.content).join('\n'));
    const started = Date.now();
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST', headers,
        body: JSON.stringify({ model: cfg.apiModel, messages, temperature: 0.55, max_tokens: maxTokens || 4096 })
      }, 600000);
      if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error('API错误 ' + res.status + ': ' + t.slice(0, 120)); }
      const json = await res.json();
      fillApiDebugMeta(debugMeta, json);
      const choice = json.choices?.[0] || {};
      const txt = choice.message?.content || choice.text || json.output_text || '';
      if (!txt) throw new Error('API响应格式异常');
      if (choice.finish_reason === 'length') throw new Error('AI返回被截断，请提高模型输出上限或减少生成内容');
      return stripJsonFence(txt);
    } finally {
      if (debugMeta) debugMeta.durationMs = Date.now() - started;
    }
  }

  async function callApiTextStream(cfg, prompt, systemPrompt, maxTokens, onDelta) {
    const url = apiChatUrl(cfg.apiUrl);
    if (!url) throw new Error('请先配置API基础URL');
    if (!cfg.apiModel) throw new Error('请先选择模型');
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
    const messages = [{ role:'system', content:systemPrompt || '只输出结果正文，不要解释。' }, { role:'user', content:prompt }];
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 600000) : null;
    const emit = text => { if (text && onDelta) onDelta(text); };
    try {
      const res = await fetch(url, Object.assign({
        method:'POST',
        headers,
        body:JSON.stringify({ model:cfg.apiModel, messages, temperature:0.55, max_tokens:maxTokens || 4096, stream:true })
      }, ctrl ? { signal:ctrl.signal } : {}));
      if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error('API错误 ' + res.status + ': ' + t.slice(0, 120)); }
      if (!res.body || !res.body.getReader) {
        const json = await res.json();
        const txt = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || json.output_text || '';
        emit(txt);
        return stripJsonFence(txt);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '', out = '';
      const consume = chunk => {
        buf += chunk;
        const parts = buf.split(/\r?\n\r?\n/);
        buf = parts.pop() || '';
        parts.forEach(part => {
          part.split(/\r?\n/).forEach(line => {
            const m = line.match(/^data:\s*(.*)$/);
            if (!m) return;
            const data = m[1].trim();
            if (!data || data === '[DONE]') return;
            try {
              const obj = JSON.parse(data);
              const delta = obj.choices?.[0]?.delta?.content || obj.choices?.[0]?.text || obj.delta || obj.output_text || '';
              if (delta) { out += delta; emit(delta); }
            } catch (_) {}
          });
        });
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        consume(decoder.decode(value, { stream:true }));
      }
      consume(decoder.decode());
      if (!out && buf.trim()) {
        try {
          const obj = JSON.parse(buf.trim());
          out = obj.choices?.[0]?.message?.content || obj.choices?.[0]?.text || obj.output_text || '';
          emit(out);
        } catch (_) {}
      }
      if (!out) throw new Error('API流式响应为空');
      return stripJsonFence(out);
    } catch(e) {
      if (e && e.name === 'AbortError') throw new Error('API请求超时，请检查移动端网络或API地址');
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function openAiSummaryImporter(mask) {
    const doc = getHostDocument();
    const old = qs('#wb-summary-ai-mask', doc); if (old) old.remove();
    const cfg = settings();
    const apis = apiPresets();
    const apiOptions = '<option value="">— 使用当前API配置 —</option>' + apis.map((x,i) => '<option value="' + i + '">' + esc(x.name || ('预设' + (i + 1))) + '</option>').join('');
    const modal = doc.createElement('div');
    modal.className = modalMaskClass();
    modal.id = 'wb-summary-ai-mask';
    modal.innerHTML = '<div class="wb-modal wb-summary-modal"><div class="wb-modal-title">AI智能导入大总结</div>'
      + '<div class="wb-field"><label>API 预设（可选）</label><div class="wb-preset-row"><select class="wb-select" id="wb-aisum-api">' + apiOptions + '</select><button class="wb-btn" id="wb-aisum-load-api">载入</button></div></div>'
      + '<div class="wb-field"><label>上传或粘贴主线内容</label><div class="wb-actions"><button class="wb-btn" id="wb-aisum-file-btn">上传文件</button><input type="file" id="wb-aisum-file" accept=".txt,.md,.json,.yaml,.yml,.csv,.log" style="display:none;"><button class="wb-btn" id="wb-aisum-clear">清空</button></div><div class="wb-preset-row"><input class="wb-input" id="wb-aisum-tag" placeholder="聊天标签，例如 content；留空读取全文" value=""><button class="wb-btn" id="wb-aisum-fetch">从聊天记录获取</button></div><div class="wb-muted" id="wb-aisum-info"></div><textarea class="wb-textarea" id="wb-aisum-content" style="min-height:150px;font-family:monospace;" placeholder="粘贴主线内容，或上传文件 / 从聊天记录标签中提取..."></textarea></div>'
      + '<div class="wb-field"><label>总结要求（自动保存）</label><textarea class="wb-textarea" id="wb-aisum-req" style="min-height:74px;" placeholder="例：约800字，按时间顺序，重点记录人物关系、关键事件、未解决伏笔。">' + esc(summaryReq()) + '</textarea></div>'
      + '<div class="wb-field" id="wb-aisum-result-wrap" style="display:none;"><label>生成结果（预览）</label><textarea class="wb-textarea" id="wb-aisum-result" style="min-height:170px;font-family:monospace;" readonly></textarea><label>保存标题</label><input class="wb-input" id="wb-aisum-name" placeholder="为这条大总结命名..."></div>'
      + '<div class="wb-actions" style="margin-top:12px;"><button class="wb-btn primary" id="wb-aisum-generate" style="flex:1;">生成大总结</button><button class="wb-btn" id="wb-aisum-save" style="display:none;flex:1;">保存并导入</button><button class="wb-btn" id="wb-aisum-cancel">取消</button></div></div>';
    appendModalMask(modal);
    let workCfg = Object.assign({}, cfg);
    qs('#wb-aisum-load-api', modal).onclick = () => { const idx = parseInt(qs('#wb-aisum-api', modal).value, 10); const pr = apis[idx]; if (!pr) { toast('请先选择 API 预设'); return; } workCfg = Object.assign({}, workCfg, { apiUrl: pr.apiUrl || '', apiKey: pr.apiKey || '', apiModel: pr.apiModel || '' }); toast('已临时载入 API 预设：' + (pr.name || '未命名')); };
    qs('#wb-aisum-file-btn', modal).onclick = () => qs('#wb-aisum-file', modal).click();
    qs('#wb-aisum-file', modal).onchange = e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { qs('#wb-aisum-content', modal).value = String(r.result || ''); qs('#wb-aisum-info', modal).textContent = '已载入：' + f.name + '（' + (f.size / 1024).toFixed(1) + ' KB）'; if (!qs('#wb-aisum-name', modal).value.trim()) qs('#wb-aisum-name', modal).value = f.name.replace(/\.[^.]+$/, ''); }; r.readAsText(f, 'utf-8'); };
    qs('#wb-aisum-clear', modal).onclick = () => { qs('#wb-aisum-content', modal).value = ''; qs('#wb-aisum-info', modal).textContent = ''; };
    qs('#wb-aisum-fetch', modal).onclick = () => {
      const rawTag = qs('#wb-aisum-tag', modal).value.trim();
      const tag = rawTag.replace(/[<>\/]/g, '');
      try {
        const ctx = getHostContext();
        if (!ctx || !Array.isArray(ctx.chat) || !ctx.chat.length) { toast('未获取到聊天记录'); return; }
        const allText = ctx.chat.map(m => m && m.mes ? m.mes : '').filter(Boolean).join('\n\n');
        if (!tag) {
          qs('#wb-aisum-content', modal).value = allText;
          qs('#wb-aisum-info', modal).textContent = '已导入聊天全文，共 ' + allText.length + ' 字符';
          toast('已导入聊天全文');
          return;
        }
        const re = new RegExp('<' + tag + '>[\\s\\S]*?<\\/' + tag + '>', 'gi');
        const matches = allText.match(re) || [];
        if (!matches.length) { qs('#wb-aisum-info', modal).textContent = '未找到 <' + tag + '>...</' + tag + '> 标签'; toast('未找到指定聊天标签'); return; }
        const extracted = matches.map(x => x.replace(new RegExp('^<' + tag + '>|<\\/' + tag + '>$', 'gi'), '').trim()).filter(Boolean).join('\n\n');
        qs('#wb-aisum-content', modal).value = extracted;
        qs('#wb-aisum-info', modal).textContent = '已提取 ' + matches.length + ' 处 <' + tag + '> 内容，共 ' + extracted.length + ' 字符';
      } catch(e) { toast('获取失败：' + (e && e.message ? e.message : e)); }
    };
    qs('#wb-aisum-req', modal).oninput = e => saveSummaryReq(e.target.value);
    qs('#wb-aisum-generate', modal).onclick = async () => { const content = qs('#wb-aisum-content', modal).value.trim(); const req = qs('#wb-aisum-req', modal).value.trim(); if (!content) { toast('请先输入主线内容'); return; } if (!req) { toast('请填写总结要求'); return; } const prompt = '你现在的任务是：对当前主线内容进行结构化“大总结”。\n【核心要求】\n* 必须严格按照“填写要求”来控制总结粒度和内容\n* 只输出总结结果，不要解释，不要寒暄，不要任何额外说明\n* 每一条必须是独立信息点，信息密度高，避免空话\n* 所有总结必须来源于主线内容，不允许编造\n* 禁止出现任何markdown符号\n────────────────\n【填写要求】\n' + req + '\n────────────────\n【主线内容】\n' + content + '\n────────────────\n现在开始生成大总结。'; const btn = qs('#wb-aisum-generate', modal); btn.disabled = true; btn.textContent = '生成中...'; try { const result = await callApiText(workCfg, prompt, '你是剧情总结助手。只输出总结正文，不要解释。'); qs('#wb-aisum-result', modal).value = result; qs('#wb-aisum-result-wrap', modal).style.display = ''; qs('#wb-aisum-save', modal).style.display = ''; if (!qs('#wb-aisum-name', modal).value.trim()) qs('#wb-aisum-name', modal).value = 'AI大总结 ' + new Date().toLocaleString(); toast('大总结生成完成，请检查后保存'); } catch(e) { toast('生成失败：' + (e && e.message ? e.message : e)); } finally { btn.disabled = false; btn.textContent = '重新生成'; } };
    qs('#wb-aisum-save', modal).onclick = () => { const name = qs('#wb-aisum-name', modal).value.trim(); const content = qs('#wb-aisum-result', modal).value.trim(); if (!name || !content) { toast('请输入保存标题并确认生成内容'); return; } const arr = summaries(); const saved = { id:'sum_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), name, content }; arr.unshift(saved); saveSummaries(arr); setSettings({ summaryId: saved.id }); refreshSummaryInjectionUI(saved.id); modal.remove(); renderSummaryManagerList(mask); toast('AI大总结已保存并导入'); };
    qs('#wb-aisum-cancel', modal).onclick = () => modal.remove();
  }

  function summarySnapshotFromId(id) {
    const s = summaries().find(x => x.id === id);
    return s ? { id: s.id, name: s.name || '大总结', content: s.content || '' } : null;
  }
  function worldPresetSnapshotFromUI(name) {
    const selected = selectedWorldEntriesFromUI();
    const charName = normalizePresetName(name || (qs('#wb-char-name') && qs('#wb-char-name').value.trim()) || companionName());
    const summaryId = qs('#wb-summary-select') ? (qs('#wb-summary-select').value || '') : '';
    const baseCfg = Object.assign(settings(), { charName, injectCharDesc: qs('#wb-inject-char-desc') ? qs('#wb-inject-char-desc').checked : true, charDescriptionSnapshot: '' });
    return {
      name,
      lazyWorldInject: !!(qs('#wb-lazy-world-inject') && qs('#wb-lazy-world-inject').checked),
      injectUserDesc: qs('#wb-inject-user-desc').checked,
      injectCharDesc: qs('#wb-inject-char-desc').checked,
      injectChat: qs('#wb-inject-chat').checked,
      specialLanguageEnabled: !!(qs('#wb-special-language-enabled') && qs('#wb-special-language-enabled').checked),
      specialLanguage: qs('#wb-special-language') ? qs('#wb-special-language').value : '粤语',
      intimacyMode: !!(qs('#wb-intimacy-mode') && qs('#wb-intimacy-mode').checked),
      breakLimitPrompt: qs('#wb-break-limit-prompt') ? qs('#wb-break-limit-prompt').value.trim() : '',
      userDescSource: qs('#wb-user-desc-source') ? (qs('#wb-user-desc-source').value === 'auto' ? 'auto' : 'manual') : 'manual',
      userPersona: qs('#wb-user-persona').value.trim(),
      charDescMode: qs('#wb-char-desc-mode') ? qs('#wb-char-desc-mode').value : 'auto',
      manualCharPersona: qs('#wb-manual-char-persona') ? qs('#wb-manual-char-persona').value.trim() : '',
      charName,
      charDescriptionSnapshot: currentCharDescription(baseCfg),
      avatarUrl: qs('#wb-avatar-url') ? qs('#wb-avatar-url').value.trim() : '',
      summaryId,
      summarySnapshot: summarySnapshotFromId(summaryId),
      worldAutoMountMode: qs('#wb-world-auto-mount') ? (qs('#wb-world-auto-mount').value || '') : '',
      selectedWorldKeys: selected.map(x => ({ label:x.label, wbName:x.wbName || '', uid:x.uid || '' })),
      selectedWorldEntries: selected.map(x => ({ label:x.label || '', content:x.content || '', wbName:x.wbName || '', uid:x.uid || '' }))
    };
  }
  async function applyWorldPresetToGame(pr) {
    if (!pr) return false;
    const matched = (pr.selectedWorldEntries || []).map(x => ({ label:x.label || '', content:x.content || '', wbName:x.wbName || '', uid:x.uid || '' }));
    const presetRoleName = normalizePresetName(pr.charName && pr.charName !== '{{char}}' ? pr.charName : (pr.name || companionName()));
    setSettings({
      lazyWorldInject: !!pr.lazyWorldInject,
      injectUserDesc: pr.injectUserDesc !== false,
      injectCharDesc: pr.injectCharDesc !== false,
      injectChat: !!pr.injectChat,
      specialLanguageEnabled: !!pr.specialLanguageEnabled,
      specialLanguage: specialLanguageOptions().includes(pr.specialLanguage) ? pr.specialLanguage : '粤语',
      intimacyMode: !!pr.intimacyMode,
      breakLimitPrompt: pr.breakLimitPrompt || '',
      userDescSource: pr.userDescSource === 'auto' ? 'auto' : 'manual',
      userName: pr.userName || '{{user}}',
      userPersona: pr.userPersona || '',
      charDescMode: pr.charDescMode || 'auto',
      manualCharPersona: pr.manualCharPersona || '',
      charName: pr.charName || '{{char}}',
      charDescriptionSnapshot: pr.charDescriptionSnapshot || '',
      avatarUrl: pr.avatarUrl || findCharacterAvatarByName(presetRoleName) || '',
      summaryId: pr.summaryId || '',
      summarySnapshot: pr.summarySnapshot || null,
      worldAutoMountMode: ['blue','bluegreen'].includes(pr.worldAutoMountMode) ? pr.worldAutoMountMode : '',
      selectedWorldEntries: matched
    });
    refreshGameCompanionPanel();
    return true;
  }
  function refreshGameCompanionPanel() {
    const panel = qs('.wb-side-companion');
    if (panel) panel.innerHTML = companionHTML();
  }
  async function applyLinePresetSelection(game, value) {
    if (!value) return;
    if (value.indexOf('world::') === 0) {
      const pr = worldPresets()[parseInt(value.slice(7), 10)];
      const name = normalizePresetName(pr && pr.name);
      if (pr) await applyWorldPresetToGame(pr);
      setCurrentLinePreset(game, name);
      toast('已切换世界观/语录预设：' + name);
      return;
    }
	    const name = normalizePresetName(value.replace(/^line::/, ''));
	    const pr = worldPresets().find(x => normalizePresetName(x.name) === name);
	    if (pr) await applyWorldPresetToGame(pr);
	    else { setSettings({ charName: name, charDescriptionSnapshot: '', avatarUrl: findCharacterAvatarByName(name) || '' }); refreshGameCompanionPanel(); }
	    setCurrentLinePreset(game, name);
	    toast(pr ? ('已切换语录并同步设定：' + name) : ('已切换语录：' + name));
	  }

  function startContinueCountdown(mask, game, state) {
    const modal = qs('.wb-modal', mask) || mask;
    let left = 3;
    modal.innerHTML = '<div class="wb-modal-title">准备继续</div>'
      + '<div class="wb-countdown"><div class="wb-countdown-num" id="wb-progress-count">3</div><div class="wb-muted">秒后继续上次进度</div></div>'
      + '<div class="wb-actions"><button class="wb-btn" id="wb-count-cancel">取消</button></div>';
    const cancel = qs('#wb-count-cancel', mask);
    let timer = null;
    const finish = () => { if (timer) clearInterval(timer); if (mask && mask.parentNode) mask.remove(); startCurrentGame(game, state); };
    if (cancel) cancel.onclick = () => { if (timer) clearInterval(timer); if (mask && mask.parentNode) mask.remove(); };
    timer = setInterval(() => {
      left -= 1;
      const num = qs('#wb-progress-count', mask);
      if (num) num.textContent = String(Math.max(0, left));
      if (left <= 0) finish();
    }, 1000);
  }

  function startPauseResumeCountdown() {
    if (!gameStarted || !currentGame || !gamePaused) return;
    const doc = getHostDocument();
    const old = qs('#wb-resume-mask', doc); if (old) old.remove();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-resume-mask';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">准备继续</div><div class="wb-countdown"><div class="wb-countdown-num" id="wb-resume-count">3</div><div class="wb-muted">秒后继续当前游戏</div></div><div class="wb-actions"><button class="wb-btn" id="wb-resume-cancel">取消</button></div></div>';
    appendModalMask(mask);
    let left = 3;
    let timer = null;
    const pbtn = qs('#wb-pause');
    if (pbtn) pbtn.disabled = true;
    const cleanup = () => { if (timer) clearInterval(timer); if (pbtn) pbtn.disabled = false; };
    const finish = () => {
      cleanup();
      if (mask && mask.parentNode) mask.remove();
      if (!gameStarted || !currentGame) return;
      gamePaused = false;
      gameActiveStartedAt = Date.now();
      startGameDurationRewardTimer();
      hideGamePauseOverlay();
      const btn = qs('#wb-pause'); if (btn) btn.textContent = '暂停';
    };
    qs('#wb-resume-cancel', mask).onclick = () => {
      cleanup();
      if (mask && mask.parentNode) mask.remove();
      const btn = qs('#wb-pause'); if (btn) btn.textContent = '继续';
    };
    timer = setInterval(() => {
      left -= 1;
      const num = qs('#wb-resume-count', mask);
      if (num) num.textContent = String(Math.max(0, left));
      if (left <= 0) finish();
    }, 1000);
  }

  function theaterJobsForGame(game) {
    const g = GAME_META[game] || {};
    if (g.mode !== 'double') {
      if (game === 'plank') return [['score','normal'], ['score','record'], ['score','super_good'], ['score','super_bad'], ['score','long_run'], ['score','plank_regret'], ['score','plank_tease']];
      if (game === 'sudoku') return [['score','normal'], ['score','record'], ['score','super_good'], ['score','long_run'], ['score','scholar'], ['score','independent']];
      if (game === 'minesweeper') return [['score','normal'], ['score','record'], ['score','super_good'], ['score','bad_luck'], ['score','minesweeper_regret'], ['score','mine_lucky']];
      if (game === 'shuerte') return [['score','normal'], ['score','record'], ['score','super_good'], ['score','shuerte_focus'], ['score','shuerte_regret'], ['score','long_run']];
      if (game === 'uyangle') return [['score','normal'], ['score','super_good'], ['score','uyangle_clutch'], ['score','bad_luck'], ['score','long_run']];
      if (game === 'screw') return [['score','screw_success'], ['score','screw_fail'], ['score','record'], ['score','super_good'], ['score','screw_regret'], ['score','long_run']];
      if (game === 'popstar') return [['score','normal'], ['score','record'], ['score','super_good'], ['score','super_bad'], ['score','popstar_clutch'], ['score','popstar_godmove'], ['score','popstar_clear_all'], ['score','long_run']];
      if (game === 'paopao') return [['score','normal'], ['score','record'], ['score','super_good'], ['score','paopao_clutch'], ['score','paopao_drop'], ['score','paopao_bomb_fail'], ['score','paopao_clear_all'], ['score','long_run']];
      if (game === 'zuma') return [['score','normal'], ['score','record'], ['score','zuma_chain_master'], ['score','zuma_clutch'], ['score','zuma_sharpshooter'], ['score','zuma_toolbox'], ['score','zuma_endurance'], ['score','long_run']];
      if (game === 'watersort') return [['score','normal'], ['score','record'], ['score','watersort_perfect'], ['score','watersort_efficient'], ['score','watersort_no_hint'], ['score','watersort_extra_save'], ['score','watersort_endurance'], ['score','long_run']];
      if (game === 'game1010') return [['score','normal'], ['score','record'], ['score','game1010_strategy'], ['score','game1010_bad_luck'], ['score','game1010_clutch'], ['score','long_run']];
      if (game === 'turkey') return [['score','normal'], ['score','record'], ['score','super_good'], ['score','turkey_hot'], ['score','turkey_endure'], ['score','turkey_minimal'], ['score','turkey_clutch'], ['score','turkey_clear_all'], ['score','bad_luck'], ['score','turkey_tools'], ['score','long_run']];
      if (game === 'spider') return [['score','normal'], ['score','record'], ['score','spider_chain_master'], ['score','spider_four_empty'], ['score','spider_clear_table'], ['score','spider_clutch'], ['score','super_good'], ['score','bad_luck'], ['score','long_run']];
      if (game === 'linklink') return [['score','normal'], ['score','record'], ['score','link_fast_combo'], ['score','link_time_rich'], ['score','link_last_second'], ['score','bad_luck'], ['score','link_master']];
      const jobs = [['score','normal'], ['score','record'], ['score','super_good'], ['score','super_bad'], ['score','long_run']];
      return jobs;
    }
    if (game === 'blackjack') return [['user_win','normal'], ['ta_win','normal'], ['user_win','bj_blackjack'], ['user_win','bj_exact21'], ['user_win','bj_six'], ['user_win','bj_peek_win'], ['ta_win','bad_luck'], ['user_win','bj_char_bust'], ['user_win','bj_win5'], ['user_win','bj_tiebreak'], ['ta_win','bj_peek_bust']];
    if (game === 'bombnumber') return [['user_win','normal'], ['ta_win','normal'], ['ta_win','bad_luck'], ['user_win','bomb_lucky'], ['ta_win','fated'], ['user_win','rage'], ['user_win','cheat_win']];
    if (game === 'connect4d') return [['user_win','normal'], ['ta_win','normal'], ['draw','balanced'], ['user_win','win_streak3'], ['ta_win','lose_streak3'], ['user_win','cheat_win']];
    if (game === 'draughts') return [['user_win','normal'], ['ta_win','normal'], ['user_win','super_good'], ['ta_win','super_bad'], ['user_win','shock'], ['ta_win','shock'], ['user_win','cheat_win']];
    if (game === 'reversi') return [['user_win','normal'], ['ta_win','normal'], ['draw','normal'], ['user_win','win_streak3'], ['ta_win','lose_streak3'], ['user_win','reversi_user_sweep'], ['ta_win','reversi_char_sweep'], ['user_win','reversi_close_win'], ['ta_win','reversi_close_lose'], ['user_win','reversi_comeback'], ['user_win','cheat_win']];
    if (game === 'gomoku') return [['user_win','normal'], ['ta_win','normal'], ['user_win','win_streak3'], ['ta_win','lose_streak3'], ['user_win','gomoku_normal_user_win'], ['ta_win','gomoku_normal_char_win'], ['user_win','gomoku_endless_user_capture'], ['ta_win','gomoku_endless_char_capture'], ['user_win','close_win'], ['ta_win','close_lose'], ['user_win','cheat_win']];
    if (game === 'ludo') return [['user_win','normal'], ['ta_win','normal'], ['user_win','win_streak3'], ['ta_win','lose_streak3'], ['user_win','lucky'], ['ta_win','stomp'], ['ta_win','close_lose'], ['user_win','close_win'], ['user_win','cheat_win'], ['user_win','flight_show'], ['ta_win','flight_show']];
    const jobs = [['user_win','normal'], ['ta_win','normal']];
    if (!['gomoku','oldmaid','ludo'].includes(game)) jobs.push(['draw','normal']);
    jobs.push(['user_win','win_streak3'], ['ta_win','lose_streak3'], ['user_win','lucky'], ['ta_win','stomp'], ['ta_win','close_lose'], ['user_win','close_win'], ['user_win','cheat_win']);
    if (game === 'wordguess') jobs.push(['user_win','soulmate']);
    return jobs;
  }
  function theaterPackKey(outcome, special) { return outcome + '__' + (special || 'normal'); }
  function theaterPackFallback(game, jobs, roleName) {
    const out = {};
    jobs.forEach(([outcome, special]) => { out[theaterPackKey(outcome, special)] = doubleTheaterFallback(game, outcome, special === 'normal' ? '' : special, roleName); });
    return out;
  }
  function assertTheaterPackShape(jobs, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('小剧场返回必须是JSON对象');
    const required = jobs.map(([outcome, special]) => theaterPackKey(outcome, special));
    const requiredSet = new Set(required);
    const keys = Object.keys(data);
    const missing = required.filter(key => !Object.prototype.hasOwnProperty.call(data, key));
    const extra = keys.filter(key => !requiredSet.has(key));
    if (missing.length) throw new Error('小剧场缺少场景key：' + missing.join(', '));
    if (extra.length) throw new Error('小剧场包含多余场景key：' + extra.join(', '));
    required.forEach(key => {
      const raw = data[key];
      if (!Array.isArray(raw)) throw new Error('小剧场场景“' + key + '”必须是数组');
      if (raw.length !== 3) throw new Error('小剧场场景“' + key + '”必须正好3条，当前' + raw.length + '条');
      raw.forEach((item, idx) => {
        const normalized = normalizeTheaterItem(item);
        if (!normalized.length) throw new Error('小剧场场景“' + key + '”第' + (idx + 1) + '条为空或格式错误');
      });
    });
  }
  function normalizeTheaterPack(game, jobs, data) {
    assertTheaterPackShape(jobs, data);
    const out = {};
    jobs.forEach(([outcome, special]) => {
      const key = theaterPackKey(outcome, special);
      out[key] = data[key].map(normalizeTheaterItem);
    });
    return out;
  }
  function theaterStylePromptLines() {
    return (promptTemplates().theater || PROMPT_TEMPLATES.theater).filter(line => !/请生成3条|只输出JSON数组|不要编号|数组包含3条|如果分段|推荐把每条|第一条小剧场|第二条小剧场|第三条小剧场|^\s*\[|^\s*\]/.test(String(line || '')));
  }
  function theaterPackSystemPrompt(jobs) {
    const keys = jobs.map(([outcome, special]) => theaterPackKey(outcome, special)).join(', ');
    return '你是严格JSON生成器。只输出一个可被JSON.parse解析的JSON对象，不要markdown，不要代码块，不要解释，不要前后缀。必须完整生成全部内容，顶层key必须一个不漏地包含这些key：' + keys + '。顶层只能包含这些key。每个key的值必须是长度为3的数组。数组里每一项必须是字符串，或段落字符串数组。禁止漏key、改key、增加key，禁止只输出部分key，禁止用“同上/略/省略”等方式跳过内容，禁止输出顶层数组。禁止把多个场景的内容合并到同一个key里；每个key只能写该key对应的3条。';
  }
  function lineJsonSkeleton(game, keys) {
    return '{\n' + keys.map(k => '  "' + k + '": ["短句1", "短句2", "短句3", "短句4", "短句5", "短句6", "短句7", "短句8"]').join(',\n') + '\n}';
  }
  function wordGuessJsonSkeleton() {
    return '{\n'
      + '  "random": ["碎碎念1", "碎碎念2", "碎碎念3", "碎碎念4", "碎碎念5", "碎碎念6", "碎碎念7", "碎碎念8"],\n'
      + '  "user_win": ["user赢定语录1", "user赢定语录2", "user赢定语录3", "user赢定语录4", "user赢定语录5", "user赢定语录6", "user赢定语录7", "user赢定语录8"],\n'
      + '  "user_lose": ["{{char}}赢定语录1", "{{char}}赢定语录2", "{{char}}赢定语录3", "{{char}}赢定语录4", "{{char}}赢定语录5", "{{char}}赢定语录6", "{{char}}赢定语录7", "{{char}}赢定语录8"],\n'
      + '  "word_bank": [\n'
      + '    {\n'
      + '      "word": "答案",\n'
      + '      "length": 2,\n'
      + '      "type": "分类",\n'
      + '      "clues": ["描述1", "描述2", "描述3", "描述4", "描述5"],\n'
      + '      "start_line": "本词刚开始时{{char}}说的一句话",\n'
      + '      "wrong_lines": ["猜错1", "猜错2", "猜错3", "猜错4", "猜错5"],\n'
      + '      "next_lines": ["下一条1", "下一条2", "下一条3", "下一条4"],\n'
      + '      "win_line": "猜中后{{char}}说的话",\n'
      + '      "reveal_line": "揭晓答案后{{char}}说的话"\n'
      + '    }\n'
      + '  ]\n'
      + '}';
  }
  function theaterPackJsonSkeleton(jobs) {
    return '{\n' + jobs.map(([outcome, special]) => {
      const key = theaterPackKey(outcome, special);
      return '  "' + key + '": ["小剧场1", "小剧场2", "小剧场3"]';
    }).join(',\n') + '\n}';
  }
  function buildTheaterPackPrompt(game, cfg, jobs) {
    const intimacyText = cfg.intimacyMode ? '开启。允许成年角色之间更亲近、更暧昧、更依赖，允许含蓄的NSFW暗示；禁止未成年人相关性内容、强迫、失控或违法内容。' : '关闭。保持自然陪伴和轻松亲近，禁止色情行为和露骨内容。';
    const prefix = (cfg.breakLimitPrompt || '').trim();
    const isDoubleGame = (GAME_META[game] || {}).mode === 'double';
    const specialDesc = {
      normal:isDoubleGame ? '普通结算。双人游戏才可以写双方胜负。若结果是平局，必须按平局处理，不得写成失败或安慰输家。' : '普通结算。单人游戏没有双方输赢，{{char}}没有参与对局、没有赢也没有输；只能写小游戏结束后{{char}}看着user的分数/操作/坚持，觉得user真厉害，进行夸奖、陪伴、调侃或约定下一局。',
      record:isDoubleGame ? '破纪录或普通玩家胜利' : '单人游戏刷新历史最高分。{{char}}只是观看者，重点写user破纪录后角色惊讶、高兴、夸奖或给出奖励。',
      win_streak3:'user同一角色同一游戏连续赢三场',
      lose_streak3:'{{char}}同一角色同一游戏连续赢三场',
      super_good:'超级厉害小剧场。玩家达成极高成就，必须说明角色明显惊讶、兴奋或难以置信。',
      super_bad:'超级菜小剧场。玩家开局很短时间内或很少回合内失败，适合安慰、调侃和轻松互动。',
      long_run:'单局持续很久。生成“陪你熬到最后”的小剧场。',
      lucky:'运气超好小剧场。玩家靠少次数、连续好骰或极快胜利达成优势。',
      soulmate:'心有灵犀小剧场。我说你猜5道全部猜中触发；必须说明user非常了解{{char}}，能跟上{{char}}的表达和暗示，{{char}}应该非常高兴、被理解、亲近感明显上升。',
      stomp:'实力悬殊小剧场。{{char}}比user赢很多，需要更强烈情绪的安慰和互动。',
      close_lose:'惜败小剧场。user差一点输给{{char}}，需要安慰，{{char}}可以带一点小侥幸和得意。',
      close_win:'险胜小剧场。user惊险获胜，{{char}}需要有一点不服气等小情绪。'
      ,cheat_win:'耍赖小剧场。user三次耍赖/悔棋都用掉了却还是获胜，重点写{{char}}纵容user、嘴硬或无奈让步后的反应。'
      ,flight_show:'特殊小剧场。飞行棋里user本局完成超过3次飞行，必须写user多次利用飞行区拉开距离，{{char}}惊讶、不服、得瑟被压回去或认真复盘飞行过程。'
      ,shock:'震惊小剧场。跳棋里user一次性从自己家跳到{{char}}家，必须写出{{char}}明显愣住、难以置信，然后复盘这条连续跳跃路线。'
      ,gomoku_normal_user_win:'五子棋普通模式，user通过五子连线获胜。重点写{{char}}承认这条棋路被user藏住或铺开，也可以有一点不服气。'
      ,gomoku_normal_char_win:'五子棋普通模式，{{char}}通过五子连线获胜。重点写{{char}}复盘自己连成五子的那条线，并安慰或轻微调侃user。'
      ,gomoku_endless_user_capture:'五子棋无尽模式，user通过回收五子后吃掉{{char}}棋子建立优势或获胜。必须写“吃子/换位/无尽模式”的局面，不要写成普通五连立刻结束。'
      ,gomoku_endless_char_capture:'五子棋无尽模式，{{char}}通过回收五子后吃掉user棋子建立优势或获胜。必须写“吃子/换位/无尽模式”的局面，不要写成普通五连立刻结束。'
      ,screw_success:'成功小剧场。拧螺丝完成但未命中破纪录、超级厉害或超长时间等特殊条件；重点写{{char}}看见user清空玻璃和螺丝后的夸奖、松口气和复盘。'
      ,screw_fail:'失败小剧场。拧螺丝失败但未达到80%遗憾条件；重点写候补槽或最后几颗螺丝卡住后，{{char}}安慰、轻微调侃并约下一局。'
      ,popstar_clutch:'命悬一线小剧场。消灭星星最后一组消完才刚好达标过关；重点写最后几颗星星、目标分数、分数跳过线的一瞬间。'
      ,popstar_godmove:'神之一手小剧场。消灭星星剩余20个以内使用打乱或单消道具并通关；重点写残局靠道具救活、星星重新连起来的反转。'
      ,popstar_clear_all:'竟然全部消除小剧场。消灭星星本关结算时剩余0个星星；重点写棋盘被清空、最后几颗星星消失后的惊喜。'
      ,paopao_clear_all:'竟然全部消除小剧场。泡泡龙一次射击后场上所有泡泡都被消掉或掉落；重点写满屏泡泡清空的爽感和{{char}}的惊讶。'
	      ,shuerte_focus:'专注小剧场。舒尔特方格最高连击超过半盘，重点写user视线扫描稳定、连续找到数字的专注感。'
	      ,shuerte_regret:'遗憾小剧场。舒尔特方格最后3格以内连续点错，重点写临门一脚手滑和{{char}}安慰鼓励。'
	      ,zuma_chain_master:'祖玛无尽模式单次射击触发3轮以上连锁，重点写珠链连续回收和消除。'
	      ,zuma_clutch:'祖玛无尽模式至少3次逼近终点洞口，重点写救险时的紧张。'
	      ,zuma_sharpshooter:'祖玛无尽模式至少发射30次且射失不超过1次，重点写精准预判。'
	      ,zuma_toolbox:'祖玛无尽模式同局用过炸弹、减速和彩虹，重点写三种道具的配合。'
	      ,zuma_endurance:'祖玛无尽模式累计生成至少150颗珠子，重点写速度越来越快时user仍然坚持。'
	      ,watersort_perfect:'倒瓶子无尽模式至少6关未使用辅助，重点写独立整理复杂水层。'
	      ,watersort_efficient:'倒瓶子连续5步以上合并同色水，重点写一气呵成的整理过程。'
	      ,watersort_no_hint:'倒瓶子无尽模式完成至少10关且从未提示，重点写user不看答案。'
	      ,watersort_extra_save:'倒瓶子无尽模式使用额外空瓶并完成至少10关，重点写单空瓶难关被救回。'
	      ,watersort_endurance:'倒瓶子无尽模式完成至少20关，重点写颜色和空瓶压力提高后仍持续整理。'
    };
    const sceneText = jobs.map(([outcome, special]) => {
      const resultText = outcome === 'score' ? '单人分数结算' : formatRecordResultForPrompt(outcome);
      return theaterPackKey(outcome, special) + '：结果=' + resultText + '，特殊触发=' + (specialDesc[special] || special || '普通结算');
    }).join('\n');
    return [
      prefix,
      specialLanguageRequirement('theater', cfg),
      ...((cfg.theaterPromptOverride || '').trim() ? String(cfg.theaterPromptOverride).split(/\r?\n/) : theaterStylePromptLines()),
      '请一次性生成下列所有小剧场场景。必须完整生成全部场景和全部内容，任何一个小剧场key都不能遗漏。',
      '【最重要的输出格式】',
      '1. 只输出一个JSON对象，顶层必须是 { }，绝对不能是 [ ]。',
      '2. 顶层key必须完整且只能使用“场景”里列出的key，禁止新增、漏掉、改名、翻译key。',
      '3. 每个key的值必须是长度正好为3的数组。',
      '4. 每个数组项是一条小剧场：可以是一个字符串；如果要分段，则该数组项可以是段落字符串数组，例如 ["第一段","第二段"]。',
      '5. 每个key只写该key对应场景的3条，禁止把record、super_good、super_bad、long_run等其他场景塞进score__normal或任何错误key里。',
      '6. 禁止遗漏任何key，禁止只输出第一个key或部分key，禁止用“同上”“省略”“略”等占位内容，禁止把缺失内容留给系统补齐。',
      '7. 禁止输出注释、解释、markdown、代码块、编号、尾随逗号、未转义换行。',
      '【输出骨架，必须按这个结构替换内容】\n' + theaterPackJsonSkeleton(jobs),
      '场景：\n' + sceneText,
      '单人游戏规则：如果场景key以score__开头，说明这是单人游戏结算，{{char}}只是观看和陪伴者，不是对手。禁止写{{char}}参与游戏、禁止写{{char}}赢、禁止写user输给{{char}}、禁止写双方平局。score__normal必须营造“游戏结束了，user表现不错/真厉害”的语气；score__record才写破纪录；score__super_bad才写很快失败；score__long_run才写持续很久。',
      '平局规则：如果结果=平局或场景key包含draw，平局就是平局，不是user失败，也不是{{char}}失败。必须写双方打平后的反应，例如想再来一场、互相试探、嘴硬、不服气、松口气、谁也没赢的调侃，禁止写成失败安慰。',
      '亲密氛围模式：' + intimacyText,
      '游戏：' + ((GAME_META[game] || {}).name || game),
      '当前角色姓名：' + (cfg.charName && cfg.charName !== '{{char}}' ? cfg.charName : '{{char}}'),
      '规则说明：如果结果里出现“{{char}}赢”，表示当前角色获胜，也就是原先的角色获胜。',
      '角色描述：' + currentCharDescription(cfg),
      '世界背景：' + (selectedWorldText(cfg) || '无'),
      '大总结：' + (selectedSummaryText(cfg) || '无')
    ].filter(Boolean).join('\n');
  }
  function promptConfigForGame(game) {
    const cfg = settings();
    const select = qs('#wb-line-preset-select');
    let promptCfg = cfg;
    let preset = currentLinePreset(game);
	    if (select && select.value && select.value.indexOf('world::') === 0) {
	      const pr = worldPresets()[parseInt(select.value.slice(7), 10)];
	      if (pr) { preset = normalizePresetName(pr.name); promptCfg = rolePromptConfig(preset, cfg, pr); }
	    } else if (select && select.value) {
	      preset = normalizePresetName(select.value.replace(/^line::/, ''));
	      promptCfg = rolePromptConfig(preset, cfg);
	    }
    return { cfg: promptCfg, preset };
  }
  function stripJsonFence(text) {
    let s = String(text || '').trim();
    const fence = String.fromCharCode(96) + String.fromCharCode(96) + String.fromCharCode(96);
    s = s.replace(new RegExp('^\\s*' + fence + '(?:json)?\\s*', 'i'), '').replace(new RegExp('\\s*' + fence + '\\s*$', 'i'), '').trim();
    return s;
  }
  function extractJsonCandidate(s) {
    const firstObj = s.indexOf('{'), firstArr = s.indexOf('[');
    let start = -1;
    if (firstObj >= 0 && (firstArr < 0 || firstObj < firstArr)) start = firstObj;
    else if (firstArr >= 0) start = firstArr;
    if (start < 0) return '';
    const stack = [];
    let quote = '', escNext = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (escNext) { escNext = false; continue; }
      if (ch === '\\') { escNext = true; continue; }
      if (quote) { if (ch === quote) quote = ''; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack[stack.length - 1] !== ch) return '';
        stack.pop();
        if (!stack.length) return s.slice(start, i + 1);
      }
    }
    return s.slice(start);
  }
  async function fetchWithTimeout(url, options, timeoutMs) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs || 45000) : null;
    try {
      return await fetch(url, Object.assign({}, options || {}, ctrl ? { signal: ctrl.signal } : {}));
    } catch(e) {
      if (e && e.name === 'AbortError') throw new Error('API请求超时，请检查移动端网络或API地址');
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  function aiCallCountForGames(games, cfg) {
    if (!cfg.apiUrl || !cfg.apiModel) return 0;
    return games.length * 2;
  }
  function aiCallCountForBatchTasks(tasks, cfg, attempts) {
    if (!cfg.apiUrl || !cfg.apiModel) return 0;
    return (tasks || []).length * Math.max(1, parseInt(attempts, 10) || 1);
  }
  async function generateLineOnlyForGame(game, promptCfg, preset, roleName, onAiCall, options) {
    const opts = options || {};
    let data = null;
    let apiFailed = '';
    let rawOutput = '';
    const apiDebug = {};
    if (promptCfg.apiUrl && promptCfg.apiModel) {
      try { if (onAiCall) onAiCall(GAME_META[game].name + '语录'); data = await callLineApiBatches(promptCfg, game, apiDebug); rawOutput = JSON.stringify(data, null, 2); assertGeneratedLinesShape(game, data); }
      catch(apiErr) { apiFailed = apiErr && apiErr.message ? apiErr.message : '语录API失败'; rawOutput = apiErr && apiErr.rawOutput ? apiErr.rawOutput : ''; console.warn('[玩伴小屋] line API failed:', apiErr); }
    }
    const targetRole = normalizePresetName(roleName || companionName());
    const failKey = targetRole + '::' + game;
    if (apiFailed && opts.skipOnApiFailure) { lineGenerationFailures[failKey] = true; return { skipped:true, reason:apiFailed, output:rawOutput || apiFailed, debug:apiDebug }; }
    if (!data) data = fallbackGenerated(game, promptCfg);
    data = normalizeGeneratedLines(game, data, targetRole);
    delete lineGenerationFailures[failKey];
    saveRoleLineSetForName(game, targetRole, preset, data);
    if (targetRole === normalizePresetName(companionName())) setCurrentLinePreset(game, preset);
    return { ok:true, output:JSON.stringify(data, null, 2), source:rawOutput ? 'api' : 'fallback', debug:apiDebug };
  }
  async function generateLinesForGame(game, promptCfg, preset, roleName, onAiCall, shouldStop, options) {
    const lineResult = await generateLineOnlyForGame(game, promptCfg, preset, roleName, onAiCall, options);
    if (lineResult && lineResult.skipped) return lineResult;
    if (shouldStop && shouldStop()) return false;
    await preGenerateTheaters(game, promptCfg, onAiCall, roleName).catch(e => console.warn('[玩伴小屋] theater pregenerate failed:', e));
    return true;
  }
  function openBatchLineGenerator() {
    if (lineGenerationBusy) { if (lineGenerationKind === 'batch') requestBatchLineGenerationCancel(); else toast('已有角色数据生成任务正在进行'); return; }
    const doc = getHostDocument();
    const old = qs('#wb-batch-lines-mask', doc); if (old) old.remove();
	    const cfg = settings();
	    const games = Object.values(GAME_META).map(g => g.id);
	    const roleOptions = roleNamesForLineStorage();
	    const apis = apiPresets();
	    const apiSelectOptions = '<option value="default">默认：当前API设置</option>' + apis.map((x,i) => '<option value="' + i + '">' + esc(x.name || ('API预设' + (i + 1))) + '</option>').join('');
	    const savedAttempts = Math.max(1, Math.min(5, parseInt(cfg.batchAttempts, 10) || 1));
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.classList.add('wb-batch-lines-mask');
    mask.id = 'wb-batch-lines-mask';
    const defaultLineTpl = promptTemplates().lineGeneration || PROMPT_TEMPLATES.lineGeneration || {};
    const defaultLinePromptText = [].concat(defaultLineTpl.header || [], defaultLineTpl.rules || [], defaultLineTpl.output || []).join('\n');
    const defaultTheaterPromptText = (promptTemplates().theater || PROMPT_TEMPLATES.theater).join('\n');
	    mask.innerHTML = '<div class="wb-modal wb-summary-modal wb-batch-lines-modal"><div class="wb-modal-title">批量生成角色数据</div><label class="wb-field"><span>角色</span><select class="wb-select" id="wb-batch-role">' + roleOptions.map(name => '<option value="' + esc(name) + '">' + esc(name) + '</option>').join('') + '</select></label><div class="wb-preset-row"><label class="wb-field" style="flex:1;margin:0;"><span>语录 API</span><select class="wb-select" id="wb-batch-lines-api">' + apiSelectOptions + '</select></label><label class="wb-field" style="flex:1;margin:0;"><span>小剧场 API</span><select class="wb-select" id="wb-batch-theater-api">' + apiSelectOptions + '</select></label></div><label class="wb-field"><span>生成次数</span><input class="wb-input" id="wb-batch-attempts" type="number" min="1" max="5" step="1" value="' + savedAttempts + '"><div class="wb-muted">每项数据最多生成的总次数；失败才会继续下一次，成功后停止。</div></label><div class="wb-actions" style="margin-bottom:8px;"><button class="wb-btn" id="wb-batch-all" type="button">全选</button><button class="wb-btn" id="wb-batch-missing" type="button">全选未生成</button><button class="wb-btn" id="wb-batch-clear" type="button">全部取消</button></div><div class="wb-worldbook-list" id="wb-batch-game-list" style="display:grid;grid-template-columns:1fr;max-height:360px;"></div><div class="wb-field" style="margin-top:10px;"><label>语录提示词</label><textarea class="wb-textarea" id="wb-batch-line-prompt" style="min-height:110px;">' + esc(cfg.batchLinePromptOverride || defaultLinePromptText) + '</textarea><button class="wb-btn" id="wb-batch-line-restore" type="button">恢复默认语录提示词</button></div><div class="wb-field"><label>小剧场提示词</label><textarea class="wb-textarea" id="wb-batch-theater-prompt" style="min-height:110px;">' + esc(cfg.batchTheaterPromptOverride || defaultTheaterPromptText) + '</textarea><button class="wb-btn" id="wb-batch-theater-restore" type="button">恢复默认小剧场提示词</button></div><div class="wb-sticky-actions"><div class="wb-api-status" id="wb-batch-info">请选择要生成的数据。</div><div class="wb-actions" style="margin-top:8px;"><button class="wb-btn primary" id="wb-batch-start" style="flex:1;">生成并覆盖</button><button class="wb-btn" id="wb-batch-cancel">返回</button></div></div></div>';
	    appendModalMask(mask);
	    const linesApiSel = qs('#wb-batch-lines-api', mask);
	    const theaterApiSel = qs('#wb-batch-theater-api', mask);
	    if (linesApiSel && Array.from(linesApiSel.options).some(o => o.value === String(cfg.batchLinesApiChoice || 'default'))) linesApiSel.value = String(cfg.batchLinesApiChoice || 'default');
	    if (theaterApiSel && Array.from(theaterApiSel.options).some(o => o.value === String(cfg.batchTheaterApiChoice || 'default'))) theaterApiSel.value = String(cfg.batchTheaterApiChoice || 'default');
	    qs('#wb-batch-line-restore', mask).onclick = () => { qs('#wb-batch-line-prompt', mask).value = defaultLinePromptText; setSettings({ batchLinePromptOverride:'' }); };
	    qs('#wb-batch-theater-restore', mask).onclick = () => { qs('#wb-batch-theater-prompt', mask).value = defaultTheaterPromptText; setSettings({ batchTheaterPromptOverride:'' }); };
	    const linePromptBox = qs('#wb-batch-line-prompt', mask); if (linePromptBox) linePromptBox.oninput = () => setSettings({ batchLinePromptOverride: linePromptBox.value === defaultLinePromptText ? '' : linePromptBox.value });
	    const theaterPromptBox = qs('#wb-batch-theater-prompt', mask); if (theaterPromptBox) theaterPromptBox.oninput = () => setSettings({ batchTheaterPromptOverride: theaterPromptBox.value === defaultTheaterPromptText ? '' : theaterPromptBox.value });
	    const selectedRole = () => normalizePresetName(qs('#wb-batch-role', mask)?.value || companionName());
	    const selectedTasks = () => qsa('.wb-batch-part:checked', mask).map(x => ({ game:x.dataset.game, part:x.dataset.part }));
	    const selectedAttempts = () => Math.max(1, Math.min(5, parseInt(qs('#wb-batch-attempts', mask)?.value, 10) || 1));
	    const selectedApiConfig = part => {
	      const id = qs(part === 'theater' ? '#wb-batch-theater-api' : '#wb-batch-lines-api', mask)?.value || 'default';
	      const pr = id === 'default' ? null : apis[parseInt(id, 10)];
	      const api = pr || cfg;
	      return { apiUrl: api.apiUrl || '', apiKey: api.apiKey || '', apiModel: api.apiModel || '' };
	    };
	    const selectedCallCount = (tasks, attempts) => (tasks || []).filter(task => { const api = selectedApiConfig(task.part); return api.apiUrl && api.apiModel; }).length * Math.max(1, parseInt(attempts, 10) || 1);
	    const selectedApiName = part => {
	      const id = qs(part === 'theater' ? '#wb-batch-theater-api' : '#wb-batch-lines-api', mask)?.value || 'default';
	      if (id === 'default') return '默认';
	      const pr = apis[parseInt(id, 10)];
	      return pr ? (pr.name || '未命名API') : '默认';
	    };
	    let pendingBatch = null;
	    const resetBatchConfirm = () => { pendingBatch = null; const start = qs('#wb-batch-start', mask); if (start) start.textContent = '生成并覆盖'; };
	    const refresh = () => { resetBatchConfirm(); const tasks = selectedTasks(); const attempts = selectedAttempts(); const calls = selectedCallCount(tasks, attempts); const info = qs('#wb-batch-info', mask); if (info) info.textContent = tasks.length ? ('将覆盖“' + selectedRole() + '”的 ' + tasks.length + ' 项数据；每项最多生成 ' + attempts + ' 次；语录API：' + selectedApiName('lines') + '；小剧场API：' + selectedApiName('theater') + '；预计最多调用 AI ' + calls + ' 次。') : '请选择要生成的数据。'; };
    const renderGameList = () => {
      const role = selectedRole();
      const list = qs('#wb-batch-game-list', mask);
	      if (!list) return;
	      list.innerHTML = games.map(id => {
	        const lineStatus = roleLineStorageStatus(id, role);
	        const theaterStatus = roleTheaterStorageStatus(id, role);
	        return '<div class="wb-api-status" style="display:grid;gap:6px;"><div style="font-weight:700;">' + esc(GAME_META[id].name) + '</div><label class="wb-switch"><input type="checkbox" class="wb-batch-part" data-game="' + esc(id) + '" data-part="lines">语录 <span class="wb-muted" style="margin-left:6px;">' + esc(lineStatus) + '</span></label><label class="wb-switch"><input type="checkbox" class="wb-batch-part" data-game="' + esc(id) + '" data-part="theater">小剧场 <span class="wb-muted" style="margin-left:6px;">' + esc(theaterStatus) + '</span></label></div>';
	      }).join('');
	      qsa('.wb-batch-part', mask).forEach(x => x.onchange = refresh);
	      refresh();
	    };
	    qs('#wb-batch-all', mask).onclick = () => { qsa('.wb-batch-part', mask).forEach(x => x.checked = true); refresh(); };
	    qs('#wb-batch-missing', mask).onclick = () => {
	      const role = selectedRole();
	      qsa('.wb-batch-part', mask).forEach(x => {
		        x.checked = x.dataset.part === 'lines' ? roleLineStorageStatus(x.dataset.game, role) !== '已有' : roleTheaterStorageStatus(x.dataset.game, role) !== '已有';
	      });
	      refresh();
	    };
	    qs('#wb-batch-clear', mask).onclick = () => { qsa('.wb-batch-part', mask).forEach(x => x.checked = false); refresh(); };
    qs('#wb-batch-role', mask).onchange = renderGameList;
	    qs('#wb-batch-attempts', mask).oninput = () => { setSettings({ batchAttempts: selectedAttempts() }); refresh(); };
	    qs('#wb-batch-lines-api', mask).onchange = () => { setSettings({ batchLinesApiChoice: qs('#wb-batch-lines-api', mask).value || 'default' }); refresh(); };
	    qs('#wb-batch-theater-api', mask).onchange = () => { setSettings({ batchTheaterApiChoice: qs('#wb-batch-theater-api', mask).value || 'default' }); refresh(); };
    renderGameList();
    qs('#wb-batch-cancel', mask).onclick = () => mask.remove();
	    qs('#wb-batch-start', mask).onclick = async () => {
	      if (lineGenerationBusy) { if (lineGenerationKind === 'batch') requestBatchLineGenerationCancel(); else toast('已有角色数据生成任务正在进行'); return; }
	      if (!pendingBatch) {
	        const linePromptOverride = qs('#wb-batch-line-prompt', mask)?.value || '';
	        const theaterPromptOverride = qs('#wb-batch-theater-prompt', mask)?.value || '';
		        setSettings({ batchLinePromptOverride: linePromptOverride === defaultLinePromptText ? '' : linePromptOverride, batchTheaterPromptOverride: theaterPromptOverride === defaultTheaterPromptText ? '' : theaterPromptOverride, batchAttempts: selectedAttempts(), batchLinesApiChoice: qs('#wb-batch-lines-api', mask).value || 'default', batchTheaterApiChoice: qs('#wb-batch-theater-api', mask).value || 'default' });
	        const tasks = selectedTasks();
	        if (!tasks.length) { toast('请先选择要生成的数据'); return; }
	        const attempts = selectedAttempts();
	        const calls = selectedCallCount(tasks, attempts);
	        const role = selectedRole();
	        const lineApi = selectedApiConfig('lines');
	        const theaterApi = selectedApiConfig('theater');
	        pendingBatch = { tasks, calls, role, attempts, lineApi, theaterApi, linePromptOverride, theaterPromptOverride, lineApiName:selectedApiName('lines'), theaterApiName:selectedApiName('theater') };
	        const info = qs('#wb-batch-info', mask); if (info) info.textContent = '确认覆盖“' + role + '”的 ' + tasks.length + ' 项数据，每项最多生成 ' + attempts + ' 次；语录API：' + pendingBatch.lineApiName + '；小剧场API：' + pendingBatch.theaterApiName + '；预计最多调用 AI ' + calls + ' 次。再次点击确认生成。';
	        const btn = qs('#wb-batch-start', mask); if (btn) btn.textContent = '确认生成';
	        return;
	      }
	      const tasks = pendingBatch.tasks.slice();
	      const calls = pendingBatch.calls;
	      const role = pendingBatch.role;
	      const attempts = Math.max(1, pendingBatch.attempts || 1);
	      const lineApi = pendingBatch.lineApi || {};
	      const theaterApi = pendingBatch.theaterApi || {};
	      const linePromptOverride = pendingBatch.linePromptOverride || '';
	      const theaterPromptOverride = pendingBatch.theaterPromptOverride || '';
	      const taskTotal = tasks.length;
	      let taskDone = 0;
	      pendingBatch = null;
	        const btn = qs('#wb-batch-start', mask); if (btn) { btn.disabled = false; btn.textContent = '中断生成'; }
		        const preset = normalizePresetName(role);
		        const basePromptCfg = rolePromptConfig(role, cfg, { linePromptOverride, theaterPromptOverride });
	        const setInfo = text => { const info = qs('#wb-batch-info', mask); if (info) info.textContent = text; };
	        const batchStatus = (label, attempt) => {
	          const text = '正在批量生成数据：' + Math.min(taskDone + 1, taskTotal) + '/' + taskTotal + '（' + label + '，第' + (attempt + 1) + '/' + attempts + '次）';
	          setLineGenerationStatus(text, true);
	          setInfo(text);
	        };
	        const progress = () => {};
	        progress.done = () => taskDone;
	        const skipped = [];
	        batchGenerationDebug = [];
        lineGenerationKind = 'batch';
        batchLineGenerationCancel = false;
        setLineGenerationStatus(taskTotal ? '正在批量生成数据：0/' + taskTotal : '正在批量生成数据：离线生成', true);
	        setInfo(lineGenerationStatus);
	        if (mask.parentNode) mask.remove();
	        if (currentTab === 'settings') renderSettings();
	        try {
	          const runTask = async (task, label, debugItem) => {
	            const attemptLogs = [];
	            let last = false;
	            for (let attempt = 0; attempt < attempts; attempt++) {
	              if (batchLineGenerationCancel) return false;
	              const attemptLabel = label + ' 第' + (attempt + 1) + '次';
	              batchStatus(label, attempt);
	              if (debugItem) {
	                debugItem.ok = false;
	                debugItem.reason = '生成中';
	                debugItem.output = attemptLogs.concat(['【第' + (attempt + 1) + '次】生成中...']).join('\n\n');
	              }
	              const taskCfg = Object.assign({}, basePromptCfg, task.part === 'lines' ? lineApi : theaterApi);
	              last = task.part === 'lines'
	                ? await generateLineOnlyForGame(task.game, taskCfg, preset, role, progress, { skipOnApiFailure:true })
	                : await preGenerateTheaters(task.game, taskCfg, progress, role, { skipOnApiFailure:true });
	              if (debugItem && last && last.debug) {
	                debugItem.inputTokensTotal = (debugItem.inputTokensTotal || 0) + (last.debug.inputTokensActual || last.debug.inputTokensEstimated || 0);
	                debugItem.durationMsTotal = (debugItem.durationMsTotal || 0) + (last.debug.durationMs || 0);
	              }
	              attemptLogs.push('【第' + (attempt + 1) + '次】' + ((last && last.skipped) ? '失败：' + (last.reason || '未知失败') : (last === false ? '中断' : '成功')) + '\n' + (formatApiDebugMeta(last && last.debug) || '输入token：无\n输出时间：无') + '\n输出：\n' + ((last && last.output) || '无输出'));
	              if (debugItem) debugItem.output = attemptLogs.join('\n\n');
	              if (!(last && last.skipped) || last === false) break;
	            }
	            if (last && typeof last === 'object') last.output = attemptLogs.join('\n\n');
	            return last;
	          };
	          for (let i = 0; i < tasks.length; i++) {
	            if (batchLineGenerationCancel) break;
	            const task = tasks[i];
	            const label = GAME_META[task.game].name + (task.part === 'lines' ? '语录' : '小剧场');
	            setLineGenerationStatus('正在批量生成数据：' + taskDone + '/' + taskTotal + '（准备生成' + label + '）', true);
	            const debugItem = { label, game:task.game, part:task.part, ok:false, reason:'等待生成', inputTokensTotal:0, durationMsTotal:0, output:'等待开始' };
	            batchGenerationDebug.push(debugItem);
	            let completed = await runTask(task, label, debugItem);
	            if (completed !== false) taskDone++;
	            debugItem.ok = !(completed && completed.skipped) && completed !== false;
	            debugItem.reason = (completed && completed.reason) || (completed === false ? '已中断或未完成' : '');
	            debugItem.output = (completed && completed.output) || (completed === false ? '已中断或未完成' : '已成功，但没有返回调试输出');
	            if (completed && completed.skipped) skipped.push(label + (completed.reason ? '（' + completed.reason + '）' : ''));
	            if (batchLineGenerationCancel || completed === false) break;
	          }
          if (batchLineGenerationCancel) {
            const done = taskDone;
            setLineGenerationStatus(taskTotal ? ('批量生成已中断：' + done + '/' + taskTotal) : '批量生成已中断', false);
            toast('批量生成已中断，已完成的游戏语录已保存');
          } else {
            const done = taskDone;
            setLineGenerationStatus(taskTotal ? ('批量生成完成：' + done + '/' + taskTotal + (skipped.length ? '，失败 ' + skipped.length + ' 个' : '')) : '批量生成完成：离线生成', false);
            toast(skipped.length ? ('批量生成完成，失败：' + skipped.join('、')) : '批量语录已生成并覆盖');
          }
        } catch(e) {
          console.error('[玩伴小屋] batch generate lines failed:', e);
          setLineGenerationStatus('批量生成失败：' + (e && e.message ? e.message : '响应无法解析'), false);
          toast('批量生成失败：' + (e && e.message ? e.message : '响应无法解析'));
        } finally {
          lineGenerationKind = '';
          batchLineGenerationCancel = false;
          updateLineGenerationStatusUI();
          if (currentTab === 'settings') renderSettings();
        }
	        if (mask.parentNode) renderGameList();
	    };
  }

  function getHostTargets() {
    const targets = [];
    try {
      if (window.parent && window.parent !== window) {
        void window.parent.document.body;
        const parentJQ = window.parent.$ || window.parent.jQuery || getHostJQ();
        targets.push({ doc: window.parent.document, jq: parentJQ });
      }
    } catch(e) {}
    targets.push({ doc: document, jq: (typeof $ !== 'undefined' ? $ : (typeof jQuery !== 'undefined' ? jQuery : null)) || getHostJQ() });
    return targets;
  }

  let menuRetries = 0;
  let menuRetryTimer = null;
  const menuObservers = new Map();

  function addMenuItem() {
    if (menuRetryTimer) { clearTimeout(menuRetryTimer); menuRetryTimer = null; }
    menuRetries = 0;
    tryInjectMenu();
  }

  function tryInjectMenu() {
    const targets = getHostTargets();
    for (const target of targets) {
      const pd = target.doc;
      const pj = target.jq;
      if (!pd || !pj) continue;
      if (pj('#' + MENU_ID, pd).length) { installMenuObserver(pd, pj); return; }
      let menu = null;
      for (const sel of MENU_SELECTORS) {
        const found = pj(sel, pd);
        if (found.length) { menu = found; break; }
      }
      if (menu) {
        appendMenuItem(menu, pd, pj);
        installMenuObserver(pd, pj);
        return;
      }
    }
    menuRetries++;
    if (menuRetries < 30) {
      const delay = menuRetries < 5 ? 1000 : menuRetries < 15 ? 2000 : 3000;
      menuRetryTimer = setTimeout(tryInjectMenu, delay);
    } else {
      console.warn('[玩伴小屋] 未找到 SillyTavern 扩展菜单容器，停止注入。');
    }
  }

  function appendMenuItem(menu, pd, pj) {
    if (pj('#' + MENU_ID, pd).length) return;
    const wrap = pj('<div class="extension_container interactable" tabindex="0"></div>');
    const item = pj('<div class="list-group-item flex-container flexGap5 interactable" id="' + MENU_ID + '" title="玩伴小屋"><div class="fa-fw fa-solid fa-gamepad extensionsMenuExtensionButton"></div><span>玩伴小屋</span></div>');
    item.on('click touchend pointerup', async (e) => {
      const now = Date.now();
      if (now - lastMenuOpenAt < 320) return;
      lastMenuOpenAt = now;
      if (e.type !== 'click') e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      try {
        const btn = pj('#extensionsMenuButton', pd);
        if (btn.length && menu.is(':visible')) { btn.trigger('click'); await new Promise(r => setTimeout(r, 150)); }
      } catch(e2) {}
      buildPopup();
    });
    wrap.append(item);
    menu.append(wrap);
    console.log('[玩伴小屋] 菜单项已添加');
  }

  function installMenuObserver(pd, pj) {
    const existing = menuObservers.get(pd);
    if (existing) {
      try { existing.takeRecords(); if (pd.body) return; } catch(e) {}
      try { existing.disconnect(); } catch(e) {}
      menuObservers.delete(pd);
    }
    try {
      const observer = new MutationObserver(() => {
        if (!pj || !pd.body || pj('#' + MENU_ID, pd).length) return;
        for (const sel of MENU_SELECTORS) {
          const found = pj(sel, pd);
          if (found.length) { appendMenuItem(found, pd, pj); break; }
        }
      });
      observer.observe(pd.body, { childList: true, subtree: true });
      menuObservers.set(pd, observer);
    } catch(e) {}
  }

  function init() { addMenuItem(); bindMessageNotifyEvents(); syncFloatingBall(); scheduleInitialUpdateCheck(); }

  if (!standalone && typeof window[FLAG] === 'undefined') {
    window[FLAG] = true;
    const waitJQ = setInterval(() => {
      const jq = getHostJQ();
      if (jq) {
        clearInterval(waitJQ);
        const doc = getHostDocument();
        const state = doc.readyState;
        const startDelay = state === 'complete' ? 1500 : 4000;
        const go = () => setTimeout(init, startDelay);
        if (state === 'complete' || state === 'interactive') go();
        else doc.addEventListener('DOMContentLoaded', go);
      }
    }, 100);
  } else if (!standalone) {
    console.warn('[玩伴小屋] Script already loaded, skipping.');
  }

  function openSummaryEditor(mask, idx) {
    const arr = summaries();
    const existing = idx >= 0 ? arr[idx] : null;
    const editor = getHostDocument().createElement('div');
    editor.className = modalMaskClass();
    editor.id = 'wb-summary-editor-mask';
    editor.innerHTML = '<div class="wb-modal wb-summary-modal"><div class="wb-modal-title">' + (existing ? '编辑大总结' : '添加/导入大总结') + '</div><div class="wb-field"><label>标题</label><input class="wb-input" id="wb-sum-name" placeholder="例：第一章剧情总结" value="' + esc(existing ? existing.name : '') + '"></div><div class="wb-field"><label>内容</label><textarea class="wb-textarea" id="wb-sum-content" style="min-height:220px;" placeholder="在此粘贴大总结，或用下方文件导入...">' + esc(existing ? existing.content : '') + '</textarea></div><div class="wb-actions"><button class="wb-btn" id="wb-sum-file-btn">从文件导入</button><input type="file" id="wb-sum-file" accept=".txt,.md,.json,.yaml,.yml,.csv,.log" style="display:none;"><button class="wb-btn" id="wb-sum-clear">清空</button></div><div class="wb-actions" style="margin-top:12px;"><button class="wb-btn primary" id="wb-sum-save" style="flex:1;">保存并导入</button><button class="wb-btn" id="wb-sum-cancel">取消</button></div></div>';
    appendModalMask(editor);
    qs('#wb-sum-file-btn', editor).onclick = () => qs('#wb-sum-file', editor).click();
    qs('#wb-sum-file', editor).onchange = e => { const f = e.target.files && e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { qs('#wb-sum-content', editor).value = String(r.result || ''); if (!qs('#wb-sum-name', editor).value.trim()) qs('#wb-sum-name', editor).value = f.name.replace(/\.[^.]+$/, ''); }; r.readAsText(f); };
    qs('#wb-sum-clear', editor).onclick = () => { qs('#wb-sum-content', editor).value = ''; };
    qs('#wb-sum-cancel', editor).onclick = () => editor.remove();
    qs('#wb-sum-save', editor).onclick = () => {
      const name = qs('#wb-sum-name', editor).value.trim();
      const content = qs('#wb-sum-content', editor).value.trim();
      if (!name || !content) { toast('请输入大总结标题和内容'); return; }
      let saved;
      if (existing) { saved = Object.assign({}, existing, { name, content }); arr[idx] = saved; }
      else { saved = { id:'sum_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), name, content }; arr.unshift(saved); }
      saveSummaries(arr); setSettings({ summaryId: saved.id }); refreshSummaryInjectionUI(saved.id); editor.remove(); renderSummaryManagerList(mask); toast('大总结已保存并导入');
    };
  }
  function closeSummaryModal(mask) { if (mask) mask.remove(); const ed = qs('#wb-summary-editor-mask', getHostDocument()); if (ed) ed.remove(); }
  function saveSettingsFromUI() {
    autoSaveInjectionSettingsFromUI();
    toast('注入设置已保存'); render();
  }
  function saveWorldPresetFromUI() {
    const name = roleNameFromWorldUI();
    const nameInput = qs('#wb-char-name');
    if (nameInput && !nameInput.value.trim()) nameInput.value = name;
    const arr = worldPresets().filter(x => normalizePresetName(x && x.name) !== name);
    arr.unshift(worldPresetSnapshotFromUI(name));
    saveWorldPresets(arr);
    setSettings({ charName: name, selectedWorldPresetName: name });
    toast('已保存当前角色配置：' + name);
    renderSettings();
  }
  function resetCurrentWorldDefaultFromUI() {
    const name = normalizePresetName(companionName());
    showConfirm('恢复当前角色卡默认', '确定将当前世界观注入设置恢复为“' + name + '”的角色卡默认内容吗？已保存的角色和世界观预设不会被删除，前置提示词 / 破限词会保留。', () => {
      const keepBreak = qs('#wb-break-limit-prompt') ? qs('#wb-break-limit-prompt').value.trim() : (settings().breakLimitPrompt || '');
      setSettings({
        lazyWorldInject: false,
        userDescSource: 'manual',
        userName: '{{user}}',
        injectCharDesc: true,
        charDescMode: 'auto',
        manualCharPersona: '',
        charName: '{{char}}',
        charDescriptionSnapshot: '',
        avatarUrl: '',
        summaryId: '',
        summarySnapshot: null,
        worldAutoMountMode: '',
        selectedWorldEntries: [],
        selectedWorldPresetName: '',
        specialLanguageEnabled: false,
        specialLanguage: '粤语',
        breakLimitPrompt: keepBreak
      });
      renderSettings();
      toast('已恢复当前角色卡默认配置');
    });
  }
  async function loadWorldPresetFromUI() {
    const idx = parseInt(qs('#wb-world-preset').value, 10);
    const pr = worldPresets()[idx];
    if (!pr) { setSettings({ selectedWorldPresetName: '' }); return; }
    const lazy = qs('#wb-lazy-world-inject'); if (lazy) lazy.checked = !!pr.lazyWorldInject;
    qs('#wb-inject-user-desc').checked = pr.injectUserDesc !== false;
    qs('#wb-inject-char-desc').checked = pr.injectCharDesc !== false;
    qs('#wb-inject-chat').checked = !!pr.injectChat;
    const sle = qs('#wb-special-language-enabled'); if (sle) sle.checked = !!pr.specialLanguageEnabled;
    const sl = qs('#wb-special-language'); if (sl) sl.value = specialLanguageOptions().includes(pr.specialLanguage) ? pr.specialLanguage : '粤语';
    const slw = qs('#wb-special-language-wrap'); if (slw && sle) slw.style.display = sle.checked ? '' : 'none';
    const im = qs('#wb-intimacy-mode'); if (im) im.checked = !!pr.intimacyMode;
    const bp = qs('#wb-break-limit-prompt'); if (bp) bp.value = pr.breakLimitPrompt || '';
    const uds = qs('#wb-user-desc-source'); if (uds) uds.value = pr.userDescSource === 'auto' ? 'auto' : 'manual';
    qs('#wb-user-persona').value = pr.userPersona || '';
    const cm2 = qs('#wb-char-desc-mode'); if (cm2) cm2.value = pr.charDescMode === 'manual' ? 'manual' : 'auto';
    const mp2 = qs('#wb-manual-char-persona'); if (mp2) mp2.value = pr.manualCharPersona || '';
    const mw2 = qs('#wb-manual-char-wrap'); if (mw2 && cm2) mw2.style.display = cm2.value === 'manual' ? '' : 'none';
    const cn = qs('#wb-char-name'); if (cn) cn.value = pr.charName && pr.charName !== '{{char}}' ? pr.charName : '';
    const av = qs('#wb-avatar-url'); if (av) av.value = pr.avatarUrl || '';
    qs('#wb-summary-select').value = pr.summaryId || '';
    const pv = qs('#wb-summary-preview'); if (pv) pv.textContent = pr.summarySnapshot ? ('[' + (pr.summarySnapshot.name || '大总结') + '] ' + String(pr.summarySnapshot.content || '').replace(/\s+/g, ' ').slice(0, 140)) : summaryPreview(pr.summaryId || '');
    const matched = (pr.selectedWorldEntries || []).map(x => ({ label:x.label || '', content:x.content || '', wbName:x.wbName || '', uid:x.uid || '' }));
    renderWorldbookTags(matched, true);
    const wam = qs('#wb-world-auto-mount'); if (wam) wam.value = ['blue','bluegreen'].includes(pr.worldAutoMountMode) ? pr.worldAutoMountMode : '';
    setWorldAutoMountControlText();
    updateMountedWorldbookNames();
    setSettings({
      lazyWorldInject: !!(qs('#wb-lazy-world-inject') && qs('#wb-lazy-world-inject').checked),
      injectUserDesc: qs('#wb-inject-user-desc').checked,
      injectCharDesc: qs('#wb-inject-char-desc').checked,
      injectChat: qs('#wb-inject-chat').checked,
      specialLanguageEnabled: !!(qs('#wb-special-language-enabled') && qs('#wb-special-language-enabled').checked),
      specialLanguage: qs('#wb-special-language') ? qs('#wb-special-language').value : '粤语',
      intimacyMode: !!(qs('#wb-intimacy-mode') && qs('#wb-intimacy-mode').checked),
      breakLimitPrompt: qs('#wb-break-limit-prompt') ? qs('#wb-break-limit-prompt').value.trim() : '',
      userDescSource: qs('#wb-user-desc-source') ? (qs('#wb-user-desc-source').value === 'auto' ? 'auto' : 'manual') : 'manual',
      userPersona: qs('#wb-user-persona').value.trim(),
      charDescMode: qs('#wb-char-desc-mode') ? qs('#wb-char-desc-mode').value : 'auto',
      manualCharPersona: qs('#wb-manual-char-persona') ? qs('#wb-manual-char-persona').value.trim() : '',
      charName: (qs('#wb-char-name') && qs('#wb-char-name').value.trim()) || '{{char}}',
      charDescriptionSnapshot: pr.charDescriptionSnapshot || '',
      avatarUrl: qs('#wb-avatar-url') ? qs('#wb-avatar-url').value.trim() : '',
      summaryId: qs('#wb-summary-select').value || '',
      summarySnapshot: pr.summarySnapshot || null,
      worldAutoMountMode: qs('#wb-world-auto-mount') ? (qs('#wb-world-auto-mount').value || '') : '',
      selectedWorldEntries: matched,
      selectedWorldPresetName: normalizePresetName(pr.name || qs('#wb-char-name')?.value || companionName())
    });
    if (qs('#wb-world-auto-mount') && qs('#wb-world-auto-mount').value) await applyWorldAutoMount(qs('#wb-world-auto-mount').value, false);
    applyRoleToAllGames(normalizePresetName(pr.name || qs('#wb-char-name')?.value || companionName()));
    const preview = qs('#wb-char-desc-preview'); if (preview) preview.textContent = currentCharDescription(settings());
    toast('角色和世界观已按保存快照载入');
  }
  function deleteWorldPresetFromUI() { const idx=parseInt(qs('#wb-world-preset').value,10); const arr=worldPresets(); if(!arr[idx]) return; showConfirm('删除角色和世界观','确定删除这个角色和世界观预设吗？',()=>{ arr.splice(idx,1); saveWorldPresets(arr); renderSettings(); }); }

  function renderGame(id) {
    stopGame();
    currentGame = id;
    currentRoundLineEvents = [];
    currentRoundTheaterInfo = null;
    if (GAME_META[id]) currentTab = GAME_META[id].mode;
    saveWindowState(currentTab, id);
    syncPopupModeClass();
    const g = GAME_META[id]; const cfg = settings(); const body = qs('#wb-body'); body.className = 'wb-body wb-game-mode';
    const lineTools = cfg.companion ? '<div class="wb-line-tools"><select class="wb-select" id="wb-line-preset-select"></select><button class="wb-btn primary" id="wb-generate-lines">生成</button></div>' : '';
    const wordBankTools = !standalone && id === 'wordguess' ? '<select class="wb-select" id="wb-word-bank-source-inline" title="我说你猜题库"><option value="role">角色题库</option><option value="default">默认题库</option></select>' : '';
    const pauseBtn = '<button class="wb-btn" id="wb-pause">暂停</button>';
    const companionPanel = cfg.companion ? '<div class="wb-panel wb-side-companion">' + companionHTML() + '</div>' : '';
    const dockSide = companionDockSide(cfg);
    const layoutClass = (cfg.companion ? ('companion-pc-' + (dockSide === 'start' ? 'left' : 'right') + ' companion-mobile-' + (dockSide === 'start' ? 'top' : 'bottom')) : 'no-companion') + ' game-layout-' + id;
    body.innerHTML = '<div class="wb-layout ' + layoutClass + '"><div class="wb-panel wb-game-main"><div class="wb-toolbar"><button class="wb-btn" id="wb-back">返回</button><div class="wb-stat"><span class="wb-pill wb-title-row"><span class="wb-game-title-text">' + esc(g.name) + '</span><button class="wb-rule-btn" id="wb-game-rules" title="游戏介绍" aria-label="游戏介绍" type="button">💡</button></span><span class="wb-pill" id="wb-score">本局：0</span><span class="wb-pill" id="wb-high">' + esc(scoreDisplay(id)) + '</span></div><div class="wb-actions">' + wordBankTools + lineTools + '<button class="wb-btn" id="wb-game-records">记录</button>' + pauseBtn + '<button class="wb-btn" id="wb-restart">重开</button></div></div><div class="wb-board-wrap wb-gamebox-' + esc(id) + '" id="wb-gamebox"><div class="wb-start-cover"><div>准备开始</div><button class="wb-btn primary" id="wb-start-cover-btn">开始游戏</button></div></div></div>' + companionPanel + '</div>';
    if (!standalone) primeMessageNotifyBaseline();
    gameStarted = false; gamePaused = true;
    qs('#wb-back').onclick = () => { stopGame(); currentGame = null; saveWindowState(currentTab, ''); syncPopupModeClass(); renderSelect(currentTab); };
    qs('#wb-start-cover-btn').onclick = () => startCurrentGame(id);
    qs('#wb-game-rules').onclick = e => { e.stopPropagation(); showGameRules(id); };
    qs('#wb-game-records').onclick = () => showGameRecords(id);
    const wordBankSelect = qs('#wb-word-bank-source-inline');
    if (wordBankSelect) {
      wordBankSelect.value = wordGuessBankSource();
      wordBankSelect.onchange = () => {
        saveWordGuessBankSource(wordBankSelect.value);
        clearProgress('wordguess');
        renderGame('wordguess');
      };
    }
    const pbtn = qs('#wb-pause'); if (pbtn) pbtn.onclick = togglePause;
    qs('#wb-restart').onclick = () => { commitGameActiveDuration(true); gamePaused = true; showGamePauseOverlay(); const pbtn = qs('#wb-pause'); if (pbtn) pbtn.textContent = '继续'; showConfirm('确认重开', '确定要重开当前游戏吗？当前进度会丢失。', () => { stopGame(); clearProgress(id); renderGame(id); }, () => startPauseResumeCountdown()); };
    renderLinePresetSelect(id);
    const presetSelect = qs('#wb-line-preset-select'); if (presetSelect) presetSelect.onchange = () => applyLinePresetSelection(id, presetSelect.value);
    const genBtn = qs('#wb-generate-lines'); if (genBtn) genBtn.onclick = () => openSingleGenerateChoice(id);
    updateLineGenerationStatusUI();
    if (!needsFirstMoverChoice(id) && !['linklink','blackjack'].includes(id) && DEFAULT_LINES[id] && DEFAULT_LINES[id].start) speak(id, 'start');
    if (id === 'linklink' || id === 'blackjack') setTimeout(() => { const saved = gameProgress(id); if (currentGame === id && !gameStarted && !(saved && hasPlayableProgress(id, saved))) startCurrentGame(id); }, 30);
    setTimeout(() => { const saved = gameProgress(id); if (currentGame === id && saved && hasPlayableProgress(id, saved) && !gameStarted) showProgressChoice(id, saved); }, 60);
  }

  function startCurrentGame(id, savedState, options) {
    if (startupBlocked) return;
    if (gameStarted) return;
    const storedState = gameProgress(id);
    const nextContent = contentForGame(id);
    try { requireCompatibleSave(savedState || storedState, nextContent); } catch(error) { toast(error.message); return; }
    const forceNew = !!(options && options.forceNew);
    const resumeState = savedState || (!forceNew && storedState && hasPlayableProgress(id, storedState) ? storedState : null);
    if (!resumeState && GAME_CHOICES[id]) {
      showGameChoice(id, choice => startCurrentGame(id, choiceSavePatch(id, choice)));
      return;
    }
    if (!resumeState && needsFirstMoverChoice(id)) {
      clearProgress(id);
      showFirstMoverChoice(id, firstMover => startCurrentGame(id, Object.assign({}, savedState || {}, { firstMover })));
      return;
    }
    if (resumeState && needsFirstMoverChoice(id) && !storedState && !resumeState.firstMover) {
      showFirstMoverChoice(id, firstMover => startCurrentGame(id, Object.assign({}, resumeState, { firstMover })));
      return;
    }
    if (!resumeState) clearProgress(id);
    roundContent = nextContent;
    gameStarted = true;
    gamePaused = false;
    firstMoverAwaitingUserAction = !!(needsFirstMoverChoice(id) && savedState && savedState.firstMover && !storedState && !savedState.userActed);
    gameAccumulatedMs = Math.max(0, Number(resumeState?.durationMs || 0));
    gamePetRewardNextMs = Math.max(nextPetGameRewardThreshold(gameAccumulatedMs), Number(resumeState?.petRewardNextMs || 0) || 0);
    gameActiveStartedAt = Date.now();
    startGameDurationRewardTimer();
    hideGamePauseOverlay();
    currentRoundRecord = false;
    currentRoundLineEvents = Array.isArray(resumeState?.lineEvents) ? resumeState.lineEvents.slice(-120) : [];
    currentRoundTheaterInfo = null;
    gameStartAt = Date.now();
    const pbtn = qs('#wb-pause'); if (pbtn) pbtn.textContent = '暂停';
    const coverBtn = qs('#wb-start-cover-btn'); if (coverBtn) coverBtn.style.display = 'none';
    if (randomLineTimer) clearInterval(randomLineTimer);
    lastDialogueAt = Date.now();
    if (!standalone) randomLineTimer = setInterval(() => {
      if (currentGame && gameStarted && !gamePaused && Date.now() - lastDialogueAt >= 10000) speak(currentGame, 'random');
    }, 1000);
    const plugin = gamePlugin(id);
    const env = modularGameEnvironment(id);
    const gameEnv = plugin.REQUIRED_ENV ? env.legacy : env;
    const startPlugin = state => plugin.createGame(gameEnv, state);
    const started = startPlugin(resumeState);
    if (id === 'wordguess') {
      started.catch(e => { console.warn('[玩伴小屋] wordguess start failed:', e); toast('我说你猜加载失败，已尝试重新生成题目'); startPlugin(null).catch(err => console.error('[玩伴小屋] wordguess fallback failed:', err)); });
    } else if (started) activeGameController = started;
    scheduleFitGameSurface();
  }
  function legacyGameEnvironment() {
    return {
      get activeGameController() { return activeGameController; },
      set activeGameController(value) { activeGameController = value; },
      get addSwipe() { return addSwipe; },
      get addTapDirection() { return addTapDirection; },
      get addTaWin() { return addTaWin; },
      get appendModalMask() { return appendModalMask; },
      get callApiText() { return callApiText; },
      get canvasThemePalette() { return canvasThemePalette; },
      get CHEAT_MAX() { return CHEAT_MAX; },
      get cheatAttemptResult() { return cheatAttemptResult; },
      get cheatButtonCompactHTML() { return cheatButtonCompactHTML; },
      get cheatButtonHTML() { return cheatButtonHTML; },
      get choiceForState() { return choiceForState; },
      get choiceSavePatch() { return choiceSavePatch; },
      get clearProgress() { return clearProgress; },
      get cloneCheatState() { return cloneCheatState; },
      get controlModeLabel() { return controlModeLabel; },
      get currentCharDescription() { return currentCharDescription; },
      get currentGame() { return currentGame; },
      get currentGameDurationMs() { return currentGameDurationMs; },
      get DEFAULT_LINES() { return DEFAULT_LINES; },
      get defaultWordGuessBank() { return defaultWordGuessBank; },
      get displayCharName() { return displayCharName; },
      get displayCharNameForGame() { return displayCharNameForGame; },
      get esc() { return esc; },
      get findAvatar() { return findAvatar; },
      get formatDuration() { return formatDuration; },
      get GAME_ICON_BASE() { return GAME_ICON_BASE; },
      get gameActiveStartedAt() { return gameActiveStartedAt; },
      set gameActiveStartedAt(value) { gameActiveStartedAt = value; },
      get gamePaused() { return gamePaused; },
      set gamePaused(value) { gamePaused = value; },
      get getHostDocument() { return getHostDocument; },
      get getHostWindow() { return getHostWindow; },
      get hideGamePauseOverlay() { return hideGamePauseOverlay; },
      get isMobileHost() { return isMobileHost; },
      get isNightTheme() { return isNightTheme; },
      get isValidSudokuProgressState() { return isValidSudokuProgressState; },
      get isValidSudokuPuzzle() { return isValidSudokuPuzzle; },
      get JUMP_DOWN_URL() { return JUMP_DOWN_URL; },
      get JUMP_STAND_URL() { return JUMP_STAND_URL; },
      get jumpTimer() { return jumpTimer; },
      set jumpTimer(value) { jumpTimer = value; },
      get linkLinkTimer() { return linkLinkTimer; },
      set linkLinkTimer(value) { linkLinkTimer = value; },
      get loadJSON() { return loadJSON; },
      get markFirstMoverUserAction() { return markFirstMoverUserAction; },
      get minesweeperScore() { return minesweeperScore; },
      get modalMaskClass() { return modalMaskClass; },
      get nextCharLineTurn() { return nextCharLineTurn; },
      get nextControlMode() { return nextControlMode; },
      get normalizeWordGuessRoundData() { return normalizeWordGuessRoundData; },
      get OLDMAID_CARD_URL() { return OLDMAID_CARD_URL; },
      get parseGeneratedJson() { return parseGeneratedJson; },
      get PLANK_STAND_URL() { return PLANK_STAND_URL; },
      get PLANK_WALK_URL() { return PLANK_WALK_URL; },
      get preventLongPressSelection() { return preventLongPressSelection; },
      get PROGRESS_SAVE_DELAY() { return PROGRESS_SAVE_DELAY; },
      get PROMPT_TEMPLATES() { return PROMPT_TEMPLATES; },
      get promptTemplates() { return promptTemplates; },
      get pushCheatUndo() { return pushCheatUndo; },
      get qs() { return qs; },
      get qsa() { return qsa; },
      get refreshCheatButton() { return refreshCheatButton; },
      get restoreCheatSnapshot() { return restoreCheatSnapshot; },
      get safeObject() { return safeObject; },
      get saveJSON() { return saveJSON; },
      get saveMemoryBestMoves() { return saveMemoryBestMoves; },
      get saveProgress() { return saveProgress; },
      get scheduleFitGameSurface() { return scheduleFitGameSurface; },
      get scores() { return scores; },
      get scoreWithChoice() { return scoreWithChoice; },
      get screwTimer() { return screwTimer; },
      set screwTimer(value) { screwTimer = value; },
      get SCRIPT_ID() { return SCRIPT_ID; },
      get selectedSummaryText() { return selectedSummaryText; },
      get selectedWordGuessRoleName() { return selectedWordGuessRoleName; },
      get selectedWorldText() { return selectedWorldText; },
      get selectWordGuessRounds() { return selectWordGuessRounds; },
      get setScore() { return setScore; },
      get settings() { return settings; },
      get showConfirm() { return showConfirm; },
      get showGameOver() { return showGameOver; },
      get shuerteFinalScore() { return shuerteFinalScore; },
      get shuerteTimer() { return shuerteTimer; },
      set shuerteTimer(value) { shuerteTimer = value; },
      get shuffleArray() { return shuffleArray; },
      get snakeTimer() { return snakeTimer; },
      set snakeTimer(value) { snakeTimer = value; },
      get speak() { return speak; },
      get speakFirstMover() { return speakFirstMover; },
      get speakText() { return speakText; },
      get sudokuScore() { return sudokuScore; },
      get tetrisTimer() { return tetrisTimer; },
      set tetrisTimer(value) { tetrisTimer = value; },
      get toast() { return toast; },
      get toastCheatAlreadyAttempted() { return toastCheatAlreadyAttempted; },
      get watermelonTimer() { return watermelonTimer; },
      set watermelonTimer(value) { watermelonTimer = value; },
      get wordGuessBank() { return wordGuessBank; },
      get wordGuessBankSource() { return wordGuessBankSource; },
    };
  }

  function modularGameEnvironment(id) {
    return {
      legacy:legacyGameEnvironment(),
      root:qs('#wb-gamebox'),
      document:getHostDocument(),
      window:getHostWindow(),
      save:(state, force) => saveProgress(id, state, force ? { immediate:true } : undefined),
      clear:() => clearProgress(id),
      setScore:value => setScore(id, value),
      finish:(title, scoreText, result, meta) => showGameOver(id, title, scoreText, result, meta),
      speak:event => speak(id, event),
      toast,
      isPaused:() => gamePaused,
      isActive:() => currentGame === id && gameStarted,
      setPaused:paused => {
        if (currentGame !== id || !gameStarted) return;
        if (paused) {
          commitGameActiveDuration(true);
          gamePaused = true;
        } else {
          hideGamePauseOverlay();
          gamePaused = false;
          gameActiveStartedAt = Date.now();
        }
        const button = qs('#wb-pause');
        if (button) button.textContent = paused ? '继续' : '暂停';
      },
      exit:() => { qs('#wb-back')?.click(); },
    };
  }
  function togglePause() {
    if (!gameStarted) return;
    if (!gamePaused) {
      commitGameActiveDuration(true);
      gamePaused = true;
      showGamePauseOverlay();
      const pbtn = qs('#wb-pause'); if (pbtn) pbtn.textContent = '继续';
      return;
    }
    startPauseResumeCountdown();
  }
  function showConfirm(title, message, onConfirm, onCancel) {
    const doc = getHostDocument();
    const old = qs('#wb-confirm-mask', doc); if (old) old.remove();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-confirm-mask';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">' + esc(title) + '</div><div style="margin-bottom:14px;line-height:1.7;">' + esc(message) + '</div><div class="wb-actions"><button class="wb-btn primary" id="wb-confirm-ok">确定</button><button class="wb-btn" id="wb-confirm-cancel">取消</button></div></div>';
    appendModalMask(mask);
    qs('#wb-confirm-ok', mask).onclick = () => { mask.remove(); onConfirm && onConfirm(); };
    qs('#wb-confirm-cancel', mask).onclick = () => { mask.remove(); if (onCancel) onCancel(); };
  }

  function showGameChoice(game, onPick) {
    const doc = getHostDocument();
    const old = qs('#wb-choice-mask', doc); if (old) old.remove();
    const g = GAME_META[game] || { name:'游戏' };
    const list = GAME_CHOICES[game] || [];
    const title = game === 'gomoku' ? '选择模式' : '选择难度';
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-choice-mask';
    if (game === 'shuerte') {
      const groups = [
        { title:'简单', sub:'4×4', normal:'easy', blind:'easy_blind' },
        { title:'中等', sub:'5×5', normal:'medium', blind:'medium_blind' },
        { title:'困难', sub:'6×6', normal:'hard', blind:'hard_blind' }
      ];
      mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">' + esc(g.name + ' · ' + title) + '</div><div class="wb-shuerte-choice-note">普通：点对变淡｜盲点：不变色</div><div class="wb-shuerte-choice-grid">' + groups.map((grp, i) => {
        const normal = list.find(x => x.id === grp.normal) || list[0];
        const blind = list.find(x => x.id === grp.blind) || normal;
        return '<div class="wb-choice-card wb-shuerte-choice-group ' + (i === 0 ? 'primary' : '') + '"><b>' + esc(grp.title) + '</b><span>' + esc(grp.sub) + '</span><div class="wb-shuerte-choice-actions"><button type="button" class="wb-btn primary" data-choice="' + esc(normal.id) + '">普通</button><button type="button" class="wb-btn" data-choice="' + esc(blind.id) + '">盲点</button></div></div>';
      }).join('') + '</div><div class="wb-actions" style="margin-top:12px;justify-content:flex-end;"><button class="wb-btn" id="wb-choice-back">返回</button></div></div>';
    } else {
      mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">' + esc(g.name + ' · ' + title) + '</div><div class="wb-choice-grid">' + list.map((item, i) => '<button type="button" class="wb-choice-card ' + (i === 0 ? 'primary' : '') + '" data-choice="' + esc(item.id) + '"><b>' + esc(item.title) + '</b><span>' + esc(item.sub || '') + '</span></button>').join('') + '</div><div class="wb-actions" style="margin-top:12px;justify-content:flex-end;"><button class="wb-btn" id="wb-choice-back">返回</button></div></div>';
    }
    appendModalMask(mask);
    qsa('[data-choice]', mask).forEach(btn => btn.onclick = () => {
      const choice = list.find(x => x.id === btn.dataset.choice) || list[0];
      mask.remove();
      if (choice && onPick) onPick(choice);
    });
    qs('#wb-choice-back', mask).onclick = () => mask.remove();
  }

  function needsFirstMoverChoice(game) { return FIRST_MOVER_GAMES.includes(game); }
  function speakFirstMover(game, firstMover) { speak(game, firstMover === 'ta' ? 'char_first' : 'char_second'); }
  function markFirstMoverUserAction() { firstMoverAwaitingUserAction = false; }
  function linePriority(game, event) {
    if (event === 'random') return -1;
    if (event === 'gameover' || event === 'record') return 100;
    if (/^score_(?:20|30|40|50_plus|2000_plus|1500|1000|500)$/.test(event)) return 90;
    if (/^tile_(?:big|2048|1024|512|256|128|64)$/.test(event)) return 85;
    if (['watermelon','near_top','half','perfect_streak','many_hints','complete_error','nearly_done','danger','line_4','line_3','line_2','line_1','clear_3','low_space'].includes(event)) return 80;
    if (['perfect','land','jump','charge','move','rotate','soft_drop','aim','drop_edge','match','miss','combo','first_flip','first_fill','erase','hint','row_done','col_done','conflict','place','clear','tool'].includes(event)) return 40;
    return 50;
  }
  function showSpeechLine(game, event, text) {
    const sp = qs('#wb-speech');
    if (!sp) return;
    const cfg = settings();
    const line = String(text || '').replace(/{{char}}/g, displayCharNameForGame(game)).replace(/{{user}}/g, cfg.userName);
    sp.innerHTML = markdownTextHTML(line);
    recordLineTrigger(game, event, line);
    lastDialogueAt = Date.now();
  }
  function queueSingleDialogue(game, event, text) {
    const item = { game, event, text, priority: linePriority(game, event) };
    const flush = () => {
      const q = singleDialogueQueue;
      singleDialogueQueue = null;
      singleDialogueTimer = null;
      if (q) showSpeechLine(q.game, q.event, q.text);
    };
    if (!singleDialogueQueue) {
      singleDialogueQueue = item;
      singleDialogueTimer = setTimeout(flush, item.priority >= 100 ? 0 : 650);
      return;
    }
    if (item.priority > singleDialogueQueue.priority || (item.priority === singleDialogueQueue.priority && Math.random() < 0.5)) singleDialogueQueue = item;
    if (item.priority >= 100 && singleDialogueTimer) {
      clearTimeout(singleDialogueTimer);
      singleDialogueTimer = setTimeout(flush, 0);
    }
  }
  function showFirstMoverChoice(game, onPick) {
    const doc = getHostDocument();
    const old = qs('#wb-first-mask', doc); if (old) old.remove();
    const g = GAME_META[game] || { name: '游戏' };
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-first-mask';
    const taName = displayCharNameForGame(game);
    const gestures = [['scissors','✌','剪刀'], ['rock','👊','石头'], ['paper','👋','布']];
    const choiceActions = () => '<button class="wb-btn primary" data-first="user">你</button><button class="wb-btn" data-first="ta">' + esc(taName) + '</button><button class="wb-btn" data-first="random">随机</button><button class="wb-btn" id="wb-first-back">返回</button>';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">决定先手</div><div class="wb-api-status" id="wb-first-body" style="margin-bottom:12px;">' + esc(g.name) + ' 请选择谁先出。</div><div class="wb-actions" id="wb-first-actions">' + choiceActions() + '</div></div>';
    appendModalMask(mask);
    const finish = first => { mask.remove(); onPick(first); };
    const close = () => { if (mask && mask.parentNode) mask.remove(); };
    const bindChoice = () => {
      const back = qs('#wb-first-back', mask); if (back) back.onclick = close;
      qsa('[data-first]', mask).forEach(btn => btn.onclick = () => {
        const first = btn.dataset.first;
        if (first === 'random') renderGesture();
        else finish(first);
      });
    };
    const renderChoice = () => {
      const body = qs('#wb-first-body', mask);
      const actions = qs('#wb-first-actions', mask);
      if (body) body.textContent = g.name + ' 请选择谁先出。';
      if (actions) actions.innerHTML = choiceActions();
      bindChoice();
    };
    const renderGesture = () => {
      const body = qs('#wb-first-body', mask);
      const actions = qs('#wb-first-actions', mask);
      if (body) body.textContent = '选择一个手势，' + taName + '会随机出手。平局会重新选择。';
      if (actions) actions.innerHTML = gestures.map(g => '<button class="wb-btn" data-gesture="' + g[0] + '" title="' + g[2] + '">' + g[1] + '</button>').join('') + '<button class="wb-btn" id="wb-first-choice-back">返回</button>';
      const back = qs('#wb-first-choice-back', mask); if (back) back.onclick = renderChoice;
      qsa('[data-gesture]', mask).forEach(btn => btn.onclick = () => {
        const user = btn.dataset.gesture;
        const ta = gestures[Math.floor(Math.random() * gestures.length)][0];
        const label = v => ({ rock:'👊', scissors:'✌', paper:'👋' }[v] || v);
        const win = (user === 'rock' && ta === 'scissors') || (user === 'scissors' && ta === 'paper') || (user === 'paper' && ta === 'rock');
        const body = qs('#wb-first-body', mask);
        const actions = qs('#wb-first-actions', mask);
        if (user === ta) {
          if (body) body.textContent = '你出了' + label(user) + '，' + taName + '也出了' + label(ta) + '，平局。请重新选择。';
          return;
        }
        const first = win ? 'user' : 'ta';
        if (body) body.textContent = '你出了' + label(user) + '，' + taName + '出了' + label(ta) + '。' + (first === 'user' ? '你先手。' : taName + '先手。');
        if (actions) actions.innerHTML = '<button class="wb-btn primary" id="wb-first-ok">开始</button><button class="wb-btn" id="wb-first-choice-back">返回</button>';
        const ok = qs('#wb-first-ok', mask); if (ok) ok.onclick = () => finish(first);
        const back = qs('#wb-first-choice-back', mask); if (back) back.onclick = renderChoice;
      });
    };
    bindChoice();
  }

function showGameRecords(game, page) {
    if (standalone) { showStandaloneRecords(game, page); return; }
    page = Math.max(1, page || 1);
    const doc = getHostDocument();
    const old = qs('#wb-record-mask', doc); if (old) old.remove();
    const g = GAME_META[game] || { name: '游戏' };
    const arr = (records()[game] || []).map((r,i) => Object.assign({ id:'legacy_' + i }, r));
    const pageSize = 12, total = Math.max(1, Math.ceil(arr.length / pageSize));
    page = Math.min(page, total);
    const headers = recordTableHeaders(game);
    const rows = arr.slice((page - 1) * pageSize, page * pageSize).map(r => {
      const labels = headers.filter(h => h !== '日志' && h !== '操作');
      const cells = recordDisplayCells(game, r).map((x, i) => '<td data-label="' + esc(labels[i] || '') + '" title="' + esc(x) + '">' + esc(x) + '</td>').join('');
	      const logCell = (r.log || recordFavoriteTheaterText(r)) ? '<button class="wb-btn wb-log-view" data-id="' + esc(r.id) + '">查看</button>' : '<span class="wb-muted">无</span>';
      return '<tr data-id="' + esc(r.id) + '">' + cells + '<td data-label="日志">' + logCell + '</td><td data-label="操作"><div class="wb-actions"><button class="wb-btn wb-record-del" data-id="' + esc(r.id) + '">删除</button></div></td></tr>';
    }).join('');
    const empty = '<tr><td colspan="' + headers.length + '" style="text-align:center;color:var(--wb-sub);padding:14px;">暂无游戏记录。</td></tr>';
    const mask = doc.createElement('div'); mask.className = modalMaskClass(); mask.id = 'wb-record-mask';
    mask.innerHTML = '<div class="wb-modal wb-summary-modal wb-record-modal" style="width:min(980px,100%);"><div class="wb-modal-title">' + esc(g.name) + ' · 游戏记录</div><div class="wb-record-table-wrap"><table class="wb-record-table"><thead><tr>' + headers.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' + (rows || empty) + '</tbody></table></div><div class="wb-actions" style="margin-top:8px;justify-content:space-between;"><div><button class="wb-btn" id="wb-record-prev">上一页</button><span class="wb-pill">' + page + ' / ' + total + '</span><button class="wb-btn" id="wb-record-next">下一页</button></div><button class="wb-btn" id="wb-record-close">关闭</button></div></div>';
    appendModalMask(mask);
    qs('#wb-record-close', mask).onclick = () => mask.remove();
    qs('#wb-record-prev', mask).onclick = () => showGameRecords(game, page - 1);
    qs('#wb-record-next', mask).onclick = () => showGameRecords(game, page + 1);
	    qsa('.wb-log-view', mask).forEach(b => b.onclick = () => { const r = (records()[game] || []).find(x => x.id === b.dataset.id); if (r) showRecordLogModal(r, game); });
	    qsa('.wb-record-del', mask).forEach(b => b.onclick = () => showConfirm('删除游戏记录', '确定删除这条记录吗？', () => { deleteRecord(game, b.dataset.id); showGameRecords(game, page); }));
	  }

	    function showTextModal(title, text) { const doc = getHostDocument(); const old = qs('#wb-text-mask', doc); if (old) old.remove(); const mask = doc.createElement('div'); mask.className = modalMaskClass(); mask.id = 'wb-text-mask'; mask.innerHTML = '<div class="wb-modal wb-summary-modal"><div class="wb-modal-title">' + esc(title) + '</div><div class="wb-api-status wb-text-segments" style="max-height:420px;overflow:auto;">' + markdownTextHTML(text || '') + '</div><div class="wb-actions" style="margin-top:12px;justify-content:flex-end;"><button class="wb-btn" id="wb-text-close">关闭</button></div></div>'; appendModalMask(mask); qs('#wb-text-close', mask).onclick = () => mask.remove(); }
	  function showRecordLogModal(r, gameId) {
	    const log = (r && r.log) || '无';
	    const theater = recordFavoriteTheaterText(r);
	    const title = r && r.favoriteTheater && r.favoriteTheater.title ? r.favoriteTheater.title : '收藏的小剧场';
	    const regen = r && r.id && r.log ? '<button class="wb-btn wb-log-regen" id="wb-log-regen-in-modal" title="重新生成日志" style="min-height:24px;padding:2px 7px;">↻</button>' : '';
	    const body = '<div class="wb-section-title" style="font-size:12px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">游戏日志' + regen + '</div>' + markdownTextHTML(log) + (theater ? '<div class="wb-section-title" style="font-size:12px;margin:12px 0 6px;">' + esc(title) + '</div>' + markdownTextHTML(theater) : '');
	    const doc = getHostDocument(); const old = qs('#wb-text-mask', doc); if (old) old.remove(); const mask = doc.createElement('div'); mask.className = modalMaskClass(); mask.id = 'wb-text-mask';
	    mask.innerHTML = '<div class="wb-modal wb-summary-modal"><div class="wb-modal-title">游戏日志</div><div class="wb-api-status wb-text-segments" style="max-height:420px;overflow:auto;">' + body + '</div><div class="wb-actions" style="margin-top:12px;justify-content:flex-end;"><button class="wb-btn" id="wb-text-close">关闭</button></div></div>';
	    appendModalMask(mask);
	    const regenBtn = qs('#wb-log-regen-in-modal', mask);
	    if (regenBtn) regenBtn.onclick = () => showConfirm('重新生成日志', '确定要重新生成这条游戏日志吗？原日志会被覆盖。', async () => { regenBtn.disabled = true; regenBtn.textContent = '...'; const id = gameId || Object.keys(GAME_META).find(k => GAME_META[k].name === r.game); await generateGameLog(id, r.id); const latest = (records()[id] || []).find(x => x.id === r.id); if (latest) showRecordLogModal(latest, id); });
	    qs('#wb-text-close', mask).onclick = () => mask.remove();
	  }
  function showBatchDebugModal(items) {
    const doc = getHostDocument();
    const old = qs('#wb-batch-debug-mask', doc); if (old) old.remove();
    const arr = Array.isArray(items) ? items : [];
    const text = arr.length ? arr.map((item, i) => {
      return [
        '【' + (i + 1) + '】' + (item.label || ''),
        '游戏：' + (item.game || ''),
        '类型：' + (item.part === 'theater' ? '小剧场' : '语录'),
        '状态：' + (item.ok ? '成功' : '失败'),
        '失败原因：' + (item.reason || '无'),
        '输入token合计：' + (item.inputTokensTotal || 0),
        '输出时间合计：' + ((item.durationMsTotal || 0) / 1000).toFixed(2) + 's',
        '调试：',
        item.output && item.output.indexOf('输入token：') >= 0 ? '见每次生成记录' : '无',
        '输出：',
        item.output || '无输出'
      ].join('\n');
    }).join('\n\n----------------\n\n') : '还没有批量生成调试数据。';
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-batch-debug-mask';
    mask.innerHTML = '<div class="wb-modal wb-summary-modal" style="width:min(960px,100%);"><div class="wb-modal-title">批量生成调试</div><textarea class="wb-textarea" readonly style="min-height:420px;font-family:monospace;white-space:pre;overflow:auto;">' + esc(text) + '</textarea><div class="wb-actions" style="margin-top:12px;justify-content:flex-end;"><button class="wb-btn" id="wb-batch-debug-close">关闭</button></div></div>';
    appendModalMask(mask);
    qs('#wb-batch-debug-close', mask).onclick = () => mask.remove();
  }

  function showStandaloneRecords(game, page = 1) {
    const all = records()[game] || [], total = Math.max(1, Math.ceil(all.length / 12));
    page = Math.max(1, Math.min(total, page));
    qs('#wb-record-mask')?.remove();
    const sourceHeaders = recordTableHeaders(game).filter(h => h !== '日志' && h !== '操作');
    const cards = all.slice((page - 1) * 12, page * 12).map(record => {
      const cells = recordDisplayCells(game, record);
      return '<article class="wanba-record"><dl>' + sourceHeaders.map((label,index) => label === '陪伴者' ? '' : '<div><dt>' + esc(label) + '</dt><dd>' + esc(cells[index] || '—') + '</dd></div>').join('') + '</dl><button class="wb-btn wb-record-del" data-id="' + esc(record.id) + '">删除记录</button></article>';
    }).join('');
    const mask = getHostDocument().createElement('div'); mask.className = modalMaskClass(); mask.id = 'wb-record-mask';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">' + esc(GAME_META[game]?.name || '游戏') + ' · 游戏记录</div><div class="wanba-records">' + (cards || '<p>还没有完成的游戏记录。</p>') + '</div><div class="wb-actions"><button class="wb-btn" id="wb-record-prev" ' + (page === 1 ? 'disabled' : '') + '>上一页</button><span>' + page + ' / ' + total + '</span><button class="wb-btn" id="wb-record-next" ' + (page === total ? 'disabled' : '') + '>下一页</button><button class="wb-btn" id="wb-record-close">关闭</button></div></div>';
    appendModalMask(mask);
    qs('#wb-record-close',mask).onclick = () => mask.remove();
    qs('#wb-record-prev',mask).onclick = () => showStandaloneRecords(game,page-1);
    qs('#wb-record-next',mask).onclick = () => showStandaloneRecords(game,page+1);
    qsa('.wb-record-del',mask).forEach(button => button.onclick = () => showConfirm('删除游戏记录','确定删除这条记录吗？',() => { deleteRecord(game,button.dataset.id); showStandaloneRecords(game,page); }));
  }
  function showProgressChoice(game, state) {
    const doc = getHostDocument();
    const old = qs('#wb-progress-mask', doc); if (old) old.remove();
    const g = GAME_META[game] || { name: '游戏' };
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-progress-mask';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">发现上次进度</div><div style="margin-bottom:14px;line-height:1.8;">' + esc(g.name) + ' 有未结束的上一次进度，要继续还是重新开始？</div><div class="wb-actions"><button class="wb-btn primary" id="wb-progress-continue">继续上次</button><button class="wb-btn" id="wb-progress-new">重新开始</button><button class="wb-btn" id="wb-progress-back">返回</button></div></div>';
    appendModalMask(mask);
    qs('#wb-progress-continue', mask).onclick = () => { startContinueCountdown(mask, game, state); };
    qs('#wb-progress-new', mask).onclick = () => { mask.remove(); clearProgress(game); renderGame(game); };
    qs('#wb-progress-back', mask).onclick = () => { mask.remove(); currentGame = null; saveWindowState(currentTab, ''); syncPopupModeClass(); renderSelect(currentTab); };
  }

	  function doubleTheaterFallback(game, outcome, special, roleName) {
	    const name = normalizePresetName(roleName || companionName()); const win = outcome === 'user_win'; const draw = outcome === 'draw'; const score = outcome === 'score';
    if (score && !special) {
      const lead = '结算停在屏幕上，' + name + '没有立刻关掉页面，只把分数和你刚才的操作又看了一遍。';
      return [
        lead + name + '点了点屏幕上的数字，说：“这局打得不错，尤其是中间那次救回来。”小游戏只是你一个人在操作，' + name + '没有把它说成夸张的胜负，只把几个关键瞬间简单复盘了一遍。最后，' + name + '把界面停在重开按钮旁边：“要不要再试一次？这次可以从刚才那一步开始改。”',
        lead + name + '把声音放轻：“这个分数说明你已经找到节奏了。”没有长篇夸奖，也没有催你立刻继续，' + name + '只是把刚才失误又补回来的地方指出来，像在帮你整理一条清楚的路线。屏幕暗了一点，' + name + '又补了一句：“下一局如果开头稳住，应该还能更高。”',
        lead + name + '看向你，语气里带着一点平常的调侃：“刚才不是随便玩玩的吧？”你还没回答，' + name + '已经把分数记下，又把几个关键操作说给你听。短暂的安静后，' + name + '把选择权递回来：“收手也行，再来一把也行。这个成绩已经够说明问题了。”'
      ];
    }
    if (draw) {
      const lead = '平局提示停在屏幕上，' + name + '看了两秒，像是在确认最后一步有没有别的走法。';
      return [
        lead + name + '说：“这不算输，也不算赢。”语气很平，但手指已经停在重开旁边。刚才几次差点分出胜负的地方被' + name + '简单数了一遍，最后变成一句很直接的邀请：“再来一场吧，这次看谁先露出空位。”',
        lead + name + '把结果又读了一遍：“刚好打平，说明我们都没让对方占到便宜。”这句话像复盘，也像轻微挑衅。你看向屏幕，' + name + '已经把下一局的开头想好了：“如果你还用刚才那种走法，我会换一条线拦你。”',
        lead + name + '没有把平局说成遗憾，只把棋盘或牌面上最接近胜负的那一步指出来。短暂沉默后，' + name + '说：“谁也没赢，所以这局可以算还没结束。”重开按钮亮着，气氛刚好留给下一把。'
      ];
    }
    if (special === 'soulmate') {
      const lead = '第五道题也被你猜中后，' + name + '停了一下，像是在重新回想每一条线索。';
      return [
        lead + name + '说：“你是真的听懂了那些绕开的提示。”这句话没有说得很重，但比普通夸奖更具体。五道题全中，不只是赢了一局游戏，也说明你跟上了' + name + '的表达方式。' + name + '把题目列表往上滑了滑：“下次我会藏得更深一点。”',
        lead + '结果显示全中，' + name + '先安静了片刻，然后轻轻笑了一声：“这已经不是运气了。”每个词都被你猜到，连那些不直接说明的地方也被你接住。' + name + '把最后一道题重新念了一遍：“看来我以后不能用太明显的暗示。”',
        lead + name + '把五道题的线索逐条翻回去，像在检查你究竟从哪里猜出来的。最后，' + name + '承认：“你比我预想得更会抓重点。”语气里有一点不服，也有明显的高兴。下一轮还没开始，' + name + '已经在想新的题目。'
      ];
    }
    if (special === 'gomoku_endless_user_capture' || special === 'gomoku_endless_char_capture') {
      const userWon = special === 'gomoku_endless_user_capture';
      const lead = '无尽模式的结算停住时，棋盘上还留着刚才吃子换位后的痕迹。';
      return [
        lead + (userWon ? '你吃掉的棋子更多，' + name + '盯着被你换走的位置看了两秒：“这颗被你拿得太准了。”五连不是结束，而是下一轮回收和反吃的开始。' : name + '吃掉你的棋子更多，手指停在那颗刚换上的白子旁边：“这一步我等了很久。”五连之后还要继续争位置，才是无尽模式最麻烦的地方。') + name + '把记录翻回关键一手，语气里还带着胜负欲：“下一局别让我这么容易吃到。”',
        lead + (userWon ? name + '没有急着认输，只把你吃子的路线从头数了一遍：“先回收，再换位……你是故意留这个口子的？”你笑了一下，屏幕上的吃子数已经说明答案。' : '你刚想复盘，' + name + '已经把自己吃子的那一步点出来：“这里换掉以后，你那条线就断了。”语气不重，但明显有点得意。') + '短暂安静后，重开按钮亮着，谁都知道下一局会先盯住那几个危险交叉点。',
        lead + (userWon ? '你最后靠吃子优势收住局面，' + name + '把“无尽模式”几个字又看了一遍，像是不太服气：“普通五连我还能堵，吃子这一步确实被你算到了。”' : name + '靠吃子优势赢下这一局，没有把话说满，只轻轻敲了敲棋盘边缘：“无尽模式不能只看五连，还要看谁的棋子会被换掉。”') + '复盘到最后，下一局的先手已经变得很重要。'
      ];
    }
    if (special === 'flight_show') {
      const lead = '飞行棋结算停住时，棋盘上那几条虚线航线还很显眼。';
      return [
        lead + '你这一局飞过不止三次，' + name + '把你的飞行过程来回看了两遍：“你是把机场当近路用了吧？”语气里有一点不服，但复盘的时候又不得不承认，这几次飞行确实把距离拉开了。',
        lead + name + '先盯着你的棋子落点，然后才慢慢说：“又飞，又飞，还飞。”你把最后一次飞行点给' + name + '看，' + name + '轻轻敲了敲屏幕边缘：“下局我会专门守这两条线。”',
        lead + '你的飞机几次从飞行区直接穿过去，' + name + '原本得意的表情被结算压了回去。短暂沉默后，' + name + '把航线从起点描到终点：“好，这几步算你会抓机会。”'
      ];
    }
    if (special === 'gomoku_normal_user_win' || special === 'gomoku_normal_char_win') {
      const userWon = special === 'gomoku_normal_user_win';
      const lead = '普通模式的五连出现在棋盘上，胜负在这一条线上直接定了下来。';
      return [
        lead + (userWon ? name + '把你的五颗黑子从头看到尾，低声说：“这条线你藏得挺深。”' : name + '点了点自己连成的五颗白子：“这里你晚拦了一手。”') + '没有吃子，也没有回收，普通模式的干脆让复盘更直接。短暂停顿后，' + name + '把重开按钮推到你面前：“再来一盘，看这条线还会不会出现。”',
        lead + (userWon ? '你赢得很快，' + name + '先是不说话，随后才把你前面铺的两步指出来：“原来从那里就开始了。”' : name + '赢下这一局后没有立刻收棋，只把最后一手周围的空位圈给你看：“你其实差一点能堵住。”') + '这局没有无尽模式的反复拉扯，输赢就落在最后那条五连上。',
        lead + (userWon ? name + '承认得不算痛快：“这一手我应该早一点防。”你看着五连停在棋盘中央，刚才的进攻路线终于完整显出来。' : '你看着那条白子连线，' + name + '语气放轻了一点：“别急，普通模式就是这样，一步慢就会被收走。”') + '复盘结束时，下一局已经像是默认要开始了。'
      ];
    }
    const lead = special === 'win_streak3' ? '第三次胜利出现时，' + name + '把记录往前翻了一下，确认你已经连赢三场。' : special === 'lose_streak3' ? '第三次失败落下时，' + name + '没有立刻催你重开，只把这几局的关键步骤重新看了一遍。' : special === 'record' ? '新纪录跳出来时，' + name + '先看分数，再看你刚才停下来的手。' : score ? '结算数字停住时，' + name + '用指尖点了点屏幕，像是在确认刚才留下的轨迹。' : win ? '胜利弹窗亮起，' + name + '短暂安静了一下，然后把结果读给你听。' : '失败提示出现后，' + name + '没有责备，只把页面停在结算那里。';
    return [
      lead + name + '说：“这一局可以记下来。”没有夸张的反应，' + name + '只是把胜负、分数和最关键的一步拆开讲清楚。你看着屏幕，' + name + '把重开按钮往旁边点了点：“休息一下，或者趁手感还在再来。”',
      lead + name + '把刚才的过程复盘了一遍，语气比平时更认真一点。“这里是转折点。”' + name + '指向屏幕上的局面，不急着评价输赢，只把你做对和错过的地方都放在同一张图里。最后，' + name + '说：“下一局从这里改，会更好看。”',
      lead + '短暂的沉默后，' + name + '笑了一下：“结果已经出来了，但我更想记你刚才那一步。”这句话把输赢放轻了一些，也让这局不只是结算数字。' + name + '看向你：“要不要继续，由你决定。”'
    ];
	  }
  async function generateDoubleTheater(game, outcome, special, scoreText, cfgOverride) {
    const cfg = cfgOverride || settings(); const fallback = doubleTheaterFallback(game, outcome, special);
    if (!cfg.apiUrl || !cfg.apiModel) return fallback;
    const intimacyText = cfg.intimacyMode ? '开启。允许成年角色之间更亲近、更暧昧、更依赖，允许含蓄的NSFW暗示；禁止未成年人相关性内容、强迫、失控或违法内容。' : '关闭。保持自然陪伴和轻松亲近，禁止色情行为和露骨内容。';
    const prefix = (cfg.breakLimitPrompt || '').trim();
	    const prompt = [prefix, specialLanguageRequirement('theater', cfg), ...(promptTemplates().theater || PROMPT_TEMPLATES.theater), '亲密氛围模式：' + intimacyText, '游戏：' + ((GAME_META[game] || {}).name || game), '结果：' + formatRecordResultForPrompt(outcome), '特殊触发：' + (special || '普通结算'), '分数/胜负：' + String(scoreText || '').replace(new RegExp('TA' + '赢', 'g'), '{{char}}赢').replace(/TA/g, '{{char}}'), '规则说明：如果结果里出现“{{char}}赢”，表示当前角色获胜，也就是原先的角色获胜。平局就是平局，不是user失败，也不是{{char}}失败；平局小剧场应写双方打平后的反应，例如想再来一场、嘴硬、不服气、松口气或谁也没赢的调侃。', '角色描述：' + currentCharDescription(cfg), '世界背景：' + (selectedWorldText(cfg) || '无'), '大总结：' + (selectedSummaryText(cfg) || '无')].filter(Boolean).join('\n');
	    try { const txt = await callApiText(cfg, prompt, promptTemplates().systems.theater || PROMPT_TEMPLATES.systems.theater); const arr = JSON.parse(txt); if (Array.isArray(arr) && arr.length) return arr.map(normalizeTheaterItem).filter(x => x.length).slice(0,3); } catch(e) { console.warn('[玩伴小屋] theater failed:', e); }
    return fallback;
  }
	  function showTheaterModal(title, lines, meta) {
	    const arr = Array.isArray(lines) && lines.length ? lines : [''];
	    const text = normalizeTheaterText(arr[Math.floor(Math.random() * arr.length)]);
	    const doc = getHostDocument();
	    const old = qs('#wb-text-mask', doc); if (old) old.remove();
	    const mask = doc.createElement('div');
	    mask.className = modalMaskClass();
	    mask.id = 'wb-text-mask';
	    const canFavorite = !!(meta && meta.game && meta.recordId);
	    mask.innerHTML = '<div class="wb-modal wb-summary-modal"><div class="wb-modal-title">' + esc(title || '角色互动小剧场') + '</div><div class="wb-api-status wb-text-segments" style="max-height:420px;overflow:auto;">' + markdownTextHTML(text || '') + '</div><div class="wb-actions" style="margin-top:12px;justify-content:flex-end;">' + (canFavorite ? '<button class="wb-btn" id="wb-theater-favorite" title="收藏">♡ 收藏</button>' : '') + '<button class="wb-btn" id="wb-text-close">关闭</button></div></div>';
	    appendModalMask(mask);
	    if (canFavorite) {
	      const rec = (records()[meta.game] || []).find(r => r.id === meta.recordId);
	      updateRecord(meta.game, meta.recordId, { theaterInfo: Object.assign({}, rec && rec.theaterInfo ? rec.theaterInfo : {}, { title: title || '角色互动小剧场', text }) });
	    }
	    const fav = qs('#wb-theater-favorite', mask);
	    if (fav) fav.onclick = () => {
	      updateRecord(meta.game, meta.recordId, { favoriteTheater: { title: title || '角色互动小剧场', text, savedAt: Date.now() } });
	      fav.textContent = '♥ 已收藏';
	      fav.disabled = true;
	      toast('已收藏小剧场到游戏记录');
	    };
	    qs('#wb-text-close', mask).onclick = () => mask.remove();
	  }
  async function generateGameLog(game, recordId) {
    const cfg = settings(); const rec = (records()[game] || []).find(r => r.id === recordId); if (!rec) { toast('未找到游戏记录'); return ''; }
    const roleName = rec.companion || displayCharNameForGame(game);
    const fallback = roleName + '回顾了这局' + ((GAME_META[game] || {}).name || '游戏') + '：' + (rec.scoreText || formatRecordResult(rec.result)) + '。用时不长，但关键过程很清楚；你有几步处理得不错，也有可以调整的地方。下次再开局，可以从这次的转折点开始改。';
    if (!cfg.apiUrl || !cfg.apiModel) { updateRecord(game, recordId, { log:fallback }); toast('已生成离线日志'); return fallback; }
	    const theaterInfo = rec.theaterInfo || {};
	    const logCfg = rolePromptConfig(roleName, cfg);
	    const normalizedScoreText = String(rec.scoreText || '').replace(new RegExp(String(roleName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '{{char}}').replace(new RegExp('TA' + '赢', 'g'), '{{char}}赢').replace(/TA/g, '{{char}}');
	    const theaterText = String(theaterInfo.text || (rec.favoriteTheater && rec.favoriteTheater.text) || '').trim();
	    const prompt = [(logCfg.breakLimitPrompt || '').trim(), specialLanguageRequirement('log', logCfg), ...(promptTemplates().gameLog || PROMPT_TEMPLATES.gameLog),'游戏：' + ((GAME_META[game] || {}).name || game),'','游戏情况（记录表字段，均为 user 视角）：\n' + gameLogSituation(game, rec) + '\n' + gameLogFieldRules(game, roleName),'','原始结算文本：\n' + normalizedScoreText,'','结果：\n' + formatRecordResultForPrompt(rec.result),'','用时：\n' + formatDuration(rec.durationMs),'','本局详细过程数据：\n' + gameLogDetailText(game, rec),'','本局触发过的角色语录：\n' + lineEventLogText(rec.lineEvents),'','本局触发的小剧场主题：\n' + (theaterInfo.title || '角色互动小剧场'),'','本局小剧场触发条件：\n' + (theaterInfo.condition || theaterConditionForSpecial(game, theaterInfo.special || '', roleName)),'','本局实际小剧场内容：\n' + (theaterText || '无'),'','当前游戏全部特殊小剧场规则：\n' + gameTheaterConditionRules(game, roleName),'','前几次同角色同游戏日志：\n' + (recentGameLogs(game, roleName) || '无'),'','陪伴者：\n' + roleName,'','角色描述：\n' + currentCharDescription(logCfg),'','世界背景：\n' + (selectedWorldText(logCfg) || '无'),'','大总结：\n' + (selectedSummaryText(logCfg) || '无')].filter(Boolean).join('\n');
	    let log = fallback; try { log = await callApiText(cfg, prompt, promptTemplates().systems.gameLog || PROMPT_TEMPLATES.systems.gameLog); } catch(e) { toast('日志生成失败，已使用本地日志'); } updateRecord(game, recordId, { log }); return log;
  }
  async function showGameOver(game, title, scoreText, result, meta) {
    clearProgress(game);
    const doc = getHostDocument();
    const old = qs('#wb-gameover-mask', doc); if (old) old.remove();
    if (snakeTimer) clearInterval(snakeTimer);
    if (tetrisTimer) clearInterval(tetrisTimer);
    if (watermelonTimer) clearInterval(watermelonTimer);
    if (jumpTimer) clearInterval(jumpTimer);
    if (screwTimer) clearInterval(screwTimer);
    if (linkLinkTimer) clearInterval(linkLinkTimer);
    if (shuerteTimer) clearInterval(shuerteTimer);
    if (randomLineTimer) clearInterval(randomLineTimer);
    snakeTimer = tetrisTimer = watermelonTimer = jumpTimer = screwTimer = linkLinkTimer = shuerteTimer = randomLineTimer = null;
    const inferred = result || inferResult(game, title, scoreText);
    const g = GAME_META[game] || { name: '游戏', unit: '分' };
    if (g.mode === 'double' && inferred === 'ta_win' && !result) addTaWin(game);
    const rec = recordGameResult(game, title, scoreText, inferred, meta);
    clearGameDurationRewardTimer();
    const outcome = resultOutcome(inferred);
    let special = '';
    if (g.mode === 'double') { special = doubleSpecialTheater(game, outcome, scoreText, meta); const streak = game === 'bombnumber' ? 0 : doubleStreak(game, outcome, rec.companion); if ((!special || game === 'gomoku') && outcome === 'user_win' && streak >= 3) special = 'win_streak3'; if ((!special || game === 'gomoku') && outcome === 'ta_win' && streak >= 3) special = 'lose_streak3'; }
    else special = singleSpecialTheater(game, scoreText, meta, rec.durationMs || 0);
    currentRoundTheaterInfo = { special, title:special ? theaterTitleForSpecial(special) : '角色互动小剧场', condition:theaterConditionForSpecial(game, special, rec.companion), allRules:gameTheaterConditionRules(game, rec.companion) };
    updateRecord(game, rec.id, { lineEvents: currentRoundLineEvents.slice(-120), theaterInfo: currentRoundTheaterInfo });
    gamePaused = true;
    gameStarted = false;
    const pbtn = qs('#wb-pause'); if (pbtn) pbtn.textContent = '继续';
    const high = scoreDisplay(game);
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-gameover-mask';
	    const logAction = settings().companion ? '<button class="wb-btn" id="wb-generate-log">生成日志</button>' : '';
	    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">' + esc(title || '游戏结束') + '</div><div style="margin-bottom:14px;line-height:1.8;"><div>游戏：' + esc(g.name) + '</div><div>' + esc(displayCharTextForGame(scoreText || '本局分数：0' + g.unit, game)) + '</div><div>' + esc(high) + '</div>' + (standalone ? '' : '<div>陪伴者：' + esc(displayCharNameForGame(game)) + '</div>') + '</div><div class="wb-actions"><button class="wb-btn primary" id="wb-next-round">开启下一把</button>' + logAction + '<button class="wb-btn" id="wb-over-close">留在本局</button></div></div>';
    appendModalMask(mask);
    const allowDrawTheater = !(outcome === 'draw' && ['gomoku','oldmaid','ludo'].includes(game));
    const shouldShowTheater = !!(settings().companion && settings().theaterEnabled && allowDrawTheater && (special || Math.random() < 0.6));
    if (!shouldShowTheater) {
      const reason = settings().companion && settings().theaterEnabled
        ? (allowDrawTheater ? '本局未触发小剧场。普通小剧场仅有60%概率触发；特殊小剧场未命中。' : '本局为平局，当前游戏不触发平局小剧场。')
        : '小剧场未开启。';
      currentRoundTheaterInfo = { special:'', title:'无', condition:reason, allRules:gameTheaterConditionRules(game, rec.companion) };
      updateRecord(game, rec.id, { theaterInfo: currentRoundTheaterInfo });
    }
    if (shouldShowTheater) {
      const roleName = activeGameRoleName(game);
      const cachedTheater = theaterCache[theaterCacheKey(game, outcome, special)] || doubleTheaterFallback(game, outcome, special, roleName);
	      showTheaterModal(special ? theaterTitleForSpecial(special) : '角色互动小剧场', cachedTheater, { game, recordId: rec.id });
    }
    const logBtnHandler = async () => { const btn = qs('#wb-generate-log', mask); if (!btn) return; btn.disabled = true; btn.textContent = '生成中...'; await generateGameLog(game, rec.id); btn.disabled = false; btn.textContent = '查看日志'; btn.onclick = () => { const latest = (records()[game] || []).find(r => r.id === rec.id); if (latest) showRecordLogModal(latest, game); }; };
	    const logBtn = qs('#wb-generate-log', mask); if (logBtn) logBtn.onclick = logBtnHandler;
    if (settings().companion && settings().autoLog) setTimeout(logBtnHandler, 80);
    qs('#wb-next-round', mask).onclick = () => { mask.remove(); renderGame(game); startCurrentGame(game); };
    qs('#wb-over-close', mask).onclick = () => mask.remove();
  }

  function renderLinePresetSelect(game) {
    const sel = qs('#wb-line-preset-select');
    if (!sel) return;
    const active = currentLinePreset(game);
    const names = presetNamesForGame(game);
    if (!names.includes(active)) names.push(active);
    const savedOptions = names.map(name => '<option value="line::' + esc(name) + '"' + (name === active ? ' selected' : '') + '>' + esc(name) + '</option>').join('');
    const worldOptions = worldPresets().map((pr, i) => '<option value="world::' + i + '">' + esc(pr.name || ('世界观预设' + (i + 1))) + '</option>').join('');
    sel.innerHTML = '<optgroup label="当前保存语录">' + savedOptions + '</optgroup>' + (worldOptions ? '<optgroup label="世界观预设">' + worldOptions + '</optgroup>' : '');
  }

  function companionHTML() {
    const cfg = settings();
    const ctx = getHostContext();
    const char = ctx && ctx.characters && ctx.characterId >= 0 ? ctx.characters[ctx.characterId] : (ctx && ctx.character ? ctx.character : null);
    const charData = char?.data || char || {};
    const name = currentGame ? displayCharNameForGame(currentGame) : (cfg.charName && cfg.charName !== '{{char}}' ? cfg.charName : (charData.name || ctx?.name2 || '{{char}}'));
    const avatar = findAvatar();
    const av = avatar ? '<img src="' + esc(avatar) + '" style="width:100%;height:100%;object-fit:cover">' : esc(name.slice(0,1));
    return '<div class="wb-companion ' + (cfg.companion ? 'on' : '') + '" id="wb-comp"><div class="wb-comp-row"><div class="wb-avatar">' + av + '</div><div class="wb-comp-main"><div class="wb-comp-name">' + esc(name) + '</div><div class="wb-speech wb-text-segments" id="wb-speech">...</div></div></div></div>';
  }
  function findAvatar() {
    const rolePreset = currentGame ? worldPresetForRole(activeGameRoleName(currentGame)) : null;
    const fixed = ((rolePreset && rolePreset.avatarUrl) || settings().avatarUrl || '').trim();
    if (fixed) return fixed;
    const roleName = currentGame ? activeGameRoleName(currentGame) : companionName();
    return findCharacterAvatarByName(roleName) || findCurrentCardAvatar();
  }
  function avatarUrlFromValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(https?:|data:|blob:|\/)/i.test(raw)) return raw;
    try {
      const w = getHostWindow();
      if (typeof w.getThumbnailUrl === 'function') {
        const url = w.getThumbnailUrl('avatar', raw);
        if (url) return url;
      }
    } catch(e) {}
    return '/thumbnail?type=avatar&file=' + encodeURIComponent(raw);
  }
  function findCharacterAvatarByName(name) {
    const target = String(name || '').trim().toLowerCase();
    const targetPreset = normalizePresetName(name).toLowerCase();
    if (!target || target === '{{char}}') return '';
    const ctx = getHostContext() || {};
    const chars = Array.isArray(ctx.characters) ? ctx.characters : [];
    const cleanAvatarName = value => String(value || '').replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '').trim().toLowerCase();
    for (const char of chars) {
      const data = char?.data || char || {};
      const sourceNames = [data.name, char?.name, data.ch_name, data.avatar, char?.avatar].filter(Boolean);
      const names = sourceNames.flatMap(x => [String(x).trim().toLowerCase(), normalizePresetName(x).toLowerCase(), cleanAvatarName(x), normalizePresetName(cleanAvatarName(x)).toLowerCase()]);
      if (!names.includes(target) && !names.includes(targetPreset)) continue;
      const avatar = data.avatarUrl || data.avatar_url || char?.avatarUrl || char?.avatar_url || data.avatar || char?.avatar;
      const url = avatarUrlFromValue(avatar);
      if (url) return url;
    }
    return '';
  }
  function findCurrentCardAvatar() {
    for (const s of ['#avatar_div img', '.mes[is_user="false"] .avatar img', '.last_mes .avatar img', '.avatar img']) {
      const img = qs(s); if (img && img.src) return img.src;
    }
    return '';
  }
  function speak(game, event) {
    const cfg = settings(); if (!cfg.companion) return;
    if (firstMoverAwaitingUserAction && !['char_first','char_second','random'].includes(event)) return;
    const set = activeLineSet(game);
    const arr = set[event] || (DEFAULT_LINES[game] && DEFAULT_LINES[game][event]) || set.random || (DEFAULT_LINES[game] && DEFAULT_LINES[game].random) || ['我在。'];
    const text = arr[Math.floor(Math.random() * arr.length)] || '';
    if ((GAME_META[game] || {}).mode === 'single' && event !== 'random') queueSingleDialogue(game, event, text);
    else showSpeechLine(game, event, text);
  }
  function speakText(text) {
    const cfg = settings(); if (!cfg.companion) return;
    const line = String(text || '').trim();
    if (line) showSpeechLine(currentGame, 'custom', line);
  }

  function theaterCacheKey(game, outcome, special) { return theaterCacheKeyForName(activeGameRoleName(game), game, outcome, special); }
  function clearTheaterCacheForGame(game, roleName) {
    const prefix = normalizePresetName(roleName || companionName()) + '::' + game + '::';
    Object.keys(theaterCache).forEach(k => { if (k.indexOf(prefix) === 0) delete theaterCache[k]; });
    saveTheaterCache();
  }
  async function preGenerateTheaters(game, cfgOverride, onAiCall, roleName, options) {
    const targetRole = normalizePresetName(roleName || companionName());
    const failKey = targetRole + '::' + game;
    clearTheaterCacheForGame(game, targetRole);
    delete theaterGenerationFailures[failKey];
    const cfg = cfgOverride || settings();
    const jobs = theaterJobsForGame(game);
	    let pack = theaterPackFallback(game, jobs, targetRole);
    let apiFailed = '';
    let rawOutput = '';
    const apiDebug = {};
    if (cfg.apiUrl && cfg.apiModel) {
      const prompt = buildTheaterPackPrompt(game, cfg, jobs);
      try { if (onAiCall) onAiCall(GAME_META[game].name + '小剧场'); rawOutput = await callApiText(cfg, prompt, theaterPackSystemPrompt(jobs), 12000, apiDebug); pack = normalizeTheaterPack(game, jobs, parseGeneratedJson(rawOutput)); }
      catch(e) { apiFailed = e && e.message ? e.message : '小剧场API失败'; rawOutput = rawOutput || (e && e.rawOutput ? e.rawOutput : ''); console.warn('[玩伴小屋] theater pack failed:', e); }
    }
    if (apiFailed) {
      theaterGenerationFailures[failKey] = apiFailed;
      if (options && options.skipOnApiFailure) return { skipped:true, reason:apiFailed, output:rawOutput || apiFailed, debug:apiDebug };
    }
    jobs.forEach(([outcome, special]) => { theaterCache[theaterCacheKeyForName(targetRole, game, outcome, special === 'normal' ? '' : special)] = pack[theaterPackKey(outcome, special)]; });
    saveTheaterCache();
    return { ok:true, output:rawOutput || JSON.stringify(pack, null, 2), saved:JSON.stringify(pack, null, 2), source:rawOutput ? 'api' : 'fallback', debug:apiDebug };
  }

  function openSingleGenerateChoice(game) {
    if (lineGenerationBusy) { toast('已有角色数据生成任务正在进行'); return; }
    const doc = getHostDocument();
    const old = qs('#wb-single-generate-mask', doc); if (old) old.remove();
    const mask = doc.createElement('div');
    mask.className = modalMaskClass();
    mask.id = 'wb-single-generate-mask';
    const wordScope = game === 'wordguess' ? '<label class="wb-field"><span>题库生成内容和范围</span><textarea class="wb-textarea" id="wb-word-gen-scope" style="min-height:86px;" placeholder="例如：只生成古代器物和自然意象；或：围绕当前角色的世界观生成20题；或粘贴希望使用的词语范围。">' + esc(wordGuessBankFilter()) + '</textarea><div class="wb-muted">填写后，AI会优先按这个范围生成角色题库；生成后的角色题库会保存到当前角色。</div></label>' : '';
    mask.innerHTML = '<div class="wb-modal"><div class="wb-modal-title">生成' + esc(GAME_META[game].name) + '数据</div><div class="wb-api-status" style="margin-bottom:12px;">请选择要生成并覆盖的内容。</div>' + wordScope + '<div class="wb-actions"><button class="wb-btn primary" data-kind="all">全部</button><button class="wb-btn" data-kind="lines">语录</button><button class="wb-btn" data-kind="theater">小剧场</button><button class="wb-btn" id="wb-single-gen-cancel">取消</button></div></div>';
    appendModalMask(mask);
    qsa('[data-kind]', mask).forEach(btn => btn.onclick = () => { const kind = btn.dataset.kind; const scope = qs('#wb-word-gen-scope', mask)?.value || ''; mask.remove(); generateLines(game, kind, { wordGuessScope: scope.trim() }); });
    qs('#wb-single-gen-cancel', mask).onclick = () => mask.remove();
  }
  async function generateLines(game, kind, options) {
    if (lineGenerationBusy) { toast('已有角色数据生成任务正在进行'); return; }
    const cfg = settings(); const btn = qs('#wb-generate-lines'); if (!btn) return; btn.disabled = true; btn.textContent = '生成中';
    let preset = currentLinePreset(game);
    let promptCfg = cfg;
    let failed = false;
    try {
      const select = qs('#wb-line-preset-select');
	      if (select && select.value && select.value.indexOf('world::') === 0) {
	        const pr = worldPresets()[parseInt(select.value.slice(7), 10)];
	        if (pr) { preset = normalizePresetName(pr.name); promptCfg = rolePromptConfig(preset, cfg, pr); }
	      } else if (select && select.value) {
	        preset = normalizePresetName(select.value.replace(/^line::/, ''));
	        promptCfg = rolePromptConfig(preset, cfg);
	      }
      if (game === 'wordguess' && options && options.wordGuessScope) {
        promptCfg = Object.assign({}, promptCfg, { wordGuessScope: String(options.wordGuessScope || '').trim() });
        saveWordGuessBankFilter(options.wordGuessScope);
      }
      setCurrentLinePreset(game, preset);
      const total = aiCallCountForGames([game], promptCfg);
      const progress = makeLineGenerationProgress('正在生成' + GAME_META[game].name + '数据', total);
      setLineGenerationStatus(total ? ('正在生成' + GAME_META[game].name + '数据：0/' + total) : ('正在生成' + GAME_META[game].name + '数据：离线生成'), true);
      if ((kind || 'all') !== 'theater') {
        let data = null;
        if (promptCfg.apiUrl && promptCfg.apiModel) {
          try { progress(GAME_META[game].name + '语录'); data = await callLineApiBatches(promptCfg, game); assertGeneratedLinesShape(game, data); }
          catch(apiErr) { console.warn('[玩伴小屋] line API failed, fallback used:', apiErr); toast('语录API失败，已使用本地语录：' + (apiErr && apiErr.message ? apiErr.message : apiErr)); }
        }
        if (!data) data = fallbackGenerated(game, promptCfg);
        const generatedWordBank = game === 'wordguess' && data && Array.isArray(data.word_bank) && data.word_bank.length;
        data = normalizeGeneratedLines(game, data, preset);
        if (generatedWordBank) saveWordGuessBankSource('role');
        saveRoleLineSet(game, preset, data);
        saveRoleLineSetForName(game, preset, preset, data);
        renderLinePresetSelect(game);
      }
      if ((kind || 'all') !== 'lines') {
        try { await preGenerateTheaters(game, promptCfg, progress, preset); }
        catch(theaterErr) { console.warn('[玩伴小屋] theater pregenerate failed:', theaterErr); toast('小剧场生成失败时会使用本地小剧场'); }
      }
      toast('已生成并覆盖“' + companionName() + ' / ' + preset + '”的' + ((kind === 'lines') ? '语录' : (kind === 'theater' ? '小剧场' : '全部数据')));
      setLineGenerationStatus('生成' + GAME_META[game].name + '数据完成', false);
    } catch(e) { failed = true; console.error('[玩伴小屋] generateLines failed:', e); setLineGenerationStatus('生成' + GAME_META[game].name + '数据失败：' + (e && e.message ? e.message : '响应无法解析'), false); toast('生成失败：' + (e && e.message ? e.message : '响应无法解析')); }
    finally { if (!failed && lineGenerationBusy) setLineGenerationStatus('生成' + GAME_META[game].name + '数据完成', false); btn.disabled = false; btn.textContent = '生成'; updateLineGenerationStatusUI(); }
  }
	  function buildPrompt(game, cfg, eventKeys) {
	    const keys = eventKeys && eventKeys.length ? eventKeys : Object.keys(DEFAULT_LINES[game] || {});
	    const events = keys.join(', ');
	    const tpl = (cfg.linePromptOverride || '').trim() ? { header:String(cfg.linePromptOverride).split(/\r?\n/), rules:[], output:[] } : (promptTemplates().lineGeneration || PROMPT_TEMPLATES.lineGeneration);
	    const userDesc = currentUserDescription(cfg);
    const charDesc = currentCharDescription(cfg);
    const chatDesc = cfg.injectChat ? '请参考当前最新聊天记录的关系氛围（插件不直接上传聊天全文时按此要求处理）' : '不注入';
    const wbText = selectedWorldText(cfg) || '无';
    const summaryText = selectedSummaryText(cfg) || '无';
    const recentRole = normalizePresetName((cfg && cfg.charName && cfg.charName !== '{{char}}') ? cfg.charName : companionName());
    const recentLogs = recentGameLogs(game, recentRole) || '无';
    const intimacyText = cfg.intimacyMode ? '开启。允许成年角色之间更亲近、更暧昧、更依赖，允许含蓄的NSFW暗示；禁止未成年人相关性内容、强迫、失控或违法内容。' : '关闭。保持自然陪伴和轻松亲近，禁止色情行为和露骨内容。';
	    const prefix = (cfg.breakLimitPrompt || '').trim();
	    const languagePrompt = specialLanguageRequirement('line', cfg);
	    const wordGuessScope = String(cfg.wordGuessScope || '').trim();
	    if (game === 'wordguess') {
	      return [
	        prefix,
	        languagePrompt,
	        ...(tpl.header || []),
	        '游戏：' + GAME_META[game].name,
        wordGuessScope ? '【题库生成内容和范围】\n' + wordGuessScope + '\n必须优先围绕这个内容和范围生成 word_bank；如果用户给出具体词语、主题、编号范围或限定类别，题目必须从这些范围内选择或贴合这些范围。' : '',
        '这是“我说你猜”的题库、每题专属语录、以及整局常规胜负语录生成。顶层常规事件键只能包含 random、user_win、user_lose。',
        '输出JSON顶层必须且只能包含 word_bank、random、user_win、user_lose。禁止输出 start、clue、clue_late、guess、reveal 等顶层事件键。',
        'word_bank 必须是数组，至少7道题。每道题必须完整包含：word、length、type、clues、start_line、wrong_lines、next_lines、win_line、reveal_line。',
        'random 必须是数组，写8条“很久没有说话时触发”的碎碎念；用于猜词过程中10秒没有新对话时触发，不绑定具体某一道题。',
        'user_win 必须是数组，写8条user猜中第3题时触发的整局胜利语录；此时{{char}}知道user已经必赢，语气应是认输、惊讶、不服气、佩服或想再来。',
        'user_lose 必须是数组，写8条user第3次没猜中/揭晓答案时触发的整局失败语录；此时{{char}}知道自己已经必赢、user已经输了，语气可以得意、调侃、安抚或邀战。',
	        '每题格式必须严格类似：{"word":"答案","length":2,"type":"分类","clues":["描述1","描述2","描述3","描述4","描述5"],"start_line":"本词刚开始时{{char}}说的一句话","wrong_lines":["猜错1","猜错2","猜错3","猜错4","猜错5"],"next_lines":["下一条1","下一条2","下一条3","下一条4"],"win_line":"猜中后{{char}}说的话","reveal_line":"揭晓答案后{{char}}说的话"}。',
	        'clues 必须正好5条，是给user看的逐步描述；next_lines 必须正好4条，对应第2到第5条描述前/后{{char}}的反应。',
	        'start_line 是每个词单独的开场语，会在该词刚开始时触发；每个词都必须不同，必须贴合该词和角色语气。',
	        'wrong_lines 必须正好5条，用于user猜错时触发。重要：{{char}}不知道user具体猜了什么，不能写“不是××”“不是什么”“你猜的不是……”这类针对具体答案的否定；只能写泛化的引导、靠近、调侃或提示。',
	        'win_line 是猜中后的一句话；reveal_line 是点击揭晓答案后，答案后面{{char}}说的一句话。',
	        '每个题目必须有自己独立的 start_line、wrong_lines、next_lines、win_line、reveal_line，禁止多题共用同一套语录，禁止“同上/省略/略”。random也不能和题目内语录重复。',
	        'JSON结构示例，必须照这个顶层结构填满全部题目：\n' + wordGuessJsonSkeleton(),
	        '【用户设定描述】\n' + userDesc,
	        '【角色描述】\n' + charDesc,
	        '【注入最新聊天记录】\n' + chatDesc,
	        '【当前挂载的世界书】\n' + wbText,
	        '【导入大总结】\n' + summaryText,
	        '【最近5条游戏日志】\n' + recentLogs,
	        '【亲密氛围模式】\n' + intimacyText
	      ].filter(Boolean).join('\n');
	    }
	    return [
	      prefix,
	      languagePrompt,
	      ...(tpl.header || []),
	      '游戏：' + GAME_META[game].name,
      '事件键：' + events,
      '必须完整生成全部事件键和全部短句内容，禁止遗漏任何一个事件键或其他条目信息。',
      '输出JSON顶层key必须完整且只能包含这些事件键，禁止新增、漏掉、改名，禁止只输出部分事件键：' + events,
      '每个事件键都必须有实际短句数组，禁止用“同上”“省略”“略”等占位内容，禁止把某个事件的内容合并到另一个事件键里。',
	      'JSON结构示例，必须照这个顶层结构填满全部短句：\n' + lineJsonSkeleton(game, keys),
	      game === 'wordguess' ? '我说你猜额外要求：除事件键外，还必须输出 word_bank 字段。word_bank 是数组，至少7道题；每题格式：{"word":"答案","length":2,"type":"分类","clues":["描述1","描述2","描述3","描述4","描述5"],"wrong_lines":["猜错1","猜错2","猜错3","猜错4","猜错5"],"next_lines":["下一条1","下一条2","下一条3","下一条4"],"win_line":"猜中后{{char}}说的话","reveal_line":"揭晓答案后{{char}}说的话"}。每个题目分别有自己的语录，禁止5个词共用同一套语录。' : '',
      '事件键解释：\n' + eventDescriptionBlock(game, keys),
      '【用户设定描述】\n' + userDesc,
      '【角色描述】\n' + charDesc,
      '【注入最新聊天记录】\n' + chatDesc,
      '【当前挂载的世界书】\n' + wbText,
      '【导入大总结】\n' + summaryText,
	      '【最近5条游戏日志】\n' + recentLogs,
	      '【亲密氛围模式】\n' + intimacyText,
	      ...(tpl.rules || []),
	      ...(tpl.output || [])
	    ].filter(Boolean).join('\n');
	  }
  function apiChatUrl(url) {
    let base = (url || '').trim();
    if (!base) return '';
    if (/\/chat\/completions\/?$/.test(base)) return base;
    base = base.endsWith('/') ? base : base + '/';
    if (!base.includes('/v1/') && !base.endsWith('v1/')) base += 'v1/';
    return base + 'chat/completions';
  }
  function parseGeneratedJson(text) {
    let s = stripJsonFence(text);
    try { return JSON.parse(s); } catch(e) {}
    const sub = extractJsonCandidate(s);
    if (sub) {
      try { return JSON.parse(sub); } catch(e2) {}
    }
    const err = new Error('AI返回内容不是可解析JSON');
    err.rawOutput = s;
    throw err;
  }
  function normalizeGeneratedLines(game, data, roleName) {
    const events = Object.keys(DEFAULT_LINES[game] || {});
    const out = {};
    if (game === 'wordguess' && data && Array.isArray(data.word_bank)) {
      const bank = data.word_bank.map(normalizeWordGuessRoundData).filter(Boolean);
      if (bank.length) saveWordGuessBank(bank, roleName || companionName());
      events.forEach(k => {
        let v = data && data[k];
        if (typeof v === 'string') v = [v];
        if (!Array.isArray(v)) v = [];
        v = v.map(x => String(x == null ? '' : x).trim()).filter(Boolean);
        out[k] = v.length ? v : ((DEFAULT_LINES[game] && DEFAULT_LINES[game][k]) || ['我在。']);
      });
      return out;
    }
    events.forEach(k => {
      let v = data && data[k];
      if (typeof v === 'string') v = [v];
      if (!Array.isArray(v)) v = [];
      v = v.map(x => String(x == null ? '' : x).trim()).filter(Boolean);
      if (!v.length) v = (DEFAULT_LINES[game] && DEFAULT_LINES[game][k]) || ['我在。'];
      out[k] = v;
    });
    return out;
  }
  function normalizeWordGuessRoundData(item) {
    const word = String(item?.word || '').trim();
    if (!word) return null;
    const raw = item.interactions || {};
    const clues = Array.isArray(item.clues) ? item.clues.map(x => String(x || '').trim()).filter(Boolean).slice(0, 5) : [];
    while (clues.length < 5) clues.push(clues[clues.length - 1] || '这个词和现在的场景有关，你再靠近一点想。');
    const wrong = Array.isArray(item.wrong_lines) ? item.wrong_lines.map(x => String(x || '').trim()).filter(Boolean).slice(0, 5) : [];
    const next = Array.isArray(item.next_lines) ? item.next_lines.map(x => String(x || '').trim()).filter(Boolean).slice(0, 4) : [];
    return {
      word,
      type: String(item.type || '未分类'),
      length: parseInt(item.length, 10) || word.length,
      clues,
      interactions: {
        start: String(item.start_line || item.start || raw.start || ('我把“' + word + '”藏好了，先给你第一条线索。')),
        guess: wrong.length ? wrong : (Array.isArray(raw.guess) ? raw.guess : [String(item.guess || raw.guess || '还没猜中，我再把线索往答案旁边推一点。')]),
        clue: next.length ? next : (Array.isArray(raw.clue) ? raw.clue : [String(item.clue || raw.clue || '我再换一种说法。')]),
        clue_late: String(item.clue_late || raw.clue_late || (next[3] || '这个提示已经很近了。')),
        win: String(item.win_line || item.win || raw.win || ('猜中了，答案就是“' + word + '”。')),
        reveal: String(item.reveal_line || item.reveal || raw.reveal || ('答案是“' + word + '”。'))
      }
    };
  }
  function assertGeneratedLinesShape(game, data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('语录返回必须是JSON对象');
    if (game === 'wordguess') {
      const keys = Object.keys(data);
      const allowed = ['word_bank','random','user_win','user_lose'];
      const extra = keys.filter(k => !allowed.includes(k));
      if (extra.length) throw new Error('我说你猜只允许顶层 word_bank、random、user_win、user_lose，不能包含：' + extra.join(', '));
      ['random','user_win','user_lose'].forEach(k => {
        const arr = data[k];
        if (!Array.isArray(arr)) throw new Error('我说你猜必须输出 ' + k + ' 数组');
        const valid = arr.map(x => String(x || '').trim()).filter(Boolean);
        if (valid.length < 1) throw new Error(k + ' 至少需要1条有效短句');
      });
      if (!Array.isArray(data.word_bank)) throw new Error('我说你猜必须输出 word_bank 数组');
      if (data.word_bank.length < 7) throw new Error('word_bank 至少需要7道题');
      data.word_bank.forEach((item, i) => {
        const idx = i + 1;
        if (!String(item?.word || '').trim()) throw new Error('word_bank 第' + idx + '题缺少 word');
        ['clues','wrong_lines','next_lines'].forEach(k => { if (!Array.isArray(item[k])) throw new Error('word_bank 第' + idx + '题的 ' + k + ' 必须是数组'); });
        if (item.clues.length !== 5) throw new Error('word_bank 第' + idx + '题 clues 必须正好5条');
        if (item.wrong_lines.length !== 5) throw new Error('word_bank 第' + idx + '题 wrong_lines 必须正好5条');
        if (item.next_lines.length !== 4) throw new Error('word_bank 第' + idx + '题 next_lines 必须正好4条');
        ['start_line','win_line','reveal_line'].forEach(k => { if (!String(item[k] || '').trim()) throw new Error('word_bank 第' + idx + '题缺少 ' + k); });
      });
      return;
    }
    const events = Object.keys(DEFAULT_LINES[game] || {});
    const eventSet = new Set(events);
    const keys = Object.keys(data);
    const missing = events.filter(k => !Object.prototype.hasOwnProperty.call(data, k));
    const extra = keys.filter(k => !(eventSet.has(k) || (game === 'wordguess' && k === 'word_bank')));
    if (missing.length) throw new Error('语录缺少事件键：' + missing.join(', '));
    if (extra.length) throw new Error('语录包含多余事件键：' + extra.join(', '));
    events.forEach(k => {
      const raw = data[k];
      const arr = typeof raw === 'string' ? [raw] : raw;
      if (!Array.isArray(arr)) throw new Error('语录事件“' + k + '”必须是数组');
      const valid = arr.map(x => String(x == null ? '' : x).trim()).filter(Boolean).filter(x => !/^(同上|省略|略|无|N\/A)$/i.test(x));
      if (!valid.length) throw new Error('语录事件“' + k + '”没有有效短句');
    });
  }
  async function callApi(cfg, prompt, debugMeta) {
    const url = apiChatUrl(cfg.apiUrl);
    if (!url) throw new Error('请先配置API基础URL');
    if (!cfg.apiModel) throw new Error('请先选择模型');
    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers.Authorization = 'Bearer ' + cfg.apiKey;
    const messages = [{ role: 'system', content: promptTemplates().systems.lineGeneration || PROMPT_TEMPLATES.systems.lineGeneration }, { role: 'user', content: prompt }];
    if (debugMeta) debugMeta.inputTokensEstimated = estimateTokenCount(messages.map(m => m.content).join('\n'));
    const started = Date.now();
    try {
      const res = await fetchWithTimeout(url, {
        method: 'POST', headers,
        body: JSON.stringify({ model: cfg.apiModel, messages, temperature: 0.85, max_tokens: 6144 })
      }, 300000);
      if (!res.ok) { const t = await res.text().catch(()=> ''); throw new Error('API错误 ' + res.status + ': ' + t.slice(0, 120)); }
      const json = await res.json();
      fillApiDebugMeta(debugMeta, json);
      const txt = json.choices?.[0]?.message?.content || json.choices?.[0]?.text || json.output_text || '';
      if (!txt) throw new Error('API响应格式异常');
      return parseGeneratedJson(txt);
    } finally {
      if (debugMeta) debugMeta.durationMs = Date.now() - started;
    }
  }
  async function callLineApiBatches(cfg, game, debugMeta) {
    return callApi(cfg, buildPrompt(game, cfg), debugMeta);
  }
  function fallbackGenerated(game, cfg) { const who = currentCharDescription(cfg).includes('未读取') ? '我陪你' : '按现在的语气陪你'; const out = {}; Object.keys(DEFAULT_LINES[game] || {}).forEach(k => out[k] = [who + '，这一刻我记下了。', '别急，下一步更重要。', '这局还没结束，继续。', '我在旁边看着你，这一步很稳。', '这个节奏可以，先保持住。', '我们再把这一局往前推一点。']); return out; }
  function setScore(game, value) {
    const g = GAME_META[game] || {};
    const sc = scores();
    if (g.mode === 'double') {
      const cur = sc[game] && typeof sc[game] === 'object' ? sc[game] : { user: sc[game] || 0, ta: 0 };
      if (value > (cur.user || 0)) cur.user = value;
      sc[game] = cur; saveJSON(STORAGE_SCORES, sc);
      const h = qs('#wb-high'); if (h) h.textContent = scoreDisplay(game);
    } else {
      const old = sc[game] || 0;
      if (value > old) { sc[game] = value; saveJSON(STORAGE_SCORES, sc); if (!currentRoundRecord && old > 0 && DEFAULT_LINES[game] && DEFAULT_LINES[game].record) { currentRoundRecord = true; speak(game, 'record'); } }
    }
    const s = qs('#wb-score'); if (s) s.textContent = '本局：' + value;
  }

  function shuffleArray(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }

  function controlModeLabel(mode) {
    return mode === 'keys' ? '显示键位' : (mode === 'tap' ? '点击移动' : '滑动移动');
  }
  function nextControlMode(mode, modes) {
    const arr = Array.isArray(modes) && modes.length ? modes : ['keys','swipe','tap'];
    const idx = arr.indexOf(mode);
    return arr[(idx + 1 + arr.length) % arr.length];
  }
  function eventDirectionInElement(el, e, options) {
    if(!el) return '';
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const dx = x - rect.width / 2, dy = y - rect.height / 2;
    if(options && options.fourWay === false) return dx < 0 ? 'left' : 'right';
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
  }
  function addTapDirection(el, enabled, cb, options) {
    if(!el) return;
    let start = null;
    el.onpointerdown = e => {
      if(!enabled()) return;
      start = { x:e.clientX, y:e.clientY, id:e.pointerId };
      try { el.setPointerCapture(e.pointerId); } catch(e2) {}
      e.preventDefault();
    };
    el.onpointerup = e => {
      if(!start || (start.id != null && e.pointerId !== start.id)) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      try { el.releasePointerCapture(e.pointerId); } catch(e2) {}
      if(Math.max(Math.abs(dx), Math.abs(dy)) > 12) return;
      e.preventDefault();
      cb(eventDirectionInElement(el, e, options));
    };
    el.onpointercancel = () => { start = null; };
  }
  function addSwipe(el, cb) {
    el.ontouchstart = e => { const t=e.touches[0]; touchStart={x:t.clientX,y:t.clientY}; };
    el.ontouchend = e => {
      if(!touchStart) return;
      const t=e.changedTouches[0], dx=t.clientX-touchStart.x, dy=t.clientY-touchStart.y;
      touchStart=null;
      if(Math.max(Math.abs(dx),Math.abs(dy))<24) return;
      cb(Math.abs(dx)>Math.abs(dy) ? (dx>0?'right':'left') : (dy>0?'down':'up'));
    };
    el.ontouchcancel = () => { touchStart = null; };
  }

  function saveStandaloneState() {
    commitGameActiveDuration(true);
    activeGameController?.save?.();
    flushAllProgressSaves();
    flushSettingsProgress();
    saveWindowState(currentTab, currentGame);
    return {ok:storageWriteErrors.size === 0};
  }
  function contentCheckpoint() {
    if (currentGame || gameStarted) return {ok:false, message:'请先返回游戏列表再安装更新'};
    try {
      if (!saveStandaloneState().ok) return {ok:false, message:'存档保存失败，请检查设备空间后重试'};
      return {ok:true, idle:true, storage:captureStorage(localStorage)};
    } catch(error) { return {ok:false, message:error.message}; }
  }
  function pauseStandalone() {
    // A native pause can arrive during a resume countdown. Cancel it first so a
    // queued callback cannot restart physics behind another Android activity.
    for (const selector of ['#wb-resume-cancel', '#wb-count-cancel']) qs(selector)?.click();
    pauseGameForInactiveSurface();
    // The native engine is in an iframe with its own RAF. Freeze synchronously,
    // before Android suspends WebView timers (its controller polls every 100 ms).
    qsa('.wb-cadet-frame').forEach(frame => {
      try { frame.contentWindow?.cadetHost?.pause(true); } catch (error) { console.warn('[玩吧] 弹球暂停失败', error); }
    });
    saveStandaloneState();
  }
  function standaloneBack() {
    const match3Cancel = qs('.m3-confirm:not([hidden]) .m3-confirm-cancel');
    if (match3Cancel) { match3Cancel.click(); return true; }
    const masks = qsa('.wb-modal-mask').filter(mask => mask.isConnected && !mask.hidden);
    const mask = masks[masks.length - 1];
    if (mask) {
      const cancel = qs('button[id$="-cancel"],button[id$="-close"],button[id$="-back"],#wb-count-cancel',mask);
      if (cancel) cancel.click(); else mask.remove();
      return true;
    }
    if (currentGame) { saveStandaloneState(); stopGame(); currentGame = null; saveWindowState(currentTab, ''); render(); return true; }
    if (currentTab === 'settings') { currentTab = 'single'; saveWindowState(currentTab, ''); render(); return true; }
    return false;
  }
  if (standalone) {
    getHostDocument().body.classList.add('wanba-standalone');
    setSettings({});
    buildPopup();
    runtimeApi = Object.freeze({
      pause:pauseStandalone,
      save:saveStandaloneState,
      checkpoint:contentCheckpoint,
      ready:() => { startupBlocked = false; },
      back:standaloneBack,
      notify:toast,
      inspect:() => JSON.parse(JSON.stringify({
        version:standaloneAppInfo.appVersion, webVersion:APP_VERSION, gameBaseline:EXTENSION_VERSION,
        appInfo:standaloneAppInfo, webCapabilities:readWebCapabilities(getHostWindow()),
        tab:currentTab, game:currentGame, started:gameStarted, paused:gamePaused,
        games:Object.values(GAME_META).map(({id,name,mode}) => ({id,name,mode,content:contentForGame(id)})),
        content:contentState?.active || null,
        theme:settings().theme,
        controller:activeGameController?.getState?.() || null,
        progress:currentGame ? gameProgress(currentGame) : null,
      })),
    });
    return runtimeApi;
  }
}
