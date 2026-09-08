# 独立内容版本与发布

APK 与内容分开：原生宿主在本仓库发行；37 款游戏的代码、美术、共享 core 和五种语言在 [USER_HOUSE_GAME_PACKS](https://github.com/JackLee992/USER_HOUSE_GAME_PACKS) 发布。固定协议见 [game-update-design.md](game-update-design.md)。

## 日常更新

1. 修改游戏或资源，完成对应玩法、暂停、存档和视觉回归。游戏实际入口位于 `src/games/plugins/<id>/index.js`；五款原模块由入口适配器引用。不要只改注册 JSON 冒充代码更新。
2. 只给变化的包升版本：游戏改对应 `GAME_VERSION`；美术、语言和 core 改 `content/versions.json`。首期 `saveSchemas` 必须保持不变。不兼容的存档变更需要先升级宿主与迁移协议。
3. 提交并推送源码，保存上一份已发布 `channel.json`。构建器验证旧清单签名，并阻止未升版本的内容变化、无内容变化却升版本、非单调发行序号和删除已有游戏。
4. 构建并签名：

```sh
node tools/content/build-packs.mjs --sequence 2 --version 1.0.1 \
  --previous .local/content-1/channel.json \
  --key .local/resource-signing/private.pem --output .local/content-2
```

私钥为发布方私有 P-256 PEM，不能提交到 Git，不能打印或打入 APK。初始 App 的公钥在 `android/app/src/main/assets/content-update/public-key.der`；换公钥需要通过 APK 更新信任根。

5. 审核 `release.json` 的变化列表、下载量、源码 commit，再用两种 Android flavor 测试从上一版本下载、保存后激活、旧快照隔离、离线重开和回退。发布：

```sh
node tools/content/publish-packs.mjs .local/content-2 --publish
```

此命令先创建 draft，再上传完整清单与变化包，最后发布。去掉 `--publish` 只上传 draft。仓库开启不可变发行，发布后不能覆盖资产，修复必须创建新序号。失败的 draft 可在 GitHub 检查，不能对已发布版本使用覆盖上传。客户端仍独立验签、验哈希，不把不可变发行当成唯一保护。[GitHub 不可变发行文档](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

6. 发布仓库 Actions 自动检查清单签名和全部 ZIP 摘要；再用已安装 App 从真实 GitHub 地址检查更新并安装。用户不需要卸载或登录 GitHub。

## 新 APK 内置基线

最终内容冻结后，使用相同构建命令附加 `--builtin`，把签名清单写到 Android assets。随后再构建 APK。不能在签名后修改任何内置 www 文件；若修改，必须重新生成清单。APK launcher 图标和 GeckoView 内核属于 App 版本，美术包无法更换 native 图标或内核。

输出目录中的 `www` 是构建暂存，不能整体作为单个游戏包发布；ZIP 根据真实文件所有权自动分组。每个文件只有一个归属包，包内路径从 `src/`、`assets/` 等逻辑根开始，无额外 `www/` 外层。共享 atlas 归 `art.shared`，专属图片/声明归 `art.<id>`；修改共享 atlas 会提示所有依赖它的游戏资源变化。

## 验证入口

```sh
node --test tests/content-publisher.test.mjs tests/content-state.test.mjs tests/standalone-bootstrap.test.mjs
```

发布器测试使用两次真实签名构建：只修改一款游戏的工厂，确认其余包 URL、ZIP 与版本完整复用；Python ZIP reader 独立验证归档。Android 的签名、ZIP、快照状态机与真实下载测试另见协议文档。旧历史记录缺少版本时保持未知，不追写本次版本；新局的 `_content` 元数据在开局锁定，并随存档、记录和备份保存。
