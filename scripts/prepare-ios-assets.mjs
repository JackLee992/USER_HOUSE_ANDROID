#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareAndroidAssets} from './prepare-android-assets.mjs';
import {GAME_PLUGINS,GAME_HOST_API_VERSION} from '../src/games/plugins/registry.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const result=await prepareAndroidAssets({repoRoot:root,outputDir:join(root,'ios/build/www')});
const versions=JSON.parse(await readFile(join(root,'content/versions.json'),'utf8'));
const packages=Object.entries(versions.packages).map(([id,version])=>({id,version}));
const games=Object.fromEntries(Object.entries(GAME_PLUGINS).map(([id,module])=>[id,{version:module.GAME_VERSION,saveSchema:versions.saveSchemas[id],art:['art.shared','art.'+id]}]));
if(!/^\d+\.\d+\.\d+$/.test(versions.snapshotVersion||''))throw Error('content/versions.json requires snapshotVersion for iOS builds');
const active={snapshotVersion:versions.snapshotVersion,runtimeApi:GAME_HOST_API_VERSION,games,packages};
await writeFile(join(result.outputDir,'ios-content.json'),JSON.stringify({schema:1,gameUpdatesEnabled:false,activeSnapshotId:'ios-builtin-'+result.sha256,bootHealthy:true,active,job:{state:'idle'}}));
console.log(JSON.stringify({platform:'ios',gameCount:Object.keys(games).length,fileCount:result.fileCount+1,totalBytes:result.totalBytes,sourceSha256:result.sha256},null,2));
