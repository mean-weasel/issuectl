import SwiftUI

/// A reusable banner that shows when a network error occurs.
/// Displays the error message with a "Retry" button and auto-dismisses
/// after a successful retry or after a timeout.
///
/// Usage:
/// ```swift
/// @State private var networkError: String?
///
/// SomeView()
///     .overlay(alignment: .top) {
///         NetworkErrorBanner(
///             errorMessage: $networkError,
///             onRetry: { await fetchData() }
///         )
///     }
/// ```
struct NetworkErrorBanner: View {
    @Binding var errorMessage: String?
    let onRetry: (() async throws -> Void)?

    @State private var isRetrying = false
    @State private var dismissTask: Task<Void, Never>?

    private let autoDismissDelay: TimeInterval = 8.0

    var body: some View {
        if let message = errorMessage {
            HStack(spacing: 12) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.callout)
                    .foregroundStyle(.white)

                Text(message)
                    .font(.callout)
                    .foregroundStyle(.white)
                    .lineLimit(2)

                Spacer()

                if let onRetry {
                    Button {
                        Task {
                            isRetrying = true
                            defer { isRetrying = false }
                            do {
                                try await onRetry()
                                withAnimation(.easeOut(duration: 0.3)) {
                                    errorMessage = nil
                                }
                            } catch {
                                // Retry failed — update message with latest error, reset auto-dismiss
                                withAnimation(.easeOut(duration: 0.3)) {
                                    errorMessage = error.localizedDescription
                                }
                                scheduleAutoDismiss()
                            }
                        }
                    } label: {
                        if isRetrying {
                            ProgressView()
                                .tint(.white)
                                .controlSize(.small)
                        } else {
                            Text("Retry")
                                .font(.callout.weight(.semibold))
                                .foregroundStyle(.white)
                        }
                    }
                    .disabled(isRetrying)
                }

                Button {
                    withAnimation(.easeOut(duration: 0.3)) {
                        errorMessage = nil
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.8))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.red.opacity(0.9))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
            .padding(.horizontal, 12)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
            .onAppear {
                scheduleAutoDismiss()
            }
            .onDisappear {
                dismissTask?.cancel()
            }
        }
    }

    private func scheduleAutoDismiss() {
        dismissTask?.cancel()
        dismissTask = Task {
            try? await Task.sleep(for: .seconds(autoDismissDelay))
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.3)) {
                errorMessage = nil
            }
        }
    }
}

/// A persistent offline indicator that appears when the device has no network connectivity.
/// Intended to be placed at the root of the app's view hierarchy.
struct OfflineBanner: View {
    @Environment(NetworkMonitor.self) private var network

    var body: some View {
        if !network.isConnected {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash")
                    .font(.caption)
                Text("You are offline")
                    .font(.caption.weight(.medium))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color.secondary.opacity(0.85))
            .clipShape(Capsule())
            .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}
