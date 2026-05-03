import SwiftUI
import UserNotifications

struct NotificationSettingsView: View {
    @Environment(NotificationSettingsStore.self) private var notificationSettings
    @Environment(\.scenePhase) private var scenePhase
    @State private var isRequestingAuthorization = false

    var body: some View {
        Form {
            authorizationSection

            Section {
                Toggle(isOn: Binding(
                    get: { notificationSettings.preferences.idleTerminals },
                    set: { notificationSettings.setIdleTerminals($0) }
                )) {
                    Label("Idle Terminals", systemImage: "terminal")
                }
                .accessibilityIdentifier("notifications-idle-terminals-toggle")

                Toggle(isOn: Binding(
                    get: { notificationSettings.preferences.newIssues },
                    set: { notificationSettings.setNewIssues($0) }
                )) {
                    Label("New Issues", systemImage: "number")
                }
                .accessibilityIdentifier("notifications-new-issues-toggle")

                Toggle(isOn: Binding(
                    get: { notificationSettings.preferences.mergedPullRequests },
                    set: { notificationSettings.setMergedPullRequests($0) }
                )) {
                    Label("Merged Pull Requests", systemImage: "arrow.triangle.merge")
                }
                .accessibilityIdentifier("notifications-merged-prs-toggle")
            } header: {
                Text("Notify Me About")
            } footer: {
                Text("These preferences control which iOS push categories IssueCTL should register for when notifications are allowed.")
            }
        }
        .navigationTitle("Notifications")
        .task {
            await notificationSettings.refreshAuthorizationStatus()
        }
        .onChange(of: scenePhase) { _, newPhase in
            guard newPhase == .active else { return }
            Task { await notificationSettings.refreshAuthorizationStatus() }
        }
    }

    private var authorizationSection: some View {
        Section {
            HStack(spacing: 12) {
                Image(systemName: authorizationIcon)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(authorizationTint)
                    .frame(width: 32, height: 32)

                VStack(alignment: .leading, spacing: 3) {
                    Text(authorizationTitle)
                        .font(.subheadline.weight(.semibold))
                    Text(authorizationSubtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)

            if notificationSettings.authorizationStatus == .notDetermined {
                Button {
                    Task { await requestAuthorization() }
                } label: {
                    HStack {
                        Text(isRequestingAuthorization ? "Requesting..." : "Enable Notifications")
                        Spacer()
                        if isRequestingAuthorization {
                            ProgressView()
                                .controlSize(.small)
                        }
                    }
                }
                .disabled(isRequestingAuthorization)
                .accessibilityIdentifier("notifications-enable-button")
            }
        }
    }

    private var authorizationTitle: String {
        switch notificationSettings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            "Notifications Enabled"
        case .denied:
            "Notifications Disabled"
        case .notDetermined:
            "Permission Needed"
        @unknown default:
            "Notification Status Unknown"
        }
    }

    private var authorizationSubtitle: String {
        switch notificationSettings.authorizationStatus {
        case .authorized:
            "IssueCTL can deliver push alerts for enabled categories."
        case .provisional, .ephemeral:
            "IssueCTL can deliver quiet notification alerts."
        case .denied:
            "Enable notifications in iOS Settings to receive alerts."
        case .notDetermined:
            "Allow notifications before server-driven alerts can appear here."
        @unknown default:
            "Open iOS Settings if alerts do not arrive."
        }
    }

    private var authorizationIcon: String {
        switch notificationSettings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            "bell.badge.fill"
        case .denied:
            "bell.slash.fill"
        case .notDetermined:
            "bell"
        @unknown default:
            "bell"
        }
    }

    private var authorizationTint: Color {
        switch notificationSettings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            .green
        case .denied:
            .red
        case .notDetermined:
            IssueCTLColors.action
        @unknown default:
            .secondary
        }
    }

    private func requestAuthorization() async {
        isRequestingAuthorization = true
        _ = await notificationSettings.requestAuthorization()
        isRequestingAuthorization = false
    }
}
