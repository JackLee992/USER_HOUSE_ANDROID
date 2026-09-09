package io.github.jacklee992.wanba;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Pure scheduling policy. Results carry only verified version metadata, never update URLs. */
final class HomeUpdatePolicy {
    static final long INTERVAL_MS=180_000;
    static final class Update {
        final String kind,key,version;
        Update(String kind,String key,String version){this.kind=kind;this.key=key;this.version=version;}
    }
    private long lastCheck,run;
    private boolean contentWaiting,appWaiting;
    private Update content,app;
    private final LinkedHashSet<String> shown;
    HomeUpdatePolicy(long lastCheck,Set<String> shown){this.lastCheck=lastCheck;this.shown=new LinkedHashSet<>(shown);}
    boolean begin(long now,boolean contentEnabled,boolean appEnabled){
        if(checking()||(!contentEnabled&&!appEnabled))return false;
        long elapsed=now-lastCheck;if(lastCheck>0&&elapsed>=0&&elapsed<INTERVAL_MS)return false;
        lastCheck=now;run++;contentWaiting=contentEnabled;appWaiting=appEnabled;content=null;app=null;return true;
    }
    long run(){return run;} long lastCheck(){return lastCheck;}
    boolean checking(){return contentWaiting||appWaiting;}
    void content(long token,String key,String version){if(token!=run||!contentWaiting)return;contentWaiting=false;content=update("content",key,version);}
    void app(long token,String key,String version){if(token!=run||!appWaiting)return;appWaiting=false;app=update("app",key,version);}
    void timeout(long token){if(token!=run)return;contentWaiting=false;appWaiting=false;}
    private Update update(String kind,String key,String version){return key==null||key.isEmpty()||version==null||version.isEmpty()?null:new Update(kind,kind+":"+key,version);}
    List<Update> pending(boolean eligible){List<Update> result=new ArrayList<>();if(!eligible||checking())return result;if(content!=null&&!shown.contains(content.key))result.add(content);if(app!=null&&!shown.contains(app.key))result.add(app);return result;}
    void clearShown(){shown.clear();}
    void clearContentUnless(String snapshot){if(content!=null&&!content.key.equals("content:"+snapshot))content=null;}
    void shown(List<Update> values){for(Update value:values)shown.add(value.key);while(shown.size()>32)shown.remove(shown.iterator().next());}
    Set<String> shown(){return new LinkedHashSet<>(shown);}
}
