# Android 整包增量更新：方案、实现与验收边界

核对日期：2026-09-09。建议保持两层：日常游戏 JS、图片和语言沿用现有签名内容包；原生 Java/DEX、Android res、权限、启动图标与 Gecko 内核通过“下载差分 → 重建完整已签名 APK → 系统确认安装”更新。已实现可移除的 `:app-updater` 模块，**默认不编入 App**，没有 DEX/ClassLoader 热加载。

**验收边界：**1.2.1 已冻结发布的 APK 不含本模块。模块 AAR、真实 JVM 测试、旧/新 APK 离线重建、两 flavor ON/OFF 最终二进制矩阵均已通过，正式 1.2.2 已发布并验收完整性：[构建矩阵](app-updater-build-matrix.md)、[1.2.2 完整性](release-v1.2.2-integrity.md)。HONOR 实机已覆盖安装正式兼容版，正常 SAF 五项数据完全保留、content 5 生效、祖玛可续局暂停，原生页从公开签名频道确认当前已是最新版：[实机记录](evidence/android-1.2.2/phone/README.md)。实际 App 内差分安装及断网/后台/重启的结论另以对应设备记录为准，不能把覆盖安装或本地重建称为 App 内差分安装成功。

**App 内差分安装已实测通过：**Android 15 模拟器使用内部非 debug system RC1/code 5，从公开签名频道下载 **884,176 字节**差分，重建并校验目标 APK；真实 Android 安装对话框确认后变为正式 1.2.2/code 6，安装文件 SHA256 与发行 APK 完全一致，正常 SAF 导出的五项解析 JSON 全部保留。该轮没有完整 APK 下载回退，也没有通过 adb 重装替代 App 内安装。[完整端到端记录](evidence/app-delta-1.2.2/README.md)

## 选择依据

| 路线 | 能更新什么 | 代价与限制 | 本项目决策 |
| --- | --- | --- | --- |
| 已有内容包 | Web 游戏 JS、WASM、图片、声音、语言与共享 core | 固定 runtime API、存档 schema；整快照激活和回退 | 保留，日常最低维护成本 |
| APK 差分 + 完整 APK 安装 | DEX、原生 res、manifest、图标、宿主与内核 | 需要重建空间、完整验签、用户确认安装；进程可能重启 | GitHub 分发采用 |
| DEX / `.so` 热更新 | 自定义加载器可加载部分新代码 | 类身份、已加载类、JNI/ABI、资源 ID、生命周期和故障回退都需额外协议；不能自动变成完整 APK 更新 | 不实施 |
| Android ResourcesLoader | 修改进程内 Resources / assets 的供应源 | API 30 起可用，本项目 minSdk 26；不是 manifest/安装图标/任意 DEX 更新方案 | 不增加第三套资源机制 |
| Google Play 更新 | 由商店分发原生版本、拆分 APK 等 | 要走商店发布和签名体系 | Play 构建移除 GitHub 安装模块，后续可接官方 In-app Updates |

