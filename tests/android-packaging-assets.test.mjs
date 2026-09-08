import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareAndroidAssets,LICENSE_FILES} from '../scripts/prepare-android-assets.mjs';

async function fixture(t) {
 const dir=await mkdtemp(join(await realpath(tmpdir()),'wanba-assets-test-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const repoRoot=join(dir,'repo'),outputDir=join(dir,'staging');
 for(const name of ['src','standalone','assets/game-icons','assets/space-cadet','assets/app-brand','tools/space-cadet','assets/pets/cat','docs','tests','.git'])await mkdir(join(repoRoot,name),{recursive:true});
 const files={'src/main.js':'export const title="玩吧";','style.css':'body{color:red}','standalone/index.html':'<html>玩吧</html>','assets/game-icons/card.png':Buffer.from([137,80,78,71]),'assets/space-cadet/game.wasm':Buffer.from([0,97,115,109,1,0,0,0]),'assets/space-cadet/game.data':Buffer.from([255,0,128,65]),'assets/app-brand/app-icon.png':Buffer.from([10,20,30]),'assets/app-brand/master.png':'source','assets/app-brand/render-previews.py':'qa script','assets/app-brand/icon-validation.json':'{}','assets/pets/cat/secret.png':'pet','docs/private.md':'docs','tests/debug.mjs':'test','.git/config':'git'};
 for(const filename of LICENSE_FILES)files['tools/space-cadet/'+filename]='License notice '+filename;
 files['tools/space-cadet/source.patch']='not shipped';
 for(const [name,data] of Object.entries(files))await writeFile(join(repoRoot,name),data);
 return {repoRoot,outputDir,dir,files};
}
test('APK staging uses the exact offline allowlist and preserves JS/WASM/DATA bytes',async t=>{
 const f=await fixture(t),result=await prepareAndroidAssets(f);
 assert.equal(result.fileCount,13);assert.deepEqual(result.files.filter(path=>path.startsWith('assets/app-brand/')),['assets/app-brand/app-icon.png']);assert.equal(result.files.some(path=>path.startsWith('assets/pets/')),false);
 for(const name of result.files)assert.deepEqual(await readFile(join(f.outputDir,name)),await readFile(join(f.repoRoot,name.startsWith('licenses/')?name.replace('licenses/','tools/'):name)));
 assert.deepEqual((await readdir(f.outputDir)).sort(),['.wanba-assets.json','assets','licenses','src','standalone','style.css']);
 assert.equal(result.files.some(path=>path.includes('source.patch')),false);
 const manifest=await readFile(join(f.outputDir,'.wanba-assets.json'),'utf8');assert.equal(manifest.includes(f.repoRoot),false,'APK does not embed the developer workspace path');
});
test('a second packaging pass removes stale generated files and updates changed assets',async t=>{
 const f=await fixture(t);const first=await prepareAndroidAssets(f);await writeFile(join(f.outputDir,'stale.js'),'obsolete');await writeFile(join(f.repoRoot,'src/main.js'),'export const title="新版";');
 const second=await prepareAndroidAssets(f);assert.notEqual(second.sha256,first.sha256);assert.equal((await readdir(f.outputDir)).includes('stale.js'),false);assert.equal(await readFile(join(f.outputDir,'src/main.js'),'utf8'),'export const title="新版";');
});
test('missing entry fails before replacing a previously complete staged application',async t=>{
 const f=await fixture(t);await prepareAndroidAssets(f);const before=await readFile(join(f.outputDir,'standalone/index.html'));await rm(join(f.repoRoot,'standalone/index.html'));
 await assert.rejects(prepareAndroidAssets(f),/Missing standalone\/index.html/);assert.deepEqual(await readFile(join(f.outputDir,'standalone/index.html')),before);
});
test('source symlinks cannot copy files outside the allowlist into the APK',async t=>{
 const f=await fixture(t);await symlink(join(f.repoRoot,'docs/private.md'),join(f.repoRoot,'src/leak.js'));
 await assert.rejects(prepareAndroidAssets(f),/symlinks are not allowed/);
});
test('packaging will not delete source paths or an unowned nonempty output directory',async t=>{
 const f=await fixture(t);
 await assert.rejects(prepareAndroidAssets({...f,outputDir:f.repoRoot}),/must not overlap/);
 await assert.rejects(prepareAndroidAssets({...f,outputDir:join(f.repoRoot,'src/generated')}),/must not overlap/);
 await mkdir(f.outputDir);await writeFile(join(f.outputDir,'personal.txt'),'retain');await assert.rejects(prepareAndroidAssets(f),/unowned/);assert.equal(await readFile(join(f.outputDir,'personal.txt'),'utf8'),'retain');
});
test('symlinked output ancestry is rejected instead of writing through it',async t=>{
 const f=await fixture(t);await mkdir(join(f.dir,'real'));await symlink(join(f.dir,'real'),join(f.dir,'alias'));
 await assert.rejects(prepareAndroidAssets({...f,outputDir:join(f.dir,'alias/www')}),/ancestry/);assert.deepEqual(await readdir(join(f.dir,'real')),[]);
});
