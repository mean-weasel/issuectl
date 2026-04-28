import SwiftUI

struct OnboardingView: View {
    @Environment(APIClient.self) private var api
    @State private var serverURL = ""
    @State private var apiToken = ""
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
                    TextField("https://issuectl.example.com", text: $serverURL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                }

                Section("API Token") {
                    SecureField("Paste your API token", text: $apiToken)
                        .textInputAutocapitalization(.never)

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
            url = "https://\(url)"
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
