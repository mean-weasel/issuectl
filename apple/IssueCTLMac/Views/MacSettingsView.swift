import SwiftUI

struct MacSettingsView: View {
    @Environment(APIClient.self) private var api
    @Environment(MacSidebarPreferences.self) private var preferences
    @Environment(DisplaySidebarCoordinator.self) private var sidebarCoordinator
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

            Section("Displays") {
                if sidebarCoordinator.displayStates.isEmpty {
                    Text("No connected displays detected")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(sidebarCoordinator.displayStates, id: \.id) { displayState in
                        displaySettingsRow(displayState)
                    }
                }

                Button("Reset All Sidebar Layouts") {
                    resetSidebarLayout()
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 420)
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

    private func displaySettingsRow(_ displayState: MacSidebarDisplayState) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(displayState.descriptor.name)
                        .font(.headline)
                    Text(displayState.descriptor.isMain ? "Main display" : "Secondary display")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(displayState.chrome.isVisible ? "Visible" : "Hidden")
                    .foregroundStyle(.secondary)
            }

            Toggle("Open Collapsed", isOn: Binding(
                get: { displayState.preferences.isCollapsed },
                set: { newValue in
                    displayState.preferences.isCollapsed = newValue
                    if displayState.chrome.isCollapsed != newValue {
                        sidebarCoordinator.toggleCollapsed(displayKey: displayState.id)
                    }
                }
            ))

            HStack {
                Text("Saved Width")
                Spacer()
                Text("\(Int(displayState.preferences.expandedWidth)) px")
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button(displayState.chrome.isVisible ? "Hide" : "Show") {
                    sidebarCoordinator.toggleVisibility(displayKey: displayState.id)
                }
                Button(displayState.chrome.isCollapsed ? "Expand" : "Collapse") {
                    sidebarCoordinator.toggleCollapsed(displayKey: displayState.id)
                }
                Button("Reset") {
                    sidebarCoordinator.resetLayout(displayKey: displayState.id)
                }
            }
        }
        .padding(.vertical, 6)
    }
}
