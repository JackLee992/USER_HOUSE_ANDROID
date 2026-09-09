#!/usr/bin/env node
// Offline-only publishing artifacts. Does not publish, sign an APK, or read private keys unless --key is explicit.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,createPrivateKey,createPublicKey,sign,verify} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {resolve,join,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const REPOSITORY='JackLee992/USER_HOUSE_ANDROID';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
const MAX_APK=512*1024*1024,MAX_OPS=65536,MAGIC=Buffer.from('WAUPD001');
const repo=resolve(fileURLToPath(new URL('../..',import.meta.url)));
function require(ok,message){if(!ok)throw Error(message);}

// Read only central-directory metadata. Compressed entry bytes are copied verbatim;
// APK signing blocks, ZIP metadata and changed files are emitted as literal bytes.
function entries(apk){
  let end=-1;for(let i=apk.length-22;i>=Math.max(0,apk.length-65557);i--)if(apk.readUInt32LE(i)===0x06054b50&&i+22+apk.readUInt16LE(i+20)===apk.length){end=i;break;}
  require(end>=0,'ZIP end missing');require(apk.readUInt16LE(end+4)===0&&apk.readUInt16LE(end+6)===0,'Multidisk ZIP not supported');
  const count=apk.readUInt16LE(end+10),start=apk.readUInt32LE(end+16),size=apk.readUInt32LE(end+12);
  require(count<65535&&start+size===end,'ZIP64 or malformed central directory');
  const list=[];let p=start;const names=new Set();
  for(let n=0;n<count;n++){
    require(p+46<=end&&apk.readUInt32LE(p)===0x02014b50,'Bad central entry');
    const nameLength=apk.readUInt16LE(p+28),extra=apk.readUInt16LE(p+30),comment=apk.readUInt16LE(p+32),length=apk.readUInt32LE(p+20),local=apk.readUInt32LE(p+42);
    require(p+46+nameLength+extra+comment<=end&&local+30<=start&&apk.readUInt32LE(local)===0x04034b50,'Invalid entry bounds');
    const name=apk.subarray(p+46,p+46+nameLength).toString('utf8');require(!names.has(name),'Duplicate ZIP entry');names.add(name);
    const data=local+30+apk.readUInt16LE(local+26)+apk.readUInt16LE(local+28);require(length!==0xffffffff&&data+length<=start,'Entry outside APK data');
    list.push({name,offset:data,length});p+=46+nameLength+extra+comment;
  }
  require(p===end,'Unexpected central bytes');return list.sort((a,b)=>a.offset-b.offset);
}
export function makeDelta(oldApk,newApk){
  require(oldApk.length>0&&newApk.length>0&&oldApk.length<=MAX_APK&&newApk.length<=MAX_APK,'APK size limit');
  const originals=new Map(entries(oldApk).map(e=>[e.name,e]));
  const header=Buffer.alloc(16);MAGIC.copy(header);header.writeBigInt64BE(BigInt(newApk.length),8);
  const parts=[header];let cursor=0,operations=0,copied=0;
  const add=bytes=>{if(!bytes.length)return;const h=Buffer.alloc(5);h[0]=2;h.writeInt32BE(bytes.length,1);parts.push(h,bytes);operations++;};
  for(const next of entries(newApk)){
    const prior=originals.get(next.name);
    if(!prior||next.length<64||next.length!==prior.length||!oldApk.subarray(prior.offset,prior.offset+prior.length).equals(newApk.subarray(next.offset,next.offset+next.length)))continue;
    require(next.offset>=cursor,'Overlapping entries');add(newApk.subarray(cursor,next.offset));
    const copy=Buffer.alloc(13);copy[0]=1;copy.writeBigInt64BE(BigInt(prior.offset),1);copy.writeInt32BE(next.length,9);parts.push(copy);operations++;copied+=next.length;cursor=next.offset+next.length;
  }
  add(newApk.subarray(cursor));require(operations<=MAX_OPS,'Patch operation limit');parts.push(Buffer.from([0]));
  return {patch:Buffer.concat(parts),operations,copiedBytes:copied};
}
export function applyDelta(oldApk,patch){
  require(patch.length>=17&&patch.subarray(0,8).equals(MAGIC),'Patch magic');
  const size=Number(patch.readBigInt64BE(8));require(Number.isSafeInteger(size)&&size>0&&size<=MAX_APK,'Patch output limit');
  const out=Buffer.alloc(size);let p=16,written=0,ops=0;
  while(true){
    require(p<patch.length&&ops++<=MAX_OPS,'Truncated patch / operation limit');const kind=patch[p++];
    if(kind===0){require(p===patch.length&&written===size,'Trailing bytes / wrong size');return out;}
    require((kind===1||kind===2)&&p+(kind===1?12:4)<=patch.length,'Invalid operation');
    let offset=0;if(kind===1){offset=Number(patch.readBigInt64BE(p));p+=8;}
    const n=patch.readInt32BE(p);p+=4;require(n>0&&n<=size-written,'Output overflow');
    if(kind===1){require(Number.isSafeInteger(offset)&&offset>=0&&offset+n<=oldApk.length,'Base range');oldApk.copy(out,written,offset,offset+n);}
    else{require(p+n<=patch.length,'Truncated literal');patch.copy(out,written,p,p+n);p+=n;}
    written+=n;
  }
}

