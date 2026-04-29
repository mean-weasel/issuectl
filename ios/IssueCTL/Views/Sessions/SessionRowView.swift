import SwiftUI

struct SessionRowView: View {
    let deployment: ActiveDeployment
    var isEnding = false
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
                Text("#\(deployment.issueNumber)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 8)
                Text("Running")
                    .font(.caption2.weight(.bold))
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

            HStack(spacing: 8) {
                Button(action: onOpen) {
                    Label(deployment.ttydPort == nil ? "Preparing" : "Re-enter Terminal", systemImage: "terminal")
                        .font(.subheadline.weight(.bold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(IssueCTLColors.action)
                .disabled(deployment.ttydPort == nil)
                .accessibilityIdentifier("session-reenter-terminal-\(deployment.id)")

                Button(action: onControls) {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 36, height: 36)
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
                .stroke(Color.green.opacity(0.22), lineWidth: 1)
        }
    }

    private func sessionMetric(value: String, label: String, systemImage: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: systemImage)
                .font(.caption)
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
