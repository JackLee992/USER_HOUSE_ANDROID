# 玩吧 iOS 测试分发与上架操作说明

核对日期：**2026-09-09**。本文依据 Apple 官方公开文档整理；账号实际状态、签名、上传和审核结果仍为待办，本文不表示这些操作已经完成。Apple 的 SDK 门槛、审核条款和 App Store Connect 界面会更新，每次正式提交前应重开对应链接核对。

首版计划是原生首页、收藏、排序和偏好设置，使用 WKWebView 运行随 App Bundle 提供的 37 个内置 HTML5 游戏。iOS 的远程游戏包下载功能关闭；原生 bridge 仅供自有本地页面的主 frame 使用。发布负责人必须在最终归档中验证这些边界。Android 已发布的内容包和热更新能力不代表 iOS 已获相同分发许可。

建议先用内部 TestFlight 验证真机，再邀请少量外部测试者，最后提交 App Store。已知少量设备的临时安装可使用 Ad Hoc。下文提供这些路径的实际步骤；不涉及登录签名账户、创建证书或提交上传。

## 1. 选择分发方式

| 方式 | 谁可以安装 | 数量与期限 | 审核与适用场景 |
| --- | --- | --- | --- |
| TestFlight 内部测试 | 获得 App 内容访问权限的 App Store Connect 团队用户；通过 TestFlight 安装 | 最多 100 名内部测试者；每个构建自上传起最多测试 90 天 | 不走外部 Beta App Review；适合团队先验收，不能为了邀请普通玩家随意授予团队权限 |
| TestFlight 外部测试 | 通过邮件或公开链接接受邀请的测试者；不需要成为开发团队成员 | 每个 App 最多 10,000 名外部测试者；同样受构建 90 天期限限制 | 外部组首次提交的构建需要 Beta App Review；后续构建可能不再完整审核，但不能预先保证免审 |
| Ad Hoc | UDID 已登记且被包含在该安装包 provisioning profile 中的设备 | 每个会员年度、每种设备产品系列最多登记 100 台；安装还受实际签名及 profile 有效期约束 | 无 App Store 上架审核；适合明确名单的设备测试，不适合向任意公众发放 |
| App Store | 选定可用国家或地区中的兼容设备用户 | 不使用上述 TestFlight 人数和 90 天测试期限 | 通过正式 App Review 后公开发行；适合持续面向用户提供服务 |

