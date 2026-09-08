// Engine selection is explicit. Physical device runs require an explicit ADB_SERIAL.
const driver=await import(process.env.WANBA_ENGINE==='compat'?'./android-gecko.mjs':'./android-cdp.mjs');
export const {connect,adb,screenshot}=driver;
export const activity=driver.activity||'io.github.jacklee992.wanba/.MainActivity';
export const origin=driver.origin||'https://appassets.androidplatform.net';
