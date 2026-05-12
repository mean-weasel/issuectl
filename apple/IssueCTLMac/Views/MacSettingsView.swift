import SwiftUI

struct MacSettingsView: View {
    @Environment(APIClient.self) private var api

    var body: some View {
        Form {
            Section("Connection") {
                Text(api.serverURL.isEmpty ? "Not configured" : api.serverURL)
                Text(api.apiToken.isEmpty ? "No API token saved" : "API token saved")
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .frame(width: 420)
        .padding()
    }
}
