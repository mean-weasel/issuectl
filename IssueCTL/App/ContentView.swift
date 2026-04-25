import SwiftUI

struct ContentView: View {
    @Environment(APIClient.self) private var api

    var body: some View {
        if api.isConfigured {
            TabView {
                Tab("Issues", systemImage: "list.bullet") {
                    RepoListView()
                }
                Tab("PRs", systemImage: "arrow.triangle.merge") {
                    Text("Pull Requests")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                Tab("Active", systemImage: "play.circle") {
                    Text("Active Sessions")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                }
                Tab("Settings", systemImage: "gearshape") {
                    SettingsView()
                }
            }
        } else {
            OnboardingView()
        }
    }
}
