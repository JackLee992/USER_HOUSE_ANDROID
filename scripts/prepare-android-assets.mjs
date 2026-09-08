#!/usr/bin/env node
import {lstat,mkdir,readdir,readFile,copyFile,writeFile,rm,mkdtemp,rename,realpath} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

export const ASSET_ROOTS = Object.freeze(['src','style.css','standalone','locales','assets/game-icons','assets/game-art','assets/space-cadet','assets/app-brand']);
export const LICENSE_FILES = Object.freeze(['ENGINE-LICENSE.txt','EMSCRIPTEN-LICENSE.txt','SDL2-LICENSE.txt','SDL2-MIXER-LICENSE.txt','OPEN-CADET-CC0.txt','OPEN-CADET-NOTICE.md']);
const DEFAULT_REPO = resolve(dirname(fileURLToPath(import.meta.url)),'..');
const MARKER = '.wanba-assets.json';
const excluded = new Set(['.git','tests','docs','node_modules','pets']);
const within = (path,parent) => path===parent || path.startsWith(parent+sep);

export async function prepareAndroidAssets({repoRoot=DEFAULT_REPO,outputDir}={}) {
  const root=await realpath(repoRoot),output=resolve(outputDir||join(root,'android/app/build/generated/wanbaAssets/www'));
  if(within(root,output)||[...ASSET_ROOTS,'tools/space-cadet'].some(entry=>within(output,join(root,entry))||within(join(root,entry),output)))throw Error('Output must not overlap the repository or source assets');
  const entries=[];
  async function collect(relative, outputRelative=relative) {
    const source=join(root,relative),info=await lstat(source);
    if(info.isSymbolicLink())throw Error('Asset symlinks are not allowed: '+relative);
    if(info.isDirectory()) {
      for(const name of (await readdir(source)).sort()) {
        if(relative==='assets/app-brand'&&!['app-icon.png','international'].includes(name))continue;
        if(relative==='assets/app-brand/international'&&name!=='app-icon.png')continue;
        if(!excluded.has(name)&&!name.startsWith('.'))await collect(join(relative,name),join(outputRelative,name));
      }
    }else if(info.isFile())entries.push({source:relative,relative:outputRelative,bytes:info.size});
    else throw Error('Unsupported asset type: '+relative);
  }
  for(const entry of ASSET_ROOTS) {
    try {await collect(entry);}
    catch(error){if(['assets/app-brand','assets/game-art','locales'].includes(entry)&&error.code==='ENOENT')continue;throw error;}
  }
  for(const filename of LICENSE_FILES)await collect('tools/space-cadet/'+filename,'licenses/space-cadet/'+filename);
  if(!entries.some(file=>file.relative==='standalone/index.html'))throw Error('Missing standalone/index.html; build the standalone entry before packaging');
  try {
    const outputInfo=await lstat(output);
    if(!outputInfo.isDirectory()||outputInfo.isSymbolicLink())throw Error('Output is not a real staging directory');
    if((await readdir(output)).length) {
      let marker;
      try {marker=JSON.parse(await readFile(join(output,MARKER),'utf8'));}catch {throw Error('Refusing to replace an unowned nonempty output directory');}
      if(marker.owner!=='wanba-android-assets')throw Error('Output staging marker belongs to another source');
    }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  // Refuse a symlink in the destination ancestry, including a symlinked build folder.
  let ancestor=dirname(output);
  while(true){try {if((await lstat(ancestor)).isSymbolicLink())throw Error('Output ancestry must not contain symlinks');}catch(error){if(error.code!=='ENOENT')throw error;}const parent=dirname(ancestor);if(parent===ancestor)break;ancestor=parent;}
  await mkdir(dirname(output),{recursive:true});
  const staging=await mkdtemp(join(dirname(output),'.wanba-assets-'));
  try {
    const digest=createHash('sha256');
    for(const entry of entries) {
      const destination=join(staging,entry.relative);await mkdir(dirname(destination),{recursive:true});
      await copyFile(join(root,entry.source),destination);
      digest.update(entry.relative.split(sep).join('/'));digest.update('\0');digest.update(await readFile(destination));
    }
    const result={owner:'wanba-android-assets',repoRoot:root,outputDir:output,files:entries.map(entry=>entry.relative.split(sep).join('/')),fileCount:entries.length,totalBytes:entries.reduce((sum,entry)=>sum+entry.bytes,0),sha256:digest.digest('hex')};
    const {repoRoot:_source,outputDir:_destination,...manifest}=result;
    await writeFile(join(staging,MARKER),JSON.stringify(manifest,null,2)+'\n');
    await rm(output,{recursive:true,force:true});await rename(staging,output);return result;
  }catch(error){await rm(staging,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);let outputDir;
  if(args.length){if(args.length!==2||args[0]!=='--output')throw Error('Usage: node scripts/prepare-android-assets.mjs [--output /staging/www]');outputDir=args[1];}
  const result=await prepareAndroidAssets({outputDir});console.log(JSON.stringify({outputDir:result.outputDir,fileCount:result.fileCount,totalBytes:result.totalBytes,sha256:result.sha256},null,2));
}
