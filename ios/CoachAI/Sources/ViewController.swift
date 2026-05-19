import UIKit
import WebKit
import HealthKit

class ViewController: UIViewController {

    // MARK: - 属性

    private var webView: WKWebView!
    private let bridgeName = "healthBridge"

    // MARK: - 生命周期

    override func viewDidLoad() {
        super.viewDidLoad()
        setupWebView()
        requestHealthPermission()
        loadH5()
    }

    // MARK: - 设置 WKWebView

    private func setupWebView() {
        let config = WKWebViewConfiguration()

        // 注册 JS → Native 消息通道
        config.userContentController.add(
            WeakScriptHandler(delegate: self),
            name: bridgeName
        )

        // 注入 Bridge 初始化脚本（H5 加载前执行）
        let bridgeScript = WKUserScript(
            source: Self.bridgeInitScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(bridgeScript)

        // 允许内联媒体、禁止缩放
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.scrollView.contentInsetAdjustmentBehavior = .never

        // 深色背景防闪白
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.051, green: 0.086, blue: 0.161, alpha: 1) // #0D1629

        view.addSubview(webView)
        view.backgroundColor = webView.backgroundColor
    }

    // MARK: - HealthKit 权限

    private func requestHealthPermission() {
        HealthKitManager.shared.requestAuthorization { granted, error in
            if !granted {
                print("HealthKit 权限未授权: \(error?.localizedDescription ?? "未知错误")")
            }
        }
    }

    // MARK: - 加载 H5

    private func loadH5() {
        // 方式一：加载本地 bundle（打包进 App）
        if let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "www") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
            return
        }

        // 方式二：加载远程 URL（开发/测试用）
        // 上线后换成你的正式域名
        if let url = URL(string: "https://your-coach-ai.com") {
            webView.load(URLRequest(url: url))
            return
        }

        // 方式三：直接加载 HTML 字符串（离线包）
        let fallbackHTML = """
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
        <style>body{background:#0D1629;color:#B6D8F7;font-family:sans-serif;
          display:flex;align-items:center;justify-content:center;height:100vh;margin:0;
          flex-direction:column;gap:12px;}
        </style></head>
        <body>
          <div style="font-size:24px">教练.AI</div>
          <div style="font-size:13px;opacity:.5">正在加载...</div>
        </body>
        </html>
        """
        webView.loadHTMLString(fallbackHTML, baseURL: nil)
    }

    // MARK: - 向 H5 注入健康数据

    private func sendHealthDataToH5(_ snapshot: HealthSnapshot) {
        guard let jsonData = try? JSONEncoder().encode(snapshot),
              let jsonStr = String(data: jsonData, encoding: .utf8) else { return }

        // 调用 H5 全局函数接收数据
        let js = "window.__receiveHealthData(\(jsonStr));"
        webView.evaluateJavaScript(js) { _, error in
            if let error = error {
                print("Bridge 回传失败: \(error)")
            }
        }
    }

    // MARK: - Bridge 初始化脚本（注入到 H5）

    static let bridgeInitScript = """
    // Coach.AI Native Bridge
    // H5 可通过 window.CoachBridge.sync() 发起数据同步
    window.CoachBridge = {
        isNative: true,
        sync: function() {
            window.webkit.messageHandlers.healthBridge.postMessage({
                action: 'sync'
            });
        },
        // 占位符，会被 H5 代码替换
        onDataReceived: null
    };

    // 原生回传入口（Swift 调用此函数）
    window.__receiveHealthData = function(data) {
        // 通过 postMessage 派发，让 H5 的 addEventListener 能监听到
        window.dispatchEvent(new MessageEvent('message', {
            data: { type: 'health_data', payload: data }
        }));
        // 同时直接调用回调（双保险）
        if (typeof window.CoachBridge.onDataReceived === 'function') {
            window.CoachBridge.onDataReceived(data);
        }
    };

    console.log('[CoachBridge] Native bridge initialized');
    """
}

// MARK: - WKScriptMessageHandler（JS → Native）

extension ViewController: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == bridgeName,
              let body = message.body as? [String: Any],
              let action = body["action"] as? String
        else { return }

        switch action {
        case "sync":
            // H5 请求同步健康数据
            HealthKitManager.shared.fetchSnapshot { [weak self] result in
                switch result {
                case .success(let snapshot):
                    self?.sendHealthDataToH5(snapshot)
                case .failure(let error):
                    print("健康数据获取失败: \(error)")
                    self?.webView.evaluateJavaScript(
                        "window.__receiveHealthError('\(error.localizedDescription)');"
                    )
                }
            }

        default:
            print("未知 Bridge action: \(action)")
        }
    }
}

// MARK: - WKNavigationDelegate

extension ViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        print("H5 加载完成")
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        print("H5 加载失败: \(error)")
    }
}

// MARK: - 防循环引用（WKScriptMessageHandler 强引用问题）

class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(delegate: WKScriptMessageHandler) { self.delegate = delegate }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}
