import SwiftUI
import UIKit

enum IssueCTLColors {
    static let cardCornerRadius: CGFloat = 12
    static let controlCornerRadius: CGFloat = 10
    static let iconCornerRadius: CGFloat = 8

    static var appBackground: Color {
        Color(.systemGroupedBackground)
    }

    static var action: Color {
        Color(UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 1.00, green: 0.56, blue: 0.22, alpha: 1.00)
                : UIColor(red: 0.91, green: 0.44, blue: 0.15, alpha: 1.00)
        })
    }

    static var cardBackground: Color {
        Color(.secondarySystemGroupedBackground)
    }

    static var elevatedBackground: Color {
        Color(.tertiarySystemGroupedBackground)
    }

    static var hairline: Color {
        Color(.separator).opacity(0.65)
    }

    static var materialStroke: Color {
        Color(.separator).opacity(0.45)
    }
}

struct AppTopBar<Trailing: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let title: String
    let subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 8) {
                    titleBlock
                    trailing()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(spacing: 10) {
                    titleBlock
                        .layoutPriority(1)
                    Spacer(minLength: 8)
                    trailing()
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 8)
    }

    private var titleBlock: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.title2.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.85)
            if let subtitle, !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
        }
    }
}

private struct AccessibilityTabBarClearanceModifier: ViewModifier {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    func body(content: Content) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            content.safeAreaInset(edge: .bottom) {
                Color.clear.frame(height: 92)
            }
        } else {
            content
        }
    }
}

extension View {
    func accessibilityTabBarClearance() -> some View {
        modifier(AccessibilityTabBarClearanceModifier())
    }
}

struct IconChromeButton: View {
    let systemName: String
    var accessibilityLabel: String?
    var accessibilityIdentifier: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(.primary)
                .frame(width: 36, height: 36)
                .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 12))
                .overlay {
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel ?? systemName)
        .accessibilityIdentifier(accessibilityIdentifier ?? "")
    }
}

struct TopBarIconButton: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let title: String
    let systemImage: String
    var accessibilityIdentifier: String?
    var showsActiveIndicator = false
    var badge: String?
    var isProminent = false
    let action: () -> Void

    var body: some View {
        Button(title, systemImage: systemImage, action: action)
            .labelStyle(.iconOnly)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(isProminent ? Color(.systemBackground) : .primary)
            .frame(width: buttonSize, height: buttonSize)
            .background(background, in: RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius))
            .overlay(alignment: .topTrailing) {
                if let badge {
                    Text(badge)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(minWidth: 16, minHeight: 16)
                        .padding(.horizontal, 3)
                        .background(Color.green, in: Capsule())
                        .overlay {
                            Capsule()
                                .stroke(Color(.systemBackground), lineWidth: 1.5)
                        }
                        .offset(x: 5, y: -5)
                        .accessibilityHidden(true)
                } else if showsActiveIndicator {
                    Circle()
                        .fill(IssueCTLColors.action)
                        .frame(width: 8, height: 8)
                        .overlay {
                            Circle()
                                .stroke(Color(.systemBackground), lineWidth: 2)
                        }
                        .offset(x: -7, y: 7)
                        .accessibilityHidden(true)
                }
            }
            .overlay {
                if !isProminent {
                    RoundedRectangle(cornerRadius: IssueCTLColors.cardCornerRadius)
                        .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
                }
            }
            .contentShape(Rectangle())
            .buttonStyle(.plain)
            .accessibilityLabel(title)
            .accessibilityHint(accessibilityHint)
            .accessibilityIdentifier(accessibilityIdentifier ?? "")
    }

    private var buttonSize: CGFloat {
        dynamicTypeSize.isAccessibilitySize ? 48 : 44
    }

    private var accessibilityHint: String {
        if let badge {
            return "\(badge) active"
        }
        if showsActiveIndicator {
            return "Active filters applied"
        }
        return ""
    }

    private var background: Color {
        isProminent ? IssueCTLColors.action : IssueCTLColors.cardBackground
    }
}

