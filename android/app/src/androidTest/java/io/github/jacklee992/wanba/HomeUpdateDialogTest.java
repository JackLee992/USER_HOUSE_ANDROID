package io.github.jacklee992.wanba;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import androidx.test.platform.app.InstrumentationRegistry;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.Assume;
import java.io.File;
import java.io.FileOutputStream;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BooleanSupplier;
import static org.junit.Assert.*;

/** Device-only UI fixture: no test controls or manifest override are included in release APKs. */
public final class HomeUpdateDialogTest {
    private final Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
    private Object get(Object object,String name)throws Exception{Field field=object.getClass().getDeclaredField(name);field.setAccessible(true);return field.get(object);}
    private void set(Object object,String name,Object value)throws Exception{Field field=object.getClass().getDeclaredField(name);field.setAccessible(true);field.set(object,value);}
    private void onMain(Runnable work){instrumentation.runOnMainSync(work);}
    private void waitFor(BooleanSupplier condition)throws Exception{long end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end){AtomicReference<Boolean> ready=new AtomicReference<>(false);onMain(()->ready.set(condition.getAsBoolean()));if(ready.get())return;Thread.sleep(100);}fail("Timed out waiting for native state");}
    private AlertDialog dialog(NativeShellController controller){try{return (AlertDialog)get(controller,"updateDialog");}catch(Exception e){throw new AssertionError(e);}}
    private void trigger(NativeShellController controller){try{Method method=NativeShellController.class.getDeclaredMethod("maybeAutomaticUpdates");method.setAccessible(true);method.invoke(controller);}catch(Exception e){throw new AssertionError(e);}}
    private void screenshot(Context context,String name)throws Exception{Thread.sleep(250);Bitmap bitmap=instrumentation.getUiAutomation().takeScreenshot();assertNotNull(bitmap);File folder=new File(context.getExternalFilesDir(null),"qa-native-home");assertTrue(folder.isDirectory()||folder.mkdirs());try(FileOutputStream out=new FileOutputStream(new File(folder,name+".png"))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();}
    @Test public void deferredMergedPromptAndNativeUpdaterEntry()throws Exception{
        Assume.assumeTrue(BuildConfig.WANBA_APP_UPDATER);
        Context target=instrumentation.getTargetContext();
        Activity activity=instrumentation.startActivitySync(new Intent(target,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        AtomicReference<NativeShellController> reference=new AtomicReference<>();
        waitFor(()->{try{NativeShellController shell=(NativeShellController)get(activity,"nativeShell");if(shell!=null&&shell.isHome()){reference.set(shell);return true;}return false;}catch(Exception e){return false;}});
        NativeShellController controller=reference.get();onMain(()->controller.tab("single"));waitFor(()->{try{return "single".equals(((JSONObject)get(controller,"state")).optString("tab"))&&!((Boolean)get(controller,"busy"));}catch(Exception e){return false;}});
        // Let the real bridge's post-mutation catalog response settle before injecting fixture metadata.
        instrumentation.waitForIdleSync();Thread.sleep(750);instrumentation.waitForIdleSync();
        HomeUpdatePolicy original=(HomeUpdatePolicy)get(controller,"updatePolicy");JSONObject state=(JSONObject)get(controller,"state");
        android.content.SharedPreferences prefs=target.getSharedPreferences("wanba_home_update_notices",Context.MODE_PRIVATE);
        Set<String> originalShown=new HashSet<>(prefs.getStringSet("shown",Collections.emptySet()));long originalDay=prefs.getLong("shownDay",0);
        HomeUpdatePolicy fixture=new HomeUpdatePolicy(0,Collections.emptySet());fixture.begin(System.currentTimeMillis(),true,true);fixture.content(fixture.run(),"fixture-content","9.9.1");fixture.app(fixture.run(),"99991","9.9.2");
        try{
            onMain(()->{try{set(controller,"updatePolicy",fixture);set(controller,"filePicker",true);trigger(controller);assertNull(dialog(controller));set(controller,"filePicker",false);JSONObject game=new JSONObject(state.toString());game.put("game","snake");set(controller,"state",game);trigger(controller);assertNull(dialog(controller));set(controller,"state",state);controller.foreground(false);trigger(controller);assertNull(dialog(controller));controller.foreground(true);}catch(Exception e){throw new AssertionError(e);}});
            waitFor(()->dialog(controller)!=null&&dialog(controller).isShowing());assertEquals(2,fixture.pending(true).size());
            onMain(()->{assertNotNull(dialog(controller).getListView());assertEquals(2,dialog(controller).getListView().getAdapter().getCount());assertTrue(dialog(controller).getListView().getAdapter().getItem(0).toString().contains("9.9.1"));assertTrue(dialog(controller).getListView().getAdapter().getItem(1).toString().contains("9.9.2"));});
            screenshot(target,"controlled-combined-update-prompt");
            onMain(()->controller.foreground(false));waitFor(()->dialog(controller)==null);
            onMain(()->{assertEquals(2,fixture.pending(true).size());controller.foreground(true);});
            waitFor(()->dialog(controller)!=null&&dialog(controller).isShowing());
            onMain(()->dialog(controller).getButton(AlertDialog.BUTTON_NEGATIVE).performClick());waitFor(()->dialog(controller)==null);assertTrue(fixture.pending(true).isEmpty());onMain(()->trigger(controller));assertNull(dialog(controller));
            fixture.begin(System.currentTimeMillis()+HomeUpdatePolicy.INTERVAL_MS,true,false);fixture.content(fixture.run(),"fixture-content-2","9.9.3");
            onMain(()->trigger(controller));waitFor(()->dialog(controller)!=null);screenshot(target,"controlled-content-update-prompt");
            onMain(()->dialog(controller).getButton(AlertDialog.BUTTON_POSITIVE).performClick());waitFor(()->{try{return "settings".equals(((JSONObject)get(controller,"state")).optString("tab"));}catch(Exception e){return false;}});
            // A native entry opens the actual optional Activity; no download or installation is requested.
            Instrumentation.ActivityMonitor monitor=instrumentation.addMonitor("io.github.jacklee992.wanba.appupdater.AppUpdateActivity",null,false);
            onMain(controller::appUpdater);Activity updater=instrumentation.waitForMonitorWithTimeout(monitor,5000);assertNotNull(updater);waitFor(updater::hasWindowFocus);Thread.sleep(500);screenshot(target,"native-app-updater-entry");onMain(updater::finish);instrumentation.removeMonitor(monitor);
        }finally{
            onMain(()->{try{if(dialog(controller)!=null)dialog(controller).dismiss();set(controller,"updatePolicy",original);set(controller,"state",state);set(controller,"filePicker",false);controller.foreground(true);controller.tab("single");}catch(Exception e){throw new AssertionError(e);}});
            prefs.edit().putStringSet("shown",originalShown).putLong("shownDay",originalDay).commit();
        }
    }
}
