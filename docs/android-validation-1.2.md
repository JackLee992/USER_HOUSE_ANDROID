# 玩吧 1.2 Android 验证记录

测试目标为 App 1.2.0 / code 3 / host API 1。记录持续区分已执行的真机行为、主机自动化测试和仍需对最终资源包复测的项目；不把版本号、源码配置或浏览器 DOM 赋值当作用户操作成功。

## 环境与保档边界

- 真机：HONOR NTH-AN00，Android 12 / API31，ARM64，1080×2340，DPR3；系统 Chromium92，兼容版实际 GeckoView155.0.1 / provider155.0.1 (20260903215306)。
- 测试只覆盖安装同签名 APK，没有卸载、清数据或更换系统 WebView。固定 loopback origin 保持不变；活跃资源可从 builtin 入口切至包含64位快照摘要的不可变路径。
- 五键检查使用 settings / scores / progress / records / sudokuState 的原始 localStorage 字符串逐字节比较。包含原始数据的快照与失败日志保存在 `.local/qa-v1.2/compat-phone/`，公开报告仅保留摘要和检查结果。
- 短时离线验证暂时关闭 Wi-Fi 与移动数据，结束时恢复原状态；未改系统省电、CPU或浏览器提供者。

## 已完成的设备验证

| 项目 | 已执行结果 | 证据 |
|---|---|---|
| 1.1 → 1.2 content1 同签名覆盖 | 五键原始字节全部相等，81包/37游戏，bootHealthy=true | 私有 `upgrade.log` / `upgrade-before.json` / `upgrade-after.json` |
| content1 游戏启动 | 37款全部从真实APK入口启动，无JS异常、无外部游戏资源请求 | [37款结果](evidence/android-1.2/compat-phone/games-smoke.json) |
| 四款重点操作 | 空当移动撤销，三消真实交换和三模式保板，泡泡真实发射，弹球蓄力发射/双指/后台ticks停住和手动恢复 | [实际操作结果](evidence/android-1.2/compat-phone/play-regression.json) |
| 五语言基础显示 | 五种实际语言包的首页、设置、布局检查；最初通过DOM设值，仅证明显示能力 | [语言显示结果](evidence/android-1.2/compat-phone/locales-regression.json) |
| content1 实际 GitHub 检查 | 首页真实触控发起新任务，固定仓库返回upToDate，活跃资源不变 | [检查结果](evidence/android-1.2/compat-phone/content-check.json) |
| content1 → content2 单包下载 | 只下载game.wordguess1.0.1的4865字节，另80包记录不变；新快照URL、健康标记和五键检查点通过 | [单包结果](evidence/android-1.2/compat-phone/content2/content-update-regression.json) |
| content2 原生回退 | 健康后真实提交的新猜测，在正常离线冷启动与回退至content1后均保留；五键全等 | 同上，区分原生路径通过和旧UI触控失败 |
| 新原生 + 冻结content2覆盖 | 同签名、同code覆盖，五键全等 | 私有 `native2-upgrade.log` |
| 原生选择器P1修复 | 21项真实Web触控→Android菜单→ADB点选检查通过，包括语言/主题、取消、HOME后冷启动持久化、三消模式二次确认和板面恢复 | [选择器完整结果](evidence/android-1.2/compat-phone/native-settings2-final/settings-touch-result.json) |
| content2 → content3 多包下载 | 实际GitHub只下载46个变更包、43,301,194字节；另35包记录不变，原始五键全等，新不可变入口bootHealthy=true，37个独立首页图标已上机 | [多包激活结果](evidence/android-1.2/compat-phone/content3/content-update-regression.json)、[实际新首页](evidence/android-1.2/compat-phone/content3/update-activated.png) |
| content3 完整设置与三消选择器 | 29项真实触控检查通过，无skip；三档eco/normal/game、语言、主题、取消、冷启保留，三消模式二次确认和原板恢复；结束恢复中文/day/normal | [最终选择器结果](evidence/android-1.2/compat-phone/native-settings3/settings-touch-result.json) |
| content3 首页原生滑动 | 10.856秒12/12次原生Android滑动改变scrollTop，0 DOM mutation，无误进游戏；rAF59.73Hz、P95 16.76ms | [列表结果](evidence/android-1.2/compat-phone/catalog-content3-final/catalog-scroll.json) |
| content3 → content2 真实触控回退 | 新core确认按钮实际触控，完整缓存content2健康启动，五键原始字符串全部相等 | [最终回退及正式覆盖](evidence/android-1.2/compat-phone/release/release-regression.json) |
| 最终正式APK同签名覆盖 | 从active2安装内置content3的正式兼容版，实际采用较新builtin3；原生SAF导出scores/progress/records/sudokuState结构完全一致，settings仅4项预期差异 | 同上、[正式版最终首页](evidence/android-1.2/compat-phone/release/release-home-final.png) |

content1快照为 `00d804b26f32d67d1358161a709c6a9d336082b98d5ea6a5c1ef1fb38409b238`，content2为 `ee361cb03fe2e87f860dbe5977a6a74b312a29879efd5ca4b11ac5e6b593bd9c`。单包测试读取实际固定 GitHub Releases，没有本地替代网络响应或预置虚假游戏 fixture。

