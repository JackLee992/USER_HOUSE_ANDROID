import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {generateKeyPairSync,createPublicKey} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {zipFiles,ownerOf,buildPacks,decodeChannel} from '../tools/content/build-packs.mjs';
import {LICENSE_FILES} from '../scripts/prepare-android-assets.mjs';

test('generated ZIP is deterministic and readable by a separate ZIP implementation',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'wanba-zip-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const files=[{path:'src/test.js',bytes:Buffer.from('export const value = 42;')},{path:'locales/en.json',bytes:Buffer.from('{"name":"Nookcade"}')}];
 const zip=zipFiles(files);assert.deepEqual(zip,zipFiles([...files].reverse()));await writeFile(join(directory,'pack.zip'),zip);
 const output=execFileSync('python3',['-c','import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; print(z.read("src/test.js").decode())',join(directory,'pack.zip')],{encoding:'utf8'});assert.match(output,/value = 42/);assert.throws(()=>zipFiles([{path:'src/../secret',bytes:Buffer.from('x')}]));
});
test('ownership assigns real code and engine closure to each game, art and languages separately',()=>{
 const ids=['match3','pinball'];assert.equal(ownerOf('src/games/match3.js',ids),'game.match3');assert.equal(ownerOf('src/games/plugins/match3/index.js',ids),'game.match3');assert.equal(ownerOf('src/games/plugins/registry.js',ids),'core');assert.equal(ownerOf('assets/space-cadet/space-cadet.wasm',ids),'game.pinball');assert.equal(ownerOf('assets/space-cadet/playfield-hd.png',ids),'art.pinball');assert.equal(ownerOf('locales/ja.json',ids),'i18n.ja');assert.equal(ownerOf('assets/game-art/match3/board.webp',ids),'art.match3');
});
test('signed releases enforce independent versions and reuse every unchanged archive',async t=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),'wanba-publisher-')));t.after(()=>rm(root,{recursive:true,force:true}));
 const put=async(path,text)=>{await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text);};
 const versions={packages:{core:'1.0.0','art.shared':'1.0.0',...Object.fromEntries(['zh-CN','zh-TW','en','ja','ko'].map(x=>['i18n.'+x,'1.0.0']))},saveSchemas:{match3:3}};
 await put('content/versions.json',JSON.stringify(versions));await put('src/games/plugins/match3/index.js','export const GAME_VERSION="1.0.0"; export const createGame = () => 42;');await put('src/runtime/wanban-app.js','export const init = () => 1;');await put('standalone/index.html','<p>test</p>');await put('style.css','body{color:blue}');await put('assets/game-icons/test.png','art');await mkdir(join(root,'assets/space-cadet'),{recursive:true});
 for(const locale of ['zh-CN','zh-TW','en','ja','ko'])await put('locales/'+locale+'.json',JSON.stringify({locale}));for(const license of LICENSE_FILES)await put('tools/space-cadet/'+license,'test license');
 const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});await put('key.pem',privateKey.export({type:'pkcs8',format:'pem'}));
 const run=async(n,previous)=>{const output=join(root,'out-'+n);await mkdir(output,{recursive:true});return buildPacks({root,output,sequence:n,snapshotVersion:'1.0.'+(n-1),privateKeyPath:join(root,'key.pem'),previousPath:previous,sourceCommit:'a'.repeat(40)});};
 const first=await run(1);assert.equal(first.gameCount,1);const previous=join(root,'out-1/channel.json');const payload=decodeChannel(await readFile(previous),createPublicKey(privateKey));assert.equal(payload.games.match3.saveSchema,3);
 await put('src/games/plugins/match3/index.js','export const GAME_VERSION="1.0.1"; export const createGame = () => 43;');
 const second=await run(2,previous);assert.deepEqual(second.changed.map(p=>p.id),['game.match3']);const next=decodeChannel(await readFile(join(root,'out-2/channel.json')),createPublicKey(privateKey));assert.deepEqual(next.packages.find(p=>p.id==='core'),payload.packages.find(p=>p.id==='core'));
 await put('src/games/plugins/match3/index.js','export const GAME_VERSION="1.0.1"; export const createGame = () => 44;');await assert.rejects(()=>run(3,join(root,'out-2/channel.json')),/version bump/);
 const envelope=JSON.parse(await readFile(previous));envelope.payload=Buffer.from(envelope.payload,'base64').toString()+' ';envelope.payload=Buffer.from(envelope.payload).toString('base64');assert.throws(()=>decodeChannel(envelope,createPublicKey(privateKey)),/signature invalid/);
});
