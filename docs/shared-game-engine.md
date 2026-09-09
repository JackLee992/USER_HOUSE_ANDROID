# 共享游戏运行层

实现记录 · 2026-09-09

`src/games/shared/` 提供两个可以分别使用的运行模块：WebGL 批次与资源管理、按需绘制调度。Zuma 使用前者；静态棋盘类游戏可以使用后者。共享目录位于 `plugins/` 之外，不能作为可启动游戏登记。

这是首个轻量 WebGL 1 后端，支持游戏自行提交的着色器与三角形顶点数据。当前没有场景树、相机系统、深度缓冲、模型导入、材质编辑器或物理引擎，也没有引入 Three.js。Zuma 的立体球体仍由原有解析球面 shader 绘制。后续游戏可以复用这里的 GPU 管理，但还需要编写自己的几何、交互和游戏规则。

## WebGL 后端

入口：`src/games/shared/webgl-surface.js`。

```js
const surface = createWebGLSurface(canvas, { onFallback });
const batch = surface.createBatch({
  vertex, fragment,
  attributes: [['aPosition', 2], ['aUV', 2]],
  uniforms: { uSize: 'vec2', uAtlas: 'sampler2D' },
  blend: 'alpha',
});
const atlas = surface.createTexture();
const ready = surface.uploadTexture(atlas, image);
if (ready && surface.beginFrame()) {
  surface.drawBatch(batch, {
    vertices, // 交错存储的 Float32Array；每个顶点四个 float。
    count: vertices.length / 4,
    uniforms: { uSize: [logicalWidth, logicalHeight] },
    textures: { uAtlas: atlas },
  });
}
// 所属游戏退出时调用；可以重复调用。
surface.destroy();
```

该模块直接持有 WebGL context、program、shader、buffer、texture，并执行真实的编译、上传与 `drawArrays`。批次和纹理返回不透明句柄，不能跨 surface 使用。模块不向游戏暴露 context，因此每个 surface 独占自己管理的绘制状态。

- 每个批次创建一组 program 和 buffer；重复绘制复用 GPU 对象，顶点内容经 `bufferData` 上传。调用方负责复用 CPU 顶点数组和按需上传图集。
- attribute 的 location、stride 与 offset 在创建批次时确定。每次绘制重新指定指针，禁用上个批次多余的 attribute，允许不同 shader 在同一 location 使用不同布局。
- sampler 的纹理单元和绑定在每次绘制时明确设置。没有 sampler 的特效遍会清除前一遍的纹理绑定，下一次球体绘制重新绑定图集。
- uniform 支持 `float`、`int`、`vec2`、`vec3`、`vec4`、`mat4`、`sampler2D`；驱动优化掉的 uniform 会被跳过。非 sampler uniform 每遍提供值，不继承上一帧的值。
- 混合方式支持预乘 alpha 的 `alpha`（`ONE, ONE_MINUS_SRC_ALPHA`）和 `additive`（`ONE, ONE`）。纹理采用 LINEAR、CLAMP_TO_EDGE，不创建 mipmap 或后处理渲染目标。
- `beginFrame()` 按 canvas 实际像素尺寸设置 viewport 并清空透明背景。逻辑尺寸与 DPR 由游戏和现有性能服务决定；共享层不修改 DPR、性能设置或浏览器时钟。
- context 获取、shader/program/buffer/texture 分配、编译、链接或图集上传失败时，回收此前成功分配的资源，隐藏 canvas，并至多调用一次 `onFallback(error)`。`available` 随之为 false，后续创建和绘制返回空句柄或 false。
- context 丢失时停止绘制、移除监听器并通知 fallback；驱动已经使旧资源失效，因此不再向丢失的 context 发清理命令。此永久回退路径不调用事件的 `preventDefault()`，不允许旧 context 在脱离资源管理后恢复。游戏保持 Canvas 2D fallback，重新进入游戏时再创建 surface。
- 正常 `destroy()` 显式删除资源，并在支持时释放 context；销毁后没有监听器，也不会继续分配或绘制。

Zuma 的 `createMarbleGL(canvas, onFallback)`、`ready`、`setAtlas`、`draw`、`destroy` 外部接口保持不变。`marble-gl.js` 保留球面/光照 shader、六顶点四边形几何和 CPU 数组复用，只把实际 GPU 工作交给共享 surface。球链与发射球仍合并为一遍，存在特效时再绘制一遍；每帧先清空画布，所以最后一个特效消失后不留下旧图像。

Zuma 的 `view.js` 帧循环、引擎步进、暂停时间和存档结构不属于这次共享后端提取的改动范围。动画游戏需要连续推进的时间必须继续由游戏自己的时钟负责。

## 按需绘制调度

入口：`src/games/shared/demand-renderer.js`。

```js
const renderer = createDemandRenderer({
  window: win,
  document: doc,
  isActive: () => env.isActive(),
  isPaused: () => env.isPaused(),
  render: () => drawBoard(),
});
renderer.invalidate(); // 初始绘制；创建本身不请求一帧。
// 输入、尺寸改变、应用恢复等逻辑完成后调用 invalidate()。
// 所属游戏退出时调用 renderer.destroy()。
```

