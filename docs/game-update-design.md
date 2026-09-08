# 游戏内容更新协议 1（实现约定）

本轮目标是 App 1.2.0 / versionCode 3 / host API 1。App/APK、共享 core、每款游戏代码、每款美术、五种语言分别维护版本；原生更新器按包摘要复用，只下载缺失的变化包，整份不可变快照一次激活。本文记录已定接口，不代表现有 1.1.0 已实现更新。

## 现状与必须完成的拆分

- `src/runtime/wanban-app.js` 的 `GAME_META` 有 37 款游戏；只有 match3、zuma、water-sort、freecell、space-cadet 五个外部模块，其余 32 款是同一运行时闭包中的工厂。`src/games/index.js` 目前是占位。根代理负责将 32 个工厂抽出并统一注册器和 env API；不得用空 JSON 冒充独立代码包。
- `startCurrentGame` 是分发点，`modularGameEnvironment` 已提供 save/clear/finish/pause 等服务。统一导出和 controller 生命周期后，core 只拥有壳、目录、共享服务与加载器，各 game 包拥有实际工厂代码及其专属帮助模块。
- Space Cadet 通过同源 iframe 加载 `host.html → host.js → display.js/space-cadet.js → wasm/data`，依赖 `import.meta.url` 和同源消息检查。其 iframe/WeakMap/ESM 缓存必须随页面重建，不做运行中模块替换。用户导入的 DAT/WAV 位于 IndexedDB `wanban-space-cadet-assets`，不属于发行资源，清包不能碰它。
- 现有存档、成绩、历史是相同 origin 下的 localStorage；稳定 game ID 保留，尤其 `pinball` 不改为 `space-cadet`。两个 flavor 仍各自独立保存，用户通过现有 JSON 备份互通。

## 发布仓库、信任与固定格式

唯一内容仓库是 **`JackLee992/USER_HOUSE_GAME_PACKS`**。APK 下载仓库仍是 `USER_HOUSE_ANDROID`。设备不保存 GitHub token，不接受用户/网页传入仓库或任意下载 URL。

