# GeckoView 离线许可证与源码记录

兼容版使用官方依赖 `org.mozilla.geckoview:geckoview:155.0.20260903215306`，运行时为 `155.0.1`，构建编号 `20260903215306`。未修改引擎源码。系统版使用设备提供的 Android System WebView。

在“设置 → 开源致谢 → 查看许可证”中，兼容版增加完整 GeckoView 许可证和对应源码两个入口。正文以 `textContent` 放入可滚动文本区，不需要网络，也不打开浏览器特权页面。六个原有弹球许可入口保留。文件在 `standalone/licenses/`，现有资产打包器和两个宿主的本地读取规则会一起收录它们。

## 精确来源

- [官方 AAR](https://maven.mozilla.org/maven2/org/mozilla/geckoview/geckoview/155.0.20260903215306/geckoview-155.0.20260903215306.aar)
- [对应源码提交](https://hg.mozilla.org/releases/mozilla-release/rev/5fdfd0092780e85643e2cddc0e1b590c8b9ef860)
- [对应源码下载](https://hg.mozilla.org/releases/mozilla-release/archive/5fdfd0092780e85643e2cddc0e1b590c8b9ef860.tar.gz)
- [Mozilla 构建指南](https://firefox-source-docs.mozilla.org/mobile/android/geckoview/contributor/geckoview-quick-start.html)

源码提交直接取自该 AAR 的 `assets/omni.ja` 中 `chrome/toolkit/content/global/buildconfig.html`，不从当前主干或 UA 推断。

`GeckoView-NOTICES.txt` 来自同一个 `omni.ja` 的完整 `chrome/toolkit/content/global/license.html`：保留整个 body 的许可文字，将块元素转换为换行、保留预格式化正文，将外部链接目标附在文字后。另附 `chrome/pdfjs/content/web/cmaps/LICENSE`、`standard_fonts/LICENSE_FOXIT` 和 `standard_fonts/LICENSE_LIBERATION` 的原始文本。未只截取 MPL，也未省略依赖中的第三方声明。

`GeckoView-PROVENANCE.json` 记录四个原始文件的字节数及 SHA-256、`omni.ja` SHA-256、转换后文本的字节数及 SHA-256。`GeckoView-SOURCE.txt` 把对应源码获取路径与构建说明一起提供给离线用户。

## 更新与校验

升级 GeckoView 时，先取得精确版本 AAR，使用 ZIP 工具提取 `assets/omni.ja`，再从嵌套 ZIP 提取上述四个许可证和 `buildconfig.html`。同步重新生成正文、源码链接与校验记录，再运行：

```sh
node --test tests/standalone-licenses.test.mjs tests/standalone-app-info.test.mjs tests/standalone-bootstrap.test.mjs
```

发布包回归时在断网状态打开两条 GeckoView 入口，检查许可正文与源码链接可见，并用系统返回逐层关闭到设置页。原生依赖版本仍由 Gradle 决定，网页版本展示读取原生只读 `getAppInfo()`；`inspect().appInfo.providerVersion` 保留构建编号用于核查。
