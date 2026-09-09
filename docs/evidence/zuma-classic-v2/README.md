# 祖玛经典玩法 v2：Android 验证

本目录记录实际执行结果；尚未执行的检查不标为通过。旧版基线和备份正文只写入`.local/qa-zuma-classic-v2/`，公开报告仅放摘要、游戏界面截图和指标。

## 当前状态

2026-09-09 开始时授权真机 HONOR NTH-AN00（test-phone）未连接；用户重连后已先运行`tests/android-zuma-baseline.mjs`，通过正式1.2.0自身SAF导出保存五项JSON和旧祖玛进度。随后才同签名覆盖1.2.1开发包，没有卸载或清数据，也未操作根任务的模拟器。[基线结果](baseline/baseline.json)。

10:30开发APK为234,292,248字节，SHA256 `1f25b4e7e5da42bc58bc75c66901d5153a176fad03cd7047072c5b51e00ce315`。它的WWW已含新玩法，但内嵌清单仍是content3，Web版本信息还是1.2.0且专属美术未齐；这里只用于框架测试，不能当作content4签名发布或最终美术验证证据。

开发包已实际通过换球、6次触控瞄准发射、完整engine state暂停冻结、后台/前台保持暂停。约6.65秒普通档采样为59.43Hz/P95 16.76ms，仅供框架短测。原生Android返回键销毁portal并返回目录，成对截图已检查状态栏隐藏/恢复：[沉浸暂停](framework-final/native-immersive-paused.png)、[原生返回目录](framework-final/native-back-catalog.png)。

冷启动严格五键比较暂未全等：仅`progress.zuma.petRewardNextMs`由2400000变为1800000，祖玛shots=8/score=590/lives=3/chain=45和其余全部字段、其他四键均相同。这是旧开发core的非玩法字段差异，报告保留失败状态，待最终core复测。[框架结果](framework-final/zuma-classic.json)。备份和详细差异只在`.local/`。

11:07美术开发APK为234,292,335字节，SHA256 `798d63a8cd79d8ffc8abb8e3af14fa8115fb81bb3beada41cc4be9d31a057556`。同签名覆盖前后五个原始存储键完全一致，Native/Web版本均为1.2.1，新专属静态美术已实际加载。但该中间包恰好包含新引擎的`draining`状态和旧视图的终局判断：真机自然进球口后被错误自动暂停，无法继续吞球，三档测试因此保留失败状态；未将59Hz或美术加载当作玩法通过。这是当时中间包的历史失败；后续完整候选已修复并通过下节的吞球恢复、三档及冷启验收。现场和原始快照保持在私有QA目录。[该次测试结果](art-three-profiles/zuma-classic.json)。

## 1.2.1 冻结候选真机结果

11:35后构建的候选APK为236,167,316字节，SHA256 `68950a09ded94847404f0cf8645a0da417bca190e7f0163c86b46183f564fc92`。13个关键文件（祖玛引擎/视图/着色器/存档适配、四张图与清单、core、App版本信息）先逐字节核对APK与冻结源码，再从真机实际本地HTTP入口读取并核对SHA256，全部一致。Native和Web均报告1.2.1/code4，Gecko155.0.1；同签名覆盖前后五个原始存储键完全一致。此候选仍使用开发builtin入口/content3标记；正式content4在线更新另行记录。

保留的自然吞球现场已恢复：`draining`珠链全部消失后进入`lifeLost`，生命3→2，分数1180保留，动作图集已加载。随后通过真实重试按钮继续，完成三档各23次发射。[吞球恢复](final-recovery.json) · [完整三档与冷启结果](final-three-profiles/zuma-classic.json)。

| 档位 | 实际渲染器（开始/结束一致） | Canvas物理尺寸 | 发射采样 | rAF平均频率 | P95间隔 |
| --- | --- | --- | --- | --- | --- |
| 省电 | Canvas2D | 360×440 | 25秒，23次 | 59.25Hz | 16.80ms |
| 普通 | WebGL | 720×880 | 25秒，23次 | 58.98Hz | 16.78ms |
| 游戏 | WebGL | 1873×951 | 25秒，23次 | 58.94Hz | 16.78ms |

设备DPR=3。游戏档期间手机在原有自动旋转模式下转为横屏，因此三行不是严格同方向的性能A/B；rAF指标也不代表GPU实际呈现或耗电。三档均通过换球、真实瞄准发射、完整引擎state暂停冻结、HOME后台冻结和前台仍暂停，未观察到JS错误；普通/游戏档没有在该次采样中回退Canvas。

正常HOME保存并等待10秒后，强制结束进程再启动，五个原始存储键逐字节全等，旧开发包的`petRewardNextMs`差异已消失。冷启Native/Web版本仍为1.2.1，实际继续存档成功；不将这一结果扩展为Gecko立即强杀/断电写入保证。

明确执行的Android物理显示旋转为360×746→746×360→360×746。在暂停状态下，score3540/lives2/shots131/chain9及其他非几何玩法身份全部保持，横竖控件均在可用视口内，WebGL持续可用。finally核对恢复`wm user-rotation=free`、`accelerometer_rotation=1`、`user_rotation=0`。[旋转结果](final-rotation/rotation.json) · [横屏暂停截图](final-rotation/landscape.png)。这项为ADB物理显示旋转，不是手持旋转或CDP视口模拟。

