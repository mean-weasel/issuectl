import SwiftUI

struct OnboardingView: View {
    @Environment(APIClient.self) private var api
    @State private var serverURL = ""
    @State private var apiToken = ""
    @State private var showToken = false
    @State private var isChecking = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Connect to your issuectl server running on your Mac.")
                        .foregroundStyle(.secondary)
                }

                Section("Server URL") {
                    TextField("http://192.168.1.x:3847", text: $serverURL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                }

                Section("API Token") {
                    HStack {
                        if showToken {
                            TextField("Paste your API token", text: $apiToken)
                                .textInputAutocapitalization(.never)
                        } else {
                            SecureField("Paste your API token", text: $apiToken)
                                .textInputAutocapitalization(.never)
                        }
                        Button {
                            showToken.toggle()
                        } label: {
                            Image(systemName: showToken ? "eye.slash" : "eye")
                                .foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                    }

                    Text("Run `issuectl init` on your Mac to generate a token.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button {
                        Task { await connect() }
                    } label: {
                        if isChecking {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Text("Connect")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(serverURL.isEmpty || apiToken.isEmpty || isChecking)
                }
            }
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

        let token = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)

        do {
            let health = try await api.checkHealth(url: url, token: token)
            if !health.ok {
                throw APIError.serverError(0, "Server reported unhealthy status")
            }
            // Success — persist and switch to main UI
            try api.configure(url: url, token: token)
        } catch {
            errorMessage = error.localizedDescription
        }

        isChecking = false
    }
}