`invalidate()` 在可见、活动且未暂停时最多排入一个 rAF。同一帧前的多次输入合并为一次绘制，绘制结束不自动安排下一帧。`render(timestamp)` 得到浏览器当次时间戳，但调度器不累计游戏时长、不推进物理，也不包含持续计时器。持续变化的内容应由所属游戏显式请求下一帧或使用原有游戏循环。

调度器在排入和执行回调时都读取 `isActive()`、`isPaused()`。调用方应在暂停/继续等宿主状态改变时调用 `invalidate()`：暂停会取消旧请求，继续会请求新一帧。文档隐藏、`pagehide` 会取消待执行工作；可见、`pageshow` 会重新检查活动/暂停状态并请求一次绘制。隐藏期间的失效不会积累回调。尺寸变化由调用方先更新尺寸再失效。

`destroy()` 可以重复调用，会取消排队的 rAF 并移除 document/window 监听器。晚到的回调和销毁后的 `invalidate()` 不会再绘制。

## 验证与交付边界

运行：

```sh
node --test tests/shared-game-runtime.test.mjs tests/zuma-render-contract.test.mjs tests/zuma-classic.test.mjs tests/zuma-save-compat.test.mjs tests/performance.test.mjs
```

共享后端测试使用有实际资源跟踪的 mock WebGL/canvas，验证两遍提交、跨 shader attribute 布局、纹理重绑定、GPU 对象复用、所有分配失败、编译/链接失败、纹理上传失败、context 丢失和幂等释放。资源回收测试不会用 `loseContext()` 清空模拟资源来掩盖遗漏删除。调度测试验证空闲零请求、失效合并、隐藏取消、前台单帧、暂停/活动状态检查及销毁后的静默。

这些测试验证的是 API 调用与生命周期约束，不能证明 GLSL 在真机上的视觉效果、GPU 帧耗时或电量下降。设备画面、真实输入流和发布包验证仍须在集成后的内容包上完成。共享源文件必须随引用它的游戏进入同一不可变内容快照，并参与文件 hash 与依赖闭包校验；游戏版本、内容版本及签名发布由现有内容发布流程管理。

## 桌面浏览器实测

2026-09-09 使用独占 Chrome headless profile `.local/qa-shared-engine-browser-profile`、CDP `9358`、本地 HTTP `8878`，对真实 standalone 入口运行 `tests/zuma-browser.mjs`。`eco`、`normal`、`game` 三档均通过换球、拖动发射、首次暂停弹窗皮肤、暂停时完整状态冻结、横竖屏旋转和存档退出/续局。截图与报告保存在 `.local/qa-shared-engine/{eco,normal,game}/`。

新增 `tests/shared-engine-browser.mjs` 在 DPR 3 下验证真实 GPU 分配、两种混合遍与实际 context 丢失。报告为 `.local/qa-shared-engine/runtime/report.json`：

| 档位 | 实际 canvas 像素 | 后端 | GPU 实测 |
| --- | --- | --- | --- |
| eco | 390 × 477 | Canvas 2D | 零 GPU 对象、零 WebGL draw |
| normal | 780 × 953 | WebGL | 4 shader、2 program、2 buffer、1 texture；alpha 与 additive 均执行 |
| game | 1170 × 1430 | WebGL | 4 shader、2 program、2 buffer、1 texture；alpha 与 additive 均执行 |

三档逻辑画布 CSS 尺寸均为 390 × 476.65625。普通和游戏模式通过真实 `WEBGL_lose_context` 丢失 context 后，GPU draw 不再增加；换球仍交换当前/预告球，实际触控发射使 shot 计数从 1 增至 2，Canvas 每帧球贴图由 2 增至 31/28，证明球链继续进入 2D 绘制。两档 context 丢失截图，以及游戏模式的发射球和拖尾截图均已目视检查；游戏模式回退画面中还观察到自然消除得分与减速反馈。

记录中的 JavaScript 异常、WebGL 错误和浏览器页面日志均为空。GPU 为 ANGLE Metal / Apple M5 Pro。这是桌面无头浏览器的真实渲染与输入验证；draw 数是 API 提交次数，不是显示 FPS，不能由此推断 Android 帧率、GPU 时间或电量下降。

发布前生命周期审查另修正了永久回退仍允许恢复 context 的问题：移除 `webglcontextlost` 中的 `preventDefault()`。相关 15 项单测通过，并只重跑普通/游戏模式真实丢失专项，最终证据为 `.local/qa-shared-engine/context-lifecycle-final/report.json`。两档均确认 `lossDefaultPrevented: false`、`contextRemainsLost: true`、未触发恢复事件；GPU 停止提交，Canvas 换球与再次发射仍通过，页面异常与 WebGL 错误为空。

复现补充运行：

```sh
CDP_PORT=9358 ZUMA_URL=http://127.0.0.1:8878/standalone/index.html QA_OUT=.local/qa-shared-engine/runtime node tests/shared-engine-browser.mjs
```
