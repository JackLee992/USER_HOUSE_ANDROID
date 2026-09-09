package io.github.jacklee992.wanba;

import android.content.Context;
import org.json.JSONObject;
import java.util.function.Consumer;

/** Fixed optional-module entry. No class, method, URL, channel or trust comes from web content. */
final class NativeAppUpdateProbe {
    static AutoCloseable check(Context context,Consumer<JSONObject> reply){
        java.util.concurrent.atomic.AtomicBoolean completed=new java.util.concurrent.atomic.AtomicBoolean();Consumer<JSONObject> once=value->{if(completed.compareAndSet(false,true))reply.accept(value);};
        if(!BuildConfig.WANBA_APP_UPDATER){once.accept(null);return ()->{};}
        try{return (AutoCloseable)Class.forName("io.github.jacklee992.wanba.appupdater.AppUpdateProbe")
                .getMethod("check",Context.class,Consumer.class).invoke(null,context.getApplicationContext(),once);}
        catch(Exception unavailable){once.accept(null);return ()->{};}
    }
}
