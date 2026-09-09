# 玩吧 1.2.1 正式 APK 完整性验收

2026-09-09T03:52:21.821262+00:00：两种正式 APK 均通过。本验收读取最终二进制和签名资源清单，没有构建、修改源码或发布 GitHub。

| 产物 | 大小 | 应用包名 | 内核 |
| --- | ---: | --- | --- |
| `wanba-system-1.2.1.apk` | 59,043,376 字节 | `io.github.jacklee992.wanba` | 系统 WebView |
| `wanba-compat-1.2.1.apk` | 224,393,763 字节 | `io.github.jacklee992.wanba.compat` | Gecko 155.0.1 |

两包的二进制 manifest 均为 `versionName=1.2.1`、`versionCode=4`；未启用 `android:debuggable` 或 `android:testOnly`。APK v2 签名校验通过，发布证书 SHA-256 为 `806ede7461091d6b9668ad32b656d6e20f47d00eb4e11341e04f551377ced777`。

## 内置内容

`content-4` 的 P-256/SHA-256 签名已使用 APK 编译信任根独立验证，`manifest.json` 与已签名 payload 完全相同。序列 **4**，内容快照版本 **1.2.0**，来源提交 `f917d5a79ff57921bd9a1085c7aad440b6b1ed80`。

逐一核对两包 `assets/www/` 的 **81 个资源包、每个 APK 221 个文件**：字节数及 SHA-256 全部相同，无缺失、额外或重复文件。两包内置 channel 与签名发布 channel 字节一致，公钥与信任根一致。

同一批 221 个文件也逐项对照当前工作区与上述 Git 提交中的真实 blob，全部一致；原始许可证文件按构建脚本的路径映射核验。

五语言包为 zh-CN 1.0.2、zh-TW 1.0.2、en 1.0.2、ja 1.0.2、ko 1.0.2；各自的 37 个游戏标题与签名清单一致。玩吧、Nookcade、ヌックケード、눅케이드 品牌和两套 app-icon PNG 已实际入包。

兼容版实际包含 26 个 ARM ELF 动态库，两种 ABI `arm64-v8a` / `armeabi-v7a` 均有 `libxul.so`。已核对 ELF 架构头，并读取包内 `omni.ja`：Gecko `155.0.1`、build `20260903215306`。系统版没有内置 Gecko 动态库。

## lint 与验收边界

Release lint：system：0 错误、17 警告；compat：0 错误、14 警告。原始报告和全部警告已归档，没有屏蔽诊断。构建日志含 BUILD SUCCESSFUL，已归档。

本报告验证正式 APK 签名、版本、资源和内核组成；触控、横竖屏、存档和热更新体验由对应真机/模拟器记录说明。

## SHA-256

```text
2c9974f81766d273d762c8cc18875e482809079a6b9c8c129d297222d3a7f6b7  wanba-system-1.2.1.apk
8988136f202cc8529ced7c06bb45a1c64ab8bf2d00ee630445591697e489ebc6  wanba-compat-1.2.1.apk
```

两个 APK 全部通过后才拷贝到 `.local/releases/v1.2.1/`，拷贝后再次校验 SHA-256。

- [机器可读验收报告](evidence/android-1.2.1/release-integrity/apk-integrity.json)
- [签名、二进制 manifest、逐文件核对和 lint 原始证据](evidence/android-1.2.1/release-integrity/)
- [发布 SHA256SUMS](evidence/android-1.2.1/release-integrity/SHA256SUMS)
- [可复用验收工具](../tools/verify-release-apks.py)
