# 玩吧 Android 1.0.0 验证记录

验证日期：2026-09-08。游戏基线：USER_HOUSE 3.10.0 / `a7073be7683fd900c38c4e3d2a17e8d37e8c2a1a`。

## 环境与范围

- 隔离模拟器 `emulator-5554`，Android 15 / API 35，arm64，1080×2400。
- Android System WebView 124.0.6367.219。
- 真正安装的 `io.github.jacklee992.wanba` APK，入口 `https://appassets.androidplatform.net/assets/www/standalone/index.html`。
- Debug 使用与 Release 相同的私有发布证书，仅 Debug 允许 CDP。正式包不带 DEBUGGABLE 标志并显式请求关闭 CDP；本模拟器的 userdebug 内核例外见下文。
- 37款均检查开局、选择模式/先手、渲染、暂停、返回；4款重点游戏进一步测试真实触控及系统生命周期。这不代表37款全部难度、全部关卡均完整通关。
- 本次未使用真实用户手机；没有将桌面无头测试或旧版 Via 结果冒充新 APK 实测。

## 已完成结果

| 检查 | 结果 / 证据 |
| --- | --- |
| 单元及逻辑回归 | 135 / 135通过，[完整输出](evidence/android-1.0/node-tests.txt) |
| 原生资源策略、打包检查 | 包含在上述135项中，8项检查覆盖真实Java URL/MIME策略与资源打包 |
| Release正式lint | `No issues found.`，[记录](evidence/android-1.0/android-release-lint.txt) |
| 37游戏正式入口 | 全部启动并暂停，无未捕获运行异常、无外部HTTP资源请求，[逐款记录](evidence/android-1.0/games-smoke.json) |
| 空当接龙 | 真触控搬牌至空当、撤销、随步归档开关；按Home再回来保持同一局面，等待用户继续 |
| 消消乐 | 真实点选推荐相邻宝石后消除得分；经典/破冰/无限切换并保留各自棋盘 |
| 泡泡龙 | 真实触控瞄准发射；Home返回保持暂停；本次沿用已回归的时间推进实现 |
| 三维弹球 | 本地WASM与343组件球台加载；长按发射、双指挡板；自然运行取得得分并扣球；Home冻结引擎ticks，继续后恢复 |
| 重点游戏证据 | [操作记录](evidence/android-1.0/play-regression.json)、[弹球自然运行](evidence/android-1.0/pinball-natural.json) |
| Android系统备份 | ACTION_CREATE_DOCUMENT保存有效JSON；取消导出有提示；真实触控调用文件选择器，选择备份、确认导入并恢复主题与进度；取消导入保持数据，[记录](evidence/android-1.0/saf-regression.json) |
| 本地许可 | 能离线打开完整许可证；系统返回仅关闭最上层查看窗口 |
| 独立能力 | 无jQuery、SillyTavern或wbTest全局；7主题；禁用旧备份中的角色、API、宠物与远程字体设置 |
| 新图标 | imagegen生成；透明前景在66dp安全圆内；圆形/方圆形/48像素预览验收，[设计文档](wanba-icon-prompts.md)，[实际Android启动器图标](evidence/android-1.0/launcher-device.png) |

回归期间发现消消乐内部确认框未接入系统返回层级，已修正：第一次返回取消确认并保留棋局，第二次返回游戏目录。新增针对性回归包含在135项中；最终APK另做实际系统返回验证。

## 覆盖安装与断网冷启动

最终包已完成同签名 Debug → Release → Debug 读回校验，进度、分数和记录逐项完全一致，主题保持为测试设置。随后重新安装 Release 留在模拟器。关闭模拟器 Wi-Fi 与移动数据后，强制停止再启动能恢复上次游戏提示；测试结束恢复原无线设置。[原始记录](evidence/android-1.0/upgrade-offline.json)、[正式包冷启动截图](evidence/android-1.0/release-offline-device.png)。

本次验证为同版本同签名覆盖，不宣称已测试尚未发布的1.1版本；后续发布需递增versionCode并使用同一签名。

## 调试环境的验证边界

设备实读 `ro.build.type=userdebug`、`ro.debuggable=1`。Release 包未设置 DEBUGGABLE 且代码显式传入 false，但本模拟器的 WebView 124 仍开放本地 DevTools。Chromium 124 的 [SharedStatics](https://chromium.googlesource.com/chromium/src/+/refs/tags/124.0.6367.54/android_webview/glue/java/src/com/android/webview/chromium/SharedStatics.java#91) 在调试系统或调试宿主下忽略关闭请求，[BuildInfo](https://chromium.googlesource.com/chromium/src/+/refs/tags/124.0.6367.54/base/android/java/src/org/chromium/base/BuildInfo.java#373) 包含 userdebug/eng 条件。因此这里没有把“普通 user 系统上 Release 的 CDP 已实测关闭”列为通过项。代码和包标志已核对；普通量产系统上的关闭行为仍需该类设备验证。

## 安装包

- 名称：玩吧；版本1.0.0 / versionCode 1；包名 `io.github.jacklee992.wanba`。
- Android最低8.0，WebView最低兼容线124；旧内核用原生界面提示更新，不让用户停在无法执行的网页入口。
- Release大小28,765,839字节（约27.4 MiB）。
- Release SHA256：`96d502c9328f410f45b191077eca75e4d05fec8714b5e5dd48f917e970cff5ae`。
- 发布证书SHA256：`806ede7461091d6b9668ad32b656d6e20f47d00eb4e11341e04f551377ced777`。
- 不申请INTERNET与广泛存储权限；仅打包运行资源及依赖许可证。导入导出通过系统选择器授予单次文件访问。

## 复现入口

先在授权的隔离模拟器安装同签名Debug APK并启动。测试工具默认本机SDK adb路径、模拟器5554与CDP9224，可按本机环境调整；不要指向个人生产设备。

```sh
node --test tests/*.test.mjs
node tests/android-games-smoke.mjs
node tests/android-play-regression.mjs
```

系统备份用例 `tests/android-saf-check.mjs` 要求先在玩吧设置页，并已建立可恢复的游戏进度。测试通过实际触控打开文件选择器，而不是向隐藏文件输入框注入数据。它会在隔离模拟器Downloads留下测试备份。

构建与安装说明见 [README](../README.md)。全部UX建议及后续优先级见 [37款游戏审计稿](game-ux-audit-v1.md)。
