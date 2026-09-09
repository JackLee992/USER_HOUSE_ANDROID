# 玩吧：原生应用外壳与共享游戏

设计与接口核对：2026-09-09。实现状态和设备验收以发行说明及对应证据为准。

## 页面结构

新版 Android / iOS 使用原生游戏列表、我的收藏、设置和选择器。游戏仍使用同一份 JavaScript / Canvas / WebGL / WebAssembly 代码，在常驻的引擎视图中运行。旧版 Android 可以通过 core 内容更新继续使用统一样式的网页入口。

游戏入口分为单人游戏、人机挑战；我的仅显示用户主动收藏的游戏。收藏按钮与启动按钮各自独立，取消收藏不删除存档。长按拖动排序有上移、下移替代操作。排序保存为全局游戏 ID 顺序；筛选列表中重排只替换可见游戏的原有位置，新游戏自动追加。关闭应用、切换语言和导入备份都沿用同一份收藏与排序。

原生层不维护第二份进度或收藏数据库。界面通过下述宿主接口读取共享设置；图片从当前应用资源中按既有图集的完整 sourceRect 绘制。图片缩略图异步解码并缓存，滚动期间不反复解析全部图集。

## 统一风格

浅色背景 `#f5f6fa`，白色卡片，主文本 `#202636`，次文本 `#647087`，强调色 `#4b5ecb`。取消用户主题切换；旧主题值读取/导入时归一到固定设计。布局留白以 8 点为基础；常用操作使用平台原生触控、滚动、选择器、无障碍与返回行为。游戏卡片统一图标尺寸、圆角、标题与成绩层级，避免装饰背景、不断闪烁的动效和模糊滤镜。

参考来源：

- [Apple Games 官方页面](https://games.apple.com/)：游戏库、返回常玩游戏与明确的主要导航。这里借鉴内容层级和快速进入游戏的路径。
- [Offline Games 官方 App Store 页](https://apps.apple.com/us/app/offline-games-no-wifi-games/id6448104157)：离线小游戏集合、清楚展示每个游戏及其类型。未安装或完整审计该竞品，不据商店文案推断其性能。
- [Android 官方布局与导航](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns?hl=en)：紧凑屏使用底部主要导航，宽屏适配导航栏；目的地保持同层级。
- [Material 颜色角色](https://github.com/material-components/material-components-android/blob/master/docs/theming/Color.md)：用表面与文字颜色表达层级，避免把装饰当成状态。

## 宿主接口 v1

初始化完成后访问 `window.wanbaApp`。原生调用使用固定方法及 JSON 参数，网页不能传任意 JavaScript 命令给原生。

| 方法 | 返回/作用 |
| --- | --- |
| `checkpoint()` | 更新前生成原有 `{ok,idle,storage}` 检查点；沿用内容更新宿主协议 |
| `catalog()` | `{schema:1,games,preferences,tab,game,locale,locales,performance,rememberWindow,appInfo,labels}` |
| `setCatalog({favorites,order})` | `{ok}`；过滤重复、未知 ID；实际写入既有 settings key；失败不提交新视图 |
| `launch(id, fromTab)` | `{ok,error?}`；只接受登记的游戏与 single/double/my 来源，My 返回路径保留 |
| `openShellTab(tab)` | `{ok,error?}`；保存并退出当前游戏，切换 single/double/my/settings |
| `setLocale(code)` | Promise `{ok}`；简体、繁体、英语、日语、韩语 |
| `setPerformance(mode)` | `{ok}`；eco/normal/game，与游戏渲染服务共用 |
| `setRememberWindow(bool)` | `{ok}`；沿用既有启动偏好 |
| `exportBackup()` | 使用已有原生保存文件桥导出备份 |
| `backupData()` | 完整标准备份 JSON 文本，供平台文件面板使用 |
| `validateBackup(text)` | `{ok,count?,error?}`；只校验，不写入 |
| `importBackup(text,true)` | `{ok,error?}`；原生确认后重新验证并原子写入，失败恢复原数据；游戏运行中拒绝导入 |
| `pause()/save()/back()` | 平台进入后台、退出和系统返回时沿用游戏生命周期 |

`games` 每项含 `id/name/mode/score/icon`；`icon` 含可信当前源的 `path/url/sourceSize/sourceRect`，平台必须检查自身资源路径/源，不能根据外来 URL 发任意网络请求。`labels` 包含全部界面中文源文案与动态模板 ID，value 是当前语言文字。动态更新消息可用 `downloadingPackage`、`githubDownloadFailure`、`resourceVersion` 等模板的 `{value}` 参数；原生层不能直接把未翻译的中文任务消息当最终文案。

网页在准备好以后，以及导航、收藏、排序、偏好变化后调用可选 `NativeBridge.onShellState(JSON.stringify(catalog()))`。同时分发 `wanba:navigation` 事件，detail 为 `{tab,game}`。退出游戏后原生层重新显示列表并更新成绩；底层引擎保持同一个存储源。

主页面桥仅对应用自有可信文档开放。Android 继续使用已有签名资源机制；首版 iOS 随包提供离线游戏，不启用 Android APK 更新或下载式游戏更新。未来 iOS 内容更新是独立工程与审核能力，不因为共用游戏源码而自动开启。

## 跨端原生布局与透明导航

Android 与 iOS 使用相同的页面结构和视觉尺寸：横向页面边距 20、卡片间隔 12、圆角 18、图标 68、图标内边距 14、标题 17、成绩 12。常规卡片高 194，大字体使用更高卡片。设置使用分组白色面板、主标题与副标题、系统选择器；界面语言和性能选项可以直接点击，取消主题选择。Android 按 dp/sp，iOS 按 point 和系统动态字体适配各自显示设置与安全区。

iOS 使用完整的系统 `UITab`，保留 iOS 26 原生 Liquid Glass 透明、浮动和按住拖动交互。必须等真实语言与目录就绪后，再一次建立含标题、图标和 ID 的 Tab，避免先挂空项目再异步补内容导致未选中标题首次布局错位。导航大标题使用 `navigationItem.title`，不反复写入 Tab 标题。较旧 iOS 使用系统默认 TabBar。

Android 使用原生视图实现半透明圆角浮动底栏和可跟随手指移动的选中背景。拖动过程中只更新本地视图属性，松开才提交一次导航；移出底栏、纵向离开、多指和取消事件恢复原选择，点击与无障碍按钮仍可用。此实现没有逐帧截屏模糊，也不宣称提供 iOS 系统的光学折射效果。三项图标与文字位置固定，选中状态不会改变布局。

目录下拉刷新使用各端原生刷新控件。iOS 当前只刷新随应用内置的目录；Android 使用签名内容频道，游戏包更新与 APK 更新分别维护。进入 Android 首页时的检查与有更新才出现的提示由原生更新模块负责；下载、切换内容或调用系统安装仍由用户在提示中明确选择。iOS 不显示 Android 的 APK 更新工具。
