# iOS 1.3.0 Simulator 验收

日期：2026-09-09。Xcode 26.6，iOS 26.5，iPhone 17 Pro Simulator；原生 UIKit 导航和 WKWebView 游戏。本目录不包含设备标识、原始用户备份或访问凭据。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 37 游戏 + WASM/安全来源 | 通过，3 个宿主集成测试 | [结果](ios-37-games-final.json) |
| 原生冷启动未点 tab | 通过，三个标题正常 | [冷启动](tabbar-cold-before-any-tap.png) |
| 五语、横竖屏 | 通过；系统 compact 横排 | [英文](tabs-English.png)、[日文](tabs-日本語.png)、[韩文](tabs-한국어.png)、[繁体](tabs-繁體中文.png)、[横屏](landscape-full-screen.png) |
| 原生玻璃横拖 | Games → My → Settings，成功 | [拖动后](glass-drag-my-to-settings.png) |
| 收藏、卡片拖动排序、冷启动 | 两收藏及新顺序保留 | [冷启动我的](native-favorites-cold.png) |
| 正常 Files 导出/取消/确认导入 | 通过；最后五项解析数据完全恢复 | [原生确认](files-import-confirm.png)、[恢复摘要](backup-restoration-result.json) |
| 新 Snake / Tetris | 真实加速、方向拖动、方块控制、暂停 | [Snake](snake-arena-paused.png)、[Tetris 横屏](tetris-duel-landscape.png) |
| 最后长按菜单修复 | 三种控制各按住 1.2 秒，无文字选择菜单；Snake 运行中截图复核 | [Snake 加速](snake-boost-long-press-no-menu.png)、[方块左移](tetris-left-long-press-no-menu.png)、[方块软降](tetris-soft-long-press-no-menu.png) |
| 泡泡 / 祖玛 / WASM 弹球 | 真实输入与暂停，截图实看 | [泡泡](bubbles-before-shot.png)、[祖玛](zuma-start.png)、[弹球](pinball-touch-paused.png) |
| 自动后台暂停、冷继续 | 真实 HOME / 激活 / 结束进程 / 继续上次 | [后台暂停](bubble-background-paused.png)、[冷继续](bubble-cold-continued.png) |
| 最终资源 + 首页 | 240 文件已编译安装，备份还原后回首页 | [资源摘要](bundled-assets.json)、[最终首页](final-native-home.png) |

原始本地 `.xcresult`：`ios-glass-tests9`、`ios-files-tests2`、`ios-new-games4`、`ios-final-smoke`、`ios-representative2`、`ios-restore-final`、`ios-cold-continue-final`，完成七项 UI 用例；最后一项同时再次还原原始备份并导出，五项深比较完全一致。`ios-final-smoke` 同时包含三个宿主集成测试。它们位于 `.local`，不提交完整录屏和临时 UI 层级。

长按修复后另复跑已有代表项 `ios-long-press-final` / `ios-long-press-confirm`，均通过；第一轮 Snake 碰撞进入结算，公开长按截图使用第二轮仍在运行的画面。`ios-long-press-restore-confirm` 经正常 Files 再次恢复原始备份，五项解析值逐项一致，更新恢复摘要。没有再次完整运行 37 款。

未测：实体 iPhone、iPad、旧 iOS runtime、游戏 FPS/耗电、长期内存稳定性、所有新模式通关、Store/TestFlight。37 款冒烟与最后模式选择页和长按菜单修正后的最终编译分开完成，最终资源哈希以 bundled-assets.json 为准。模拟器构建产物是 `.app`，不能当普通 iPhone 可安装的 IPA。
