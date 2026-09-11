#!/usr/bin/env node
import {cp,readFile,realpath,rm,stat,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const sourceRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directories=['src','standalone','locales','assets/game-art'];
const files=['index.js','style.css','manifest.json'];

function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8'}).trim();}
function option(name){const index=process.argv.indexOf(name);return index>=0?process.argv[index+1]:null;}
function validVersion(value){return /^\d+\.\d+\.\d+$/.test(value||'');}
async function exists(path){try{await stat(path);return true;}catch{return false;}}

export async function syncSillyTavernPlugin({targetRoot,pluginVersion,sourceCommit=git(sourceRoot,['rev-parse','HEAD'])}){
  if(!targetRoot)throw Error('Require --target <USER_HOUSE checkout>');
  if(!validVersion(pluginVersion))throw Error('Require --version in x.y.z form');
  const target=await realpath(resolve(targetRoot));
  const source=await realpath(sourceRoot);
  if(target===source)throw Error('Plugin target must be a separate checkout');
  if(!await exists(join(target,'.git'))||!await exists(join(target,'manifest.json')))throw Error('Target is not a USER_HOUSE checkout');
  const origin=git(target,['remote','get-url','origin']);
  if(!/(?:^|\/)USER_HOUSE(?:\.git)?$/.test(origin))throw Error('Target origin is not USER_HOUSE: '+origin);
  const dirty=git(target,['status','--porcelain']);
  if(dirty)throw Error('Target checkout must be clean before sync:\n'+dirty);
  if(!/^[0-9a-f]{40}$/.test(sourceCommit))throw Error('Source commit must be a full Git hash');

  for(const path of directories){
    const from=join(source,path),to=join(target,path);
    if(!await exists(from))throw Error('Missing canonical directory: '+path);
    await rm(to,{recursive:true,force:true});
    await cp(from,to,{recursive:true,force:true,preserveTimestamps:false});
  }
  for(const path of files)await cp(join(source,path),join(target,path),{force:true,preserveTimestamps:false});

  const manifestPath=join(target,'manifest.json');
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  manifest.version=pluginVersion;
  manifest.homePage='https://github.com/JackLee992/USER_HOUSE';
  manifest.auto_update=true;
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
  const releaseSource={schema:1,pluginVersion,sourceRepository:'JackLee992/USER_HOUSE_ANDROID',sourceCommit,gameCount:37};
  await writeFile(join(target,'release-source.json'),JSON.stringify(releaseSource,null,2)+'\n');
  const changed=git(target,['status','--short']).split('\n').filter(Boolean);
  return {target:relative(dirname(target),target)||target,pluginVersion,sourceCommit,changed};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const result=await syncSillyTavernPlugin({targetRoot:option('--target'),pluginVersion:option('--version')});
  console.log(JSON.stringify(result,null,2));
}
