# 贪吃蛇离线竞技场 1.1.0

实现日期：2026-09-09。插件 ID 为 `snake`，游戏版本由 1.0.0 升为 1.1.0，HOST_API_VERSION 和 saveSchema 继续为 1。本次仅新增该游戏自身模块；内容包版本由发布负责人登记。

## 体验与范围

模式页提供「无尽竞技」「限时挑战 · 3 分钟」「经典方格」。竞技场明确写明「离线 AI」，所有对手在设备内模拟，不连接玩家服务器、不冒充真实联网。经典模式沿用原来 21×21 方格、方向规则、速度公式和旧存档。

参考 [贪吃蛇大作战官网的玩法说明](https://www.tcsdzz.com/)（2026-09-09 核对）：摇杆转向、吃彩点成长、头碰其他蛇身淘汰并掉落彩点、长按加速，以及无尽/限时等模式。本次使用自制程序绘制的场地、蛇身和眼睛，没有复制该产品的名称、标志或美术。首版实现无尽和限时两个离线竞技模式；团战和真实联网不在本次实现内。

玩家用左手摇杆自由转向，右手按住加速。摇杆可在浮动和固定之间切换；桌面支持方向键/WASD 与空格加速。加速消耗长度，到安全下限自动停止，不因耗长死亡。吞食普通彩点或淘汰掉落物会增长；头撞其他蛇身、头对头或场地边界会淘汰。自己穿过自己的身体不会淘汰。头对头同时结算，避免依遍历顺序指定胜者。

场地为 1800×1400 世界坐标，默认 7 条 AI 蛇。玩家初始长度 170、最低长度 100、上限 1400；通常速度 100 单位/秒，加速 172 单位/秒，转向上限 3.4 弧度/秒。AI 会觅食、避让蛇身和边缘，淘汰后延时重生。限时局以实际活动时间 180 秒结束；无尽局以玩家淘汰结束。长度榜和结算显示本局长度、最长长度、淘汰数和活动时长。

## 模块与接口

| 模块 | 责任 |
| --- | --- |
| `index.js` | 游戏版本、模式选择、旧经典存档与竞技存档路由；返回统一 save/destroy/getState 控制器 |
| `classic.js` | 原经典实现及显式 timer/键盘清理；保留旧规则 |
| `arena-engine.js` | `createArena({mode,seed,state,aiCount,foodCount})`；固定步长、AI、空间索引、吞食/碰撞、掉落、计时、存档校验 |
| `arena-renderer.js` | `createArenaRenderer(canvas,host,document)`；resize/draw/destroy；视口剔除与有界渐变 sprite 缓存 |
| `arena-controller.js` | 摇杆、加速、多指、键盘、HUD、保存与宿主暂停/后台生命周期 |
| `arena-save.js` | 完整竞技快照加向后兼容的经典字段 |

引擎对象暴露 `state`、`setInput({angle,boost})`、`clearInput()`、`advance(seconds)`、`snapshot()`、`ranking()`、`elapsed` 和 `remaining`。输入改变朝向目标，物理只按 1/60 秒步长推进。单次 advance 接收时间最多 0.25 秒，前后台转换会清除上帧时间和余量，不追赶后台时间。`isArenaState` 检查独立版本、数值边界、蛇/食物数量和坐标；快照包含随机数状态，恢复后 AI 行为可重复。

为了兼容当前宿主的暂停 API：前台游戏暂停时不继续 rAF，使用一个 100ms 检查等待宿主恢复；页面 hidden 时连该检查也停止。暂停、失焦、pointercancel、后台切换都清除摇杆/加速输入。destroy 撤销 rAF、检查 timer、输入/窗口监听和 ResizeObserver，释放主画布和全部缓存画布。不会修改全局 rAF 或全局游戏速度。

## 存档兼容

竞技存档在 `arena` 中保留 `{version:1,...}` 的完整世界快照；顶层仍带 `snake/dir/next/food/score/controlMode/controlsHidden/details`。投影为合法的居中三节经典蛇，分数取当前实际长度，保证既有 `hasPlayableProgress('snake')` 的非零分数条件成立。

新版恢复 `arena.version=1` 的完整竞技场；原有经典存档直接进入经典模式。旧版只有经典实现时，可以读取投影并继续一个安全的经典局，**不会恢复自由转向竞技场的精确位置**。若在旧版继续并保存，旧实现会以经典字段覆盖竞技快照，这是向后兼容的实际边界。未修改旧存档的外层 `_content.saveSchema=1`，无需宿主增加游戏字段判断。

竞技模式每秒保存一次，并在宿主 save/暂停/后台入口保存；摇杆每次移动不写存储。局结束后清除继续进度并交给已有 showGameOver 记录结果。经典存档字段和得分规则保持原样。

## 性能边界与已完成验证

- 游戏物理与画布 DPR 完全分离；共享性能模式在常见手机尺寸下对应 DPR 上限 1/2/3，同时主画布总像素不超过 400 万。
- body/food 使用 64 单位空间网格进行附近查询；绘制仅处理摄像机附近元素，身体按模式采样。
- 六色身体/食物 sprite 最多 12 张，各 64×64，在实例内复用。没有逐球创建渐变，没有新图片下载和额外运行库。
- `tests/snake-arena-engine.test.mjs`：转向、加速消耗下限、食物一次性消费、身体与头对头碰撞/掉落、限时、10–120 FPS 同结果、保存恢复、后台大 delta。
- `tests/snake-controller.test.mjs`：真实控制器配假时钟/Canvas，倒计时、暂停/hidden/恢复、双指独立、三档 DPR、缓存复用释放、旧经典存档、投影、模式页生命周期。
- 连同 `tests/game-plugins.test.mjs` 共 **18 项通过**。倒计时 03:59 与暂停 boost 状态残留均先由真实控制器测试复现，再修复为通过。

`tests/snake-arena-render.mjs` 可用已安装的 `@napi-rs/canvas` 产生离线渲染证据，生产代码不依赖该包。当前证据在 `.local/qa-snake-arena/{eco,normal,game}.png` 与 `render.json`；已查看实际 normal 画布图。它只验证 Canvas 画面，不包含原生壳/DOM 控件，不是浏览器或真机截图；记录的 cpuDrawMs 是一次 Node 绘制耗时，不能解释成设备 FPS。

运行测试：

```sh
node --test tests/snake-arena-engine.test.mjs tests/snake-controller.test.mjs tests/game-plugins.test.mjs
```

离线画布检查（已安装依赖时）：

```sh
CANVAS_MODULE=/path/to/@napi-rs/canvas/index.js QA_OUT=.local/qa-snake-arena node tests/snake-arena-render.mjs
```

## Android / iOS 后续实际验收

1. 从原生首页进入贪吃蛇，再点宿主开始按钮，验证模式页三入口；旧经典存档走继续后仍为原方格蛇。
2. 无尽模式：左指转向、右指按住加速；松开一指不影响另一指，触摸滑出、系统通知和应用切后台后都不残留加速。
3. 等待/寻找 AI，确认吃点成长、长度榜变化、诱导 AI 碰身体掉落，以及玩家撞身体/边界后的结算与重新开始路径。
4. 切到限时模式；确认 03:00→02:59，暂停或锁屏 10 秒后倒计时与位置保持；恢复时不瞬移，也不立即因后台追帧死亡。
5. 中局返回原生列表、强停并重开、导出与导入备份；验证竞技场与计时恢复、经典存档继续、收藏与其他 36 个游戏进度不变。
6. 依次在省电/普通/游戏模式进入，检查画布清晰度与控制区不遮挡主要内容；用 Android WebView/GeckoView 和 iOS WKWebView 各验证一次布局与双指操作。
7. 长局实际采集帧时间、输入延迟、掉帧、内存与温度；本次没有占用设备或浏览器，不把单元测试和离线绘图当作该项通过。

可从 `wanbaApp.inspect().controller` 查看 `mode/elapsed/remaining/length/boost/alive/ended/render`；模式按钮带 `data-snake-mode`，操纵控件带 `data-arena-stickzone/data-arena-boost/data-arena-control`，便于后续既有 QA 工具定位。

## 待接入五语言的新增原文

以下文本已在游戏 DOM 使用稳定原文；语言包由根任务在本轮 i18n 1.0.4 中补齐。数字与静态标签尽量分为独立节点；结算的静态标签经共享 translateSource 拼接。

- 离线 AI 竞技场
- 小蛇，也能成为第一
- 吃彩点变长，巧妙走位，让对手撞上你的身体。所有对手均由本机 AI 控制。
- 无尽竞技
- 限时挑战 · 3 分钟
- 经典方格
- 竞技模式：左手摇杆，右手长按加速。经典模式保留原有规则和存档。
- 离线 AI 贪吃蛇竞技场
- 离线 AI
- 长度
- 长度榜
- 方向摇杆
- 按住加速
- 左手转向 · 右手加速 · 碰到其他蛇身即淘汰
- 摇杆：浮动
- 摇杆：固定
- 你
- 限时结束
- 竞技结束
- 最长
- 淘汰
- 存活
- 秒
