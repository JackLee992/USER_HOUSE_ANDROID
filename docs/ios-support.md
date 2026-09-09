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
- 原生 TabBar 的冷启动未点击截图已实际查看，三个标题恢复同基线与居中；五语、横竖屏、拖动/收藏、正常 Files 往返和代表游戏真实触控仍在补充验收，未完成项不能写成通过。

Swift/XCTest 源码和构建命令留在 `ios`；`.xcresult`、原始日志及私有备份在 `.local`。最后打包前必须重新执行资源收集器，纳入并行开发完成后的最终游戏源，并记录新的摘要。
