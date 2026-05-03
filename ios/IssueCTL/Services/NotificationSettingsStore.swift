import Foundation
import UIKit
@preconcurrency import UserNotifications

struct NotificationPreferences: Codable, Equatable, Sendable {
    var idleTerminals: Bool
    var newIssues: Bool
    var mergedPullRequests: Bool

    static let defaults = NotificationPreferences(
        idleTerminals: true,
        newIssues: true,
        mergedPullRequests: true
    )
}

@Observable @MainActor
final class NotificationSettingsStore {
    private let defaults: UserDefaults
    private let defaultsKey = "issuectl.notification-preferences"

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    var preferences: NotificationPreferences {
        didSet {
            savePreferences()
        }
    }

    var hasEnabledNotificationTypes: Bool {
        preferences.idleTerminals || preferences.newIssues || preferences.mergedPullRequests
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let data = defaults.data(forKey: defaultsKey),
           let decoded = try? JSONDecoder().decode(NotificationPreferences.self, from: data) {
            self.preferences = decoded
        } else {
            self.preferences = .defaults
        }
    }

    func refreshAuthorizationStatus() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        authorizationStatus = settings.authorizationStatus
    }

    func requestAuthorization() async -> Bool {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
            await refreshAuthorizationStatus()
            if granted {
                UIApplication.shared.registerForRemoteNotifications()
            }
            return granted
        } catch {
            await refreshAuthorizationStatus()
            return false
        }
    }

    func setIdleTerminals(_ isEnabled: Bool) {
        preferences.idleTerminals = isEnabled
    }

    func setNewIssues(_ isEnabled: Bool) {
        preferences.newIssues = isEnabled
    }

    func setMergedPullRequests(_ isEnabled: Bool) {
        preferences.mergedPullRequests = isEnabled
    }

    private func savePreferences() {
        guard let data = try? JSONEncoder().encode(preferences) else { return }
        defaults.set(data, forKey: defaultsKey)
    }
}