TestFlight 内外部名额和审核规则见 [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)，90 天从构建上传日起计算见 [TestFlight 测试者说明](https://testflight.apple.com/)。Ad Hoc 设备按 iPhone、iPad 等产品系列分别计数，年度中禁用设备不会立即返还名额，续费时才有相应设备列表重置流程，见 [Devices overview](https://developer.apple.com/help/account/devices/devices-overview)。

公开 TestFlight 链接可以被转发。创建时设置招募上限和需要的设备/系统条件，收够人后关闭链接；它是测试邀请，并非永不过期的公开安装渠道。内部用户还须具备 Apple 规定的角色与 App 访问权限，具体管理方法见 [TestFlight](https://developer.apple.com/testflight/) 和 [Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)。

**把 IPA 放到网盘或 GitHub，并不会让所有 iPhone 都能直接安装。** 安装资格取决于所选分发方式及签名。本文采用常规 TestFlight、Ad Hoc 和 App Store 路径；有地域与资格限制的替代分发需要另行评估，不能把它当作任意 IPA 通用直装能力。

## 2. 账号、主体与签名准备

### 账号选择

| 项目 | 个人账号 | 组织账号 |
| --- | --- | --- |
| 申请主体 | 个人或按个人注册的独资经营者 | 能独立承担法律责任的组织实体 |
| 商店销售者名称 | 个人法定姓名 | 组织法定名称 |
| D-U-N-S | 个人注册不需要 | 公司等组织通常需要；政府机构可不提供 |
| 申请资料 | Apple Account、双重认证、身份与年龄要求 | 另需法律实体信息、签约授权、工作域名邮箱及组织网站等资料 |

Apple Developer Program 标价为每年 99 美元，实际以所在地区可用币种和结算条件为准。免费 Apple Account 可用于 Xcode 的部分个人设备开发测试，不能替代 TestFlight/App Store 所需会员资格。依据：[Program enrollment](https://developer.apple.com/help/account/membership/program-enrollment)、[D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S/)、[Compare memberships](https://developer.apple.com/support/compare-memberships/)。

本项目需由拥有者确定主体、Team ID 和长期 Bundle ID；App Store 显示名称可以本地化，不应据此为每种语言注册一个独立 App。App 记录创建、协议及适用的税务/银行资料按 [App Store Connect workflow](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow) 完成。

### 签名对象如何对应

| 对象 | 用途 | 本项目应记录的内容 |
| --- | --- | --- |
| Team ID | 标识开发团队 | 发布团队 ID 与负责人 |
| Bundle ID / 显式 App ID | 标识 App，并匹配能力配置 | 一个稳定 ID；首次上传前确定 |
| Apple Distribution 证书及对应私钥 | 为发行归档签名 | 证书标识、到期时间、受控保管位置；不在文档中记录私钥 |
| Provisioning profile | 将 App ID、证书、权限及对应分发条件联系起来 | 分发类型、有效期、实际 entitlements；Ad Hoc 还须包含设备名单 |
| App Store Connect App 记录 | 承载构建、商店资料、测试组与发行版本 | App 的数字 ID、SKU、主语言、已选 Bundle ID |

首版可在 Xcode 开启自动签名并选定正确 Team，由 Xcode 管理适用的 profiles。手动签名时，App Store Connect profile 需要显式 App ID 与发行证书；Ad Hoc profile 还要选定已注册的设备。操作细节见 [Create an App Store provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/) 和 [Create an ad hoc provisioning profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-ad-hoc-provisioning-profile)。

证书文件和私钥不是同一个东西。仅下载 profile 或证书不能补回遗失的签名私钥。需要迁移手动签名环境时，使用受密码保护的导出文件并在受控位置备份；不要把 `.p12`、密码或上传凭据提交到仓库，也不要为解决一次签名错误随意撤销团队证书。依据：[Manage signing certificates](https://help.apple.com/xcode/mac/current/en.lproj/dev154b28f09.html)、[Export signing assets](https://help.apple.com/xcode/mac/current/en.lproj/dev8a2822e0b.html)。

## 3. 先分清构建产物

| 产物 | 用在哪里 | 不能据此声称的结果 |
| --- | --- | --- |
| Simulator 的 `.app` | macOS 上的 iOS Simulator 验证 UI 与部分逻辑 | 不能改扩展名或压成 IPA 就装到真实 iPhone；模拟器通过也不代表真机性能通过 |
| 设备构建的 `.xcarchive` | Xcode Organizer 中保存可验证、签名和分发的归档 | 归档成功不等于上传成功、测试开放或审核通过 |
| 正确导出的、按渠道签名的 `.ipa` | Ad Hoc 设备安装，或适用的 App Store Connect 上传流程 | 不能忽略渠道、设备名单和签名条件公开直装 |

即使模拟器与设备都使用 arm64，也属于不同平台构建。发行归档选择实际 iOS 设备或通用 iOS 设备目的地，不能只按 CPU 架构判断。Xcode 新版也可能允许归档 Simulator，因此“有 `.xcarchive`”本身不能证明目标正确。参考 [Distributing your app for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/) 与 [Running on simulated or physical devices](https://developer.apple.com/documentation/Xcode/running-your-app-on-simulated-or-physical-devices)。

**当前上传门槛：自 2026-04-28 起，上传到 App Store Connect 的 iOS/iPadOS App 需使用 iOS/iPadOS 26 SDK 或更新版本构建。** 应使用具备相应 SDK 的 Xcode，并在发行日志中记录版本。SDK 门槛不等于最低支持系统必须设成 iOS 26；deployment target 应按实际兼容性决定。以带生效日期的 [Submitting 页面](https://developer.apple.com/app-store/submitting/) 为准，不用其他帮助页里的较旧 Xcode 表格覆盖这一要求。

## 4. 首次向测试者发放

以下清单在账号与最终工程到位后执行；方框不是已完成声明。

1. [ ] 在 Xcode 的 Settings → Accounts 添加获授权的团队账号，确认会员、Team 和分发权限可用。在项目 Signing & Capabilities 中选定 Team，核对 Bundle ID、所需 entitlements、设备支持范围及最低系统。
2. [ ] 在 App Store Connect 创建 App 记录，选定 iOS、主语言、名称、已登记的 Bundle ID 和内部 SKU。Bundle ID 应先冻结，避免首次上传后再试图更换身份；见 [Preparing your app for distribution](https://developer.apple.com/documentation/Xcode/preparing-your-app-for-distribution)。
3. [ ] 设置用户可见版本与构建号，保留对应 commit、资源清单和配置。确认发行配置关闭 iOS 远程游戏下载，并实际检查归档的 37 个游戏、语言包和素材均完整。
4. [ ] 在物理 iPhone 验证：首次启动、全部游戏入口、选定游戏实际游玩、收藏与自定义排序、五语言、暂停和前后台恢复、重启后进度、备份导入导出，以及旧备份兼容性。如果声明支持 iPad，再完成相应布局、旋转和输入测试。逐项记录哪些在真机完成，哪些仅在模拟器完成。
5. [ ] 选择 Release 的 iOS 设备目的地，Product → Archive。归档出现在 Organizer 后检查目标、版本、构建号与团队，执行 Validate App。这个校验只覆盖部分自动检查，不能代替 App Review。
6. [ ] 在 Organizer 选择 Distribute App，使用可供 TestFlight 与 App Store 的正常上传路径；界面可能显示 “TestFlight & App Store” 或 “App Store Connect”。如果这个构建还要用于外部测试或正式上架，不要选择 **TestFlight Internal Only**。
7. [ ] 等待 App Store Connect 处理构建并确认状态。若显示 Missing Compliance，先按实际加密使用回答问题或提供所需资料。上传完成仅说明交付成功，还需单独配置测试与提交审核。
8. [ ] 在 TestFlight 创建内部组，添加有适当 App 访问权限的内部测试者和目标构建，填写本轮测试重点；由测试者在 TestFlight 接受邀请并安装。记录安装的版本、build 和到期日。
9. [ ] 内部验收通过后建立外部组，填写 Beta App 信息、联系信息和测试说明，提交目标构建进行所需的 Beta App Review。获准测试后发送邮件邀请或启用有上限的公开链接；用一个真实外部测试者账号验证整个接收与安装流程。
10. [ ] 收集崩溃、截图与反馈，关闭已结束的招募链接，为到期前的后续构建安排维护。90 天是每个构建的测试期限，不是正式发行替代方案。

归档、验证与分发选择见 [Xcode 分发说明](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases/)，Internal Only 的限制也见 [Test your beta app](https://developer.apple.com/tutorials/develop-in-swift/test-your-beta-app)。构建处理、可上传角色与工具见 [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)，测试构建的加密处理见 [Provide export compliance information for beta builds](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-export-compliance-information-for-beta-builds)。

### 如果使用 Transporter

在 Mac 上使用 Apple 的 Transporter，登录获授权的 App Store Connect 账号，添加为正确渠道导出的签名 IPA，完成验证与 Deliver，保留交付状态和错误日志。随后仍需到 App Store Connect 等待处理、选择测试组或正式版本，并执行相应审核步骤。Transporter 是上传工具，不负责把模拟器产物转换成真机发行包，也不自动开放测试或发布商店。支持工具和操作入口见 [Upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds)。

### 如果选择 Ad Hoc

1. 收集获授权测试设备的 UDID，并在 Developer Account 登记；记录所属设备产品系列与年度额度。
2. 为正确 App ID、发行证书和这些设备生成 Ad Hoc profile，或由 Xcode 自动管理相应签名。新加设备后，确认新 profile 确实包含其 UDID，并重新导出适用 IPA。
3. 从 iOS 设备归档导出 Ad Hoc 安装包，保留其 profile 有效期、build 和 SHA-256。按 Apple 支持的 Xcode 或 Apple Configurator 安装流程，在名单内的真机试装后再交付其他测试者。
4. 到期或签名更新前重新导出并验证更新安装，同时检查进度保留；不要承诺一次导出的测试 IPA 永久可用。

Apple 的完整设备分发流程见 [Distributing to registered devices](https://developer.apple.com/documentation/xcode/distributing-your-app-to-registered-devices)。

## 5. 五语言商店资料与截图

App 内语言、原生工程本地化和 App Store Connect 产品页本地化是三层配置。本仓库五份语言文本不会自动生成五语言商店页面。App Store Connect 新增语言时还可能复制主语言的部分资料和截图，发布前应替换为实际对应语言内容，见 [Localize app information](https://developer.apple.com/help/app-store-connect/manage-app-information/localize-app-information)。

| 当前 UI 语言 | App Store Connect 目标语言 | 当前品牌文本（提交前检查名称可用性） |
| --- | --- | --- |
| `zh-CN` 简体中文 | Chinese (Simplified) | 玩吧 |
| `zh-TW` 繁體中文 | Chinese (Traditional) | 玩吧 |
| `en` English | 选择实际经营所需的英语地区版本，例如 English (U.S.) | Nookcade |
| `ja` 日本語 | Japanese | ヌックケード |
| `ko` 한국어 | Korean | 눅케이드 |

每种语言准备名称、副标题、说明、关键词、支持 URL、隐私政策入口、可用的本地化截图，以及后续版本的更新说明。不能仅翻译游戏名：收藏、排序、偏好设置、导入导出和出错文案都应与实际 UI 一致。名称最多 30 字符、副标题最多 30 字符等字段限制以 [App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information) 为准。

截图每组可上传 1–10 张 JPEG/JPG/PNG，应采用真实 iOS UI 和对应语言，不能使用带 Android 系统栏或浏览器工具栏的截图。建议首组展示首页、我的收藏、排序操作、代表性游戏和偏好设置；仅展示该版本实际提供的能力。当前规格包含 6.9 英寸 iPhone 的 1320×2868、1290×2796、1260×2736 等竖屏尺寸，横屏交换宽高；上传图不得含 alpha/透明背景。如果支持 iPad，需要同时按支持设备提供所需截图。具体必需组、替代尺寸和自动缩放条件以实时表格为准，见 [Upload screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots) 与 [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)。

本项目的截图验收建议：五语言分别查看实际图，检查底栏和长标题是否截断、系统安全区域、文字放大和深浅背景对比；核对截图版本与待提交构建一致。工程声明支持的每个设备系列都要有人负责验证，不能把自动缩放当作布局测试。

## 6. 隐私、年龄分级与地区资料

### 隐私与加密

所有 App 都需要隐私政策 URL。准备公开、可访问且包含真实联系信息的页面，准确解释进度、历史、收藏、排序等本地数据，以及用户主动导出备份后的处理方式。只有核实最终二进制、依赖及实际网络行为后，才能在 App Privacy 中选择 “Data Not Collected”；“主要离线”或“没有登录”不足以推导该答案。申报应包含集成第三方代码的行为，见 [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)。

App Store 隐私标签与包内 `PrivacyInfo.xcprivacy` 是不同事项。后者需要按实际使用声明数据收集和 required reason API 的合法理由；不要为了通过检查照抄与功能无关的 reason。发布检查应包含原生代码与依赖是否命中这些 API，以及是否引入 Apple 列表中的 SDK。依据：[Privacy manifest files](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)、[Required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)、[Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)。

加密合规问题也要按实际功能回答，包括系统或第三方提供的加密。仅使用系统加密与自带加密实现所需材料可能不同，不能直接把所有问题选成“否”。`ITSAppUsesNonExemptEncryption` 应与真实实现和判定一致，见 [Export compliance overview](https://developer.apple.com/help/app-store-connect/manage-compliance-information/overview-of-export-compliance) 与 [Complying with encryption export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)。

### 年龄分级

在 App Information 完整回答年龄问卷，由系统生成全球与地区分级。当前新体系含 4+、9+、13+、16+、18+，旧系统还可能显示旧分级；Kids 类别是单独选择，不等于只要是益智游戏就适用。依据：[Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/) 和 [Age ratings](https://developer.apple.com/kids/)。

本项目应逐个审查 37 个游戏的实际内容，尤其棋牌、二十一点等是否命中模拟赌博或其他问卷项目，按真实规则与呈现方式填写。不能因为没有真钱交易便自行预定 4+，也不能用最高分级代替准确问卷。检查韩国等目标地区生成的附加要求后再决定可用范围。

### 中国大陆可用性

Apple 当前资料要求在中国大陆提供游戏时填写国家新闻出版署批准信息，并上传 ISBN 核发单或批复、有效营业执照等材料；部分 App 还需有效 ICP 备案，备案名称等信息应与简体中文或主语言商店资料匹配。具体字段与可选授权材料见 [App information 的 China mainland 部分](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information)，状态查看入口见 [View China mainland compliance information](https://developer.apple.com/help/app-store-connect/manage-compliance-information/view-china-mainland-compliance-information)。

因此，中国大陆上架目前列为**待主体与所需资质确认**，不能从“免费”“离线”“自有小游戏集合”推导豁免，也不能通过改成非游戏分类避开实际内容要求。最终提供材料与经营范围由账号拥有者按适用要求确认；暂不具备某地区条件时，仅选择已确认符合要求的地区。中国大陆资质状态与普通 TestFlight 构建处理成功是两回事。

## 7. WKWebView、本地游戏与未来下载能力

### 本次提交形态

当前工程约定是游戏随 Bundle 发放、远程下载 flags 全部关闭、自有本地主 frame 使用受限 bridge。本文据此建议把首版作为一个完整离线游戏 App 提交并说明其原生导航与存档体验，而不是宣称一个任意远程软件平台。需要在归档与真机中验证约定，不得仅依赖源码默认值。

Apple 的 2.5.2 涉及自包含及下载代码，2.5.6 涉及浏览网页所用框架，4.2 涉及最低功能体验。使用 WKWebView 本身不构成保证过审或必然拒审的结论；本项目的实际内容、功能、权限和提交说明仍需评估。[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)

### 未来可下载小游戏是单独的审核能力

4.7 针对宿主提供未嵌入二进制的软件等情形，包括 HTML5/JavaScript 小游戏。当前 4.7.1–4.7.5 对隐私、内容治理、交易、原生 API 暴露许可、逐项数据授权、软件索引及 universal links、超龄内容识别与访问限制提出要求。适用时必须完整核对原文；4.7.2 的原生 API 事先许可要求尤其不能通过内部配置自行替代。[Guideline 4.7](https://developer.apple.com/app-store/review/guidelines/#mini-apps-mini-games-streaming-games-chatbots-plug-ins-and-game-emulators)

这是未来启用下载游戏前的评估事项；**不能直接断言首版随 Bundle 的全部游戏都必须按 4.7.4 实现 universal links**。条款适用性取决于真实提交形态，最终由 Apple 审核判断。若将来启用远程内容，建议先记录变化的权限、数据流、游戏索引和可执行内容边界，完成适用要求，再以清楚披露的新版本提交。不要在已审核的离线版本背后打开未说明的下载功能。

审核说明可以采用下面的英文草稿；提交前逐句核对最终包，删去尚未实现或验证的内容：

> Nookcade is an offline collection of 37 games bundled with the app. The catalog, favorites, custom ordering, and preferences use native iOS screens. The games run locally in WKWebView. This build does not download or execute remote game packages. The native bridge is restricted to our own bundled main-frame content. Progress and catalog preferences are stored on the device. Backup import and export are initiated by the user through the system document interface. Please test the catalog, add a game to Favorites, reorder the list, launch a game, and resume it after returning to the catalog.

这是本项目拟提交行为的说明模板，不是 Apple 的许可声明。还应给出真实审核联系人、测试路径、内容权利与素材授权说明；不保证一次审核通过，也不虚构已经获批的 App Review 沟通。

## 8. 从通过测试到正式上架

1. [ ] 选定通过测试的普通 TestFlight 构建。确认不是 Internal Only，且版本、build、资源和测试报告一致。
2. [ ] 完成五语言元数据、所需设备截图、隐私、年龄问卷、内容权利、加密和目标地区资料；配置价格、可用范围和发布方式。
3. [ ] 在对应 App Store 版本中选择构建，填写 Review Notes、联系信息及必要的验证资料，再提交正式 App Review。Beta 审核通过不等于正式版本已经通过审核。
4. [ ] 在审核问答中按真实实现回应。如果被拒，先确认是资料、体验还是实现问题，再形成新资料或更高 build 的修复；保留原因与处理记录。
5. [ ] 首版建议选择手动发布，在获准后按已安排的发布窗口发行。完成一个普通商店用户的搜索/页面/下载安装测试，核对五语言展示与首次启动。

App 记录、测试、送审和发行是分开的阶段，见 [App Store Connect workflow](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-workflow)。

## 9. 后续每次发布与回退策略

### 每次更新的执行顺序

1. [ ] 冻结源代码 commit、资源清单及 iOS 功能开关，明确这次是否改变下载、权限或隐私行为。
2. [ ] 保持原 App 身份和正式 Bundle ID；每次上传递增构建号。正式商店更新按版本规则递增用户可见版本，不另建 App 来代替正常更新。
3. [ ] 用当前可接受的 SDK 构建，保留归档、必要的 dSYM、构建工具版本、产物校验值和测试报告。敏感签名材料在独立受控位置保存。
4. [ ] 做升级安装回归：旧版本进度、历史、收藏与排序继续可用；五语言、37 个入口、暂停恢复、备份导入导出均正常。变更涉及哪个游戏，就覆盖该游戏的真实游玩和旧局恢复。
5. [ ] 上传并完成构建处理和合规项，先给内部测试，再按需要给外部测试。记录反馈解决情况和实际测试的 build。
6. [ ] 为新 App Store 版本填写五语言更新说明，重新检查发生变化的隐私、截图、分级和地区材料，提交审核。无变化的材料也要确认仍准确可访问。
7. [ ] 获准后按计划手动或分阶段发布，观察新安装、升级安装、崩溃与存档反馈，留存最终商店版本和发布日期。

Apple 明确不能把已发布 App Store 版本直接恢复成先前版本；应提交更高版本号的新版本。相关身份与版本操作见 [Create a new version](https://developer.apple.com/help/app-store-connect/update-your-app/create-a-new-version)。

### 出问题时如何处理

| 渠道 | 可执行处理 | 需要避免的误解 |
| --- | --- | --- |
| TestFlight | 停止继续招募或投放有问题的构建，修复后上传新 build；必要时让测试者选择仍可用、未过期的已知稳定构建，并确认存档兼容 | 旧 build 仍受 90 天期限与组可用性限制；移出测试组不等于能立即卸载所有人的已装 App |
| App Store | 暂停尚在进行的分阶段发布；用已知稳定代码制作更高版本的修复包并提交审核 | 不能在后台把所有用户切回旧 App，也不能让当前已装二进制凭空回退 |
| Ad Hoc | 对当前设备名单重新签名/导出稳定实现的更新包，先验证覆盖安装和数据保留，再提供给测试者 | 未登记设备、过期 profile 或丢失私钥不能靠复制 IPA 文件解决 |

商店更新可按七天分阶段自动发放，比例为 1%、2%、5%、10%、20%、50%、100%，累计可暂停最多 30 天；用户仍可主动下载更新，因此暂停阶段不等于全量阻止安装。依据：[Release an update in phases](https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases)。TestFlight 构建管理注意事项见 [Add internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)。

本项目建议将数据迁移设计成可保留旧备份的流程，并在热修复中保持已发布数据格式可读。原生壳、随包游戏资源与用户存档是不同层次；回退代码不能覆盖玩家进度。首版 iOS 不依赖 Android 的远程包回退机制，未来若启用下载能力再补充专门的 iOS 分发、审核与恢复方案。

## 10. 首次发放前还缺什么

| 待办 | 当前状态 | 完成证据 |
| --- | --- | --- |
| 个人/组织主体、Developer Program、团队权限 | 待账号拥有者提供和确认；未登录或代办 | 可用团队与角色记录 |
| Team ID、正式 Bundle ID、App Store Connect 记录 | 待确认；不从临时工程值推定 | 发布配置与 App 记录 |
| 发行证书、私钥、适用 profile | 待授权环境配置；本文未创建或导出 | 本地签名验证与受控保管记录 |
| SDK 门槛与 Release 设备归档 | 待实际发行构建 | Xcode/SDK 日志、归档与验证结果 |
| 真机验收与 TestFlight 安装 | 待设备与构建 | 安装版本、设备/系统、逐项验收结果 |
| 五语言商店资料与真实 iOS 截图 | 待最终原生 UI 与账号资料 | 各语言资料和截图清单 |
| 隐私政策、联系信息、隐私/加密问卷 | 待真实运营资料和最终包审计 | 公开页面及与实现一致的申报记录 |
| 年龄分级、内容权利和目标地区资格 | 待逐游戏与主体资料确认 | 最终问卷、权利资料、地区可用性 |
| 中国大陆所需游戏审批/备案资料 | 待主体和资格确认 | Apple 要求的字段、文件与状态 |
| 外部测试或正式 App Review | 未提交，未获批 | App Store Connect 的实际审核状态 |

账号资料就绪后，按第 4 节完成第一次可安装测试包，再按第 8 节送审。上述空缺可以明确交给账号拥有者和发布负责人，不需要把密码、证书私钥或个人证件写入本仓库。
