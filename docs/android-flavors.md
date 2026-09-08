# 玩吧：双内核与真机验证

本轮正式目标：App 1.2.0 / versionCode 3；冻结的 1.1.0 / code 2 用于内核基线测试。游戏源码基线 USER_HOUSE 3.10.0。两种 flavor 复用同一套离线游戏与品牌资源。

## 版本选择与升级

| 项目 | system 轻量版 | compat 兼容版 |
| --- | --- | --- |
| 桌面名称 | 玩吧 | 玩吧·兼容版 |
| 包名 | io.github.jacklee992.wanba | io.github.jacklee992.wanba.compat |
| 内核 | Android 系统提供的 Chromium WebView 124+ | APK 内置 GeckoView 155.0.1 / build 20260903215306 |
| 最低 Android | 8.0 / API 26 | 8.0 / API 26 |
| CPU | 无应用原生库限制 | ARM64 / ARMv7 |
| 首次运行 | 无需网络下载 | 无需网络下载，APK 已含完整引擎 |
| 更新 | 沿用1.0包名和发布证书，覆盖更新保留数据 | 使用同一发布证书，后续兼容版覆盖更新保留数据 |

不同 flavor 使用独立存储，支持同时安装。跨 flavor 迁移需「设置 → 导出备份」再到另一个版本「导入备份」。同 flavor 更新无需卸载。不要依靠更换内核后自动读到对方存档。

## 真机发现与修正

本轮实际连接的是荣耀 NTH-AN00、Android 12 / API 31、1080×2340、ARM64。系统提供 `com.huawei.webview`，厂商组件版本为 `12.1.1.324`。实际 User-Agent 内核为 **Chromium 92.0.4515.105**，两者不是同一种版本号。

1.0 的兼容门禁直接解析组件版本首段，对采用厂商版本号的 WebView 存在误判。1.1 改为读取 WebSettings 默认 User-Agent 的真实 Chrome 版本；原生提示同时显示内核和组件版本。低于兼容线时提供兼容版下载入口。本机 Chromium 92 确实低于现有游戏要求，不通过修改系统提供者来规避。

## 内核来源与运行边界

- 精确依赖 `org.mozilla.geckoview:geckoview:155.0.20260903215306`，来自 [Mozilla 官方 Maven](https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/155.0.20260903215306/)。不使用浮动版本号。
- 官方 AAR 为241,244,587字节，SHA256 `9bf3719cdf0c23d07a9d8de58446555aabe09c327df5bd5391648e2ff8221565`。AAR包含多架构，APK只保留两种移动ARM架构。
- Gecko使用固定 `http://127.0.0.1:38657/assets/www/standalone/index.html`，保持本地存储和弹球iframe同源。服务仅绑定loopback，不监听局域网；仅可读取打包资源，不能读取任意文件或应用存档。端口冲突时有明确原生错误提示。
- 1.2 两版的 INTERNET 权限用于固定 GitHub 内容仓库的原生下载，compat 也用于 loopback。主页面与子页面导航、CSP及资源路径白名单限制游戏外部加载。JSON/DAT/WAV导入与JSON导出都使用Android系统文件选择器，无广泛存储权限。
- Gecko内容扩展仅在固定入口顶层注入限定原生功能：备份、打开固定 APK 更新地址、只读版本信息，以及固定仓库的资源检查、下载、激活、回退和健康确认。生命周期命令限定为暂停、保存、返回和备份结果；不提供生产任意脚本执行接口。
- Release关闭远程调试并禁用Gecko外部测试配置；Debug可使用[官方自动化配置](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/automation.html)。测试配置仅用于授权设备和本应用，测试后删除。

内置引擎解决系统WebView过旧这一类问题，并非对所有硬件作绝对兼容承诺。引擎更新需跟随Mozilla稳定版发布新的玩吧APK，重新验证WASM、触控、生命周期、导入导出及覆盖更新。

## 验证记录

已完成冻结 1.1 基线：系统版在 API 35 / WebView 124 模拟器启动、暂停并保存 37 款游戏；兼容版在 HONOR Android 12 真机启动 37 款游戏，四款重点游戏完成实际交互。弹球双指挡板、后台 ticks 完全停止与手动恢复已通过。证据在 `docs/evidence/android-1.1/`。

重复显式启动曾叠加 Activity，兼容版的多个服务实例会竞争自有本地端口；1.2 两版使用 singleTask。Gecko WebDriver 同 tick 双指合成只产生第一根 pointerdown；QA 按 Android DOWN → POINTER_DOWN 顺序分 tick 操作后，已确认两个真实 pointerId 同时按住，生产弹球逻辑无需为测试修改。

1.2 新增资源更新/五语言/美术与完整 APK 回归结果会单独记录，以上 1.1 基线不代替其验收。1.0 历史记录见 [历史验证](android-validation.md)。
