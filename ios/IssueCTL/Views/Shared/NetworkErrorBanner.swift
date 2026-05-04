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

/// Compact offline queue status surface for root overlays or Settings sections.
///
/// The component is intentionally store-agnostic: pass counts and actions from the
/// owning view instead of binding it to the concrete queue implementation.
struct OfflineQueueBanner: View {
    let pendingCount: Int
    let failedCount: Int
    let isSyncing: Bool
    let onSync: (() async -> Void)?
    let onDismissFailed: (() -> Void)?

    @State private var isSyncRequested = false

    init(
        pendingCount: Int,
        failedCount: Int,
        isSyncing: Bool,
        onSync: (() async -> Void)? = nil,
        onDismissFailed: (() -> Void)? = nil
    ) {
        self.pendingCount = max(0, pendingCount)
        self.failedCount = max(0, failedCount)
        self.isSyncing = isSyncing
        self.onSync = onSync
        self.onDismissFailed = onDismissFailed
    }

    var body: some View {
        if shouldShow {
            HStack(alignment: .center, spacing: 12) {
                statusIcon

                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.callout.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)

                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                .layoutPriority(1)

                Spacer(minLength: 4)

                actionGroup
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 12))
            .overlay {
                RoundedRectangle(cornerRadius: 12)
                    .stroke(borderColor, lineWidth: 0.75)
            }
            .shadow(color: .black.opacity(0.12), radius: 6, y: 3)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(accessibilityLabel)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private var actionGroup: some View {
        HStack(spacing: 6) {
            if isBusy {
                ProgressView()
                    .controlSize(.small)
                    .tint(statusTint)
                    .frame(width: 32, height: 32)
                    .accessibilityLabel("Syncing offline actions")
            } else if let onSync {
                Button {
                    Task {
                        isSyncRequested = true
                        await onSync()
                        isSyncRequested = false
                    }
                } label: {
                    Image(systemName: "arrow.clockwise")
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .tint(statusTint)
                .accessibilityLabel("Sync offline actions")
            }

            if failedCount > 0, let onDismissFailed {
                Button(role: .destructive) {
                    onDismissFailed()
                } label: {
                    Image(systemName: "xmark")
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .accessibilityLabel("Dismiss failed offline actions")
            }
        }
    }

    private var statusIcon: some View {
        Image(systemName: statusSymbol)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(statusTint)
            .frame(width: 34, height: 34)
            .background(statusTint.opacity(0.12), in: RoundedRectangle(cornerRadius: 10))
    }

    private var shouldShow: Bool {
        pendingCount > 0 || failedCount > 0 || isSyncing
    }

    private var isBusy: Bool {
        isSyncing || isSyncRequested
    }

    private var title: String {
        if failedCount > 0 {
            return failedCount == 1 ? "Offline action failed" : "Offline actions failed"
        }
        if isBusy {
            return "Syncing offline actions"
        }
        return pendingCount == 1 ? "Offline action pending" : "Offline actions pending"
    }

    private var detail: String {
        var parts: [String] = []
        if pendingCount > 0 {
            parts.append("\(pendingCount) pending")
        }
        if failedCount > 0 {
            parts.append("\(failedCount) failed")
        }
        if parts.isEmpty {
            return "Queued changes are being sent."
        }
        return parts.joined(separator: " / ")
    }

    private var statusSymbol: String {
        if failedCount > 0 { return "exclamationmark.triangle.fill" }
        if isBusy { return "arrow.triangle.2.circlepath" }
        return "tray.and.arrow.up.fill"
    }

    private var statusTint: Color {
        failedCount > 0 ? .orange : IssueCTLColors.action
    }

    private var borderColor: Color {
        failedCount > 0 ? Color.orange.opacity(0.45) : IssueCTLColors.hairline
    }

    private var accessibilityLabel: String {
        "\(title), \(detail)"
    }
}

#Preview("Offline Queue Pending") {
    VStack(spacing: 12) {
        OfflineQueueBanner(
            pendingCount: 3,
            failedCount: 0,
            isSyncing: false,
            onSync: {}
        )

        OfflineQueueBanner(
            pendingCount: 1,
            failedCount: 2,
            isSyncing: false,
            onSync: {},
            onDismissFailed: {}
        )

        OfflineQueueBanner(
            pendingCount: 0,
            failedCount: 0,
            isSyncing: true
        )
    }
    .padding()
    .background(IssueCTLColors.appBackground)
}
