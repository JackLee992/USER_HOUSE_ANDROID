#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir, lstat } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { prepareAndroidAssets } from '../../scripts/prepare-android-assets.mjs';

export const REPOSITORY = 'JackLee992/USER_HOUSE_GAME_PACKS';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
function greater(a,b) { const x=a.split('.').map(Number),y=b.split('.').map(Number); return x.some((v,i)=>v>y[i]&&x.slice(0,i).every((p,j)=>p===y[j])); }
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}

// Stable ZIP bytes: sorted paths, fixed DOS date, UTF-8 names and ordinary files.
// Android verifies both the archive and every uncompressed member independently.
export function zipFiles(files) {
  const parts=[],directory=[];let offset=0;
  for(const {path,bytes} of [...files].sort((a,b)=>a.path.localeCompare(b.path,'en'))) {
    if(!/^[A-Za-z0-9_][A-Za-z0-9_./ -]*$/.test(path)||path.split('/').some(p=>!p||p.startsWith('.')))throw Error('Unsafe ZIP path: '+path);
    const name=Buffer.from(path),data=deflateRawSync(bytes,{level:9}),crc=crc32(bytes);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(bytes.length,22);header.writeUInt16LE(name.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800,8);central.writeUInt16LE(8,10);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(bytes.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    parts.push(header,name,data);directory.push(central,name);offset+=header.length+name.length+data.length;
  }
  const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,dir,end]);
}

export function decodeChannel(envelope,key) {
  const channel=typeof envelope==='object'&&!Buffer.isBuffer(envelope)?envelope:JSON.parse(envelope.toString());
  const payload=Buffer.from(channel.payload,'base64');
  if(channel.schema!==1||!verify('sha256',payload,key,Buffer.from(channel.signature,'base64')))throw Error('Previous channel signature invalid');
  return JSON.parse(payload);
}

export function ownerOf(path, gameIds, icons={}) {
  const plugin=/^src\/games\/plugins\/([^/]+)\//.exec(path);
  if(plugin&&gameIds.includes(plugin[1]))return 'game.'+plugin[1];
  const legacy={'match3.js':'match3','freecell.js':'freecell','zuma.js':'zuma','water-sort.js':'watersort','space-cadet.js':'pinball','space-cadet-data.js':'pinball'};
  if(path.startsWith('src/games/')&&legacy[path.slice(10)])return 'game.'+legacy[path.slice(10)];
  if(path.startsWith('assets/space-cadet/'))return /\.(png|jpg|webp)$/.test(path)?'art.pinball':'game.pinball';
  if(path.startsWith('locales/')){const locale=/^locales\/([a-zA-Z-]+)\.json$/.exec(path)?.[1];if(!['zh-CN','zh-TW','en','ja','ko'].includes(locale))throw Error('Unexpected locale file: '+path);return 'i18n.'+locale;}
  const art=/^assets\/game-art\/([^/]+)\//.exec(path);
  if(art&&gameIds.includes(art[1]))return 'art.'+art[1];
  if(icons[path])return 'art.'+icons[path];
  if(path.startsWith('assets/game-icons/')||path.startsWith('assets/game-art/')||path.startsWith('assets/app-brand/'))return 'art.shared';
  return 'core';
}