content3为 `8e815134b71ca8e726504aac90629c8f3c37270e99794b2031099b34bcb22fe2`（资源版本1.1.0）。首轮多包报告显式标注 `activationOnly:true`，不把尚未执行的回退和离线步骤包含在该次通过结论中。

## 发现、修复与验收缺口

语言、主题选择器的原生缺口已实际复现：HTML select 得到焦点，但宿主只有 file prompt，没有 choice prompt。新增 `CompatChoiceDialog` 处理单选、多选、禁用项/分组及取消、Back、暂停销毁；精确155 AAR编译通过，语言、主题、三消的实际单选流程已真机通过。对比：[修复前](evidence/android-1.2/compat-phone/native-select-before.png)、[原生菜单](evidence/android-1.2/compat-phone/native-select-after.png)。content2无性能选择器，报告明确skip；不能把缺失的控件计作通过。

旧core回退确认框在touchend无条件重绘时被删除，合成click落到下面的游戏卡片。原生没有收到错误rollback，存档没有因此被回退。源码已改为仅在实际下拉手势结束时重绘；content2原生回退保档使用明确标记的DOM.click绕过此UI缺陷。最终content3已用真实触控确认完成3→2健康回退，五键全等，补上此前缺口。`QA_ALLOW_LEGACY_ROLLBACK_CLICK=1`仅服务于旧core原生事务验收，报告会标 `realTouchRollbackPassed:false`。

正式包安装后的比较通过SAF导出完成，未重新启用调试：四项游戏数据的JSON结构完全相同；settings的`lastTab`因打开导出页面由single变成settings，`apiUrl/apiKey/apiModel`三个原本为空的字段按既有备份策略省略，其余设置一致。这是明确处理正常界面操作后的结构比较，不称为正式包五键原始字节全等。原始备份仅在`.local/`，公开证据不包含备份内容。正式包无DEBUGGABLE标志，本应用调试YAML和2829转发已移除（9235当时已不存在），没有移除其他设备或用户转发。

Gecko最近写入的磁盘耐久性有时间窗口：立即强杀或HOME后2秒强杀，最近wordguess的题目、猜测、时间及版本元数据可能回到上次已落盘状态；其余游戏和4键未变。HOME等待10秒后，实际关闭网络并冷启动，五键全部相等。官方[legacy StorageDBThread](https://searchfox.org/firefox-main/source/dom/storage/StorageDBThread.cpp) 的5000ms批量flush与本机`webappsstore.sqlite`现象一致，此链接为官方当前源码，非同版本固定revision证明。测试不承诺写入瞬间的强杀耐久性；资源切换前的原生原子检查点与正常健康回退保档分别验证。

## Java测试与跨APK快照

原生更新器测试通过 **111个真实Java断言**，使用真实JCA签名、ZIP、文件哈希、原子文件与JSON；HTTPS传输由主机测试适配器提供，不能替代上面的真机GitHub请求。覆盖坏签名/路径/成员/摘要、防重放、少量包下载、截断失败、健康标记失败、崩溃/前台watchdog回滚及后台暂停。新增跨APK测试证明：安装快照会私有缓存复用的APK包；APK替换共享core后旧快照仍可读；新builtin只在序列较高且saveSchema兼容时采用；不降级较新installed，也不在每次启动推翻用户主动回退。

冻结的早期content1宿主尚未缓存被复用的APK资源，因此不能声称它在替换APK后仍保有所有旧core/art。当前测试路线是先同签名安装新原生 + 冻结content2，再从真实GitHub下载content3，让新原生正常生成完整可回退的缓存；不会手工伪造缓存使检查通过。

## 性能证据与最终待测

[content1真机性能基线](evidence/android-1.2/compat-phone/performance-content1/README.md) 显示泡泡无输入新局约12.47Hz、P95间隔100.42ms，是真实绘制问题。rAF只是调度频率，并非GPU呈现或耗电测量；Gecko不支持longtask观察器，不能记为零长任务。

旧content2首页的Marionette合成手势35次未改变scrollTop，但原生Android `input swipe` 同屏对照实际从0滚至520，祖先touch-action均为auto。该差异属于自动化注入路径与Gecko APZ，不能据此断言旧首页完全无法滚动；最终真机列表结论以Android MotionEvent为准。[原生对照](evidence/android-1.2/compat-phone/catalog-content2/adb-swipe.json)。

content3普通档泡泡10.033秒静止短测为59.63Hz、P95 16.76ms、无超过50ms间隔；实际3次发射的7.181秒短测为58.49Hz、P95 16.76ms、1个99.74ms间隔。Canvas为658×888、CSS329×444，符合DPR2；新圆球与两侧边界已检查截图。与旧版无输入基线的12.47Hz明显不同，但新旧局面、采样长度及美术同时变化，只能作为本机实测改善，不能把全部提升归因于某一个补丁。[静止证据](evidence/android-1.2/compat-phone/performance-content3-normal/summary.json)、[实际发射](evidence/android-1.2/compat-phone/performance-content3-playing/summary.json)。

尚未覆盖最终content3全部37款重新启动、三档长时间A/B与功耗测量；37款完整启动和四款重点操作来自content1，不能冒称是最终每个资源包的完整重验。最终正式覆盖、较新builtin采用、真实回退与SAF保档已经完成；不再为可选诊断延迟交付。
