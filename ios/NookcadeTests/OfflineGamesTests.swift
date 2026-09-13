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
    func testZumaOpeningOnDevice() async throws {
        try await waitFor("!!window.wanbaApp", seconds: 45)
        continueAfterFailure = false
        let backup = try await value("wanbaApp.backupData()") as! String
        let quoted = String(data: try JSONSerialization.data(withJSONObject: [backup]), encoding: .utf8)!
        do {
            for round in 0..<2 {
                _ = try await value("wanbaApp.openShellTab('single')")
                _ = try await value("wanbaApp.launch('zuma','single')")
                try await Task.sleep(for: .milliseconds(200)) // Runtime presents the saved-game choice after 60 ms.
                try await waitFor("!wanbaApp.inspect().started && !!document.querySelector('#wb-start-cover-btn')", seconds: 5)
                _ = try await value("(()=>{document.querySelector('#wb-progress-new')?.click();return true})()")
                try await waitFor("!document.querySelector('#wb-progress-new') && !!document.querySelector('#wb-start-cover-btn')", seconds: 5)
                _ = try await value("(()=>{document.querySelector('#wb-start-cover-btn').click();return true})()")
                try await waitFor("wanbaApp.inspect().started && !!wanbaApp.inspect().controller", seconds: 5)
                async let sampled = value("new Promise(resolve=>{const rows=[],start=performance.now();function sample(){const s=wanbaApp.inspect().controller;rows.push({time:performance.now()-start,intro:s.introTime,visible:s.chain.filter(b=>b.s>=0).length,head:s.chain.at(-1)?.s??null,shots:s.details.shots,pose:s.view.introPose});if(performance.now()-start<2200 || (s.introTime!==null && performance.now()-start<6500))requestAnimationFrame(sample);else resolve(rows)}sample()})")
                for stage in 0..<2 {
                    try await Task.sleep(for: .milliseconds(stage == 0 ? 450 : 700))
                    let image = XCTAttachment(image: try await host.webView.takeSnapshot(configuration: nil)); image.name = "zuma-skull-round-\(round)-stage-\(stage)"; image.lifetime = .keepAlways; add(image)
                }
                let samples = try await sampled as! [[String: Any]]
                let first = samples.first!, last = samples.last!
                XCTAssertNotNil(first["intro"] as? Double, "New round must animate into the track")
                XCTAssertTrue(last["intro"] is NSNull, "Opening must finish")
                XCTAssertLessThan(first["visible"] as! Int, last["visible"] as! Int)
                XCTAssertGreaterThan(last["head"] as! Double, first["head"] as! Double)
                XCTAssertTrue(samples.contains { (($0["pose"] as? [String: Any])?["impact"] as? Double ?? 0) > 0 }, "Landing impact must be rendered")
                XCTAssertTrue(samples.contains { abs(($0["pose"] as? [String: Any])?["rotation"] as? Double ?? 0) > 1 }, "Skull must rotate during entry")
                XCTAssertGreaterThan(samples.count, 30, "Real WKWebView must deliver animation frames")
                let data = try JSONSerialization.data(withJSONObject: samples, options: [.prettyPrinted])
                let evidence = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); evidence.name = "zuma-opening-round-\(round)"; evidence.lifetime = .keepAlways; add(evidence)
                let shot = XCTAttachment(image: try await host.webView.takeSnapshot(configuration: nil)); shot.name = "zuma-opening-complete-\(round)"; shot.lifetime = .keepAlways; add(shot)
            }
        } catch {
            _ = try? await value("wanbaApp.openShellTab('single')")
            _ = try? await value("wanbaApp.importBackup(\(quoted)[0],true)")
            throw error
        }
        _ = try await value("wanbaApp.openShellTab('single')")
        _ = try await value("wanbaApp.importBackup(\(quoted)[0],true)")
    }
    func testScrewStableZDuringPointerDrivenSwing() async throws {
        try await waitFor("!!window.wanbaApp", seconds: 45)
        continueAfterFailure = false
        let backup = try await value("wanbaApp.backupData()") as! String
        let quotedBackup = String(data: try JSONSerialization.data(withJSONObject: [backup]), encoding: .utf8)!

        func stackState() async throws -> [String: Any] {
            try await value("""
                (async()=>{
                  const module=await import('/src/games/plugins/screw/index.js');
                  const state=wanbaApp.inspect().controller;
                  return {
                    panels:state.panels.map(panel=>({id:panel.id,z:panel.z,order:panel.order})),
                    panelSignature:state.panels.map(panel=>`${panel.id}:${panel.z}:${panel.order}`),
                    paintStack:module.stablePanelPaintStack(state.panels).map(entry=>entry.panel.id),
                    layerCompositor:state.render.layerCompositor,
                    swings:state.render.motion.swings
                  };
                })()
                """) as! [String: Any]
        }
        func pointerTap(screwID: String) async throws {
            let quotedID = String(data: try JSONSerialization.data(withJSONObject: [screwID]), encoding: .utf8)!
            let result = try await value("""
                (async()=>{
                  const model=await import('/src/games/plugins/screw/model.js');
                  const state=wanbaApp.inspect().controller;
                  const hit=model.allLiveScrews(state).find(item=>item.screw.id===\(quotedID)[0]);
                  const canvas=document.querySelector('#wb-screw-canvas'),rect=canvas.getBoundingClientRect();
                  if(!hit||!canvas)throw Error('Missing screw pointer target');
                  const clientX=rect.x+hit.point.x/420*rect.width;
                  const clientY=rect.y+hit.point.y/560*rect.height;
                  const before=state.moves;
                  const targetIsCanvas=document.elementFromPoint(clientX,clientY)===canvas;
                  canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX,clientY,pointerId:17,pointerType:'touch',isPrimary:true}));
                  return {before,targetIsCanvas,clientX,clientY};
                })()
                """) as! [String: Any]
            XCTAssertEqual(result["targetIsCanvas"] as? Bool, true, "The real canvas pointer path must be exposed")
            let before = result["before"] as! Int
            try await waitFor("wanbaApp.inspect().controller.moves>\(before)", seconds: 3)
        }

        do {
            _ = try await value("(()=>{const key='wanbanXiaowu_progress_v1',all=JSON.parse(localStorage.getItem(key)||'{}');delete all.screw;localStorage.setItem(key,JSON.stringify(all));return true})()")
            _ = try await value("wanbaApp.openShellTab('single')")
            _ = try await value("wanbaApp.launch('screw','single')")
            for _ in 0..<60 {
                if (try await value("wanbaApp.inspect().started") as? Bool) == true { break }
                _ = try await value("(()=>{const el=['#wb-progress-new','[data-choice=normal]','#wb-start-cover-btn'].map(selector=>document.querySelector(selector)).find(item=>item&&!item.disabled);if(el)el.click();return !!el})()")
                try await Task.sleep(for: .milliseconds(120))
            }
            try await waitFor("wanbaApp.inspect().started&&!!wanbaApp.inspect().controller", seconds: 5)
            let initial = try await stackState()
            let initialPanels = initial["panels"] as! [[String: Any]]
            let initialSignature = initial["panelSignature"] as! [String]
            XCTAssertEqual(initialPanels.map { $0["id"] as! String }, ["l1-p0", "l1-p1", "l1-p2"])
            XCTAssertEqual(initialPanels.map { $0["z"] as! Int }, [2, 1, 0])
            XCTAssertEqual(initialPanels.map { $0["order"] as! Int }, [0, 1, 2])
            XCTAssertEqual(initialSignature, ["l1-p0:2:0", "l1-p1:1:1", "l1-p2:0:2"])
            XCTAssertEqual(initial["paintStack"] as? [String], ["l1-p2", "l1-p1", "l1-p0"])
            XCTAssertEqual(initial["layerCompositor"] as? String, "stable-z-v1")
            let initialAngle = try await value("wanbaApp.inspect().controller.panels.find(panel=>panel.id==='l1-p1').a") as! Double

            try await pointerTap(screwID: "l1-p1-s0")
            try await pointerTap(screwID: "l1-p1-s1")
            try await waitFor("(()=>{const state=wanbaApp.inspect().controller,panel=state.panels.find(item=>item.id==='l1-p1');return state.render.motion.swings===1&&Math.abs(panel.a-\(initialAngle))>.02})()", seconds: 3)

            let moving = try await stackState()
            XCTAssertEqual(moving["panelSignature"] as? [String], initialSignature)
            XCTAssertEqual(moving["paintStack"] as? [String], ["l1-p2", "l1-p1", "l1-p0"])
            XCTAssertEqual(moving["layerCompositor"] as? String, "stable-z-v1")
            XCTAssertEqual(moving["swings"] as? Int, 1)
            let image = XCTAttachment(image: try await host.webView.takeSnapshot(configuration: nil))
            image.name = "screw-stable-z-middle-disc-swing"
            image.lifetime = .keepAlways
            add(image)

            try await waitFor("wanbaApp.inspect().controller.render.motion.swings===0", seconds: 4)
            let settled = try await stackState()
            XCTAssertEqual(settled["panelSignature"] as? [String], initialSignature)
            XCTAssertEqual(settled["paintStack"] as? [String], ["l1-p2", "l1-p1", "l1-p0"])
            let evidenceData = try JSONSerialization.data(withJSONObject: ["initial": initial, "moving": moving, "settled": settled], options: [.prettyPrinted, .sortedKeys])
            let evidence = XCTAttachment(data: evidenceData, uniformTypeIdentifier: "public.json")
            evidence.name = "screw-stable-z-pointer-evidence"
            evidence.lifetime = .keepAlways
            add(evidence)
        } catch {
            _ = try? await value("wanbaApp.openShellTab('single')")
            _ = try? await value("wanbaApp.importBackup(\(quotedBackup)[0],true)")
            throw error
        }
        _ = try await value("wanbaApp.openShellTab('single')")
        _ = try await value("wanbaApp.importBackup(\(quotedBackup)[0],true)")
    }
    func testClassicAndCrazyScrewModesAndStorageIsolation() async throws {
        try await waitFor("!!window.wanbaApp", seconds: 45)
        continueAfterFailure = false
        let backup = try await value("wanbaApp.backupData()") as! String
        let quotedBackup = String(data: try JSONSerialization.data(withJSONObject: [backup]), encoding: .utf8)!
        func startClassic(_ choice: String) async throws {
            _ = try await value("wanbaApp.launch('screwclassic','single')")
            try await waitFor("!!document.querySelector('#wb-start-cover-btn')", seconds: 5)
            _ = try await value("(()=>{document.querySelector('#wb-start-cover-btn').click();return true})()")
            try await waitFor("!!document.querySelector('[data-choice=\"\(choice)\"]')", seconds: 5)
            _ = try await value("(()=>{document.querySelector('[data-choice=\"\(choice)\"]').click();return true})()")
            try await waitFor("wanbaApp.inspect().started&&!!document.querySelector('#wb-screw-canvas')", seconds: 5)
            _ = try await value("(wanbaApp.save(),true)")
        }
        do {
            _ = try await value("wanbaApp.openShellTab('single')")
            let cleared = try await value("(()=>{const data=JSON.parse(\(quotedBackup)[0]);data.items.wanbanXiaowu_progress_v1={};return wanbaApp.importBackup(JSON.stringify(data),true)})()") as! [String: Any]
            XCTAssertEqual(cleared["ok"] as? Bool, true)
            try await startClassic("normal")
            let normal = try await value("JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).screwclassic") as! [String: Any]
            XCTAssertEqual(normal["choice"] as? String, "normal")
            XCTAssertTrue((42...47).contains((normal["panels"] as! [[String: Any]]).count))
            let pointer = try await value("""
                (()=>{wanbaApp.save();const key='wanbanXiaowu_progress_v1',before=JSON.parse(localStorage.getItem(key)).screwclassic;
                const panel=before.panels.filter(item=>!item.gone&&!item.falling).sort((a,b)=>b.z-a.z)[0],screw=panel.screws.find(item=>!item.gone);
                const ca=Math.cos(panel.a||0),sa=Math.sin(panel.a||0),x=panel.x+screw.lx*ca-screw.ly*sa,y=panel.y+screw.lx*sa+screw.ly*ca;
                const canvas=document.querySelector('#wb-screw-canvas'),rect=canvas.getBoundingClientRect(),clientX=rect.left+x/420*rect.width,clientY=rect.top+y/560*rect.height;
                const targetIsCanvas=document.elementFromPoint(clientX,clientY)===canvas,removed=before.details.removed||0;
                canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX,clientY,pointerId:31,pointerType:'touch',isPrimary:true}));wanbaApp.save();
                const after=JSON.parse(localStorage.getItem(key)).screwclassic;
                window.__classicScrewFormal=JSON.stringify({choice:after.choice,removed:after.details.removed,panels:after.panels.map(panel=>({id:panel.id,z:panel.z,gone:panel.gone,screws:panel.screws.map(s=>[s.id,s.gone])})),tray:after.tray,boxes:after.boxes.map(box=>[box.color,box.fill])});
                return {targetIsCanvas,before:removed,after:after.details.removed||0};})()
                """) as! [String: Any]
            XCTAssertEqual(pointer["targetIsCanvas"] as? Bool, true)
            XCTAssertEqual(pointer["after"] as? Int, (pointer["before"] as! Int) + 1)

            _ = try await value("wanbaApp.openShellTab('single')")
            _ = try await value("wanbaApp.launch('screw','single')")
            _ = try await value("(()=>{document.querySelector('#wb-start-cover-btn').click();return true})()")
            try await waitFor("!!document.querySelector('[data-choice=normal]')", seconds: 5)
            _ = try await value("(()=>{document.querySelector('[data-choice=normal]').click();return true})()")
            try await waitFor("wanbaApp.inspect().started&&!!wanbaApp.inspect().controller", seconds: 5)
            let isolated = try await value("(()=>{wanbaApp.save();const all=JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')),classic=all.screwclassic;const classicFormal=JSON.stringify({choice:classic.choice,removed:classic.details.removed,panels:classic.panels.map(panel=>({id:panel.id,z:panel.z,gone:panel.gone,screws:panel.screws.map(s=>[s.id,s.gone])})),tray:classic.tray,boxes:classic.boxes.map(box=>[box.color,box.fill])});return {classicSame:classicFormal===window.__classicScrewFormal,hasCrazy:!!all.screw,crazyVersion:wanbaApp.inspect().games.find(item=>item.id==='screw').content.gameVersion,classicVersion:wanbaApp.inspect().games.find(item=>item.id==='screwclassic').content.gameVersion};})()") as! [String: Any]
            XCTAssertEqual(isolated["classicSame"] as? Bool, true)
            XCTAssertEqual(isolated["hasCrazy"] as? Bool, true)
            XCTAssertEqual(isolated["classicVersion"] as? String, "1.0.1")
            XCTAssertEqual(isolated["crazyVersion"] as? String, "1.3.1")

            _ = try await value("wanbaApp.openShellTab('single')")
            _ = try await value("(()=>{const state=JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')).screw;window.__crazyScrewFormal=JSON.stringify({choice:state.choice,mode:state.mode,level:state.level,moves:state.moves,panels:state.panels.map(panel=>({id:panel.id,z:panel.z,order:panel.order,screws:panel.screws.map(s=>[s.id,s.gone])})),removed:state.details.removed});return true})()")
            let classicCleared = try await value("(()=>{const key='wanbanXiaowu_progress_v1',data=JSON.parse(wanbaApp.backupData());delete data.items[key].screwclassic;return wanbaApp.importBackup(JSON.stringify(data),true)})()") as! [String: Any]
            XCTAssertEqual(classicCleared["ok"] as? Bool, true)
            try await startClassic("endless")
            let endless = try await value("(()=>{wanbaApp.save();const all=JSON.parse(localStorage.getItem('wanbanXiaowu_progress_v1')),state=all.screw;const crazyFormal=JSON.stringify({choice:state.choice,mode:state.mode,level:state.level,moves:state.moves,panels:state.panels.map(panel=>({id:panel.id,z:panel.z,order:panel.order,screws:panel.screws.map(s=>[s.id,s.gone])})),removed:state.details.removed});return {choice:all.screwclassic.choice,panels:all.screwclassic.panels.length,crazySame:crazyFormal===window.__crazyScrewFormal,label:document.querySelector('#wb-screw-progress-text').textContent};})()") as! [String: Any]
            XCTAssertEqual(endless["choice"] as? String, "endless")
            XCTAssertTrue((28...32).contains(endless["panels"] as! Int))
            XCTAssertEqual(endless["crazySame"] as? Bool, true)
            XCTAssertTrue((endless["label"] as! String).hasPrefix("收纳盒子 "))
            let evidenceData = try JSONSerialization.data(withJSONObject: ["normalPanels": (normal["panels"] as! [[String: Any]]).count, "pointer": pointer, "isolation": isolated, "endless": endless], options: [.prettyPrinted, .sortedKeys])
            let evidence = XCTAttachment(data: evidenceData, uniformTypeIdentifier: "public.json"); evidence.name = "ios-screwclassic-crazy-regression"; evidence.lifetime = .keepAlways; add(evidence)
        } catch {
            _ = try? await value("wanbaApp.openShellTab('single')")
            _ = try? await value("wanbaApp.importBackup(\(quotedBackup)[0],true)")
            throw error
        }
        _ = try await value("wanbaApp.openShellTab('single')")
        _ = try await value("wanbaApp.importBackup(\(quotedBackup)[0],true)")
    }
    func testAll38BundledGamesAndWasm() async throws {
        try await waitFor("!!window.wanbaApp", seconds: 45)
        let capability = try await value("({origin:location.origin, secure:isSecureContext, wasm:typeof WebAssembly.instantiate==='function', gl:!!document.createElement('canvas').getContext('webgl'), games:wanbaApp.catalog().games.length, app:wanbaApp.catalog().appInfo})") as! [String: Any]
        XCTAssertEqual(capability["origin"] as? String, LoopbackServer.origin)
        XCTAssertEqual(capability["secure"] as? Bool, true); XCTAssertEqual(capability["wasm"] as? Bool, true); XCTAssertEqual(capability["gl"] as? Bool, true)
        XCTAssertEqual(capability["games"] as? Int, 38)
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
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json"); attachment.name = "ios-38-games"; attachment.lifetime = .keepAlways; add(attachment)
        let quoted = String(data: try JSONSerialization.data(withJSONObject: [backup]), encoding: .utf8)!
        let imported = try await value("wanbaApp.importBackup(\(quoted)[0],true)") as! [String: Any]; XCTAssertEqual(imported["ok"] as? Bool, true)
        _ = try await value("wanbaApp.openShellTab('single')")
    }
}
