import SwiftUI

struct ErrorAutoDismissModifier: ViewModifier {
    @Binding var error: String?
    var delay: Duration = .seconds(5)

    @State private var dismissTask: Task<Void, Never>?

    func body(content: Content) -> some View {
        content
            .onChange(of: error) { _, newValue in
                dismissTask?.cancel()
                if newValue != nil {
                    dismissTask = Task {
                        try? await Task.sleep(for: delay)
                        if !Task.isCancelled {
                            error = nil
                        }
                    }
                }
            }
            .onDisappear {
                dismissTask?.cancel()
            }
    }
}

extension View {
    func autoDismissError(_ error: Binding<String?>, after delay: Duration = .seconds(5)) -> some View {
        modifier(ErrorAutoDismissModifier(error: error, delay: delay))
    }
}
