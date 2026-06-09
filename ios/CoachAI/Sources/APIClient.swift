import Foundation

// MARK: - 后端 API 客户端

/// 向 coach.ai 后端 /data/* 与 /report/* 上报采集数据。
/// 后端地址默认走开发机 LAN，可在「设置」里用 UserDefaults 键 `coachai.backendURL` 覆盖。
enum APIClient {

    /// ⚠️ 开发期改成你 Mac 的局域网 IP（与 iPhone 同一 Wi-Fi），例如 http://192.168.1.20:8000
    static let defaultBaseURL = "http://127.0.0.1:8000"

    static var baseURL: String {
        UserDefaults.standard.string(forKey: "coachai.backendURL") ?? defaultBaseURL
    }

    /// 通用 JSON POST；nil 字段自动剔除。返回响应体 Data。
    @discardableResult
    static func post(_ path: String, _ body: [String: Any?]) async throws -> Data {
        guard let url = URL(string: baseURL + path) else {
            throw NSError(domain: "APIClient", code: -1,
                          userInfo: [NSLocalizedDescriptionKey: "无效后端地址"])
        }
        let clean = body.compactMapValues { $0 }   // 去掉 nil
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: clean)

        let (data, resp) = try await URLSession.shared.data(for: req)
        if let http = resp as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            let msg = String(data: data, encoding: .utf8) ?? ""
            throw NSError(domain: "APIClient", code: http.statusCode,
                          userInfo: [NSLocalizedDescriptionKey: "POST \(path) 失败 \(http.statusCode): \(msg)"])
        }
        return data
    }
}
