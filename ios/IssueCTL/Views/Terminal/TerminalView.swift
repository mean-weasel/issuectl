import SwiftUI
import WebKit

struct TerminalView: View {
    @Environment(APIClient.self) private var api
    let deployment: ActiveDeployment
    let port: Int
    let onEnd: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showEndConfirm = false

    var body: some View {
        NavigationStack {
            Group {
                if let url = terminalURL {
                    TerminalWebView(url: url)
                        .ignoresSafeArea(edges: .bottom)
                } else {
                    ContentUnavailableView(
                        "Invalid Server URL",
                        systemImage: "exclamationmark.triangle",
                        description: Text("Could not connect to \(api.serverURL)")
                    )
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
        URL(string: "\(api.serverURL)/api/terminal/\(port)/")
    }
}

struct TerminalWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if webView.url != url {
            webView.load(URLRequest(url: url))
        }
    }
}
