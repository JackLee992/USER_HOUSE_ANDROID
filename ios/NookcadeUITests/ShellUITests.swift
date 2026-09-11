import XCTest

final class ShellUITests: XCTestCase {
    func capture(_ name: String, app: XCUIApplication) {
        let image = XCTAttachment(screenshot: XCUIScreen.main.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    }
    func assertNoTextSelectionMenu(_ app: XCUIApplication) {
        XCTAssertEqual(app.menus.count, 0, "Gameplay long presses must not open an edit menu")
        for title in ["Copy", "Select All", "Look Up", "Translate", "复制", "拷贝", "全选", "查询", "翻译"] {
            XCTAssertFalse(app.buttons[title].exists, "Unexpected selection action: " + title)
        }
    }
    func assertTabGeometry(_ app: XCUIApplication) {
        let buttons = ["native-games-tab", "native-my-tab", "native-settings-tab"].map { app.buttons[$0] }
        let frames = buttons.map(\.frame)
        XCTAssertEqual(frames[0].minY, frames[1].minY, accuracy: 1); XCTAssertEqual(frames[1].minY, frames[2].minY, accuracy: 1)
        // UIKit uses its compact inline tab appearance in landscape.
        let landscape = app.frame.width > app.frame.height
        XCTAssertGreaterThanOrEqual(frames[0].height, landscape ? 32 : 44)
        if !landscape { XCTAssertEqual(frames[0].width, frames[1].width, accuracy: 1) }
        // System glass expands accessibility hit regions beyond the visible pill.
        XCTAssertLessThan(frames[0].midX, frames[1].midX)
        XCTAssertLessThan(frames[1].midX, frames[2].midX)
    }
    func testNativeCatalogAndPreferences() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = XCUIApplication(); app.launch()
        let catalog = app.collectionViews["native-catalog"]
        if app.webViews.buttons["返回"].waitForExistence(timeout: 5) { app.webViews.buttons["返回"].tap() }
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30)); app.buttons["native-games-tab"].tap()
        XCTAssertTrue(catalog.waitForExistence(timeout: 30))
        let first = catalog.cells.firstMatch
        XCTAssertTrue(first.waitForExistence(timeout: 30))
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.name = "iPhone-native-catalog"; shot.lifetime = .keepAlways; add(shot)
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30)); assertTabGeometry(app); capture("tabbar-cold-before-any-tap", app: app)
        for tab in ["native-my-tab", "native-settings-tab", "native-games-tab"] { app.buttons[tab].tap(); assertTabGeometry(app); capture(tab, app: app) }
        app.buttons["native-games-tab"].press(forDuration: 0.4, thenDragTo: app.buttons["native-my-tab"])
        XCTAssertTrue(app.collectionViews["native-favorites"].waitForExistence(timeout: 5))
        capture("glass-drag-games-to-my", app: app)
        app.buttons["native-my-tab"].press(forDuration: 0.4, thenDragTo: app.buttons["native-settings-tab"])
        XCTAssertTrue(app.cells["setting-0-0"].waitForExistence(timeout: 5)); capture("glass-drag-my-to-settings", app: app)
        app.terminate(); app.launch()
        // Verify the complete cold layout before selecting any tab again.
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30)); assertTabGeometry(app); capture("glass-after-drag-cold", app: app)
        for locale in ["English", "繁體中文", "日本語", "한국어", "简体中文"] {
            app.buttons["native-settings-tab"].tap(); app.cells["setting-0-0"].firstMatch.tap()
            XCTAssertTrue(app.buttons[locale].waitForExistence(timeout: 5)); app.buttons[locale].tap()
            XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 5)); assertTabGeometry(app); capture("tabs-" + locale, app: app)
        }
        app.buttons["native-games-tab"].tap()
        XCTAssertTrue(catalog.waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(1); assertTabGeometry(app)
        capture("iPhone-native-landscape", app: app)
        XCUIDevice.shared.orientation = .portrait
        sleep(1); assertTabGeometry(app)
        catalog.swipeDown(); XCTAssertTrue(catalog.cells.firstMatch.waitForExistence(timeout: 5)); capture("native-pull-refresh", app: app)
    }
    func testFilesExportAndLandscape() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["native-settings-tab"].waitForExistence(timeout: 30))
        app.buttons["native-settings-tab"].tap()
        XCTAssertTrue(app.cells["setting-1-0"].waitForExistence(timeout: 5)); app.cells["setting-1-0"].tap()
        sleep(2); capture("files-export-picker", app: app)
        let hierarchy = XCTAttachment(string: app.debugDescription); hierarchy.name = "files-export-hierarchy"; hierarchy.lifetime = .keepAlways; add(hierarchy)
        let save = app.buttons.matching(NSPredicate(format: "label IN %@", ["Save", "保存"])).firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 10)); save.tap()
        XCTAssertTrue(app.cells["setting-1-0"].waitForExistence(timeout: 10)); capture("files-export-saved", app: app)
        for confirm in [false, true] {
            app.cells["setting-1-1"].tap()
            let file = app.collectionViews["File View"].cells.matching(NSPredicate(format: "label CONTAINS %@", "Nookcade-backup-")).firstMatch
            XCTAssertTrue(file.waitForExistence(timeout: 10)); capture("files-import-picker", app: app); file.tap()
            let alert = app.alerts["导入备份"]
            XCTAssertTrue(alert.waitForExistence(timeout: 10)); capture(confirm ? "files-import-confirm" : "files-import-cancel", app: app)
            alert.buttons[confirm ? "确定" : "取消"].tap()
            if confirm { XCTAssertTrue(app.alerts.staticTexts["备份已导入"].waitForExistence(timeout: 10)); app.alerts.buttons["确定"].tap() }
        }
        app.buttons["native-games-tab"].tap()
        XCUIDevice.shared.orientation = .landscapeLeft; sleep(2); assertTabGeometry(app); capture("landscape-full-screen", app: app)
        XCUIDevice.shared.orientation = .portrait; sleep(1); capture("portrait-restored", app: app)
    }
    private func leaveWebGame(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let back = app.webViews.buttons["返回"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 8), "Expected web game back button before returning to native shell", file: file, line: line)
        back.tap()
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 15), "Expected native games tab after leaving web game", file: file, line: line)
    }

    func startGame(_ id: String, app: XCUIApplication) {
        app.buttons["native-games-tab"].tap()
        let launch = app.buttons["launch-" + id]
        for _ in 0..<10 { if launch.exists && launch.isHittable { break }; app.collectionViews["native-catalog"].swipeUp() }
        XCTAssertTrue(launch.isHittable); launch.tap()
        let restart = app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["重新开始", "Start over"])).firstMatch
        if restart.waitForExistence(timeout: 2) { restart.tap() }
        let start = app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["开始游戏", "Play"])).firstMatch
        if start.waitForExistence(timeout: 8) { start.tap() }
    }
    func testSnakeAndTetrisRealControls() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = XCUIApplication(); app.launch()
        if app.webViews.buttons["返回"].waitForExistence(timeout: 3) { app.webViews.buttons["返回"].tap() }
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30))
        startGame("snake", app: app)
        let endless = app.webViews.buttons["无尽竞技"]
        XCTAssertTrue(endless.waitForExistence(timeout: 15)); capture("snake-mode-select", app: app); endless.tap()
        let boost = app.webViews.buttons["按住加速"]
        XCTAssertTrue(boost.waitForExistence(timeout: 15)); capture("snake-arena-start", app: app)
        boost.press(forDuration: 1.2)
        assertNoTextSelectionMenu(app); capture("snake-boost-long-press-no-menu", app: app)
        let stick = app.webViews.otherElements["方向摇杆"]
        if stick.waitForExistence(timeout: 2) {
            let origin = stick.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.75))
            origin.press(forDuration: 0.2, thenDragTo: origin.withOffset(CGVector(dx: 50, dy: -55)))
            if app.webViews.buttons["暂停"].exists {
                app.webViews.buttons["暂停"].tap(); capture("snake-arena-paused", app: app)
            } else {
                // A real collision may end this short, uncontrolled steering trial.
                XCTAssertTrue(app.webViews.buttons["留在本局"].waitForExistence(timeout: 3)); capture("snake-real-collision", app: app); app.webViews.buttons["留在本局"].tap()
            }
        } else {
            // Boost can already end a real arena run on small screens; still verify the game can exit cleanly.
            XCTAssertTrue(app.webViews.buttons["留在本局"].waitForExistence(timeout: 3)); capture("snake-boost-collision", app: app); app.webViews.buttons["留在本局"].tap()
        }
        leaveWebGame(app)
        startGame("tetris", app: app)
        let duel = app.webViews.buttons["离线 AI 对战"]
        XCTAssertTrue(duel.waitForExistence(timeout: 15)); capture("tetris-mode-select", app: app); duel.tap()
        let hard = app.webViews.buttons["直接落下"]
        XCTAssertTrue(hard.waitForExistence(timeout: 15))
        app.webViews.buttons["左移"].press(forDuration: 1.2)
        assertNoTextSelectionMenu(app); capture("tetris-left-long-press-no-menu", app: app)
        app.webViews.buttons["软降"].press(forDuration: 1.2)
        assertNoTextSelectionMenu(app); capture("tetris-soft-long-press-no-menu", app: app)
        app.webViews.buttons["旋转"].tap(); app.webViews.buttons["暂存"].tap(); hard.tap()
        capture("tetris-duel-controls", app: app)
        XCUIDevice.shared.orientation = .landscapeLeft; sleep(1); capture("tetris-duel-landscape", app: app)
        app.webViews.buttons["暂停"].tap(); capture("tetris-duel-paused", app: app)
        XCUIDevice.shared.orientation = .portrait
        leaveWebGame(app)
    }
    func testFavoriteAndNativeCardDrag() throws {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        if app.webViews.buttons["返回"].waitForExistence(timeout: 3) { app.webViews.buttons["返回"].tap() }
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30)); app.buttons["native-games-tab"].tap()
        let catalog = app.collectionViews["native-catalog"]
        app.buttons["favorite-game2048"].tap(); app.buttons["favorite-snake"].tap()
        app.buttons["native-my-tab"].tap()
        let favorites = app.collectionViews["native-favorites"]
        XCTAssertTrue(favorites.cells["game-game2048"].waitForExistence(timeout: 5)); XCTAssertTrue(favorites.cells["game-snake"].exists)
        capture("native-two-favorites", app: app)
        app.buttons["native-games-tab"].tap()
        let firstID = catalog.cells.element(boundBy: 0).identifier
        let secondID = catalog.cells.element(boundBy: 1).identifier
        catalog.cells[firstID].press(forDuration: 0.7, thenDragTo: catalog.cells[secondID])
        sleep(1); XCTAssertEqual(catalog.cells.element(boundBy: 0).identifier, secondID)
        capture("native-card-drag", app: app)
        app.terminate(); app.launch()
        XCTAssertTrue(catalog.waitForExistence(timeout: 30)); XCTAssertEqual(catalog.cells.element(boundBy: 0).identifier, secondID)
        app.buttons["native-my-tab"].tap(); XCTAssertTrue(favorites.cells["game-game2048"].waitForExistence(timeout: 5)); XCTAssertTrue(favorites.cells["game-snake"].exists)
        capture("native-favorites-cold", app: app)
        app.buttons["native-games-tab"].tap()
    }
    func testZumaFullScreenBounds() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30))
        startGame("zuma", app: app)
        XCTAssertTrue(app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["换球", "SWAP"])).firstMatch.waitForExistence(timeout: 15))
        for (orientation, name) in [(UIDeviceOrientation.portrait, "portrait"), (.landscapeLeft, "landscape-left"), (.landscapeRight, "landscape-right")] {
            XCUIDevice.shared.orientation = orientation
            let landscape = orientation != .portrait
            let reached = NSPredicate { _, _ in
                let frame = app.webViews.firstMatch.frame
                return (frame.width > frame.height) == landscape
            }
            wait(for: [XCTNSPredicateExpectation(predicate: reached, object: nil)], timeout: 5)
            let screen = app.frame, web = app.webViews.firstMatch.frame
            capture("zuma-fullscreen-" + name, app: app)
            XCTAssertEqual(web.minX, screen.minX, accuracy: 1)
            XCTAssertEqual(web.minY, screen.minY, accuracy: 1)
            XCTAssertEqual(web.width, screen.width, accuracy: 1)
            XCTAssertEqual(web.height, screen.height, accuracy: 1)
            XCTAssertTrue(app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["换球", "SWAP"])).firstMatch.isHittable)
            let pause = app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["暂停", "Pause"])).allElementsBoundByIndex.last!
            XCTAssertTrue(pause.isHittable); pause.tap()
            XCTAssertTrue(app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["继续冒险", "Continue"])).firstMatch.waitForExistence(timeout: 5))
            app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["继续冒险", "Continue"])).firstMatch.tap()
        }
        app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["暂停", "Pause"])).allElementsBoundByIndex.last!.tap()
        app.webViews.buttons.matching(NSPredicate(format: "label IN %@", ["保存并退出", "Save & exit"])).firstMatch.tap()
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 5))
    }
    func testBubbleZumaAndPinballTouch() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication(); app.launch()
        if app.webViews.buttons["返回"].waitForExistence(timeout: 3) { app.webViews.buttons["返回"].firstMatch.tap() }
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30))
        startGame("paopao", app: app)
        let swap = app.webViews.buttons["切换当前泡泡和下一个泡泡"]
        XCTAssertTrue(swap.waitForExistence(timeout: 15)); capture("bubbles-before-shot", app: app); swap.tap()
        let board = app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.48, dy: 0.43)); board.tap(); sleep(1)
        app.webViews.buttons["暂停"].tap(); capture("bubbles-shot-paused", app: app); app.webViews.buttons["返回"].tap()
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30))
        startGame("zuma", app: app)
        let zswap = app.webViews.buttons["换球"]
        XCTAssertTrue(zswap.waitForExistence(timeout: 15)); capture("zuma-start", app: app); zswap.tap()
        app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.4)).tap(); sleep(1)
        let zumaPause = app.webViews.buttons.matching(identifier: "暂停").allElementsBoundByIndex.last!
        XCTAssertTrue(zumaPause.isHittable); zumaPause.tap(); capture("zuma-paused", app: app)
        app.webViews.buttons["保存并退出"].tap()
        startGame("pinball", app: app)
        let launch = app.webViews.buttons["长按蓄力"]
        XCTAssertTrue(launch.waitForExistence(timeout: 45)); sleep(3); capture("pinball-ready", app: app)
        launch.press(forDuration: 3.2); app.webViews.buttons["左挡板"].press(forDuration: 0.4); app.webViews.buttons["右挡板"].press(forDuration: 0.4)
        app.webViews.buttons["暂停"].tap(); capture("pinball-touch-paused", app: app); app.webViews.buttons["返回"].tap()
    }
    func testRestoreChosenBackupAndExport() throws {
        guard let filename = ProcessInfo.processInfo.environment["IOS_QA_BACKUP_NAME"], !filename.isEmpty else { throw XCTSkip("Supply IOS_QA_BACKUP_NAME for an already exported test-device backup") }
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        if app.webViews.buttons["留在本局"].exists { app.webViews.buttons["留在本局"].tap() }
        if app.webViews.buttons["返回"].waitForExistence(timeout: 3) { app.webViews.buttons["返回"].firstMatch.tap() }
        XCTAssertTrue(app.buttons["native-settings-tab"].waitForExistence(timeout: 30)); app.buttons["native-settings-tab"].tap()
        app.cells["setting-1-1"].tap()
        let file = app.collectionViews["File View"].cells.matching(NSPredicate(format: "label CONTAINS %@", filename)).firstMatch
        XCTAssertTrue(file.waitForExistence(timeout: 10)); file.tap()
        XCTAssertTrue(app.alerts["导入备份"].waitForExistence(timeout: 10)); app.alerts["导入备份"].buttons["确定"].tap()
        XCTAssertTrue(app.alerts.staticTexts["备份已导入"].waitForExistence(timeout: 10)); app.alerts.buttons["确定"].tap()
        app.cells["setting-1-0"].tap()
        let save = app.buttons.matching(NSPredicate(format: "label IN %@", ["保存", "Save"])).firstMatch
        XCTAssertTrue(save.waitForExistence(timeout: 10)); save.tap()
        XCTAssertTrue(app.cells["setting-1-0"].waitForExistence(timeout: 10)); capture("backup-restored-and-exported", app: app)
        app.buttons["native-games-tab"].tap(); capture("final-native-home", app: app)
    }
    func testBubbleBackgroundAndColdContinue() throws {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30))
        startGame("paopao", app: app)
        XCTAssertTrue(app.webViews.buttons["切换当前泡泡和下一个泡泡"].waitForExistence(timeout: 15))
        app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.48, dy: 0.43)).tap(); sleep(1)
        XCUIDevice.shared.press(.home); sleep(2); app.activate()
        XCTAssertTrue(app.webViews.buttons["继续"].waitForExistence(timeout: 10)); capture("bubble-background-paused", app: app)
        app.webViews.buttons["返回"].tap(); app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["native-games-tab"].waitForExistence(timeout: 30)); app.buttons["native-games-tab"].tap()
        let launch = app.buttons["launch-paopao"]
        for _ in 0..<10 { if launch.exists && launch.isHittable { break }; app.collectionViews["native-catalog"].swipeUp() }
        launch.tap()
        let resume = app.webViews.buttons["继续上次"]
        XCTAssertTrue(resume.waitForExistence(timeout: 10)); capture("bubble-cold-continue-prompt", app: app); resume.tap()
        XCTAssertTrue(app.webViews.buttons["切换当前泡泡和下一个泡泡"].waitForExistence(timeout: 15)); sleep(1)
        app.webViews.buttons["暂停"].tap(); capture("bubble-cold-continued", app: app); app.webViews.buttons["返回"].tap()
    }
}
