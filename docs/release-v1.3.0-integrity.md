# 玩吧 1.3.0 正式 APK 完整性验收

2026-09-09T11:02:31.872733+00:00：两种正式 APK 均通过。本验收读取最终二进制和签名资源清单，没有构建、修改源码或发布 GitHub。

| 产物 | 大小 | 应用包名 | 内核 |
| --- | ---: | --- | --- |
| `wanba-system-1.3.0.apk` | 62,149,094 字节 | `io.github.jacklee992.wanba` | 系统 WebView |
| `wanba-compat-1.3.0.apk` | 226,380,162 字节 | `io.github.jacklee992.wanba.compat` | Gecko 155.0.1 |

两包的二进制 manifest 均为 `versionName=1.3.0`、`versionCode=7`；未启用 `android:debuggable` 或 `android:testOnly`。APK v2 签名校验通过，发布证书 SHA-256 为 `806ede7461091d6b9668ad32b656d6e20f47d00eb4e11341e04f551377ced777`。

已从实际 DEX 读取构建开关：`WANBA_APP_UPDATER=true`、`WANBA_GAME_UPDATES=true`。 两包均实际包含整包更新器及 APK 签名验证类、安装权限和独立 P-256 公钥；更新 Activity 与安装结果 Receiver 均明确未导出。公钥字节与指定信任根一致，详细 DEX、组件和公钥摘要已归档。

## 内置内容

`content-10` 的 P-256/SHA-256 签名已使用 APK 编译信任根独立验证，`manifest.json` 与已签名 payload 完全相同。序列 **10**，内容快照版本 **1.4.0**，来源提交 `8d0d40f2387c3a062a697b93f4026562fc8ee02e`。

逐一核对两包 `assets/www/` 的 **81 个资源包、每个 APK 239 个文件**：字节数及 SHA-256 全部相同，无缺失、额外或重复文件。两包内置 channel 与签名发布 channel 字节一致，公钥与信任根一致。

同一批 239 个文件也逐项对照当前工作区与上述 Git 提交中的真实 blob，全部一致；原始许可证文件按构建脚本的路径映射核验。

五语言包为 zh-CN 1.0.4、zh-TW 1.0.4、en 1.0.4、ja 1.0.4、ko 1.0.4；各自的 37 个游戏标题与签名清单一致。玩吧、Nookcade、ヌックケード、눅케이드 品牌和两套 app-icon PNG 已实际入包。

兼容版实际包含 26 个 ARM ELF 动态库，两种 ABI `arm64-v8a` / `armeabi-v7a` 均有 `libxul.so`。已核对 ELF 架构头，并读取包内 `omni.ja`：Gecko `155.0.1`、build `20260903215306`。系统版没有内置 Gecko 动态库。

## lint 与验收边界

Release lint：system：0 错误、24 警告；compat：0 错误、21 警告。原始报告和全部警告已归档，没有屏蔽诊断。构建日志含 BUILD SUCCESSFUL，已归档。

本报告验证正式 APK 签名、版本、资源和内核组成；触控、横竖屏、存档和热更新体验由对应真机/模拟器记录说明。

## SHA-256

```text
a041848cd6c1e12e714657c0294c339c48ece65857b4f3f5e8ebf1d6f913d43e  wanba-system-1.3.0.apk
69ef9521ca28fc104c3eb1e96a87640a77048cf9f0d863f1cf5a3d8eacb7bbb1  wanba-compat-1.3.0.apk
```

两个 APK 全部通过后才拷贝到 `.local/releases/v1.3.0-r2/`，拷贝后再次校验 SHA-256。

- [机器可读验收报告](evidence/android-1.3.0/release-integrity/apk-integrity.json)
- [签名、二进制 manifest、逐文件核对和 lint 原始证据](evidence/android-1.3.0/release-integrity/)
- [发布 SHA256SUMS](evidence/android-1.3.0/release-integrity/SHA256SUMS)
- [可复用验收工具](../tools/verify-release-apks.py)