每个 release 的 tag 是 `content-<sequence>`，例如 `content-1`。它包含 `channel.json` 和本次新增的 ZIP 包；未变化包可以继续引用旧 release 的 ZIP。构建完全部资产后才发布 draft release，启用仓库 immutable releases。GitHub 的不可变发布会锁定 tag 和资产；这作为发布侧保护，设备仍独立验签和验哈希。[GitHub 官方说明](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

入口固定为 `https://github.com/JackLee992/USER_HOUSE_GAME_PACKS/releases/latest/download/channel.json`。其内容是：

```json
{"schema":1,"payload":"BASE64_OF_EXACT_UTF8_MANIFEST_BYTES","signature":"BASE64_OF_DER_ECDSA_SIGNATURE"}
```

签名算法固定 **SHA256withECDSA / secp256r1（P-256）**，签名 DER 编码再 Base64；验签输入是解码后的原始 payload 字节，无跨语言 JSON canonicalization。APK 内置 X.509/SPKI DER 公钥 `android/app/src/main/assets/content-update/public-key.der`，私钥只在发布方私有存储。公钥变更通过 APK 更新；远端清单不能替换信任根。初始 APK 同时包含 `content-update/builtin-channel.json` 以记录内置内容版本并支持一致的降级基线。

Payload 固定结构如下（摘要/大小示例是占位，不可直接发布）：

```json
{
  "schema": 1,
  "sequence": 1,
  "snapshotVersion": "1.0.0",
  "releaseTag": "content-1",
  "minHostApi": 1,
  "maxHostApi": 1,
  "minAppVersionCode": 3,
  "runtimeApi": 1,
  "sourceCommit": "0000000000000000000000000000000000000000",
  "entry": "standalone/index.html",
  "packages": [
    {
      "id": "game.match3",
      "kind": "game",
      "version": "1.0.0",
      "url": "https://github.com/JackLee992/USER_HOUSE_GAME_PACKS/releases/download/content-1/game.match3-1.0.0.zip",
      "sha256": "64 lowercase hex characters",
      "size": 12345,
      "files": [
        {"path":"src/games/match3.js","sha256":"64 lowercase hex characters","size":23456}
      ]
    }
  ],
  "games": {
    "match3": {"version":"1.0.0","code":"game.match3","art":["art.match3","art.shared"],"saveSchema":3}
  },
  "locales": {
    "zh-CN":"i18n.zh-CN", "zh-TW":"i18n.zh-TW",
    "en":"i18n.en", "ja":"i18n.ja", "ko":"i18n.ko"
  }
}
```

真实清单必须包含全部游戏以及完整依赖；示例省略了 core、美术和语言包。`snapshotId = SHA-256(payload 原始字节)`，不写回 payload，避免循环哈希。`snapshotVersion` 是发行快照版本，不能显示为每款游戏的版本。

| 包类型 | ID | 内容与版本规则 |
|---|---|---|
| core | `core` | 唯一包；共享 runtime、壳、目录、加载器、公共 CSS、standalone 入口；独立 semver |
| game | `game.<gameId>` | 真实游戏 JS 工厂、专属帮助代码/引擎数据；`games[id].version` 必须等于该包版本 |
| art | `art.<gameId>` / `art.shared` | imagegen 产物的发行图片/字体及声明；每游戏独立 semver；原图/QA 中间稿不入包 |
| i18n | `i18n.zh-CN` 等 | 五种语言各独立 semver；JSON/TXT 数据，不能通过翻译值执行脚本或直接注入 HTML |

每个 ZIP **根目录就是 www 内逻辑路径**，例如 `src/games/match3.js`、`assets/game-art/match3/board.webp`、`locales/ja.json`；**不加 `www/` 外层**。完整快照每个逻辑路径仅有一个拥有者，重复归属直接拒绝，不能依赖解压先后覆盖。`src/games/index.js` 由 core 拥有。应用 launcher 图标属于 APK 资源；首页图标/游戏图片可属于 art 包。

`runtimeApi` 是游戏与 core 的接口代次，首期固定 1；不兼容接口需要明确变更代次并阻止旧宿主激活。每次发布必须维护明确的 package version；未改包保持原 URL、ZIP 摘要和版本，不按整包版本统一抬升 37 个游戏。

## 下载、磁盘与 URL 路由

下载只在原生执行。允许起点为上述固定仓库的 HTTPS release 路径，拒绝用户名、密码、自定义端口、HTTP、其他仓库、任意子域。手动检查每一步 redirect，最终只允许 GitHub 发布资产的明确 CDN 主机，例如 `release-assets.githubusercontent.com`、`objects.githubusercontent.com`；限制次数，不关闭 TLS 验证。清单中旧包 URL 的 release sequence 不得高于当前快照。

下载状态是 `checking → available → downloading → ready → activating → active`，错误和 Activity 销毁导致的中止保留当前内容。同一时间只接收一个作业，重入返回已有操作提示；下拉刷新只检查清单，显示变化包、游戏、美术、语言和下载量后由用户点击安装。当前已有候选时采用 30 秒短时缓存，不需要 GitHub 登录；403/429 明确提示稍后重试。ETag 和指数退避可后续补充。若以后改用 REST discovery，匿名请求按公共 IP 限流，不能按设备假定独享配额。[GitHub 限流说明](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

包缓存按 ZIP SHA-256 定址：`noBackupFilesDir/content-update/objects/<archiveSHA>/...`。下载写 `.part`，校验归档长度/摘要后解压至临时目录；每个成员路径、数量、展开大小及 SHA-256 均与签名清单一致，未声明/缺失文件失败。禁止路径穿越、绝对路径、百分号/反斜线绕过、重复文件成员；条目一律写为普通文件，不还原 ZIP 的符号链接或权限，不解压 `.so/.dex/.apk/.exe`。艺术包只允许图片/字体/声明数据，语言包只允许 JSON/TXT。

初期上限：channel 4 MiB、解码 manifest 2 MiB、单包 ZIP 128 MiB、单文件 64 MiB、快照展开总量 512 MiB、256 包/12000 文件。磁盘不足在激活前报错。保留内置内容、当前及前一已验证快照；垃圾回收仅删除未被引用的本应用资源目录，不清 localStorage、IndexedDB、用户文件或导入备份。

两个 flavor 均保持 origin 不变：

- system：`https://appassets.androidplatform.net`
- compat：`http://127.0.0.1:38657`

内置入口继续为 `/assets/www/standalone/index.html`；安装快照为 `/assets/updates/<snapshotId>/www/standalone/index.html`。相对模块、CSS、iframe、WASM/data 都自然锁定同一个快照路径。资源解析从快照的不可变 file→package 表查找，不能对每次请求读取“当前 active”后混合版本；缺失文件不能临时回落到内置版本。

`active.json` 用 AtomicFile/同文件系统 rename 更新。旧页面继续绑定旧 URL；只在首页安全保存后加载新入口，重建 ESM、iframe 和运行时闭包。后台下载不替换正在玩的游戏。

## 原生桥与页面约定

下列方法是固定操作，不接受任意 URL、路径或代码。system 返回 JSON 字符串；compat 可返回 Promise<JSON 字符串>，沿用导出 Promise executor 的已验证实现。

| 方法 | 输入 | 返回/作用 |
|---|---|---|
| `getContentState()` | 无 | 本机内容、候选、作业、恢复检查点状态 |
| `checkGameUpdates()` | 无 | 启动作业，立即返回 `{jobId}` |
| `downloadGameUpdate(snapshotId)` | 仅刚验签候选 ID | 下载缺失包，立即返回 `{jobId}` |
| `activateGameUpdate(snapshotId, checkpointJson)` | 已下载快照、严格检查点 | 保存恢复点后启动原子切换作业，返回 `{jobId}` |
| `rollbackGameUpdate()` | 无 | 请求回到前一已验证快照；与存档兼容性规则联动 |
| `reportGameContentReady(snapshotId)` | 当前真实入口对应 ID | 初始化和存档检查成功后的健康确认 |

`getContentState()` 返回 `{hostApi,appVersionCode,repository,activeSnapshotId,active,candidate,candidateReady,bootHealthy,previousSnapshotId,job,restoreStorage}`；`active/candidate` 含 `snapshotId/snapshotVersion/sequence/packages/games/locales`，展示用 packages 省略 files。无候选/前版/恢复数据时为 null。`job` 含 `{jobId,action,state,downloadedBytes,totalBytes,message}`。`candidateReady` 独立记录候选是否已完整安装，不能只靠当前 job 判断按钮。`reportGameContentReady` 立即返回的 `{accepted:true}` 仅表示排队；页面须等待重读的 `bootHealthy:true`（标记成功持久写盘）后才允许开局。读取恢复点失败时返回 `error` 和 `bootHealthy:false`，页面必须停止初始化并明确显示失败。

异步事件通过 **`wanbaApp.onGameUpdate(eventJson)`** 通知，`eventJson` 是 JSON 字符串，字段与 job 一致；处理后页面可重读 `getContentState()`。通知丢失不丢作业状态。刷新按钮/下拉只存在首页，手势仅在列表顶部且纵向意图明确时触发，不拦截游戏触控；失败时保留离线目录和当前游戏。

`checkpointJson` 固定为 `{ok:true,idle:true,storage:{key:rawJSONStringOrNull}}`，只允许：

```text
wanbanXiaowu_settings_v1
wanbanXiaowu_scores_v1
wanbanXiaowu_progress_v1
wanbanXiaowu_records_v1
wanbanXiaowu_sudokuState_v1
```

页面必须处于首页；先暂停并持久保存，再读回验证。当前 `saveJSON` 会吞写入异常，不能把旧的 `save()` 无返回值当作成功证据。检查点最大 8 MiB，原生保存到私有目录后才允许重载。

每次启动，standalone 在初始化 runtime **之前**调用 `getContentState()`；若 `restoreStorage` 存在，先恢复限定五键并读回验证。完成 UI/模块依赖和存档兼容检查后才 `reportGameContentReady`，此前禁用游戏开局。未健康的新快照遇崩溃/启动超时，回到上一版并恢复更新前检查点；后台停留不作为启动失败。已健康后玩家继续产生的存档不能被静默覆写。

## 存档与回滚规则

在进度外层增加独立命名空间 `_content:{gameVersion,runtimeApi,saveSchema,snapshotId,artVersions}`，不要覆盖 Match3 的 `rulesVersion` 或弹球的 `version`。历史记录锁定开局时的 gameVersion/snapshotId；旧记录保留并标识 legacy，不伪造历史版本。JSON 备份继续兼容旧结构，可额外带内容元数据。

首期热更新仅允许 **saveSchema 不变、读写双向兼容** 的更新，移植当前旧存档要有明确游戏级适配；新 schema 的迁移作为后续功能单独实现和测试。不兼容保存格式必须提示更新 APK/暂不可激活，不能触发现有“无效进度→清空”分支。内容回滚不等同于用户数据回滚：健康版本的回退应保留当前进度；确需恢复旧检查点须列明影响并由用户明确选择。

## 文件所有权与并行工作

| 负责人 | 文件/职责 |
|---|---|
| native worker | 新增 `ContentManifest.java`、`ContentUpdateManager.java`、`ContentResourceStore.java` 等共享 Java；`LocalAssetPolicy.java`；两 Activity 的有限更新桥/生命周期/入口路由；compat asset server/bridge；更新器行为测试 |
| root | `USER_HOUSE_GAME_PACKS` 创建、固定 release 发布、签名私钥和 CI secrets；内容打包/版本维护/签名工具；32 工厂抽模块；GAME_META/动态加载器/env；首页刷新/更新 UI；i18n 加载、五种语言；APK 1.2.0/code3、system INTERNET manifest 与 Gradle配置 |
| art worker（root分配） | imagegen 逐游戏素材、视觉验收、发行图与美术包清单；不改 native/runtime |

system 必须新增 INTERNET 供原生更新器；WebView 自身仍 `blockNetworkLoads`、固定可信入口、原 CSP。`shouldInterceptRequest` 改用验证后的 store 获取流；`shouldOverrideUrlLoading/onPageStarted` 和桥信任条件识别当前已安装快照入口。compat server 同样从 store 读取，仍只 bind loopback；NavigationDelegate、content-script 匹配和 sender 校验同步识别快照入口。`NativeBridge` 不接收 JS/native eval 命令。

## 必须通过的真实验证

1. 使用两组签名 fixture：只改一个 game 包，其它 game/core/art/i18n 版本和摘要不变；记录 HTTP 下载，仅拉新包，激活后仅该游戏版本变化。另测只改 art、只改 ja 语言包。
2. 37 款模块在 system 和 compat 首次离线启动；五种语言切换、缺译回退；不同 art 版本真实截图。独立代码包不能用空占位代替。
3. 上一版正在玩时下载新包：旧页面 URL 和所有 iframe/WASM 仍旧快照；回首页保存后切换，查实际网络请求无混版。弹球真实发射/分数与暂停测试。
4. 原生 Java 验证：错签名、改 payload、改 ZIP/文件、坏长度、遗漏/多余/重名文件、Zip Slip、链接、超配额、越仓库/越 host redirect、过旧 sequence、host API不兼容、游戏依赖或版本不一致全部拒绝。
5. 下载中断、网络断开、磁盘满、进程被杀在每个 staging/rename/active 指针边界后，重新打开仍为完整旧版或完整新版；不能半安装。
6. 激活后让入口 JS 语法错误/模块缺失/未回 healthy：自动回退，更新前五键字节级比较一致；后台停留不会错误回滚。新版本健康后玩一局再回退，不丢新进度。
7. Match3 v3钱包/三模式/零步续玩、防重复奖励，FreeCell牌面、数独及成绩/结算历史跨更新保持；含旧 JSON 备份的导入与拒绝不兼容 schema。
8. Release验证无生产调试/外部配置/eval桥；只有固定GitHub内容源可下载。两个包共存、原包同签名覆盖保档，当前1.1产物留作测试基线。

## 已有自动化与执行边界

`android/app/src/compat/tests/content-update.test.mjs` 编译并运行真实 `ContentManifest / ContentResourceStore / ContentUpdateManager` Java 源码，使用真实 JCA P-256、ZIP、文件 IO 和 `org.json:json:20240303`。Android Context/Handler/AtomicFile 是最小主机适配器；AtomicFile 使用实际同目录原子 rename，并提供一次写盘失败注入。HTTPS transport 是只供测试的 URL handler，因此该测试验证实际下载状态机和来源校验，不证明真机 TLS/网络可用。真机需另测固定 GitHub Release 下载。

测试 classpath 用 `WANBA_JSON_JAR` 指向官方 Maven Central 的 [org.json 20240303 JAR](https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar)，只用于主机测试，不进入 APK；本地已准备 `/tmp/wanba-content-tests/json.jar`。执行：

```sh
WANBA_JSON_JAR=/path/to/json-20240303.jar node --test android/app/src/compat/tests/content-update.test.mjs
node --test android/app/src/compat/tests/bridge-contract.test.mjs android/app/src/compat/tests/import-cache.test.mjs
node --test android/app/src/compat/tests/asset-server.test.mjs
```

最后一条启动并关闭只绑定 127.0.0.1 的真实 Java HTTP 服务，需要环境允许本机 TCP 监听。当前行为覆盖错误签名/清单/ZIP、缺失或重复成员、损坏缓存修复、变化包下载、截断下载、sequence 防重放、原子激活、冷启动/前台超时回退、暂停 watchdog、五键检查点以及健康标记写盘失败。浏览器 VM 测试额外模拟 Gecko 的跨 principal Promise executor 限制。
