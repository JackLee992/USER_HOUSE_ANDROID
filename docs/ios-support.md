# iOS 本机离线容器

本轮新增原生 UIKit 游戏目录、收藏、设置和 WKWebView 游戏容器，共用现有 37 个游戏模块与一份存档。默认版本 1.3.0，最低 iOS 17；没有账号、广告或服务器依赖。内测与正式分发步骤另见 [iOS 分发说明](ios-distribution.md)。

## 构建与运行

需要完整 Xcode、已安装的 iOS Simulator runtime、Node.js 和 XcodeGen。项目声明在 `ios/project.yml`，生成的 `ios/Nookcade.xcodeproj` 可直接打开。仓库根目录执行：

```sh
# macOS 首次准备（已安装时跳过）
brew install xcodegen
scripts/build-ios.sh build

# 在本机列表中选一个 iPhone 模拟器，不写死他人的设备标识
xcrun simctl list devices available
IOS_DESTINATION='platform=iOS Simulator,id=<本机模拟器 UUID>' scripts/build-ios.sh test
```

UI 用例会真实收藏、排序和玩游戏；请在专用测试模拟器运行，先经设置 → 导出备份保存基线。恢复用例 `testRestoreChosenBackupAndExport` 仅在指定 `TEST_RUNNER_IOS_QA_BACKUP_NAME`（原始导出文件名的唯一部分）时执行，通过系统 Files 选择该文件并确认导入，不直接写游戏存档。

Debug Simulator 应用输出为 `ios/DerivedData/Build/Products/Debug-iphonesimulator/Nookcade.app`。模拟器构建使用 `CODE_SIGNING_ALLOWED=NO`，不需要付费开发者账号。这是模拟器 `.app`，不是可安装到普通 iPhone 的 IPA；正式签名、TestFlight 和 App Store 需要另走分发流程。

`scripts/prepare-ios-assets.mjs` 复用已有资源收集器，拷贝游戏、ES modules、语言包、图册、WASM/Worker、完整弹球数据和许可证至 `ios/build/www`，生成 iOS 内置版本元数据。它不改变原始 Web 源，也不从网络拉取游戏。`scripts/prepare-ios-icon.swift` 验证既有 imagegen 品牌源每个像素均不透明，再用 Apple 图像框架生成 1024×1024 RGB AppIcon；不重绘、覆盖原图或保留透明通道。

## 架构边界

| 组件 | 职责 |
| --- | --- |
| `NativeShell.swift` | `UICollectionView` 两列目录、原生分段选择、收藏及拖动排序、原生设置；iOS 18+ 使用 `UITab`，iOS 17 使用系统 `UITabBarItem`。 |
| `GameHost.swift` / `Bridge.js` | 唯一持久 WKWebView、白名单数据桥、后台暂停保存、系统 alert/confirm、Files 导入导出。 |
| `LoopbackServer.swift` | 仅监听固定 `127.0.0.1:18737`，只读应用 Bundle；支持 module/WASM MIME 与有界 Range 请求。 |
| `standalone/app.js` 的 `wanbaApp` | 目录、偏好、语言、性能、游戏启动、备份验证与导入的唯一状态源。 |

首页使用浅底 `#f5f6fa`、白卡、主文字 `#202636`、次文字 `#647087`、强调色 `#4b5ecb`。卡片圆角 18pt、图标 68pt、收藏按钮 44pt；大标题和设置列表遵循系统 UIKit。My 只展示真实收藏，没有虚构的“最近玩过”。图标后台串行解码、同请求合并，缩略图缓存上限 8 MiB、源图缓存上限 16 MiB/两张；复用单元格核对游戏 ID，防止异步结果串图。原生下拉刷新读取当前本机目录与成绩，不暗示远程资源更新。

iOS 26 保留系统 Liquid Glass TabBar 的透明与拖动交互。冷启动曾发现未选中标签偏移：早期实现先挂载空 `UITabBarItem`，再异步修改图标和标题。最终路径先等待真实目录和语言，再一次建立完整 `UITab(title,image,identifier,provider)`；页面大标题只写 `navigationItem.title`。不使用补偿偏移、自绘底栏或关闭透明来遮盖问题。重复目录通知也不重复设置已同步的选中项，以免干扰系统拖动预览。

## 本机来源、存档与备份

选择固定 HTTP loopback，而不是改造自定义 URL scheme：现有弹球模块依赖标准 URL origin、iframe `postMessage` 目标来源、Worker 与 WASM。应用确认独占端口绑定成功后才加载页面；绑定失败即停止启动，不访问可能属于其他进程的服务。HTTP 只允许 GET/HEAD、精确 Host/Origin，拒绝路径穿越、隐藏文件、越界/多段 Range 和 Bundle 外符号链接。没有 HTTP 写入、存档读取接口或局域网监听。

