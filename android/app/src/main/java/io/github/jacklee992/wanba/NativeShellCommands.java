package io.github.jacklee992.wanba;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Set;

/** Native-to-page commands have a fixed allowlist; arguments are JSON, never executable source. */
final class NativeShellCommands {
    static final Set<String> ALLOWED = java.util.Collections.unmodifiableSet(new java.util.HashSet<>(java.util.Arrays.asList("catalog", "setCatalog", "launch", "openShellTab", "setLocale", "setPerformance",
            "setRememberWindow", "exportBackup", "backupData", "validateBackup", "importBackup", "checkpoint")));
    static String script(String id, String operation, JSONArray args) {
        if (!ALLOWED.contains(operation)) throw new IllegalArgumentException("Unknown native shell operation");
        return "(()=>{const id=" + JSONObject.quote(id) + ",op=" + JSONObject.quote(operation) + ",args=" + args
                + ";const reply=v=>window.NativeBridge.onShellReply(id,JSON.stringify(v));const a=window.wanbaApp;"
                + "if(!a||typeof a[op]!=='function'){reply({ok:false,error:'Native shell API unavailable'});return;}"
                + "Promise.resolve().then(()=>a[op](...args)).then(value=>reply({ok:true,value:value??null}),e=>reply({ok:false,error:String(e?.message||e)}));})()";
    }
    static final String PROBE = "(()=>{const check=()=>{const a=window.wanbaApp;if(!a)return;if(typeof a.catalog==='function')window.NativeBridge.onShellState(JSON.stringify(a.catalog()));else window.NativeBridge.onShellUnavailable();};window.addEventListener('wanba-app-ready',check,{once:true});check();})()";
    private NativeShellCommands() { }
}
