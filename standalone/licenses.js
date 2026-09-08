const pinball = [
  ['ENGINE-LICENSE.txt','SpaceCadetPinball · MIT'],
  ['EMSCRIPTEN-LICENSE.txt','Emscripten'],
  ['SDL2-LICENSE.txt','SDL 2'],
  ['SDL2-MIXER-LICENSE.txt','SDL 2 Mixer'],
  ['OPEN-CADET-CC0.txt','Open Space Cadet · CC0'],
  ['OPEN-CADET-NOTICE.md','Open Space Cadet · 来源声明'],
].map(([id,label]) => Object.freeze({id,label,url:new URL('../licenses/space-cadet/' + id,import.meta.url).href}));

const gecko = [
  ['GeckoView-NOTICES.txt','GeckoView · 完整许可证与声明'],
  ['GeckoView-SOURCE.txt','GeckoView · 对应源码与来源'],
].map(([id,label]) => Object.freeze({id,label,url:new URL('./licenses/' + id,import.meta.url).href}));

// Only fixed, packaged files are offered; the viewer cannot fetch a supplied URL.
export function standaloneLicenses(flavor) {
  return Object.freeze(flavor === 'compat' ? [...pinball,...gecko] : [...pinball]);
}