export function inspectApk(path,{buildTools,jdk}={}){
  buildTools ||= process.env.ANDROID_BUILD_TOOLS;require(buildTools,'Set ANDROID_BUILD_TOOLS to an Android SDK build-tools directory');
  const env={...process.env};if(jdk||process.env.JAVA_HOME)env.JAVA_HOME=jdk||process.env.JAVA_HOME;
  const result=execFileSync(join(buildTools,'apksigner'),['verify','--verbose','--print-certs',path],{encoding:'utf8',env});
  require(/Verified using v[23] scheme[^\n]*: true/.test(result),'APK v2/v3 signature required');
  const signers=[...new Set([...result.matchAll(/certificate SHA-256 digest: ([a-f0-9]{64})/g)].map(m=>m[1]))];
  require(/Number of signers: 1\b/.test(result)&&signers.length===1,'Single APK signer required');
  const badging=execFileSync(join(buildTools,'aapt2'),['dump','badging',path],{encoding:'utf8',env});
  const p=/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/.exec(badging),sdk=/(?:minSdkVersion|sdkVersion):'(\d+)'/.exec(badging);
  require(p&&sdk&&!badging.includes('application-debuggable')&&!badging.includes('testOnly'),'Production APK metadata required');
  return {packageName:p[1],versionCode:Number(p[2]),versionName:p[3],minSdk:Number(sdk[1]),signerSha256:signers[0]};
}

