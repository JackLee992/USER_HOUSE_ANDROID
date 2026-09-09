import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

const jdk=process.env.JAVA_HOME||'/Applications/Android Studio.app/Contents/jbr/Contents/Home';
function method(source,name) {
  const match=new RegExp(`(?:@JavascriptInterface\\s+)?(?:public|private) (?:void|boolean) ${name}\\([^)]*\\)\\s*\\{`).exec(source);
  assert.ok(match,`actual Java method ${name} exists`);
  let depth=1,index=match.index+match[0].length,quote=null,comment=null;
  for(;index<source.length&&depth;index++){
    const c=source[index],next=source[index+1];
    if(comment==='line'){if(c==='\n')comment=null;continue;}
    if(comment==='block'){if(c==='*'&&next==='/'){comment=null;index++;}continue;}
    if(quote){if(c==='\\')index++;else if(c===quote)quote=null;continue;}
    if(c==='/'&&next==='/'){comment='line';index++;continue;}
    if(c==='/'&&next==='*'){comment='block';index++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='{')depth++;else if(c==='}')depth--;
  }
  assert.equal(depth,0);return source.slice(match.index,index);
}

test('unsupported WebView prompt gates its compatibility download control and direct intent',async()=>{
  const source=await readFile(new URL('../../main/java/io/github/jacklee992/wanba/MainActivity.java',import.meta.url),'utf8');
  const prompt=method(source,'showWebViewCompatibilityPrompt');
  assert.match(prompt,/boolean allowDownloads = BuildConfig\.WANBA_GAME_UPDATES \|\| BuildConfig\.WANBA_APP_UPDATER;/);
  assert.match(prompt,/if \(allowDownloads\) \{\s*Button compatibility/,'download button only exists in an enabled build');
  assert.match(prompt,/if \(!\(BuildConfig\.WANBA_GAME_UPDATES \|\| BuildConfig\.WANBA_APP_UPDATER\)\) return;\s*try \{ startActivity/,'direct intent has its own flag guard');
  assert.match(prompt,/allowDownloads \? "可安装自带内核/,'OFF prompt does not recommend a hidden APK download');
});

test('actual native download/updater methods require their flag and a still-trusted foreground at delivery',async()=>{
  const root=await mkdtemp(join(tmpdir(),'wanba-native-update-gates-'));
  try {
    const system=await readFile(new URL('../../main/java/io/github/jacklee992/wanba/MainActivity.java',import.meta.url),'utf8');
    const compat=await readFile(new URL('../java/io/github/jacklee992/wanba/CompatActivity.java',import.meta.url),'utf8');
    const methods=source=>['isTrustedForeground','openDownloads','openAppUpdater'].map(name=>method(source,name)).join('\n');
    const java=`import java.util.*;
@interface JavascriptInterface {}
final class BuildConfig { static boolean WANBA_GAME_UPDATES,WANBA_APP_UPDATER; }
final class LocalAssetPolicy { static final String DOWNLOADS="https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/latest"; }
final class ActivityNotFoundException extends RuntimeException {}
final class Uri { static String parse(String value){return value;} }
final class Intent {
 static final String ACTION_VIEW="VIEW",CATEGORY_BROWSABLE="BROWSABLE";
 final Map<String,String> extras=new HashMap<>();String action,url,target;Intent(){} Intent(String action,String url){this.action=action;this.url=url;}
 Intent addCategory(String category){return this;} Intent setClassName(String host,String value){target=value;return this;} Intent putExtra(String key,String value){extras.put(key,value);return this;}
}
final class NativeShell {String locale(){return "ja";}}
final class View {String url="trusted";String getUrl(){return url;}}
final class Content {boolean isTrustedEntry(String url){return "trusted".equals(url);}}
final class Queue {final List<Runnable> pending=new ArrayList<>();void post(Runnable task){pending.add(task);}void flush(){for(Runnable r:new ArrayList<>(pending))r.run();pending.clear();}}
abstract class Host {
 boolean destroyed,activityPaused,trustedDocument=true;Object session=new Object(),bridgePort=new Object();View webView=new View();Content contentUpdates=new Content();
 NativeShell nativeShell=new NativeShell();final Queue main=new Queue();final List<Intent> started=new ArrayList<>();
 void startActivity(Intent intent){started.add(intent);}void toast(String text){}String getPackageName(){return "test.wanba";}
 abstract void invoke();
}
final class SystemHost extends Host {
 ${methods(system)}
 void invoke(){openDownloads();openAppUpdater();}
}
final class CompatHost extends Host {
 ${methods(compat)}
 void invoke(){openDownloads();openAppUpdater();}
}
public class NativeUpdateBoundary {
 static int checks;static void check(boolean value,String label){checks++;if(!value)throw new AssertionError(label);}
 static Host host(boolean compat){return compat?new CompatHost():new SystemHost();}
 public static void main(String[] args){
  for(boolean compat:new boolean[]{false,true})for(boolean games:new boolean[]{false,true})for(boolean updater:new boolean[]{false,true}){
   BuildConfig.WANBA_GAME_UPDATES=games;BuildConfig.WANBA_APP_UPDATER=updater;
   Host valid=host(compat);valid.invoke();check(valid.started.isEmpty(),"UI starts only on main dispatch");valid.main.flush();
   check(valid.started.size()==((games||updater)?1:0)+(updater?1:0),"flags control both actual native actions");
   if(games||updater)check(LocalAssetPolicy.DOWNLOADS.equals(valid.started.get(0).url),"download URI is fixed");
   if(updater){Intent entry=valid.started.get(valid.started.size()-1);check("io.github.jacklee992.wanba.appupdater.AppUpdateActivity".equals(entry.target),"optional entry is fixed native activity");check(entry.extras.size()==1&&"ja".equals(entry.extras.get("wanba.locale")),"only the native shell presentation locale is forwarded, never URL/channel/trust");
    Host fallback=host(compat);fallback.nativeShell=null;fallback.invoke();fallback.main.flush();check("zh-CN".equals(fallback.started.get(fallback.started.size()-1).extras.get("wanba.locale")),"old cores safely default presentation locale");}
   for(int failure=0;failure<5;failure++){
    Host blocked=host(compat);if(failure==0)blocked.destroyed=true;if(failure==1)blocked.activityPaused=true;if(failure==2)blocked.trustedDocument=false;
    if(failure==3){if(compat)blocked.session=null;else blocked.webView=null;}
    if(failure==4){if(compat)blocked.bridgePort=null;else blocked.webView.url="untrusted";}
    blocked.invoke();blocked.main.flush();check(blocked.started.isEmpty(),"untrusted or inactive native entry rejected");
   }
   Host raced=host(compat);raced.invoke();raced.activityPaused=true;raced.main.flush();check(raced.started.isEmpty(),"foreground is rechecked after posting, not only before");
  }
  System.out.println("PASS "+checks+" actual Java native update boundary assertions");
 }
}`;
    const file=join(root,'NativeUpdateBoundary.java');await writeFile(file,java);
    execFileSync(join(jdk,'bin/javac'),['-d',root,file],{encoding:'utf8'});
    const result=execFileSync(join(jdk,'bin/java'),['-cp',root,'NativeUpdateBoundary'],{encoding:'utf8'});
    assert.match(result,/PASS \d+ actual Java native update boundary assertions/);process.stdout.write(result);
  } finally {await rm(root,{recursive:true,force:true});}
});
