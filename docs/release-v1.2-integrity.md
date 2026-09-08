# 玩吧 1.2.0 正式 APK 完整性验收

2026-09-08：`assembleSystemRelease`、`assembleCompatRelease`、两种 Release lint 构建成功。此验收只读取最终 APK 和签名资源清单，没有修改生产源码或签名配置。

| 产物 | 大小 | 应用包名 | 内核 |
| --- | ---: | --- | --- |
| `wanba-system-1.2.0.apk` | 48,618,552 字节 | `io.github.jacklee992.wanba` | 系统 WebView |
| `wanba-compat-1.2.0.apk` | 213,968,563 字节 | `io.github.jacklee992.wanba.compat` | 内置 Gecko 155.0.1 |

两包均通过 Android `apksigner verify` 的 APK v2 签名校验，证书 SHA-256：

`806ede7461091d6b9668ad32b656d6e20f47d00eb4e11341e04f551377ced777`

最终二进制 manifest 均为 `versionName=1.2.0`、`versionCode=3`；未启用 `android:debuggable`，`aapt` 亦未标记为可调试应用。最低 Android API 26，目标 API 36。

## 内置资源核验

以签名发布 `content-3` 的 `.local/content-3/manifest.json` 为基准，对两包的 `assets/www/` 全部文件进行 SHA-256 和字节数比较：**81 个资源包、每 APK 212 个文件，全部相符，无缺失或额外网页文件**。两包的 `assets/content-update/builtin-channel.json` 与发布的 `channel.json` 完全相同；公钥与编译信任根相同。

此次内容快照序列为 3、资源快照版本为 1.1.0；资源包版本与 App 版本分别维护，该版本号差异符合设计。

包内含简体中文、繁体中文、英文、日文、韩文 1.0.1 语言资源，每种语言均含 37 个游戏标题，并核对了 玩吧 / Nookcade / ヌックケード / 눅케이드 品牌文案。中文和海外 app-icon PNG 均已实际打入包内。

兼容版检查了 26 个实际 ELF 动态库：`arm64-v8a` 与 `armeabi-v7a` 各 13 个，架构头分别为 AArch64 和 ARM，均包含 `libxul.so`。包内 `omni.ja` 的 `AppConstants` 明确声明 `MOZ_APP_VERSION=155.0.1`、`MOZ_BUILDID=20260903215306`，对应依赖坐标 `org.mozilla.geckoview:geckoview:155.0.20260903215306`。系统版未打入 Gecko 动态库或 `omni.ja`。

## lint 与测试边界

两种 Release lint 均为 **0 错误**。system 有 17 条警告，compat 有 14 条，已原样归档：目标 API 不是最新、API 33 属性提示、Gradle 可升级、ChromeOS x86_64 不支持、WebView JavaScript 开启审查、备份规则提示、重复 v26 资源限定、可用空间 API 建议，以及原生文本本地化提示。system 另有 4 条单色启动图标提示；compat 多一条 API 33 属性提示。

这些 lint 警告没有改为屏蔽或伪造通过。本验收证明最终 APK 签名、资源和构建配置一致；触摸、存档、下载更新及滚动体验由对应模拟器/真机报告说明。

## 下载文件完整性

```text
617966114639edcb67e3f224d832d8db46752b24bf1756ff4521dd77e62febb8  wanba-system-1.2.0.apk
9a0c79e397dcf248f49b6d0a980889f926d4f866cd7b59402a1332e67e148ace  wanba-compat-1.2.0.apk
```

最终发布文件位于 `.local/releases/v1.2.0/`，附 `SHA256SUMS` 和 `apk-integrity.json`。验收工具使用 Android SDK 37.0.0 的 `aapt` / `apksigner`，并读取 ZIP 内实际文件；校验后拷贝的发布文件再次比对 SHA-256。

- [完整机器可读验收报告](evidence/android-1.2/release-integrity/apk-integrity.json)
- [签名、二进制 manifest、逐文件清单、lint 和构建原始证据](evidence/android-1.2/release-integrity/)
- [发布校验值](evidence/android-1.2/release-integrity/SHA256SUMS)