export async function buildUpdate({config,output,key,tag,buildTools,jdk,previous}){
  require(/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(tag),'Release tag required');
  const spec=JSON.parse(await readFile(config,'utf8'));
  require(Number.isSafeInteger(spec.sequence)&&spec.sequence>0&&spec.sequence<=2147483647,'Sequence required');
  require(Array.isArray(spec.apps)&&spec.apps.length>=1&&spec.apps.length<=2,'One or two APKs required');
  const privateKey=createPrivateKey(await readFile(key));require(privateKey.asymmetricKeyType==='ec'&&privateKey.asymmetricKeyDetails.namedCurve==='prime256v1','P-256 key required');
  const trust=await readFile(join(repo,'android/app-updater/src/main/assets/app-updater/public-key.der'));
  require(createPublicKey(privateKey).export({format:'der',type:'spki'}).equals(trust),'Private key does not match compiled public trust');
  let prior=null;
  require(spec.sequence===1||previous,'Sequences after 1 require --previous signed manifest');
  if(previous){
    const bytes=await readFile(previous);require(bytes.length<=131072,'Previous manifest too large');const outer=JSON.parse(bytes);
    const payload=Buffer.from(outer.payload,'base64');require(outer.schema===1&&verify('sha256',payload,createPublicKey(privateKey),Buffer.from(outer.signature,'base64')),'Previous manifest signature rejected');
    prior=JSON.parse(payload);require(prior.kind==='wanba-apk-update'&&prior.repository===REPOSITORY&&spec.sequence>prior.sequence,'Release sequence must increase');
  }
  await mkdir(output,{recursive:true});const apps=[],reports=[];
  const url=name=>`https://github.com/${REPOSITORY}/releases/download/${tag}/${name}`;
  for(const item of spec.apps){
    const apkPath=resolve(item.apk),apk=await readFile(apkPath),metadata=inspectApk(apkPath,{buildTools,jdk});
    require(['io.github.jacklee992.wanba','io.github.jacklee992.wanba.compat'].includes(metadata.packageName)&&!apps.some(a=>a.packageName===metadata.packageName),'Unknown/duplicate package');
    require(apk.length<=MAX_APK&&metadata.minSdk>=26,'APK bounds');
    const flavor=metadata.packageName.endsWith('.compat')?'compat':'system',name=`wanba-${flavor}-${metadata.versionName}.apk`;
    require(/^[A-Za-z0-9._-]+$/.test(name),'Invalid APK filename');await writeFile(join(output,name),apk,{flag:'wx'});
    const entry={...metadata,full:{url:url(name),sha256:sha256(apk),size:apk.length},deltas:[]};
    const previousEntry=prior?.apps.find(a=>a.packageName===entry.packageName);
    if(previousEntry)require(entry.versionCode>previousEntry.versionCode||(entry.versionCode===previousEntry.versionCode&&entry.full.sha256===previousEntry.full.sha256),'APK version must increase when its bytes change');
    require(!item.oldApks||item.oldApks.length<=3,'At most three base APKs');
    for(const oldPath of item.oldApks||[]){
      const old=await readFile(oldPath),oldMeta=inspectApk(oldPath,{buildTools,jdk});
      require(oldMeta.packageName===metadata.packageName&&oldMeta.signerSha256===metadata.signerSha256&&oldMeta.versionCode<metadata.versionCode,'Old APK package/signer/version mismatch');
      const {patch,operations,copiedBytes}=makeDelta(old,apk);require(applyDelta(old,patch).equals(apk),'Reconstruction mismatch');
      const patchName=`wanba-${flavor}-${oldMeta.versionCode}-to-${metadata.versionCode}.waup`;
      const useful=patch.length<apk.length*0.9&&patch.length<=256*1024*1024;
      if(useful){await writeFile(join(output,patchName),patch,{flag:'wx'});entry.deltas.push({format:'copy-add-v1',baseVersionCode:oldMeta.versionCode,baseSha256:sha256(old),url:url(patchName),sha256:sha256(patch),size:patch.length});}
      reports.push({flavor,baseVersionCode:oldMeta.versionCode,targetVersionCode:metadata.versionCode,fullBytes:apk.length,patchBytes:patch.length,copiedBytes,operations,publishedInManifest:useful,reconstructedSha256:sha256(apk)});
    }
    apps.push(entry);
  }
  const issuedAt=spec.issuedAt??Math.floor(Date.now()/1000),expiresAt=spec.expiresAt??issuedAt+30*86400;
  require(Number.isSafeInteger(issuedAt)&&Number.isSafeInteger(expiresAt)&&issuedAt>0&&expiresAt>issuedAt&&expiresAt-issuedAt<=31*86400,'Invalid manifest lifetime');
  const payload=Buffer.from(JSON.stringify({schema:1,kind:'wanba-apk-update',repository:REPOSITORY,sequence:spec.sequence,issuedAt,expiresAt,apps}));
  const envelope=JSON.stringify({schema:1,payload:payload.toString('base64'),signature:sign('sha256',payload,privateKey).toString('base64')})+'\n';
  require(Buffer.byteLength(envelope)<=131072,'Manifest size limit');
  await writeFile(join(output,'app-updates.json'),envelope,{flag:'wx'});await writeFile(join(output,'build-report.json'),JSON.stringify({repository:REPOSITORY,tag,reports},null,2)+'\n',{flag:'wx'});
  return {output,reports};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),options={};for(let n=0;n<args.length;n+=2){const key=args[n].replace(/^--/,'');require(['config','output','key','tag','buildTools','jdk','previous'].includes(key)&&args[n+1],'Unknown/incomplete option');options[key]=args[n+1];}
  require(options.config&&options.output&&options.key&&options.tag,'Require --config --output --key --tag');console.log(JSON.stringify(await buildUpdate(options),null,2));
}
