# 玩吧 · Android

<img src="assets/app-brand/app-icon.png" width="120" alt="玩吧应用图标">

37 款小游戏装进一个可离线运行的 Android App。当前版本 **1.2.2** 基于玩伴小屋游戏代码 **3.10.0**，保留单人游戏、人机挑战、7 套主题、本地进度和记录。

**[下载可安装 APK](https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/latest)** · **[37 款游戏体验审计（待审核）](docs/game-ux-audit-v1.md)** · **[双内核与真机验证](docs/android-flavors.md)**

## 安装与更新

1. Android 8.0 及以上设备，从 Release 选择安装包：系统内核较新的设备用 `wanba-system-1.2.2.apk`；系统内核较旧、无法更新 WebView 的手机用 `wanba-compat-1.2.2.apk`（内置 GeckoView，支持 ARM 64/32 位）。
2. 如果系统提示，允许你用于下载 APK 的浏览器或文件管理器安装此文件。
3. 打开桌面上的“玩吧”或“玩吧·兼容版”，无需酒馆、Via、账号或游戏资源下载。

**同一版本类型可直接覆盖更新**：轻量版沿用 1.0 的包名，兼容版使用独立包名，两个版本可以同时安装。切换版本类型时，先在旧版本导出备份，再到新版本导入；两者不会自动读取对方的存档。

