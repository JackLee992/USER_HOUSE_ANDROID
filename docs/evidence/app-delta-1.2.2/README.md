# App增量安装原生验收：通过

2026-09-09，emulator-5554从内部非调试system RC1/code5，经公开频道与真实Android安装器升级到稳定1.2.2/code6；未使用CDP或adb install。

- 原生完成摘要确认实际下载 **884,176字节**，完整APK为59,222,579字节；增量约占1.49%，无完整包fallback。数值仅计HTTP响应体。
- 已通过系统来源许可并实际点击Android **Update**。升级后没有DEBUGGABLE，安装的完整base.apk SHA256为 `d1706b1ecc8c601f30bf5f546ac025c3d0ef31685701b50f4223941fac01f892`，与签名发布文件一致。
- 前后正常SAF导出的**五项解析JSON逐字段全等**；progress含37个游戏条目，content5保持。备份原文只在`.local/qa-app-delta-1.2.2/`。
- 已返回目录，恢复代理null、旋转free/1/0，仅移除模拟器9224转发。

系统授权页使用生产英文名称Nookcade，Compose开关与WebView无障碍控件的类型和ID也不同。最初测试选择器识别失败，修正后从同一授权现场继续，保留原基线与已下载补丁，未改生产或重新下载；历史失败图已移到私有目录。

[报告](report.json) · [实际下载字节](native-verified-apk.png) · [系统安装确认](os-install-confirm.png) · [最终目录](stable-home-final.png) · [恢复设置](cleanup.json)

脚本：`tests/android-app-delta-release.mjs`。这项证明实际APK差分安装与SAF保档，不混称原始localStorage字节比较，也不表示旧版APK已有App更新入口。
