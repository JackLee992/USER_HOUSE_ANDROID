# 可移除更新模块：实际 APK 构建矩阵

2026-09-09 核验结果：开启整包更新时，模块、安装权限、私有组件和校验公钥均已打包；同时关闭两种更新时，这些内容从实际 APK 中移除，37 款内置游戏及五语言资源仍在。

本页记录的是 **1.2.1 / versionCode 4 发布之后的源码构建候选**，不是另一次已发布的 1.2.1。ON 使用 debug APK；OFF 包含两款 release 构建和一款 system debug 构建。本次核验没有安装、上传 APK，没有重新运行 Gradle，也没有改写 `.local/releases/v1.2.1`。所有候选位于 `.local/qa-app-updater`，不能与正式下载文件混用。

| 构建 | DEX 中 GAME_UPDATES / APP_UPDATER | 安装权限 | 更新器类 / apksig 类 | 更新组件、公钥 | Debuggable |
|---|---|---|---|---|---|
| ON system debug | true / true | 有 | 30 / 297 | 有；2 个组件均未导出 | true |
| ON compat debug | true / true | 有 | 30 / 297 | 有；2 个组件均未导出 | true |
| OFF system release | false / false | 无 | 0 / 0 | 无 | false |
| OFF compat release | false / false | 无 | 0 / 0 | 无 | false |
| OFF system debug | false / false | 无 | 0 / 0 | 无 | true |

安装权限为 `android.permission.REQUEST_INSTALL_PACKAGES`。两个模块组件分别是 `io.github.jacklee992.wanba.appupdater.AppUpdateActivity` 和 `io.github.jacklee992.wanba.appupdater.InstallResultReceiver`，实际二进制 manifest 中均为 `android:exported="false"`。模块专用资源为 `assets/app-updater/public-key.der`。OFF 中不存在该资源、该模块命名空间下的类或 `com.android.apksig` 类；主 App 中用于检测可选入口的固定类名字符串不构成模块打包。

五个 APK 的包名、版本均符合各自 flavor，全部通过 `apksigner verify` 的 APK v2 签名验证，且均为原发布证书：

```text
806ede7461091d6b9668ad32b656d6e20f47d00eb4e11341e04f551377ced777
```

实际 DEX 的 `class_def` 表用于统计类定义，`BuildConfig` 的 encoded static values 用于读取两个布尔构建常量；没有用字符串出现次数替代类存在性。`DEBUG` 在 debug 构建中通过类初始化方法赋值，因此可调试状态单独读取 APK manifest。

## 构建及 lint

两份构建日志均为 `BUILD SUCCESSFUL`。OFF 两个 release 的完整 lint 均为 **0 错误**：system 17 个警告，compat 14 个警告。包括已有的目标 SDK、插件版本、WebView JavaScript、备份规则、过时 SDK 条件、单色图标等提示；具体 issue ID 和数量保存在 JSON。构建日志另有 AGP 9.2.1 对 compileSdk 37.1 的兼容提示。ON 日志未执行 release lint，不能据此宣称 ON release lint 已通过。

原生 Java 行为与页面能力测试见 [仅内置游戏内容的构建选项](non-dynamic-game-build.md)。本页是 APK 包装层验证，不能代替设备上的安装授权、取消、前后台恢复和增量更新验收，也不代表应用商店审核结论。

## 候选文件摘要

| `.local/qa-app-updater/` 下的文件 | 字节数 | SHA-256 |
|---|---:|---|
| `enabled/wanba-system-debug.apk` | 60687842 | `da38310b6d5d50ecd6ad5a233905d406a2c3f26bafe10a4076985e7f9515f961` |
| `enabled/wanba-compat-debug.apk` | 240856560 | `e48eb7af2f31b12c442136c85c89eda0eb105b24defe1c7b37474bbbaa73f1b7` |
| `disabled/wanba-system-release.apk` | 59042876 | `4a62f41dea0c11580acafaa098e6fa0db41c97f4429cd197e7089964785f28f7` |
| `disabled/wanba-compat-release.apk` | 224392815 | `6ee024147937075937c9202fd6252aefd27607e3c7df27d42d3ff4f6836eb9b3` |
| `disabled/wanba-system-debug.apk` | 60687705 | `9aa70c46d5a1a5d615fe5c1dc11f8c4a7ba135e6655b1577473dc44a11d21a1a` |

核验前后，已发布 system APK 的 SHA-256 保持 `2c9974f81766d273d762c8cc18875e482809079a6b9c8c129d297222d3a7f6b7`；compat 保持 `8988136f202cc8529ced7c06bb45a1c64ab8bf2d00ee630445591697e489ebc6`。

机器可读结果：[build-matrix.json](evidence/app-updater/build-matrix.json)。原始二进制 manifest、badging、签名输出、DEX 核验、构建日志和 lint XML 位于 [build-matrix 证据目录](evidence/app-updater/build-matrix/)。复核脚本为 [verify-app-updater-matrix.py](../tools/verify-app-updater-matrix.py)，其操作仅限读取 APK、复制 OFF 包到 QA 目录及写入证据。
