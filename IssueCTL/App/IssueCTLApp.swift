import SwiftUI
import SwiftData

@main
struct IssueCTLApp: App {
    @State private var apiClient = APIClient()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(apiClient)
        }
    }
}