游戏与美术更新：在首页下拉刷新或点击「检查更新」，查看变化包后下载；回到游戏列表安装，存档继续保留。37 款游戏代码、美术与五语言各自维护版本，发布在 [USER_HOUSE_GAME_PACKS](https://github.com/JackLee992/USER_HOUSE_GAME_PACKS)。应用只拉取变化包，并在完整校验后切换。

App / 内核更新：GitHub 版 1.2.2 新增独立的「设置 → 检查更新」入口，优先下载匹配的 APK 差分，重建并校验完整签名 APK 后交给 Android 确认安装。没有匹配差分时下载完整包；也可通过「下载更新」打开 Release。1.2.0/1.2.1 首次获得此模块需手动覆盖安装一次，**无需卸载**。

整包更新模块默认不参与源码构建；用 `-PwanbaAppUpdater=true` 启用。无动态更新的商店候选可同时指定 `-PwanbaAppUpdater=false -PwanbaGameUpdates=false`，移除安装权限、模块组件与线上游戏更新入口，保留内置游戏。[模块方案与构建说明](docs/android-incremental-update-proposal.md)

更新前可在设置导出备份。不要卸载或清除应用数据后再更新，否则 Android 会清除其本地存档。酒馆与独立 App 的存储空间相互独立：从旧插件导出 JSON，再在玩吧设置中导入即可迁移受支持的游戏进度与记录；角色、API、聊天、宠物等设置不在独立版范围。

## 游戏与功能范围

- 23 款单人游戏、14 款本地人机挑战，完整目录见 [体验审计](docs/game-ux-audit-v1.md)。
- 空当接龙保留安全/随步归档、双点归档及整步撤销；消消乐保留四连、五连、组合特效、破冰和无限玩法。
- 三维弹球使用完整 Space Cadet WebAssembly 引擎与可分发的 Open Cadet 素材，支持高清/经典显示、放大、触控挡板与发射。
- 祖玛升级为神庙闯关：全屏横竖自适应、WebGL 滚动珠体与连锁光波、蛤蟆张嘴装填、骷髅逐颗吞球；支持三生命、四种能力、金币与穿隙奖励。[升级说明](docs/zuma-classic-upgrade.md)
- 首页37款游戏图标按玩法统一重绘，泡泡龙使用完整圆形球体素材，修正窄屏右侧裁切。
- 设置新增省电、普通、游戏三档；减少泡泡静止时的无效绘制，并优化首页滑动监听与装饰绘制。
- 兼容版支持原生语言、主题和游戏模式下拉选择，覆盖取消与保存。
- 本地存档、个人记录、主题；JSON 备份导入/导出使用 Android 系统文件选择器。
- 切后台保存并暂停，回来后由玩家继续；系统返回依次关闭弹窗、回游戏目录、退出 App。
- 独立版隐藏酒馆角色、聊天、世界书、AI 接口和宠物功能。

弹球同一页面内保留完整球局；进程重启后从新球恢复分数、剩余常规球和军衔，任务、燃料、倍率及额外球不恢复。消消乐的金币、星星和关卡领奖标记随游戏进度保存，三种模式各有续玩进度，支持小锤和重排。模式内重试保留钱包；明确确认的“结束本局”或工具栏整局重开会清除该游戏进度与本局钱包。首版继承的游戏规则及其他体验建议详见审计稿，不将其全部视为已实现需求。

## 多语言与品牌

简体中文、繁體中文、English、日本語、한국어可在设置切换。中文品牌为 **玩吧**，英文为 **Nookcade**，日文 **ヌックケード**、韩文 **눅케이드**。启动器名称和图标按设备语言适配，两种内核包均包含中文与海外品牌资源。海外图标以无文字的迷你街机表现“自己的小游戏角落”，已检查 Android 自适应安全区域与小尺寸裁切。[品牌设计与检索记录](docs/international-brand.md)

五语言覆盖游戏目录、37款规则说明、常见控件和动态状态；中文猜词内容、象棋文字和部分 Canvas/WASM 内绘制文字保留原样。它们不能仅通过页面语言包完全替换，具体范围见 [语言覆盖文档](docs/i18n-coverage-v1.md)。

## 两种内核版本

| 版本 | 运行内核 | 适用设备 | 包名 |
| --- | --- | --- | --- |
| system 轻量版 | 系统 WebView，Chromium 124+ | 系统内核可更新的 Android 8+ 设备 | `io.github.jacklee992.wanba` |
| compat 兼容版 | APK 内置 GeckoView 155.0.1 | 系统 WebView 较旧或无法更新的 Android 8+ ARM 设备 | `io.github.jacklee992.wanba.compat` |

所有小游戏、图片、题库、WASM 都打包进 APK，首次运行不用下载内核或游戏。轻量版使用固定本地 HTTPS origin 和原生资源拦截，WebView 本身禁止联网；原生更新器仅访问固定 GitHub App/内容仓库。兼容版通过仅绑定 `127.0.0.1` 的本地资源服务连接内置 Gecko。两版声明 INTERNET 权限，用于经过验证的更新下载（兼容版也用于本机套接字）；GitHub 版可选模块另声明安装 APK 权限，没有账号服务或广泛存储权限。

兼容版体积更大，内核随玩吧 APK 一起更新。它不会安装或替换手机系统 WebView，不需要 Google Play 服务。它能避开系统 WebView 版本差异，仍有 Android 版本、CPU 架构和设备图形驱动的兼容边界。两种版本的实现、测试与维护说明见 [双内核文档](docs/android-flavors.md)。

[GeckoView 官方说明](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/geckoview-quick-start.html)提供可嵌入的独立浏览器引擎。[Via 官方仓库](https://github.com/tuyafeng/Via)公开的是本地化资源，Via 使用系统 WebView，不能作为本项目随包内核。

## 构建

需要 Node.js 22+、JDK 17+、Android SDK 平台 37.1；项目带有 Gradle Wrapper。首次构建需要联网获取构建依赖，内置游戏可离线运行，检查和下载更新需要联网。

```sh
cd android
./gradlew assembleSystemDebug assembleCompatDebug
```

macOS Android Studio 可使用其自带 JDK，例如：

```sh
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew assembleSystemDebug assembleCompatDebug
```

设置 `ANDROID_HOME` 或在 `android/local.properties` 写入本机 `sdk.dir`。打包自动调用 `scripts/prepare-android-assets.mjs`，只收集运行资源。输出分别在 `android/app/build/outputs/apk/system/debug/` 与 `android/app/build/outputs/apk/compat/debug/`。兼容版首次构建会从 Mozilla Maven 下载完整内核依赖。

发布构建使用外部私有签名配置。创建 `.local/signing.properties`（已被 Git 忽略）：

```properties
storeFile=/absolute/private/path/wanba-release.keystore
storePassword=YOUR_PRIVATE_PASSWORD
keyAlias=wanba
keyPassword=YOUR_PRIVATE_PASSWORD
```

```sh
cd android
./gradlew assembleSystemRelease assembleCompatRelease
```

输出分别在 `android/app/build/outputs/apk/system/release/` 与 `android/app/build/outputs/apk/compat/release/`。没有签名配置时只得到未签名产物，不应当作可安装正式版发布。发布密钥不能提交到仓库；未来覆盖更新必须继续使用同一密钥。轻量调试版启用 CDP，兼容调试版支持 Gecko 官方调试工具；正式版本不带调试标志并关闭相应调试入口。userdebug 系统 WebView 的例外记录在首版验证文档中。

游戏/资源发布请阅读 [独立内容发布说明](docs/content-release.md)。正式 APK 构建前，需用发行私钥生成与 www 文件完全一致的 `builtin-channel.json`；每次改内容后必须重新签名生成基线。

## 验证与开发

```sh
node --test tests/*.test.mjs android/app/src/compat/tests/*.test.mjs
```

`tests/standalone-browser.mjs` 面向独立开发浏览器；`tests/android-games-smoke.mjs` 面向隔离 Android 模拟器的真实 APK 入口，使用只读状态检查和普通页面按钮，不注入测试版游戏引擎。设备、端口和复现步骤见 [Android 验证记录](docs/android-validation.md)。

目录：`standalone/` 独立页面与能力配置，`src/` 游戏代码，`android/` 原生壳，`assets/app-brand/` 品牌素材，`docs/` 设计、审计和验证证据。

## 来源与素材

从 [JackLee992/USER_HOUSE](https://github.com/JackLee992/USER_HOUSE) 3.10.0 派生，保留提交历史；原作来自 [Gloria 的玩伴小屋](https://github.com/gloria-yin/USER_HOUSE)。酒馆版仍在原仓库维护，**不要把本 Android 仓库地址当作酒馆插件安装地址**。

- 原项目说明保留为 [历史 README](docs/upstream-README.md)，其中酒馆功能与旧版本说明不代表 Android 首版能力。
- Space Cadet、Open Cadet 与依赖来源及许可见 [弹球说明](docs/space-cadet.md) 和 `tools/space-cadet/` 中的许可文件。
- 玩吧图标由内置 imagegen 生成，以完整“玩”字结合按键；已验证 Android 自适应安全区域、圆形/方圆形裁切及48像素辨识度。[提示词、来源及验收](docs/wanba-icon-prompts.md)。
- 保留各来源的作者与许可。本仓库没有为未明确授权的上游代码统一声明新的开源许可证。
