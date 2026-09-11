# 玩吧 / Nookcade 1.3.1 三平台发布验收

验收日期：2026-09-11。共享游戏源码、Android/iOS App、独立游戏包和酒馆插件均来自本次 1.3.1 发布链路。

## 发布结果

| 平台 | 版本 | 状态 |
| --- | --- | --- |
| Android system / compat | 1.3.1，versionCode 8 | 正式签名包已构建、校验并在模拟器和三星真机覆盖安装 |
| iOS / TestFlight | Nookcade 1.3.1 (3) | arm64 归档成功并上传 App Store Connect，等待 Apple 处理 |
| 独立游戏包 | content-12 / 内容 1.5.1 | GitHub immutable Release 与发布工作流成功 |
| 酒馆插件 | 3.11.0 | 37 款游戏已同步至主分支并发布 GitHub Release |

发布地址：

- Android App：https://github.com/JackLee992/USER_HOUSE_ANDROID/releases/tag/v1.3.1
- 游戏包：https://github.com/JackLee992/USER_HOUSE_GAME_PACKS/releases/tag/content-12
- 酒馆插件：https://github.com/JackLee992/USER_HOUSE/releases/tag/v3.11.0
- TestFlight 公开邀请：https://testflight.apple.com/join/zddwjUZV

## 游戏包独立更新

在仍为 Android App 1.3.0、versionCode 7 且激活 `content-10` 的模拟器上，通过正式 GitHub 签名通道检查并安装 `content-12`，没有重装 APK。更新只下载 `core`、空档接龙、贪吃蛇、俄罗斯方块和祖玛 5 个变化包，共 519,134 字节；另外 76 个包按摘要复用。激活后快照 ID 为 `cef4a54ce78eb7419d8389590208ff740010fa8ed6a60fa70dc0fb61cf125be2`，启动健康，设置、分数、进度、记录和数独状态的原始摘要全部保持一致。

旧 App 可获得新的游戏代码与玩法；挖孔区覆盖等原生宿主修复随 App 1.3.1 更新生效。

## Android 验收

- 共享自动化 374/374、Android 原生兼容测试 37/37 通过。
- 两种正式 APK 均为 versionCode 8、正式证书签名，内置 `content-12`；81 个资源包、37 款游戏和每包 240 个运行文件逐字节一致。
- system APK SHA-256：`499c9fabd2c9b6a413ceb56d56617a2f2caba34bf4b5bae04aeaeb013182c389`。
- compat APK SHA-256：`8b8836b49086ff128a1a818838a5148c5202d00d2f06bfae92697df55d081f3e`；内置 GeckoView 155.0.1，两种 ARM ABI 完整。
- 1.3.0 到 1.3.1 的 system 差分为 2,464,616 字节，compat 差分为 2,517,739 字节；Java 生产实现重建出的 APK 摘要和签名均与正式包一致。
- 模拟器实测经典贪吃蛇竖屏、横屏均覆盖物理显示的全部像素，三次连续方向输入按序执行，暂停冻结状态，三档速度即时生效。
- 三星真机正式包覆盖安装后确认版本 1.3.1；全屏画面覆盖挖孔与底部区域，三档速度、方向键输入和暂停均可操作。

## iOS 验收

- 单元测试、37 款离线游戏启动和祖玛开场状态检查通过。
- UI 套件 8 项中 6 项通过、1 项因没有提供恢复夹具而跳过、1 项祖玛横屏边界检查失败；失败现场为模拟器未接受横屏方向请求。此前 iPhone 真机已验证祖玛横竖屏全屏。
- iPhone 17 Pro 模拟器上的 1.3.1 (3) 已实测经典贪吃蛇全屏、三档速度、方向键和暂停；画面正确延伸到 Dynamic Island 与底部手势区域。
- arm64 设备归档成功，Xcode Organizer 已完成 App Store Connect 上传。上传完成不等于 Apple 已处理或外部组已经切换构建。

## 酒馆插件验收

- 同步器仅复制共享 Web 运行层、游戏、语言和美术，共 157 个受控文件；逐文件摘要与移动端源码一致。
- 插件清单版本为 3.11.0，保留 `auto_update: true`；已有用户可在酒馆扩展管理器中从主分支原地更新。
- 插件自动化测试 120/120 通过，GitHub Release 已发布。

后续每次游戏变更按 [三平台发布流程](three-platform-release.md) 同步：先固定共享源码提交，再发布独立游戏包、酒馆插件、iOS 构建和 Android 两种 APK，并分别保留平台验证结果。