WebView 使用系统 [默认持久网站数据存储](https://developer.apple.com/documentation/webkit/wkwebsitedatastore/default())，固定 origin 跨启动保持 localStorage/IndexedDB。离开前台调用共享 `pause()`、`save()`，返回前台不自动开始游戏。桥只接收本机主 frame 的固定方法，不接受任意代码或 URL；用户点外部 HTTPS 链接交系统浏览器。

备份经普通 Files 文档选择器导出、导入；导入在原生确认前调用共享 `validateBackup`，确认后才 `importBackup(text,true)`，拒绝超 16 MiB 输入。没有另建原生游戏存档副本。卸载会删除本机存档，正式换机前应先导出。强制结束进程时不能保证来得及运行终止回调，应使用游戏正常保存/退出；后台保存和冷恢复需按下面的实际验收结果评估。

## 更新与内核

iOS 的 `gameUpdatesEnabled`、`appUpdaterEnabled`、`nativeSelfUpdateEnabled` 固定为 false；本版仅随应用打包内置资源，不显示下载 APK 或 Android 包更新入口。将来若实现 iOS 内容更新，必须作为单独模块重新评估商店规则、签名校验与原子激活，不能把现有 Android Java 实现当作已移植。

使用系统 WebKit，不承诺在全球 iOS 内置 Chromium/Gecko。Apple 的[替代浏览器引擎说明](https://developer.apple.com/support/alternative-browser-engines/)要求地区限定、专门 entitlement 以及持续安全合规；其内嵌浏览器授权还明确区分网络浏览体验与仅应用内置的内容。因此它不适合作为这批全球离线小游戏的默认技术前提。`appInfo.engineVersion` 本版显示宿主 iOS 版本，不冒充独立可更新的 WebKit 构建版本。

## 实际验证记录

环境为 Xcode 26.6 / iOS 26.5 Simulator / iPhone 17 Pro；尚无实体 iPhone 验证，也未做 App Store 审核提交。

- Simulator Debug 完整构建、安装、启动已经成功；9 项 JS app-info 回归通过。
- `LoopbackTests` 已通过合法请求、模块/WASM MIME、Range 边界、跨来源、路径穿越与符号链接拒绝检查。
- `OfflineGamesTests` 在实际 WKWebView 内启动全部 37 款游戏并暂停/保存通过，弹球 iframe 的完整 WASM 引擎报告 ready；`isSecureContext`、WebAssembly 与 WebGL context 创建均为 true，捕获的未处理 JS error 为空。此项是模拟器内程序驱动的集成检查，不等同每款游戏都有真人触控或性能实测。
- 原生 TabBar 冷启动未点击、逐项点击、五种语言、横竖屏均经 XCTest 和实际截图核对。Games → My → Settings 真实长按横拖成功，保留系统透明玻璃效果；首页原生下拉刷新、收藏两项、卡片拖动排序及冷启动持久化通过。横屏证据使用 `XCUIScreen` 截取整个屏幕，避免 `XCUIApplication.screenshot()` 在旋转时错误裁剪。
- 新贪吃蛇竞技场实际长按加速、摇杆拖动、暂停通过；另一次试跑发生真实碰撞结算。新俄罗斯方块 AI 对战实际左移、旋转、暂存、硬降、横屏和暂停通过。此项不代表所有新玩法都已逐项完成 iOS 通关验收。
- 最后加入限定游戏区域的文字选择/触摸菜单修复后，重新编译并复跑代表项：Snake 加速、Tetris 左移和软降各真实长按 1.2 秒，原生菜单断言通过，实际截图没有选择菜单。Snake 首次该轮长按后碰撞结算，另一次复跑捕获仍在运行的画面并正常暂停；未用结算页替代持续游戏画面的视觉核对。
- 泡泡龙换球、一次发射、暂停；祖玛换球、一次发射、暂停、保存退出；完整弹球蓄力和左右挡板触控、暂停均已实际执行并截图。弹球完整 WASM ready 由独立 WK 集成测试确认；未测实体设备 FPS、耗电、长时间稳定性，也未声称三款完整通关。
- 泡泡另完成真实 HOME 后台 → 回前台自动保持暂停、保存退出 → 结束进程 → 冷启动 → “继续上次” → 棋盘恢复，再暂停保存；整个流程没有通过 DOM click 或直接写存档代替触控。
- 正常系统 Files 导出、选择文件后取消导入、再次确认导入通过。所有测试结束后正常导入原始备份再导出，`settings / scores / progress / records / sudokuState` 五项解析后逐项完全一致；公开证据仅含校验摘要，原始 JSON 仅留 `.local`。随后返回中文竖屏首页；该导航允许更新 `lastTab`。

最后一次资源收集与 Simulator 编译包含模式选择页布局和长按菜单修复，共 240 文件、61,570,566 字节；资源 SHA-256 为 `a3aefab1fef0db71ca2d1d9f6ffc47c1102992117eda3f55a7e66b5d66be123d`，实际 `.app` 内摘要已核对一致。37 款冒烟在最后模式页 CSS 调整前通过，最后包又完成 Snake/Tetris 长按代表项、Files 原始备份恢复与五项导出深比较、首页启动；不把两者写成一次未发生的全量运行。实际截图、37 款结果及恢复摘要见 [iOS 验收证据](../ios/evidence/README.md)。

## 隐私声明核对

本版 `PrivacyInfo.xcprivacy` 声明不跟踪、不收集用户数据，required-reason API 数组为空。2026-09-09 对照 Apple [NSPrivacyAccessedAPIType 官方列表](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype)：当前宿主只使用 `URL.resourceValues` 的 `fileSizeKey` / `isRegularFileKey` 做大小与普通文件检查，没有文件时间键、`stat/getattrlist` 族、磁盘容量、系统启动时间或 `UserDefaults` 调用；实际 Debug dylib 未导入上述敏感 POSIX/启动时间符号。因此不为尚未使用的 API 伪填理由。系统 WebKit 的持久存储不等于宿主调用 UserDefaults。后续增加 SDK、文件元数据、磁盘空间或启动计时功能时应重新核对；仍需对正式签名归档做 Xcode 隐私报告和 App Store Connect 校验，本轮未完成商店验证。

Swift/XCTest 源码和构建命令留在 `ios`；`.xcresult`、原始日志及私有备份在 `.local`。未来打包前仍须重新执行资源收集器，并记录新的摘要。未做实体 iPhone、iPad、iOS 17/18 runtime、TestFlight 或 App Store 实测。
