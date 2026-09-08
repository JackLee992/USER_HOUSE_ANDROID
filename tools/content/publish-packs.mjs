#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createPublicKey} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {decodeChannel,sha256,REPOSITORY} from './build-packs.mjs';

const directory=resolve(process.argv[2]||''),publish=process.argv.includes('--publish');
if(!process.argv[2])throw Error('Usage: node tools/content/publish-packs.mjs OUTPUT [--publish]');
const publicKey=createPublicKey({key:await readFile(new URL('../../android/app/src/main/assets/content-update/public-key.der',import.meta.url)),format:'der',type:'spki'});
const manifest=decodeChannel(await readFile(join(directory,'channel.json')),publicKey);
if(!/^content-[1-9]\d*$/.test(manifest.releaseTag))throw Error('Invalid release tag');
const prefix=`https://github.com/${REPOSITORY}/releases/download/${manifest.releaseTag}/`,files=[];
for(const pack of manifest.packages){if(!pack.url.startsWith(prefix))continue;const filename=pack.url.slice(prefix.length);if(!/^[A-Za-z0-9._-]+\.zip$/.test(filename))throw Error('Invalid archive name');const path=join(directory,filename),data=await readFile(path);if(data.length!==pack.size||sha256(data)!==pack.sha256)throw Error('Archive changed after signing: '+filename);files.push(path);}
const notes=`游戏内容 ${manifest.snapshotVersion}\n\n包含 ${Object.keys(manifest.games).length} 款游戏、独立美术包和简繁英日韩语言包。本次新增 ${files.length} 个包；其余包复用已有不可变发行。\n\n源码：[USER_HOUSE_ANDROID ${manifest.sourceCommit.slice(0,8)}](https://github.com/JackLee992/USER_HOUSE_ANDROID/tree/${manifest.sourceCommit})\n\n在玩吧 1.2.0 或更新版本首页检查更新并安装，无需卸载 App。APK 下载：[玩吧 / Nookcade](https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/latest)\n`;
const notesPath=join(directory,'release-notes.md');await writeFile(notesPath,notes);
const gh=args=>execFileSync('gh',args,{stdio:'inherit'});
// Always upload the complete release while it is still a draft. Published
// immutable assets cannot be replaced; retries require a new sequence.
gh(['release','create',manifest.releaseTag,'--repo',REPOSITORY,'--target','main','--draft','--title','游戏内容 '+manifest.snapshotVersion,'--notes-file',notesPath,join(directory,'channel.json'),join(directory,'manifest.json'),...files]);
if(publish)gh(['release','edit',manifest.releaseTag,'--repo',REPOSITORY,'--draft=false','--latest']);
console.log(publish?'Published '+manifest.releaseTag:'Draft uploaded; verify all assets before publishing '+manifest.releaseTag);