export async function buildPacks({root=repo,output,sequence,snapshotVersion,privateKeyPath,previousPath,sourceCommit,builtin=false}) {
  if(!Number.isSafeInteger(sequence)||sequence<1||!versionPattern.test(snapshotVersion))throw Error('Require positive sequence and snapshot semver');
  const key=createPrivateKey(await readFile(privateKeyPath));
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails.namedCurve!=='prime256v1')throw Error('Signing key must be P-256');
  const publicKey=createPublicKey(key),previous=previousPath?decodeChannel(await readFile(previousPath),publicKey):null;
  if(previous&&(sequence<=previous.sequence||!greater(snapshotVersion,previous.snapshotVersion)))throw Error('Release sequence and snapshot version must increase');
  const versions=JSON.parse(await readFile(join(root,'content/versions.json')));
  const ids=(await readdir(join(root,'src/games/plugins'),{withFileTypes:true})).filter(e=>e.isDirectory()).map(e=>e.name).sort();
  const runtime=await readFile(join(root,'src/runtime/wanban-app.js'),'utf8'),icons={};
  for(const match of runtime.matchAll(/\b([a-z0-9]+): \{ id: '[a-z0-9]+'.+?iconImage: GAME_ICON_BASE \+ '([^']+)'/g))icons['assets/game-icons/'+match[2]]=match[1];
  const staging=join(output,'www');await prepareAndroidAssets({repoRoot:root,outputDir:staging});
  const fileList=[];
  async function walk(dir,prefix='') {for(const entry of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){if(entry.name.startsWith('.'))continue;const path=prefix+entry.name,full=join(dir,entry.name);if((await lstat(full)).isSymbolicLink())throw Error('No symlink');if(entry.isDirectory())await walk(full,path+'/');else fileList.push({path,bytes:await readFile(full)});}}
  await walk(staging);
  const groups=new Map();for(const file of fileList){const owner=ownerOf(file.path,ids,icons);if(!groups.has(owner))groups.set(owner,[]);groups.get(owner).push(file);}
  const packages=[],changed=[],games={};
  for(const [id,files] of [...groups].sort(([a],[b])=>a.localeCompare(b,'en'))) {
    const kind=id==='core'?'core':id.split('.')[0];
    let version=versions.packages[id];
    if(kind==='game') {const source=await readFile(join(root,'src/games/plugins',id.slice(5),'index.js'),'utf8');version=/GAME_VERSION\s*=\s*['"]([^'"]+)/.exec(source)?.[1];}
    if(!versionPattern.test(version||''))throw Error('Missing explicit version: '+id);
    const zip=zipFiles(files),sha=sha256(zip),prior=previous?.packages.find(p=>p.id===id);
    if(prior&&prior.sha256===sha){if(prior.version!==version)throw Error('Unchanged package must retain version: '+id);packages.push(prior);continue;}
    if(prior&&!greater(version,prior.version))throw Error('Changed package needs version bump: '+id+' '+prior.version+' -> '+version);
    const filename=id+'-'+version+'.zip';await writeFile(join(output,filename),zip);
    packages.push({id,kind,version,url:`https://github.com/${REPOSITORY}/releases/download/content-${sequence}/${filename}`,sha256:sha,size:zip.length,files:files.map(({path,bytes})=>({path,sha256:sha256(bytes),size:bytes.length}))});changed.push({id,filename,size:zip.length});
  }
  for(const id of ids){const code=packages.find(p=>p.id==='game.'+id);if(!code)throw Error('Missing game code: '+id);const art=['art.'+id,'art.shared'].filter(p=>packages.some(q=>q.id===p));games[id]={version:code.version,code:code.id,art,saveSchema:versions.saveSchemas[id]??1};if(previous?.games[id]&&previous.games[id].saveSchema!==games[id].saveSchema)throw Error('Save schema changed: '+id);}
  if(previous&&Object.keys(previous.games).some(id=>!games[id]))throw Error('Cannot remove installed games');
  const locales=Object.fromEntries(['zh-CN','zh-TW','en','ja','ko'].map(id=>[id,'i18n.'+id]));
  for(const id of Object.values(locales))if(!packages.some(p=>p.id===id))throw Error('Missing locale: '+id);
  if(!sourceCommit)sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(!/^[0-9a-f]{40}$/.test(sourceCommit))throw Error('Invalid source commit');
  const manifest={schema:1,sequence,snapshotVersion,releaseTag:'content-'+sequence,minHostApi:1,maxHostApi:1,minAppVersionCode:3,runtimeApi:1,sourceCommit,entry:'standalone/index.html',packages,games,locales};
  const payload=Buffer.from(JSON.stringify(manifest));const channel=JSON.stringify({schema:1,payload:payload.toString('base64'),signature:sign('sha256',payload,key).toString('base64')})+'\n';
  await writeFile(join(output,'channel.json'),channel);await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  const result={repository:REPOSITORY,releaseTag:manifest.releaseTag,snapshotId:sha256(payload),sequence,snapshotVersion,sourceCommit,gameCount:ids.length,packageCount:packages.length,changed,totalDownloadBytes:changed.reduce((n,p)=>n+p.size,0)};
  await writeFile(join(output,'release.json'),JSON.stringify(result,null,2)+'\n');
  if(builtin){const dir=join(root,'android/app/src/main/assets/content-update');await mkdir(dir,{recursive:true});const pinned=await readFile(join(dir,'public-key.der'));if(!pinned.equals(publicKey.export({type:'spki',format:'der'})))throw Error('Signing key does not match APK trust root');await writeFile(join(dir,'builtin-channel.json'),channel);}
  return result;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i++){const arg=args[i];if(arg==='--builtin'){options.builtin=true;continue;}const map={'--output':'output','--sequence':'sequence','--version':'snapshotVersion','--key':'privateKeyPath','--previous':'previousPath','--source-commit':'sourceCommit'};if(!map[arg]||!args[i+1])throw Error('Unknown or incomplete argument: '+arg);options[map[arg]]=args[++i];}options.sequence=Number(options.sequence);if(!options.output||!options.privateKeyPath)throw Error('Require --output and --key');options.output=resolve(options.output);await mkdir(options.output,{recursive:true});console.log(JSON.stringify(await buildPacks(options),null,2));}
