# 拧螺丝 1.1.0 竞品与样包分析

## 样包边界

- 样包：`Screw Jam Master 1.0.28`，包名 `com.game.sjm_android`，版本码 28。
- 文件 SHA-256：`856b8a5b2faa2019daf73385cb0daa6eb92b07c1a5d8066633b7aea1930446b6`。
- 分析只用于确认交互结构、渲染技术与性能边界。第三方代码、图片、音频、关卡文件均未复制到项目。
- 运行观察在断网的隔离 Android 模拟器内完成。应用弹出其自身服务条款后未继续操作；测试结束后已卸载并恢复网络。

## 静态分析结果

样包采用 Unity 6000.3.10f1、IL2CPP、URP、Spine、DOTween 与 Addressables。基础 APK 约 114.8 MB，ARM64 拆分包约 37.0 MB；主要原生库 `libil2cpp.so` 约 89.6 MB。资源索引中可识别 852 张纹理、776 个 Sprite、41 段 Animation 和 47 个 AudioClip。

玩法结构中可识别 `ScrewItem`、`PlankItem`、`CollectScrewManager`、`CollectScrewLayer`、`Box`、`HammerAni`、`Levels_SO` 和 `LevelOrder_SO` 等对象。螺丝具有 `up / mid / down` 三段视觉状态；奖励关卡预制体大量使用 `Rigidbody2D` 与碰撞体。音效按钻动、拔出、开箱、飞入、关箱、木板破裂和物体落下等动作拆分。

这些证据说明它的手感来自完整反馈链：点击后螺丝先抬升并旋转，再飞向颜色盒或临时孔位；颜色盒装满后封箱并补入下一箱；板件失去支撑后独立坠落。关卡通过资源对象编排，而不是每局随机堆出不可预测的盘面。

样包同时集成 Firebase、AppLovin 及多家广告聚合 SDK，并申请广告 ID、通知、位置、电话状态和存储等权限。这些都不是核心玩法所需能力，本项目不引入。

## 公开竞品对标

[Screw Jam 官方说明](https://rollic.helpshift.com/hc/en/10-screw-jam/faq/255-how-to-play-screw-jam/)定义了颜色盒匹配、5 个临时孔位、隐藏螺丝和孔位占满失败；其[障碍物说明](https://rollic.helpshift.com/hc/en/10-screw-jam/faq/561-what-are-the-obstacles/)还列出绳索、冰层、百叶、炸弹、锁链、钥匙、换色器、旋转器与盖板。首版先复刻清晰的核心循环，障碍物作为后续关卡扩展。

[Screwdom](https://apps.apple.com/us/app/screwdom/id6740043080?platform=ipad)、[Screw Away](https://play.google.com/store/apps/details?id=com.screw.away.pin.puzzle.and)与[Nuts And Bolts](https://play.google.com/store/apps/details?id=game.genix.nuts.bolts.twisted.tangle.puzzle)共同强调分层物件、触摸反馈、立体材质和无计时解谜。公开评价中反复出现强制广告、必须购买道具、切后台丢进度、随机无解与关卡重复等问题，因此本项目采用离线、无广告、确定性可解关卡和自动存档。

## 1.1.0 实现映射

- 12 关经典工坊与无尽工坊，关卡由固定种子生成并逐关增加层数和材质。
- 3 个活动颜色盒、下一箱预告、5 个临时孔位；每盒收纳 3 颗同色螺丝后自动封箱。
- 上层遮挡判定与 28 逻辑像素触控命中区；移动端工具按钮至少 44 CSS 像素。
- 螺丝抬升、旋转、弧线飞入，板件按真实时间步坠落，低帧率不会让动作变慢。
- 撤销、提示、一次加孔、星级奖励、关卡结算、刷新续玩与旧版随机盘面存档迁移。
- 省电、普通、游戏三档分别限制 1x、2x、3x Canvas 像素倍率；静止时停止请求动画帧。
- 所有板件与螺丝使用原创程序化 Canvas 绘制，保持小体积和不同屏幕上的清晰度。

## 1.2.0 无尽模式与视觉更新

- 无尽工坊恢复为单局连续游玩：剩余螺丝不多于 24 颗或活动板件不多于 8 块时，从当前板件下方补入新层，不出现关卡完成弹窗。
- 临时孔位占满是无尽模式唯一的自然结束条件；退出或刷新继续保存当前层、收纳盒、暂存孔和板件状态。
- 恢复原有加盒机制，初始 3 盒、最多 6 盒、共 3 次扩容；最终分数按 3/4/5/6 盒分别使用 2.2/1.75/1.35/1.05 倍率。
- 经典工坊仍保持 12 关、星级、一次加孔和逐关结算，不受无尽规则影响。
- UI 改为低饱和浅色手作工坊，采用暖木、磨砂亚克力、缎面金属和珍珠螺丝；压缩 HUD 高度并维持至少 44 CSS 像素的工具触控区。
- 概念稿与实现均为本项目原创，未复制样包的代码、图片、音频或关卡资源。
