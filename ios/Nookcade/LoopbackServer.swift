import Foundation
import Network

/// Bundle-only HTTP. This server never reads Documents or exposes mutation APIs.
final class LoopbackServer {
    static let port: UInt16 = 18737
    static let origin = "http://127.0.0.1:\(port)"
    let root: URL
    private let queue = DispatchQueue(label: "Nookcade.bundle-http", qos: .userInitiated)
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]
    init(root: URL) { self.root = root.standardizedFileURL.resolvingSymlinksInPath() }
    func start(completion: @escaping (Error?) -> Void) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!)
        parameters.allowLocalEndpointReuse = false
        let listener = try NWListener(using: parameters)
        self.listener = listener
        var finished = false
        listener.stateUpdateHandler = { state in
            guard !finished else { return }
            switch state {
            case .ready: finished = true; DispatchQueue.main.async { completion(nil) }
            case .failed(let error): finished = true; listener.cancel(); DispatchQueue.main.async { completion(error) }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            guard self.connections.count < 48 else { connection.cancel(); return }
            let id = UUID(); self.connections[id] = connection
            connection.stateUpdateHandler = { [weak self] state in
                if case .failed = state { self?.connections.removeValue(forKey: id); connection.cancel() }
                if case .cancelled = state { self?.connections.removeValue(forKey: id) }
            }
            connection.start(queue: self.queue)
            self.queue.asyncAfter(deadline: .now() + 20) { [weak self] in
                if self?.connections[id] != nil { connection.cancel(); self?.connections.removeValue(forKey: id) }
            }
            self.receive(connection, id: id, pending: Data())
        }
        listener.start(queue: queue)
    }
    func stop() { queue.async { [weak self] in self?.listener?.cancel(); self?.connections.values.forEach { $0.cancel() }; self?.connections.removeAll() } }
    private func receive(_ connection: NWConnection, id: UUID, pending: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] bytes, _, ended, error in
            guard let self else { connection.cancel(); return }
            var buffer = pending; if let bytes { buffer.append(bytes) }
            if buffer.count > 16384 { connection.cancel(); return }
            if let range = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let request = String(decoding: buffer[..<range.lowerBound], as: UTF8.self)
                let response = self.response(request)
                connection.send(content: response, completion: .contentProcessed { [weak self] _ in connection.cancel(); self?.connections.removeValue(forKey: id) })
            } else if error == nil && !ended { self.receive(connection, id: id, pending: buffer) }
            else { connection.cancel() }
        }
    }
    static func mime(_ path: String) -> String {
        switch URL(fileURLWithPath: path).pathExtension.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "wasm": return "application/wasm"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "svg": return "image/svg+xml"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "wav": return "audio/wav"
        case "mp3": return "audio/mpeg"
        case "txt", "md": return "text/plain; charset=utf-8"
        default: return "application/octet-stream"
        }
    }
    func response(_ request: String) -> Data {
        let lines = request.components(separatedBy: "\r\n")
        let start = (lines.first ?? "").split(separator: " ").map(String.init)
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let key = line[..<colon].lowercased()
            guard headers[key] == nil else { return reply(400) }
            headers[key] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        guard start.count == 3, ["HTTP/1.1", "HTTP/1.0"].contains(start[2]), headers["host"] == "127.0.0.1:\(Self.port)" else { return reply(400) }
        guard ["GET", "HEAD"].contains(start[0]) else { return reply(405) }
        if let origin = headers["origin"], origin != Self.origin { return reply(403) }
        guard start[1].hasPrefix("/"), start[1].count < 4096, !start[1].hasPrefix("//"),
              let path = start[1].split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first?.removingPercentEncoding,
              !path.contains("\\"), !path.contains("\0"), !path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." || $0.hasPrefix(".") }) else { return reply(403) }
        let resource = root.appendingPathComponent(path == "/" ? "standalone/index.html" : String(path.dropFirst())).standardizedFileURL.resolvingSymlinksInPath()
        guard resource.path.hasPrefix(root.path + "/"), let attributes = try? resource.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey]),
              attributes.isRegularFile == true, let size = attributes.fileSize, size <= 80 * 1024 * 1024,
              let data = try? Data(contentsOf: resource, options: .mappedIfSafe) else { return reply(404) }
        if let range = headers["range"] {
            guard range.hasPrefix("bytes="), !range.contains(",") else { return reply(416, extra: ["Content-Range": "bytes */\(data.count)"]) }
            let bounds = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            guard bounds.count == 2, let lower = Int(bounds[0]), lower >= 0, lower < data.count else { return reply(416) }
            let upper = bounds[1].isEmpty ? data.count - 1 : (Int(bounds[1]) ?? -1)
            guard upper >= lower, upper < data.count else { return reply(416) }
            return reply(206, body: data.subdata(in: lower..<(upper + 1)), type: Self.mime(resource.path), head: start[0] == "HEAD", extra: ["Content-Range": "bytes \(lower)-\(upper)/\(data.count)"])
        }
        return reply(200, body: data, type: Self.mime(resource.path), head: start[0] == "HEAD")
    }
    private func reply(_ status: Int, body: Data = Data(), type: String = "text/plain", head: Bool = false, extra: [String: String] = [:]) -> Data {
        var header = "HTTP/1.1 \(status) \(status == 200 ? "OK" : status == 206 ? "Partial Content" : "Request rejected")\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nCross-Origin-Resource-Policy: same-origin\r\nCross-Origin-Opener-Policy: same-origin\r\nCross-Origin-Embedder-Policy: require-corp\r\nAccept-Ranges: bytes\r\n"
        for (key, value) in extra { header += "\(key): \(value)\r\n" }
        header += "\r\n"; var answer = Data(header.utf8); if !head { answer.append(body) }; return answer
    }
}
