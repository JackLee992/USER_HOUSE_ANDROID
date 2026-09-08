# 玩吧 · Android

<img src="assets/app-brand/app-icon.png" width="120" alt="玩吧应用图标">

37 款小游戏装进一个可离线运行的 Android App。首版 **1.0.0** 基于玩伴小屋游戏代码 **3.10.0**，保留单人游戏、人机挑战、7 套主题、本地进度和记录。

**[下载可安装 APK](https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/latest)** · **[37 款游戏体验审计（待审核）](docs/game-ux-audit-v1.md)** · **[Android 验证记录](docs/android-validation.md)**

## 安装与更新

1. Android 8.0 及以上、系统 WebView 124 或更新的设备，下载 Release 中的 `wanba-1.0.0.apk`，由系统安装。
2. 如果系统提示，允许你用于下载 APK 的浏览器或文件管理器安装此文件。
3. 打开桌面上的“玩吧”，无需酒馆、Via、账号或游戏资源下载。

后续版本在 App「设置 → 下载更新」打开本仓库的最新 Release。下载后直接覆盖安装，**无需卸载**；正式版本保持相同包名与签名，并递增版本号。首版不静默下载或自动安装更新，安装仍由 Android 系统确认。

更新前可在设置导出备份。不要卸载或清除应用数据后再更新，否则 Android 会清除其本地存档。酒馆与独立 App 的存储空间相互独立：从旧插件导出 JSON，再在玩吧设置中导入即可迁移受支持的游戏进度与记录；角色、API、聊天、宠物等设置不在独立版范围。

## 首版范围

- 23 款单人游戏、14 款本地人机挑战，完整目录见 [体验审计](docs/game-ux-audit-v1.md)。
- 空当接龙保留安全/随步归档、双点归档及整步撤销；消消乐保留四连、五连、组合特效、破冰和无限玩法。
- 三维弹球使用完整 Space Cadet WebAssembly 引擎与可分发的 Open Cadet 素材，支持高清/经典显示、放大、触控挡板与发射。
- 本地存档、个人记录、主题；JSON 备份导入/导出使用 Android 系统文件选择器。
- 切后台保存并暂停，回来后由玩家继续；系统返回依次关闭弹窗、回游戏目录、退出 App。
- 独立版隐藏酒馆角色、聊天、世界书、AI 接口和宠物功能。

弹球同一页面内保留完整球局；进程重启后从新球恢复分数、剩余常规球和军衔，任务、燃料、倍率及额外球不恢复。消消乐星币为本局奖励，结束本局/重开后清零，尚未引入跨局钱包。首版继承的游戏规则及其他体验建议详见审计稿，不将其全部视为已实现需求。

## 为什么使用系统 WebView

采用 Java Activity + Android 系统 WebView，小游戏与图片、题库、WASM 均打包进 APK。固定本地 HTTPS origin 由应用直接读取 assets，外部资源请求被拦截；App 未申请 INTERNET 或全盘存储权限。系统 WebView 由设备系统提供，首版最低兼容线为 124；过旧时应用会提示更新内核，避免自带 Chromium 带来的安装体积与维护成本。

[Android 本地 Web 内容文档](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content)说明了 HTTPS 本地资源的组织方式；本项目以小型原生资源加载器实现固定 origin 和路径白名单。[Via 官方仓库](https://github.com/tuyafeng/Via)公开的是本地化资源，README 说明它使用系统 WebView，并非可直接嵌入的完整开源浏览器内核。

## 构建

需要 Node.js 22+、JDK 17+、Android SDK 平台 36.1；项目带有 Gradle Wrapper。首次构建需要联网获取构建依赖，App 运行不需要联网。

```sh
cd android
./gradlew assembleDebug
```

macOS Android Studio 可使用其自带 JDK，例如：

```sh
JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew assembleDebug
```

设置 `ANDROID_HOME` 或在 `android/local.properties` 写入本机 `sdk.dir`。打包自动调用 `scripts/prepare-android-assets.mjs`，只收集运行资源。输出为 `android/app/build/outputs/apk/debug/app-debug.apk`。

发布构建使用外部私有签名配置。创建 `.local/signing.properties`（已被 Git 忽略）：

```properties
storeFile=/absolute/private/path/wanba-release.keystore
storePassword=YOUR_PRIVATE_PASSWORD
keyAlias=wanba
keyPassword=YOUR_PRIVATE_PASSWORD
```

```sh
cd android
./gradlew assembleRelease
```

输出 `android/app/build/outputs/apk/release/app-release.apk`。没有签名配置时只得到未签名产物，不应当作可安装正式版发布。发布密钥不能提交到仓库；未来覆盖更新必须继续使用同一密钥。调试版本启用 CDP，正式版本不带调试标志并请求关闭 CDP；userdebug 系统内核的例外记录在验证文档中。

## 验证与开发

```sh
node --test tests/*.test.mjs
```

`tests/standalone-browser.mjs` 面向独立开发浏览器；`tests/android-games-smoke.mjs` 面向隔离 Android 模拟器的真实 APK 入口，使用只读状态检查和普通页面按钮，不注入测试版游戏引擎。设备、端口和复现步骤见 [Android 验证记录](docs/android-validation.md)。

目录：`standalone/` 独立页面与能力配置，`src/` 游戏代码，`android/` 原生壳，`assets/app-brand/` 品牌素材，`docs/` 设计、审计和验证证据。

## 来源与素材

从 [JackLee992/USER_HOUSE](https://github.com/JackLee992/USER_HOUSE) 3.10.0 派生，保留提交历史；原作来自 [Gloria 的玩伴小屋](https://github.com/gloria-yin/USER_HOUSE)。酒馆版仍在原仓库维护，**不要把本 Android 仓库地址当作酒馆插件安装地址**。

- 原项目说明保留为 [历史 README](docs/upstream-README.md)，其中酒馆功能与旧版本说明不代表 Android 首版能力。
- Space Cadet、Open Cadet 与依赖来源及许可见 [弹球说明](docs/space-cadet.md) 和 `tools/space-cadet/` 中的许可文件。
- 玩吧图标由内置 imagegen 生成，以完整“玩”字结合按键；已验证 Android 自适应安全区域、圆形/方圆形裁切及48像素辨识度。[提示词、来源及验收](docs/wanba-icon-prompts.md)。
- 保留各来源的作者与许可。本仓库没有为未明确授权的上游代码统一声明新的开源许可证。