另行执行3次真实发射的口部动作短测，读取到0.42秒接珠动画，并检查原生连续截图中的张嘴接珠→合嘴、飞行绿珠与拖尾和球面纹理方向变化：[接珠与飞行](final-motion/shot-0-frame-0.png) · [合嘴后的棋盘](final-motion/shot-0-frame-3.png) · [只读动作采样](final-motion/motion.json)。该HONOR没有shell `screenrecord`命令，因此保留真实截图而不声称录屏验证；截图开销不混入上述性能采样。本次短测没有在采样点捕获爆散粒子，不据此声称完整覆盖每种特效。

## 正式1.2.1覆盖与收尾

真机已同签名覆盖正式兼容版1.2.1/code4；从Android实际安装目录计算`base.apk`的SHA256为 `8988136f202cc8529ced7c06bb45a1c64ab8bf2d00ee630445591697e489ebc6`，与核验发布文件一致，包没有`DEBUGGABLE`标志。

正式版正常SAF导出确认已自动采用较新builtin content4：`7a122cbdc1df7cafba30cfb98269303b91da3f1089c81f028467cd9a4bd4e630`。scores/progress/records/sudoku四项解析JSON与覆盖前逐字段相同；settings仅有正常进入设置页的lastTab变化，以及备份设计主动剔除API三个字段，其余全等。最新祖玛4760分、第二关（levelIndex=1）、1条生命和完整classic schema2存档均保留。此项为正式版自身SAF验证，不宣称通过release调试接口读取原始localStorage字节。

通过真实列表滑动点击祖玛及继续按钮，确认新祖玛暂停/继续画面；随后Android返回目录。原旋转值仍为free/1/0。本应用Gecko调试YAML和手机专用2829转发已删除，9235原本不存在；没有影响其他设备转发。此后未重新安装debug或启用自动化配置。[正式版结果](release/release.json) · [实际继续后的暂停](release/release-zuma-paused.png) · [最终目录](release/release-home-final.png)。

正式截图也保留一个非阻断外观问题：首次打开暂停框时，面板及按钮暂用CSS后备皮肤，即使等待8秒仍然如此；头部、底部和棋盘专属图片正常。源码检查提示`dialog()`在隐藏容器中先调用skinButton，零尺寸提前返回，显示后没有重绘皮肤；旋转触发resize时才补齐。这不影响暂停、继续和存档，但本轮不声称暂停框美术在全部打开路径均完整。已反馈视图负责人，后续可仅更新祖玛游戏包。

用户追加要求的“已发布旧APK只更新资源”由根任务在独立模拟器执行；本手机记录的是新APK覆盖后的builtin4采用，不将两项测试混为同一证据。

## 全屏接口与本地证据

1.2.1宿主新增`NativeBridge.setGameImmersive(true|false)`。仅信任本地入口，不接收任意脚本或宿主地址；Gecko扩展拒绝非布尔值，主线程执行实际窗口变更。API30+使用系统栏隐藏与边缘滑动临时显示，API26–29使用旧版沉浸标志；安全区域仍避开挖孔与软键盘。此行为遵循[Android immersive mode](https://developer.android.com/develop/ui/views/layout/immersive)。

Gecko的[onFullScreen回调](https://mozilla.github.io/geckoview/javadoc/mozilla-central/org/mozilla/geckoview/GeckoSession.ContentDelegate.html#onFullScreen(org.mozilla.geckoview.GeckoSession,boolean))仍要求宿主设置Activity全屏；CSS portal本身没有调用浏览器Fullscreen API，因此使用统一限定桥。链接为官方当前接口文档；具体实现已用精确Gecko155 AAR和SDK37.1编译。

后台显示系统栏；回到同一个仍暂停的游戏会恢复沉浸窗口，不调用游戏resume。返回目录、资源导航、扩展断连或Activity销毁清除请求。Android Back继续优先走`wanbaApp.back()`，游戏视图销毁须调用`setGameImmersive(false)`。沉浸实现不更改系统旋转或省电设置；横竖屏QA使用下述已授权的临时显示旋转并恢复。

已完成31项主机测试：bridge明确布尔值/断连、可执行Java生命周期状态转换，以及现有资源打包与本地URL策略。两个Activity和共享控制器已通过独立javac。这些结果不替代真实系统栏/挖孔/边缘手势的设备检查。

## 实际回归路线

1. 保存正式版旧祖玛/五项数据，记录当前content3版本；同签名覆盖测试包后先比对基线，再打开新玩法。
2. 从真实目录打开祖玛，检查新UI、关卡/生命、棋盘边界、全屏控件可见；真实触控瞄准发射和换球。只读取controller.inspect，不注入已匹配局面。
3. 暂停前后完整引擎state应相同；后台保持暂停、前台需手动继续。HOME保存并等待10秒后冷启检查续玩，避免将Gecko异步写入窗口中的立即强杀当作正常关闭。用户已授权临时Android物理显示旋转：`tests/android-zuma-rotation.mjs`先保存原值，在暂停状态检查横竖切换的分数/生命/发射数/珠链身份，finally恢复原设置；不称为手持转动或CDP模拟。
4. 默认普通档至少30秒实际发射采样；条件允许时省电/游戏各复测。记录canvas物理/CSS尺寸、rAF间隔和长帧；不以rAF当作GPU呈现或耗电保证。
5. 正式发布content4后，从固定GitHub频道实际3→4只下载变更包，检查签名/字节/健康状态与存档；真实确认回退至3并恢复4。
6. 最终覆盖正式APK，保留存档和最新内容，清除本应用调试YAML及本次专用转发，不保留测试版配置。
