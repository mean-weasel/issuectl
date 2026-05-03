import SwiftUI

struct OnboardingView: View {
    @Environment(APIClient.self) private var api
    @State private var serverURL = ""
    @State private var apiToken = ""
    @State private var showToken = false
    @State private var isChecking = false
    @State private var errorMessage: String?
    @State private var showConnectionHelp = false

    private var trimmedServerURL: String {
        serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedAPIToken: String {
        apiToken.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canConnect: Bool {
        !trimmedServerURL.isEmpty && !trimmedAPIToken.isEmpty && !isChecking
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    ConnectionStatusPanel(
                        hasServerURL: !trimmedServerURL.isEmpty,
                        hasToken: !trimmedAPIToken.isEmpty,
                        isChecking: isChecking,
                        errorMessage: errorMessage
                    )

                    VStack(alignment: .leading, spacing: 12) {
                        SetupFieldContainer(title: "Server URL", systemImage: "network") {
                            TextField("http://192.168.1.x:3847", text: $serverURL)
                                .textContentType(.URL)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.URL)
                                .autocorrectionDisabled()
                                .accessibilityLabel("Server URL")
                        }

                        SetupFieldContainer(title: "API Token", systemImage: "key") {
                            HStack(spacing: 8) {
                                APITokenField(
                                    placeholder: "Paste your API token",
                                    text: $apiToken,
                                    isMasked: !showToken
                                )
                                .accessibilityLabel("API Token")
                                .accessibilityIdentifier("onboarding-api-token-field")
                                Button {
                                    showToken.toggle()
                                } label: {
                                    Image(systemName: showToken ? "eye.slash" : "eye")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundStyle(.secondary)
                                        .frame(width: 34, height: 34)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(showToken ? "Hide API token" : "Show API token")
                            }
                            .accessibilityElement(children: .contain)
                        }

                        Button {
                            Task { await connect() }
                        } label: {
                            HStack {
                                if isChecking {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Image(systemName: "arrow.right.circle.fill")
                                }
                                Text(isChecking ? "Checking" : "Connect")
                            }
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .frame(height: 48)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(IssueCTLColors.action)
                        .disabled(!canConnect)
                        .accessibilityIdentifier("onboarding-connect-button")
                    }
                    .padding(14)
                    .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
                    .overlay {
                        RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                            .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
                    }

                    DisclosureGroup(isExpanded: $showConnectionHelp) {
                        VStack(alignment: .leading, spacing: 8) {
                            HelpRow(
                                systemImage: "macbook.and.iphone",
                                text: "Run issuectl web on your Mac and keep it open."
                            )
                            HelpRow(
                                systemImage: "wifi",
                                text: "Use the iOS server URL. On a real iPhone, prefer your Mac's Wi-Fi IP address."
                            )
                            HelpRow(
                                systemImage: "link",
                                text: "Setup links can fill both fields when opened on this device."
                            )
                        }
                        .padding(.top, 10)
                    } label: {
                        Label("Connection help", systemImage: "info.circle")
                            .font(.subheadline.weight(.semibold))
                    }
                    .padding(14)
                    .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
                    .overlay {
                        RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                            .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
                    }
                }
                .padding()
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Setup")
        }
    }

    private func connect() async {
        isChecking = true
        errorMessage = nil

        var url = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if url.hasSuffix("/") { url.removeLast() }
        if !url.hasPrefix("http://") && !url.hasPrefix("https://") {
            url = "http://\(url)"
        }

        // Validate URL structure: must have a valid scheme (http/https) and host
        guard let parsed = URL(string: url),
              let scheme = parsed.scheme,
              (scheme == "http" || scheme == "https"),
              parsed.host != nil else {
            errorMessage = "Enter a valid URL (e.g. http://192.168.1.10:3847)"
            isChecking = false
            return
        }

        if isLocalhost(parsed.host) {
            errorMessage = "Use your Mac's Wi-Fi IP address, not localhost, when running on a physical iPhone."
            isChecking = false
            return
        }

        let token = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let health = try await api.checkHealth(url: url, token: token)
            if !health.ok {
                throw APIError.serverError(0, "Server reported unhealthy status")
            }
            // Success — persist and switch to main UI
            try api.configure(url: url, token: token)
        } catch {
            errorMessage = onboardingErrorMessage(for: error, serverURL: url)
        }

        isChecking = false
    }
}

