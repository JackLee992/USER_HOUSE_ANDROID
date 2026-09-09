# 玩吧 1.2.2 正式 APK 完整性验收

2026-09-09T05:10:33.361097+00:00：两种正式 APK 均通过。本验收读取最终二进制和签名资源清单，没有构建、修改源码或发布 GitHub。

| 产物 | 大小 | 应用包名 | 内核 |
| --- | ---: | --- | --- |
| `wanba-system-1.2.2.apk` | 59,222,579 字节 | `io.github.jacklee992.wanba` | 系统 WebView |
| `wanba-compat-1.2.2.apk` | 224,569,378 字节 | `io.github.jacklee992.wanba.compat` | Gecko 155.0.1 |

两包的二进制 manifest 均为 `versionName=1.2.2`、`versionCode=6`；未启用 `android:debuggable` 或 `android:testOnly`。APK v2 签名校验通过，发布证书 SHA-256 为 `806ede7461091d6b9668ad32b656d6e20f47d00eb4e11341e04f551377ced777`。

已从实际 DEX 读取构建开关：`WANBA_APP_UPDATER=true`、`WANBA_GAME_UPDATES=true`。 两包均实际包含整包更新器及 APK 签名验证类、安装权限和独立 P-256 公钥；更新 Activity 与安装结果 Receiver 均明确未导出。公钥字节与指定信任根一致，详细 DEX、组件和公钥摘要已归档。

## 内置内容

`content-5` 的 P-256/SHA-256 签名已使用 APK 编译信任根独立验证，`manifest.json` 与已签名 payload 完全相同。序列 **5**，内容快照版本 **1.2.1**，来源提交 `7ec8a6defde450b662fd491d27dc4c46d72cef62`。

逐一核对两包 `assets/www/` 的 **81 个资源包、每个 APK 221 个文件**：字节数及 SHA-256 全部相同，无缺失、额外或重复文件。两包内置 channel 与签名发布 channel 字节一致，公钥与信任根一致。

同一批 221 个文件也逐项对照当前工作区与上述 Git 提交中的真实 blob，全部一致；原始许可证文件按构建脚本的路径映射核验。

五语言包为 zh-CN 1.0.2、zh-TW 1.0.2、en 1.0.2、ja 1.0.2、ko 1.0.2；各自的 37 个游戏标题与签名清单一致。玩吧、Nookcade、ヌックケード、눅케이드 品牌和两套 app-icon PNG 已实际入包。

兼容版实际包含 26 个 ARM ELF 动态库，两种 ABI `arm64-v8a` / `armeabi-v7a` 均有 `libxul.so`。已核对 ELF 架构头，并读取包内 `omni.ja`：Gecko `155.0.1`、build `20260903215306`。系统版没有内置 Gecko 动态库。

## lint 与验收边界

Release lint：system：0 错误、17 警告；compat：0 错误、14 警告。原始报告和全部警告已归档，没有屏蔽诊断。构建日志含 BUILD SUCCESSFUL，已归档。

最终主机回归 **270 / 270 通过，0 失败、0 跳过**，原始结果见 [host-tests.log](evidence/android-1.2.2/release-integrity/host-tests.log)。公开证据经文本凭据扫描，真机序列号统一替换为 `test-phone`，未经脱敏的原件只留本地私有目录；扫描范围和限制见 [公开证据检查](evidence/android-1.2.2/release-integrity/public-evidence-scan.json)。

本报告验证正式 APK 签名、版本、资源和内核组成；触控、横竖屏、存档和热更新体验由对应真机/模拟器记录说明。

## 整包更新清单与四份差分

后续已完成 `app-updates.json` 的独立 P-256/SHA-256 验签，以及其中所有完整 APK、基包、差分包的 URL、版本、证书、长度和 SHA-256 对照。整包更新清单为独立序号 **1**，签名域 `wanba-apk-update`；它与上面的游戏内容 `content-5` 序号分别维护。签发时间为 **2026-09-09 05:12:19 UTC**，有效期至 **2026-10-09 05:12:19 UTC**。过期后需以更高序号续签频道，不能重复使用已过期清单。

清单 envelope SHA-256：`15d2d7d7b3fadc669282ec6b1fdbb0e88aa8e5e4b8906f8852b63da364bb8817`。

| Flavor | 基包 → 目标 | 差分字节 | 独立流式重建 |
| --- | --- | ---: | --- |
| system | 1.2.1/code 4 → 1.2.2/code 6 | 1,158,068 | 与最终 APK SHA-256 一致 |
| system | 内部 RC1/code 5 → 1.2.2/code 6 | 884,176 | 与最终 APK SHA-256 一致 |
| compat | 1.2.1/code 4 → 1.2.2/code 6 | 5,880,751 | 与最终 APK SHA-256 一致 |
| compat | 内部 RC1/code 5 → 1.2.2/code 6 | 1,969,930 | 与最终 APK SHA-256 一致 |

本次使用独立 Python 解析器按 32 KiB 缓冲处理 COPY/ADD 数据，校验偏移、长度、操作数和结束边界，四次重建摘要均等于已通过 APK 签名验收的最终文件。详细结果见 [整包更新产物校验](evidence/android-1.2.2/release-integrity/app-update-artifacts.json)。这是本地产物核验；线上可达性、系统安装和存档验收另行记录。旧 1.2.1 本身没有整包更新入口，首次使用此功能仍需正常安装新版 APK。

## SHA-256

以下列出两个 APK；链接中的 `SHA256SUMS` 另包含四份差分、`app-updates.json` 和 `apk-integrity.json`，共八项，排除校验和文件自身。

```text
d1706b1ecc8c601f30bf5f546ac025c3d0ef31685701b50f4223941fac01f892  wanba-system-1.2.2.apk
23ebea8f4382a5c356770423020dff19414afe4d307b5f5bc875cab7e1f94bdd  wanba-compat-1.2.2.apk
```

两个 APK 全部通过后才拷贝到 `.local/releases/v1.2.2/`，拷贝后再次校验 SHA-256。

- [机器可读验收报告](evidence/android-1.2.2/release-integrity/apk-integrity.json)
- [签名、二进制 manifest、逐文件核对和 lint 原始证据](evidence/android-1.2.2/release-integrity/)
- [发布 SHA256SUMS](evidence/android-1.2.2/release-integrity/SHA256SUMS)
- [可复用验收工具](../tools/verify-release-apks.py)
