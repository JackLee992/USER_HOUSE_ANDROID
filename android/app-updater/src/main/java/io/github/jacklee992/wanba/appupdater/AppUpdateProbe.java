package io.github.jacklee992.wanba.appupdater;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;

/** Read-only release check through the same signature and replay checks as the manual updater. */
public final class AppUpdateProbe {
    public static AutoCloseable check(Context context,Consumer<JSONObject> callback){
        Handler main=new Handler(Looper.getMainLooper());AtomicBoolean completed=new AtomicBoolean();AtomicReference<UpdateController> controller=new AtomicReference<>();
        Runnable[] timeout=new Runnable[1];
        Consumer<JSONObject> finish=result->{if(!completed.compareAndSet(false,true))return;if(timeout[0]!=null)main.removeCallbacks(timeout[0]);try{callback.accept(result);}finally{UpdateController current=controller.get();if(current!=null)current.close();}};
        timeout[0]=()->finish.accept(null);main.postDelayed(timeout[0],25_000);
        try{
            UpdateController current=new UpdateController(context.getApplicationContext(),(state,message)->{
                if("available".equals(state)){UpdateController active=controller.get();finish.accept(active==null?null:active.availableSummary());}
                else if("current".equals(state)||"error".equals(state)||"cancelled".equals(state))finish.accept(null);
            });controller.set(current);current.check();
        }catch(Exception unavailable){finish.accept(null);}
        return ()->main.post(()->finish.accept(null));
    }
}
