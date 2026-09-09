import XCTest
@testable import Nookcade

final class LoopbackTests: XCTestCase {
    var root: URL!, server: LoopbackServer!
    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data("0123456789".utf8).write(to: root.appendingPathComponent("test.wasm"))
        server = LoopbackServer(root: root)
    }
    override func tearDownWithError() throws { try FileManager.default.removeItem(at: root) }
    func request(_ target: String, headers: String = "", method: String = "GET") -> String {
        String(decoding: server.response("\(method) \(target) HTTP/1.1\r\nHost: 127.0.0.1:18737\r\n\(headers)"), as: UTF8.self)
    }
    func testModulesWasmAndBoundedRanges() {
        XCTAssertEqual(LoopbackServer.mime("/engine.wasm"), "application/wasm")
        XCTAssertEqual(LoopbackServer.mime("/game.mjs"), "text/javascript; charset=utf-8")
        XCTAssertTrue(request("/test.wasm").hasSuffix("0123456789"))
        XCTAssertTrue(request("/test.wasm", headers: "Range: bytes=2-5").hasSuffix("2345"))
        XCTAssertTrue(request("/test.wasm", headers: "Range: bytes=9-20").hasPrefix("HTTP/1.1 416"))
        XCTAssertTrue(request("/test.wasm", headers: "Range: bytes=0-1,4-5").hasPrefix("HTTP/1.1 416"))
        XCTAssertFalse(request("/test.wasm", method: "HEAD").hasSuffix("0123456789"))
    }
    func testTraversalAndForeignOriginFailClosed() throws {
        for path in ["/../test.wasm", "/%2e%2e/test.wasm", "/.secret", "//example.com", "/%00test", "/a%5cb"] { XCTAssertTrue(request(path).hasPrefix("HTTP/1.1 403"), path) }
        XCTAssertTrue(request("/test.wasm", headers: "Origin: https://example.com").hasPrefix("HTTP/1.1 403"))
        XCTAssertTrue(request("/test.wasm", headers: "Host: evil.com").hasPrefix("HTTP/1.1 400"))
        XCTAssertTrue(request("/test.wasm", method: "POST").hasPrefix("HTTP/1.1 405"))
        try FileManager.default.createSymbolicLink(at: root.appendingPathComponent("escape"), withDestinationURL: root.deletingLastPathComponent())
        XCTAssertTrue(request("/escape/test.wasm").hasPrefix("HTTP/1.1 404"))
        XCTAssertFalse(GameHost.trusted(URL(string: "http://127.0.0.1:18738/")))
        XCTAssertFalse(GameHost.trusted(URL(string: "http://example.com:18737/")))
        XCTAssertFalse(GameHost.trusted(URL(string: "http://evil@127.0.0.1:18737/")))
    }
}
