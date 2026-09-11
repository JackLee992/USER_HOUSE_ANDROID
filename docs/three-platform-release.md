# Android、iOS 与酒馆插件同步发布

37 款游戏的唯一开发源位于本仓库的 `src/games/plugins`。Android 游戏包、iOS 内置资源和 SillyTavern 插件都从同一个源码提交生成，发行记录必须写入这个完整提交哈希。

## 发行顺序

1. 修改游戏入口中的 `GAME_VERSION`，完成共享逻辑测试和 Android/iOS 触控回归，再提交并推送源码。
2. 用 `tools/content/build-packs.mjs` 生成签名游戏包；Android 只下载版本发生变化的包。发布后从上一内容快照实测原地升级，不能用重装 App 代替。
3. 把共享运行层同步到独立酒馆插件仓库：

   ```sh
   node scripts/sync-sillytavern-plugin.mjs \
     --target ../USER_HOUSE --version 3.11.0
   ```

   同步器要求目标仓库干净且远端名为 `USER_HOUSE`，只复制 Web 游戏、运行层、语言和游戏美术，不把 Android/iOS 工程与数百 MB 的设备证据带进插件下载。`release-source.json` 记录同一源码提交。完成插件测试后提交主分支并创建同版本 GitHub Release，酒馆用户可在扩展管理中原地更新。
4. 运行 `scripts/prepare-ios-assets.mjs` 后用 Xcode 测试、Archive 并上传 TestFlight；iOS 当前将同一游戏快照内置在 App 中。
5. Android 轻量版和兼容版都从同一内置清单构建，校验 APK 签名与 SHA-256 后创建 App Release。

## 发布门槛

- Android、iOS 和酒馆插件报告的游戏版本相同，当前贪吃蛇为 `1.2.1`。
- 三端均验证开局、三档速度切换、连续转向、暂停、重开、存档和退出。
- Android 额外验证旧内容快照只下载变化包并保留存档；iOS 额外验证安全区和横竖屏；酒馆插件额外验证 SillyTavern 的启用、原地更新与页面刷新。
- GitHub Release、游戏包清单和 TestFlight 构建都对应同一个源码提交，不从未提交的工作区制作用户产物。
