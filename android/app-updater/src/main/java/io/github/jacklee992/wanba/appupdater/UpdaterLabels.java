package io.github.jacklee992.wanba.appupdater;

import java.util.HashMap;
import java.util.Map;

/** Presentation only: a locale cannot change a release URL, channel, signer or protocol. */
final class UpdaterLabels {
    private static final String[] LOCALES={"zh-CN","zh-TW","en","ja","ko"};
    private static final Map<String,String[]> WORDS=new HashMap<>();
    static {
        WORDS.put("App 更新",new String[]{"App 更新","App 更新","App update","アプリ更新","앱 업데이트"});
        WORDS.put("从 GitHub 获取已签名的 App 更新。安装需要系统确认。\n游戏内容更新在原设置中管理。",new String[]{"从 GitHub 获取已签名的 App 更新。安装需要系统确认。\n游戏内容更新在原设置中管理。","從 GitHub 取得已簽署的 App 更新。安裝需系統確認。\n遊戲內容更新請在設定中管理。","Get signed app updates from GitHub. Android confirms installation.\nManage game content updates in Settings.","GitHub から署名済みのアプリ更新を取得します。インストールには Android の確認が必要です。\nゲームコンテンツの更新は設定で管理できます。","GitHub에서 서명된 앱 업데이트를 받습니다. 설치는 Android에서 확인합니다.\n게임 콘텐츠 업데이트는 설정에서 관리하세요."});
        WORDS.put("检查 App 更新",new String[]{"检查 App 更新","檢查 App 更新","Check for app updates","アプリ更新を確認","앱 업데이트 확인"});
        WORDS.put("下载更新",new String[]{"下载更新","下載更新","Download update","更新をダウンロード","업데이트 다운로드"});
        WORDS.put("安装已验证 APK",new String[]{"安装已验证 APK","安裝已驗證 APK","Install verified APK","検証済み APK をインストール","검증된 APK 설치"});
        WORDS.put("取消下载",new String[]{"取消下载","取消下載","Cancel download","ダウンロードを中止","다운로드 취소"});
        WORDS.put("返回",new String[]{"返回","返回","Back","戻る","뒤로"});
        WORDS.put("允许安装后请返回，再点“安装已验证 APK”。",new String[]{"允许安装后请返回，再点“安装已验证 APK”。","允許安裝後請返回，再點「安裝已驗證 APK」。","After allowing installation, return and tap Install verified APK.","インストールを許可した後、この画面に戻って「検証済み APK をインストール」を押してください。","설치를 허용한 후 돌아와서 검증된 APK 설치를 누르세요."});
        WORDS.put("Android 已完成 App 安装。",new String[]{"Android 已完成 App 安装。","Android 已完成 App 安裝。","Android finished installing the app.","Android によるアプリのインストールが完了しました。","Android에서 앱 설치를 완료했습니다."});
        WORDS.put("系统安装未完成，当前版本和游戏数据保持不变。可重试。",new String[]{"系统安装未完成，当前版本和游戏数据保持不变。可重试。","系統安裝未完成，目前版本與遊戲資料保持不變。可重試。","Installation did not finish. Your app and game data are unchanged. You can retry.","インストールが完了しませんでした。現在のアプリとゲームデータは変更されていません。再試行できます。","설치가 완료되지 않았습니다. 현재 앱과 게임 데이터는 그대로이며 다시 시도할 수 있습니다."});
        WORDS.put("安装确认尚未完成。若系统提示已关闭，请重新检查并安装。",new String[]{"安装确认尚未完成。若系统提示已关闭，请重新检查并安装。","安裝確認尚未完成。若系統提示已關閉，請重新檢查並安裝。","Installation confirmation is pending. If the Android prompt closed, check and install again.","インストールの確認待ちです。Android の確認画面を閉じた場合は、もう一度更新を確認してインストールしてください。","설치 확인 대기 중입니다. Android 확인 창이 닫혔다면 다시 확인하고 설치하세요."});
        WORDS.put("正在检查 App 版本…",new String[]{"正在检查 App 版本…","正在檢查 App 版本…","Checking the app version…","アプリのバージョンを確認中…","앱 버전 확인 중…"});
        WORDS.put("App 已是最新版本",new String[]{"App 已是最新版本","App 已是最新版本","The app is up to date","アプリは最新です","최신 앱 버전입니다"});
        WORDS.put("正在核对本机旧 APK…",new String[]{"正在核对本机旧 APK…","正在核對本機舊 APK…","Checking the installed APK…","インストール済み APK を確認中…","설치된 APK 확인 중…"});
        WORDS.put("正在重建完整签名 APK…",new String[]{"正在重建完整签名 APK…","正在重建完整簽署 APK…","Reconstructing the signed APK…","署名済み APK を再構築中…","서명된 APK 재구성 중…"});
        WORDS.put("增量包不可用，改为下载完整 APK。",new String[]{"增量包不可用，改为下载完整 APK。","增量包無法使用，改為下載完整 APK。","The delta is unavailable. Downloading the full APK.","差分を使用できないため、完全な APK をダウンロードします。","차등 패키지를 사용할 수 없어 전체 APK를 다운로드합니다."});
        WORDS.put("正在验证完整 APK 签名…",new String[]{"正在验证完整 APK 签名…","正在驗證完整 APK 簽章…","Verifying the APK signature…","APK の署名を検証中…","APK 서명 검증 중…"});
        WORDS.put("安装前再次验证 APK…",new String[]{"安装前再次验证 APK…","安裝前再次驗證 APK…","Verifying the APK again before installation…","インストール前に APK を再検証中…","설치 전 APK 다시 검증 중…"});
        WORDS.put("请先允许此 App 安装未知应用，再点安装",new String[]{"请先允许此 App 安装未知应用，再点安装","請先允許此 App 安裝未知應用，再點安裝","Allow this app to install unknown apps, then tap Install.","このアプリによる不明なアプリのインストールを許可してから、インストールを押してください。","이 앱의 알 수 없는 앱 설치를 허용한 후 설치를 누르세요."});
        WORDS.put("已交给 Android 安装器，请确认系统安装提示。",new String[]{"已交给 Android 安装器，请确认系统安装提示。","已交給 Android 安裝程式，請確認系統安裝提示。","Sent to the Android installer. Confirm the system installation prompt.","Android のインストーラーに送信しました。システムの確認画面で許可してください。","Android 설치 프로그램으로 전달했습니다. 시스템 설치 안내를 확인하세요."});
        WORDS.put("已取消，当前 App 保持不变。",new String[]{"已取消，当前 App 保持不变。","已取消，目前 App 保持不變。","Cancelled. Your installed app is unchanged.","中止しました。インストール済みのアプリは変更されていません。","취소했습니다. 설치된 앱은 변경되지 않았습니다."});
        WORDS.put("APK 验证通过。安装将由 Android 系统再次确认；游戏数据保留。",new String[]{"APK 验证通过。安装将由 Android 系统再次确认；游戏数据保留。","APK 驗證通過。安裝將由 Android 系統再次確認；遊戲資料保留。","APK verified. Android will confirm installation; game data is preserved.","APK の検証が完了しました。Android がインストールを再確認します。ゲームデータは保持されます。","APK 검증 완료. Android에서 설치를 다시 확인하며 게임 데이터는 유지됩니다."});
        WORDS.put("发现 App {version}。完整安装包 {size} MiB；下载时优先使用匹配的增量包。",new String[]{"发现 App {version}。完整安装包 {size} MiB；下载时优先使用匹配的增量包。","發現 App {version}。完整安裝包 {size} MiB；下載時優先使用相符的增量包。","App {version} is available. Full APK: {size} MiB. A matching delta is preferred.","アプリ {version} が利用可能です。完全な APK は {size} MiB です。対応する差分を優先します。","앱 {version}을 사용할 수 있습니다. 전체 APK: {size} MiB. 일치하는 차등 패키지를 우선 사용합니다."});
        WORDS.put("下载增量包",new String[]{"下载增量包","下載增量包","Downloading delta","差分をダウンロード中","차등 패키지 다운로드 중"});
        WORDS.put("下载完整 APK",new String[]{"下载完整 APK","下載完整 APK","Downloading full APK","完全な APK をダウンロード中","전체 APK 다운로드 중"});
        WORDS.put("增量下载成功：",new String[]{"增量下载成功：","增量下載成功：","Delta downloaded: ","差分ダウンロード完了: ","차등 다운로드 완료: "});
        WORDS.put("完整包下载成功：",new String[]{"完整包下载成功：","完整包下載成功：","Full APK downloaded: ","完全な APK のダウンロード完了: ","전체 APK 다운로드 완료: "});
        WORDS.put(" 字节；补丁尝试 ",new String[]{" 字节；补丁尝试 "," 位元組；補丁嘗試 "," bytes; delta attempt: "," バイト、差分の試行: "," 바이트; 차등 시도: "});
        WORDS.put(" 字节，累计 ",new String[]{" 字节，累计 "," 位元組，累計 "," bytes; total: "," バイト、合計: "," 바이트; 합계: "});
        WORDS.put(" 字节；仅计下载响应体",new String[]{" 字节；仅计下载响应体"," 位元組；僅計下載回應本文"," bytes; download response bodies only"," バイト、ダウンロード応答本文のみ"," 바이트; 다운로드 응답 본문만 계산"});
        WORDS.put("（完整 APK ",new String[]{"（完整 APK ","（完整 APK "," (full APK: ","（完全な APK: "," (전체 APK: "});
        WORDS.put(" 字节",new String[]{" 字节"," 位元組"," bytes"," バイト"," 바이트"});
        WORDS.put("更新未完成",new String[]{"更新未完成","更新未完成","Update did not finish","更新が完了しませんでした","업데이트가 완료되지 않았습니다"});
    }
    final String locale; private final int index;
    static String normalize(String locale){for(String value:LOCALES)if(value.equals(locale))return value;return "zh-CN";}
    UpdaterLabels(String requested){locale=normalize(requested);int found=0;for(int i=0;i<LOCALES.length;i++)if(LOCALES[i].equals(locale))found=i;index=found;}
    String text(String source){String[] values=WORDS.get(source);return values==null?source:values[index];}
    String message(String state,String raw){
        if(raw==null)raw="";if(index==0)return raw;if(WORDS.containsKey(raw))return text(raw);
        java.util.regex.Matcher available=java.util.regex.Pattern.compile("^发现 App (.+)。完整安装包 ([0-9.]+) MiB；下载时优先使用匹配的增量包。$").matcher(raw);
        if(available.matches())return text("发现 App {version}。完整安装包 {size} MiB；下载时优先使用匹配的增量包。").replace("{version}",available.group(1)).replace("{size}",available.group(2));
        String result=raw;String[] fragments={"APK 验证通过。安装将由 Android 系统再次确认；游戏数据保留。","下载增量包","下载完整 APK","增量下载成功：","完整包下载成功："," 字节；补丁尝试 "," 字节，累计 "," 字节；仅计下载响应体","（完整 APK "," 字节"};
        for(String fragment:fragments)result=result.replace(fragment,text(fragment));
        return "error".equals(state)&&result.equals(raw)?text("更新未完成")+"\n"+raw:result;
    }
}
