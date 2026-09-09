package io.github.jacklee992.wanba;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

/** Keeps native navigation, SAF and update UI over one persistent, authoritative game engine. */
final class NativeShellController implements AutoCloseable, NativeCatalogView.Actions {
    interface Engine { void call(String operation, JSONArray arguments, Consumer<JSONObject> callback); void downloads(); void appUpdater(); }
    static final int IMPORT_BACKUP = 6140;
    private final Activity activity;
    private final Engine engine;
    private final View engineView;
    private final ContentUpdateManager updates;
    private final NativeCatalogView view;
    private final NativeIconLoader icons;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private JSONObject state = new JSONObject();
    private boolean closed, ready, busy;
    private String resourcePrefix = "www/";
    private long generation;
    private AlertDialog dialog, updateDialog;
    private final android.content.SharedPreferences updatePrefs;
    private final HomeUpdatePolicy updatePolicy;
    private boolean foreground, filePicker;
    private String contentCheckJob="";
    private long noticeDay;
    private AutoCloseable appProbe;
    private final Runnable automaticUpdateCheck=this::maybeAutomaticUpdates;


    NativeShellController(Activity activity, FrameLayout frame, View engineView, ContentUpdateManager updates, Engine engine) {
        this.activity=activity;this.engine=engine;this.engineView=engineView;this.updates=updates;
        updatePrefs=activity.getSharedPreferences("wanba_home_update_notices",android.content.Context.MODE_PRIVATE);
        noticeDay=java.time.LocalDate.now().toEpochDay();
        updatePolicy=new HomeUpdatePolicy(updatePrefs.getLong("lastCheck",0),updatePrefs.getLong("shownDay",0)==noticeDay?updatePrefs.getStringSet("shown",java.util.Collections.emptySet()):java.util.Collections.emptySet());
        foreground=activity.hasWindowFocus();
        icons=new NativeIconLoader(updates::openResource);view=new NativeCatalogView(activity,icons,this);
        frame.addView(view,new FrameLayout.LayoutParams(-1,-1));view.showLoading();engineView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
    }
    void loading(String entry){
        if(closed)return;ready=false;busy=false;long token=++generation;icons.setEntry(entry);
        if(entry!=null&&entry.startsWith("/assets/")&&entry.endsWith("standalone/index.html"))resourcePrefix=entry.substring(8,entry.length()-"standalone/index.html".length());
        view.showLoading();engineView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        // Old signed cores remain usable, including their normal update and rollback controls.
        main.postDelayed(()->{if(!closed&&!ready&&generation==token)unavailable();},15000);
    }
    void unavailable(){if(closed||ready)return;view.setVisibility(View.GONE);engineView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);}
    void acceptState(String json){
        if(closed||json==null||json.length()>512*1024)return;
        try{JSONObject next=new JSONObject(json);if(next.optInt("schema")!=1||next.optJSONArray("games")==null||next.optJSONObject("preferences")==null)return;
            state=next;ready=true;view.setCatalog(next);view.setPending(busy);refreshUpdates();
            boolean game=!next.isNull("game")&&!next.optString("game","").isEmpty();
            view.setVisibility(game?View.GONE:View.VISIBLE);engineView.setImportantForAccessibility(game?View.IMPORTANT_FOR_ACCESSIBILITY_AUTO:View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
        }catch(Exception ignored){/* Malformed bridge state never changes engine storage or its current page. */}
    }
    boolean handleBack(){if(!ready||view.getVisibility()!=View.VISIBLE)return false;if(!"single".equals(state.optString("tab"))){tab("single");return true;}return false;}
    String locale(){String locale=state.optString("locale","zh-CN");return java.util.Arrays.asList("zh-CN","zh-TW","en","ja","ko").contains(locale)?locale:"zh-CN";}
    boolean isHome(){return ready&&(state.isNull("game")||state.optString("game").isEmpty());}
    void refreshUpdates(){if(!closed)try{JSONObject content=new JSONObject(updates.getContentState());view.setUpdate(content);
        JSONObject job=content.optJSONObject("job");if(updatePolicy.checking()&&job!=null&&contentCheckJob.equals(job.optString("jobId"))&&!java.util.Arrays.asList("starting","checking").contains(job.optString("state"))){
            JSONObject candidate="error".equals(job.optString("state"))?null:content.optJSONObject("candidate");updatePolicy.content(updatePolicy.run(),candidate==null?null:candidate.optString("snapshotId"),candidate==null?null:candidate.optString("snapshotVersion"));contentCheckJob="";
        }JSONObject liveCandidate=content.optJSONObject("candidate");updatePolicy.clearContentUnless(liveCandidate==null?null:liveCandidate.optString("snapshotId"));maybeAutomaticUpdates();
    }catch(Exception ignored){}}
    void backupFinished(){filePicker=false;maybeAutomaticUpdates();}
    void foreground(boolean value){foreground=value;if(!value){main.removeCallbacks(automaticUpdateCheck);if(updateDialog!=null)updateDialog.dismiss();}else main.post(automaticUpdateCheck);}
    private boolean promptAllowed(){return !closed&&ready&&foreground&&!filePicker&&!busy&&isHome()&&java.util.Arrays.asList("single","double").contains(state.optString("tab"))&&(dialog==null||!dialog.isShowing())&&(updateDialog==null||!updateDialog.isShowing())&&view.idle();}
    private void maybeAutomaticUpdates(){
        if(closed)return;
        long today=java.time.LocalDate.now().toEpochDay();if(today!=noticeDay){noticeDay=today;updatePolicy.clearShown();}
        if(!promptAllowed()){if(foreground&&isHome()&&!filePicker&&java.util.Arrays.asList("single","double").contains(state.optString("tab"))&&(dialog==null||!dialog.isShowing())&&(updateDialog==null||!updateDialog.isShowing())&&!updatePolicy.pending(true).isEmpty()){main.removeCallbacks(automaticUpdateCheck);main.postDelayed(automaticUpdateCheck,750);}return;}
        java.util.List<HomeUpdatePolicy.Update> choices=updatePolicy.pending(true);
        if(!choices.isEmpty()){showUpdateChoices(choices);return;}
        if(!updatePolicy.begin(System.currentTimeMillis(),BuildConfig.WANBA_GAME_UPDATES,BuildConfig.WANBA_APP_UPDATER))return;
        updatePrefs.edit().putLong("lastCheck",updatePolicy.lastCheck()).apply();long token=updatePolicy.run();
        main.postDelayed(()->{if(!closed){updatePolicy.timeout(token);maybeAutomaticUpdates();}},30_000);
        if(BuildConfig.WANBA_GAME_UPDATES){try{JSONObject started=new JSONObject(updates.checkGameUpdates());contentCheckJob=started.optString("jobId","");if(contentCheckJob.isEmpty())updatePolicy.content(token,null,null);}catch(Exception offline){updatePolicy.content(token,null,null);}}
        if(BuildConfig.WANBA_APP_UPDATER)appProbe=NativeAppUpdateProbe.check(activity,result->{if(closed)return;String version=result==null?null:result.optString("version");String key=result==null?null:String.valueOf(result.optLong("versionCode"));updatePolicy.app(token,key,version);maybeAutomaticUpdates();});
        maybeAutomaticUpdates();
    }
    private void showUpdateChoices(java.util.List<HomeUpdatePolicy.Update> choices){
        String[] names=new String[choices.size()];for(int i=0;i<names.length;i++){HomeUpdatePolicy.Update item=choices.get(i);names[i]=view.template("content".equals(item.kind)?"gameContentUpdateVersion":"appUpdateVersion",item.version);}
        AlertDialog.Builder builder=new AlertDialog.Builder(activity).setTitle(view.label("发现更新")).setNegativeButton(view.label("稍后"),(d,which)->acknowledgeUpdates(choices));
        if(choices.size()==1)builder.setMessage(names[0]).setPositiveButton(view.label("查看更新"),(d,which)->{acknowledgeUpdates(choices);openUpdateChoice(choices.get(0));});
        else builder.setTitle(view.label("选择要查看的更新")).setItems(names,(d,which)->{acknowledgeUpdates(choices);openUpdateChoice(choices.get(which));});
        updateDialog=builder.create();updateDialog.setOnDismissListener(d->{updateDialog=null;main.removeCallbacks(automaticUpdateCheck);if(foreground)main.postDelayed(automaticUpdateCheck,750);});
        updateDialog.setOnCancelListener(d->acknowledgeUpdates(choices));updateDialog.show();
    }
    private void acknowledgeUpdates(java.util.List<HomeUpdatePolicy.Update> choices){updatePolicy.shown(choices);updatePrefs.edit().putLong("shownDay",noticeDay).putStringSet("shown",updatePolicy.shown()).apply();}
    private void openUpdateChoice(HomeUpdatePolicy.Update value){if("content".equals(value.kind))tab("settings");else engine.appUpdater();}
    private static JSONArray args(Object... values){JSONArray result=new JSONArray();for(Object value:values)result.put(value);return result;}
    private void call(String operation,JSONArray arguments,Consumer<Object> complete){
        if(closed||busy||!ready)return;busy=true;view.setPending(true);long token=generation;
        engine.call(operation,arguments,result->{
            if(closed||token!=generation)return;busy=false;view.setPending(false);
            if(result==null||!result.optBoolean("ok")){filePicker=false;view.setCatalog(state);toast(result==null?"操作未完成，请重试":result.optString("error","操作未完成，请重试"));requestCatalog();return;}
            Object value=result.opt("value");if(value instanceof JSONObject&&!((JSONObject)value).optBoolean("ok",true)){filePicker=false;view.setCatalog(state);toast(((JSONObject)value).optString("error","操作未完成，请重试"));requestCatalog();return;}
            if(complete!=null)complete.accept(value);refreshUpdates();
        });
    }
    private void requestCatalog(){long token=generation;engine.call("catalog",args(),reply->{if(!closed&&token==generation&&reply!=null&&reply.optBoolean("ok")&&reply.opt("value") instanceof JSONObject)acceptState(reply.optJSONObject("value").toString());});}
    @Override public void refresh(){if(closed||busy||!ready){view.stopRefresh();return;}call("catalog",args(),value->{if(value instanceof JSONObject)acceptState(value.toString());view.stopRefresh();});}
    @Override public void tab(String tab){if(!java.util.Arrays.asList("single","double","my","settings").contains(tab))return;call("openShellTab",args(tab),v->requestCatalog());}
    @Override public void launch(String id,String fromTab){call("launch",args(id,fromTab),v->requestCatalog());}
    @Override public void preferences(JSONObject preferences){call("setCatalog",args(preferences),v->requestCatalog());}
    @Override public void preference(String operation,Object value){if(!java.util.Arrays.asList("setLocale","setPerformance","setRememberWindow").contains(operation))return;call(operation,args(value),v->requestCatalog());}
    @Override public void exportBackup(){filePicker=true;call("exportBackup",args(),null);}
    @Override public void importBackup(){
        if(!isHome()||busy)return;
        Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try{filePicker=true;activity.startActivityForResult(pick,IMPORT_BACKUP);}catch(android.content.ActivityNotFoundException error){filePicker=false;toast("未找到系统文件选择器");}
    }
    boolean activityResult(int requestCode,int resultCode,Intent data){
        filePicker=false;
        if(requestCode!=IMPORT_BACKUP)return false;
        if(resultCode!=Activity.RESULT_OK||data==null||data.getData()==null)return true;
        Uri uri=data.getData();if(!"content".equals(uri.getScheme())){toast("请选择系统文件管理器中的文件");return true;}
        files.execute(()->{try(InputStream input=activity.getContentResolver().openInputStream(uri)){
            if(input==null)throw new IllegalArgumentException("无法读取选中的文件");
            String text=new String(ContentResourceStore.read(input,16*1024*1024),StandardCharsets.UTF_8);
            main.post(()->{if(!closed&&isHome())call("validateBackup",args(text),value->{
                if(!(value instanceof JSONObject)||!((JSONObject)value).optBoolean("ok")){toast("备份内容无效");return;}
                dialog=new AlertDialog.Builder(activity).setTitle(view.label("导入备份"))
                        .setMessage(view.label("备份中包含的游戏进度、记录、收藏和排序将覆盖对应的当前数据。写入失败会保留原数据。确定导入吗？"))
                        .setNegativeButton(view.label("取消"),null)
                        .setPositiveButton(view.label("导入备份"),(which,button)->call("importBackup",args(text,true),v->{requestCatalog();toast("游戏备份导入完成");})).create();dialog.show();
            });});
        }catch(Exception error){main.post(()->toast(error instanceof IllegalArgumentException?error.getMessage():"文件读取失败，请重新选择"));}});return true;
    }
    @Override public void checkUpdate(){if(!isHome()||busy)return;updates.checkGameUpdates();refreshUpdates();}
    @Override public void installUpdate(){
        if(!isHome()||busy)return;try{JSONObject content=new JSONObject(updates.getContentState()),candidate=content.optJSONObject("candidate");if(candidate==null)return;String id=candidate.optString("snapshotId");
            if(!content.optBoolean("candidateReady")){updates.downloadGameUpdate(id);refreshUpdates();return;}
            call("checkpoint",args(),value->{if(!(value instanceof JSONObject)||!((JSONObject)value).optBoolean("ok")||!((JSONObject)value).optBoolean("idle")){toast("请先回到首页并保存游戏");return;}updates.activateGameUpdate(id,value.toString());refreshUpdates();});
        }catch(Exception error){toast("操作未完成，请重试");}
    }
    @Override public void rollback(){if(!isHome()||busy)return;dialog=new AlertDialog.Builder(activity).setTitle(view.label("确认回退")).setMessage(view.label("回退到上一版游戏内容，保留当前存档？"))
            .setNegativeButton(view.label("取消"),null).setPositiveButton(view.label("回退内容版本"),(d,which)->call("checkpoint",args(),value->{if(value instanceof JSONObject&&((JSONObject)value).optBoolean("ok")&&((JSONObject)value).optBoolean("idle")){updates.rollbackGameUpdate();refreshUpdates();}})).create();dialog.show();}
    @Override public void downloads(){engine.downloads();}
    @Override public void appUpdater(){engine.appUpdater();}
    @Override public void licenses(){
        String[] names={"SpaceCadetPinball · MIT","Emscripten","SDL 2","SDL 2 Mixer","Open Space Cadet · CC0","Open Space Cadet · Sources","GeckoView · Notices","GeckoView · Sources"};
        String[] paths={"licenses/space-cadet/ENGINE-LICENSE.txt","licenses/space-cadet/EMSCRIPTEN-LICENSE.txt","licenses/space-cadet/SDL2-LICENSE.txt","licenses/space-cadet/SDL2-MIXER-LICENSE.txt","licenses/space-cadet/OPEN-CADET-CC0.txt","licenses/space-cadet/OPEN-CADET-NOTICE.md","standalone/licenses/GeckoView-NOTICES.txt","standalone/licenses/GeckoView-SOURCE.txt"};
        int count="compat".equals(BuildConfig.FLAVOR)?8:6;
        dialog=new AlertDialog.Builder(activity).setTitle(view.label("开源致谢")).setItems(java.util.Arrays.copyOf(names,count),(d,which)->files.execute(()->{
            try(InputStream input=updates.openResource(resourcePrefix+paths[which])){String content=new String(ContentResourceStore.read(input,8*1024*1024),StandardCharsets.UTF_8);main.post(()->{if(closed)return;TextView text=new TextView(activity);text.setText(content);text.setTextSize(12);text.setTextIsSelectable(true);int pad=Math.round(16*activity.getResources().getDisplayMetrics().density);text.setPadding(pad,pad,pad,pad);ScrollView scroll=new ScrollView(activity);scroll.addView(text);dialog=new AlertDialog.Builder(activity).setTitle(names[which]).setView(scroll).setPositiveButton(view.label("关闭"),null).create();dialog.show();});}
            catch(Exception error){main.post(()->toast("文件读取失败，请重新选择"));}
        })).setNegativeButton(view.label("关闭"),null).create();dialog.show();
    }
    private void toast(String message){if(!closed)Toast.makeText(activity,view.label(message==null?"操作未完成，请重试":message),Toast.LENGTH_SHORT).show();}
    @Override public void close(){closed=true;if(updateDialog!=null)updateDialog.dismiss();if(appProbe!=null)try{appProbe.close();}catch(Exception ignored){}generation++;main.removeCallbacksAndMessages(null);if(dialog!=null)dialog.dismiss();icons.close();files.shutdownNow();}
}
