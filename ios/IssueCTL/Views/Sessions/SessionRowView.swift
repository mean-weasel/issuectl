import SwiftUI

struct SessionRowView: View {
    let deployment: ActiveDeployment
    var preview: SessionPreview?
    var isPreviewExpanded = false
    var isEnding = false
    var onTogglePreview: () -> Void = {}
    var onOpen: () -> Void = {}
    var onControls: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Circle()
                    .fill(.green)
                    .frame(width: 8, height: 8)
                Text(deployment.repoFullName)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                Text("#\(deployment.issueNumber)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Text("Running")
                    .font(.caption.bold())
                    .foregroundStyle(.green)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.green.opacity(0.14), in: Capsule())
            }

            Label(deployment.branchName, systemImage: "arrow.triangle.branch")
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .lineLimit(1)

            HStack(spacing: 10) {
                sessionMetric(value: deployment.runningDuration, label: "Duration", systemImage: "clock")

                if let port = deployment.ttydPort {
                    sessionMetric(value: "\(port)", label: "Terminal", systemImage: "terminal")
                } else {
                    sessionMetric(value: "Starting", label: "Terminal", systemImage: "terminal")
                }
            }

            SessionPreviewBlock(
                preview: preview,
                isExpanded: isPreviewExpanded,
                isTerminalReady: deployment.ttydPort != nil,
                accessibilityIdentifier: "session-preview-\(deployment.id)",
                onToggle: onTogglePreview
            )

            HStack(spacing: 8) {
                Button(action: onOpen) {
                    Label(deployment.ttydPort == nil ? "Starting..." : "Open Terminal", systemImage: "terminal")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(IssueCTLColors.action.opacity(deployment.ttydPort == nil ? 0.45 : 1), in: RoundedRectangle(cornerRadius: 12))
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(deployment.ttydPort == nil || isEnding)
                .accessibilityLabel(deployment.ttydPort == nil ? "Starting" : "Open Terminal")
                .accessibilityIdentifier("session-reenter-terminal-\(deployment.id)")

                Button(action: onControls) {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 44, height: 40)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.bordered)
                .disabled(isEnding)
                .accessibilityLabel("Session controls")
                .accessibilityIdentifier("session-controls-\(deployment.id)")
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(previewBorderColor.opacity(0.34), lineWidth: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if deployment.ttydPort != nil {
                onOpen()
            }
        }
    }

    private var previewBorderColor: Color {
        switch preview?.status {
        case .active:
            Color.green
        case .idle:
            Color.orange
        case .error:
            Color.red
        case .unavailable:
            Color.secondary
        case nil:
            Color.green
        }
    }

    private func sessionMetric(value: String, label: String, systemImage: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: systemImage)
                .font(.caption)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.subheadline.bold())
                    .lineLimit(1)
                Text(label)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

private struct SessionPreviewBlock: View {
    let preview: SessionPreview?
    let isExpanded: Bool
    let isTerminalReady: Bool
    let accessibilityIdentifier: String
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Circle()
                        .fill(statusColor)
                        .frame(width: 8, height: 8)

                    Text(statusBadgeText)
                        .font(.caption2.bold())
                        .foregroundStyle(statusColor)
                        .lineLimit(1)

                    Text(summaryText)
                        .font(.caption.monospaced())
                        .foregroundStyle(summaryColor)
                        .lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    Text(freshnessText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }

                if isExpanded {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(expandedLines.indices, id: \.self) { index in
                            Text(expandedLines[index])
                                .font(.caption2.monospaced())
                                .foregroundStyle(lineColor(expandedLines[index]))
                                .lineLimit(1)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.black.opacity(0.88), in: RoundedRectangle(cornerRadius: 10))
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .padding(10)
            .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .disabled(!isTerminalReady)
        .accessibilityLabel("Session preview")
        .accessibilityValue("\(statusAccessibilityText), \(summaryText)")
        .accessibilityHint(isExpanded ? "Collapses terminal preview" : "Expands terminal preview")
        .accessibilityIdentifier(accessibilityIdentifier)
    }

    private var expandedLines: [String] {
        let lines = preview?.lines ?? []
        if lines.isEmpty {
            return [summaryText]
        }
        return Array(lines.suffix(6))
    }

    private var summaryText: String {
        guard isTerminalReady else { return "Terminal starting" }
        guard let preview else { return "Waiting for preview" }
        if let latestLine = preview.latestLine, !latestLine.isEmpty {
            return latestLine
        }
        switch preview.status {
        case .active:
            return "Session active"
        case .idle:
            return "No recent output"
        case .error:
            return "Review terminal output"
        case .unavailable:
            return "Preview unavailable"
        }
    }

    private var freshnessText: String {
        guard let preview else { return "" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: preview.lastUpdatedDate, relativeTo: Date())
    }

    private var statusColor: Color {
        switch preview?.status {
        case .active:
            Color.green
        case .idle:
            Color.orange
        case .error:
            Color.red
        case .unavailable:
            Color.secondary
        case nil:
            isTerminalReady ? Color.secondary : Color.orange
        }
    }

    private var statusAccessibilityText: String {
        guard isTerminalReady else { return "terminal starting" }
        return preview?.status.accessibilityName ?? "waiting for preview"
    }

    private var statusBadgeText: String {
        guard isTerminalReady else { return "Starting" }
        return preview?.status.displayName ?? "Preview"
    }

    private var summaryColor: Color {
        preview?.status == .error ? .red : .secondary
    }

    private func lineColor(_ line: String) -> Color {
        let lowercased = line.lowercased()
        if lowercased.contains("error") || lowercased.contains("failed") || lowercased.contains("fatal") {
            return .red
        }
        if lowercased.contains("pass") || lowercased.contains("success") {
            return .green
        }
        if lowercased.contains("warn") {
            return .yellow
        }
        return .white.opacity(0.92)
    }
}
