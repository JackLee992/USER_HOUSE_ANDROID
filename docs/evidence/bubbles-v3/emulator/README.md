# 泡泡龙 v3 / content-8：模拟器已证实范围与收尾

2026-09-09，在 emulator-5554 的原系统版 APK 1.2.2 / code 6 上使用普通 ADB 原生触控、截图和正常 SAF 导入导出。未安装 APK、未清数据、未使用 CDP 或 run-as。

- content-7 → content-8 正常检查、下载两包（1.8 MB）并激活；首次原生观测 2976 ms 即显示资源 1.3.2 / 游戏内容已就绪 / 检查更新 enabled=true，未切换焦点补救。
- 升级前后五项保存数据与 37 款游戏进度完全相同。
- 旧泡泡龙局显示六种完整形状新图与加大的下一颗球；截图已实看。换球实测红心与绿三角互换，真实触控可发射。
- 竖屏 taptext 暂停未得到预期状态，确切输入原因未确认；随后横屏显式坐标成功出现“继续”与 PAUSE。没有把未确认触控归为产品缺陷，也不声称本轮完成了完整暂停保护、保存和冷启动续局回归。
- 用户要求下一版改为减少装饰的 v4 后停止此轮玩法测试。通过正常导入发射前 `after-update` 备份恢复，再次正常导出 `after-restored` 与最初 `before` 五项数据完全一致：37 款游戏、原泡泡龙 74 球 / 220 分 / 8 发 / 5 炸弹均还原。
- 最终保留内容 8，原 APK 安装时间未变，代理恢复 null，旋转恢复 auto=1 / user=0，停单人首页。

`native-verification.json` 为结构化结论；`after-update-comparison.json` 和 `after-restored-comparison.json` 为脱敏逐项哈希证据；`content8-native-ready.json` 为首次就绪观测。完整备份、原始 native 树和驱动诊断留在本地私有 QA 目录。
