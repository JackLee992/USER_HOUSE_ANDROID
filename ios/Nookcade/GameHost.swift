import UIKit
import WebKit
import UniformTypeIdentifiers

/// The WK store is the sole source of game data and preferences. Native views keep no parallel save.
final class GameHost: NSObject, WKScriptMessageHandlerWithReply, WKNavigationDelegate, WKUIDelegate, UIDocumentPickerDelegate {
    private(set) var webView: WKWebView!
    private var server: LoopbackServer?
    private(set) var catalog: [String: Any] = [:]
    var onCatalog: (([String: Any]) -> Void)?
    var onError: ((String) -> Void)?
    weak var presenter: UIViewController?
    private var exportURL: URL?
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var catalogMutations: [([String: [String]]) -> [String: [String]]] = []
    let root = Bundle.main.url(forResource: "www", withExtension: nil)!
    var ready: Bool { !catalog.isEmpty }
    var locale: String { catalog["locale"] as? String ?? "zh-CN" }
    func label(_ key: String) -> String { (catalog["labels"] as? [String: String])?[key] ?? key }
    override init() {
        super.init()
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let content = configuration.userContentController
        content.addScriptMessageHandler(self, contentWorld: .page, name: "wanba")
        let bridge = try! String(contentsOf: Bundle.main.url(forResource: "Bridge", withExtension: "js")!, encoding: .utf8)
        content.addUserScript(WKUserScript(source: bridge, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self; webView.uiDelegate = self
        webView.isOpaque = false; webView.backgroundColor = UIColor.systemBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.scrollView.bounces = false
        #if DEBUG
        webView.isInspectable = true
        #endif
    }
    func start() {
        guard server == nil else { return }
        let server = LoopbackServer(root: root); self.server = server
        do {
            try server.start { [weak self] error in
                guard let self else { return }
                if let error { self.onError?("Local content unavailable: \(error.localizedDescription)"); return }
                // Never navigate until our exclusive loopback bind has succeeded.
                self.webView.load(URLRequest(url: URL(string: LoopbackServer.origin + "/standalone/index.html")!))
            }
        } catch { onError?(error.localizedDescription) }
    }
    static func trusted(_ url: URL?) -> Bool { url?.scheme == "http" && url?.host == "127.0.0.1" && url?.port == Int(LoopbackServer.port) && url?.user == nil && url?.password == nil }
    func call(_ method: String, _ args: [Any] = [], completion: ((Any?, Error?) -> Void)? = nil) {
        let allowed: Set<String> = ["catalog", "setCatalog", "launch", "openShellTab", "setLocale", "setPerformance", "setRememberWindow", "exportBackup", "backupData", "validateBackup", "importBackup", "pause", "save", "back", "inspect", "onBackupResult"]
        guard allowed.contains(method), Self.trusted(webView.url) else { completion?(nil, NSError(domain: "Nookcade", code: 1)); return }
        webView.callAsyncJavaScript("return await window.wanbaApp?.[method](...args)", arguments: ["method": method, "args": args], in: nil, in: .page) { result in
            switch result { case .success(let value): completion?(value, nil); case .failure(let error): completion?(nil, error) }
        }
    }
    func refresh(completion: ((Bool) -> Void)? = nil) {
        guard ready else { completion?(false); return }
        call("catalog") { [weak self] value, error in
            if error == nil, let data = value as? [String: Any] { self?.accept(data); completion?(true) }
            else { completion?(false) }
        }
    }
    func mutateCatalog(_ transform: @escaping ([String: [String]]) -> [String: [String]]) {
        catalogMutations.append(transform)
        if catalogMutations.count == 1 { applyNextCatalogMutation() }
    }
    private func applyNextCatalogMutation() {
        guard let transform = catalogMutations.first else { return }
        let prefs = catalog["preferences"] as? [String: [String]] ?? ["favorites": [], "order": []]
        call("setCatalog", [transform(prefs)]) { [weak self] result, error in
            guard let self else { return }
            if error != nil || (result as? [String: Any])?["ok"] as? Bool != true { self.showMessage(self.label("收藏和排序未能保存，请检查设备存储空间")) }
            self.call("catalog") { [weak self] result, _ in
                guard let self else { return }
                if let result = result as? [String: Any] { self.accept(result) }
                self.catalogMutations.removeFirst(); self.applyNextCatalogMutation()
            }
        }
    }
    private func accept(_ state: [String: Any]) {
        guard state["schema"] as? Int == 1, let games = state["games"] as? [[String: Any]], (1...200).contains(games.count) else { return }
        let ids = games.compactMap { $0["id"] as? String }
        guard ids.count == games.count, Set(ids).count == ids.count,
              ids.allSatisfy({ $0.range(of: "^[a-z][a-z0-9]{0,39}$", options: .regularExpression) != nil }) else { return }
        catalog = state; onCatalog?(state)
        if UIApplication.shared.applicationState != .active { pauseAndSave() }
    }
    private func performHapticFeedback(_ kind: String?) {
        switch kind {
        case "drop", "hard": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "soft", "left", "right": UISelectionFeedbackGenerator().selectionChanged()
        default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    func pauseAndSave() {
        guard ready else { return }
        if backgroundTask == .invalid {
            backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Save game") { [weak self] in self?.endBackgroundTask() }
        }
        call("pause") { [weak self] _, _ in self?.call("save") { [weak self] _, _ in self?.endBackgroundTask() } }
    }
    private func endBackgroundTask() { if backgroundTask != .invalid { UIApplication.shared.endBackgroundTask(backgroundTask); backgroundTask = .invalid } }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.protocol == "http", origin.host == "127.0.0.1", origin.port == Int(LoopbackServer.port), Self.trusted(webView.url),
              let body = message.body as? [String: Any], let method = body["method"] as? String, let args = body["args"] as? [Any] else { replyHandler(nil, "Untrusted frame"); return }
        switch method {
        case "getAppInfo":
            replyHandler(["flavor": "ios", "appVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.3.1", "versionCode": Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1") ?? 1, "engineVersion": UIDevice.current.systemVersion, "providerVersion": "iOS " + UIDevice.current.systemVersion, "gameUpdatesEnabled": false, "nativeSelfUpdateEnabled": false, "appUpdaterEnabled": false], nil)
        case "getContentState":
            let url = root.appendingPathComponent("ios-content.json")
            guard let data = try? Data(contentsOf: url), let value = try? JSONSerialization.jsonObject(with: data) else { replyHandler(nil, "Missing content metadata"); return }
            replyHandler(value, nil)
        case "onShellState":
            guard let raw = args.first as? String, raw.utf8.count <= 256 * 1024, let data = raw.data(using: .utf8), let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { replyHandler(nil, "Invalid shell state"); return }
            accept(state); replyHandler(true, nil)
        case "setGameImmersive": replyHandler(true, nil) // Full-screen game controller already owns safe-area/status-bar policy.
        case "performHapticFeedback": performHapticFeedback(args.first as? String); replyHandler(true, nil)
        case "saveBackup":
            guard UIApplication.shared.applicationState == .active, args.count == 2, let text = args[1] as? String, text.utf8.count <= 16 * 1024 * 1024, let data = text.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) != nil else { replyHandler(nil, "Invalid backup"); return }
            export(data); replyHandler(true, nil)
        default: replyHandler(nil, "Unsupported method")
        }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if Self.trusted(navigationAction.request.url) { decisionHandler(.allow); return }
        if navigationAction.request.url?.absoluteString == "about:blank", navigationAction.targetFrame?.isMainFrame == false { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated, let url = navigationAction.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme == "https", navigationAction.navigationType == .linkActivated { UIApplication.shared.open(url) }; return nil
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { catalog = [:]; webView.reload() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { onError?(error.localizedDescription) }
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard frame.isMainFrame, Self.trusted(frame.request.url), let presenter else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: String(message.prefix(3000)), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: native("ok"), style: .default) { _ in completionHandler() }); presenter.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard frame.isMainFrame, Self.trusted(frame.request.url), let presenter else { completionHandler(false); return }
        let alert = UIAlertController(title: nil, message: String(message.prefix(3000)), preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: label("取消"), style: .cancel) { _ in completionHandler(false) }); alert.addAction(UIAlertAction(title: native("ok"), style: .default) { _ in completionHandler(true) }); presenter.present(alert, animated: true)
    }
    func beginImport() {
        guard ready, presenter?.presentedViewController == nil else { return }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json], asCopy: true); picker.delegate = self
        picker.directoryURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
        presenter?.present(picker, animated: true)
    }
    private func export(_ data: Data) {
        guard exportURL == nil, presenter?.presentedViewController == nil else { call("onBackupResult", [false, native("busy")]); return }
        do {
            let folder = FileManager.default.temporaryDirectory.appendingPathComponent("NookcadeExport", isDirectory: true)
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let date = ISO8601DateFormatter().string(from: Date()).replacingOccurrences(of: ":", with: "-")
            let url = folder.appendingPathComponent("Nookcade-backup-\(date).json"); try data.write(to: url, options: .atomic); exportURL = url
            let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true); picker.delegate = self
            picker.directoryURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first
            presenter?.present(picker, animated: true)
        } catch { call("onBackupResult", [false, error.localizedDescription]) }
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finishExport(false) }
    private func finishExport(_ success: Bool) { if let url = exportURL { try? FileManager.default.removeItem(at: url); exportURL = nil; call("onBackupResult", [success, success ? native("saved") : label("取消")]) } }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        if exportURL != nil { finishExport(true); return }
        guard let url = urls.first else { return }
        let accessed = url.startAccessingSecurityScopedResource(); defer { if accessed { url.stopAccessingSecurityScopedResource() } }
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? Int.max
            guard size <= 16 * 1024 * 1024 else { throw NSError(domain: "Backup too large", code: 1) }
            let text = try String(contentsOf: url, encoding: .utf8)
            call("validateBackup", [text]) { [weak self] value, error in
                guard let self else { return }
                guard error == nil, let state = value as? [String: Any], state["ok"] as? Bool == true else { self.showMessage((value as? [String: Any])?["error"] as? String ?? self.native("invalid")); return }
                let alert = UIAlertController(title: self.label("导入备份"), message: self.native("replace"), preferredStyle: .alert)
                alert.addAction(UIAlertAction(title: self.label("取消"), style: .cancel)); alert.addAction(UIAlertAction(title: self.native("ok"), style: .destructive) { _ in
                    self.call("importBackup", [text, true]) { value, _ in self.showMessage((value as? [String: Any])?["ok"] as? Bool == true ? self.native("imported") : self.native("invalid")); self.refresh() }
                }); self.presenter?.present(alert, animated: true)
            }
        } catch { showMessage(error.localizedDescription) }
    }
    func showMessage(_ message: String) { let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert); alert.addAction(UIAlertAction(title: native("ok"), style: .default)); presenter?.present(alert, animated: true) }
    func native(_ key: String) -> String {
        let index = ["zh-CN", "zh-TW", "en", "ja", "ko"].firstIndex(of: locale) ?? 0
        let strings = ["ok": ["确定", "確定", "OK", "OK", "확인"], "replace": ["导入将替换备份中对应的本机数据。请先保留当前备份。", "匯入將取代備份中對應的本機資料。請先保留目前備份。", "Import replaces the local data included in this backup. Keep a current backup first.", "バックアップに含まれる本体データを置き換えます。現在のバックアップを先に保存してください。", "백업에 포함된 기기 데이터를 대체합니다. 먼저 현재 백업을 보관하세요."], "invalid": ["备份无效", "備份無效", "Invalid backup", "無効なバックアップ", "잘못된 백업"], "saved": ["备份已保存", "備份已儲存", "Backup saved", "保存しました", "백업 저장됨"], "imported": ["备份已导入", "備份已匯入", "Backup imported", "読み込みました", "백업 가져옴"], "busy": ["请先关闭当前窗口", "請先關閉目前視窗", "Close the current window first", "先に現在の画面を閉じてください", "현재 창을 먼저 닫으세요"]]
        if key == "bundled" { return ["应用内置 · 离线可用", "應用程式內建 · 離線可用", "Bundled · available offline", "アプリ内蔵 · オフライン対応", "앱 내장 · 오프라인 사용"][index] }
        return strings[key]?[index] ?? key
    }
}
