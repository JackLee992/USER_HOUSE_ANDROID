package io.github.jacklee992.wanba.appupdater;

import org.junit.Test;
import static org.junit.Assert.*;

public final class UpdaterLabelsTest {
    @Test public void localeInputCannotSelectAnythingOutsideFivePresentationLocales(){
        for(String invalid:new String[]{null,"en-US","../../en","https://example.com","EN",""})assertEquals("zh-CN",UpdaterLabels.normalize(invalid));
        for(String locale:new String[]{"zh-CN","zh-TW","en","ja","ko"}){
            UpdaterLabels labels=new UpdaterLabels(locale);assertEquals(locale,labels.locale);
            for(String key:new String[]{"App 更新","检查 App 更新","下载更新","安装已验证 APK","取消下载","返回"})assertFalse(labels.text(key).isEmpty());
        }
    }
    @Test public void translatedProgressPreservesVersionSizeAndActualBytes(){
        for(String locale:new String[]{"zh-TW","en","ja","ko"}){
            UpdaterLabels labels=new UpdaterLabels(locale);
            String available=labels.message("available","发现 App 1.3.0。完整安装包 73.2 MiB；下载时优先使用匹配的增量包。");
            assertTrue(available.contains("1.3.0"));assertTrue(available.contains("73.2"));assertFalse(available.startsWith("发现 App"));
            String progress=labels.message("downloading","下载增量包 45%（10.1 / 22.4 MiB）");assertTrue(progress.contains("45%"));assertTrue(progress.contains("10.1 / 22.4"));
            String summary=labels.message("ready","完整包下载成功：345 字节；补丁尝试 123 字节，累计 468 字节（完整 APK 345 字节；仅计下载响应体）。");
            for(String number:new String[]{"345","123","468"})assertTrue(summary.contains(number));assertFalse(summary.contains("字节"));
        }
    }
    @Test public void unrecognizedTechnicalErrorsRemainVisible(){
        assertTrue(new UpdaterLabels("ja").message("error","Downloaded asset hash mismatch").contains("Downloaded asset hash mismatch"));
    }
}
