import { EXTENSION_VERSION } from '../src/core/metadata.js';

export const APP_VERSION = '1.2.2';
export const GAME_BASELINE = EXTENSION_VERSION;
const VERSION = /^\d+\.\d+(?:\.[\dA-Za-z-]+)*$/;
const cleanVersion = value => typeof value === 'string' && value.length <= 80 && VERSION.test(value) ? value : '';

export function normalizeAppInfo(raw, userAgent = '') {
  let native = raw;
  if (typeof native === 'string') {
    try { native = JSON.parse(native); } catch { native = null; }
  }
  const flavor = native?.flavor;
  const appVersion = cleanVersion(native?.appVersion);
  const engineVersion = cleanVersion(native?.engineVersion);
  const versionCode = native?.versionCode;
  if (['system', 'compat'].includes(flavor) && appVersion && engineVersion && Number.isSafeInteger(versionCode) && versionCode > 0) {
    return Object.freeze({
      appVersion, versionCode, webVersion:APP_VERSION, gameBaseline:GAME_BASELINE,
      flavor, flavorLabel:flavor === 'compat' ? '兼容版' : '系统版',
      engine:flavor === 'compat' ? 'GeckoView' : 'Android System WebView',
      engineLabel:flavor === 'compat' ? '内置 GeckoView' : '系统 Android WebView',
      engineVersion,
      providerVersion:typeof native.providerVersion === 'string' && native.providerVersion.length <= 120 && !/[\x00-\x1f]/.test(native.providerVersion) ? native.providerVersion : '',
      source:'native', versionMatches:appVersion === APP_VERSION,
      gameUpdatesEnabled:native.gameUpdatesEnabled !== false,
      nativeSelfUpdateEnabled:native.nativeSelfUpdateEnabled !== false,
      appUpdaterEnabled:native.appUpdaterEnabled === true,
    });
  }
  const firefox = /Firefox\/([\d.]+)/.exec(userAgent);
  const chrome = /(?:Chrome|Chromium)\/([\d.]+)/.exec(userAgent);
  const webview = /\bwv\b/.test(userAgent);
  return Object.freeze({
    appVersion:APP_VERSION, versionCode:null, webVersion:APP_VERSION, gameBaseline:GAME_BASELINE,
    flavor:'preview', flavorLabel:'浏览器预览',
    engine:firefox ? 'Gecko' : chrome ? (webview ? 'Android System WebView' : 'Chromium') : 'unknown',
    engineLabel:firefox ? 'Firefox / Gecko' : chrome ? (webview ? '系统 Android WebView' : 'Chromium') : '未知内核',
    engineVersion:firefox?.[1] || chrome?.[1] || '', source:'user-agent', versionMatches:null,
    gameUpdatesEnabled:true, nativeSelfUpdateEnabled:true, appUpdaterEnabled:false,
  });
}

// Gecko's exported WebExtension method can be asynchronous; Android WebView's
// Java bridge returns a string directly. Neither path accepts executable input.
export async function readAppInfo(host = globalThis, timeoutMs = 1500) {
  const ua = host.navigator?.userAgent || '';
  let timer;
  try {
    const bridge = host.NativeBridge;
    if (typeof bridge?.getAppInfo !== 'function') return normalizeAppInfo(null, ua);
    const response = await Promise.race([
      Promise.resolve().then(() => bridge.getAppInfo()),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); }),
    ]);
    return normalizeAppInfo(response, ua);
  } catch {
    return normalizeAppInfo(null, ua);
  } finally {
    clearTimeout(timer);
  }
}

export function readWebCapabilities(host = globalThis) {
  return Object.freeze({
    canvasRoundRect:typeof host.CanvasRenderingContext2D?.prototype?.roundRect === 'function',
    wasm:typeof host.WebAssembly?.instantiate === 'function',
    resizeObserver:typeof host.ResizeObserver === 'function',
    pointerEvents:typeof host.PointerEvent === 'function',
    containerUnits:!!host.CSS?.supports?.('width','1cqh'),
    colorMix:!!host.CSS?.supports?.('color','color-mix(in srgb, red, blue)'),
  });
}