private struct ConnectionStatusPanel: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let hasServerURL: Bool
    let hasToken: Bool
    let isChecking: Bool
    let errorMessage: String?

    private var statusTitle: String {
        if isChecking { return "Checking connection" }
        if errorMessage != nil { return "Connection needs attention" }
        if hasServerURL && hasToken { return "Ready to connect" }
        return "Connect to desktop"
    }

    private var statusSubtitle: String {
        if isChecking { return "Verifying the server URL and token." }
        if let errorMessage { return errorMessage }
        if hasServerURL && hasToken { return "Server URL and token are ready." }
        return "Enter the URL and token shown by issuectl web."
    }

    private var statusIcon: String {
        if isChecking { return "arrow.triangle.2.circlepath" }
        if errorMessage != nil { return "exclamationmark.triangle.fill" }
        if hasServerURL && hasToken { return "checkmark.circle.fill" }
        return "iphone.and.arrow.forward"
    }

    private var statusColor: Color {
        if errorMessage != nil { return .red }
        if hasServerURL && hasToken { return .green }
        return IssueCTLColors.action
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Image(systemName: statusIcon)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(statusColor)

                if isChecking {
                    ProgressView()
                        .controlSize(.small)
                        .opacity(0.001)
                }
            }
            .frame(width: 42, height: 42)
            .background(statusColor.opacity(0.12), in: RoundedRectangle(cornerRadius: IssueCTLColors.controlCornerRadius))

            VStack(alignment: .leading, spacing: 8) {
                Text(statusTitle)
                    .font(.headline)
                Text(statusSubtitle)
                    .font(.subheadline)
                    .foregroundStyle(errorMessage == nil ? Color.secondary : Color.red)
                    .fixedSize(horizontal: false, vertical: true)

                Group {
                    if dynamicTypeSize.isAccessibilitySize {
                        VStack(alignment: .leading, spacing: 8) {
                            SetupStatusPill(title: "URL", isComplete: hasServerURL)
                            SetupStatusPill(title: "Token", isComplete: hasToken)
                        }
                    } else {
                        HStack(spacing: 8) {
                            SetupStatusPill(title: "URL", isComplete: hasServerURL)
                            SetupStatusPill(title: "Token", isComplete: hasToken)
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
        }
        .accessibilityElement(children: .contain)
    }
}

private struct SetupStatusPill: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let title: String
    let isComplete: Bool

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: isComplete ? "checkmark.circle.fill" : "circle")
                .font(.caption.weight(.semibold))
                .foregroundStyle(isComplete ? .green : .secondary)
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(isComplete ? .primary : .secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.secondary.opacity(0.12), in: Capsule())
        .frame(minWidth: dynamicTypeSize.isAccessibilitySize ? 116 : nil, alignment: .leading)
    }
}

private struct SetupFieldContainer<Content: View>: View {
    let title: String
    let systemImage: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            content
                .padding(.horizontal, 12)
                .frame(minHeight: 46)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: IssueCTLColors.controlCornerRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: IssueCTLColors.controlCornerRadius)
                        .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
                }
        }
    }
}

private struct HelpRow: View {
    let systemImage: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 18)
            Text(text)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

func isLocalhost(_ host: String?) -> Bool {
    guard let host = host?.lowercased() else { return false }
    return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func onboardingErrorMessage(for error: Error, serverURL: String) -> String {
    if let apiError = error as? APIError {
        switch apiError {
        case .unauthorized:
            return "Invalid or stale API token. Copy the iOS API token from `issuectl web` and try again."
        case .notConfigured:
            return "Server URL not configured."
        case .invalidPath, .invalidResponse:
            return "The server responded in an unexpected format. Check that this URL points to issuectl."
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message)"
        }
    }

    let nsError = error as NSError
    if nsError.domain == NSURLErrorDomain {
        switch nsError.code {
        case NSURLErrorCannotConnectToHost,
             NSURLErrorCannotFindHost,
             NSURLErrorTimedOut,
             NSURLErrorNetworkConnectionLost,
             NSURLErrorNotConnectedToInternet:
            return "Could not reach \(serverURL). Make sure issuectl web is running, both devices are on the same network, and Local Network access is allowed."
        case NSURLErrorAppTransportSecurityRequiresSecureConnection:
            return "iOS blocked this connection. Rebuild the app with local-network access enabled or use an HTTPS server URL."
        default:
            break
        }
    }

    return error.localizedDescription
}

private struct APITokenField: UIViewRepresentable {
    let placeholder: String
    @Binding var text: String
    let isMasked: Bool

    func makeUIView(context: Context) -> UITextField {
        let textField = UITextField()
        textField.placeholder = placeholder
        textField.delegate = context.coordinator
        textField.text = displayText
        textField.textContentType = nil
        textField.autocorrectionType = .no
        textField.autocapitalizationType = .none
        textField.keyboardType = .asciiCapable
        return textField
    }

    func updateUIView(_ uiView: UITextField, context: Context) {
        context.coordinator.text = $text
        context.coordinator.isMasked = isMasked

        if uiView.text != displayText {
            uiView.text = displayText
        }

        uiView.textContentType = nil
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(text: $text, isMasked: isMasked)
    }

    private var displayText: String {
        isMasked ? String(repeating: "•", count: text.count) : text
    }

    @MainActor
    final class Coordinator: NSObject, UITextFieldDelegate {
        var text: Binding<String>
        var isMasked: Bool

        init(text: Binding<String>, isMasked: Bool) {
            self.text = text
            self.isMasked = isMasked
        }

        func textField(
            _ textField: UITextField,
            shouldChangeCharactersIn range: NSRange,
            replacementString string: String
        ) -> Bool {
            guard let swiftRange = Range(range, in: text.wrappedValue) else {
                return false
            }

            text.wrappedValue.replaceSubrange(swiftRange, with: string)
            textField.text = isMasked
                ? String(repeating: "•", count: text.wrappedValue.count)
                : text.wrappedValue

            if let end = textField.endOfDocument as UITextPosition? {
                textField.selectedTextRange = textField.textRange(from: end, to: end)
            }

            return false
        }
    }
}