`DexClassLoader` 的确提供加载 APK/JAR 中 DEX 的 API，但它是代码加载器，而非对整个已安装应用做原子替换的保证；本项目也不采用反射修改 ART 或加载器内部结构。[Android DexClassLoader](https://developer.android.com/reference/dalvik/system/DexClassLoader)。ResourcesLoader 从 API 30 提供资源覆盖能力，添加供应源会影响相关 Resources 对象。[Android ResourcesLoader](https://developer.android.com/reference/android/content/res/loader/ResourcesLoader)

Google Play 明确限制商店应用自行替换更新，以及从 Play 以外下载 DEX/JAR/`.so`。解释执行语言的例外仍要求遵守所有政策，不能据此宣称远程 JS 自动合规。因此提供两个独立编译开关，并将两者关闭作为本项目保守的商店候选构建方式。[Play Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/16559646)、[Android 动态代码加载风险](https://developer.android.com/privacy-and-security/risks/dynamic-code-loading)

本应用以小游戏为核心，不能因为需要自更新就假设符合 `REQUEST_INSTALL_PACKAGES` 的 Play 允许用途；关闭模块必须真的移除该权限和安装代码。[Play 安装权限政策](https://support.google.com/googleplay/android-developer/answer/12085295?hl=en)。商店版后续使用独立 Play 实现，可选择 flexible / immediate 的官方更新流程。[Play In-app Updates](https://developer.android.com/guide/playcore/in-app-updates)

## 当前架构与精确接入点

- [app/build.gradle.kts](../android/app/build.gradle.kts)：system / compat 两 flavor，minSdk 26、targetSdk 36；compat 单独依赖 GeckoView，包含 arm64-v8a / armeabi-v7a。主包名 `io.github.jacklee992.wanba`，兼容版另加 `.compat`。
- [ContentUpdateManager.java](../android/app/src/main/java/io/github/jacklee992/wanba/ContentUpdateManager.java)：现有游戏频道检查、下载和激活协调；[ContentResourceStore.java](../android/app/src/main/java/io/github/jacklee992/wanba/ContentResourceStore.java) 管理不可变文件快照。此处的“资源更新”包含 Web 游戏代码，不等同于 Android 编译后的 `res/`。
- [tools/content/build-packs.mjs](../tools/content/build-packs.mjs) / [publish-packs.mjs](../tools/content/publish-packs.mjs)：已有内容包发行，仓库为 `USER_HOUSE_GAME_PACKS`。不与新 APK 清单混用。
- [settings.gradle.kts](../android/settings.gradle.kts)：`wanbaAppUpdater=true` 才 include 新模块；app 只在同一开关为 true 时依赖它。OFF 不只是隐藏按钮。
- [AppUpdateActivity.java](../android/app-updater/src/main/java/io/github/jacklee992/wanba/appupdater/AppUpdateActivity.java)：非导出的独立入口 `io.github.jacklee992.wanba.appupdater.AppUpdateActivity`，**不接收渠道、路径、包名或证书 Intent extras**。包名来自本机 Context。
- 宿主的 `MainActivity.NativeBridge.openAppUpdater()` / `CompatActivity.NativeBridge.openAppUpdater()` 负责前台信任来源和编译开关后再发显式 Intent。`getAppInfo()` 提供 `gameUpdatesEnabled`、`appUpdaterEnabled`、`nativeSelfUpdateEnabled`。宿主集成由对应负责人维护。
- 模块 [AndroidManifest.xml](../android/app-updater/src/main/AndroidManifest.xml) 独占安装权限与非导出安装回调 Receiver；使用 PackageInstaller Session，因此**不需要 FileProvider**。

| 构建用途 | wanbaGameUpdates | wanbaAppUpdater |
| --- | --- | --- |
| 默认，保持原行为 | true | false |
| GitHub，内容包 + 整包更新 | true | true |
| 仅整包更新 | false | true |
| 无动态更新的商店候选 | false | false |

关闭整包模块不改变包名、签名或游戏存档格式。Play 迁移还必须核对实际上架政策、签名钥匙与商店渠道配置，不能仅凭编译开关宣称获准上架。

## 已实现的完整 APK 流程

1. 用户打开独立更新页并检查；固定读取 `https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/latest/download/app-updates.json`。没有后台轮询、静默安装或传入任意地址的接口。
2. [UpdateProtocol.java](../android/app-updater/src/main/java/io/github/jacklee992/wanba/appupdater/UpdateProtocol.java) 限制 envelope 128 KiB / payload 64 KiB，使用已有内容签名 P-256 公钥的独立副本验签，要求签名域 `kind=wanba-apk-update`、固定仓库、整数序号、有效期和最多两个应用条目。有效期上限 31 天；发布方若长期不发布原生版本，仍需用新序号续签频道。旧签名或同序号不同 payload 会被拒绝。
3. 根据系统真实包名选择条目；新 versionCode 必须更高，证书必须等于当前安装应用的单一签名者。当前不支持签名轮换和 Play split 安装源；这两类情况应使用商店/专门迁移版本。
4. [UpdateHttp.java](../android/app-updater/src/main/java/io/github/jacklee992/wanba/appupdater/UpdateHttp.java) 只允许本仓库固定 release 资产起点，重定向逐跳检查 HTTPS、标准端口、无 user-info，最多五跳；CDN 限定 `release-assets.githubusercontent.com` / `objects.githubusercontent.com`。不接受 HTTP、任意域名、任意镜像或 URI scheme。下载限制为签名中的精确字节数，最终再验 SHA-256。
5. 只在本机 `ApplicationInfo.sourceDir` 的旧 APK SHA-256 和 versionCode 都匹配时选择差分。无匹配基包、补丁下载/重建/校验失败则下载完整 APK；取消不会触发全包回退。
6. [UpdateFiles.reconstruct()](../android/app-updater/src/main/java/io/github/jacklee992/wanba/appupdater/UpdateFiles.java) 使用 32 KiB 缓冲流式读取旧 APK 和差分，生成独立临时文件。最终目标不经过解压重打包、重签名或 ZIP 重排，必须逐字节等于发行 APK。
7. [ApkChecks.verify()](../android/app-updater/src/main/java/io/github/jacklee992/wanba/appupdater/ApkChecks.java) 使用官方 `apksig` 验证完整 APK v2/v3 签名，复核目标 hash/长度、同包名、同证书、严格更高 versionCode、versionName/minSdk 一致，并拒绝 debug/testOnly APK。安装前再次验签和检查清单有效期/序号。
8. 用户点安装；未获未知来源授权时，只打开本应用的系统授权页，返回后仍需再点安装。写入 PackageInstaller Session、fsync，API 31+ 明确 `USER_ACTION_REQUIRED`。系统要求确认时由独立 Activity 展示 OS 提供的 Intent；不会自行宣称后台安装成功。[PackageInstaller 用户确认契约](https://developer.android.com/reference/android/content/pm/PackageInstaller.SessionParams#setRequireUserAction(int))

APK v2 是覆盖 APK 受保护区域的完整文件签名方案，因此不能直接改已安装 APK 的 DEX/res 后继续把它当成原发行 APK；正确目标是还原原本已签好的全部字节，再交系统安装。[AOSP APK Signature Scheme v2](https://source.android.com/docs/security/features/apksigning/v2?hl=en)

### 差分格式与失败边界

格式 `copy-add-v1`：8 字节 ASCII `WAUPD001` + big-endian int64 目标长度；`1 + int64 offset + int32 length` 从旧 APK COPY；`2 + int32 length + literal bytes` ADD；`0` 为 END。长度必须为正，旧文件偏移和目标输出都不能越界，END 后不允许额外字节。最多 65,536 个操作，目标 APK ≤512 MiB，差分 ≤256 MiB。不是 shell、脚本或可执行补丁格式。

构建器按 ZIP 中完全相同的压缩成员复制旧字节；变化内容、签名块和 ZIP 元数据按字面写入。这是简单可维护的第一版，不承诺优于所有二进制差分算法。只有补丁小于全包的 90% 才写入发布清单。若 Gecko `.so` 压缩字节大幅改变，补丁可能接近全包，直接回到完整 APK 即可。

下载、hash、复制循环检查取消；提交安装前取消与 commit 共用锁，取消先发生则放弃 Session，commit 后安装决定归系统控制。Activity 销毁停止当前下载并清理本事务；第一版**没有断点续传、跨进程下载恢复或后台下载服务**，重开重新检查。崩溃残留仅清理模块私有 `noBackupFilesDir/app-updater/<UUID>/` 的四个已知文件，不递归清理其他应用数据。

空间预检查为 `2 × 目标 APK + 最大候选差分 + 32 MiB`，覆盖重建文件及安装 Session 副本的预算；实际系统安装空间不足仍以 OS 返回为准。没有测得安装耗时、手机内存峰值或网络耗电，不把固定流缓冲等同于完整安装过程内存上限。

完成页保留实际成功路径及下载响应体的精确字节数；补丁失败转全包时分别列出补丁尝试、全包和累计字节，不将失败尝试隐藏为节省。HTTP/TLS开销不计入这项数据。进度同时显示已下载/总 MiB。新增原生更新页本批以中文文案为主，尚未完成五语原生资源本地化；状态栏使用独立深色安全区，内容为可滚动布局。

### 存档与回退

模块不访问游戏 SharedPreferences、WebView/Gecko profile、localStorage、IndexedDB 或内容快照目录。系统同包同签名升级通常保留应用数据；新 APK 自身的数据迁移仍需独立保证向前兼容。

下载/重建/验证/系统安装取消时继续运行旧 APK，不卸载。**已成功安装的新 APK 不承诺一键降级**：本模块拒绝 versionCode 回退，普通应用不能把系统回滚权限当作通用能力。修复原生缺陷应发布更高 versionCode 的修复包；存档不能因恢复旧资源而恢复旧备份覆盖用户后续进度。现有游戏内容回退仍由原快照协议负责。

## Gecko 与多地区分发

正式 1.2.2 冻结包实测：system 59,222,579 字节；compat 224,569,378 字节。compat 包含两套 ARM ELF 与内置 Gecko 155.0.1，系统版使用系统 WebView，不把浏览器引擎再打入自己的包。[二进制验收](release-v1.2.2-integrity.md)

Mozilla 的正式集成方式是固定 GeckoView Gradle 依赖，并在进程内初始化 GeckoRuntime。当前工程沿用该方式；引擎升级同时涉及 Java API、JNI 库、运行时资源与许可证，按原生 APK 版本整体测试更易维护。[Mozilla GeckoView 集成文档](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/consumer/geckoview-quick-start.html)

第一阶段继续 GitHub Releases，不引入常驻服务。官方当前支持每个 release 最多 1000 个资产、每个资产小于 2 GiB，并说明 release 总大小及带宽没有该项配额上限；这不是全球网络质量或 SLA 保证。[GitHub release 配额](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)。先创建 draft，上传完整 APK、有效差分和签名清单，验收后发布；开启不可变发行，之后修正用新 tag / sequence。[GitHub immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

未来多地区先测真实用户网络再增加对象存储/CDN 镜像，镜像必须分发同一签名 payload 与同一 hash 的资产，信任根不随 CDN 切换。当前代码**尚不接受镜像**；新增镜像要经单独 APK 版本把明确的域名/路径白名单编入模块，并测试重定向与失败切换。Google Play 地区版走商店分发，不能把这套 GitHub 安装器隐藏后继续运行。

## 真实差分证据与测试

下表使用已冻结的 1.2.0 / 1.2.1 正式 APK，只读生成差分；由本次生产 Java 流式解码器重建，再执行 Android SDK `apksigner verify` 和 `aapt2 dump badging`。输入文件未重建、未修改。

| Flavor | 完整目标 APK | 差分字节 | 差分 / 全包 | 生产 Java 重建及 APK v2 签名 |
| --- | ---: | ---: | ---: | --- |
| system | 59,043,376 | 11,456,254 | 19.40% | 通过 |
| compat | 224,393,763 | 12,653,399 | 5.64% | 通过 |

重建 SHA-256 分别为 `2c9974f81766d273d762c8cc18875e482809079a6b9c8c129d297222d3a7f6b7`、`8988136f202cc8529ced7c06bb45a1c64ab8bf2d00ee630445591697e489ebc6`，与冻结 1.2.1 完全相同。证据：[system JSON](../android/app-updater/qa/system-delta.json)、[compat JSON](../android/app-updater/qa/compat-delta.json)。这组版本未替换 Gecko 内核，不能当作未来引擎升级下载率。

`node --test tests/app-updater.test.mjs`：3 项通过；真实 Java 52 断言覆盖正确/坏签名、过期、域隔离、包名、整数/大小、重放/同序号不同清单、恶意 URL、COPY 越界/负长度/截断/多余字节及真正开始写入后的取消清理。Gradle `:app-updater:testDebugUnitTest` 的 JUnit wrapper 真正执行同组断言（含成功增量、完整下载及部分补丁失败后的累计字节）：[JUnit 原始记录](../android/app-updater/qa/junit.xml)。`:app-updater:assembleDebug` 独立 AAR 编译通过。

两 flavor 的 APK 构建、权限/类/公钥 ON/OFF 矩阵和正式包完整性已通过，见上述独立报告。HONOR 正式兼容版的公开 GitHub channel 检查、覆盖安装后五项正常 SAF 数据保留与祖玛续局已通过。模拟器的实际差分下载、Android 确认安装及存档验证也已通过。断网、安装拒绝、进程被杀与不同 OEM 的完整故障矩阵尚未逐项进行设备测试，不将主机测试或本轮成功路径扩展为这些场景的通过结论。

## 使用与分阶段交付

### 1.2.2 发行与真实设备证据

已为正式 `1.2.2 / versionCode 6` 生成序号 1、tag `v1.2.2` 的签名频道。两份完整 APK 与四份差分已放入 `.local/releases/v1.2.2/`，完整构建输出为 `.local/app-update-1.2.2/`。独立发布流程已将 [v1.2.2](https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/tag/v1.2.2) 公开；HONOR 正式兼容版经正常原生入口检查该频道，显示“App 已是最新版本”。本地产物工具本身没有上传或发布行为。

| Flavor | 基包 | 完整目标字节 | 差分字节 |
| --- | --- | ---: | ---: |
| system | 已发布 1.2.1 / code 4 | 59,222,579 | 1,158,068 |
| system | 内部非 debug RC1 / code 5 | 59,222,579 | 884,176 |
| compat | 已发布 1.2.1 / code 4 | 224,569,378 | 5,880,751 |
| compat | 内部非 debug RC1 / code 5 | 224,569,378 | 1,969,930 |

生产 Java `UpdateProtocol` 已对两个 flavor 校验清单签名、有效期、序号和两条基版本映射；生产 Java 解码器已对四条差分重建并再次用 APK v2 验签工具核验。目标 hash 分别为 `d1706b1ecc8c601f30bf5f546ac025c3d0ef31685701b50f4223941fac01f892` 与 `23ebea8f4382a5c356770423020dff19414afe4d307b5f5bc875cab7e1f94bdd`。签名 envelope hash 为 `15d2d7d7b3fadc669282ec6b1fdbb0e88aa8e5e4b8906f8852b63da364bb8817`。[四条生产 Java 重建与签名证据](../android/app-updater/qa/release-1.2.2-artifacts.json)

真实原生自更新验收使用**已内置模块的非 debug RC1/code 5 → 正式 code 6**。旧 1.2.1/code 4 本身没有更新器入口；为它生成差分不等于给旧 APK 补上入口。首次切到支持本功能的版本仍需正常安装新版 APK。

```sh
# 模块本身测试与 AAR，不构建已冻结发布包
cd android
./gradlew -PwanbaAppUpdater=true :app-updater:testDebugUnitTest :app-updater:assembleDebug

# 后续 GitHub 候选包
./gradlew -PwanbaAppUpdater=true :app:assembleSystemDebug :app:assembleCompatDebug

# 无动态更新商店候选：检查最终 merged manifest 无安装权限/Activity/Receiver
./gradlew -PwanbaAppUpdater=false -PwanbaGameUpdates=false :app:assembleSystemRelease :app:assembleCompatRelease
```

独立发布工具：[build-update.mjs](../tools/app-updater/build-update.mjs)。配置 JSON 含 `sequence`、可选 `issuedAt/expiresAt`、`apps:[{apk,oldApks:[...]}]`；它从真实 APK 解析包名、版本、SDK 和证书，验证新旧签名身份与版本，生成补丁并逐字节回放。每个 flavor 最多保留三个基版本补丁，完整 APK 始终保留。序号 1 之后必须传上一份已签名清单，阻止倒退和相同 versionCode 更换 APK 字节。

```sh
# 显式提供发布者私钥路径；工具不会上传或发布，不会重新签 APK
node tools/app-updater/build-update.mjs \
  --config .local/app-update-build.json --output .local/app-update-candidate \
  --key .local/resource-signing/private.pem --tag vNEXT \
  --previous .local/previous-app-updates.json

# 不读取私钥的差分算法验收
node tools/app-updater/measure-delta.mjs OLD.apk NEW.apk .local/qa-app-update-example
```

需要 Android SDK `ANDROID_BUILD_TOOLS` 与 JDK `JAVA_HOME`；独立 Java QA 还使用 `WANBA_JSON_JAR` 指向测试用 org.json jar。示例 `vNEXT` 是待选实际发行 tag，不是可发布版本。私钥不进入 Git、APK 或日志；模块只复制已有 DER 公钥。

| 阶段 | 交付 | 相对复杂度 / 当前状态 |
| --- | --- | --- |
| A | 内容包维持日常更新、原生整包 fallback | 已有机制，低额外成本 |
| B | 可移除 APK 模块、签名协议、简单差分、离线重建 | 中等；实现、52 Java 断言、四条发行差分与最终 ON/OFF 二进制矩阵已完成 |
| C | 1.2.2 启用模块、真实 channel、端到端升级 | 已公开；HONOR 覆盖安装与线上检查通过；模拟器真实差分下载、系统确认安装、目标 APK 摘要和五项存档验证全部通过 |
| D | 多地区镜像、Play 独立更新实现 | 中到高；按实际分发需求另做，不预建复杂服务 |

不提供未测的安装耗时、峰值内存或节电估算。实测系统版 RC1 → 正式版仅下载 884,176 字节差分，相当于 59,222,579 字节完整目标的 1.49%；这只代表这两个固定版本，不代表未来 Gecko 或大量素材变化时的下载比例。
