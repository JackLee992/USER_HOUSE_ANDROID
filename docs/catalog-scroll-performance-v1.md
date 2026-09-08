# 首页列表滚动优化与回归记录

日期：2026-09-08。范围：独立 Android App 的首页 23 款单人游戏、14 款人机游戏列表；不改变游戏时钟、物理速度或手势方向。

## 已确认的问题与修改

Chrome 的 `DOMDebugger.getEventListeners` 显示，旧版首页保留了宿主页隔离用途的非 passive `wheel`、`touchmove`，分类横滑还使用非 passive `touchstart`/`touchend`。更新组件在 document 上长期注册非 passive `touchmove`，即使列表已经向下滚动也会经过该处理路径。此类监听会令浏览器先等待主线程判断是否取消滚动。

- 独立 App 移除只用于阻止事件向宿主传播的 popup 监听；酒馆宿主模式继续保留原行为。
- 独立 App 的横向分类切换采用 passive 触摸监听，重复绑定时清理上次监听。
- 更新组件只在列表顶部、非按钮区域的下拉候选手势期间，在当前滚动容器临时绑定可取消的 `touchmove`。确定向上滚动或横滑后即解绑。普通滚动不保留可取消监听。
- 下拉提示仅在“继续下拉”和“松开刷新”阈值变化时更新文字，避免每个 move 都触发文案观察器。
- 独立页面的 shell 不再进行无宿主背景可模糊的 `backdrop-filter`；列表采用 `contain` 限制布局/绘制影响范围。移动触屏卡片缩小阴影并取消悬停抬升效果。图片、主题、卡片内容和点击入口保留。

修改后的静止首页，在 document、popup、body 上没有常驻非 passive 触摸/滚轮监听。八次滚动中 DOM 文本/子节点变化前后均为 0，因此本次没有把 i18n 重复 DOM 更新认定为已经复现的滚动根因，也没有修改翻译观察器。

图标负责人确认：本轮前后 trace 之间未落入任何额外图标缓存或美术变更；使用同一批 37 款新图标。图标独立性能改造没有计入本次。

## 桌面对照数据及限制

测试采用独立 Chrome 测试配置，360 × 780 CSS 像素、DPR 3、4 倍 CPU 降速、`--headless=new --disable-gpu`。两次均通过 CDP 发出相同的 8 次真实触摸滚动手势，覆盖两个分类。每次约 8 秒，禁止惯性滚动以便范围可对照。

| 指标 | 优化前 | 优化后 |
| --- | ---: | ---: |
| RasterTask 数量 | 56 | 56 |
| RasterTask 累计耗时 | 79.348 ms | 42.845 ms |
| 最长 RasterTask | 4.906 ms | 2.617 ms |
| EventDispatch 累计耗时 | 40.139 ms | 30.522 ms |
| Paint 次数 / 累计耗时 | 4 / 5.122 ms | 10 / 8.383 ms |
| rAF 间隔 P95 | 16.7 ms | 16.7 ms |
| 滚动阶段 DOM 文本/子节点变化 | 0 | 0 |

这组桌面测试没有复现用户真机上的低帧率。数据说明本轮绘制与事件处理工作量有所降低，不能将其直接换算为手机 FPS 增幅、电量节省或 GPU 呈现性能；单次 trace 也存在运行噪声。rAF 是调度采样，不是显示器呈现帧率。LayerTree 在本次 headless 配置返回空列表，不能据此认定页面无合成层。

真机负责人将针对最终签名资源包执行同机持续滑动，物理设备结论应以后续真机证据为准。

## 行为回归

- 简体中文、繁体中文、英文、日文、韩文 × 省电、普通、游戏 × 两个分类，共 30 个组合、60 次真实上下滑动通过。分类数量维持 23 / 14，滚动确实改变 scrollTop，未误触进入游戏，无页面横向越界。
- 横向手势切换分类通过；进入空档接龙及返回首页通过。
- 更新 UI 完整浏览器回归通过，包括真实触摸下拉刷新、异步健康确认、单包下载/安装、游戏中隐藏更新控件，以及回退确认按钮经历 touchend 后仍触发正确动作，没有穿透到下方游戏卡片。
- 回退操作提供稳定控件 ID：`wanba-rollback-games`、`wanba-confirm-rollback`、`wanba-cancel-rollback`。更新组件继续只在真实下拉候选结束时重绘，按钮 tap 不拆除目标。
- 全套 Node 测试：181 / 181 通过，0 跳过，0 失败。游戏时序相关回归包含在内。

已查看英文首页截图：卡片图片和滚动容器显示正常。360 px 英文分类栏中的 “Play the computer” 较长，计数附近仍偏拥挤；不影响本轮触控行为，按发布冻结要求留作后续布局细化。

## 复现与证据

脚本：`tests/catalog-scroll-browser.mjs`、`tests/catalog-scroll-controls.mjs`。要求独立 Chrome CDP 端口 9348、项目 HTTP 服务端口 8768；不得连接日常浏览器或占用真机测试会话。

```sh
QA_PHASE=baseline node tests/catalog-scroll-browser.mjs 9348
QA_PHASE=optimized node tests/catalog-scroll-browser.mjs 9348
node tests/catalog-scroll-controls.mjs 9348
node tests/content-update-browser.mjs 9348 http://127.0.0.1:8768
node --test tests/*.test.mjs
```

前后比较须分别使用修改前后源码，不能在同一优化后源码上仅更改 phase。更新 UI 测试会向当前测试 tab 注入模拟原生桥，之后的无桥性能采样须新建干净测试 tab 或重启隔离 Chrome。

原始 trace 使用无损 gzip 保存，可解压后在 Chrome Performance 中加载：

- [前后结果、原始 trace、完整性散列和控件截图](evidence/android-1.2/catalog-scroll/)
- [真实更新下拉与回退测试结果](evidence/android-1.2/update-web/result.json)
- [181 项单元测试输出](evidence/android-1.2/catalog-scroll/unit-suite.txt)

生产文件范围：`standalone/app.css`、`standalone/game-updates.js`、`src/runtime/wanban-app.js` 的独立页面事件绑定。性能模式及其他并行修改由各自记录说明。
