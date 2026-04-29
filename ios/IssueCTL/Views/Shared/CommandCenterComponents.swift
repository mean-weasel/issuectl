import SwiftUI

enum IssueCTLColors {
    static let action = Color(hex: "e87125") ?? .orange
}

struct AppTopBar<Trailing: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.title2.weight(.bold))
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }
}

struct IconChromeButton: View {
    let systemName: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .medium))
                .frame(width: 36, height: 36)
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(systemName)
    }
}

struct StatusMetricCard: View {
    let value: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 5) {
                Text(value)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.primary)
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, minHeight: 72, alignment: .leading)
            .padding(10)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }
}

struct AttentionRow: View {
    let color: Color
    let kicker: String
    let title: String
    let chips: [AttentionChip]
    var isAttention = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(alignment: .center, spacing: 10) {
                RoundedRectangle(cornerRadius: 4)
                    .fill(color)
                    .frame(width: 8, height: 42)

                VStack(alignment: .leading, spacing: 6) {
                    Text(kicker)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    HStack(spacing: 6) {
                        ForEach(chips) { chip in
                            Text(chip.title)
                                .font(.caption2.weight(.medium))
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .foregroundStyle(chip.foreground)
                                .background(chip.background, in: Capsule())
                        }
                    }
                }

                Spacer(minLength: 6)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 18)
                    .fill(Color(.secondarySystemGroupedBackground))
                    .overlay {
                        RoundedRectangle(cornerRadius: 18)
                            .stroke(isAttention ? IssueCTLColors.action.opacity(0.55) : Color.clear, lineWidth: 1)
                    }
            )
        }
        .buttonStyle(.plain)
    }
}

struct AttentionChip: Identifiable {
    let id = UUID()
    let title: String
    let foreground: Color
    let background: Color

    static func neutral(_ title: String) -> AttentionChip {
        AttentionChip(title: title, foreground: .secondary, background: Color.secondary.opacity(0.12))
    }

    static func green(_ title: String) -> AttentionChip {
        AttentionChip(title: title, foreground: .green, background: Color.green.opacity(0.14))
    }

    static func red(_ title: String) -> AttentionChip {
        AttentionChip(title: title, foreground: .red, background: Color.red.opacity(0.14))
    }

    static func blue(_ title: String) -> AttentionChip {
        AttentionChip(title: title, foreground: .blue, background: Color.blue.opacity(0.14))
    }

    static func orange(_ title: String) -> AttentionChip {
        AttentionChip(title: title, foreground: IssueCTLColors.action, background: IssueCTLColors.action.opacity(0.14))
    }
}

struct SessionDock: View {
    let deployments: [ActiveDeployment]
    let action: () -> Void

    var body: some View {
        if !deployments.isEmpty {
            HStack(spacing: 10) {
                Circle()
                    .fill(.green)
                    .frame(width: 8, height: 8)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(deployments.count) session\(deployments.count == 1 ? "" : "s") running")
                        .font(.caption.weight(.semibold))
                    Text(summary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Button("Resume", action: action)
                    .font(.caption.weight(.bold))
                    .buttonStyle(.borderedProminent)
                    .tint(IssueCTLColors.action)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.green.opacity(0.28), lineWidth: 1)
            }
            .padding(.horizontal, 14)
        }
    }

    private var summary: String {
        deployments.prefix(2).map { "#\($0.issueNumber) \($0.runningDuration)" }.joined(separator: " - ")
    }
}

struct ThumbActionBar<Primary: View, Secondary: View>: View {
    @ViewBuilder var primary: () -> Primary
    @ViewBuilder var secondary: () -> Secondary

    var body: some View {
        HStack(spacing: 8) {
            primary()
                .frame(maxWidth: .infinity)
            secondary()
        }
        .padding(8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.12), lineWidth: 1)
        }
        .padding(.horizontal, 14)
    }
}

struct OfflineStatusBanner: View {
    let message: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
            Text(message)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(.red)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.red.opacity(0.25), lineWidth: 1)
        }
    }
}
