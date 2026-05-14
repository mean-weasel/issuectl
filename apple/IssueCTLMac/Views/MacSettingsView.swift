import AppKit
import SwiftUI

struct MacSettingsView: View {
    @Environment(APIClient.self) private var api
    @Environment(MacSidebarPreferences.self) private var preferences
    @Environment(SpaceSidebarCoordinator.self) private var sidebarCoordinator
    @Environment(\.resetSidebarLayout) private var resetSidebarLayout
    @State private var isUpdatingLaunchAtLogin = false

    var body: some View {
        Form {
            Section("Connection") {
                Text(api.serverURL.isEmpty ? "Not configured" : api.serverURL)
                Text(api.apiToken.isEmpty ? "No API token saved" : "API token saved")
                    .foregroundStyle(.secondary)
            }

            Section("Mac Sidebar") {
                Toggle("Launch at Login", isOn: launchAtLoginBinding)
                    .disabled(isUpdatingLaunchAtLogin)

                if isUpdatingLaunchAtLogin {
                    ProgressView()
                        .controlSize(.small)
                }

                if let error = preferences.launchAtLoginError {
                    Text(error)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Text Size")
                        Spacer()
                        Text("\(Int(preferences.textScale * 100))%")
                            .foregroundStyle(.secondary)
                    }

                    Slider(
                        value: textScaleBinding,
                        in: MacSidebarPreferences.minimumTextScale...MacSidebarPreferences.maximumTextScale,
                        step: 0.05
                    )

                    HStack {
                        Text("Smaller")
                        Spacer()
                        Text("Larger")
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }

            Section("Repositories") {
                Text("Tracked repositories are managed in web settings.")
                    .foregroundStyle(.secondary)

                Button("Open Web Settings") {
                    openWebSettings()
                }
            }

            Section("Learned Desktops") {
                if sidebarCoordinator.spaceStates.isEmpty {
                    Text("No desktops learned yet")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sidebarCoordinator.spaceStates, id: \.id) { spaceState in
                        spaceSettingsRow(spaceState)
                    }
                }

                Button("Reset All Desktop Sidebar Layouts") {
                    resetSidebarLayout()
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .frame(minHeight: 560)
        .padding()
        .accessibilityIdentifier("mac-settings-view")
        .task {
            preferences.refreshLaunchAtLoginStatus()
        }
    }

    private var launchAtLoginBinding: Binding<Bool> {
        Binding(
            get: { preferences.launchAtLogin },
            set: { newValue in
                isUpdatingLaunchAtLogin = true
                Task {
                    await preferences.setLaunchAtLogin(newValue)
                    isUpdatingLaunchAtLogin = false
                }
            }
        )
    }

    private var textScaleBinding: Binding<Double> {
        Binding(
            get: { preferences.textScale },
            set: { preferences.textScale = MacSidebarPreferences.clampedTextScale($0) }
        )
    }

    private func openWebSettings() {
        let baseURL = api.serverURL.isEmpty ? "http://localhost:3847" : api.serverURL
        let trimmedBaseURL = baseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: "\(trimmedBaseURL)/settings") else { return }
        NSWorkspace.shared.open(url)
    }

    private func spaceSettingsRow(_ spaceState: MacSidebarSpaceState) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(spaceState.title)
                        .font(.headline)
                    Text(spaceState.id == sidebarCoordinator.currentSpaceState?.id ? "Current desktop" : "Learned desktop")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(spaceState.chrome.isVisible ? "Visible" : "Hidden")
                    .foregroundStyle(.secondary)
            }

            Toggle("Open Collapsed", isOn: Binding(
                get: { spaceState.preferences.isCollapsed },
                set: { newValue in
                    spaceState.preferences.isCollapsed = newValue
                    if spaceState.chrome.isCollapsed != newValue {
                        sidebarCoordinator.toggleCollapsed(spaceKey: spaceState.id)
                    }
                }
            ))

            HStack {
                Text("Saved Width")
                Spacer()
                Text("\(Int(spaceState.preferences.expandedWidth)) px")
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button(spaceState.chrome.isVisible ? "Hide" : "Show") {
                    sidebarCoordinator.toggleVisibility(spaceKey: spaceState.id)
                }
                Button(spaceState.chrome.isCollapsed ? "Expand" : "Collapse") {
                    sidebarCoordinator.toggleCollapsed(spaceKey: spaceState.id)
                }
                Button("Reset") {
                    sidebarCoordinator.resetLayout(spaceKey: spaceState.id)
                }
            }
        }
        .padding(.vertical, 6)
    }
}
