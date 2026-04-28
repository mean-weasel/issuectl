import SwiftUI
import WebKit

struct TerminalView: View {
    @Environment(APIClient.self) private var api
    let deployment: ActiveDeployment
    let port: Int
    let onEnd: () -> Void
    private let terminalFontSize = 24
    private let terminalPageZoom = 1.35

    @Environment(\.dismiss) private var dismiss
    @State private var showEndConfirm = false
    @State private var loadError: String?
    @State private var currentPort: Int
    @State private var terminalToken: String?
    @State private var isRespawning = false
    @State private var isEndingSession = false
    @State private var endSessionError: String?

    init(deployment: ActiveDeployment, port: Int, onEnd: @escaping () -> Void) {
        self.deployment = deployment
        self.port = port
        self.onEnd = onEnd
        _currentPort = State(initialValue: port)
    }

    var body: some View {
        NavigationStack {
            Group {
                if terminalToken == nil && loadError == nil {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Connecting terminal…")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                } else if let url = terminalURL {
                    if isRespawning {
                        VStack(spacing: 12) {
                            ProgressView()
                            Text("Reconnecting terminal…")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    } else if let loadError {
                        ContentUnavailableView {
                            Label("Terminal Connection Failed", systemImage: "wifi.exclamationmark")
                        } description: {
                            Text(loadError)
                        } actions: {
                            Button("Retry") {
                                Task { await attemptRespawn() }
                            }
                        }
                    } else {
                        TerminalWebView(
                            url: url,
                            loadError: $loadError,
                            fontSize: terminalFontSize,
                            pageZoom: terminalPageZoom
                        )
                            .ignoresSafeArea(edges: .bottom)
                    }
                } else {
                    ContentUnavailableView {
                        Label("Invalid Server URL", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text("Could not parse: \(api.serverURL)/api/terminal/\(port)/")
                    } actions: {
                        Button("Dismiss") { dismiss() }
                    }
                }
            }
            .navigationTitle("\(deployment.repoFullName) #\(deployment.issueNumber)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("terminal-done-button")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    HStack(spacing: 12) {
                        Text(deployment.runningDuration)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button(role: .destructive) {
                            showEndConfirm = true
                        } label: {
                            Label("End", systemImage: "stop.circle.fill")
                        }
                        .accessibilityIdentifier("terminal-end-button")
                    }
                }
            }
            .confirmationDialog(
                "End this session?",
                isPresented: $showEndConfirm,
                titleVisibility: .visible
            ) {
                Button("End Session", role: .destructive) {
                    Task { await endSession() }
                }
            }
            .overlay {
                if isEndingSession {
                    ZStack {
                        Color.black.opacity(0.3)
                            .ignoresSafeArea()
                        VStack(spacing: 12) {
                            ProgressView()
                            Text("Ending session…")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        .padding(24)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                    }
                }
            }
            .alert("Failed to End Session", isPresented: Binding(
                get: { endSessionError != nil },
                set: { if !$0 { endSessionError = nil } }
            )) {
                Button("OK", role: .cancel) {}
            } message: {
                if let endSessionError {
                    Text(endSessionError)
                }
            }
            .task {
                if terminalToken == nil && !isRespawning {
                    await attemptRespawn()
                }
            }
        }
    }

    private var terminalURL: URL? {
        guard let terminalToken else { return nil }
        var components = URLComponents(string: "\(api.serverURL)/api/terminal/\(currentPort)/")
        components?.queryItems = [
            URLQueryItem(name: "terminalToken", value: terminalToken),
            URLQueryItem(name: "fontSize", value: "\(terminalFontSize)"),
            URLQueryItem(name: "lineHeight", value: "1.25"),
            URLQueryItem(name: "disableResizeOverlay", value: "true"),
            URLQueryItem(name: "rendererType", value: "canvas"),
        ]
        return components?.url
    }

    private func endSession() async {
        isEndingSession = true
        endSessionError = nil
        defer { isEndingSession = false }

        do {
            let response = try await api.endSession(
                deploymentId: deployment.id,
                owner: deployment.owner,
                repo: deployment.repoName,
                issueNumber: deployment.issueNumber
            )
            if response.success {
                onEnd()
            } else {
                endSessionError = response.error ?? "Failed to end session"
            }
        } catch {
            endSessionError = error.localizedDescription
        }
    }

    private func attemptRespawn() async {
        isRespawning = true
        loadError = nil
        do {
            let result = try await api.ensureTtyd(deploymentId: deployment.id)
            switch result {
            case .available(let port, let token, _):
                currentPort = port
                terminalToken = token
            case .unavailable(let error):
                loadError = error ?? "Session has ended"
            }
        } catch {
            loadError = error.localizedDescription
        }
        isRespawning = false
    }
}

struct TerminalWebView: UIViewRepresentable {
    let url: URL
    @Binding var loadError: String?
    let fontSize: Int
    let pageZoom: CGFloat

    func makeCoordinator() -> Coordinator {
        Coordinator(loadError: $loadError, fontSize: fontSize)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.bounces = false
        webView.navigationDelegate = context.coordinator
        webView.pageZoom = pageZoom
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.fontSize = fontSize
        webView.pageZoom = pageZoom
        if webView.url != url {
            webView.load(URLRequest(url: url))
        } else {
            context.coordinator.applyTerminalSizing(to: webView)
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var loadError: String?
        var fontSize: Int

        init(loadError: Binding<String?>, fontSize: Int) {
            _loadError = loadError
            self.fontSize = fontSize
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loadError = nil
            applyTerminalSizing(to: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            loadError = error.localizedDescription
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            loadError = error.localizedDescription
        }

        func applyTerminalSizing(to webView: WKWebView) {
            let script = """
            (() => {
                const id = "issuectl-terminal-font-size";
                let style = document.getElementById(id);
                if (!style) {
                    style = document.createElement("style");
                    style.id = id;
                    document.head.appendChild(style);
                }
                style.textContent = `
                    :root {
                        --issuectl-terminal-font-size: \(fontSize)px;
                    }
                    body,
                    .terminal,
                    .xterm,
                    .xterm-viewport,
                    .xterm-screen,
                    .xterm-rows,
                    .xterm-char-measure-element {
                        font-size: var(--issuectl-terminal-font-size) !important;
                        line-height: 1.2 !important;
                    }
                `;
                const terminal = window.term || window.terminal || window.xterm;
                if (terminal && terminal.options) {
                    terminal.options.fontSize = \(fontSize);
                    terminal.options.lineHeight = 1.2;
                    if (typeof terminal.refresh === "function") {
                        terminal.refresh(0, terminal.rows || 0);
                    }
                }
                window.dispatchEvent(new Event("resize"));
                setTimeout(() => window.dispatchEvent(new Event("resize")), 150);
            })();
            """
            webView.evaluateJavaScript(script)
        }
    }
}
