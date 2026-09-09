import XCTest
import WebKit
@testable import Nookcade

@MainActor
final class OfflineGamesTests: XCTestCase {
    var host: GameHost { (UIApplication.shared.delegate as! AppDelegate).host }
    func value(_ expression: String) async throws -> Any {
        let value = try await host.webView.callAsyncJavaScript("return JSON.stringify(await (\(expression)))", arguments: [:], in: nil, contentWorld: .page)
        guard let raw = value as? String, let data = raw.data(using: .utf8) else { return NSNull() }
        return try JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
    }
    func waitFor(_ expression: String, seconds: Double = 30) async throws {
        let end = Date().addingTimeInterval(seconds)
        while Date() < end {
            if (try? await value(expression)) as? Bool == true { return }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTFail("Timed out: \(expression)"); throw NSError(domain: "Timed out", code: 1)
    }
    func testAll37BundledGamesAndWasm() async throws {
        try await waitFor("!!window.wanbaApp", seconds: 45)
        let capability = try await value("({origin:location.origin, secure:isSecureContext, wasm:typeof WebAssembly.instantiate==='function', gl:!!document.createElement('canvas').getContext('webgl'), games:wanbaApp.catalog().games.length, app:wanbaApp.catalog().appInfo})") as! [String: Any]
        XCTAssertEqual(capability["origin"] as? String, LoopbackServer.origin)
        XCTAssertEqual(capability["secure"] as? Bool, true); XCTAssertEqual(capability["wasm"] as? Bool, true); XCTAssertEqual(capability["gl"] as? Bool, true)
        XCTAssertEqual(capability["games"] as? Int, 37)
        let app = capability["app"] as! [String: Any]; XCTAssertEqual(app["flavor"] as? String, "ios"); XCTAssertEqual(app["gameUpdatesEnabled"] as? Bool, false)
        let backup = try await value("wanbaApp.backupData()") as! String
        _ = try await value("(window.__iosErrors=[],window.addEventListener('error',e=>window.__iosErrors.push(e.message)),true)")
        let games = try await value("wanbaApp.catalog().games.map(g=>({id:g.id,mode:g.mode}))") as! [[String: String]]
        var results: [[String: Any]] = []
        for game in games {
            let id = game["id"]!, mode = game["mode"]!
            _ = try await value("wanbaApp.launch('\(id)','\(mode)')")
            let end = Date().addingTimeInterval(20)
            while Date() < end {
                if try await value("wanbaApp.inspect().started") as? Bool == true { break }
                _ = try await value("(()=>{const el=['[data-first=\"user\"]:not(:disabled)','[data-choice]:not(:disabled)','#wb-progress-continue:not(:disabled)','#wb-start-cover-btn:not(:disabled)'].map(s=>document.querySelector(s)).find(el=>el&&el.getBoundingClientRect().width>0);if(el)el.click();return !!el})()")
                try await Task.sleep(for: .milliseconds(200))
            }
            try await waitFor("wanbaApp.inspect().started", seconds: 3)
            if id == "pinball" { try await waitFor("!!document.querySelector('.wb-cadet-frame')?.contentWindow?.cadetHost?.snapshot()?.ready", seconds: 60) }
            if id == "wordguess" { try await waitFor("!!document.querySelector('#wb-word-input')") }
            try await Task.sleep(for: .milliseconds(200))
            _ = try await value("(wanbaApp.pause(),wanbaApp.save(),true)")
            let paused = try await value("wanbaApp.inspect().paused") as? Bool
            XCTAssertEqual(paused, true, id)
            results.append(["id": id, "started": true, "paused": paused == true]); print("IOS_GAME_PASS \(id)")
            _ = try await value("wanbaApp.openShellTab('single')")
        }
        let errors = try await value("window.__iosErrors") as! [String]; XCTAssertEqual(errors, [])
        let data = try JSONSerialization.data(withJSONObject: ["capability": capability, "results": results, "errors": errors], options: [.prettyPrinted, .sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); attachment.name = "ios-37-games"; attachment.lifetime = .keepAlways; add(attachment)
        let quoted = String(data: try JSONSerialization.data(withJSONObject: [backup]), encoding: .utf8)!
        let imported = try await value("wanbaApp.importBackup(\(quoted)[0],true)") as! [String: Any]; XCTAssertEqual(imported["ok"] as? Bool, true)
        _ = try await value("wanbaApp.openShellTab('single')")
    }
}
