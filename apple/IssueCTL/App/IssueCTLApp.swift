import SwiftUI
import UIKit
import UserNotifications

extension Notification.Name {
    static let apnsDeviceTokenReceived = Notification.Name("issuectl.apnsDeviceTokenReceived")
    static let notificationResponseReceived = Notification.Name("issuectl.notificationResponseReceived")
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        NotificationCenter.default.post(
            name: .apnsDeviceTokenReceived,
            object: nil,
            userInfo: ["token": token]
        )
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        NotificationCenter.default.post(
            name: .apnsDeviceTokenReceived,
            object: nil,
            userInfo: ["error": error.localizedDescription]
        )
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        NotificationCenter.default.post(
            name: .notificationResponseReceived,
            object: nil,
            userInfo: response.notification.request.content.userInfo
        )
        completionHandler()
    }
}

@main
struct IssueCTLApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var apiClient: APIClient
    @State private var networkMonitor = NetworkMonitor()
    @State private var notificationSettings = NotificationSettingsStore()
    @State private var offlineSync: OfflineSyncService

    init() {
        PerformanceTrace.markAppLaunchStarted()
        let apiClient = APIClient()
        _apiClient = State(initialValue: apiClient)
        _offlineSync = State(initialValue: OfflineSyncService(client: apiClient))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(apiClient)
                .environment(networkMonitor)
                .environment(notificationSettings)
                .environment(offlineSync)
        }
    }
}
