# 仅内置游戏内容的构建选项

游戏资源更新可通过 Gradle 属性关闭，默认仍开启：

```sh
cd android
./gradlew :app:assembleSystemRelease :app:assembleCompatRelease -PwanbaGameUpdates=false
```

该选项生成 `BuildConfig.WANBA_GAME_UPDATES=false`，同时适用于系统 WebView 和 Gecko 兼容版。APK 内置的 37 款游戏、主题和五语言资源仍由同一份资源准备脚本打包，没有从游戏目录删减代码或素材。修改某个游戏后，应构建并分发新 APK 来提供这类版本的内容更新。

## 关闭后的行为

- 启动只选择 APK 自带的已签名内容，忽略以前下载的 active/candidate/snapshot 和未完成更新检查点。
- 检查、下载、激活、回退接口均在进入工作队列前返回 `GAME_UPDATES_DISABLED`；连接函数还有独立构建守卫。
- 资源存储层拒绝加载外部快照、解压和安装资源包，以及 `/assets/updates/...` 资源读取。
- 以前下载的缓存、用户设置和存档不删除、不改写。关闭版不会把旧更新检查点恢复到用户当前存档上。
- `getContentState()` 返回 `gameUpdatesEnabled:false`，保留内置版本和每款游戏的版本信息，正常启动健康握手继续有效。
- 首页不挂载游戏更新控件或下拉更新手势，列表保留普通滚动。

关于页单独遵循原生能力：`nativeSelfUpdateEnabled:false` 时隐藏外部 APK 下载按钮和安装提示；`appUpdaterEnabled:true` 才显示可选整包更新入口 `#wanba-app-update`，只调用 `NativeBridge.openAppUpdater()`。默认不启用整包更新模块；显式启用属性为 `-PwanbaAppUpdater=true`。这些入口与游戏内容更新是独立能力，原生实现仍须执行各自的构建守卫。

旧版原生桥未提供能力字段时保留既有更新表现；浏览器预览保留下载页面入口。

## 验证记录

2026-09-09：生产 Java 更新器分别用真正的 `static final` ON/OFF 常量重新编译运行：

- ON：原有 111 条真实 Java 断言通过，包含签名、包校验、下载、反重放、恢复和 APK 升级行为。
- OFF：29 条真实 Java 断言通过；模拟已有外部快照、pending/restore、候选、缓存和用户数据，确认全部私有文件摘要保持不变，URL 连接和 HTTP 请求数均为 0。
- 6 项页面能力测试通过，覆盖不挂 DOM/事件、健康握手、关于页入口、旧桥兼容和五语言已有按钮词条。
- 直接提取两种 Activity 的真实 Java 方法及前台信任判断，74 条断言通过：覆盖四种 flag 组合、已销毁/暂停/未受信任页面/失去 session 或 port，以及请求排入主线程后应用转入后台的竞争情况。
- Gecko 扩展桥新第 11 个接口与断开连接测试通过；原有 JSON/Promise/前台桥契约保持通过。
- 最终完整运行 **266 项 JavaScript/Android 主机测试全部通过**，包括允许绑定回环端口后的真实资源服务器测试。

测试命令：

```sh
node --test tests/game-updates-capability.test.mjs android/app/src/compat/tests/content-update.test.mjs
node --test tests/*.test.mjs android/app/src/compat/tests/*.test.mjs
```

最终原始日志：`.local/non-dynamic-update-regression-final.log`。先前受沙箱端口限制及单独重试的记录也保留在 `.local/non-dynamic-update-regression.log`、`.local/non-dynamic-asset-server-regression.log`。本轮没有构建或覆盖已经签名的 1.2.1 发布 APK；真实 OFF APK 的设备验收应使用单独输出目录，避免与已发布产物混淆。

后续已完成独立 QA 构建的实际 APK 核验：两种 flavor 的 OFF release 包均未包含安装权限、整包更新组件、模块类、apksig 类或专属公钥，两个编译开关均为 false，37 款游戏与五语言仍在。ON/OFF 完整矩阵、原始二进制证据和候选摘要见 [实际 APK 构建矩阵](app-updater-build-matrix.md)。这些候选未替换正式发布文件。

正式 1.2.2 源码冻结后，包含 App 增量协议和暂停菜单修复的完整测试集为 **270 项，全部通过**。原始日志位于私有 `.local/qa-app-updater/v1.2.2-all-tests.log`。模拟器还实际验证了 OFF 版本隐藏更新入口、拒绝原生更新调用且继续加载内置游戏：[设备报告](evidence/app-updater/emulator-disabled/report.json)。
