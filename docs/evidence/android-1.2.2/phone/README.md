# HONOR 实机 1.2.2 发布验收

2026-09-09，在显式指定的 HONOR 实机、兼容版包名上完成。设备序列号不进入公开证据。

| 检查 | 结果 |
| --- | --- |
| 安装前正常 SAF 导出 | 1.2.1 / code 4 / 无 DEBUGGABLE；content 4；五项数据齐全 |
| 覆盖安装 | `adb install -r` 已冻结的正式 1.2.2 / code 6 APK，成功 |
| 安装后正常 SAF 导出 | settings、scores、progress、records、sudokuState 五项解析后完全相等，无字段豁免 |
| 游戏内容 | 已采用内置 content 5，snapshot `60dd78b5b5006de9e0488dba2848e60572346f473512e3de8f1354b543c8161c` |
| 祖玛实际触控 | 原有 4,760 分、levelIndex 1、lives 1 可续局，显示神庙皮肤与全屏画面；暂停显示“继续冒险” |
| App 更新入口 | 从正常设置/关于按钮进入独立原生 Activity；点击检查后公开频道返回“App 已是最新版本” |
| 最终包校验 | code 6 / 1.2.2 / 无 DEBUGGABLE / APK v2；已安装 base.apk SHA256 与冻结发行文件完全一致 |
| 设备恢复 | 返回游戏首页；`wm user-rotation=free`，`accelerometer_rotation=1`，`user_rotation=0` |

完整机器可读结果及逐项 SHA256 见 [result.json](result.json)。目标 APK SHA256：`23ebea8f4382a5c356770423020dff19414afe4d307b5f5bc875cab7e1f94bdd`。

截图：[升级前首页](before-home.png)、[祖玛运行全屏](zuma-running-fullscreen.png)、[祖玛暂停](zuma-paused.png)、[原生更新页入口](app-updater-entry.png)、[线上最新版本检查](app-updater-current.png)、[最终首页](home-final.png)。已实际查看运行、暂停与更新页截图；更新页标题位于状态栏下方，深色状态栏与浅色正文有可读对比。

脚本为 [android-app-release-1.2.2.mjs](../../../../tests/android-app-release-1.2.2.mjs)。仅使用原生输入、无调试的 Android UI 层与用户正常导出的 SAF 文件；完整备份保存在 `.local/qa-app-release-1.2.2/phone/{before,after}.json`，临时 UI XML 读取后删除。五项相等性在运行祖玛之前核对，随后真实游戏运行可能按正常行为更新时间与进度。设置导出沿用应用自带的 API 配置脱敏策略，因此结论是“五项正常备份解析结果相等”，不是应用私有存储原始字节相等。

首轮更新页自动化因 Android 将按钮中的 App 显示为 APP 而未命中；修正脚本大小写匹配后重跑成功，没有修改生产代码。1.2.1 本身没有整包更新模块，本机通过覆盖安装首次进入 1.2.2；此记录不宣称本机完成了 App 内差分安装。原生系统差分安装由独立模拟器验收记录覆盖。
