# 玩吧 App 图标素材

本图标以 App 名称中的单字“玩”为主体。完整保留王字旁与元的可读结构，在元的上横中嵌入珊瑚、薄荷两颗按键，建立与休闲游戏合集的联系。奶油色立体字形和深蓝背景形成清楚的明暗对比，使用原有游戏素材的温暖玩具感，不使用第三方品牌、现成游戏手柄标志或屏幕截图。

## 文件与接入

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `assets/app-brand/master.png` | 1254 × 1254 | imagegen 完整背景主图，Web 品牌展示和关于页面 |
| `assets/app-brand/app-icon.png` | 512 × 512 | 主图技术缩略版，Web App 图标 |
| `assets/app-brand/foreground-source.png` | 1254 × 1254 | imagegen 提取的原始透明字形，保留来源 |
| `assets/app-brand/foreground.png` | 1080 × 1080 | 已按安全区缩放并居中的 Android adaptive 前景 |
| `assets/app-brand/background.png` | 1080 × 1080 | Android adaptive 背景，纯色 `#061744` |
| `assets/app-brand/mask-preview.png` | 900 × 520 | 圆形、方圆形与 48 / 96 px 预览验收图 |
| `assets/app-brand/preview-{circle,squircle}-{48,96,192}.png` | 对应尺寸 | 单独的系统遮罩预览 |
| `assets/app-brand/icon-validation.json` | — | 安全区测量结果 |
| `assets/app-brand/render-previews.py` | — | 可重现的技术缩放、遮罩预览与测量脚本 |

Android adaptive 图标使用 `foreground.png` 与 `background.png` 两层，均对应 108 dp 全尺寸图层；前景已含留白，**不要再额外添加 18 dp inset**。完整背景主图不应直接作为 adaptive 前景，否则背景会跟随前景运动。应用名称使用 Android label“玩吧”，不需要在图标中再挤入第二个小字。

## 标准与验收

已查阅 [Android 官方 Adaptive icons 规范](https://developer.android.com/develop/ui/compose/system/icon_design_adaptive)（2026-09-08）：图层为 108 dp，重要标志保持在中央 66 dp 安全区，背景延伸到边缘，系统可以应用圆形或其他 OEM 遮罩；彩色图标使用独立前景和背景层。主题单色图层为可选功能，本轮交付彩色资源。

为稳妥起见，技术脚本将有意义的字形收进中央 **66 dp 安全圆**。最终 alpha ≥ 16 的字形外接圆直径为 **64.58 dp**。该阈值仅用于忽略透明提取产生的极淡边缘并测量主体，输出文件保留原 alpha，没有用阈值重画或硬切字形。

已实际打开并检查生成主图和 `mask-preview.png`：字形为正确的“玩”，笔画无缺失；圆形和代表性方圆形遮罩中都未裁切主体；48 px 缩略图中仍可识别“玩”，两颗按键作为辅助游戏提示。方圆预览使用四次超椭圆，代表常见形状，并不宣称穷尽各厂商遮罩。预览按 Android 的中央 72 dp 静态视口模拟，实际系统启动器仍由原生开发回归验证。

透明前景相较带蓝色光晕的主图使用简洁纯色背景，减少 launcher 小图中的杂色。透明提取工具扩大了字形，随后只进行技术缩放和居中来满足安全区；所有图形设计和透明抠图均来自内置 imagegen，未用程序绘制品牌字形。

## 工具与来源

- 生成方式：内置 `image_gen.imagegen`，非 CLI/API 回退。
- 品牌主图来源：`exec-22eef29c-162d-4b9d-b4ea-67058409bab9.png`，生成会话 `01a07fe8-407a-7720-b70d-52e9228ad6ac`。
- 透明前景来源：`exec-235a60b1-bdbf-4002-acb3-83906105fa8b.png`，同一生成会话。
- 系统输出的真实主图尺寸为 1254 × 1254；不将提示中的“高分辨率”误报为未生成的尺寸。
- 初版通用手柄方案因缺少 App 名称识别而未采用。最终主图为下列品牌提示词的新生成图，透明前景为后续编辑。

## 主图精确提示词

```text
Use case: logo-brand
Asset type: Original Android app launcher brand icon for a casual game collection named 玩吧.
Primary request: Design a distinctive premium app identity around ONE large beautifully drawn simplified Chinese character "玩". The character is the visual logo, not a caption. It must be immediately recognizable as the exact standard Chinese character 玩, left radical 王 plus right component 元, with correct complete strokes and readable open negative space. This typographic identity should feel like a delightful tactile game toy.
Text (verbatim): "玩". Absolutely no other text.
Subject and design: A bold custom rounded Chinese wordmark formed as one cohesive sculptural toy logo. Use warm ivory and cream for the thick rounded strokes. Integrate one small coral and one small mint circular inset button into an appropriately broad stroke of the right component as tasteful game controller details. The intact wordmark silhouette and correct Chinese letterform take priority over the button idea. Do not replace the whole character with a controller; do not distort or lose the 王 or 元. No underline, caption, surrounding badge, extra pictograms or decorative objects.
Style/medium: Beautiful high-end 3D toy letterform, satin ceramic and soft-touch plastic, restrained shallow sculptural depth, very clean edges and spacious counters. Almost straight-on so that Chinese legibility is excellent. Soft warm light from upper left and cool reflected light, premium polished finish without distracting shine. Strong recognizable visual identity at tiny launcher sizes.
Scene/backdrop: Full-bleed deep midnight-blue square, with a very subtle rich blue glow behind the logo. Keep the four corners plain dark blue. No pre-rounded tile, outer frame, visible canvas border, or mockup.
Composition/framing: The complete character logo must fit inside a centered 58 percent by 58 percent region of the entire square canvas, leaving 21 percent clear background on EVERY side. Centered optically. All meaningful strokes must remain inside this safe area for Android adaptive icon cropping. The logo should read clearly when reduced to 48 pixels. No tiny extraneous details.
Color palette: Warm cream identity, coral and mint button accents, deep navy background.
Constraints: Original unbranded identity, not a third-party logo. Exact Chinese character 玩 only. No Latin letters, numbers, watermark, phone, hand, app UI, game screenshot, multiple concepts, design sheet or other objects. Output one high-resolution square icon artwork.
```

## 透明前景精确提示词

```text
Use case: background-extraction
Primary request: Extract the exact existing sculptural Chinese character logo 玩 as a transparent PNG foreground layer for an Android adaptive icon.
Preserve unchanged: the entire exact character design, every Chinese stroke, ivory/cream 3D material, coral and mint inset buttons, shading on the character itself, exact scale, exact position, and the full square canvas dimensions. Do not redraw, resize, improve or reposition the logo.
Change only: remove the entire blue backdrop and its blue light glow and backdrop drop shadow; make all background pixels, including spaces and holes between strokes, genuinely transparent with an alpha channel. Clean antialiased object edges. Keep the letter's own shaded side faces opaque.
Critical: Output actual transparency, not a checkerboard image. No new shapes, white rectangle, labels, borders or objects. Same square framing and central safe area as the reference.
```

## 重现技术衍生资源

安装 Pillow 的 Python 环境中执行：

```sh
python3 assets/app-brand/render-previews.py
```

512 px Web 图标仅为 `master.png` 的等比技术缩小。Android 各密度资源应从 `foreground.png` / `background.png` 生成，不从 48 px 预览放大。
