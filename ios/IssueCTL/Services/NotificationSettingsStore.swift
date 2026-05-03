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
    private let tokenKey = "issuectl.apns-device-token"

    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined
    private(set) var deviceToken: String?
    private(set) var isSyncing = false
    private(set) var lastSyncError: String?
    private(set) var lastSyncedAt: Date?
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
        self.deviceToken = defaults.string(forKey: tokenKey)
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

    func updateDeviceToken(_ token: String) {
        deviceToken = token
        defaults.set(token, forKey: tokenKey)
        lastSyncError = nil
    }

    func updateRegistrationError(_ message: String) {
        lastSyncError = message
    }

    func syncRegistration(apiClient: APIClient) async {
        guard apiClient.isConfigured else { return }
        guard let deviceToken else { return }

        isSyncing = true
        lastSyncError = nil
        defer { isSyncing = false }

        await refreshAuthorizationStatus()
        let enabled = hasEnabledNotificationTypes && canReceiveNotifications

        do {
            if enabled {
                let body = PushDeviceRegistrationRequest(
                    platform: "ios",
                    token: deviceToken,
                    environment: apnsEnvironment,
                    enabled: true,
                    preferences: preferences
                )
                _ = try await apiClient.registerPushDevice(body: body)
            } else {
                try await apiClient.unregisterPushDevice(token: deviceToken)
            }
            lastSyncedAt = Date()
        } catch {
            lastSyncError = error.localizedDescription
        }
    }

    func registerForRemoteNotificationsIfAllowed() async {
        await refreshAuthorizationStatus()
        guard canReceiveNotifications else { return }
        UIApplication.shared.registerForRemoteNotifications()
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

    private var canReceiveNotifications: Bool {
        switch authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            true
        case .denied, .notDetermined:
            false
        @unknown default:
            false
        }
    }

    private var apnsEnvironment: String {
        #if DEBUG
        return "development"
        #else
        return "production"
        #endif
    }
}
