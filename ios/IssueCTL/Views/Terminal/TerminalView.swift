import SwiftUI
import WebKit

struct TerminalView: View {
    @Environment(APIClient.self) private var api
    let deployment: ActiveDeployment
    let port: Int
    let onEnd: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showEndConfirm = false
    @State private var loadError: String?
    @State private var currentPort: Int
    @State private var isRespawning = false

    init(deployment: ActiveDeployment, port: Int, onEnd: @escaping () -> Void) {
        self.deployment = deployment
        self.port = port
        self.onEnd = onEnd
        _currentPort = State(initialValue: port)
    }

    var body: some View {
        NavigationStack {
            Group {
                if let url = terminalURL {
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
                        TerminalWebView(url: url, loadError: $loadError)
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
                    onEnd()
                }
            }
        }
    }

    private var terminalURL: URL? {
        URL(string: "\(api.serverURL)/api/terminal/\(currentPort)/")
    }

    private func attemptRespawn() async {
        isRespawning = true
        loadError = nil
        do {
            let result = try await api.ensureTtyd(deploymentId: deployment.id)
            switch result {
            case .available(let port, _):
                currentPort = port
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

    func makeCoordinator() -> Coordinator {
        Coordinator(loadError: $loadError)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.navigationDelegate = context.coordinator
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            webView.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        @Binding var loadError: String?

        init(loadError: Binding<String?>) {
            _loadError = loadError
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            loadError = nil
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            loadError = error.localizedDescription
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            loadError = error.localizedDescription
        }
    }
}