struct ThumbIconButton: View {
    let systemName: String
    let accessibilityLabel: String
    var accessibilityIdentifier: String?
    var badge: String?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack(alignment: .topTrailing) {
                Image(systemName: systemName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(IssueCTLColors.action)
                    .frame(width: 44, height: 36)
                    .background(Color(.tertiarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
                    .overlay {
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(IssueCTLColors.materialStroke, lineWidth: 1)
                    }

                if let badge {
                    Text(badge)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(minWidth: 16, minHeight: 16)
                        .padding(.horizontal, 3)
                        .background(Color.green, in: Capsule())
                        .overlay {
                            Capsule()
                                .stroke(Color(.systemBackground), lineWidth: 1.5)
                        }
                        .offset(x: 5, y: -5)
                        .accessibilityHidden(true)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityIdentifier(accessibilityIdentifier ?? "")
    }
}

struct StatusMetricCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let value: String
    let label: String
    var accessibilityIdentifier: String?
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
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 2)
                    .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, minHeight: dynamicTypeSize.isAccessibilitySize ? 88 : 72, alignment: .leading)
            .padding(10)
            .background(IssueCTLColors.cardBackground, in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(IssueCTLColors.hairline, lineWidth: 0.5)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(value), \(label)")
        .accessibilityIdentifier(accessibilityIdentifier ?? "")
    }
}

struct AttentionRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let color: Color
    let icon: String
    let kind: String
    let meta: String
    let title: String
    let chips: [AttentionChip]
    var isAttention = false
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            rowContent
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(IssueCTLColors.cardBackground)
                    .overlay {
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(isAttention ? IssueCTLColors.action.opacity(0.65) : IssueCTLColors.hairline, lineWidth: 1)
                    }
            )
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary)
        .accessibilityHint("\(actionTitle) \(kind.lowercased())")
    }

    @ViewBuilder
    private var rowContent: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                mainContent
                Text(actionTitle)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(IssueCTLColors.action)
            }
        } else {
            HStack(alignment: .top, spacing: 10) {
                mainContent
                Spacer(minLength: 6)
                Text(actionTitle)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(IssueCTLColors.action)
                    .padding(.top, 3)
            }
        }
    }

    private var mainContent: some View {
        HStack(alignment: .top, spacing: 10) {
            RoundedRectangle(cornerRadius: 4)
                .fill(color)
                .frame(width: 6, height: dynamicTypeSize.isAccessibilitySize ? 52 : 40)
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Label(kind, systemImage: icon)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(color)

                    Text(meta)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? 2 : 1)
                }

                Text(title)
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)

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
        }
    }

    private var accessibilitySummary: String {
        let chipSummary = chips.map(\.title).joined(separator: ", ")
        return "\(kind), \(title), \(meta)\(chipSummary.isEmpty ? "" : ", \(chipSummary)")"
    }
}

struct TodayQueueHeader: View {
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            Button(action: action) {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(IssueCTLColors.action)
                    .frame(width: 36, height: 36)
                    .background(IssueCTLColors.action.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Refresh today")
            .accessibilityIdentifier("today-refresh-button")
        }
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

struct ThumbActionBar<Primary: View, Secondary: View>: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    @ViewBuilder var primary: () -> Primary
    @ViewBuilder var secondary: () -> Secondary

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 8) {
                    primary()
                        .frame(maxWidth: .infinity)
                    secondary()
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            } else {
                HStack(spacing: 8) {
                    primary()
                        .frame(maxWidth: .infinity)
                    secondary()
                }
            }
        }
        .padding(8)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(IssueCTLColors.materialStroke, lineWidth: 1)
        }
        .padding(.horizontal, 14)
    }
}

struct OfflineStatusBanner: View {
    let message: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(.red)
            Text(message)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(.primary)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(Color.red.opacity(0.10), in: RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.red.opacity(0.25), lineWidth: 1)
        }
    }
}
